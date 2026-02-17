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
  // Apply current settings to any active loops after sample pipeline is ready.
  _updatePositionalVolumes(state);
  if (state.settings.ambienceMuted) {
    _stopAllSampledAmbience();
    _stopAmbienceNodes();
    _ambienceStarted = false;
  }
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
  // One-shots read volume on play; positional loops need live updates.
  _updatePositionalVolumes(state);
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
  // Immediately apply to existing positional loops.
  _updatePositionalVolumes(state);
}

export function toggleAmbienceMute(state: SfxState): void {
  state.settings.ambienceMuted = !state.settings.ambienceMuted;
  if (state.settings.ambienceMuted) {
    // Hard-stop both oscillator and sampled ambience layers.
    _stopAmbienceNodes();
    _stopAllSampledAmbience();
    _ambienceStarted = false;
  }
}

// ─── Positional Audio ───────────────────────────────────────

/** Tile-to-audio coordinate scale factor */
const AUDIO_SCALE = 1;

/**
 * Update listener position — call each frame (throttled by caller).
 * Updates AudioListener + distance attenuation for positional sources.
 */
export function updateListenerPosition(state: SfxState, x: number, y: number): void {
  state.listenerPos.x = x;
  state.listenerPos.y = y;
  const ctx = _ctx;
  if (!ctx) return;
  _updateListenerPosition(ctx, state.listenerPos);
  // Update distance-based volume on all active positional sources
  _updatePositionalVolumes(state);
}

function _updateListenerPosition(ctx: AudioContext, pos: AudioPosition): void {
  const listener = ctx.listener;
  if (listener.positionX) {
    listener.positionX.setValueAtTime(pos.x * AUDIO_SCALE, ctx.currentTime);
    listener.positionY.setValueAtTime(0, ctx.currentTime);
    listener.positionZ.setValueAtTime(pos.y * AUDIO_SCALE, ctx.currentTime);
  }
}

/**
 * Play a positional (world-space) looping SFX.
 * Volume attenuates by distance from listener. Uses PannerNode for stereo pan.
 * Returns an ID handle for later removal, or null if playback failed.
 */
export function playPositionalSfx(
  state: SfxState,
  sampleId: string,
  worldX: number,
  worldY: number,
  maxDist: number = 12,
  baseVolume: number = 0.6,
): string | null {
  if (!state.settings.sfxEnabled || state.settings.sfxMuted) return null;
  const ctx = ensureAudioContext();
  if (!ctx || !_sfxGain) return null;

  // Unique ID for this positional source
  const id = `pos_${sampleId}_${worldX}_${worldY}`;

  // Don't duplicate
  if (state._positionalSources.some(s => s.id === id)) return id;

  // Distance check — skip if too far
  const dx = worldX - state.listenerPos.x;
  const dy = worldY - state.listenerPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > maxDist * 1.5) return null; // Don't start if way out of range

  // Create PannerNode with inverse distance model
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'linear';
  panner.maxDistance = maxDist * AUDIO_SCALE;
  panner.refDistance = 1 * AUDIO_SCALE;
  panner.rolloffFactor = 1;
  panner.positionX.setValueAtTime(worldX * AUDIO_SCALE, ctx.currentTime);
  panner.positionY.setValueAtTime(0, ctx.currentTime);
  panner.positionZ.setValueAtTime(worldY * AUDIO_SCALE, ctx.currentTime);

  // Play sampled loop via sampled-sfx pipeline
  playSample(ctx, sampleId, {
    volume: baseVolume,
    destination: panner,
    loop: true,
  }).then(handle => {
    if (handle) {
      panner.connect(_sfxGain!);
      const src: PositionalSource = {
        id,
        pos: { x: worldX, y: worldY },
        panner,
        handle,
        maxDist,
      };
      state._positionalSources.push(src);
      // Initial volume set
      _setPositionalVolume(state, src);
    }
  }).catch(() => { /* silent fail */ });

  return id;
}

/**
 * Stop and remove a positional source by ID.
 */
export function stopPositionalSfx(state: SfxState, id: string): void {
  const idx = state._positionalSources.findIndex(s => s.id === id);
  if (idx < 0) return;
  const src = state._positionalSources[idx];
  src.handle.stop();
  src.panner.disconnect();
  state._positionalSources.splice(idx, 1);
}

/**
 * Stop all positional sources.
 */
export function stopAllPositionalSfx(state: SfxState): void {
  for (const src of state._positionalSources) {
    src.handle.stop();
    src.panner.disconnect();
  }
  state._positionalSources.length = 0;
}

