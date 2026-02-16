/**
 * sfx.config.ts - Sound effect & ambience configuration.
 * All SFX are oscillator-based (no audio files) to match music.ts approach.
 * TODO: DOC - sfx config, voice definitions, ambience profiles
 */

// ─── SFX Voice Definitions ─────────────────────────────────

/** A single oscillator "note" in an SFX */
export interface SfxNote {
  freq: number;          // Hz
  duration: number;      // seconds
  wave: OscillatorType;  // sine, square, triangle, sawtooth
  gain: number;          // 0-1
  /** Pitch slide target (Hz) — glides from freq to this over duration */
  slideTo?: number;
  /** Delay before this note starts (seconds, relative to SFX start) */
  delay?: number;
}

/** An SFX is a named collection of layered oscillator notes */
export interface SfxDef {
  id: string;
  notes: SfxNote[];
  /** Category for per-channel volume control */
  category: 'interaction' | 'ui' | 'environment' | 'alert';
}

/** All SFX definitions */
export const SFX_DEFS: SfxDef[] = [
  // ─── Interaction SFX ─────────────────────────────────────
  {
    id: 'pickup_coin',
    category: 'interaction',
    notes: [
      { freq: 880, duration: 0.08, wave: 'sine', gain: 0.3 },
      { freq: 1320, duration: 0.1, wave: 'sine', gain: 0.25, delay: 0.06 },
    ],
  },
  {
    id: 'pickup_item',
    category: 'interaction',
    notes: [
      { freq: 660, duration: 0.1, wave: 'triangle', gain: 0.3 },
      { freq: 880, duration: 0.08, wave: 'triangle', gain: 0.2, delay: 0.08 },
    ],
  },
  {
    id: 'open_chest',
    category: 'interaction',
    notes: [
      { freq: 440, duration: 0.12, wave: 'triangle', gain: 0.3 },
      { freq: 554, duration: 0.12, wave: 'triangle', gain: 0.3, delay: 0.1 },
      { freq: 659, duration: 0.12, wave: 'triangle', gain: 0.3, delay: 0.2 },
      { freq: 880, duration: 0.2, wave: 'sine', gain: 0.25, delay: 0.3 },
    ],
  },
  {
    id: 'obstacle_resolved',
    category: 'interaction',
    notes: [
      { freq: 330, duration: 0.15, wave: 'square', gain: 0.15 },
      { freq: 440, duration: 0.15, wave: 'square', gain: 0.15, delay: 0.12 },
      { freq: 660, duration: 0.2, wave: 'triangle', gain: 0.2, delay: 0.24 },
    ],
  },
  {
    id: 'obstacle_blocked',
    category: 'interaction',
    notes: [
      { freq: 200, duration: 0.15, wave: 'square', gain: 0.15 },
      { freq: 150, duration: 0.2, wave: 'square', gain: 0.12, delay: 0.1 },
    ],
  },
  {
    id: 'wall_bump',
    category: 'interaction',
    notes: [
      { freq: 100, duration: 0.06, wave: 'square', gain: 0.1 },
    ],
  },
  {
    id: 'ouch',
    category: 'interaction',
    notes: [
      { freq: 400, duration: 0.08, wave: 'sawtooth', gain: 0.2 },
      { freq: 250, duration: 0.12, wave: 'square', gain: 0.15, delay: 0.06 },
      { freq: 150, duration: 0.15, wave: 'square', gain: 0.1, delay: 0.14 },
    ],
  },
  {
    id: 'bandaid_use',
    category: 'interaction',
    notes: [
      { freq: 500, duration: 0.06, wave: 'sine', gain: 0.15 },
      { freq: 700, duration: 0.08, wave: 'sine', gain: 0.12, delay: 0.05 },
      { freq: 900, duration: 0.1, wave: 'sine', gain: 0.1, delay: 0.1 },
    ],
  },

  // ─── UI SFX ──────────────────────────────────────────────
  {
    id: 'dialog_open',
    category: 'ui',
    notes: [
      { freq: 600, duration: 0.06, wave: 'sine', gain: 0.15 },
      { freq: 800, duration: 0.08, wave: 'sine', gain: 0.12, delay: 0.04 },
    ],
  },
  {
    id: 'dialog_advance',
    category: 'ui',
    notes: [
      { freq: 500, duration: 0.04, wave: 'sine', gain: 0.1 },
    ],
  },
  {
    id: 'dialog_close',
    category: 'ui',
    notes: [
      { freq: 800, duration: 0.06, wave: 'sine', gain: 0.12 },
      { freq: 500, duration: 0.08, wave: 'sine', gain: 0.1, delay: 0.04 },
    ],
  },
  {
    id: 'shop_open',
    category: 'ui',
    notes: [
      { freq: 440, duration: 0.08, wave: 'triangle', gain: 0.2 },
      { freq: 550, duration: 0.08, wave: 'triangle', gain: 0.18, delay: 0.06 },
      { freq: 660, duration: 0.1, wave: 'triangle', gain: 0.15, delay: 0.12 },
    ],
  },
  {
    id: 'shop_buy',
    category: 'ui',
    notes: [
      { freq: 1000, duration: 0.05, wave: 'sine', gain: 0.2 },
      { freq: 1200, duration: 0.05, wave: 'sine', gain: 0.18, delay: 0.04 },
      { freq: 1500, duration: 0.08, wave: 'sine', gain: 0.15, delay: 0.07 },
    ],
  },
  {
    id: 'shop_fail',
    category: 'ui',
    notes: [
      { freq: 300, duration: 0.1, wave: 'sawtooth', gain: 0.12 },
      { freq: 250, duration: 0.15, wave: 'sawtooth', gain: 0.1, delay: 0.08 },
    ],
  },
  {
    id: 'menu_navigate',
    category: 'ui',
    notes: [
      { freq: 700, duration: 0.03, wave: 'sine', gain: 0.08 },
    ],
  },

  // ─── Alert/Quiz SFX ──────────────────────────────────────
  {
    id: 'quiz_start',
    category: 'alert',
    notes: [
      { freq: 440, duration: 0.1, wave: 'triangle', gain: 0.25 },
      { freq: 660, duration: 0.1, wave: 'triangle', gain: 0.25, delay: 0.08 },
      { freq: 880, duration: 0.15, wave: 'triangle', gain: 0.2, delay: 0.16 },
    ],
  },
  {
    id: 'quiz_correct',
    category: 'alert',
    notes: [
      { freq: 523, duration: 0.12, wave: 'sine', gain: 0.3 },
      { freq: 659, duration: 0.12, wave: 'sine', gain: 0.3, delay: 0.1 },
      { freq: 784, duration: 0.12, wave: 'sine', gain: 0.3, delay: 0.2 },
      { freq: 1047, duration: 0.25, wave: 'sine', gain: 0.25, delay: 0.3 },
    ],
  },
  {
    id: 'quiz_wrong',
    category: 'alert',
    notes: [
      { freq: 350, duration: 0.2, wave: 'sawtooth', gain: 0.15 },
      { freq: 300, duration: 0.25, wave: 'sawtooth', gain: 0.12, delay: 0.15 },
    ],
  },
  {
    id: 'gate_open',
    category: 'alert',
    notes: [
      { freq: 220, duration: 0.15, wave: 'square', gain: 0.12 },
      { freq: 330, duration: 0.15, wave: 'square', gain: 0.12, delay: 0.12 },
      { freq: 440, duration: 0.15, wave: 'triangle', gain: 0.15, delay: 0.24 },
      { freq: 660, duration: 0.2, wave: 'triangle', gain: 0.15, delay: 0.36 },
    ],
  },
  {
    id: 'wildlife_discover',
    category: 'alert',
    notes: [
      { freq: 700, duration: 0.08, wave: 'sine', gain: 0.2 },
      { freq: 900, duration: 0.08, wave: 'sine', gain: 0.18, delay: 0.06 },
      { freq: 1100, duration: 0.12, wave: 'sine', gain: 0.15, delay: 0.12 },
    ],
  },
  {
    id: 'status_warning',
    category: 'alert',
    notes: [
      { freq: 400, duration: 0.1, wave: 'square', gain: 0.12 },
      { freq: 350, duration: 0.12, wave: 'square', gain: 0.1, delay: 0.15 },
    ],
  },
  {
    id: 'status_critical',
    category: 'alert',
    notes: [
      { freq: 500, duration: 0.08, wave: 'square', gain: 0.18 },
      { freq: 350, duration: 0.08, wave: 'square', gain: 0.15, delay: 0.08 },
      { freq: 500, duration: 0.08, wave: 'square', gain: 0.18, delay: 0.2 },
      { freq: 350, duration: 0.08, wave: 'square', gain: 0.15, delay: 0.28 },
    ],
  },
  {
    id: 'eat_food',
    category: 'interaction',
    notes: [
      { freq: 300, duration: 0.05, wave: 'sine', gain: 0.15 },
      { freq: 350, duration: 0.05, wave: 'sine', gain: 0.12, delay: 0.06 },
      { freq: 400, duration: 0.08, wave: 'sine', gain: 0.1, delay: 0.12 },
    ],
  },
  {
    id: 'drink_water',
    category: 'interaction',
    notes: [
      { freq: 200, duration: 0.08, wave: 'sine', gain: 0.12, slideTo: 350 },
      { freq: 250, duration: 0.08, wave: 'sine', gain: 0.1, delay: 0.1, slideTo: 400 },
    ],
  },

  // ─── Environment SFX ─────────────────────────────────────
  {
    id: 'thunder',
    category: 'environment',
    notes: [
      { freq: 60, duration: 0.3, wave: 'sawtooth', gain: 0.3, slideTo: 40 },
      { freq: 80, duration: 0.4, wave: 'sawtooth', gain: 0.2, delay: 0.1, slideTo: 30 },
      { freq: 50, duration: 0.5, wave: 'square', gain: 0.15, delay: 0.2, slideTo: 25 },
    ],
  },
  {
    id: 'footstep',
    category: 'interaction',
    notes: [
      { freq: 80, duration: 0.04, wave: 'square', gain: 0.06 },
    ],
  },
];

