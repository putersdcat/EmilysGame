/**
 * music.ts — MIDI-only music playback engine.
 *
 * Plays .mid files from public/audio/music/midi/ through SoundFont piano samples.
 * All oscillator/note-sequence playback has been purged.
 *
 * All audio routes through AudioContext → GainNode for volume/ducking control.
 * TODO: DOC - MIDI music engine architecture
 */

import MidiPlayer from 'midi-player-js';
import {
  loadMidiManifest, getLoadedMidiTracks, preloadAllMidiTracks,
  isMidiManifestLoaded, type MidiManifestEntry,
} from './midi-loader';
import {
  DEFAULT_MUSIC_SETTINGS,
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
  /** Tracks last biome to avoid redundant playlist rebuilds */
  _lastBiomeId: number;
  /** User requested playback; used to resume after async warmup */
  _playRequested: boolean;
}

// ─── Audio Globals ──────────────────────────────────────────

let _ctx: AudioContext | null = null;
let _masterGain: GainNode | null = null;
let _isPlaying = false;
let _currentTrack: MusicTrack | null = null;

type PlayedNoteHandle = { stop: () => void };
type PianoSampler = {
  play: (note: string, when: number, opts?: { duration?: number; gain?: number }) => PlayedNoteHandle;
};

// Local bundled piano sampler
let _piano: PianoSampler | null = null;
let _pianoLoading: Promise<PianoSampler | null> | null = null;
const _pianoBuffers = new Map<string, AudioBuffer>();

// midi-player-js instance for .mid file playback
let _midiPlayer: InstanceType<typeof MidiPlayer.Player> | null = null;
// Active note handles for MIDI note-off tracking
const _activeNotes = new Map<string, PlayedNoteHandle>();
let _preparePlaybackPromise: Promise<void> | null = null;

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const PIANO_SAMPLE_BASE = './audio/piano-mp3';
const MIN_MIDI_PIANO = 21; // A0
const MAX_MIDI_PIANO = 108; // C8

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

// ─── Local Piano Sample Loading ─────────────────────────────

function midiToNoteName(midiNote: number): string {
  const clamped = Math.max(MIN_MIDI_PIANO, Math.min(MAX_MIDI_PIANO, Math.trunc(midiNote)));
  const octave = Math.floor(clamped / 12) - 1;
  const note = NOTE_NAMES[clamped % 12];
  return `${note}${octave}`;
}

async function fetchAndDecodeSample(ctx: AudioContext, noteName: string): Promise<void> {
  if (_pianoBuffers.has(noteName)) return;
  const resp = await fetch(`${PIANO_SAMPLE_BASE}/${noteName}.mp3`);
  if (!resp.ok) {
    throw new Error(`Sample missing: ${noteName}.mp3 (${resp.status})`);
  }
  const arr = await resp.arrayBuffer();
  const buf = await ctx.decodeAudioData(arr.slice(0));
  _pianoBuffers.set(noteName, buf);
}

function createPianoSampler(ctx: AudioContext): PianoSampler {
  return {
    play(note: string, when: number, opts?: { duration?: number; gain?: number }): PlayedNoteHandle {
      const buffer = _pianoBuffers.get(note);
      if (!buffer || !_masterGain) {
        return { stop: () => void 0 };
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gainNode = ctx.createGain();
      gainNode.gain.value = Math.max(0, Math.min(1, opts?.gain ?? 0.7));
      src.connect(gainNode);
      gainNode.connect(_masterGain);

      const startAt = Math.max(ctx.currentTime, when);
      src.start(startAt);

      const duration = opts?.duration;
      if (duration && duration > 0) {
        const stopAt = startAt + duration;
        try { src.stop(stopAt); } catch { /* no-op */ }
      }

      return {
        stop: () => {
          try { src.stop(); } catch { /* no-op */ }
          try { src.disconnect(); } catch { /* no-op */ }
        },
      };
    },
  };
}

/** Load the bundled local piano sample set */
async function loadPiano(): Promise<PianoSampler | null> {
  if (_piano) return _piano;
  if (_pianoLoading) return _pianoLoading;

  const ctx = ensureAudioContext();
  if (!ctx || !_masterGain) return null;

  _pianoLoading = (async () => {
    try {
      const loadPromises: Promise<void>[] = [];
      for (let midi = MIN_MIDI_PIANO; midi <= MAX_MIDI_PIANO; midi++) {
        loadPromises.push(fetchAndDecodeSample(ctx, midiToNoteName(midi)).catch((e) => {
          console.warn('[Music] Piano sample load warning:', e);
        }));
      }
      await Promise.all(loadPromises);

      _piano = createPianoSampler(ctx);
      console.log(`[Music] Local piano samples loaded: ${_pianoBuffers.size}`);
      return _piano;
    } catch (e) {
      console.warn('[Music] Local piano sample load failed:', e);
      return null;
    }
  })();

  return _pianoLoading;
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
    _lastBiomeId: -1,
    _playRequested: false,
  };
}

