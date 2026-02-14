/**
 * weather.ts - Dynamic weather system with rain, fog, and clear states.
 * Ties into the day/night cycle and particle system for atmospheric variety.
 * Weather transitions are gradual with interpolated intensity.
 * TODO: DOC - weather system, state machine, rendering effects
 */

import { RENDER_CONFIG } from './config/game.config';

// ─── Types ──────────────────────────────────────────────────

export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';

interface WeatherState {
  type: WeatherType;
  /** Duration in game frames remaining */
  remaining: number;
  /** Transition blend (0 = just started, 1 = fully active) */
  intensity: number;
}

interface Raindrop {
  x: number;
  y: number;
  speed: number;
  length: number;
  opacity: number;
}

interface FogPuff {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  vx: number;
  drift: number;
}

// ─── Config ─────────────────────────────────────────────────

const WEATHER_CONFIG = {
  /** Min/max duration for each weather state (in frames) */
  durations: {
    clear: { min: 3600, max: 7200 },   // 1-2 min
    cloudy: { min: 1800, max: 3600 },   // 30s-1min
    rain: { min: 1200, max: 3600 },     // 20s-1min
    storm: { min: 600, max: 1800 },     // 10-30s
    fog: { min: 1200, max: 2400 },      // 20-40s
  },
  /** Transition speed (how fast intensity ramps 0→1 or 1→0) */
  transitionSpeed: 0.008,
  /** Max raindrops on screen */
  maxRaindrops: 180,
  /** Max fog puffs on screen */
  maxFogPuffs: 12,
  /** Weather transition probabilities from each state */
  transitions: {
    clear:  { clear: 0.4, cloudy: 0.35, rain: 0.1, fog: 0.15, storm: 0 },
    cloudy: { clear: 0.3, cloudy: 0.2, rain: 0.3, fog: 0.15, storm: 0.05 },
    rain:   { clear: 0.15, cloudy: 0.3, rain: 0.25, fog: 0.1, storm: 0.2 },
    storm:  { clear: 0.1, cloudy: 0.35, rain: 0.35, fog: 0.1, storm: 0.1 },
    fog:    { clear: 0.35, cloudy: 0.3, rain: 0.1, fog: 0.2, storm: 0.05 },
  } as Record<WeatherType, Record<WeatherType, number>>,
} as const;

// ─── State ──────────────────────────────────────────────────

let currentWeather: WeatherState = {
  type: 'clear',
  remaining: 4000,
  intensity: 1.0,
};

let nextWeather: WeatherType | null = null;
let transitioning = false;

// Rain particle pool
const raindrops: Raindrop[] = [];

// Fog puff pool
const fogPuffs: FogPuff[] = [];

// Lightning flash state
let lightningFlash = 0; // 0 = none, >0 = frames remaining
let lightningAlpha = 0;

// Simple seeded RNG for weather transitions (deterministic per session)
let weatherSeed = Math.floor(Math.random() * 0x7FFFFFFF);
function weatherRand(): number {
  weatherSeed = (weatherSeed * 1103515245 + 12345) & 0x7FFFFFFF;
  return (weatherSeed >>> 16) / 32768;
}

// ─── Weather State Machine ──────────────────────────────────

function pickNextWeather(): WeatherType {
  const probs = WEATHER_CONFIG.transitions[currentWeather.type];
  const roll = weatherRand();
  let cumulative = 0;
  for (const [type, prob] of Object.entries(probs)) {
    cumulative += prob;
    if (roll <= cumulative) return type as WeatherType;
  }
  return 'clear';
}

function getWeatherDuration(type: WeatherType): number {
  const d = WEATHER_CONFIG.durations[type];
  return d.min + Math.floor(weatherRand() * (d.max - d.min));
}

// ─── Rain Rendering ─────────────────────────────────────────

function spawnRaindrops(intensity: number): void {
  const cw = RENDER_CONFIG.canvasWidth;
  const isStorm = currentWeather.type === 'storm';
  const targetCount = Math.floor((isStorm ? 300 : 200) * intensity);
  const spawnsPerFrame = Math.min(12, targetCount - raindrops.length);

  for (let i = 0; i < spawnsPerFrame && raindrops.length < targetCount; i++) {
    raindrops.push({
      x: weatherRand() * (cw + 100) - 50,
      y: -weatherRand() * 80,
      speed: 10 + weatherRand() * (isStorm ? 12 : 6),
      length: 10 + weatherRand() * (isStorm ? 18 : 10),
      opacity: 0.25 + weatherRand() * (isStorm ? 0.35 : 0.25),
    });
  }
}

