/**
 * music.ts - Procedural music playback via Web Audio API oscillators.
 * State machine: stopped → playing → paused → playing | stopped.
 * Supports biome-aware track selection, ducking, and user controls.
 * TODO: DOC - music subsystem architecture
 */

import {
  MUSIC_TRACKS, NOTE_FREQ, getTracksForBiome,
  DEFAULT_MUSIC_SETTINGS,
  type MusicTrack, type MusicSettings,
} from './config/music.config';

// ─── Types ──────────────────────────────────────────────────

export type MusicPlayState = 'stopped' | 'playing' | 'paused';

export interface MusicState {
  playState: MusicPlayState;
  currentTrackId: string | null;
  currentTrackIndex: number;       // index in current playlist
  playlist: MusicTrack[];          // tracks for current biome
  settings: MusicSettings;
  ducking: boolean;                // true when quiz/dialog active
}

// ─── Audio Engine (module-level singleton) ──────────────────

let _ctx: AudioContext | null = null;
let _masterGain: GainNode | null = null;
let _melodyGain: GainNode | null = null;
let _bassGain: GainNode | null = null;

// Active oscillator scheduling
let _melodyOsc: OscillatorNode | null = null;
let _bassOsc: OscillatorNode | null = null;
let _scheduleTimer: ReturnType<typeof setTimeout> | null = null;
let _melodyNoteIndex = 0;
let _bassNoteIndex = 0;
let _currentTrack: MusicTrack | null = null;
let _isPlaying = false;

// ─── Init ───────────────────────────────────────────────────

/** Must be called from a user gesture event (click/keydown) */
function ensureAudioContext(): AudioContext | null {
  if (_ctx) return _ctx;
  try {
    _ctx = new AudioContext();
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 0.5;
    _masterGain.connect(_ctx.destination);

    _melodyGain = _ctx.createGain();
    _melodyGain.gain.value = 0.35;
    _melodyGain.connect(_masterGain);

    _bassGain = _ctx.createGain();
    _bassGain.gain.value = 0.2;
    _bassGain.connect(_masterGain);

    console.log('[Music] AudioContext created');
    return _ctx;
  } catch (e) {
    console.warn('[Music] Web Audio not available:', e);
    return null;
  }
}

// ─── State ──────────────────────────────────────────────────

export function createMusicState(): MusicState {
  return {
    playState: 'stopped',
    currentTrackId: null,
    currentTrackIndex: 0,
    playlist: [],
    settings: { ...DEFAULT_MUSIC_SETTINGS },
    ducking: false,
  };
}

// ─── Note Scheduling ────────────────────────────────────────

function beatDuration(tempo: number): number {
  return 60 / tempo; // seconds per beat
}

function scheduleNextNotes(state: MusicState): void {
  if (!_ctx || !_isPlaying || !_currentTrack) return;

  const track = _currentTrack;
  const beat = beatDuration(track.tempo);

  // Schedule melody note
  if (_melodyOsc) {
    try { _melodyOsc.stop(); } catch { /* ok */ }
    _melodyOsc.disconnect();
  }
  const melodyNote = track.melody[_melodyNoteIndex % track.melody.length];
  const melodyDur = melodyNote.duration * beat;

  if (melodyNote.note !== 'REST' && NOTE_FREQ[melodyNote.note]) {
    _melodyOsc = _ctx.createOscillator();
    _melodyOsc.type = track.melodyWave;
    _melodyOsc.frequency.value = NOTE_FREQ[melodyNote.note];
    _melodyOsc.connect(_melodyGain!);
    _melodyOsc.start();

    // Envelope: fade in/out for smoother sound
    _melodyGain!.gain.cancelScheduledValues(_ctx.currentTime);
    _melodyGain!.gain.setValueAtTime(0, _ctx.currentTime);
    _melodyGain!.gain.linearRampToValueAtTime(0.35, _ctx.currentTime + 0.02);
    _melodyGain!.gain.linearRampToValueAtTime(0, _ctx.currentTime + melodyDur - 0.02);

    _melodyOsc.stop(_ctx.currentTime + melodyDur);
  } else {
    _melodyOsc = null;
  }
  _melodyNoteIndex++;

  // Schedule bass note at melody timing (bass has its own sequence length)
  // Bass changes at its own pace
  const bassNote = track.bass[_bassNoteIndex % track.bass.length];
  const bassDur = bassNote.duration * beat;

  // Only schedule bass when it's time for a new bass note
  if (_bassNoteIndex * bassDur <= _melodyNoteIndex * melodyDur) {
    if (_bassOsc) {
      try { _bassOsc.stop(); } catch { /* ok */ }
      _bassOsc.disconnect();
    }
    if (bassNote.note !== 'REST' && NOTE_FREQ[bassNote.note]) {
      _bassOsc = _ctx.createOscillator();
      _bassOsc.type = track.bassWave;
      _bassOsc.frequency.value = NOTE_FREQ[bassNote.note];
      _bassOsc.connect(_bassGain!);
      _bassOsc.start();
      _bassOsc.stop(_ctx.currentTime + bassDur);
    }
    _bassNoteIndex++;
  }

  // Schedule next note
  _scheduleTimer = setTimeout(() => scheduleNextNotes(state), melodyDur * 1000);
}

