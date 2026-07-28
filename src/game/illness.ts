/**
 * illness.ts — Diarrhea illness subsystem (#133).
 *
 * Triggered by drinking from streams (unclean water). Tracks drink count,
 * rolls for illness after a threshold, and manages the acute event
 * (control lock + speed debuff + VFX).
 *
 * **Time base:** durations are real milliseconds (not frame counts). After
 * the render loop could run at 2–500fps, frame-count locks either froze the
 * player for many minutes or expired instantly. All timers compare against
 * `performance.now()` (or tick remaining ms with dtMs).
 *
 * @see issue #133 — Diarrhea illness chain
 */

// ─── Diarrhea Illness Config (#133) ─────────────────────────

export const DIARRHEA_CONFIG = {
  /** Min drinks before risk starts */
  DRINK_THRESHOLD: 3,
  /** 20% per drink after threshold */
  BASE_CHANCE: 0.20,
  /** 100% chance at this many drinks */
  GUARANTEED_AT: 6,
  /** Player can't move during acute event */
  LOCK_DURATION_MS: 25_000,
  /** Speed debuff after lock ends */
  DEBUFF_DURATION_MS: 30_000,
  /** Speed multiplier during non-locked diarrhea */
  SPEED_DEBUFF: 0.7,
  /** Cooldown between events */
  COOLDOWN_MS: 60_000,
  /** Poop marker persistence */
  MARKER_DURATION_MS: 60_000,
  /** Poop VFX particle count */
  PARTICLE_COUNT: 18,

  // ── Deprecated frame aliases (60fps-era). Prefer *_MS above. ──
  /** @deprecated use LOCK_DURATION_MS */
  LOCK_DURATION_FRAMES: 1500,
  /** @deprecated use DEBUFF_DURATION_MS */
  DEBUFF_DURATION_FRAMES: 1800,
  /** @deprecated use COOLDOWN_MS */
  COOLDOWN_FRAMES: 3600,
  /** @deprecated use MARKER_DURATION_MS */
  MARKER_DURATION_FRAMES: 3600,
} as const;

// ─── Diarrhea State ─────────────────────────────────────────

/**
 * Diarrhea fields on GameState.
 * Lock/debuff/cooldown timestamps are `performance.now()` deadlines (ms).
 * Marker `placedAt` is also a performance.now() timestamp.
 */
export interface DiarrheaState {
  streamDrinkCount: number;
  /** performance.now() when speed-debuff ends (0 = inactive) */
  diarrheaUntil: number;
  /** true = control locked during acute event */
  diarrheaLocked: boolean;
  /** performance.now() when lock ends */
  diarrheaLockUntil: number;
  /** performance.now() of last trigger (cooldown) */
  diarrheaLastTrigger: number;
  /** Poop markers — placedAt is performance.now() */
  poopMarkers: { x: number; y: number; placedAt: number }[];
}

export function createInitialDiarrheaState(): DiarrheaState {
  return {
    streamDrinkCount: 0,
    diarrheaUntil: 0,
    diarrheaLocked: false,
    diarrheaLockUntil: 0,
    diarrheaLastTrigger: 0,
    poopMarkers: [],
  };
}

/** True if still inside the post-lock speed debuff window. */
export function isDiarrheaDebuffActive(state: DiarrheaState, nowMs: number = performance.now()): boolean {
  return state.diarrheaUntil > nowMs;
}

/** True if acute lock should still absorb input. */
export function isDiarrheaLockActive(state: DiarrheaState, nowMs: number = performance.now()): boolean {
  return state.diarrheaLocked && nowMs < state.diarrheaLockUntil;
}

/** Trigger acute illness (caller handles toasts/VFX/SFX). */
export function triggerDiarrheaEvent(state: DiarrheaState, playerX: number, playerY: number): void {
  const now = performance.now();
  state.diarrheaLocked = true;
  state.diarrheaLockUntil = now + DIARRHEA_CONFIG.LOCK_DURATION_MS;
  state.diarrheaUntil = now + DIARRHEA_CONFIG.LOCK_DURATION_MS + DIARRHEA_CONFIG.DEBUFF_DURATION_MS;
  state.diarrheaLastTrigger = now;
  state.poopMarkers.push({
    x: Math.round(playerX),
    y: Math.round(playerY),
    placedAt: now,
  });
}

/** Whether cooldown allows another roll. */
export function isDiarrheaOffCooldown(state: DiarrheaState, nowMs: number = performance.now()): boolean {
  if (state.diarrheaLastTrigger <= 0) return true;
  return (nowMs - state.diarrheaLastTrigger) >= DIARRHEA_CONFIG.COOLDOWN_MS;
}
