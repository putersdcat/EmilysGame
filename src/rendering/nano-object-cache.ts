/**
 * nano-object-cache.ts — Offscreen cache for procedural nano object tiles.
 *
 * Object nano tiles (walls, fences, gates) are drawn via drawNanoStack(),
 * which runs drawExtrudedNano → drawNanoWeathering per frame. The weathering
 * pass is a per-pixel hash + fillRect scatter (~10k fillRects/frame across all
 * visible wall/fence cells) that is positionally STABLE for a given
 * (tileType, variant, extrusion height, snow) — the nano geometry is drawn in
 * a local frame anchored to the tile diamond, so integer screenX is constant.
 *
 * That makes the composite safe to bake once into an offscreen canvas and
 * blit thereafter (one drawImage instead of thousands of fillRects).
 *
 * Cache key inputs (everything that changes the baked pixels):
 *   - tileType + variant  → nano stack geometry/materials
 *   - max extrusion drawH → wall height (zOffset * NANO_Z_SCALE)
 *   - snow (night)        → top-face snow overlay appears when brightness < 0.4
 *
 * NOT in the key (verified no visual effect in this path):
 *   - `sun`               → drawExtrudedNano ignores it (only used by
 *                           drawNanoShadow / drawPositiveNano non-extruded)
 *   - east-shade rect     → drawExtrudedNano uses a FIXED rgba(0,0,0,0.18)
 *
 * Cache is invalidated on SVG image load (textures finishing async) so the
 * first frames may draw uncached until images are ready (same as before).
 */

import type { IsoNanoStack } from '../types/iso-renderer.types';
import { drawNanoStack } from './nano-tile';
import { getCurrentLighting } from './lighting';

/** Max extrusion height across the stack (px). Drives cache-key + canvas size. */
function maxExtrusionH(stack: IsoNanoStack): number {
  let h = 0;
  for (const nano of stack) {
    if (nano.zMode === 'positive') {
      const drawH = Math.max(nano.zOffset * 12 /* NANO_Z_SCALE */, 16 /* MIN_NANO_HEIGHT */);
      if (drawH > h) h = drawH;
    }
  }
  return h;
}

interface NanoCacheEntry {
  canvas: HTMLCanvasElement;
  /** Height of the extrusion baked into this canvas (px above the tile top). */
  extrusionH: number;
}

const NANO_PAD = 8; // px of slack around the diamond for shadows/overhang

const cache = new Map<string, NanoCacheEntry>();
/** FIFO eviction bound — nano tile variety is small (dozens), cap defensively. */
const MAX_ENTRIES = 256;

function isNightSnow(): boolean {
  return getCurrentLighting().brightness < 0.4;
}

/**
 * Draw a nano object tile, using a baked offscreen canvas when possible.
 * `nanos` are drawn in the same local frame drawTile uses: origin at the
 * tile's top-left diamond bounding corner (drawNanoStack(nanos, 0, 0)).
 * Returns true if drawn (cached or live), false if textures not yet loaded.
 */
export function drawNanoObjectCached(
  ctx: CanvasRenderingContext2D,
  tileType: string,
  variant: string | undefined,
  nanos: IsoNanoStack,
  sx: number,
  sy: number,
  tileWidth: number,
  tileHeight: number,
): boolean {
  const extrusionH = maxExtrusionH(nanos);
  const snow = isNightSnow() ? 1 : 0;
  const key = `${tileType}|${variant ?? ''}|${extrusionH}|${snow}`;

  let entry = cache.get(key);
  if (!entry) {
    const w = tileWidth + NANO_PAD * 2;
    const h = tileHeight + extrusionH + NANO_PAD * 2;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d');
    if (!c) return false;
    // Anchor: place the tile's local origin (0,0) at (NANO_PAD, NANO_PAD + extrusionH)
    // so the full diamond + the extrusion above it fit inside the canvas.
    c.save();
    c.translate(NANO_PAD, NANO_PAD + extrusionH);
    const res = drawNanoStack(c, nanos, 0, 0);
    c.restore();
    if (!res.allImagesLoaded) {
      // Textures still loading — draw live (translated) and DON'T cache a
      // partial bake; next frame retries until images are ready.
      ctx.save();
      ctx.translate(sx - tileWidth / 2, sy - tileHeight / 2);
      drawNanoStack(ctx, nanos, 0, 0);
      ctx.restore();
      return false;
    }
    entry = { canvas, extrusionH };
    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, entry);
  }

  // Blit at integer pixels: sub-pixel (sx,sy) from smooth camera would make the
  // cached copy resample (bilinear) → blur. Rounding keeps it an exact 1:1 copy.
  const dx = Math.round(sx - tileWidth / 2 - NANO_PAD);
  const dy = Math.round(sy - tileHeight / 2 - entry.extrusionH - NANO_PAD);
  ctx.drawImage(entry.canvas, dx, dy);
  return true;
}

/** Drop all baked nano tiles (e.g., on render-cache invalidation). */
export function clearNanoObjectCache(): void {
  cache.clear();
}
