/**
 * tile.ts — 2.0 Experiment: Tile rendering with isometric projection.
 * Renders 128×128 logical SVG tiles directly to 256×128 isometric diamonds.
 * Supports Z-height elevation with side faces and edge blend masks.
 * TODO: DOC — tile pipeline, caching, and blend mask application
 */

import {
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  MICRO_TILE_SIZE,
  type MicroTile,
  HEIGHTMAP_RES,
} from './types';

// ─── SVG Image Cache ─────────────────────────────────────────

/** Cache: SVG string → loaded HTMLImageElement. */
const _svgImageCache = new Map<string, HTMLImageElement>();

/**
 * Inject a pre-loaded image into the SVG cache.
 * Used by the Node.js canvas renderer (AiTools/canvas-renderer.ts) which
 * pre-loads all SVG textures via @napi-rs/canvas loadImage() before calling
 * the engine draw functions. Without this, loadSvgImage() returns null
 * (async browser path) and draw calls silently skip all images.
 *
 * @param svg - The exact SVG string used as the cache key
 * @param img - Pre-loaded image compatible with ctx.drawImage()
 */
export function injectSvgImage(svg: string, img: HTMLImageElement): void {
  _svgImageCache.set(svg, img);
}

/**
 * Load an SVG string into an HTMLImageElement (cached, async).
 * Returns the image if loaded, null if still pending.
 */
export function loadSvgImage(svg: string): HTMLImageElement | null {
  let img = _svgImageCache.get(svg);
  if (img) return img.complete ? img : null;

  img = new Image();
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  img.src = URL.createObjectURL(blob);
  _svgImageCache.set(svg, img);
  return null; // Not ready yet — available next frame
}

// ─── Offscreen Tile Canvas Cache ─────────────────────────────
// 2.0 Experiment: Pre-render each unique tile to an offscreen canvas
// so we blit from canvas (fast) instead of re-transforming every bake.

/** Cache: SVG string + z → pre-rendered offscreen canvas. */
const _tileCanvasCache = new Map<string, HTMLCanvasElement>();

/** Cache key includes Z so side-faces vary with height. */
function tileCacheKey(svg: string, z: number): string {
  return `${z}:${svg}`;
}

/**
 * Get or create a pre-rendered isometric tile canvas.
 * Includes the diamond top face + side faces for Z > 0.
 * Returns null if the SVG image isn't loaded yet.
 */
export function getRenderedTile(tile: MicroTile): HTMLCanvasElement | null {
  const key = tileCacheKey(tile.svg, tile.z);
  const cached = _tileCanvasCache.get(key);
  if (cached) return cached;

  const img = loadSvgImage(tile.svg);
  if (!img) return null; // Image still loading

  const zPx = tile.z * Z_PX_PER_LEVEL;
  const tileCanvas = renderTileToCanvas(img, zPx, tile.kind);
  _tileCanvasCache.set(key, tileCanvas);
  return tileCanvas;
}

// ─── Rendering Constants ─────────────────────────────────────

/** Pixels per Z-level of elevation. Larger = more visible height. */
export const Z_PX_PER_LEVEL = 4;

/** Half-tile dimensions for iso math. */
const HALF_W = ISO_TILE_WIDTH / 2;  // 128
const HALF_H = ISO_TILE_HEIGHT / 2; // 64

// ─── Diamond Clip Path ───────────────────────────────────────
// 2.0 Experiment: Clip to diamond shape to prevent overlap bleeding.

/**
 * Apply a diamond clip path to the context.
 * The diamond is centered at (cx, cy) with half-width hw and half-height hh.
 */
function clipDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);       // top
  ctx.lineTo(cx + hw, cy);       // right
  ctx.lineTo(cx, cy + hh);       // bottom
  ctx.lineTo(cx - hw, cy);       // left
  ctx.closePath();
  ctx.clip();
}

// ─── Side Face Colors ────────────────────────────────────────
// 2.0 Experiment: Darker tints for left/right side faces of elevated tiles.

