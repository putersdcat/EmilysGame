/**
 * nano-tile.ts — NanoTile rendering engine (ported from experiment/isometric-2.0).
 * Z-pinned skew transforms, extrusions, and stack draw for feature overlays.
 * Nanos overlay on base biome MicroTiles for fences, walls, rivers, etc.
 *
 * Transform reference:
 *   Base tile (flat): ctx.transform(1, 0.5, -1, 0.5, halfW, 0)
 *   Nano (upright):   ctx.transform(1, 0.5, 0, 1, 0, 0)
 *
 * The upright shear pins vertical edges while the bottom edge follows the
 * iso angle (26.5°), creating a "standing billboard" aligned to the left
 * iso axis of the diamond grid.
 *
 * TODO: DOC — Z-pinned transform math, draw order, extrusion pipeline
 *
 * @see experiment/isometric-2.0/src/nano-tile.ts — original experiment source
 * @see src/types/iso-renderer.types.ts — type definitions
 */

import {
  ISO_DIAMOND_WIDTH as ISO_TILE_WIDTH,
  ISO_DIAMOND_HEIGHT as ISO_TILE_HEIGHT,
  ISO_MICRO_TILE_SIZE as MICRO_TILE_SIZE,
  type IsoFeatureVariant as FeatureVariant,
  type IsoNanoTile as NanoTile,
  type IsoNanoStack as NanoStack,
  type IsoSunState as SunState,
} from './types/iso-renderer.types.js';

// ─── SVG Image Cache ─────────────────────────────────────────────────────────
// Inlined from experiment/isometric-2.0/src/tile.ts for standalone portability.

const _svgImageCache = new Map<string, HTMLImageElement>();

/**
 * Inject a pre-loaded image into the SVG cache (used by Node.js/napi-rs canvas adapter).
 * Without this, loadSvgImage() performs browser-side async load.
 */
export function injectSvgImage(svg: string, img: HTMLImageElement): void {
  _svgImageCache.set(svg, img);
}

/**
 * Load or retrieve a cached HTMLImageElement for the given SVG string.
 * Browser: async blob URL → synchronous drawImage once loaded.
 * Node (AiTools): pre-populated via injectSvgImage().
 */
export function loadSvgImage(svg: string): HTMLImageElement | null {
  let img = _svgImageCache.get(svg);
  if (img) return img;

  // Browser async load — schedules decode, returns null on first call.
  img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  _svgImageCache.set(svg, img);
  return img.complete ? img : null;
}

// ─── Shadow Utility ──────────────────────────────────────────────────────────
// Inlined from experiment/isometric-2.0/src/renderer.ts (computeShadowOffset).

/** Reusable 2D offset for shadow projection (avoid alloc in hot path). */
const _shadowOffset = { dx: 0, dy: 0 };

/** Compute shadow pixel offset from sun state and tile Z-height.
 *  @param sun  Current sun position/parameters.
 *  @param z    Z-offset in nano levels.
 *  @returns    Mutable singleton (copy before storing).
 */
export function computeShadowOffset(sun: SunState, z: number): { dx: number; dy: number } {
  const zPx = z * Z_PX_PER_LEVEL;
  const len = zPx * sun.shadowLength;
  _shadowOffset.dx = -Math.cos(sun.azimuth) * len;
  _shadowOffset.dy = -Math.sin(sun.azimuth) * len * 0.5; // foreshorten for iso
  return _shadowOffset;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Pixels sunk/raised per terrain Z level (subtle elevation). */
export const Z_PX_PER_LEVEL = 4;

const HALF_W = ISO_TILE_WIDTH / 2;   // 128
const HALF_H = ISO_TILE_HEIGHT / 2;  // 64

/**
 * Visual height multiplier for nano Z rendering.
 * Base tile Z_PX_PER_LEVEL (4) provides subtle terrain elevation.
 * Nanos use a larger scale for visible structural height.
 * Exported for chunk.ts (computePadTop) and assembly preview.
 */
export const NANO_Z_SCALE = 12;

/** Minimum visible nano height in pixels. */
const MIN_NANO_HEIGHT = 16;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Result of rendering a nano stack — cumulative sink depth for player offset. */
export interface NanoDrawResult {
  /** Total sink depth in pixels from negative-Z nanos. */
  sinkDepthPx: number;
  /** True only when every nano SVG image was loaded and drawn. */
  allImagesLoaded: boolean;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Diamond clip path.
 * Clips rendering to the iso diamond shape at (cx, cy) with half-dims (hw, hh).
 */
function clipDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  hw: number, hh: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.clip();
}

// ─── Positive Z Rendering ────────────────────────────────────────────────────

/**
 * Draw a positive-Z nano (upright barrier: fence, wall, etc.).
 *
 * Uses Z-pinned shear: `transform(1, 0.5, 0, 1)` — bottom edge follows iso angle,
 * vertical edges stay vertical, creating "standing" appearance.
 *
 * Anchored at tile diamond's left vertex. Width = MICRO_TILE_SIZE spans the
 * left-to-bottom diamond edge. Height derived from zOffset × NANO_Z_SCALE.
 *
 * Layout after transform:
 *   Bottom-left: (screenX, screenY + HALF_H) = diamond left vertex
 *   Bottom-right: (screenX + 128, screenY + HALF_H + 64) = diamond bottom vertex
 */
export function drawPositiveNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
  _sun?: SunState,
): boolean {
  const img = loadSvgImage(nano.svg);
  if (!img) return false;

  const drawH = Math.max(nano.zOffset * NANO_Z_SCALE, MIN_NANO_HEIGHT);

  ctx.save();

  // Anchor at left vertex of the tile diamond.
  ctx.translate(screenX, screenY + HALF_H);

  // Z-pinned shear: horizontal lines slope at iso angle (0.5),
  // vertical edges remain vertical — the "standing billboard" effect.
  ctx.transform(1, 0.5, 0, 1, 0, 0);

  // Draw SVG extending upward from anchor.
  ctx.drawImage(img, 0, -drawH, MICRO_TILE_SIZE, drawH);

  // Blend edge: soft alpha fade at bottom for ground integration
  if (nano.blendEdges) {
    const grad = ctx.createLinearGradient(0, 0, 0, -drawH);
    grad.addColorStop(0, 'rgba(0,0,0,0.12)');
    grad.addColorStop(0.25, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, -drawH, MICRO_TILE_SIZE, drawH);
  }

  ctx.restore();
  return true;
}

