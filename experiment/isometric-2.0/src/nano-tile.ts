/**
 * nano-tile.ts — 2.0 Experiment: NanoTile rendering engine.
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
 */

import {
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  MICRO_TILE_SIZE,
  type FeatureVariant,
  type NanoTile,
  type NanoStack,
  type SunState,
} from './types';
import { loadSvgImage, Z_PX_PER_LEVEL } from './tile';
import { computeShadowOffset } from './renderer';

// ─── Constants ───────────────────────────────────────────────

const HALF_W = ISO_TILE_WIDTH / 2;   // 128
const HALF_H = ISO_TILE_HEIGHT / 2;  // 64

/**
 * Visual height multiplier for nano Z rendering.
 * Base tile Z_PX_PER_LEVEL (4) is for subtle terrain elevation.
 * Nanos need larger scale for visible structural height.
 * Exported for use in computePadTop (chunk.ts) and assemblies preview.
 */
export const NANO_Z_SCALE = 12;

/** Minimum visible nano height in pixels. */
const MIN_NANO_HEIGHT = 16;

// ─── Types ───────────────────────────────────────────────────

/** Result of rendering a nano stack — cumulative sink depth for player offset. */
export interface NanoDrawResult {
  /** Total sink depth in pixels from negative-Z nanos. */
  sinkDepthPx: number;
  /** True only when every nano SVG image was loaded and drawn. */
  allImagesLoaded: boolean;
}

// ─── Utility ─────────────────────────────────────────────────

/**
 * Diamond clip path (mirrors tile.ts — see rendering.instructions.md on dedup).
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

// ─── Positive Z Rendering ────────────────────────────────────

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
 *   Top-left: (screenX, screenY + HALF_H - drawH)
 *   Top-right: (screenX + 128, screenY + HALF_H - drawH + 64)
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
  // After shear, the bottom edge runs from left vertex to bottom vertex.
  ctx.translate(screenX, screenY + HALF_H);

  // Z-pinned shear: horizontal lines slope at iso angle (0.5),
  // vertical edges remain vertical — the "standing billboard" effect.
  ctx.transform(1, 0.5, 0, 1, 0, 0);

  // Draw SVG extending upward from anchor.
  // y=0 is the ground line; negative y extends upward.
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

// ─── Negative Z Rendering ────────────────────────────────────

/**
 * Draw a negative-Z nano (carve-out: river, trench, etc.).
 *
 * Rendered flat (iso projected like base tiles) with a downward offset
 * to create the "sunken" appearance. Clipped to the parent tile's diamond.
 * Blend edges add grass-to-water transitions on all four edges.
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
  // The shift moves the SVG content lower within the diamond, creating the
  // sunken plane effect (e.g., water surface below surrounding terrain).
  ctx.transform(1, 0.5, -1, 0.5, cx, screenY + sinkPx);
  ctx.drawImage(img, 0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE);

  ctx.restore();

  // Four-sided inward blend: grass-colored gradient from each edge,
  // fading toward center — creates natural "bank" transition.
  if (nano.blendEdges) {
    const blendPx = 18;
    // Grass base color (semi-transparent for blend)
    const bankColor = 'rgba(58, 125, 68, 0.5)';
    const bankFade = 'rgba(58, 125, 68, 0)';

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

// ─── Flat Nano Rendering ─────────────────────────────────────

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

// ─── Extruded Nano Rendering ─────────────────────────────────

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
 * Determine if a wall variant's PRIMARY run direction is vertical ("/" on screen).
 * Returns true for variants where the wall strip is at x=40..88 (vertical),
 * false for variants where the strip is at y=40..88 (horizontal, "\" on screen).
 *
 * Mixed variants (corners, tees, cross) have arms in both directions.
 * For extrusion, we use the front face along the LONGER visible run.
 * Corners: the "V" faces camera → pick orientation that shows the most surface.
 *   - corner-tr, corner-br: front face runs along y (vertical primary) — player
 *     sees the right arm extend toward them on the / diagonal.
 *   - corner-tl, corner-bl: front face runs along x (horizontal primary) — player
 *     sees the left arm extend toward them on the \ diagonal.
 *
 * @see solver.ts wallBounds() for the footprint layout that this must match.
 * Exported so AiTools game-tile-renderer.ts can share the same classification.
 */
