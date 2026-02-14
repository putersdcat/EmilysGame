/**
 * local-lights.ts - Local lighting system for bonfires, player flashlight, and other point/cone lights.
 * Renders bright radial/cone gradients using 'screen' composite mode to punch through
 * the global ambient darkness from lighting.ts.
 * TODO: DOC - local light sources, bonfire flicker, flashlight cone
 */

import { RENDER_CONFIG } from './config/game.config';
import { getCycleProgress, getCurrentLighting } from './lighting';

// ─── Types ──────────────────────────────────────────────────

export interface PointLight {
  /** World grid X */
  wx: number;
  /** World grid Y */
  wy: number;
  /** Base radius in pixels at screen space */
  radius: number;
  /** RGB color triplet [0-255] */
  color: [number, number, number];
  /** Base intensity 0-1 */
  intensity: number;
  /** Animate flicker? */
  flicker: boolean;
  /** Phase offset for flicker desync */
  flickerPhase: number;
}

export interface ConeLight {
  /** World grid X */
  wx: number;
  /** World grid Y */
  wy: number;
  /** Direction angle in radians */
  angle: number;
  /** Spread angle in radians (total cone width) */
  spread: number;
  /** Reach in pixels */
  reach: number;
  /** RGB color triplet */
  color: [number, number, number];
  /** Base intensity 0-1 */
  intensity: number;
}

export interface Camera {
  x: number;
  y: number;
}

// ─── Config ─────────────────────────────────────────────────

const LIGHT_CONFIG = {
  /** How much local lights scale based on time of day (0=full dark=>bright, 1=noon=>dim) */
  nightBoost: 0.9,   // Max additional brightness at night
  dayBaseline: 0.05,  // Minimal glow visible even during day
  /** Flicker frequency/amplitude */
  flickerSpeed: 0.12,
  flickerAmplitude: 0.15,
  /** Bonfire defaults */
  bonfireRadius: 110,    // pixel radius of light
  bonfireColor: [255, 180, 60] as [number, number, number],
  bonfireIntensity: 0.85,
  /** Flashlight defaults */
  flashlightReach: 220,
  flashlightSpread: Math.PI * 0.45,  // ~81 degree cone
  flashlightColor: [240, 235, 200] as [number, number, number],
  flashlightIntensity: 0.95,
} as const;

// ─── State ──────────────────────────────────────────────────

let pointLights: PointLight[] = [];
let coneLights: ConeLight[] = [];
let flashlightEnabled = false;
let frameCounter = 0;

// Offscreen lightmap canvas for compositing
let lightmap: OffscreenCanvas | null = null;

function ensureLightmap(): void {
  const w = RENDER_CONFIG.canvasWidth;
  const h = RENDER_CONFIG.canvasHeight;
  if (!lightmap || lightmap.width !== w || lightmap.height !== h) {
    lightmap = new OffscreenCanvas(w, h);
  }
}

// ─── Coordinate Conversion ──────────────────────────────────

function worldToScreen(wx: number, wy: number, cam: Camera): { x: number; y: number } {
  const tw = RENDER_CONFIG.tileWidth;
  const th = RENDER_CONFIG.tileHeight;
  const rx = wx - cam.x;
  const ry = wy - cam.y;
  return {
    x: (rx - ry) * (tw / 2) + RENDER_CONFIG.canvasWidth / 2,
    y: (rx + ry) * (th / 2) + RENDER_CONFIG.canvasHeight / 3,
  };
}

// ─── Time-of-Day Scaling ────────────────────────────────────

/** Returns 0-1 multiplier for how bright local lights should be based on time of day.
 * At night = LIGHT_CONFIG.nightBoost, at noon = LIGHT_CONFIG.dayBaseline */
