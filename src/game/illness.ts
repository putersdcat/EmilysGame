/**
 * illness.ts — Diarrhea illness subsystem (#133).
 *
 * B5 micro-slice 11.2 (#268): extracted from main.ts. The diarrhea illness
 * chain is triggered by drinking from streams (unclean water source). The
 * subsystem tracks drink count, rolls for illness on each drink after a
 * threshold, and manages the acute event (control lock + speed debuff + VFX).
 *
 * This micro-slice extracts:
 *   - DIARRHEA_CONFIG — illness parameters
 *   - DiarrheaState — the state fields on GameState
 *   - createInitialDiarrheaState() — factory for the initial state
 *
 * Future micro-slices will extract:
 *   - rollDiarrhea(state) — the probability check + trigger logic
 *   - tickDiarrhea(state) — per-frame lock/debuff expiry
 *   - resetDiarrhea(state) — used by resetGameState
 *
 * @see issue #133 — Diarrhea illness chain
 */

// ─── Diarrhea Illness Config (#133) ─────────────────────────

/**
 * Diarrhea illness parameters. All frame counts are at 60fps.
 * Exported as `as const` so callers get the literal types.
 */
export const DIARRHEA_CONFIG = {
  /** Min drinks before risk starts */
  DRINK_THRESHOLD: 3,
  /** 20% per drink after threshold */
  BASE_CHANCE: 0.20,
  /** 100% chance at this many drinks */
  GUARANTEED_AT: 6,
  /** ~25s at 60fps: player can't move during acute event */
  LOCK_DURATION_FRAMES: 1500,
  /** ~30s speed debuff after lock ends */
  DEBUFF_DURATION_FRAMES: 1800,
  /** Speed multiplier during non-locked diarrhea */
  SPEED_DEBUFF: 0.7,
  /** 60s cooldown between events */
  COOLDOWN_FRAMES: 3600,
  /** 60s poop marker persistence */
  MARKER_DURATION_FRAMES: 3600,
  /** Poop VFX particle count */
  PARTICLE_COUNT: 18,
} as const;

// ─── Diarrhea State (part of GameState) ──────────────────────

/**
 * The diarrhea-related fields on GameState. Kept as a separate interface
 * so it can be composed into GameState and so the illness subsystem owns
 * its own state shape.
 */
export interface DiarrheaState {
  /** How many times the player has drunk from a stream this session */
  streamDrinkCount: number;
  /** frameCount when speed-debuff ends (0 = inactive) */
  diarrheaUntil: number;
  /** true = control locked during acute event */
  diarrheaLocked: boolean;
  /** frameCount when lock ends */
  diarrheaLockUntil: number;
  /** frameCount of last trigger (cooldown) */
  diarrheaLastTrigger: number;
  /** Poop markers placed during illness events (for VFX) */
  poopMarkers: { x: number; y: number; placedAt: number }[];
}

/**
 * Create the initial diarrhea state. Called from the GameState factory.
 * Exported here so the illness subsystem owns its own initialization.
 */
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

// ─── Diarrhea Logic (to be extracted in a future micro-slice) ──
//
// The actual roll/tick logic is still in main.ts because it touches many
// cross-cutting concerns (state.frameCount, state.player, state.sfx,
// state.ui, state.expressionOverride, setDiarrheaOverlay, etc.).
// Extracting it cleanly requires the GameState factory extraction first
// (B5.4) so we can pass a single `state` object to the illness functions.
//
// Planned micro-slice: B5.2.1 — extract rollDiarrhea(state) and
// tickDiarrhea(state) once GameState factory is in place.