export function isVerticalWall(variant: FeatureVariant | undefined): boolean {
  switch (variant) {
    case 'straight-v':
    case 'end-t':
    case 'end-b':
    case 'corner-tr':
    case 'corner-br':
    case 'tee-r':       // top+bottom+left arms → primary run is vertical
    case 'tee-l':       // top+bottom+right arms → primary run is vertical
      return true;
    default:
      return false;     // straight-h, end-r, end-l, corner-tl, corner-bl, tee-t, tee-b, cross, isolated
  }
}

/**
 * Returns true when the narrow end-cap face should be rendered for this variant.
 *
 * Mid-run tiles (straight-h, straight-v) and 4-way crossing tiles (cross)
 * connect on BOTH ends of their primary axis — no exposed terminus face visible.
 * Drawing the cap on these creates disconnected-post artifacts in long runs.
 *
 * All other variants (end-*, corner-*, tee-*, isolated, undefined/fallback) have
 * at least one exposed end on the primary axis and need the cap rendered.
 *
 * For corner-* and tee-* the cap represents the terminus of the primary arm arm.
 * The secondary arm's terminus is currently not separately rendered (future work).
 *
 * @see Issue #211 — end-cap chaining fix derivation.
 * Exported so AiTools game-tile-renderer.ts can share the same determination.
 */
export function shouldDrawEndCap(variant: FeatureVariant | undefined): boolean {
  switch (variant) {
    case 'straight-h': // both ends connect east+west — no exposed face
    case 'straight-v': // both ends connect north+south — no exposed face
    case 'cross':      // 4-way: all arms connect to neighbors — no exposed face
      return false;
    default:
      // end-r, end-l, end-t, end-b, isolated, corner-*, tee-*, undefined(fallback)
      return true;
  }
}

