/**
 * biome-transition-overlays.ts — D.8 continuous biome transition wash.
 *
 * Draws low-frequency moisture/elevation driven overlays onto cached terrain so
 * grass→mud(dirt)→sand→stone changes read as gradual biome transitions instead
 * of one-cell hard switches.
 */

import { ASSET_DEFS } from '../config/assets.config';
import { BIOME_TRANSITION_RULES, type BiomeTransitionSurface } from '../config/biomes.config';
import { RENDER_CONFIG, WORLD_CONFIG } from '../config/game.config';
import type { ChunkData } from '../types/game.types';

const SIZE = WORLD_CONFIG.chunkSize;
const TW = RENDER_CONFIG.tileWidth;
const TH = RENDER_CONFIG.tileHeight;
const HALF_TW = TW / 2;
const HALF_TH = TH / 2;

const ELEVATION_SCALE = 0.048;
const MOISTURE_SCALE = 0.056;
const TRANSITION_MIN_ALPHA = 0.025;

const SURFACE_RANK: Record<BiomeTransitionSurface, number> = {
  grass: 0,
  dirt: 1,
  sand: 2,
  stone_floor: 3,
};

export interface BiomeTransitionSample {
  readonly moisture: number;
  readonly elevation: number;
  readonly surface: BiomeTransitionSurface;
  readonly alpha: number;
}