const SIDE_COLORS: Record<string, { left: string; right: string }> = {
  'grass':       { left: '#1a4d1a', right: '#245a24' },
  'dirt':        { left: '#5a3a0a', right: '#6b4a12' },
  'rock':        { left: '#4a4a4a', right: '#5a5a5a' },
  'water':       { left: '#1a4477', right: '#1a5588' },
  'sand':        { left: '#8a7a50', right: '#9a8a60' },
  'stone-wall':  { left: '#3a3a3a', right: '#4a4a4a' },
  'wooden-fence':{ left: '#5a3a10', right: '#6a4a20' },
  'river':       { left: '#1a3366', right: '#1a4477' },
  'river-bank':  { left: '#5a4a1a', right: '#6a5a2a' },
  'tall-grass':  { left: '#1a5a1a', right: '#2a6a2a' },
};

function getSideColors(kind: string): { left: string; right: string } {
  return SIDE_COLORS[kind] ?? { left: '#333', right: '#444' };
}

// ─── Core Tile Rendering ─────────────────────────────────────

/**
 * Render a tile with its top face (isometric diamond) and side faces.
 * Returns an offscreen canvas containing the complete tile visual.
 *
 * Layout of the output canvas:
 *   - Width: ISO_TILE_WIDTH (256)
 *   - Height: ISO_TILE_HEIGHT (128) + zPx (side face height)
 *   - Top face: diamond at (128, 0) center
 *   - Left side: parallelogram from bottom-left of diamond down by zPx
 *   - Right side: parallelogram from bottom-right of diamond down by zPx
 */
function renderTileToCanvas(
  img: HTMLImageElement,
  zPx: number,
  kind: string,
): HTMLCanvasElement {
  const canvasW = ISO_TILE_WIDTH;
  const canvasH = ISO_TILE_HEIGHT + zPx;

  const offscreen = document.createElement('canvas');
  offscreen.width = canvasW;
  offscreen.height = canvasH;
  const ctx = offscreen.getContext('2d')!;

  // ── Side faces (draw first, behind top face) ──
  if (zPx > 0) {
    const colors = getSideColors(kind);

    // Left side face: parallelogram from diamond bottom-left down
    ctx.fillStyle = colors.left;
    ctx.beginPath();
    ctx.moveTo(0, HALF_H);                      // diamond left point
    ctx.lineTo(HALF_W, ISO_TILE_HEIGHT);         // diamond bottom point
    ctx.lineTo(HALF_W, ISO_TILE_HEIGHT + zPx);   // bottom + Z
    ctx.lineTo(0, HALF_H + zPx);                 // left + Z
    ctx.closePath();
    ctx.fill();

    // Right side face: parallelogram from diamond bottom-right down
    ctx.fillStyle = colors.right;
    ctx.beginPath();
    ctx.moveTo(ISO_TILE_WIDTH, HALF_H);          // diamond right point
    ctx.lineTo(HALF_W, ISO_TILE_HEIGHT);         // diamond bottom point
    ctx.lineTo(HALF_W, ISO_TILE_HEIGHT + zPx);   // bottom + Z
    ctx.lineTo(ISO_TILE_WIDTH, HALF_H + zPx);    // right + Z
    ctx.closePath();
    ctx.fill();

    // Side face edge highlight (subtle)
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(HALF_W, ISO_TILE_HEIGHT);
    ctx.lineTo(HALF_W, ISO_TILE_HEIGHT + zPx);
    ctx.stroke();
  }

  // ── Top face (isometric diamond with clipped SVG) ──
  ctx.save();
  clipDiamond(ctx, HALF_W, HALF_H, HALF_W, HALF_H);

  // Isometric transform: 128×128 source → 256×128 diamond
  // Transform origin at (0,0), the tile occupies the clipped diamond.
  ctx.transform(1, 0.5, -1, 0.5, HALF_W, 0);
  ctx.drawImage(img, 0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE);
  ctx.restore();

  return offscreen;
}

// ─── Edge Blend Mask Rendering ───────────────────────────────
// 2.0 Experiment: Apply gradient alpha masks along tile edges
// for seamless blending between adjacent terrain types.

/**
 * Draw a soft blend gradient along one edge of a tile.
 * blendCtx should target the chunk's bake canvas.
 * The gradient fades from transparent (at the edge) to opaque (inward).
 */
