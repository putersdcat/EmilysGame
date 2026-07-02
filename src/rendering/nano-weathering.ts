/**
 * nano-weathering.ts — D.9 render-time NanoWeatheringOverlay painter.
 *
 * Ported from experiment/isometric-2.0/src/nano-tile.ts. Applies overlays
 * against actual rendered face dimensions, so mud/moss bands do not repeat
 * up tall walls.
 */

import type {
  NanoWeatheringOverlay,
  IsoNanoTile as NanoTile,
} from '../types/iso-renderer.types';
import { getCurrentLighting } from './lighting';

export type WeatheringFace = 'south' | 'east' | 'top';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a + c * 17, 374761393) ^ Math.imul(b + c * 31, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function drawCrack(
  ctx: CanvasRenderingContext2D,
  overlay: NanoWeatheringOverlay,
  x: number,
  y: number,
  x0: number,
  y0: number,
): void {
  if (hash01(x, y, overlay.seed + 101) > 0.34) return;
  const len = 4 + Math.floor(hash01(x, overlay.seed + 103, y) * 8);
  const horizontal = hash01(y, overlay.seed + 107, x) > 0.38;
  ctx.fillRect(x0 + x, y0 + y, horizontal ? len : 1, horizontal ? 1 : len);
  if (hash01(x, y, overlay.seed + 109) > 0.55) {
    ctx.fillRect(x0 + x + Math.floor(len / 2), y0 + y, 1, Math.max(2, Math.floor(len / 2)));
  }
}

function drawWeatheringOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: NanoWeatheringOverlay,
  face: WeatheringFace,
  width: number,
  height: number,
  x0: number,
  y0: number,
): void {
  if (overlay.faces && !overlay.faces.includes(face)) return;
  if (overlay.kind === 'snow' && face !== 'top') return;
  if (overlay.intensity <= 0 || overlay.opacity <= 0) return;

  const xMin = Math.floor(width * clamp01(overlay.xRange?.[0] ?? 0));
  const xMax = Math.ceil(width * clamp01(overlay.xRange?.[1] ?? 1));
  const yMin = Math.floor(height * clamp01(overlay.yRange?.[0] ?? 0));
  const yMax = Math.ceil(height * clamp01(overlay.yRange?.[1] ?? 1));
  const cell = overlay.kind === 'edge-wear' ? 6 : overlay.kind === 'snow' || overlay.kind === 'mud' ? 3 : 4;
  const maxSize = overlay.kind === 'snow' || overlay.kind === 'mud' ? 5 : overlay.kind === 'moss' ? 4 : 2;
  const previousAlpha = ctx.globalAlpha;

  ctx.fillStyle = overlay.color;
  ctx.globalAlpha = previousAlpha * clamp01(overlay.opacity);
  for (let y = yMin; y < yMax; y += cell) {
    for (let x = xMin; x < xMax; x += cell) {
      const salt = overlay.seed ^ (face === 'top' ? 17 : face === 'south' ? 29 : 41);
      if (hash01(x + overlay.seed, y + overlay.seed * 3, salt) > clamp01(overlay.intensity)) continue;
      if (overlay.kind === 'cracks') {
        drawCrack(ctx, overlay, x, y, x0, y0);
        continue;
      }
      const ox = Math.floor(hash01(x, y, overlay.seed + 11) * 2);
      const oy = Math.floor(hash01(y, x, overlay.seed + 23) * 2);
      const w = 1 + Math.floor(hash01(x, overlay.seed, y + 31) * maxSize);
      const h = 1 + Math.floor(hash01(y, overlay.seed, x + 43) * maxSize);
      ctx.fillRect(x0 + x + ox, y0 + y + oy, w, h);
    }
  }
  ctx.globalAlpha = previousAlpha;
}

function weatherSeed(nano: NanoTile, face: WeatheringFace, screenX: number, screenY: number, x0: number, y0: number): number {
  return (Math.floor(screenX) * 73856093)
    ^ (Math.floor(screenY) * 19349663)
    ^ (nano.kind.length * 83492791)
    ^ (face === 'top' ? 131 : face === 'south' ? 257 : 389)
    ^ (x0 * 911 + y0 * 353);
}

function drawAutoWeathering(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  face: WeatheringFace,
  width: number,
  height: number,
  x0: number,
  y0: number,
  screenX: number,
  screenY: number,
): void {
  const lighting = getCurrentLighting();
  const seed = weatherSeed(nano, face, screenX, screenY, x0, y0);
  if (face === 'top' && lighting.brightness < 0.4) {
    drawWeatheringOverlay(ctx, { kind: 'snow', color: '#f4fbff', intensity: 0.46, opacity: 0.56, seed: seed ^ 0x51f, faces: ['top'], yRange: [0, 0.55] }, face, width, height, x0, y0);
  }
  if (face !== 'top') {
    drawWeatheringOverlay(ctx, { kind: 'mud', color: '#3b2817', intensity: 0.35, opacity: 0.30, seed: seed ^ 0x6d, faces: ['south', 'east'], yRange: [0.68, 1] }, face, width, height, x0, y0);
    if (lighting.brightness < 0.78) {
      drawWeatheringOverlay(ctx, { kind: 'moss', color: '#365c2d', intensity: 0.22, opacity: 0.24, seed: seed ^ 0x3b5, faces: ['south', 'east'], yRange: [0.48, 0.92] }, face, width, height, x0, y0);
    }
  }
  const faces: readonly WeatheringFace[] = face === 'top' ? ['top'] : ['south', 'east'];
  drawWeatheringOverlay(ctx, { kind: 'cracks', color: 'rgba(28,24,20,0.80)', intensity: 0.08, opacity: 0.22, seed: seed ^ 0x99d, faces, yRange: face === 'top' ? [0.12, 0.92] : [0.10, 0.88] }, face, width, height, x0, y0);
}

export function drawNanoWeathering(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  face: WeatheringFace,
  width: number,
  height: number,
  x0: number,
  y0: number,
  screenX: number,
  screenY: number,
): void {
  drawAutoWeathering(ctx, nano, face, width, height, x0, y0, screenX, screenY);
  const overlays = nano.weatheringOverlays;
  if (!overlays?.length) return;
  for (let i = 0; i < overlays.length; i++) {
    drawWeatheringOverlay(ctx, overlays[i]!, face, width, height, x0, y0);
  }
}
