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
 * Draw a nano with 3-face extrusion: front face + end cap + top cap.
 * Creates a proper isometric 3D box for thick structural nanos (stone walls).
 *
 * ═══ ISOMETRIC BOX GEOMETRY (v2 — 180° fix) ═══
 *
 * Camera views from south-east (screen bottom) looking north-west (screen top).
 * Visible faces of the wall box face TOWARD the camera:
 *
 *   1. FRONT FACE (main lit surface):
 *      At y=88 in tile-local (the NEAR edge of the wall strip, faces +y).
 *      Anchored at tile(0, 88) — far-left corner (away from camera).
 *      matrix(1, 0.5, 0, 1) draws right-and-down along +x iso axis to Z-edge.
 *      Width = MICRO_TILE_SIZE (128px — full wall length).
 *
 *   2. END CAP (shadow/depth face):
 *      At x=128 in tile-local (the RIGHT edge of the wall strip, faces +x).
 *      Anchored at tile(128, 40) — far-right corner (away from camera).
 *      matrix(-1, 0.5, 0, 1) draws left-and-down along +y iso axis to Z-edge.
 *      Width = WALL_THICKNESS (48px — wall cross-section depth).
 *
 *   3. TOP CAP (flat iso at elevation):
 *      Standard iso transform: matrix(1, 0.5, -1, 0.5) at elevated Y.
 *      topTextureSvg fills only the wall strip (y=40..88); rest transparent.
 *
 * ═══ Z-EDGE (SHARED VERTICAL CORNER) ═══
 *
 * Both faces converge at the Z-edge: nearest corner to camera.
 *
 *   Tile-local: (128, 88) = (MICRO_TILE_SIZE, WALL_OFFSET + WALL_THICKNESS)
 *   Iso offset from top vertex: (128−88, 64+44) = (40, 108)
 *   Screen: (screenX + 168, screenY + 108)
 *
 * ═══ FACE ANCHORS (straight-h, drawH = D) ═══
 *
 *   Front face anchor: tile(0, 88)
 *     iso offset = (−88, 44) → screen (screenX+40, screenY+44)
 *     Bottom: (sX+40, sY+44) → (sX+168, sY+108) = Z-edge ✓
 *     Top:    (sX+40, sY+44−D) → (sX+168, sY+108−D)       ✓
 *
 *   End cap anchor: tile(128, 40)
 *     iso offset = (88, 84) → screen (screenX+216, screenY+84)
 *     Bottom: (sX+216, sY+84) → (sX+168, sY+108) = Z-edge ✓
 *     Top:    (sX+216, sY+84−D) → (sX+168, sY+108−D)      ✓
 *
 * ═══ SCREEN LAYOUT ═══
 *
 *           Top vtx (cx, screenY)
 *                ◇
 *              ╱   ╲
 *           ╱ top cap╲
 *         ╱  ═══════  ╲
 *       ◇───║front ║───◇ Right vtx
 *  Left  ╲  ║face  ║cap║
 *  vtx    ╲ ║(lit) ║(sh)║
 *          ╲║      ║   ║
 *           ╲══════╬═══╝
 *                ◇ Z-edge (nearest to camera)
 *              Bottom vtx
 *
 * Draw order: end cap (further) → front (closer) → top cap.
 * The V-shape of the two side faces opens AWAY from camera (upward),
 * showing solid exterior surfaces to the player. ✓
 *
 * @see solver.ts wallBounds() for wall footprint geometry
 * @see GitHub Issue #211 for derivation and fix history
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

  // ─── Face Anchors (v2 — 180° fix) ───
  // Each face anchored at its FAR corner (away from camera), draws TOWARD
  // the Z-edge at tile(128, 88) → screen (screenX+168, screenY+108).
  // This makes solid exterior face the camera (V opens upward/away). ✓

  // Front face far corner: tile(0, WALL_OFFSET + WALL_THICKNESS)
  //   iso offset = (−(WALL_OFFSET+WALL_THICKNESS), (WALL_OFFSET+WALL_THICKNESS)/2)
  const frontFaceY = WALL_OFFSET + WALL_THICKNESS;              // 88
  const frontX = screenX + HALF_W - frontFaceY;                 // screenX + 40
  const frontY = screenY + frontFaceY / 2;                      // screenY + 44

  // End cap far corner: tile(MICRO_TILE_SIZE, WALL_OFFSET)
  //   iso offset = (MICRO_TILE_SIZE − WALL_OFFSET, MICRO_TILE_SIZE/2 + WALL_OFFSET/2)
  const capX = screenX + HALF_W + MICRO_TILE_SIZE - WALL_OFFSET; // screenX + 216
  const capY = screenY + (MICRO_TILE_SIZE + WALL_OFFSET) / 2;    // screenY + 84

  // ── 1. End cap: LEFT iso axis, shadow side  ────────────────────────────────────
  // Drawn first (further from camera). Anchored at tile(128,40), draws
  // left-and-down via matrix(-1, 0.5, 0, 1) toward Z-edge at tile(128,88).
  // Width = WALL_THICKNESS (48px — wall cross-section depth).
  if (nano.sideTextureSvg) {
    const sideImg = loadSvgImage(nano.sideTextureSvg);
    if (sideImg) {
      ctx.save();
      ctx.translate(capX, capY);
      ctx.transform(-1, 0.5, 0, 1, 0, 0);
      ctx.drawImage(sideImg, 0, -drawH, WALL_THICKNESS, drawH);
      // Darken — end cap receives less direct sunlight
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, -drawH, WALL_THICKNESS, drawH);
      ctx.restore();
    } else {
      loaded = false;
    }
  }

  // ── 2. Front face: RIGHT iso axis, lit main surface  ───────────────────────────
  // Drawn second (closer to camera — the main visible wall surface).
  // Anchored at tile(0,88), draws right-and-down via matrix(1, 0.5, 0, 1)
  // toward Z-edge at tile(128,88). Full tile length along wall run.
  // Width = MICRO_TILE_SIZE (128px).
  if (nano.sideTextureSvg) {
    const sideImg = loadSvgImage(nano.sideTextureSvg);
    if (sideImg) {
      ctx.save();
      ctx.translate(frontX, frontY);
      ctx.transform(1, 0.5, 0, 1, 0, 0);
      ctx.drawImage(sideImg, 0, -drawH, MICRO_TILE_SIZE, drawH);
      ctx.restore();
    } else {
      loaded = false;
    }
  } else {
    // No dedicated side texture — fall back to billboard rendering
    if (!drawPositiveNano(ctx, nano, screenX, screenY, sun)) loaded = false;
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