// ─── Playback Control ───────────────────────────────────────

export function play(state: MusicState): void {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  if (state.settings.muted || !state.settings.enabled) return;

  // Pick track from playlist
  if (state.playlist.length === 0) {
    state.playlist = [...MUSIC_TRACKS]; // fallback: all tracks
  }

  const track = state.playlist[state.currentTrackIndex % state.playlist.length];
  _currentTrack = track;
  state.currentTrackId = track.id;
  state.playState = 'playing';
  _isPlaying = true;
  _melodyNoteIndex = 0;
  _bassNoteIndex = 0;

  // Apply volume
  applyVolume(state);

  scheduleNextNotes(state);
  console.log(`[Music] Playing: ${track.name}`);
}

export function pause(state: MusicState): void {
  _isPlaying = false;
  state.playState = 'paused';
  stopOscillators();
  if (_scheduleTimer) {
    clearTimeout(_scheduleTimer);
    _scheduleTimer = null;
  }
}

export function stop(state: MusicState): void {
  _isPlaying = false;
  state.playState = 'stopped';
  stopOscillators();
  if (_scheduleTimer) {
    clearTimeout(_scheduleTimer);
    _scheduleTimer = null;
  }
  _melodyNoteIndex = 0;
  _bassNoteIndex = 0;
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

/** Reduce volume during quiz/dialog */
export function startDucking(state: MusicState): void {
  state.ducking = true;
  applyVolume(state);
}

/** Restore volume after quiz/dialog */
export function stopDucking(state: MusicState): void {
  state.ducking = false;
  applyVolume(state);
}

// ─── Biome Awareness ────────────────────────────────────────

/** Switch playlist when biome changes */
export function setBiome(state: MusicState, biomeId: number): void {
  const newPlaylist = getTracksForBiome(biomeId);
  // Only switch if playlist actually changes
  if (newPlaylist.length > 0 && newPlaylist[0]?.id !== state.playlist[0]?.id) {
    const wasPlaying = state.playState === 'playing';
    stop(state);
    state.playlist = newPlaylist;
    state.currentTrackIndex = 0;
    if (wasPlaying) play(state);
  }
}

// ─── Internal Helpers ───────────────────────────────────────

function stopOscillators(): void {
  if (_melodyOsc) {
    try { _melodyOsc.stop(); } catch { /* ok */ }
    _melodyOsc.disconnect();
    _melodyOsc = null;
  }
  if (_bassOsc) {
    try { _bassOsc.stop(); } catch { /* ok */ }
    _bassOsc.disconnect();
    _bassOsc = null;
  }
}

function applyVolume(state: MusicState): void {
  if (!_masterGain) return;
  const vol = state.settings.muted ? 0 : state.settings.volume;
  const duckMult = state.ducking ? 0.3 : 1.0;
  const trackVol = _currentTrack?.volume ?? 1.0;
  _masterGain.gain.value = vol * duckMult * trackVol;
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

/** Get current track info for UI display */
export function getCurrentTrackInfo(state: MusicState): { name: string; id: string } | null {
  if (!state.currentTrackId) return null;
  const track = MUSIC_TRACKS.find(t => t.id === state.currentTrackId);
  if (!track) return null;
  return { name: track.name, id: track.id };
}

/** Get all available track names (for UI) */
export function getAllTrackNames(): { id: string; name: string }[] {
  return MUSIC_TRACKS.map(t => ({ id: t.id, name: t.name }));
}
