/**
 * music.ts — SoundFont-powered music playback engine.
 *
 * Replaces oscillator beeps with real instrument samples:
 * - MIDI tracks (.mid files): parsed by midi-player-js, played through SoundFont instruments
 * - Legacy oscillator tracks: note sequences played through SoundFont piano
 *
 * All audio routes through AudioContext → GainNode for volume/ducking control.
 * TODO: DOC - SoundFont music engine architecture
 */

import MidiPlayer from 'midi-player-js';
import { instrument as loadSfInstrument, type Instrument as SfInstrument } from 'soundfont-player';
import {
  loadMidiManifest, getLoadedMidiTracks, preloadAllMidiTracks,
  isMidiManifestLoaded, type MidiManifestEntry,
} from './midi-loader';
import {
  MUSIC_TRACKS, getTracksForBiome, DEFAULT_MUSIC_SETTINGS,
  NOTE_FREQ,
  type MusicTrack, type MusicSettings,
} from './config/music.config';

// ─── Types ──────────────────────────────────────────────────

export interface MusicState {
  playState: 'stopped' | 'playing' | 'paused';
  settings: MusicSettings;
  currentTrackId: string | null;
  currentTrackIndex: number;
  playlist: MusicTrack[];
  ducking: boolean;
  midiLoaded: boolean;
  trackProgress: number;
}

// ─── Audio Globals ──────────────────────────────────────────

let _ctx: AudioContext | null = null;
let _masterGain: GainNode | null = null;
let _isPlaying = false;
let _currentTrack: MusicTrack | null = null;

// SoundFont instruments — piano is default, others loaded on demand
let _piano: SfInstrument | null = null;
let _pianoLoading: Promise<SfInstrument | null> | null = null;
const _sfInstruments = new Map<string, SfInstrument>();
const _sfLoading = new Map<string, Promise<SfInstrument | null>>();

// midi-player-js instance for .mid file playback
let _midiPlayer: InstanceType<typeof MidiPlayer.Player> | null = null;
// Active SoundFont notes for MIDI note-off tracking
const _activeNotes = new Map<string, ReturnType<SfInstrument['play']>>();

// Fallback note-sequence playback (for oscillator-format tracks played through piano)
let _noteTimer: ReturnType<typeof setTimeout> | null = null;
let _melodyIndex = 0;
let _bassIndex = 0;

// GM instrument names for Program Change events
const GM_INSTRUMENTS: Record<number, string> = {
  0: 'acoustic_grand_piano', 1: 'bright_acoustic_piano', 2: 'electric_grand_piano',
  3: 'honkytonk_piano', 4: 'electric_piano_1', 5: 'electric_piano_2',
  6: 'harpsichord', 7: 'clavinet',
  8: 'celesta', 9: 'glockenspiel', 10: 'music_box',
  11: 'vibraphone', 12: 'marimba', 13: 'xylophone',
  24: 'acoustic_guitar_nylon', 25: 'acoustic_guitar_steel',
  26: 'electric_guitar_jazz', 27: 'electric_guitar_clean',
  32: 'acoustic_bass', 33: 'electric_bass_finger', 34: 'electric_bass_pick',
  40: 'violin', 41: 'viola', 42: 'cello', 43: 'contrabass',
  44: 'tremolo_strings', 45: 'pizzicato_strings',
  46: 'orchestral_harp', 47: 'timpani',
  48: 'string_ensemble_1', 49: 'string_ensemble_2',
  56: 'trumpet', 57: 'trombone', 58: 'tuba',
  60: 'french_horn',
  64: 'soprano_sax', 65: 'alto_sax', 66: 'tenor_sax',
  68: 'oboe', 69: 'english_horn', 70: 'bassoon',
  71: 'clarinet', 72: 'piccolo', 73: 'flute',
};

// Channel → instrument name mapping (updated by Program Change events)
const _channelInstruments = new Map<number, string>();

// ─── AudioContext Management ────────────────────────────────

function ensureAudioContext(): AudioContext | null {
  if (_ctx) return _ctx;
  try {
    _ctx = new AudioContext();
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 0.5;
    _masterGain.connect(_ctx.destination);
    return _ctx;
  } catch (e) {
    console.warn('[Music] AudioContext creation failed:', e);
    return null;
  }
}

