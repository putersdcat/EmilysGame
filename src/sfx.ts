/**
 * sfx.ts - Sound effects & ambience engine using Web Audio API.
 * Supports both oscillator-based and sampled AudioBuffer playback.
 * Includes positional audio via PannerNode for world-positioned sources.
 * One-shot SFX + looping ambience layers with optional sampled loops.
 * TODO: DOC - sfx architecture, ambience state machine, positional audio
 */

import {
  getSfxDef, AMBIENCE_PROFILES,
  DEFAULT_SFX_SETTINGS,
  type SfxDef, type AmbienceProfile, type AmbienceLayer, type SfxSettings,
} from './config/sfx.config';
import {
  initSampledSfx, hasSample, playSample, preloadAllSamples,
  type ActiveSampleSource,
} from './sampled-sfx';

// ─── Types ──────────────────────────────────────────────────

/** World position for positional audio */
interface AudioPosition {
  x: number;  // world X
  y: number;  // world Y
}

export interface SfxState {
  settings: SfxSettings;
  /** Currently active ambience profile ID */
  activeAmbienceId: string | null;
  /** Debounce: last SFX play time per ID (prevents spam) */
  _lastPlayTime: Record<string, number>;
  /** Whether sampled SFX are loaded and available */
  sampledReady: boolean;
  /** Active positional audio sources (for distance updates) */
  _positionalSources: PositionalSource[];
  /** Player/listener position in world coords */
  listenerPos: AudioPosition;
}

/** A positional audio source with world position */
interface PositionalSource {
  id: string;
  pos: AudioPosition;
  panner: PannerNode;
  handle: ActiveSampleSource;
  /** Max audible distance in tiles */
  maxDist: number;
}

/** Active ambience oscillator tracking (module-level) */
interface ActiveAmbienceNode {
  osc: OscillatorNode;
  gain: GainNode;
  lfo?: OscillatorNode;
  lfoGain?: GainNode;
}

// ─── Module-Level Audio Nodes ───────────────────────────────

let _ctx: AudioContext | null = null;
let _sfxGain: GainNode | null = null;
let _ambienceGain: GainNode | null = null;
let _masterGain: GainNode | null = null;
let _activeAmbience: ActiveAmbienceNode[] = [];
let _ambienceStarted = false;

// ─── Throttle: max concurrent one-shots ─────────────────────
const MAX_CONCURRENT_SFX = 6;
let _activeSfxCount = 0;

// ─── Init ───────────────────────────────────────────────────

/** Lazily create AudioContext on first user gesture */
function ensureAudioContext(): AudioContext | null {
  if (_ctx) return _ctx;
  try {
    _ctx = new AudioContext();
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 1.0;
    _masterGain.connect(_ctx.destination);

    _sfxGain = _ctx.createGain();
    _sfxGain.gain.value = 0.7;
    _sfxGain.connect(_masterGain);

    _ambienceGain = _ctx.createGain();
    _ambienceGain.gain.value = 0.4;
    _ambienceGain.connect(_masterGain);

    console.log('[SFX] AudioContext created');
    return _ctx;
  } catch (e) {
    console.warn('[SFX] Web Audio not available:', e);
    return null;
  }
}

// ─── State ──────────────────────────────────────────────────

export function createSfxState(): SfxState {
  return {
    settings: { ...DEFAULT_SFX_SETTINGS },
    activeAmbienceId: null,
    _lastPlayTime: {},
    sampledReady: false,
    _positionalSources: [],
    listenerPos: { x: 0, y: 0 },
  };
}

/** Initialize sampled SFX pipeline. Call once at startup. */
export async function initSampledSfxPipeline(state: SfxState): Promise<void> {
  await initSampledSfx();
  const ctx = ensureAudioContext();
  if (ctx) {
    await preloadAllSamples(ctx);
  }
  state.sampledReady = true;
  console.log('[SFX] Sampled SFX pipeline ready');
}

// ─── One-Shot SFX ───────────────────────────────────────────

/** Minimum ms between plays of the same SFX ID */
const SFX_DEBOUNCE_MS = 50;

/**
 * Play a one-shot SFX by ID. Prefers sampled version if available.
 * Non-blocking, fire-and-forget.
 * Respects debounce, max concurrency, and mute state.
 */
