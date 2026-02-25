/**
 * music.ts — MIDI music playback engine backed by MIDIocre.
 *
 * Single Midiocre player instance per session: SF2 loaded once, MIDI swapped per track.
 * Exports the same API surface as the previous midi-player-js implementation.
 * TODO: DOC - MIDIocre integration, SF2 path, auto-advance logic
 */

import { Midiocre } from './vendor/midiocre';
import {
  loadMidiManifest, getLoadedMidiTracks, preloadAllMidiTracks,
  isMidiManifestLoaded, type MidiManifestEntry,
} from './midi-loader';
import {
  DEFAULT_MUSIC_SETTINGS,
  type MusicTrack, type MusicSettings,
} from './config/music.config';
import { isTestMode } from './llm';

// --- Types ------------------------------------------------------------------

export interface MusicState {
  playState: 'stopped' | 'playing' | 'paused';
  settings: MusicSettings;
  currentTrackId: string | null;
  currentTrackIndex: number;
  playlist: MusicTrack[];
  ducking: boolean;
  midiLoaded: boolean;
  trackProgress: number;
  _lastBiomeId: number;
  _playRequested: boolean;
}

export interface SerializedMusicSettings {
  volume: number;
  muted: boolean;
  enabled: boolean;
}

// --- Module-Level State -----------------------------------------------------

let _player: Midiocre | null = null;
let _sf2Loaded = false;
let _sf2Loading: Promise<void> | null = null;
let _currentTrack: MusicTrack | null = null;
/** Points to the active MusicState so onStateChange callbacks can reach it */
let _activeState: MusicState | null = null;
/** True while switching tracks — suppresses onStateChange 'stopped' auto-advance.
 *  Prevents infinite loop: player.stop() in _startMidiPlayback fires onStateChange
 *  which would call nextTrack while _playRequested=true. Bug fix for MIDIocre. */
let _trackLoading = false;

const SF2_URL = './audio/music/MidiocrePack.sf2';
const MIDI_BASE = './audio/music/';

// --- Player Bootstrap -------------------------------------------------------

function getOrCreatePlayer(): Midiocre | null {
  if (isTestMode()) return null;
  if (_player) return _player;
  try {
    _player = new Midiocre({ volume: 0.5, loop: false });
    _player.onStateChange((s) => {
      const state = _activeState;
      if (!state) return;
      if (s === 'stopped') {
        // Only auto-advance if: playback was requested AND we're not mid-transition.
        // _trackLoading=true when _startMidiPlayback calls player.stop() to clear the
        // previous track — without this guard that fires a recursive nextTrack loop.
        if (state._playRequested && !_trackLoading) {
          state.playState = 'stopped';
          nextTrack(state);
        } else if (!state._playRequested) {
          state.playState = 'stopped';
        }
      } else if (s === 'playing') {
        state.playState = 'playing';
      } else if (s === 'paused') {
        state.playState = 'paused';
      }
    });
    _player.onProgress((progress) => {
      if (_activeState) _activeState.trackProgress = Math.max(0, Math.min(1, progress));
    });
    return _player;
  } catch (e) {
    console.warn('[Music] Failed to create Midiocre player:', e);
    return null;
  }
}

async function ensureSF2Loaded(player: Midiocre): Promise<boolean> {
  if (_sf2Loaded) return true;
  if (_sf2Loading) {
    await _sf2Loading;
    return _sf2Loaded;
  }
  // Fetch the SF2 manually and pass ArrayBuffer to bypass MIDIocre's sf2Path URL resolution
  _sf2Loading = (async () => {
    const resp = await fetch(SF2_URL);
    if (!resp.ok) throw new Error(`SF2 fetch failed: ${resp.status} ${SF2_URL}`);
    const buffer = await resp.arrayBuffer();
    await player.loadSF2(buffer);
    _sf2Loaded = true;
    console.log('[Music] SF2 loaded:', SF2_URL);
  })().catch((e: unknown) => {
    console.warn('[Music] SF2 load failed:', e);
    _sf2Loaded = false;
  }).finally(() => {
    _sf2Loading = null;
  });
  await _sf2Loading;
  return _sf2Loaded;
}