/** Lookup SFX by ID */
const _sfxMap = new Map<string, SfxDef>();
for (const def of SFX_DEFS) _sfxMap.set(def.id, def);
export function getSfxDef(id: string): SfxDef | undefined { return _sfxMap.get(id); }

// ─── Ambience Profiles ─────────────────────────────────────

/** An ambient layer: a looping oscillator sound */
export interface AmbienceLayer {
  id: string;
  freq: number;
  wave: OscillatorType;
  gain: number;         // base gain
  /** LFO modulation for organic feel */
  lfoFreq?: number;     // Hz, low-frequency oscillation speed
  lfoDepth?: number;    // Hz, frequency wobble amount
}

/** Ambient profile for a time-of-day / weather combination */
export interface AmbienceProfile {
  id: string;
  layers: AmbienceLayer[];
  /** When this profile applies */
  conditions: {
    timeSlot?: 'day' | 'dusk' | 'night';
    weather?: 'clear' | 'rain' | 'storm' | 'fog';
  };
  /** Higher priority wins when multiple match */
  priority: number;
}

export const AMBIENCE_PROFILES: AmbienceProfile[] = [
  // ─── Day (clear) — birds/insects hum ─────────────────────
  {
    id: 'day_clear',
    priority: 1,
    conditions: { timeSlot: 'day' },
    layers: [
      { id: 'bird1', freq: 2400, wave: 'sine', gain: 0.02, lfoFreq: 3, lfoDepth: 200 },
      { id: 'bird2', freq: 3100, wave: 'sine', gain: 0.015, lfoFreq: 4.5, lfoDepth: 300 },
      { id: 'insects', freq: 4800, wave: 'sine', gain: 0.008, lfoFreq: 8, lfoDepth: 100 },
    ],
  },
  // ─── Dusk — crickets ─────────────────────────────────────
  {
    id: 'dusk_clear',
    priority: 1,
    conditions: { timeSlot: 'dusk' },
    layers: [
      { id: 'cricket1', freq: 4000, wave: 'sine', gain: 0.012, lfoFreq: 12, lfoDepth: 50 },
      { id: 'cricket2', freq: 4200, wave: 'sine', gain: 0.01, lfoFreq: 14, lfoDepth: 60 },
      { id: 'wind', freq: 200, wave: 'sine', gain: 0.008, lfoFreq: 0.3, lfoDepth: 40 },
    ],
  },
  // ─── Night — deep crickets + owl ─────────────────────────
  {
    id: 'night_clear',
    priority: 1,
    conditions: { timeSlot: 'night' },
    layers: [
      { id: 'cricket_night', freq: 3800, wave: 'sine', gain: 0.015, lfoFreq: 10, lfoDepth: 40 },
      { id: 'owl', freq: 400, wave: 'sine', gain: 0.01, lfoFreq: 0.5, lfoDepth: 30 },
      { id: 'wind_night', freq: 150, wave: 'sine', gain: 0.006, lfoFreq: 0.2, lfoDepth: 30 },
    ],
  },
  // ─── Rain (any time) — higher priority ───────────────────
  {
    id: 'rain',
    priority: 5,
    conditions: { weather: 'rain' },
    layers: [
      { id: 'rain_high', freq: 6000, wave: 'sawtooth', gain: 0.015, lfoFreq: 2, lfoDepth: 500 },
      { id: 'rain_mid', freq: 3000, wave: 'sawtooth', gain: 0.012, lfoFreq: 1.5, lfoDepth: 300 },
      { id: 'rain_low', freq: 200, wave: 'sine', gain: 0.008, lfoFreq: 0.5, lfoDepth: 30 },
    ],
  },
  // ─── Storm (any time) — rain + rumble ────────────────────
  {
    id: 'storm',
    priority: 8,
    conditions: { weather: 'storm' },
    layers: [
      { id: 'storm_rain_h', freq: 6500, wave: 'sawtooth', gain: 0.02, lfoFreq: 3, lfoDepth: 600 },
      { id: 'storm_rain_m', freq: 3200, wave: 'sawtooth', gain: 0.015, lfoFreq: 2, lfoDepth: 400 },
      { id: 'storm_rumble', freq: 80, wave: 'sawtooth', gain: 0.015, lfoFreq: 0.3, lfoDepth: 20 },
      { id: 'storm_wind', freq: 300, wave: 'sine', gain: 0.01, lfoFreq: 0.8, lfoDepth: 60 },
    ],
  },
  // ─── Fog (any time) — eerie hum ─────────────────────────
  {
    id: 'fog',
    priority: 5,
    conditions: { weather: 'fog' },
    layers: [
      { id: 'fog_hum', freq: 180, wave: 'sine', gain: 0.008, lfoFreq: 0.15, lfoDepth: 15 },
      { id: 'fog_high', freq: 1200, wave: 'sine', gain: 0.005, lfoFreq: 0.4, lfoDepth: 50 },
    ],
  },
];

// ─── Settings ───────────────────────────────────────────────

export interface SfxSettings {
  sfxVolume: number;       // 0-1
  ambienceVolume: number;  // 0-1
  sfxMuted: boolean;
  ambienceMuted: boolean;
  sfxEnabled: boolean;
}

export const DEFAULT_SFX_SETTINGS: SfxSettings = {
  sfxVolume: 0.7,
  ambienceVolume: 0.4,
  sfxMuted: false,
  ambienceMuted: false,
  sfxEnabled: true,
};