function updateAndRenderRain(ctx: CanvasRenderingContext2D, intensity: number): void {
  if (intensity < 0.01) {
    raindrops.length = 0;
    return;
  }

  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;
  const isStorm = currentWeather.type === 'storm';
  const windAngle = isStorm ? 0.15 : 0.05;

  // Spawn new drops
  spawnRaindrops(intensity);

  // Update & render
  ctx.save();
  ctx.lineCap = 'round';

  let writeIdx = 0;
  for (let i = 0; i < raindrops.length; i++) {
    const d = raindrops[i];
    d.y += d.speed;
    d.x += windAngle * d.speed;

    if (d.y > ch + 10) continue; // Dead, skip

    // Keep alive
    raindrops[writeIdx++] = d;

    // Render raindrop as angled line
    ctx.strokeStyle = `rgba(180, 210, 255, ${d.opacity * intensity})`;
    ctx.lineWidth = isStorm ? 2.0 : 1.5;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - windAngle * d.length, d.y - d.length);
    ctx.stroke();
  }
  raindrops.length = writeIdx;

  ctx.restore();

  // Rain darkening overlay
  ctx.save();
  ctx.globalAlpha = intensity * (isStorm ? 0.32 : 0.15);
  ctx.fillStyle = '#0a1520';
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
}

// ─── Lightning ──────────────────────────────────────────────

function updateAndRenderLightning(ctx: CanvasRenderingContext2D, intensity: number): void {
  if (currentWeather.type !== 'storm') {
    lightningFlash = 0;
    return;
  }

  // Random chance of lightning
  if (lightningFlash === 0 && weatherRand() < 0.005 * intensity) {
    lightningFlash = 4 + Math.floor(weatherRand() * 5);
    lightningAlpha = 0.5 + weatherRand() * 0.35;
  }

  if (lightningFlash > 0) {
    const cw = RENDER_CONFIG.canvasWidth;
    const ch = RENDER_CONFIG.canvasHeight;
    ctx.save();
    ctx.globalAlpha = lightningAlpha * (lightningFlash / 6);
    ctx.fillStyle = '#E8E0FF';
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
    lightningFlash--;
  }
}

// ─── Fog Rendering ──────────────────────────────────────────

function spawnFogPuffs(intensity: number): void {
  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;
  const target = Math.floor(WEATHER_CONFIG.maxFogPuffs * intensity);

  while (fogPuffs.length < target) {
    fogPuffs.push({
      x: weatherRand() * cw,
      y: weatherRand() * ch,
      radius: 100 + weatherRand() * 180,
      opacity: 0.12 + weatherRand() * 0.16,
      vx: (weatherRand() - 0.5) * 0.4,
      drift: weatherRand() * Math.PI * 2,
    });
  }
}