/**
 * Draw a nano with 3-face extrusion: front face + end cap + top cap.
 * Creates a proper isometric 3D box for thick structural nanos (stone walls).
 *
 * ═══ DUAL-ORIENTATION ISOMETRIC BOX GEOMETRY (v3) ═══
 *
 * Camera views from south-east (screen bottom) looking north-west (screen top).
 * Two orientations supported, determined by isVerticalWall(nano.variant):
 *
 * ┌───────────────────────────────────┬───────────────────────────────────┐
 * │ HORIZONTAL (\\ on screen)         │ VERTICAL (/ on screen)            │
 * │ Wall strip y=40..88              │ Wall strip x=40..88              │
 * │                                  │                                  │
 * │ Z-edge: tile(128, 88)            │ Z-edge: tile(88, 128)            │
 * │ screen (sX+168, sY+108)          │ screen (sX+88, sY+108)           │
 * │                                  │                                  │
 * │ Front: anchor(0, 88)             │ Front: anchor(88, 0)             │
 * │   matrix(1, 0.5, 0, 1)          │   matrix(-1, 0.5, 0, 1)         │
 * │   width=128, draws RIGHT+DOWN    │   width=128, draws LEFT+DOWN     │
 * │                                  │                                  │
 * │ Cap: anchor(128, 40)             │ Cap: anchor(40, 128)             │
 * │   matrix(-1, 0.5, 0, 1)         │   matrix(1, 0.5, 0, 1)          │
 * │   width=48, draws LEFT+DOWN      │   width=48, draws RIGHT+DOWN     │
 * │                                  │                                  │
 * │ Top: std iso at elevation        │ Top: std iso at elevation        │
 * └───────────────────────────────────┴───────────────────────────────────┘
 *
 * Key insight: front and cap SWAP their matrix signs between orientations.
 * Both cases: V-shape opens away from camera, solid faces toward player. ✓
 *
 * Draw order: end cap (further) → front (closer) → top cap (highest).
 *
 * @see isVerticalWall() for variant→orientation classification.
 * @see solver.ts wallBounds() for wall footprint geometry.
 * @see GitHub Issue #211 for derivation, geometric proofs, and fix history.
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

  // ─── Orientation-dependent geometry (v3 — dual-diagonal) ───
  //
  // A wall tile has two possible orientations:
  //
  //   HORIZONTAL (\  on screen): wall strip y=40..88, runs along x.
  //     Z-edge tile(128, 88) → screen (sX+168, sY+108)
  //     Front face: anchor tile(0, 88), matrix(1, 0.5, 0, 1), width=128
  //     End cap:    anchor tile(128, 40), matrix(-1, 0.5, 0, 1), width=48
  //
  //   VERTICAL   (/  on screen): wall strip x=40..88, runs along y.
  //     Z-edge tile(88, 128) → screen (sX+88, sY+108)
  //     Front face: anchor tile(88, 0), matrix(-1, 0.5, 0, 1), width=128
  //     End cap:    anchor tile(40, 128), matrix(1, 0.5, 0, 1), width=48
  //
  // Key insight: front and cap SWAP their matrices between orientations.
  // front(H)=matrix(1,0.5) ↔ cap(V)=matrix(1,0.5)
  // cap(H)=matrix(-1,0.5)  ↔ front(V)=matrix(-1,0.5)
  //
  // Both orientations: V-shape opens away from camera, solid faces player. ✓
  // @see side-by-side geometric proof in GitHub Issue #211.

  const NE = WALL_OFFSET + WALL_THICKNESS;  // near edge offset = 88

  // Compute per-orientation anchors
  let frontX: number, frontY: number;
  let capX: number, capY: number;
  let frontMat: 1 | -1; // sign of matrix a-component for front face

  if (vertical) {
    // Front face far corner: tile(NE, 0) = tile(88, 0)
    //   iso offset = (88, 44) → screen (sX+216, sY+44)
    frontX = screenX + HALF_W + NE;                               // sX + 216
    frontY = screenY + NE / 2;                                    // sY + 44
    // End cap far corner: tile(WALL_OFFSET, 128) = tile(40, 128)
    //   iso offset = (-88, 84) → screen (sX+40, sY+84)
    capX = screenX + HALF_W + WALL_OFFSET - MICRO_TILE_SIZE;      // sX + 40
    capY = screenY + (WALL_OFFSET + MICRO_TILE_SIZE) / 2;         // sY + 84
    frontMat = -1;  // front draws LEFT+DOWN (/ direction)
  } else {
    // Front face far corner: tile(0, NE) = tile(0, 88)
    //   iso offset = (-88, 44) → screen (sX+40, sY+44)
    frontX = screenX + HALF_W - NE;                               // sX + 40
    frontY = screenY + NE / 2;                                    // sY + 44
    // End cap far corner: tile(128, WALL_OFFSET) = tile(128, 40)
    //   iso offset = (88, 84) → screen (sX+216, sY+84)
    capX = screenX + HALF_W + MICRO_TILE_SIZE - WALL_OFFSET;      // sX + 216
    capY = screenY + (MICRO_TILE_SIZE + WALL_OFFSET) / 2;         // sY + 84
    frontMat = 1;   // front draws RIGHT+DOWN (\ direction)
  }

  // ── 1 + 2. Face rendering: corners/tees vs straights/ends ──────────────────────
  //
  // STRAIGHTS/ENDS: one primary face (128-wide) + optional narrow end cap.
  // CORNERS/TEES:   two explicit faces, each sized to match the exact arm extent:
  //   SOUTH face (\ on screen, mat=+1): y=88 plane, covers core+H-arms
  //   EAST  face (/ on screen, mat=-1): x=88 plane, covers core+V-arms
  //
  // Iso anchor formula: tile(tx,ty) → (sX+HALF_W+tx-ty, sY+(tx+ty)/2)
  //   South anchor = tile(sx0, 88) = (sX+HALF_W+sx0-88, sY+(sx0+88)/2)
  //   East  anchor = tile(88, ey0) = (sX+HALF_W+88-ey0, sY+(88+ey0)/2)
  //
  // @see GitHub Issue #211 for derivation.

  const CORNER_TEE = ['corner-br','corner-bl','corner-tr','corner-tl','tee-t','tee-b','tee-r','tee-l'];
  const isCornerOrTee = nano.variant !== undefined && CORNER_TEE.includes(nano.variant);

  if (isCornerOrTee && nano.sideTextureSvg) {
    // ── CORNERS + TEES: explicit dual-arm geometry ───────────────────────────────
    // South face params: sx0=tile-x start, sw=draw width (px)
    // East  face params: ey0=tile-y start, ew=draw width (px)
    // Widths fit exact arm extent (arm length = WALL_OFFSET=40 or wall+arm = 88 or full=128)
    let sx0 = 0, sw = 128, ey0 = 0, ew = 128;
    switch (nano.variant) {
      case 'corner-br': sx0 = 40; sw = 88; ey0 = 88; ew = 40; break;
      case 'corner-bl': sx0 = 0;  sw = 88; ey0 = 88; ew = 40; break;
      case 'corner-tr': sx0 = 40; sw = 88; ey0 = 0;  ew = 88; break;
      case 'corner-tl': sx0 = 0;  sw = 88; ey0 = 0;  ew = 88; break;
      case 'tee-t':     sx0 = 0;  sw = 128;ey0 = 0;  ew = 88; break;
      case 'tee-b':     sx0 = 0;  sw = 128;ey0 = 40; ew = 88; break;
      case 'tee-r':     sx0 = 40; sw = 88; ey0 = 0;  ew = 128;break;
      case 'tee-l':     sx0 = 0;  sw = 88; ey0 = 0;  ew = 128;break;
    }

    const sideImg = loadSvgImage(nano.sideTextureSvg);
    if (!sideImg) {
      loaded = false;
    } else {
      // South anchor: tile(sx0, NE) in screen space
      const sax = screenX + HALF_W + sx0 - NE;
      const say = screenY + (sx0 + NE) / 2;
      // East anchor: tile(NE, ey0) in screen space
      const eax = screenX + HALF_W + NE - ey0;
      const eay = screenY + (NE + ey0) / 2;

      // Draw East face first (further from camera — slight shadow ~0.14)
      ctx.save();
      ctx.translate(eax, eay);
      ctx.transform(-1, 0.5, 0, 1, 0, 0);
      ctx.drawImage(sideImg, 0, -drawH, ew, drawH);
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(0, -drawH, ew, drawH);
      ctx.restore();

      // Draw South face second (closer to camera — fully lit)
      ctx.save();
      ctx.translate(sax, say);
      ctx.transform(1, 0.5, 0, 1, 0, 0);
      ctx.drawImage(sideImg, 0, -drawH, sw, drawH);
      ctx.restore();
    }
  } else {
    // ── STRAIGHTS + ENDS: end cap then primary face ──────────────────────────────

    // ── 1. End cap (drawn first — further from camera) ───────────────────────────
    // Narrow (WALL_THICKNESS=48px) darkened face for exposed arm termini.
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

    // ── 2. Front face (drawn second — closer to camera) ──────────────────────────
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
  }

  // ── 3. Top cap: flat iso at elevated position  ──────────────────────────────────
  // topTextureSvg fills only the wall footprint strip (y=40..88 in tile-local).
  // Iso projection at elevatedY = screenY − drawH places it atop both side faces.
  //
  // Alignment proof: tile(128, 88) under iso transform at elevatedY maps to
  //   (cx + 40, elevatedY + 108) — the Z-edge top corner, where both face
  //   tops also converge. Top cap sits flush on the V-shaped face pair. ✓
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

// ─── Stack Rendering ─────────────────────────────────────────

/**
 * Draw a full nano stack for one tile.
 *
 * Nanos in NanoStack are assumed pre-sorted: negative Z first, then flat,
 * then positive (as per the NanoStack contract in types.ts).
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

// ─── Nano Shadow Rendering ───────────────────────────────────

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
  // Only positive nanos cast shadows
  if (nano.zMode !== 'positive' || nano.zOffset <= 0) return;

  const offset = computeShadowOffset(sun, nano.zOffset);
  const shadowScale = Math.min(nano.zOffset / 6, 1);

  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${sun.shadowAlpha * 0.5})`;

  // Shadow diamond centered on tile, offset by sun angle
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
