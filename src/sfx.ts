/**
 * sfx.ts - Sound effects & ambience engine using Web Audio API oscillators.
 * Shares AudioContext pattern with music.ts but runs independently.
 * One-shot SFX + looping ambience layers with LFO modulation.
 * TODO: DOC - sfx architecture, ambience state machine, AudioContext sharing
 */

import {
  getSfxDef, AMBIENCE_PROFILES,
  DEFAULT_SFX_SETTINGS,
  type SfxDef, type AmbienceProfile, type AmbienceLayer, type SfxSettings,
} from './config/sfx.config';

// ─── Types ──────────────────────────────────────────────────

export interface SfxState {
  settings: SfxSettings;
  /** Currently active ambience profile ID */
  activeAmbienceId: string | null;
  /** Debounce: last SFX play time per ID (prevents spam) */
  _lastPlayTime: Record<string, number>;
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
  };
}

// ─── One-Shot SFX ───────────────────────────────────────────

/** Minimum ms between plays of the same SFX ID */
const SFX_DEBOUNCE_MS = 50;

/**
 * Play a one-shot SFX by ID. Non-blocking, fire-and-forget.
 * Respects debounce, max concurrency, and mute state.
 */
export function playSfx(state: SfxState, sfxId: string): void {
  if (!state.settings.sfxEnabled || state.settings.sfxMuted) return;

  const def = getSfxDef(sfxId);
  if (!def) return;

  // Debounce same SFX
  const now = performance.now();
  const last = state._lastPlayTime[sfxId] || 0;
  if (now - last < SFX_DEBOUNCE_MS) return;
  state._lastPlayTime[sfxId] = now;

  // Concurrency limit
  if (_activeSfxCount >= MAX_CONCURRENT_SFX) return;

  const ctx = ensureAudioContext();
  if (!ctx || !_sfxGain) return;

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

export function setSfxEnabled(state: SfxState, enabled: boolean): void {
  state.settings.sfxEnabled = enabled;
  if (!enabled) {
    stopAmbience(state);
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

// ─── Cleanup ────────────────────────────────────────────────

export function destroySfx(state: SfxState): void {
  stopAmbience(state);
  _activeSfxCount = 0;
  // Don't close AudioContext — may be shared with music
}
