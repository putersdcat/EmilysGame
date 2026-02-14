/**
 * lighting.ts - Day/night cycle and ambient lighting overlay.
 * Applies a color-graded overlay to the entire scene based on game time.
 * Cycles through: dawn → day → dusk → night with smooth interpolation.
 * TODO: DOC - lighting system, color grading, time cycle
 */

import { RENDER_CONFIG } from './config/game.config';

// ─── Config ─────────────────────────────────────────────────

/** Total cycle length in game frames (~60fps). 
 *  7200 frames ≈ 2 minutes per full day at 60fps.
 *  Players see meaningful light changes every ~30s. */
const CYCLE_LENGTH = 7200;

/** Time-of-day phases as fractions of the cycle [0..1] */
const PHASES = {
  dawn:     0.0,   // 0%   — sunrise begins
  morning:  0.08,  // 8%   — bright morning
  day:      0.15,  // 15%  — full daylight  
  afternoon:0.55,  // 55%  — afternoon
  dusk:     0.65,  // 65%  — sunset begins
  evening:  0.73,  // 73%  — deep dusk
  night:    0.80,  // 80%  — full night
  lateNight:0.92,  // 92%  — approaching dawn
} as const;

/** Color stop: what the overlay looks like at a given phase */
interface LightingStop {
  r: number; g: number; b: number;
  alpha: number;
  brightness: number;  // 0-1, multiplied into overlay
}

/** Lighting colors at each phase boundary */
const STOPS: { phase: number; light: LightingStop }[] = [
  { phase: PHASES.dawn,      light: { r: 255, g: 160, b: 80,  alpha: 0.15, brightness: 0.85 } },
  { phase: PHASES.morning,   light: { r: 255, g: 220, b: 150, alpha: 0.06, brightness: 0.95 } },
  { phase: PHASES.day,       light: { r: 255, g: 255, b: 240, alpha: 0.0,  brightness: 1.0  } },
  { phase: PHASES.afternoon, light: { r: 255, g: 240, b: 200, alpha: 0.03, brightness: 0.97 } },
  { phase: PHASES.dusk,      light: { r: 255, g: 130, b: 60,  alpha: 0.18, brightness: 0.80 } },
  { phase: PHASES.evening,   light: { r: 80,  g: 60,  b: 140, alpha: 0.25, brightness: 0.65 } },
  { phase: PHASES.night,     light: { r: 20,  g: 20,  b: 60,  alpha: 0.40, brightness: 0.45 } },
  { phase: PHASES.lateNight,  light: { r: 30,  g: 30,  b: 80,  alpha: 0.35, brightness: 0.50 } },
];

// ─── State ──────────────────────────────────────────────────

let gameTime = Math.floor(CYCLE_LENGTH * 0.17); // Start at early day (not midnight)
let enabled = true;

// ─── Interpolation ──────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function getLightingForTime(t: number): LightingStop {
  // t is 0..1 representing position in the day cycle
  // Find surrounding stops
  let prev = STOPS[STOPS.length - 1];
  let next = STOPS[0];

  for (let i = 0; i < STOPS.length; i++) {
    if (STOPS[i].phase > t) {
      next = STOPS[i];
      prev = STOPS[(i - 1 + STOPS.length) % STOPS.length];
      break;
    }
    if (i === STOPS.length - 1) {
      // t is past the last stop, wrapping to first
      prev = STOPS[i];
      next = STOPS[0];
    }
  }

  // Calculate interpolation factor between prev and next
  let range = next.phase - prev.phase;
  if (range <= 0) range += 1.0; // Handle wraparound
  let local = t - prev.phase;
  if (local < 0) local += 1.0;
  const factor = Math.min(1, Math.max(0, local / range));

  // Smooth step for nicer transitions
  const smooth = factor * factor * (3 - 2 * factor);

  return {
    r: lerp(prev.light.r, next.light.r, smooth),
    g: lerp(prev.light.g, next.light.g, smooth),
    b: lerp(prev.light.b, next.light.b, smooth),
    alpha: lerp(prev.light.alpha, next.light.alpha, smooth),
    brightness: lerp(prev.light.brightness, next.light.brightness, smooth),
  };
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Advance game time by one frame and apply lighting overlay to canvas.
 * Call after scene render, before UI overlay.
 */
export function updateAndRenderLighting(ctx: CanvasRenderingContext2D): void {
  if (!enabled) return;

  tickLighting(); // Advance clock
  const t = gameTime / CYCLE_LENGTH;
  const light = getLightingForTime(t);

  if (light.alpha < 0.005) return; // Skip rendering at full daylight

  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;

  ctx.save();

  // Darken layer (simulate reduced light at night)
  if (light.brightness < 0.95) {
    const darkenAlpha = (1 - light.brightness) * 0.6;
    ctx.globalCompositeOperation = 'multiply';
    const bv = Math.round(light.brightness * 255);
    ctx.fillStyle = `rgb(${bv}, ${bv}, ${Math.min(255, bv + 15)})`;
    ctx.globalAlpha = darkenAlpha;
    ctx.fillRect(0, 0, cw, ch);
  }

  // Color tint layer
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = light.alpha;
  ctx.fillStyle = `rgb(${Math.round(light.r)}, ${Math.round(light.g)}, ${Math.round(light.b)})`;
  ctx.fillRect(0, 0, cw, ch);

  ctx.restore();
}

/** Advance the lighting clock by one frame. Called separately when local-lights handles rendering. */
export function tickLighting(): void {
  gameTime = (gameTime + 1) % CYCLE_LENGTH;
}

/** Get current time-of-day name for UI display */
export function getTimeOfDay(): string {
  const t = gameTime / CYCLE_LENGTH;
  if (t < PHASES.morning) return '🌅 Dawn';
  if (t < PHASES.day) return '🌤️ Morning';
  if (t < PHASES.afternoon) return '☀️ Day';
  if (t < PHASES.dusk) return '🌤️ Afternoon';
  if (t < PHASES.evening) return '🌅 Dusk';
  if (t < PHASES.night) return '🌆 Evening';
  if (t < PHASES.lateNight) return '🌙 Night';
  return '🌙 Late Night';
}

/** Get cycle progress (0..1) for debug/UI */
export function getCycleProgress(): number {
  return gameTime / CYCLE_LENGTH;
}

/** Toggle day/night cycle on/off */
export function toggleLighting(): void {
  enabled = !enabled;
}

/** Check if lighting is enabled */
export function isLightingEnabled(): boolean {
  return enabled;
}

/** Reset cycle to a specific time (0..1) */
export function setTimeOfDay(t: number): void {
  gameTime = Math.floor((t % 1.0) * CYCLE_LENGTH);
}

/** Get the current lighting overlay values for external use (local-lights integration). */
export function getCurrentLighting(): { r: number; g: number; b: number; alpha: number; brightness: number } {
  const t = gameTime / CYCLE_LENGTH;
  return getLightingForTime(t);
}
