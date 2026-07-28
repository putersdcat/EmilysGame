/**
 * status.ts - Lightweight survival status system (#70).
 * Non-punitive: drains slowly, debuffs only (no death/game-over).
 * Tracks: energy (hunger), hydration (thirst), cleanliness (hygiene).
 * TODO: DOC - status system API
 */

// ─── Types ───────────────────────────────────────────────────

export interface PlayerStatus {
  /** Energy (0-100): affected by hunger. Drains slowly. */
  energy: number;
  /** Hydration (0-100): affected by thirst. Drains slowly. */
  hydration: number;
  /** Cleanliness (0-100): affected by terrain. Drains slowly. */
  cleanliness: number;
}

export interface StatusDebuff {
  /** Speed multiplier (1.0 = normal, <1 = slower) */
  speedMult: number;
  /** Active debuff labels for UI display */
  activeDebuffs: string[];
}

// ─── Constants ───────────────────────────────────────────────

/** How often status ticks, in real milliseconds (frame-rate independent).
 *  Was "every 300 frames" — which assumed 60fps, but the render loop can run
 *  far faster (or slower), draining status several times too fast. Time-based
 *  so the drain rate is constant in real seconds. */
const TICK_INTERVAL_MS = 5000;

/** Base drain per tick (very slow — takes ~20 minutes to empty from 100) */
const ENERGY_DRAIN = 0.4;
const HYDRATION_DRAIN = 0.5;
const CLEANLINESS_DRAIN = 0.2;

/** Extra drain when moving per tick */
const MOVE_ENERGY_DRAIN = 0.2;
const MOVE_HYDRATION_DRAIN = 0.15;

/** Terrain-based cleanliness drain (walking through mud/caves) */
const TERRAIN_CLEANLINESS_DRAIN = 0.3;

/** Thresholds for debuffs */
export const LOW_THRESHOLD = 30;
export const CRITICAL_THRESHOLD = 15;

/** Speed penalties */
const LOW_SPEED_PENALTY = 0.85;
const CRITICAL_SPEED_PENALTY = 0.7;

// ─── State ───────────────────────────────────────────────────

export function createPlayerStatus(): PlayerStatus {
  return {
    energy: 100,
    hydration: 100,
    cleanliness: 100,
  };
}

// ─── Tick Logic ──────────────────────────────────────────────

let tickAccumMs = 0;

/**
 * Called every frame. Internally throttled to TICK_INTERVAL_MS of real time.
 * Pass the frame's real delta time (dtMs) so the throttle is frame-rate
 * independent. Returns true if status actually ticked (for UI update optimization).
 */
export function tickStatus(
  status: PlayerStatus,
  isMoving: boolean,
  biomeId: number,
  dtMs: number = 16.67,
): boolean {
  tickAccumMs += dtMs;
  if (tickAccumMs < TICK_INTERVAL_MS) return false;
  tickAccumMs = 0;

  // Energy drain
  status.energy -= ENERGY_DRAIN;
  if (isMoving) status.energy -= MOVE_ENERGY_DRAIN;

  // Hydration drain
  status.hydration -= HYDRATION_DRAIN;
  if (isMoving) status.hydration -= MOVE_HYDRATION_DRAIN;

  // Cleanliness drain (faster in caves/forests)
  status.cleanliness -= CLEANLINESS_DRAIN;
  if (biomeId === 1 || biomeId === 2) { // forest or cave
    status.cleanliness -= TERRAIN_CLEANLINESS_DRAIN;
  }

  // Clamp to 0 (never below)
  status.energy = Math.max(0, status.energy);
  status.hydration = Math.max(0, status.hydration);
  status.cleanliness = Math.max(0, status.cleanliness);

  return true;
}

// ─── Debuff Calculation ──────────────────────────────────────

