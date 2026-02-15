/**
 * particles.config.ts - Configuration for ambient particle system (#78).
 * All tuning values in one place; no magic numbers in render loop.
 * TODO: DOC - particle config schema, per-type caps, time/biome modifiers
 */

// ─── Per-Type Caps ──────────────────────────────────────────

export interface ParticleTypeCap {
  /** Max simultaneous particles of this type */
  max: number;
  /** Spawn chance per interval (0-1) */
  spawnRate: number;
  /** Base size in px */
  baseSize: number;
  /** Size variance in px (added to baseSize via Math.random) */
  sizeVariance: number;
  /** Whether this type is enabled (feature flag) */
  enabled: boolean;
}

export const PARTICLE_CAPS: Record<string, ParticleTypeCap> = {
  butterfly: { max: 12, spawnRate: 0.25, baseSize: 14, sizeVariance: 4, enabled: true },
  sparkle:   { max: 20, spawnRate: 0.45, baseSize: 3,  sizeVariance: 3, enabled: true },
  leaf:      { max: 10, spawnRate: 0.18, baseSize: 14, sizeVariance: 4, enabled: true },
  bird:      { max: 3,  spawnRate: 0.02, baseSize: 18, sizeVariance: 6, enabled: true },
};

// ─── Global Limits ──────────────────────────────────────────

export const PARTICLE_LIMITS = {
  /** Hard cap for all particles combined */
  maxTotal: 40,
  /** Frames between spawn attempts */
  spawnInterval: 6,
  /** px beyond screen edge before killing */
  despawnMargin: 120,
} as const;

// ─── Time-of-Day Modifiers ──────────────────────────────────

/**
 * Spawn rate multipliers by time of day.
 * Keys match getTimeOfDay() return values (emoji prefix stripped).
 */
export const TIME_SPAWN_MODIFIERS: Record<string, Record<string, number>> = {
  // Butterflies love daytime, vanish at night
  butterfly: { Dawn: 0.4, Morning: 0.8, Day: 1.0, Afternoon: 0.9, Dusk: 0.3, Evening: 0.0, Night: 0.0, 'Late Night': 0.0 },
  // Sparkles shine more at twilight/night
  sparkle:   { Dawn: 0.6, Morning: 0.4, Day: 0.3, Afternoon: 0.4, Dusk: 0.8, Evening: 1.0, Night: 1.0, 'Late Night': 0.8 },
  // Leaves are wind-driven, always present, slightly less at night
  leaf:      { Dawn: 0.7, Morning: 1.0, Day: 1.0, Afternoon: 1.0, Dusk: 0.8, Evening: 0.5, Night: 0.3, 'Late Night': 0.3 },
  // Birds are diurnal
  bird:      { Dawn: 0.6, Morning: 1.0, Day: 1.0, Afternoon: 0.8, Dusk: 0.4, Evening: 0.0, Night: 0.0, 'Late Night': 0.0 },
};

// ─── Biome Modifiers ────────────────────────────────────────

/**
 * Spawn rate multipliers by biome name.
 * Missing biome = 1.0 default.
 */
export const BIOME_SPAWN_MODIFIERS: Record<string, Record<string, number>> = {
  butterfly: { forest: 1.2, meadow: 1.5, swamp: 0.3, desert: 0.1, tundra: 0.0, cave: 0.0 },
  sparkle:   { forest: 0.5, meadow: 0.3, swamp: 1.2, desert: 0.0, tundra: 0.5, cave: 1.5 },
  leaf:      { forest: 1.5, meadow: 0.5, swamp: 0.8, desert: 0.0, tundra: 0.2, cave: 0.0 },
  bird:      { forest: 1.0, meadow: 1.3, swamp: 0.5, desert: 0.3, tundra: 0.2, cave: 0.0 },
};

// ─── Helpers ────────────────────────────────────────────────

/** Strip emoji prefix from time-of-day string, e.g. "🌅 Dawn" → "Dawn" */
export function stripTimeEmoji(tod: string): string {
  return tod.replace(/^[^\w]+/, '').trim();
}

/** Get effective spawn rate for a type, factoring in time + biome modifiers */
export function getEffectiveSpawnRate(
  kind: string,
  tod: string,
  biomeName: string,
): number {
  const cap = PARTICLE_CAPS[kind];
  if (!cap || !cap.enabled) return 0;

  const timeKey = stripTimeEmoji(tod);
  const timeMod = TIME_SPAWN_MODIFIERS[kind]?.[timeKey] ?? 1.0;
  const biomeMod = BIOME_SPAWN_MODIFIERS[kind]?.[biomeName.toLowerCase()] ?? 1.0;

  return cap.spawnRate * timeMod * biomeMod;
}