// --- Public API -------------------------------------------------------------

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

/** Initialize: load SF2 + MIDI manifest in parallel. Call once on game start. */
export async function initMidiTracks(state: MusicState): Promise<void> {
  // In test mode: just load manifest so track info queries work
  if (isTestMode()) {
    try {
      await loadMidiManifest();
      await preloadAllMidiTracks();
      state.midiLoaded = getLoadedMidiTracks().length > 0;
    } catch (e) {
      console.warn('[Music][test] MIDI manifest failed:', e);
    }
    return;
  }

  const player = getOrCreatePlayer();

  const [, manifest] = await Promise.allSettled([
    player ? ensureSF2Loaded(player) : Promise.resolve(),
    loadMidiManifest(),
  ]);

  if (manifest.status === 'rejected') {
    console.warn('[Music] MIDI manifest load failed:', (manifest as PromiseRejectedResult).reason);
  }

  try {
    const tracks = await preloadAllMidiTracks();
    if (tracks.length > 0) {
      state.midiLoaded = true;
      console.log(`[Music] ${tracks.length} MIDI tracks ready`);
    }
  } catch (e) {
    console.warn('[Music] MIDI track metadata loading failed:', e);
  }
}

export function play(state: MusicState): void {
  if (!state.settings.enabled || state.settings.muted) return;
  state._playRequested = true;
  _activeState = state;

  // Test mode: fake playback state, no real audio
  if (isTestMode()) {
    if (state.playlist.length === 0) {
      state.playlist = [{
        id: 'test-track', name: 'Test Track',
        biomes: [0, 1, 2, 3], tempo: 120, volume: 1,
      }];
    }
    const track = state.playlist[state.currentTrackIndex % state.playlist.length];
    _currentTrack = track;
    state.currentTrackId = track.id;
    state.playState = 'playing';
    return;
  }

  // Build playlist on first play if empty
  if (state.playlist.length === 0) {
    const tracks = getLoadedMidiTracks();
    if (tracks.length > 0) {
      state.playlist = tracks;
    } else {
      // Async warmup: wait for MIDI manifest then retry
      void _warmupAndPlay(state);
      return;
    }
  }

  const track = state.playlist[state.currentTrackIndex % state.playlist.length];
  _currentTrack = track;
  state.currentTrackId = track.id;
  state.playState = 'playing';

  void _startMidiPlayback(track, state);
}

async function _warmupAndPlay(state: MusicState): Promise<void> {
  try {
    await loadMidiManifest();
    await preloadAllMidiTracks();
    state.midiLoaded = getLoadedMidiTracks().length > 0;
  } catch { /* best effort */ }
  if (state._playRequested && state.settings.enabled && !state.settings.muted) {
    play(state);
  }
}

async function _startMidiPlayback(track: MusicTrack, state: MusicState): Promise<void> {
  const player = getOrCreatePlayer();
  if (!player) return;

  const sf2Ready = await ensureSF2Loaded(player);
  if (!sf2Ready) {
    console.warn('[Music] SF2 not ready, skipping track:', track.name);
    return;
  }

  // Resolve MIDI URL from manifest
  const manifest = await loadMidiManifest();
  const entry: MidiManifestEntry | undefined = manifest.tracks.find(
    (t: MidiManifestEntry) => t.id === track.id,
  );
  if (!entry) {
    console.warn('[Music] Track missing in manifest:', track.id);
    setTimeout(() => { if (state._playRequested) nextTrack(state); }, 500);
    return;
  }

  const midiUrl = MIDI_BASE + entry.midiFile;

  try {
    // Stop silently: _trackLoading=true suppresses the onStateChange('stopped')
    // callback that player.stop() fires, preventing a recursive nextTrack loop.
    _trackLoading = true;
    player.stop();
    await player.loadMIDI(midiUrl);
    _trackLoading = false;
  } catch (e) {
    _trackLoading = false;
    console.warn(`[Music] MIDI load failed (${midiUrl}):`, e);
    setTimeout(() => { if (state._playRequested) nextTrack(state); }, 1000);
    return;
  }

  applyVolume(state);

  try {
    await player.play();
    console.log(`[Music] Playing: ${track.name}`);
  } catch (e) {
    console.warn(`[Music] Playback failed (${track.name}):`, e);
    setTimeout(() => { if (state._playRequested) nextTrack(state); }, 1000);
  }
}

