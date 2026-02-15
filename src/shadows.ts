/**
 * shadows.ts - Dynamic shadow parameter system driven by time-of-day + weather.
 * Computes shadow direction, length, opacity, and stretch each frame.
 * Shadow params are cached per-frame for fast access from render loop.
 * TODO: DOC - dynamic shadow system, sun tracking, weather modulation
 */

import { getCycleProgress, getCurrentLighting } from './lighting';
import { getWeatherInfo } from './weather';

// ─── Types ──────────────────────────────────────────────────

export interface ShadowParams {
  /** Screen-space shadow offset X per unit of object scale */
  dx: number;
  /** Screen-space shadow offset Y per unit of object scale */
  dy: number;
  /** Rotation angle for the shadow ellipse (radians, screen-space) */
  angle: number;
  /** Final shadow opacity (0–1) */
  opacity: number;
  /** Ellipse stretch multiplier (1.0 = round, 1.5 = elongated) */
  stretch: number;
  /** False when shadows should not be drawn (deep night) */
  enabled: boolean;
}

// ─── Constants ──────────────────────────────────────────────

/** Weather type → shadow opacity multiplier */
const WEATHER_MULT: Record<string, number> = {
  clear:  1.0,
  cloudy: 0.50,
  rain:   0.25,
  storm:  0.15,
  fog:    0.10,
};

/** Day cycle phase boundaries (must match lighting.ts PHASES) */
const SUN_PEAK = 0.35;   // midday (sun at zenith)
const SUN_SET  = 0.73;   // evening (sun below horizon)

/** Shadow direction keyframes (screen-space angle in radians, 0 = right) */
const DAWN_ANGLE = Math.PI + 0.6;   // ≈ 206° → shadow toward lower-left
const MID_ANGLE  = Math.PI / 2 + 0.15; // ≈ 99° → shadow mostly downward, slight SE
const DUSK_ANGLE = -0.1;             // ≈ -6° → shadow toward right

// ─── Cache ──────────────────────────────────────────────────

let _cached: ShadowParams | null = null;
let _cachedFrame = -1;

// ─── Helpers ────────────────────────────────────────────────

/** Hermite smoothstep for buttery transitions */
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Get dynamic shadow parameters for the current frame.
 * Results are cached per unique frame number – safe to call from hot render loops.
 */
export function getShadowParams(frame: number): ShadowParams {
  if (_cachedFrame === frame && _cached) return _cached;

  const t = getCycleProgress(); // 0..1 day cycle
  const lighting = getCurrentLighting();
  const weather = getWeatherInfo();

  // ─── Sun up? ─────────────────────────────────────────────
  if (t >= SUN_SET) {
    // Night – no directional shadows
    _cached = { dx: 0, dy: 0, angle: 0, opacity: 0, stretch: 1, enabled: false };
    _cachedFrame = frame;
    return _cached;
  }

  // ─── Sun elevation (0 = horizon, 1 = zenith) ────────────
  let elevation: number;
  if (t < SUN_PEAK) {
    elevation = t / SUN_PEAK;
  } else {
    elevation = 1.0 - (t - SUN_PEAK) / (SUN_SET - SUN_PEAK);
  }
  elevation = Math.max(0, Math.min(1, elevation));

  // Very low elevation → shadows too long, clamp
  if (elevation < 0.05) {
    _cached = { dx: 0, dy: 0, angle: 0, opacity: 0, stretch: 1, enabled: false };
    _cachedFrame = frame;
    return _cached;
  }

  // ─── Shadow direction angle ─────────────────────────────
  // Sweeps dawn → midday → dusk using smoothstep interpolation
  const sunProgress = t / SUN_SET; // 0..1 over the sunlit portion of the day
  let shadowAngle: number;
  if (sunProgress < 0.5) {
    const p = smoothstep(sunProgress * 2);
    shadowAngle = DAWN_ANGLE + (MID_ANGLE - DAWN_ANGLE) * p;
  } else {
    const p = smoothstep((sunProgress - 0.5) * 2);
    shadowAngle = MID_ANGLE + (DUSK_ANGLE - MID_ANGLE) * p;
  }

  // ─── Shadow length ──────────────────────────────────────
  // Long at dawn/dusk, short at midday
  const length = 0.4 + (1.0 - elevation) * 1.6; // 0.4 → 2.0

  // Offset distance in pixels (at scale = 1)
  const baseDist = 14;
  const dist = baseDist * length;
  const dx = Math.cos(shadowAngle) * dist;
  const dy = Math.sin(shadowAngle) * dist * 0.6; // iso Y-squish

  // ─── Ellipse stretch ────────────────────────────────────
  const stretch = 1.0 + (length - 0.4) * 0.25; // 1.0 → 1.4

  // ─── Opacity ────────────────────────────────────────────
  const weatherMult = WEATHER_MULT[weather.type] ?? 1.0;
  const brightMult = Math.min(1.0, Math.max(0, lighting.brightness * 1.3));
  const elevMult = 0.3 + elevation * 0.7; // dimmer near horizon
  const opacity = Math.max(0, Math.min(0.55, 0.45 * brightMult * weatherMult * elevMult));

  _cached = {
    dx, dy,
    angle: shadowAngle,
    opacity,
    stretch,
    enabled: opacity > 0.02,
  };
  _cachedFrame = frame;
  return _cached;
}

/**
 * Force cache invalidation (e.g., after time-of-day jump).
 */
export function invalidateShadowCache(): void {
  _cachedFrame = -1;
  _cached = null;
}

/**
 * Debug: return human-readable shadow state for overlay display.
 */
export function getShadowDebugInfo(): string {
  if (!_cached || !_cached.enabled) return 'shadows: off (night)';
  const deg = Math.round((_cached.angle * 180) / Math.PI);
  const op = Math.round(_cached.opacity * 100);
  const st = _cached.stretch.toFixed(2);
  return `shadow: ${deg}° op:${op}% str:${st}`;
}