// ─── SoundFont Loading ──────────────────────────────────────

/** Load the default piano SoundFont instrument */
async function loadPiano(): Promise<SfInstrument | null> {
  if (_piano) return _piano;
  if (_pianoLoading) return _pianoLoading;

  const ctx = ensureAudioContext();
  if (!ctx || !_masterGain) return null;

  _pianoLoading = (async () => {
    try {
      const inst = await loadSfInstrument(ctx, 'acoustic_grand_piano', {
        destination: _masterGain!,
        soundfont: 'MusyngKite',
        format: 'mp3',
      });
      _piano = inst;
      _sfInstruments.set('acoustic_grand_piano', inst);
      console.log('[Music] SoundFont piano loaded');
      return inst;
    } catch (e) {
      console.warn('[Music] SoundFont piano load failed:', e);
      return null;
    }
  })();

  return _pianoLoading;
}

/** Load a named SoundFont instrument (for MIDI multi-instrument playback) */
async function loadInstrument(name: string): Promise<SfInstrument | null> {
  const existing = _sfInstruments.get(name);
  if (existing) return existing;

  const loading = _sfLoading.get(name);
  if (loading) return loading;

  const ctx = ensureAudioContext();
  if (!ctx || !_masterGain) return null;

  const promise = (async () => {
    try {
      const inst = await loadSfInstrument(ctx, name, {
        destination: _masterGain!,
        soundfont: 'MusyngKite',
        format: 'mp3',
      });
      _sfInstruments.set(name, inst);
      console.log(`[Music] SoundFont loaded: ${name}`);
      return inst;
    } catch (e) {
      console.warn(`[Music] SoundFont load failed (${name}):`, e);
      return null;
    } finally {
      _sfLoading.delete(name);
    }
  })();

  _sfLoading.set(name, promise);
  return promise;
}

/** Get the instrument for a MIDI channel (falls back to piano) */
function getChannelInstrument(channel: number): SfInstrument | null {
  const name = _channelInstruments.get(channel) ?? 'acoustic_grand_piano';
  return _sfInstruments.get(name) ?? _piano;
}

// ─── State Factory ──────────────────────────────────────────

export function createMusicState(): MusicState {
  return {
    playState: 'stopped',
    settings: { ...DEFAULT_MUSIC_SETTINGS },
    currentTrackId: null,
    currentTrackIndex: 0,
    playlist: [],
    ducking: false,
    midiLoaded: false,
    trackProgress: 0,
  };
}

// ─── Init ───────────────────────────────────────────────────

/** Initialize music system: load SoundFont piano + MIDI manifest */
export async function initMidiTracks(state: MusicState): Promise<void> {
  // Load SoundFont piano in parallel with MIDI manifest
  const [piano] = await Promise.all([
    loadPiano(),
    loadMidiManifest(),
  ]);

  if (piano) {
    console.log('[Music] SoundFont piano ready');
  }

  // Also preload MIDI track metadata
  try {
    const tracks = await preloadAllMidiTracks();
    if (tracks.length > 0) {
      state.midiLoaded = true;
      console.log(`[Music] ${tracks.length} MIDI tracks available`);
    }
  } catch (e) {
    console.warn('[Music] MIDI track metadata loading failed:', e);
  }
}

// ─── MIDI File Playback ─────────────────────────────────────