export function getDebuffs(status: PlayerStatus): StatusDebuff {
  let speedMult = 1.0;
  const activeDebuffs: string[] = [];

  // Energy debuffs
  if (status.energy <= CRITICAL_THRESHOLD) {
    speedMult *= CRITICAL_SPEED_PENALTY;
    activeDebuffs.push('⚡ Exhausted');
  } else if (status.energy <= LOW_THRESHOLD) {
    speedMult *= LOW_SPEED_PENALTY;
    activeDebuffs.push('⚡ Hungry');
  }

  // Hydration debuffs
  if (status.hydration <= CRITICAL_THRESHOLD) {
    speedMult *= CRITICAL_SPEED_PENALTY;
    activeDebuffs.push('💧 Dehydrated');
  } else if (status.hydration <= LOW_THRESHOLD) {
    speedMult *= LOW_SPEED_PENALTY;
    activeDebuffs.push('💧 Thirsty');
  }

  // Cleanliness debuffs (#110: now includes speed penalty)
  if (status.cleanliness <= CRITICAL_THRESHOLD) {
    speedMult *= 0.8;
    activeDebuffs.push('🧼 Very Dirty');
  } else if (status.cleanliness <= LOW_THRESHOLD) {
    speedMult *= 0.9;
    activeDebuffs.push('🧼 Dirty');
  }

  return { speedMult, activeDebuffs };
}

// ─── Consumable Effects ──────────────────────────────────────

export interface StatusEffect {
  energy?: number;
  hydration?: number;
  cleanliness?: number;
}

/** Apply a consumable's effect to player status. Returns what changed. */
export function applyStatusEffect(status: PlayerStatus, effect: StatusEffect): string[] {
  const changes: string[] = [];

  if (effect.energy) {
    const before = status.energy;
    status.energy = Math.min(100, status.energy + effect.energy);
    if (status.energy > before) changes.push(`⚡ +${Math.round(status.energy - before)} energy`);
  }

  if (effect.hydration) {
    const before = status.hydration;
    status.hydration = Math.min(100, status.hydration + effect.hydration);
    if (status.hydration > before) changes.push(`💧 +${Math.round(status.hydration - before)} hydration`);
  }

  if (effect.cleanliness) {
    const before = status.cleanliness;
    status.cleanliness = Math.min(100, status.cleanliness + effect.cleanliness);
    if (status.cleanliness > before) changes.push(`🧼 +${Math.round(status.cleanliness - before)} clean`);
  }

  return changes;
}

// ─── Status Item Mapping ─────────────────────────────────────

/** Map item IDs to their status effects */
export const STATUS_ITEM_EFFECTS: Record<string, StatusEffect> = {
  mushroom: { energy: 15 },
  snack: { energy: 30 },
  water_flask: { hydration: 35 },
  // Merchant trades historically used id 'water' — same effect as water_flask
  water: { hydration: 35 },
  bandage: { energy: 5, cleanliness: 5 }, // Note: main heal via injury.ts applyBandaid (#109)
  potion: { energy: 20, hydration: 15 },
  soap: { cleanliness: 50 },
};

/**
 * Try to use an item for its status effect.
 * Returns feedback string if used, null if item has no status effect.
 */
export function useStatusItem(status: PlayerStatus, itemId: string): string | null {
  const effect = STATUS_ITEM_EFFECTS[itemId];
  if (!effect) return null;

  const changes = applyStatusEffect(status, effect);
  if (changes.length === 0) return 'Already at full status!';
  return changes.join(', ');
}

// ─── Serialization (for save/load) ──────────────────────────

export function serializeStatus(status: PlayerStatus): { energy: number; hydration: number; cleanliness: number } {
  return {
    energy: Math.round(status.energy * 10) / 10,
    hydration: Math.round(status.hydration * 10) / 10,
    cleanliness: Math.round(status.cleanliness * 10) / 10,
  };
}

export function deserializeStatus(data: { energy?: number; hydration?: number; cleanliness?: number } | undefined): PlayerStatus {
  if (!data) return createPlayerStatus();
  return {
    energy: data.energy ?? 100,
    hydration: data.hydration ?? 100,
    cleanliness: data.cleanliness ?? 100,
  };
}

// ─── UI Helpers ──────────────────────────────────────────────

/** Get status level label for a 0-100 value */
export function getStatusLabel(value: number): string {
  if (value >= 80) return 'Great';
  if (value >= 60) return 'Good';
  if (value >= 40) return 'Fair';
  if (value >= LOW_THRESHOLD) return 'Low';
  if (value >= CRITICAL_THRESHOLD) return 'Critical';
  return 'Depleted';
}

/** Get CSS color class for status level */
export function getStatusColor(value: number): string {
  if (value >= 60) return '#4caf50';
  if (value >= 40) return '#ffc107';
  if (value >= LOW_THRESHOLD) return '#ff9800';
  return '#f44336';
}

/** Reset tick accumulator (for testing / save-load / new game) */
export function resetTickCounter(): void {
  tickAccumMs = 0;
}