/** Distance-based volume update for single source */
function _setPositionalVolume(state: SfxState, src: PositionalSource): void {
  const dx = src.pos.x - state.listenerPos.x;
  const dy = src.pos.y - state.listenerPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const vol = Math.max(0, 1 - dist / src.maxDist);
  const bus = (state.settings.sfxEnabled && !state.settings.sfxMuted) ? 1 : 0;
  src.handle.setVolume(vol * state.settings.sfxVolume * bus);
}

/** Update volumes for all active positional sources */
function _updatePositionalVolumes(state: SfxState): void {
  for (let i = state._positionalSources.length - 1; i >= 0; i--) {
    const src = state._positionalSources[i];
    const dx = src.pos.x - state.listenerPos.x;
    const dy = src.pos.y - state.listenerPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Cull if very far away
    if (dist > src.maxDist * 2) {
      src.handle.stop();
      src.panner.disconnect();
      state._positionalSources.splice(i, 1);
      continue;
    }
    _setPositionalVolume(state, src);
  }
}

/**
 * Get active positional source count (for debug/tests).
 */
export function getPositionalSourceCount(state: SfxState): number {
  return state._positionalSources.length;
}

// ─── Terrain-Aware Footsteps ────────────────────────────────

/** Surface type → footstep sample ID mapping */
const SURFACE_FOOTSTEP: Record<string, string> = {
  grass: 'footstep_grass',
  dirt:  'footstep_dirt',
  stone: 'footstep_stone',
  wood:  'footstep_stone',  // Wooden surfaces use stone
  sand:  'footstep_dirt',   // Sand uses dirt
  water: 'footstep_grass',  // Shouldn't walk on water, but fallback
};

/** Footstep frame counter — we don't want footsteps every frame */
let _footstepCounter = 0;
const FOOTSTEP_INTERVAL = 12; // Play footstep every N frames while moving

/**
 * Play a terrain-appropriate footstep SFX.
 * Call each frame while player is moving; internally rate-limits.
 * @param surface - the SurfaceType under the player (from MICRO_TILE_DEFS)
 */
export function playFootstep(state: SfxState, surface: string): void {
  _footstepCounter++;
  if (_footstepCounter < FOOTSTEP_INTERVAL) return;
  _footstepCounter = 0;

  const sfxId = SURFACE_FOOTSTEP[surface] ?? 'footstep_grass';
  playSfx(state, sfxId);
}

/** Reset footstep counter (call when player stops moving) */
export function resetFootstepCounter(): void {
  _footstepCounter = 0;
}

// ─── Sampled Ambience Layers ────────────────────────────────

/**
 * Active sampled ambience loops — tracked separately from oscillators.
 * Keyed by sample ID for deduplication.
 */
const _activeSampledAmbience = new Map<string, ActiveSampleSource>();

/**
 * Start a sampled ambience loop (replaces or supplements oscillator layers).
 * Won't duplicate if already playing.
 */
function _startSampledAmbienceLoop(
  ctx: AudioContext,
  sampleId: string,
  volume: number,
): void {
  if (_activeSampledAmbience.has(sampleId)) return;

  playSample(ctx, sampleId, {
    volume,
    destination: _ambienceGain ?? ctx.destination,
    loop: true,
  }).then(handle => {
    if (handle) {
      _activeSampledAmbience.set(sampleId, handle);
    }
  }).catch(() => { /* silent fail */ });
}

/** Stop a single sampled ambience loop */
function _stopSampledAmbienceLoop(sampleId: string): void {
  const handle = _activeSampledAmbience.get(sampleId);
  if (handle) {
    handle.stop();
    _activeSampledAmbience.delete(sampleId);
  }
}

/** Stop all sampled ambience loops */
function _stopAllSampledAmbience(): void {
  for (const [, handle] of _activeSampledAmbience) {
    handle.stop();
  }
  _activeSampledAmbience.clear();
}

// ─── Time-Triggered Animal Calls ────────────────────────────

/**
 * Random animal call system – triggers at semi-random intervals.
 * Bird chirps during day, owl hoots at night, rooster at dawn.
 * Call every ~60 frames (throttled by caller).
 */
let _lastAnimalCallFrame = 0;