function getTimeMultiplier(): number {
  const t = getCycleProgress();
  // Approximate brightness curve: day phases (0.15-0.55) are bright, night (0.80-0.92) is dark
  // Map to a darkness factor where 0=full day, 1=full night
  let darkness: number;
  if (t >= 0.15 && t <= 0.55) {
    darkness = 0;  // Full day
  } else if (t >= 0.80 || t <= 0.08) {
    darkness = 1;  // Full night
  } else if (t > 0.55 && t < 0.80) {
    // Dusk transition
    darkness = (t - 0.55) / 0.25;
  } else {
    // Dawn transition (0.08 to 0.15)
    darkness = 1 - (t - 0.08) / 0.07;
  }
  return LIGHT_CONFIG.dayBaseline + darkness * LIGHT_CONFIG.nightBoost;
}

// ─── Flicker ────────────────────────────────────────────────

function getFlickerMultiplier(phase: number): number {
  const t = frameCounter * LIGHT_CONFIG.flickerSpeed + phase;
  // Multi-frequency flicker for natural campfire look
  return 1 - LIGHT_CONFIG.flickerAmplitude * (
    0.5 * Math.sin(t) +
    0.3 * Math.sin(t * 2.7 + 1.3) +
    0.2 * Math.sin(t * 4.1 + 2.9)
  );
}

// ─── Rendering ──────────────────────────────────────────────

/** Draw point light holes into the lightmap using destination-out */
function punchPointLights(lctx: OffscreenCanvasRenderingContext2D, cam: Camera, timeMul: number): void {
  lctx.globalCompositeOperation = 'destination-out';

  for (let i = 0; i < pointLights.length; i++) {
    const light = pointLights[i];
    const { x: sx, y: sy } = worldToScreen(light.wx, light.wy, cam);

    // Skip if offscreen
    const r = light.radius * 1.5;
    if (sx < -r || sx > RENDER_CONFIG.canvasWidth + r ||
        sy < -r || sy > RENDER_CONFIG.canvasHeight + r) continue;

    const flicker = light.flicker ? getFlickerMultiplier(light.flickerPhase) : 1;
    const alpha = light.intensity * timeMul * flicker;
    if (alpha < 0.01) continue;

    const radius = light.radius * (0.9 + flicker * 0.1);

    // Radial gradient that erases darkness (destination-out)
    const grad = lctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
    grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    grad.addColorStop(0.3, `rgba(255, 255, 255, ${alpha * 0.7})`);
    grad.addColorStop(0.6, `rgba(255, 255, 255, ${alpha * 0.35})`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    lctx.fillStyle = grad;
    lctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
  }
}

/** Draw cone light holes into the lightmap using destination-out */
function punchConeLights(lctx: OffscreenCanvasRenderingContext2D, cam: Camera, timeMul: number): void {
  lctx.globalCompositeOperation = 'destination-out';

  for (let i = 0; i < coneLights.length; i++) {
    const light = coneLights[i];
    const { x: sx, y: sy } = worldToScreen(light.wx, light.wy, cam);

    const alpha = light.intensity * timeMul;
    if (alpha < 0.01) continue;

    const reach = light.reach;

    lctx.save();
    lctx.translate(sx, sy);
    lctx.rotate(light.angle);

    // Clip to cone shape
    lctx.beginPath();
    lctx.moveTo(0, 0);
    lctx.arc(0, 0, reach, -light.spread / 2, light.spread / 2);
    lctx.closePath();
    lctx.clip();

    // Radial gradient that erases darkness within cone
    const grad = lctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    grad.addColorStop(0.4, `rgba(255, 255, 255, ${alpha * 0.6})`);
    grad.addColorStop(0.7, `rgba(255, 255, 255, ${alpha * 0.25})`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    lctx.fillStyle = grad;
    lctx.fillRect(-reach, -reach, reach * 2, reach * 2);

    lctx.restore();
  }
}

/** After punching holes, add warm color tint where lights are (on source-over) */
function tintPointLights(ctx: CanvasRenderingContext2D, cam: Camera, timeMul: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < pointLights.length; i++) {
    const light = pointLights[i];
    const { x: sx, y: sy } = worldToScreen(light.wx, light.wy, cam);
    const r = light.radius * 1.5;
    if (sx < -r || sx > RENDER_CONFIG.canvasWidth + r ||
        sy < -r || sy > RENDER_CONFIG.canvasHeight + r) continue;
    const flicker = light.flicker ? getFlickerMultiplier(light.flickerPhase) : 1;
    const alpha = light.intensity * timeMul * flicker * 0.25; // Subtle warm tint
    if (alpha < 0.01) continue;
    const radius = light.radius * 0.6;
    const [cr, cg, cb] = light.color;
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
    grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${alpha})`);
    grad.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.4})`);
    grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
  }
  ctx.restore();
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Clear all registered lights. Call at start of each frame before re-registering.
 */