function updateAndRenderFog(ctx: CanvasRenderingContext2D, intensity: number): void {
  if (intensity < 0.01) {
    fogPuffs.length = 0;
    return;
  }

  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;

  // Base fog overlay
  ctx.save();
  ctx.globalAlpha = intensity * 0.28;
  ctx.fillStyle = '#D0D0D8';
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();

  // Spawn fog puffs
  spawnFogPuffs(intensity);

  // Update & render puffs
  ctx.save();
  let writeIdx = 0;
  for (let i = 0; i < fogPuffs.length; i++) {
    const p = fogPuffs[i];
    p.x += p.vx;
    p.drift += 0.005;
    p.y += Math.sin(p.drift) * 0.15;

    // Wrap horizontally
    if (p.x < -p.radius) p.x = cw + p.radius;
    if (p.x > cw + p.radius) p.x = -p.radius;

    fogPuffs[writeIdx++] = p;

    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
    grad.addColorStop(0, `rgba(200, 200, 210, ${p.opacity * intensity})`);
    grad.addColorStop(1, 'rgba(200, 200, 210, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
  }
  fogPuffs.length = writeIdx;
  ctx.restore();
}

// ─── Cloud Shadows ──────────────────────────────────────────

let cloudPhase = 0;

function renderCloudShadows(ctx: CanvasRenderingContext2D, intensity: number): void {
  if (intensity < 0.05) return;

  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;
  cloudPhase += 0.002;

  ctx.save();
  ctx.globalAlpha = intensity * 0.14;
  ctx.fillStyle = '#202040';

  // 3 drifting cloud shadow ellipses
  for (let i = 0; i < 3; i++) {
    const cx = (cw * 0.3 * i + cloudPhase * 80 + i * 200) % (cw + 300) - 150;
    const cy = ch * 0.25 + i * ch * 0.2 + Math.sin(cloudPhase + i) * 30;
    const rx = 120 + i * 40;
    const ry = 60 + i * 20;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Update weather state machine and render weather effects.
 * Call after lighting overlay, before UI.
 */
export function updateAndRenderWeather(ctx: CanvasRenderingContext2D): void {
  // Advance state machine
  currentWeather.remaining--;

  if (currentWeather.remaining <= 0 && !transitioning) {
    // Start transitioning to next weather
    nextWeather = pickNextWeather();
    transitioning = true;
  }

  // Handle transitions
  if (transitioning) {
    currentWeather.intensity -= WEATHER_CONFIG.transitionSpeed;
    if (currentWeather.intensity <= 0) {
      // Swap to new weather
      currentWeather = {
        type: nextWeather!,
        remaining: getWeatherDuration(nextWeather!),
        intensity: 0,
      };
      nextWeather = null;
      transitioning = false;
    }
  } else if (currentWeather.intensity < 1.0) {
    currentWeather.intensity = Math.min(1.0, currentWeather.intensity + WEATHER_CONFIG.transitionSpeed);
  }

  const intensity = currentWeather.intensity;

  // Render effects based on current weather
  switch (currentWeather.type) {
    case 'cloudy':
      renderCloudShadows(ctx, intensity);
      break;

    case 'rain':
      renderCloudShadows(ctx, intensity * 0.5);
      updateAndRenderRain(ctx, intensity);
      break;

    case 'storm':
      renderCloudShadows(ctx, intensity * 0.7);
      updateAndRenderRain(ctx, intensity);
      updateAndRenderLightning(ctx, intensity);
      break;

    case 'fog':
      updateAndRenderFog(ctx, intensity);
      break;

    case 'clear':
    default:
      // Clear leftover rain/fog particles gradually
      if (raindrops.length > 0) updateAndRenderRain(ctx, 0);
      if (fogPuffs.length > 0) updateAndRenderFog(ctx, 0);
      break;
  }
}

/** Get current weather type for UI display */
export function getWeatherInfo(): { type: WeatherType; emoji: string; label: string; intensity: number } {
  const emojiMap: Record<WeatherType, string> = {
    clear: '☀️',
    cloudy: '☁️',
    rain: '🌧️',
    storm: '⛈️',
    fog: '🌫️',
  };
  const labelMap: Record<WeatherType, string> = {
    clear: 'Clear',
    cloudy: 'Cloudy',
    rain: 'Rain',
    storm: 'Storm',
    fog: 'Foggy',
  };
  return {
    type: currentWeather.type,
    emoji: emojiMap[currentWeather.type],
    label: labelMap[currentWeather.type],
    intensity: currentWeather.intensity,
  };
}

/** Check if it's raining (for ambient particle modifiers) */
export function isRaining(): boolean {
  return (currentWeather.type === 'rain' || currentWeather.type === 'storm') && currentWeather.intensity > 0.3;
}

/** Check if foggy (for ambient particle modifiers) */
export function isFoggy(): boolean {
  return currentWeather.type === 'fog' && currentWeather.intensity > 0.3;
}

/** Force a specific weather type (for debug). Duration in frames. */
export function setWeather(type: WeatherType, duration?: number): void {
  currentWeather = {
    type,
    remaining: duration ?? getWeatherDuration(type),
    intensity: 1.0,
  };
  transitioning = false;
  nextWeather = null;
  // Clear particles when forcing weather change
  raindrops.length = 0;
  fogPuffs.length = 0;
  lightningFlash = 0;
}

/** Clear all weather particles (e.g. on game load) */
export function clearWeather(): void {
  raindrops.length = 0;
  fogPuffs.length = 0;
  lightningFlash = 0;
}