async function ensurePlaybackReady(state: MusicState): Promise<void> {
  if (getLoadedMidiTracks().length > 0 && _piano) return;

  if (!_preparePlaybackPromise) {
    _preparePlaybackPromise = (async () => {
      await loadMidiManifest();
      try {
        await preloadAllMidiTracks();
      } catch {
        // Best effort; play() will bail if still no tracks.
      }
      await loadPiano();
    })().finally(() => {
      _preparePlaybackPromise = null;
    });
  }

  await _preparePlaybackPromise;
  state.midiLoaded = getLoadedMidiTracks().length > 0;
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

    if (_piano) {
      const gain = (event.velocity! / 127) * 0.8;
      try {
        const noteName = midiToNoteName(noteNum);
        const node = _piano.play(noteName, _ctx.currentTime, { gain });
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
}

/** Stop all currently sounding SoundFont notes */
function stopAllNotes(): void {
  for (const [, node] of _activeNotes) {
    try { node.stop(); } catch { /* ok */ }
  }
  _activeNotes.clear();
}

// ─── Playback Control ───────────────────────────────────────

export function play(state: MusicState): void {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  if (state.settings.muted || !state.settings.enabled) return;
  state._playRequested = true;

  // Build playlist if empty
  if (state.playlist.length === 0) {
    state.playlist = buildFullPlaylist();
  }

  if (state.playlist.length === 0) {
    // Lazy warmup path: allow play() before async init completes.
    ensurePlaybackReady(state).then(() => {
      if (!state._playRequested) return;
      if (state.settings.muted || !state.settings.enabled) return;
      if (state.playState === 'playing') return;
      play(state);
    }).catch((e) => {
      console.warn('[Music] Playback warmup failed:', e);
    });
    console.warn('[Music] No MIDI tracks available yet (warming up)');
    return;
  }

  const track = state.playlist[state.currentTrackIndex % state.playlist.length];
  _currentTrack = track;
  state.currentTrackId = track.id;
  state.playState = 'playing';
  _isPlaying = true;

  applyVolume(state);

  // MIDI file playback only
  startMidiPlayback(track, state).then(success => {
    if (!success) {
      console.warn(`[Music] Failed to play MIDI: ${track.name}, skipping`);
      // Auto-skip to next track after brief pause
      setTimeout(() => {
        if (_isPlaying) nextTrack(state);
      }, 1000);
    }
  });

  console.log(`[Music] Playing: ${track.name}`);
}

export function pause(state: MusicState): void {
  state._playRequested = false;
  _isPlaying = false;
  state.playState = 'paused';
  stopMidiPlayer();
}

export function stop(state: MusicState): void {
  state._playRequested = false;
  _isPlaying = false;
  state.playState = 'stopped';
  stopMidiPlayer();
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
    state._playRequested = true;
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
  // Only react to actual biome changes
  if (biomeId === state._lastBiomeId) return;
  state._lastBiomeId = biomeId;

  const midiTracks = getMidiTracksForBiome(biomeId);
  // If biome has specific tracks, use them; otherwise keep full playlist
  const newPlaylist = midiTracks.length > 0 ? midiTracks : getLoadedMidiTracks();
  if (newPlaylist.length > 0 && newPlaylist[0]?.id !== state.playlist[0]?.id) {
    const wasPlaying = state.playState === 'playing';
    stop(state);
    state.playlist = newPlaylist;
    state.currentTrackIndex = 0;
    if (wasPlaying) play(state);
  }
}

// ─── Internal Helpers ───────────────────────────────────────

function buildFullPlaylist(): MusicTrack[] {
  return getLoadedMidiTracks();
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
  let track: MusicTrack | undefined = getLoadedMidiTracks().find(t => t.id === state.currentTrackId);
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
  return getLoadedMidiTracks().map(t => ({ id: t.id, name: t.name, composer: t.composer }));
}

export function getTotalTrackCount(): number {
  return getLoadedMidiTracks().length;
}