// ─── Negative Z Rendering ────────────────────────────────────────────────────

/**
 * Draw a negative-Z nano (carve-out: river, trench, etc.).
 *
 * Rendered flat (iso projected like base tiles) with a downward offset
 * to create the "sunken" appearance. Clipped to the parent tile's diamond.
 *
 * Returns the effective sink depth in pixels for player sprite offset.
 */
export function drawNegativeNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
): { sinkPx: number; loaded: boolean } {
  const img = loadSvgImage(nano.svg);
  if (!img) return { sinkPx: 0, loaded: false };

  const sinkPx = Math.abs(nano.zOffset) * Z_PX_PER_LEVEL;
  const cx = screenX + HALF_W;
  const cy = screenY + HALF_H;

  ctx.save();

  // Clip to parent tile's diamond to prevent bleed
  clipDiamond(ctx, cx, cy, HALF_W, HALF_H);

  // Flat iso projection (same as base tiles) shifted down by sink depth.
  ctx.transform(1, 0.5, -1, 0.5, cx, screenY + sinkPx);
  ctx.drawImage(img, 0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE);

  ctx.restore();

  // Four-sided inward blend for natural bank transitions
  if (nano.blendEdges) {
    const blendPx = 18;
    const bankColor = 'rgba(58, 125, 68, 0.5)';
    const bankFade  = 'rgba(58, 125, 68, 0)';

    ctx.save();
    clipDiamond(ctx, cx, cy, HALF_W, HALF_H);

    // Top edge
    let grad = ctx.createLinearGradient(cx, cy - HALF_H, cx, cy - HALF_H + blendPx);
    grad.addColorStop(0, bankColor);
    grad.addColorStop(1, bankFade);
    ctx.fillStyle = grad;
    ctx.fillRect(screenX, screenY, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);

    // Bottom edge
    grad = ctx.createLinearGradient(cx, cy + HALF_H, cx, cy + HALF_H - blendPx);
    grad.addColorStop(0, bankColor);
    grad.addColorStop(1, bankFade);
    ctx.fillStyle = grad;
    ctx.fillRect(screenX, screenY, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);

    // Left edge
    grad = ctx.createLinearGradient(cx - HALF_W, cy, cx - HALF_W + blendPx, cy);
    grad.addColorStop(0, bankColor);
    grad.addColorStop(1, bankFade);
    ctx.fillStyle = grad;
    ctx.fillRect(screenX, screenY, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);

    // Right edge
    grad = ctx.createLinearGradient(cx + HALF_W, cy, cx + HALF_W - blendPx, cy);
    grad.addColorStop(0, bankColor);
    grad.addColorStop(1, bankFade);
    ctx.fillStyle = grad;
    ctx.fillRect(screenX, screenY, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);

    ctx.restore();
  }

  return { sinkPx, loaded: true };
}

// ─── Flat Nano Rendering ─────────────────────────────────────────────────────

/**
 * Draw a flat nano overlay (zMode='flat', e.g., tall grass decal).
 * Same iso projection as base tiles, semi-transparent to show base through.
 */
function drawFlatNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
): boolean {
  const img = loadSvgImage(nano.svg);
  if (!img) return false;

  const cx = screenX + HALF_W;
  const cy = screenY + HALF_H;

  ctx.save();
  clipDiamond(ctx, cx, cy, HALF_W, HALF_H);

  // Flat iso transform (identical to base tile projection)
  ctx.transform(1, 0.5, -1, 0.5, cx, screenY);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(img, 0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE);

  ctx.restore();
  return true;
}

// ─── Extruded Nano Rendering ─────────────────────────────────────────────────

/**
 * Wall geometry constants — must stay in sync with solver.ts wallBounds().
 *
 * In tile-local space (128×128), the wall occupies a centered strip:
 *   Horizontal wall: x=0..128 (full length), y=40..88 (48px thickness)
 *   Vertical wall:   x=40..88 (48px thickness), y=0..128 (full length)
 *
 * WALL_OFFSET = distance from tile edge to the near wall face (camera side).
 * WALL_THICKNESS = wall width perpendicular to its run direction.
 */
const WALL_THICKNESS = 48;                                    // solver.ts W
const WALL_OFFSET = (MICRO_TILE_SIZE - WALL_THICKNESS) / 2;  // solver.ts off = 40

/**
 * Returns true when the nano variant represents a wall running along the
 * vertical iso axis (/ on screen), as opposed to horizontal (\ on screen).
 *
 * Used by drawExtrudedNano to select the correct face matrix orientation.
 * Exported for AiTools game-tile-renderer.ts.
 */
export function isVerticalWall(variant: FeatureVariant | undefined): boolean {
  switch (variant) {
    case 'straight-v':
    case 'corner-tl':
    case 'corner-tr':
    case 'corner-br':
    case 'tee-r':
    case 'tee-l':
      return true;
    default:
      return false;
  }
}

/**
 * Returns true when the narrow end-cap face should be rendered for this variant.
 *
 * Mid-run tiles (straight-h, straight-v) and 4-way crossing tiles (cross)
 * connect on BOTH ends — no exposed terminus face. Drawing a cap here creates
 * disconnected-post artifacts in long runs.
 *
 * @see experiment Issue #211 — end-cap chaining fix derivation.
 * Exported so AiTools game-tile-renderer.ts can share the same logic.
 */
export function shouldDrawEndCap(variant: FeatureVariant | undefined): boolean {
  switch (variant) {
    case 'straight-h':
    case 'straight-v':
    case 'cross':
      return false;
    default:
      return true;
  }
}

/**
 * Draw a nano with 3-face extrusion: front face + end cap + top cap.
 * Creates a proper isometric 3D box for thick structural nanos (stone walls).
 *
 * ═══ DUAL-ORIENTATION ISOMETRIC BOX GEOMETRY (v3) ═══
 *
 * Camera views from south-east looking north-west.
 * Two orientations, determined by isVerticalWall(nano.variant):
 *
 * ┌─────────────────────────────────────┬─────────────────────────────────────┐
 * │ HORIZONTAL (\ on screen)            │ VERTICAL (/ on screen)              │
 * │ Wall strip y=40..88                 │ Wall strip x=40..88                 │
 * │ Z-edge: tile(128,88) → screen       │ Z-edge: tile(88,128) → screen       │
 * │ Front: anchor(0, 88), mat(1,0.5)    │ Front: anchor(88, 0), mat(-1,0.5)   │
 * │ Cap:   anchor(128,40), mat(-1,0.5)  │ Cap:   anchor(40,128), mat(1,0.5)   │
 * └─────────────────────────────────────┴─────────────────────────────────────┘
 *
 * Key insight: front and cap SWAP matrix signs between orientations.
 * Draw order: end cap → front → top cap.
 *
 * @see experiment/isometric-2.0/src/nano-tile.ts — original with full proof.
 * @see GitHub Issue #211 — derivation and geometric proofs.
 */