export function playSfx(state: SfxState, sfxId: string): void {
  if (!state.settings.sfxEnabled || state.settings.sfxMuted) return;

  const now = performance.now();
  const last = state._lastPlayTime[sfxId] || 0;
  if (now - last < SFX_DEBOUNCE_MS) return;
  state._lastPlayTime[sfxId] = now;

  // Concurrency limit
  if (_activeSfxCount >= MAX_CONCURRENT_SFX) return;

  const ctx = ensureAudioContext();
  if (!ctx || !_sfxGain) return;

  // Try sampled version first
  if (state.sampledReady && hasSample(sfxId)) {
    _activeSfxCount++;
    playSample(ctx, sfxId, {
      volume: state.settings.sfxVolume * 0.7,
      destination: _sfxGain,
      pitchVariation: sfxId.startsWith('footstep') ? 0.08 : 0,
    }).then(handle => {
      if (handle) {
        handle.source.onended = () => {
          _activeSfxCount = Math.max(0, _activeSfxCount - 1);
        };
      } else {
        _activeSfxCount = Math.max(0, _activeSfxCount - 1);
      }
    }).catch(() => {
      _activeSfxCount = Math.max(0, _activeSfxCount - 1);
    });
    return;
  }

  // Fallback to oscillator
  const def = getSfxDef(sfxId);
  if (!def) return;

  _playSfxDef(ctx, def, state.settings.sfxVolume);
}

/** Internal: schedule oscillator notes for an SFX definition */
function _playSfxDef(ctx: AudioContext, def: SfxDef, volume: number): void {
  const baseTime = ctx.currentTime;

  for (const note of def.notes) {
    const start = baseTime + (note.delay || 0);
    const end = start + note.duration;

    // Create oscillator
    const osc = ctx.createOscillator();
    osc.type = note.wave;
    osc.frequency.setValueAtTime(note.freq, start);
    if (note.slideTo) {
      osc.frequency.linearRampToValueAtTime(note.slideTo, end);
    }

    // Gain envelope
    const gain = ctx.createGain();
    const peakGain = note.gain * volume;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peakGain, start + Math.min(0.01, note.duration * 0.1));
    gain.gain.linearRampToValueAtTime(0, end);

    osc.connect(gain);
    gain.connect(_sfxGain!);

    _activeSfxCount++;
    osc.start(start);
    osc.stop(end);
    osc.onended = () => {
      _activeSfxCount = Math.max(0, _activeSfxCount - 1);
      osc.disconnect();
      gain.disconnect();
    };
  }
}

// ─── Ambience ───────────────────────────────────────────────

/**
 * Resolve the best ambience profile for current conditions.
 * Higher priority wins. Conditions must ALL match if specified.
 */
export function resolveAmbienceProfile(
  timeSlot: 'day' | 'dusk' | 'night',
  weather: string
): AmbienceProfile | null {
  let best: AmbienceProfile | null = null;
  let bestPri = -1;

  for (const profile of AMBIENCE_PROFILES) {
    const c = profile.conditions;
    // Check conditions
    if (c.timeSlot && c.timeSlot !== timeSlot) continue;
    if (c.weather && c.weather !== weather) continue;
    if (profile.priority > bestPri) {
      best = profile;
      bestPri = profile.priority;
    }
  }
  return best;
}

/**
 * Update ambience to match current conditions.
 * Only changes if profile ID differs from active.
 */
export function updateAmbience(
  state: SfxState,
  timeSlot: 'day' | 'dusk' | 'night',
  weather: string
): void {
  if (!state.settings.sfxEnabled || state.settings.ambienceMuted) {
    if (_ambienceStarted) stopAmbience(state);
    return;
  }

  const profile = resolveAmbienceProfile(timeSlot, weather);
  const newId = profile ? profile.id : null;

  if (newId === state.activeAmbienceId && _ambienceStarted) return;

  // Transition: stop old, start new
  _stopAmbienceNodes();
  state.activeAmbienceId = newId;

  if (!profile) {
    _ambienceStarted = false;
    return;
  }

  const ctx = ensureAudioContext();
  if (!ctx || !_ambienceGain) return;

  _startAmbienceProfile(ctx, profile, state.settings.ambienceVolume);
  _ambienceStarted = true;
}

/** Stop all active ambience oscillators */
export function stopAmbience(state: SfxState): void {
  _stopAmbienceNodes();
  state.activeAmbienceId = null;
  _ambienceStarted = false;
}