export function pause(state: MusicState): void {
  state._playRequested = false;
  state.playState = 'paused';
  _player?.pause();
}

export function stop(state: MusicState): void {
  state._playRequested = false;
  state.playState = 'stopped';
  state.trackProgress = 0;
  _player?.stop();
}

export function nextTrack(state: MusicState): void {
  const wasPlaying = state.playState === 'playing' || state._playRequested;
  stop(state);
  state.currentTrackIndex = (state.currentTrackIndex + 1) % Math.max(1, state.playlist.length);
  if (wasPlaying) play(state);
}

export function prevTrack(state: MusicState): void {
  const wasPlaying = state.playState === 'playing' || state._playRequested;
  stop(state);
  state.currentTrackIndex =
    (state.currentTrackIndex - 1 + state.playlist.length) % Math.max(1, state.playlist.length);
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
  } else {
    state._playRequested = true;
    play(state);
  }
  applyVolume(state);
}

export function setVolume(state: MusicState, vol: number): void {
  state.settings.volume = Math.max(0, Math.min(1, vol));
  applyVolume(state);
}

export function startDucking(state: MusicState): void {
  state.ducking = true;
  applyVolume(state);
}

export function stopDucking(state: MusicState): void {
  state.ducking = false;
  applyVolume(state);
}

export function setBiome(state: MusicState, biomeId: number): void {
  if (biomeId === state._lastBiomeId) return;
  state._lastBiomeId = biomeId;

  if (!isMidiManifestLoaded()) return;
  const biomeTracks = getLoadedMidiTracks().filter((t) => t.biomes.includes(biomeId));
  const newPlaylist = biomeTracks.length > 0 ? biomeTracks : getLoadedMidiTracks();
  if (newPlaylist.length > 0 && newPlaylist[0]?.id !== state.playlist[0]?.id) {
    const wasPlaying = state.playState === 'playing';
    stop(state);
    state.playlist = newPlaylist;
    state.currentTrackIndex = 0;
    if (wasPlaying) play(state);
  }
}

/** Call from the game loop to keep trackProgress synced (fallback; onProgress handles live updates). */
export function updateMidiProgress(state: MusicState): void {
  if (!_player || state.playState !== 'playing') return;
  const dur = _player.duration;
  if (dur > 0) {
    state.trackProgress = Math.max(0, Math.min(1, _player.currentTime / dur));
  }
}

// --- Serialization ----------------------------------------------------------

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

// --- Info -------------------------------------------------------------------

export function getCurrentTrackInfo(
  state: MusicState,
): { name: string; id: string; composer?: string; source?: string } | null {
  if (!state.currentTrackId) return null;
  let track = getLoadedMidiTracks().find((t) => t.id === state.currentTrackId);
  if (!track) track = state.playlist.find((t) => t.id === state.currentTrackId);
  if (!track) return null;
  return { name: track.name, id: track.id, composer: track.composer, source: track.source };
}

export function getAllTrackNames(): { id: string; name: string; composer?: string }[] {
  return getLoadedMidiTracks().map((t) => ({ id: t.id, name: t.name, composer: t.composer }));
}

export function getTotalTrackCount(): number {
  return getLoadedMidiTracks().length;
}

// --- Internal Helpers -------------------------------------------------------

function applyVolume(state: MusicState): void {
  if (!_player) return;
  const vol = state.settings.muted ? 0 : state.settings.volume;
  const duckMult = state.ducking ? 0.3 : 1.0;
  const trackVol = _currentTrack?.volume ?? 1.0;
  _player.volume = vol * duckMult * trackVol;
}