export function applyEdgeBlend(
  blendCtx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  edge: 'top' | 'right' | 'bottom' | 'left',
  _samples: readonly number[],
  neighborColor: string,
): void {
  const hw = HALF_W;
  const hh = HALF_H;
  const blendDepth = 10; // pixels of blend gradient (reduced for subtlety)

  blendCtx.save();

  // Clip to the diamond shape at this tile position
  clipDiamond(blendCtx, screenX + hw, screenY + hh, hw, hh);

  // Parse neighborColor hex to rgba for low-alpha blend
  // We draw only a faint tint to soften the edge seam, not a hard color block
  let r = 0, g = 0, b = 0;
  const hex = neighborColor.replace('#', '');
  if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }
  const edgeColor = `rgba(${r},${g},${b},0.22)`; // very subtle tint
  const fadeColor = `rgba(${r},${g},${b},0)`;     // fully transparent

  let grad: CanvasGradient;

  switch (edge) {
    case 'top':
      // Top edge: gradient from top vertex inward
      grad = blendCtx.createLinearGradient(
        screenX + hw, screenY,
        screenX + hw, screenY + blendDepth,
      );
      break;
    case 'bottom':
      grad = blendCtx.createLinearGradient(
        screenX + hw, screenY + ISO_TILE_HEIGHT,
        screenX + hw, screenY + ISO_TILE_HEIGHT - blendDepth,
      );
      break;
    case 'left':
      grad = blendCtx.createLinearGradient(
        screenX, screenY + hh,
        screenX + blendDepth, screenY + hh,
      );
      break;
    case 'right':
      grad = blendCtx.createLinearGradient(
        screenX + ISO_TILE_WIDTH, screenY + hh,
        screenX + ISO_TILE_WIDTH - blendDepth, screenY + hh,
      );
      break;
  }

  grad.addColorStop(0, edgeColor);
  grad.addColorStop(1, fadeColor);
  blendCtx.fillStyle = grad;
  blendCtx.fillRect(screenX, screenY, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);

  blendCtx.restore();
}

// ─── Height Map Visualization ────────────────────────────────
// 2.0 Experiment: Optional sub-tile slope shading from 8×8 height map.

/**
 * Apply height map shading to a tile's top face.
 * Draws subtle shadow/highlight based on slope direction.
 */
export function applyHeightMapShading(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  heightMap: readonly number[],
): void {
  if (heightMap.length !== HEIGHTMAP_RES * HEIGHTMAP_RES) return;

  const cellW = ISO_TILE_WIDTH / HEIGHTMAP_RES;
  const cellH = ISO_TILE_HEIGHT / HEIGHTMAP_RES;

  ctx.save();
  clipDiamond(ctx, screenX + HALF_W, screenY + HALF_H, HALF_W, HALF_H);

  for (let hy = 0; hy < HEIGHTMAP_RES; hy++) {
    for (let hx = 0; hx < HEIGHTMAP_RES; hx++) {
      const val = heightMap[hy * HEIGHTMAP_RES + hx];
      // Compute slope-based shading (compare to neighbors)
      const left = hx > 0 ? heightMap[hy * HEIGHTMAP_RES + hx - 1] : val;
      const up   = hy > 0 ? heightMap[(hy - 1) * HEIGHTMAP_RES + hx] : val;
      const slopeX = val - left;
      const slopeY = val - up;
      // Sun from top-right → shadows on left/bottom slopes
      const shade = (slopeX * 0.5 - slopeY * 0.5);

      if (Math.abs(shade) > 0.01) {
        // Transform cell position to isometric
        const px = screenX + (hx - hy) * (cellW / 2) + HALF_W;
        const py = screenY + (hx + hy) * (cellH / 2);

        ctx.fillStyle = shade > 0
          ? `rgba(255,255,255,${Math.min(shade * 0.3, 0.15)})`
          : `rgba(0,0,0,${Math.min(-shade * 0.3, 0.15)})`;
        ctx.fillRect(px - cellW / 2, py, cellW, cellH);
      }
    }
  }

  ctx.restore();
}