export function clearLights(): void {
  pointLights.length = 0;
  coneLights.length = 0;
}

/**
 * Register a point light source (bonfire, torch, etc.)
 */
export function addPointLight(wx: number, wy: number, options?: Partial<PointLight>): void {
  pointLights.push({
    wx,
    wy,
    radius: options?.radius ?? LIGHT_CONFIG.bonfireRadius,
    color: options?.color ?? [...LIGHT_CONFIG.bonfireColor],
    intensity: options?.intensity ?? LIGHT_CONFIG.bonfireIntensity,
    flicker: options?.flicker ?? true,
    flickerPhase: options?.flickerPhase ?? (wx * 13.7 + wy * 29.3), // Deterministic per position
  });
}

/**
 * Register the player flashlight cone.
 */
export function addFlashlight(wx: number, wy: number, facingDx: number, facingDy: number): void {
  if (!flashlightEnabled) return;

  // Convert facing direction to angle for isometric space
  // In iso: right = (-45deg), down-right = (0deg), down = (45deg), etc.
  // facingDx/facingDy are grid directions: (1,0)=right, (0,1)=down, etc.
  const isoAngle = Math.atan2(facingDx + facingDy, facingDx - facingDy);

  coneLights.push({
    wx,
    wy,
    angle: isoAngle,
    spread: LIGHT_CONFIG.flashlightSpread,
    reach: LIGHT_CONFIG.flashlightReach,
    color: [...LIGHT_CONFIG.flashlightColor],
    intensity: LIGHT_CONFIG.flashlightIntensity,
  });

  // Also add a small ambient glow at the player's feet (flashlight spill)
  pointLights.push({
    wx,
    wy,
    radius: 50,
    color: [...LIGHT_CONFIG.flashlightColor],
    intensity: 0.35,
    flicker: false,
    flickerPhase: 0,
  });
}