function _stopAmbienceNodes(): void {
  for (const node of _activeAmbience) {
    try { node.osc.stop(); } catch { /* ok */ }
    node.osc.disconnect();
    node.gain.disconnect();
    if (node.lfo) {
      try { node.lfo.stop(); } catch { /* ok */ }
      node.lfo.disconnect();
    }
    if (node.lfoGain) node.lfoGain.disconnect();
  }
  _activeAmbience = [];
}

function _startAmbienceProfile(ctx: AudioContext, profile: AmbienceProfile, volume: number): void {
  for (const layer of profile.layers) {
    _startAmbienceLayer(ctx, layer, volume);
  }
}

function _startAmbienceLayer(ctx: AudioContext, layer: AmbienceLayer, volume: number): void {
  const osc = ctx.createOscillator();
  osc.type = layer.wave;
  osc.frequency.value = layer.freq;

  const gain = ctx.createGain();
  // Fade in over 1s for smooth transition
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(layer.gain * volume, ctx.currentTime + 1.0);

  const node: ActiveAmbienceNode = { osc, gain };

  // LFO modulation for organic sound
  if (layer.lfoFreq && layer.lfoDepth) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = layer.lfoFreq;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = layer.lfoDepth;

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();

    node.lfo = lfo;
    node.lfoGain = lfoGain;
  }

  osc.connect(gain);
  gain.connect(_ambienceGain!);
  osc.start();

  _activeAmbience.push(node);
}

// ─── Volume Controls ────────────────────────────────────────

export function setSfxVolume(state: SfxState, vol: number): void {
  state.settings.sfxVolume = Math.max(0, Math.min(1, vol));
  // _sfxGain is set at play time from state, no live update needed for one-shots
}

export function setAmbienceVolume(state: SfxState, vol: number): void {
  state.settings.ambienceVolume = Math.max(0, Math.min(1, vol));
  if (_ambienceGain) {
    // Scale all active ambience layer gains
    // Scale master ambience gain node directly
    _ambienceGain.gain.setValueAtTime(vol, _ctx?.currentTime ?? 0);
  }
}

export function toggleSfxMute(state: SfxState): void {
  state.settings.sfxMuted = !state.settings.sfxMuted;
}

export function toggleAmbienceMute(state: SfxState): void {
  state.settings.ambienceMuted = !state.settings.ambienceMuted;
  if (state.settings.ambienceMuted && _ambienceStarted) {
    _stopAmbienceNodes();
    _ambienceStarted = false;
  }
}

// ─── Positional Audio ───────────────────────────────────────

/** Tile-to-audio coordinate scale factor */
const AUDIO_SCALE = 1;

/**
 * Update listener position — call each frame (throttled by caller).
 * Updates AudioListener for all PannerNode distance calculations.
 */
export function updateListenerPosition(state: SfxState, x: number, y: number): void {
  state.listenerPos.x = x;
  state.listenerPos.y = y;
  const ctx = _ctx;
  if (!ctx) return;
  _updateListenerPosition(ctx, state.listenerPos);
}

function _updateListenerPosition(ctx: AudioContext, pos: AudioPosition): void {
  const listener = ctx.listener;
  if (listener.positionX) {
    listener.positionX.setValueAtTime(pos.x * AUDIO_SCALE, ctx.currentTime);
    listener.positionY.setValueAtTime(0, ctx.currentTime);
    listener.positionZ.setValueAtTime(pos.y * AUDIO_SCALE, ctx.currentTime);
  }
}

// ─── Serialization ──────────────────────────────────────────

export function serializeSfxSettings(state: SfxState): SfxSettings {
  return { ...state.settings };
}

export function deserializeSfxSettings(state: SfxState, saved: Partial<SfxSettings>): void {
  if (saved.sfxVolume !== undefined) state.settings.sfxVolume = saved.sfxVolume;
  if (saved.ambienceVolume !== undefined) state.settings.ambienceVolume = saved.ambienceVolume;
  if (saved.sfxMuted !== undefined) state.settings.sfxMuted = saved.sfxMuted;
  if (saved.ambienceMuted !== undefined) state.settings.ambienceMuted = saved.ambienceMuted;
  if (saved.sfxEnabled !== undefined) state.settings.sfxEnabled = saved.sfxEnabled;
}