export function drawExtrudedNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
  sun?: SunState,
): boolean {
  const hasExtrusion = nano.sideTextureSvg || nano.topTextureSvg;
  if (!hasExtrusion) {
    return drawPositiveNano(ctx, nano, screenX, screenY, sun);
  }

  const drawH = Math.max(nano.zOffset * NANO_Z_SCALE, MIN_NANO_HEIGHT);
  let loaded = true;
  const vertical = isVerticalWall(nano.variant);

  const NE = WALL_OFFSET + WALL_THICKNESS;  // near edge = 88

  let frontX: number, frontY: number;
  let capX: number, capY: number;
  let frontMat: 1 | -1;

  if (vertical) {
    frontX = screenX + HALF_W + NE;
    frontY = screenY + NE / 2;
    capX   = screenX + HALF_W + WALL_OFFSET - MICRO_TILE_SIZE;
    capY   = screenY + (WALL_OFFSET + MICRO_TILE_SIZE) / 2;
    frontMat = -1;
  } else {
    frontX = screenX + HALF_W - NE;
    frontY = screenY + NE / 2;
    capX   = screenX + HALF_W + MICRO_TILE_SIZE - WALL_OFFSET;
    capY   = screenY + (MICRO_TILE_SIZE + WALL_OFFSET) / 2;
    frontMat = 1;
  }

  // ── 1. End cap (further from camera) ─────────────────────────────────────
  if (shouldDrawEndCap(nano.variant) && nano.sideTextureSvg) {
    const sideImg = loadSvgImage(nano.sideTextureSvg);
    if (sideImg) {
      ctx.save();
      ctx.translate(capX, capY);
      ctx.transform(-frontMat as (1 | -1), 0.5, 0, 1, 0, 0);
      ctx.drawImage(sideImg, 0, -drawH, WALL_THICKNESS, drawH);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, -drawH, WALL_THICKNESS, drawH);
      ctx.restore();
    } else {
      loaded = false;
    }
  }

  // ── 2. Front face (closer to camera) ─────────────────────────────────────
  if (nano.sideTextureSvg) {
    const sideImg = loadSvgImage(nano.sideTextureSvg);
    if (sideImg) {
      ctx.save();
      ctx.translate(frontX, frontY);
      ctx.transform(frontMat, 0.5, 0, 1, 0, 0);
      ctx.drawImage(sideImg, 0, -drawH, MICRO_TILE_SIZE, drawH);
      ctx.restore();
    } else {
      loaded = false;
    }
  } else {
    if (!drawPositiveNano(ctx, nano, screenX, screenY, sun)) loaded = false;
  }

  // ── 3. Top cap: flat iso at elevated position ─────────────────────────────
  if (nano.topTextureSvg) {
    const topImg = loadSvgImage(nano.topTextureSvg);
    if (topImg) {
      const elevatedY = screenY - drawH;
      const cx = screenX + HALF_W;

      ctx.save();
      clipDiamond(ctx, cx, elevatedY + HALF_H, HALF_W, HALF_H);
      ctx.transform(1, 0.5, -1, 0.5, cx, elevatedY);
      ctx.drawImage(topImg, 0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE);
      ctx.restore();
    } else {
      loaded = false;
    }
  }

  return loaded;
}

// ─── Stack Rendering ─────────────────────────────────────────────────────────

/**
 * Draw a full nano stack for one tile.
 *
 * Nanos are assumed pre-sorted: negative Z first, then flat, then positive
 * (per the NanoStack sort contract — see types.ts).
 *
 * Returns cumulative sink depth for player sprite positioning.
 */
export function drawNanoStack(
  ctx: CanvasRenderingContext2D,
  nanos: NanoStack,
  screenX: number,
  screenY: number,
  sun?: SunState,
): NanoDrawResult {
  let sinkDepthPx = 0;
  let allImagesLoaded = true;

  for (const nano of nanos) {
    switch (nano.zMode) {
      case 'negative': {
        const res = drawNegativeNano(ctx, nano, screenX, screenY);
        sinkDepthPx += res.sinkPx;
        if (!res.loaded) allImagesLoaded = false;
        break;
      }
      case 'flat':
        if (!drawFlatNano(ctx, nano, screenX, screenY)) allImagesLoaded = false;
        break;
      case 'positive':
        if (nano.sideTextureSvg || nano.topTextureSvg) {
          if (!drawExtrudedNano(ctx, nano, screenX, screenY, sun)) allImagesLoaded = false;
        } else {
          if (!drawPositiveNano(ctx, nano, screenX, screenY, sun)) allImagesLoaded = false;
        }
        break;
    }
  }

  return { sinkDepthPx, allImagesLoaded };
}

// ─── Nano Shadow Rendering ───────────────────────────────────────────────────

/**
 * Draw shadow for a positive-Z nano.
 * Projects a small diamond shadow based on nano's Z-offset and sun state.
 * Only positive nanos cast shadows (negative are sunken, flat are ground-level).
 */
export function drawNanoShadow(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
  sun: SunState,
): void {
  if (nano.zMode !== 'positive' || nano.zOffset <= 0) return;

  const offset = computeShadowOffset(sun, nano.zOffset);
  const shadowScale = Math.min(nano.zOffset / 6, 1);

  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${sun.shadowAlpha * 0.5})`;

  const cx = screenX + HALF_W + offset.dx;
  const cy = screenY + HALF_H + offset.dy;
  const hw = HALF_W * 0.3 * (1 + shadowScale);
  const hh = HALF_H * 0.3 * (1 + shadowScale);

  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