/** Fetch a .mid file as ArrayBuffer */
async function fetchMidiFile(url: string): Promise<ArrayBuffer | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[Music] MIDI file fetch failed: ${url} (${resp.status})`);
      return null;
    }
    return await resp.arrayBuffer();
  } catch (e) {
    console.warn(`[Music] MIDI file fetch error (${url}):`, e);
    return null;
  }
}

/** Convert ArrayBuffer to base64 data URI for midi-player-js */
function arrayBufferToDataUri(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/midi;base64,' + btoa(binary);
}

/** Handle MIDI events from midi-player-js */
function handleMidiEvent(event: MidiPlayer.Event, _state: MusicState): void {
  if (!_ctx) return;

  if (event.name === 'Note on' && event.velocity && event.velocity > 0) {
    const channel = event.channel ?? 0;
    const noteNum = event.noteNumber ?? 0;
    const key = `${channel}-${noteNum}`;

    // Stop any existing note with same key
    const existing = _activeNotes.get(key);
    if (existing) {
      try { existing.stop(); } catch { /* ok */ }
      _activeNotes.delete(key);
    }

    // Channel 10 (9 in 0-indexed) is percussion — skip for now
    if (channel === 10) return;

    const instrument = getChannelInstrument(channel);
    if (instrument) {
      const gain = (event.velocity! / 127) * 0.8;
      try {
        const node = instrument.play(noteNum.toString(), _ctx.currentTime, { gain });
        _activeNotes.set(key, node);
      } catch { /* instrument may not have this note */ }
    }
  } else if (
    event.name === 'Note off' ||
    (event.name === 'Note on' && (event.velocity === 0 || !event.velocity))
  ) {
    const channel = event.channel ?? 0;
    const noteNum = event.noteNumber ?? 0;
    const key = `${channel}-${noteNum}`;
    const node = _activeNotes.get(key);
    if (node) {
      try { node.stop(); } catch { /* ok */ }
      _activeNotes.delete(key);
    }
  } else if (event.name === 'Program Change') {
    const channel = event.channel ?? 0;
    const program = event.value ?? 0;
    const instrumentName = GM_INSTRUMENTS[program] ?? 'acoustic_grand_piano';
    _channelInstruments.set(channel, instrumentName);
    // Lazy-load the instrument (non-blocking)
    loadInstrument(instrumentName);
  }
}

/** Start MIDI file playback for a track */
async function startMidiPlayback(track: MusicTrack, state: MusicState): Promise<boolean> {
  // Find the manifest entry with midiFile path
  const manifest = await loadMidiManifest();
  const entry = manifest.tracks.find(
    (t: MidiManifestEntry & { midiFile?: string }) => t.id === track.id
  ) as (MidiManifestEntry & { midiFile?: string }) | undefined;

  if (!entry?.midiFile) {
    console.warn(`[Music] No .mid file for track: ${track.id}`);
    return false;
  }

  const midiUrl = `./audio/music/${entry.midiFile}`;
  const buffer = await fetchMidiFile(midiUrl);
  if (!buffer) return false;

  // Stop any existing player
  stopMidiPlayer();
  _midiPlayer = new MidiPlayer.Player();

  _midiPlayer.on('midiEvent', (event: MidiPlayer.Event) => {
    handleMidiEvent(event, state);
  });

  _midiPlayer.on('endOfFile', () => {
    stopAllNotes();
    _isPlaying = false;
    state.playState = 'stopped';
    state.trackProgress = 1;
    // Auto-advance after short pause
    setTimeout(() => {
      if (state.settings.enabled && !state.settings.muted) {
        nextTrack(state);
      }
    }, 1500);
  });

  const dataUri = arrayBufferToDataUri(buffer);
  _midiPlayer.loadDataUri(dataUri);
  _midiPlayer.play();
  console.log(`[Music] MIDI playing: ${track.name}`);
  return true;
}

/** Stop the midi-player-js player and clear active notes */
function stopMidiPlayer(): void {
  if (_midiPlayer) {
    try { _midiPlayer.stop(); } catch { /* ok */ }
    _midiPlayer = null;
  }
  stopAllNotes();
  _channelInstruments.clear();
}

/** Stop all currently sounding SoundFont notes */
function stopAllNotes(): void {
  for (const [, node] of _activeNotes) {
    try { node.stop(); } catch { /* ok */ }
  }
  _activeNotes.clear();
}

// ─── Note Sequence Playback (Legacy Oscillator Tracks → SoundFont Piano) ────

function beatDuration(tempo: number): number {
  return 60 / tempo;
}

/** Play oscillator-format note sequences through SoundFont piano */
function scheduleNoteSequence(track: MusicTrack, state: MusicState): void {
  if (!_ctx || !_isPlaying || !_piano) return;

  const beat = beatDuration(track.tempo);

  // Melody note
  const melodyNote = track.melody[_melodyIndex % track.melody.length];
  const melodyDur = melodyNote.duration * beat;

  if (melodyNote.note !== 'REST' && NOTE_FREQ[melodyNote.note]) {
    try {
      _piano.play(melodyNote.note, _ctx.currentTime, {
        duration: melodyDur * 0.95,
        gain: 0.7,
      });
    } catch { /* note may not be available */ }
  }
  _melodyIndex++;

  // Update progress for cassette UI
  if (track.melody.length > 0) {
    state.trackProgress = (_melodyIndex % track.melody.length) / track.melody.length;
  }

  // Bass note
  const bassNote = track.bass[_bassIndex % track.bass.length];
  const bassDur = bassNote.duration * beat;

  if (_bassIndex * bassDur <= _melodyIndex * melodyDur) {
    if (bassNote.note !== 'REST' && NOTE_FREQ[bassNote.note]) {
      try {
        _piano.play(bassNote.note, _ctx.currentTime, {
          duration: bassDur * 0.95,
          gain: 0.4,
        });
      } catch { /* ok */ }
    }
    _bassIndex++;
  }

  _noteTimer = setTimeout(() => scheduleNoteSequence(track, state), melodyDur * 1000);
}

function stopNoteSequence(): void {
  if (_noteTimer) {
    clearTimeout(_noteTimer);
    _noteTimer = null;
  }
  _melodyIndex = 0;
  _bassIndex = 0;
}

// ─── Playback Control ───────────────────────────────────────

export function play(state: MusicState): void {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  if (state.settings.muted || !state.settings.enabled) return;

  // Build playlist if empty
  if (state.playlist.length === 0) {
    state.playlist = buildFullPlaylist(state);
  }

  const track = state.playlist[state.currentTrackIndex % state.playlist.length];
  _currentTrack = track;
  state.currentTrackId = track.id;
  state.playState = 'playing';
  _isPlaying = true;
  _melodyIndex = 0;
  _bassIndex = 0;

  applyVolume(state);

  // Route: MIDI file or note sequence
  if (track.source === 'midi') {
    startMidiPlayback(track, state).then(success => {
      if (!success && _isPlaying) {
        console.log(`[Music] MIDI file fallback → note sequence: ${track.name}`);
        if (track.melody.length > 0 && _piano) {
          scheduleNoteSequence(track, state);
        }
      }
    });
  } else {
    if (_piano) {
      scheduleNoteSequence(track, state);
    } else {
      console.warn('[Music] No SoundFont piano for note playback');
    }
  }

  console.log(`[Music] Playing: ${track.name}`);
}

export function pause(state: MusicState): void {
  _isPlaying = false;
  state.playState = 'paused';
  stopMidiPlayer();
  stopNoteSequence();
}

export function stop(state: MusicState): void {
  _isPlaying = false;
  state.playState = 'stopped';
  stopMidiPlayer();
  stopNoteSequence();
  _melodyIndex = 0;
  _bassIndex = 0;
}

export function nextTrack(state: MusicState): void {
  const wasPlaying = state.playState === 'playing';
  stop(state);
  state.currentTrackIndex = (state.currentTrackIndex + 1) % Math.max(1, state.playlist.length);
  if (wasPlaying) play(state);
}

export function prevTrack(state: MusicState): void {
  const wasPlaying = state.playState === 'playing';
  stop(state);
  state.currentTrackIndex = (state.currentTrackIndex - 1 + state.playlist.length) % Math.max(1, state.playlist.length);
  if (wasPlaying) play(state);
}

export function togglePlayPause(state: MusicState): void {
  if (state.playState === 'playing') {
    pause(state);
  } else {
    play(state);
  }
}

export function toggleMute(state: MusicState): void {
  state.settings.muted = !state.settings.muted;
  if (state.settings.muted) {
    pause(state);
  } else if (state.playState === 'paused') {
    play(state);
  }
  applyVolume(state);
}

export function setVolume(state: MusicState, vol: number): void {
  state.settings.volume = Math.max(0, Math.min(1, vol));
  applyVolume(state);
}

// ─── Ducking ────────────────────────────────────────────────

export function startDucking(state: MusicState): void {
  state.ducking = true;
  applyVolume(state);
}

export function stopDucking(state: MusicState): void {
  state.ducking = false;
  applyVolume(state);
}

// ─── Biome Awareness ────────────────────────────────────────

export function setBiome(state: MusicState, biomeId: number): void {
  const oscTracks = getTracksForBiome(biomeId);
  const midiTracks = getMidiTracksForBiome(biomeId);
  const newPlaylist = [...oscTracks, ...midiTracks];
  if (newPlaylist.length > 0 && newPlaylist[0]?.id !== state.playlist[0]?.id) {
    const wasPlaying = state.playState === 'playing';
    stop(state);
    state.playlist = newPlaylist;
    state.currentTrackIndex = 0;
    if (wasPlaying) play(state);
  }
}

// ─── Internal Helpers ───────────────────────────────────────

function buildFullPlaylist(state: MusicState): MusicTrack[] {
  const osc = [...MUSIC_TRACKS];
  if (state.midiLoaded) {
    const midi = getLoadedMidiTracks();
    return [...osc, ...midi];
  }
  return osc;
}

function getMidiTracksForBiome(biomeId: number): MusicTrack[] {
  if (!isMidiManifestLoaded()) return [];
  return getLoadedMidiTracks().filter(t => t.biomes.includes(biomeId));
}

function applyVolume(state: MusicState): void {
  if (!_masterGain) return;
  const vol = state.settings.muted ? 0 : state.settings.volume;
  const duckMult = state.ducking ? 0.3 : 1.0;
  const trackVol = _currentTrack?.volume ?? 1.0;
  _masterGain.gain.value = vol * duckMult * trackVol;
}

// ─── Track Progress (for cassette UI) ───────────────────────

/** Call periodically to update trackProgress for MIDI file playback */
export function updateMidiProgress(state: MusicState): void {
  if (_midiPlayer && state.playState === 'playing' && _midiPlayer.isPlaying()) {
    const remaining = _midiPlayer.getSongPercentRemaining();
    state.trackProgress = Math.max(0, Math.min(1, (100 - remaining) / 100));
  }
}

// ─── Serialization ──────────────────────────────────────────

export interface SerializedMusicSettings {
  volume: number;
  muted: boolean;
  enabled: boolean;
}

export function serializeMusicSettings(state: MusicState): SerializedMusicSettings {
  return { ...state.settings };
}

export function deserializeMusicSettings(data?: SerializedMusicSettings): MusicSettings {
  if (!data) return { ...DEFAULT_MUSIC_SETTINGS };
  return {
    volume: data.volume ?? DEFAULT_MUSIC_SETTINGS.volume,
    muted: data.muted ?? DEFAULT_MUSIC_SETTINGS.muted,
    enabled: data.enabled ?? DEFAULT_MUSIC_SETTINGS.enabled,
  };
}

// ─── Info ───────────────────────────────────────────────────

export function getCurrentTrackInfo(state: MusicState): {
  name: string; id: string; composer?: string; source?: string;
} | null {
  if (!state.currentTrackId) return null;
  let track: MusicTrack | undefined = MUSIC_TRACKS.find(t => t.id === state.currentTrackId);
  if (!track) track = getLoadedMidiTracks().find(t => t.id === state.currentTrackId);
  if (!track) track = state.playlist.find(t => t.id === state.currentTrackId);
  if (!track) return null;
  return {
    name: track.name,
    id: track.id,
    composer: track.composer,
    source: track.source,
  };
}

export function getAllTrackNames(): { id: string; name: string; composer?: string }[] {
  const osc = MUSIC_TRACKS.map(t => ({ id: t.id, name: t.name, composer: t.composer }));
  const midi = getLoadedMidiTracks().map(t => ({ id: t.id, name: t.name, composer: t.composer }));
  return [...osc, ...midi];
}

export function getTotalTrackCount(): number {
  return MUSIC_TRACKS.length + getLoadedMidiTracks().length;
}