export interface BiomeTransitionOverlayParams {
  readonly startCX: number;
  readonly startCY: number;
  readonly endCX: number;
  readonly endCY: number;
  readonly originX: number;
  readonly originY: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash01(ix: number, iy: number, salt: number): number {
  let h = Math.imul(ix + salt * 17, 374761393) ^ Math.imul(iy + salt * 31, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function valueNoise(x: number, y: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = smoothstep(0, 1, fx);
  const sy = smoothstep(0, 1, fy);

  const a = hash01(ix, iy, salt);
  const b = hash01(ix + 1, iy, salt);
  const c = hash01(ix, iy + 1, salt);
  const d = hash01(ix + 1, iy + 1, salt);
  const ab = a + (b - a) * sx;
  const cd = c + (d - c) * sx;
  return ab + (cd - ab) * sy;
}

function fbm(x: number, y: number, salt: number): number {
  return valueNoise(x, y, salt) * 0.55
    + valueNoise(x * 2.03 + 17.1, y * 2.03 - 9.7, salt + 31) * 0.30
    + valueNoise(x * 4.07 - 21.9, y * 4.07 + 13.4, salt + 73) * 0.15;
}

function rangeWeight(v: number, min: number, max: number): number {
  if (min <= 0) return 1 - smoothstep(Math.max(0, max - 0.20), max, v);
  if (max >= 1) return smoothstep(min, Math.min(1, min + 0.20), v);
  const center = (min + max) * 0.5;
  const half = Math.max(0.0001, (max - min) * 0.5);
  const dist = Math.abs(v - center) / half;
  return dist >= 1 ? 0 : smoothstep(0, 1, 1 - dist);
}

function terrainSurface(tileType: string | undefined): BiomeTransitionSurface | null {
  if (tileType === 'grass' || tileType === 'dirt' || tileType === 'sand' || tileType === 'stone_floor') {
    return tileType;
  }
  return null;
}

function baseSurface(chunk: ChunkData, cx: number, cy: number): BiomeTransitionSurface | null {
  if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) return null;
  const cell = chunk.cells[cy][cx];
  const def = ASSET_DEFS[cell.assetKey];
  if (!def || def.layer !== 'base') return null;
  return terrainSurface(def.tileType ?? cell.assetKey);
}

/** Exported for tests/debug tooling; no Canvas dependency. */
export function sampleBiomeTransition(
  worldCol: number,
  worldRow: number,
  climate: { moisture: number; temperature: number } = { moisture: 0.5, temperature: 0.5 },
  currentSurface: BiomeTransitionSurface = 'grass',
): BiomeTransitionSample | null {
  const moistureNoise = fbm(worldCol * MOISTURE_SCALE, worldRow * MOISTURE_SCALE, 8111);
  const elevationNoise = fbm(worldCol * ELEVATION_SCALE + 101.7, worldRow * ELEVATION_SCALE - 44.3, 12113);
  const drynessBoost = climate.temperature * 0.10;
  const moisture = clamp01(climate.moisture * 0.62 + moistureNoise * 0.38 - drynessBoost);
  const elevation = clamp01(elevationNoise * 0.82 + (1 - moisture) * 0.10 + climate.temperature * 0.08);

  let bestSurface: BiomeTransitionSurface | null = null;
  let bestAlpha = 0;
  for (let i = 0; i < BIOME_TRANSITION_RULES.length; i++) {
    const rule = BIOME_TRANSITION_RULES[i];
    if (rule.surface === currentSurface) continue;
    const moistureWeight = rangeWeight(moisture, rule.moisture[0], rule.moisture[1]);
    const elevationWeight = rangeWeight(elevation, rule.elevation[0], rule.elevation[1]);
    const rankDistance = Math.abs(SURFACE_RANK[rule.surface] - SURFACE_RANK[currentSurface]);
    const ladderWeight = rankDistance <= 1 ? 1 : 0.72;
    const alpha = moistureWeight * elevationWeight * ladderWeight * rule.maxAlpha;
    if (alpha > bestAlpha) {
      bestAlpha = alpha;
      bestSurface = rule.surface;
    }
  }

  if (!bestSurface || bestAlpha < TRANSITION_MIN_ALPHA) return null;
  return { moisture, elevation, surface: bestSurface, alpha: bestAlpha };
}

function colorForSurface(surface: BiomeTransitionSurface): string {
  for (let i = 0; i < BIOME_TRANSITION_RULES.length; i++) {
    const rule = BIOME_TRANSITION_RULES[i];
    if (rule.surface === surface) return rule.color;
  }
  return '#3CB43C';
}

function clipDiamond(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  ctx.beginPath();
  ctx.moveTo(sx, sy - HALF_TH);
  ctx.lineTo(sx + HALF_TW, sy);
  ctx.lineTo(sx, sy + HALF_TH);
  ctx.lineTo(sx - HALF_TW, sy);
  ctx.closePath();
  ctx.clip();
}

export function drawContinuousBiomeTransitions(
  ctx: CanvasRenderingContext2D,
  chunk: ChunkData,
  params: BiomeTransitionOverlayParams,
): void {
  const transitions = chunk.biomeTransitions;
  if (!transitions || !(transitions.n || transitions.s || transitions.e || transitions.w)) return;

  const climate = chunk.climate ?? { moisture: 0.5, temperature: 0.5 };
  const gxOff = chunk.chunkX * SIZE;
  const gyOff = chunk.chunkY * SIZE;

  for (let cy = params.startCY; cy < params.endCY; cy++) {
    for (let cx = params.startCX; cx < params.endCX; cx++) {
      const current = baseSurface(chunk, cx, cy);
      if (!current) continue;

      const globalCX = gxOff + cx;
      const globalCY = gyOff + cy;
      const sample = sampleBiomeTransition(globalCX, globalCY, climate, current);
      if (!sample) continue;

      const localCX = cx - params.startCX;
      const localCY = cy - params.startCY;
      const lsx = (localCX - localCY) * HALF_TW + params.originX;
      const lsy = (localCX + localCY) * HALF_TH + params.originY;
      const grain = hash01(globalCX, globalCY, 19937);
      const angle = (grain - 0.5) * 1.2;
      const color = colorForSurface(sample.surface);

      ctx.save();
      clipDiamond(ctx, lsx, lsy);
      ctx.globalAlpha = sample.alpha;
      const grad = ctx.createLinearGradient(
        lsx - HALF_TW * Math.cos(angle), lsy - HALF_TH * Math.sin(angle),
        lsx + HALF_TW * Math.cos(angle), lsy + HALF_TH * Math.sin(angle),
      );
      grad.addColorStop(0, `${color}00`);
      grad.addColorStop(0.45, `${color}cc`);
      grad.addColorStop(1, `${color}22`);
      ctx.fillStyle = grad;
      ctx.fillRect(lsx - HALF_TW, lsy - HALF_TH, TW, TH);
      ctx.restore();
    }
  }
}