export function tickAnimalCalls(
  state: SfxState,
  timeSlot: 'day' | 'dusk' | 'night',
  frameCount: number,
): void {
  if (!state.settings.sfxEnabled || state.settings.ambienceMuted) return;
  if (!state.sampledReady) return;

  // Minimum gap between animal calls (150-400 frames ≈ 2.5-6.5s at 60fps)
  const minGap = 150 + Math.floor(Math.random() * 250);
  if (frameCount - _lastAnimalCallFrame < minGap) return;

  const ctx = ensureAudioContext();
  if (!ctx) return;

  if (timeSlot === 'day') {
    // 30% chance of bird chirp per check
    if (Math.random() < 0.3) {
      const variant = `bird_chirp_${Math.floor(Math.random() * 3) + 1}`;
      playSfx(state, variant);
      _lastAnimalCallFrame = frameCount;
    }
  } else if (timeSlot === 'dusk') {
    // 15% chance of frog croak
    if (Math.random() < 0.15) {
      playSfx(state, 'frog_croak');
      _lastAnimalCallFrame = frameCount;
    }
  } else if (timeSlot === 'night') {
    // 20% chance of owl hoot
    if (Math.random() < 0.2) {
      playSfx(state, 'owl_hoot');
      _lastAnimalCallFrame = frameCount;
    }
  }
}

/**
 * Trigger rooster crow — call once at dawn transition.
 * Plays rooster_crow sample (one-shot, not looping).
 */
export function playRoosterCrow(state: SfxState): void {
  if (!state.settings.sfxEnabled || state.settings.ambienceMuted) return;
  if (!state.sampledReady) return;
  playSfx(state, 'rooster_crow');
}

// ─── Enhanced Ambience with Sampled Loops ───────────────────

/**
 * Sampled ambience layer mapping — which samples to play for each profile.
 * These supplement or replace oscillator layers for richer sound.
 */
const SAMPLED_AMBIENCE_MAP: Record<string, { sampleId: string; volume: number }[]> = {
  day_clear: [
    // Bird chirps are handled by tickAnimalCalls instead of loops
  ],
  dusk_clear: [
    { sampleId: 'cricket_loop', volume: 0.15 },
    { sampleId: 'wind_loop', volume: 0.06 },
  ],
  night_clear: [
    { sampleId: 'cricket_loop', volume: 0.2 },
    { sampleId: 'wind_loop', volume: 0.04 },
  ],
  rain: [
    { sampleId: 'rain_loop', volume: 0.25 },
    { sampleId: 'wind_loop', volume: 0.08 },
  ],
  storm: [
    { sampleId: 'rain_loop', volume: 0.35 },
    { sampleId: 'wind_loop', volume: 0.12 },
  ],
  fog: [
    { sampleId: 'wind_loop', volume: 0.05 },
  ],
};

/**
 * Enhanced ambience update — calls sampled loops alongside oscillators.
 * Drop-in replacement for updateAmbience with sampled layer support.
 */
export function updateAmbienceEnhanced(
  state: SfxState,
  timeSlot: 'day' | 'dusk' | 'night',
  weather: string,
): void {
  if (!state.settings.sfxEnabled || state.settings.ambienceMuted) {
    _stopAmbienceNodes();
    _ambienceStarted = false;
    _stopAllSampledAmbience();
    state.activeAmbienceId = null;
    return;
  }

  // If sampled ambience is unavailable, use oscillator fallback.
  if (!state.sampledReady) {
    updateAmbience(state, timeSlot, weather);
    _stopAllSampledAmbience();
    return;
  }

  // Sampled ambience ready: disable synthetic oscillator layers to avoid tonal hiss.
  if (_ambienceStarted) {
    _stopAmbienceNodes();
    _ambienceStarted = false;
  }

  const profile = resolveAmbienceProfile(timeSlot, weather);
  state.activeAmbienceId = profile ? profile.id : null;

  if (!profile) {
    _stopAllSampledAmbience();
    state.activeAmbienceId = null;
    return;
  }

  const ctx = ensureAudioContext();
  if (!ctx) return;

  // Determine target sampled layers for current profile
  const targetLayers = SAMPLED_AMBIENCE_MAP[profile.id] ?? [];
  const targetIds = new Set(targetLayers.map(l => l.sampleId));

  // Stop loops that shouldn't be playing
  for (const [id] of _activeSampledAmbience) {
    if (!targetIds.has(id)) {
      _stopSampledAmbienceLoop(id);
    }
  }

  // Start loops that should be playing
  for (const layer of targetLayers) {
    _startSampledAmbienceLoop(ctx, layer.sampleId, layer.volume * state.settings.ambienceVolume);
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
  _updatePositionalVolumes(state);
  if (state.settings.ambienceMuted || !state.settings.sfxEnabled) {
    _stopAmbienceNodes();
    _stopAllSampledAmbience();
    _ambienceStarted = false;
  }
}