/** After multiply darken, restore brightness where lights are using additive blend */
function brightenPointLights(ctx: CanvasRenderingContext2D, cam: Camera, timeMul: number, darkenCompensation: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;
  for (let i = 0; i < pointLights.length; i++) {
    const light = pointLights[i];
    const { x: sx, y: sy } = worldToScreen(light.wx, light.wy, cam);
    const r = light.radius * 1.5;
    if (sx < -r || sx > cw + r || sy < -r || sy > ch + r) continue;
    const flicker = light.flicker ? getFlickerMultiplier(light.flickerPhase) : 1;
    const alpha = light.intensity * timeMul * flicker * darkenCompensation;
    if (alpha < 0.01) continue;
    const radius = light.radius * (0.9 + flicker * 0.1);
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
    grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    grad.addColorStop(0.3, `rgba(255, 255, 255, ${alpha * 0.6})`);
    grad.addColorStop(0.6, `rgba(255, 255, 255, ${alpha * 0.2})`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
  }
  ctx.restore();
}

/** After multiply darken, restore brightness where cone lights are using additive blend */
function brightenConeLights(ctx: CanvasRenderingContext2D, cam: Camera, timeMul: number, darkenCompensation: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < coneLights.length; i++) {
    const light = coneLights[i];
    const { x: sx, y: sy } = worldToScreen(light.wx, light.wy, cam);
    const alpha = light.intensity * timeMul * darkenCompensation;
    if (alpha < 0.01) continue;
    const reach = light.reach;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(light.angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, reach, -light.spread / 2, light.spread / 2);
    ctx.closePath();
    ctx.clip();

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    grad.addColorStop(0.4, `rgba(255, 255, 255, ${alpha * 0.5})`);
    grad.addColorStop(0.7, `rgba(255, 255, 255, ${alpha * 0.15})`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Render all registered lights using a multi-pass approach:
 * Pass 1: Multiply-darken the entire main canvas (replicating lighting.ts effect).
 * Pass 2: Additive brighten at light positions (counteracts multiply where lights shine).
 * Pass 3: Color tint lightmap with holes punched for lights (adds blue at night, except lights).
 * Pass 4: Warm color tint on bonfires (subtle amber glow).
 */
export function renderLocalLights(ctx: CanvasRenderingContext2D, cam: Camera): void {
  frameCounter++;
  const timeMul = getTimeMultiplier();
  const hasLights = pointLights.length > 0 || coneLights.length > 0;

  if (timeMul < 0.01 && !hasLights) return;

  // Get current darkness values from the lighting system
  const light = getCurrentLighting();
  if (light.alpha < 0.005 && light.brightness >= 0.95 && !hasLights) return;

  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;
  const darkenAlpha = light.brightness < 0.95 ? (1 - light.brightness) * 0.6 : 0;

  // ── Pass 1: Multiply darken pass (directly on main canvas) ──
  if (darkenAlpha > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const bv = Math.round(light.brightness * 255);
    ctx.fillStyle = `rgb(${bv}, ${bv}, ${Math.min(255, bv + 15)})`;
    ctx.globalAlpha = darkenAlpha;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  }

  // ── Pass 2: Additive brighten at light positions (undo multiply where lights exist) ──
  if (hasLights && darkenAlpha > 0.01) {
    // Compensation: how much brightness to add back. Slightly less than darken amount for soft glow.
    const compensation = darkenAlpha * 0.85;
    brightenPointLights(ctx, cam, timeMul, compensation);
    brightenConeLights(ctx, cam, timeMul, compensation);
  }

  // ── Pass 3: Color tint lightmap with holes punched for lights ──
  if (light.alpha >= 0.005 || hasLights) {
    ensureLightmap();
    const lctx = lightmap!.getContext('2d')!;

    // Fill lightmap with color tint
    lctx.clearRect(0, 0, cw, ch);
    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = 1;

    if (light.alpha >= 0.005) {
      lctx.fillStyle = `rgba(${Math.round(light.r)}, ${Math.round(light.g)}, ${Math.round(light.b)}, ${light.alpha})`;
      lctx.fillRect(0, 0, cw, ch);
    }

    // Punch light holes in the tint
    if (hasLights) {
      punchPointLights(lctx, cam, timeMul);
      punchConeLights(lctx, cam, timeMul);
    }

    // Composite tint-with-holes onto main canvas
    ctx.drawImage(lightmap!, 0, 0);
  }

  // ── Pass 4: Warm color tint from bonfires (subtle screen overlay) ──
  if (pointLights.length > 0) {
    tintPointLights(ctx, cam, timeMul);
  }
}

/**
 * Toggle the player flashlight on/off.
 */
export function toggleFlashlight(): void {
  flashlightEnabled = !flashlightEnabled;
}

/**
 * Check if flashlight is enabled.
 */
export function isFlashlightOn(): boolean {
  return flashlightEnabled;
}

/**
 * Get bonfire light config for world gen to use.
 */
export function getBonfireConfig() {
  return {
    radius: LIGHT_CONFIG.bonfireRadius,
    color: LIGHT_CONFIG.bonfireColor,
    intensity: LIGHT_CONFIG.bonfireIntensity,
  };
}

// Remove unused lightmap reference (kept for potential future shadow mapping)
void ensureLightmap;
