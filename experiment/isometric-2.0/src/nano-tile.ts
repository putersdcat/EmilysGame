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
import { wallBounds } from './solver';
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
 *
 * NOTE: kept as documented constants — the v5 per-rect renderer derives
 * geometry directly from solver.wallBounds() rather than these values.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WALL_THICKNESS = 48;                                    // solver.ts W
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WALL_OFFSET = (MICRO_TILE_SIZE - WALL_THICKNESS) / 2;  // solver.ts off = 40

/**
 * Determine if a wall variant's PRIMARY run direction is vertical ("/" on screen).
 * Used by the legacy single-face extrusion path; the v5 per-rect renderer
 * does not call this. Kept for AiTools/game-tile-renderer.ts which still
 * mirrors the old approach.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isVerticalWall(variant: FeatureVariant | undefined): boolean {
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

  // ─── Per-rect extruded faces (v5 — single image, aligned-grout) ───
  //
  // ONE source image (sideTextureSvg) is used for BOTH side faces and the
  // top face via ctx.createPattern(). Pattern phase is anchored at a single
  // per-tile screen point (the bottom-front corner of the full diamond,
  // elevated by drawH) so:
  //
  //   • Every face of the same wall samples a CONSISTENT pattern → grout
  //     lines continue across rect boundaries within a tile (corner /
  //     tee variants don't show a seam between arms).
  //   • South face's TOP edge and top face's FRONT edge share source y=0
  //     → mortar lines wrap from side onto top across the wall-top edge.
  //   • Adjacent tiles re-derive the same anchor at world-tile-origin
  //     spacing, so pattern phase repeats every game-tile (128 source-px
  //     period divides evenly into the iso step) → no inter-tile seam.
  //
  // Rect occlusion: if another rect in the same variant abuts on the
  // south or east boundary, that face is hidden by the adjacent rect's
  // matching face; skip drawing it. This avoids overdraw and z-fighting
  // along internal arm joints.
  //
  // @see textures/stone-brick.ts for the texture image.
  // @see solver.ts wallBounds() for per-variant rect layout.
  // @see AiTools/game-tile-renderer.ts for the SVG-path mirror (separate code).

  const variant = nano.variant ?? 'straight-h';
  const { rects } = wallBounds(variant);

  function southOccluded(r: { x: number; y: number; w: number; h: number }): boolean {
    return rects.some(o => o !== r && o.y === r.y + r.h
      && o.x < r.x + r.w && o.x + o.w > r.x);
  }
  function eastOccluded(r: { x: number; y: number; w: number; h: number }): boolean {
    return rects.some(o => o !== r && o.x === r.x + r.w
      && o.y < r.y + r.h && o.y + o.h > r.y);
  }
  // ENDFACE detection: a face is an END (header/cap) if it's at the
  // terminal of a wall RUN — meaning (a) no rect extends further in that
  // direction, AND (b) the wall does extend in the OPPOSITE direction
  // (so this isn't a side face along the wall's length), AND (c) the
  // rect's edge does NOT sit on the tile boundary (otherwise the wall
  // continues into the neighbor tile — wallBounds only extends arms to
  // the tile edge when a connection is intended).
  function southIsEnd(r: { x: number; y: number; w: number; h: number }): boolean {
    if (r.y + r.h >= MICRO_TILE_SIZE) return false; // connects to S neighbor
    const noSouth = !rects.some(o => o.y >= r.y + r.h && o.x < r.x + r.w && o.x + o.w > r.x);
    const hasNorth = rects.some(o => o.y + o.h <= r.y && o.x < r.x + r.w && o.x + o.w > r.x);
    return noSouth && hasNorth;
  }
  function eastIsEnd(r: { x: number; y: number; w: number; h: number }): boolean {
    if (r.x + r.w >= MICRO_TILE_SIZE) return false; // connects to E neighbor
    const noEast = !rects.some(o => o.x >= r.x + r.w && o.y < r.y + r.h && o.y + o.h > r.y);
    const hasWest = rects.some(o => o.x + o.w <= r.x && o.y < r.y + r.h && o.y + o.h > r.y);
    return noEast && hasWest;
  }
  const isoX = (tx: number, ty: number) => screenX + tx - ty + HALF_W;
  const isoY = (tx: number, ty: number) => screenY + (tx + ty) / 2;

  // Shared pattern anchor (screen): bottom-front corner of the full tile
  // diamond, elevated by the wall height. All face pattern transforms
  // map source (0,0) → THIS screen point. (Math derivation in commit msg.)
  const ANCHOR_SX = screenX;                       // = isoX(0, 128)
  const ANCHOR_SY = screenY + HALF_H - drawH;      // = isoY(0, 128) - drawH

  if (nano.sideTextureSvg) {
    const sideImg = loadSvgImage(nano.sideTextureSvg);
    if (sideImg) {
      // SIDE-SOUTH pattern — source axes (right=(1,0.5), down=(0,1)) match
      // the canvas shear used during south-face fill, so source-y=0 lies on
      // the wall-top sheared screen line.
      const sPattern = ctx.createPattern(sideImg, 'repeat');
      // SIDE-EAST pattern — source axes (right=(-1,0.5), down=(0,1)) match
      // the canvas shear used during east-face fill.
      const ePattern = ctx.createPattern(sideImg, 'repeat');
      // TOP pattern — source axes (right=(1,0.5), down=(-1,0.5)) match the
      // canvas shear used during top fill. CRITICALLY this shares its
      // source-x axis with the SIDE-SOUTH pattern, so source-y=0 traces
      // the SAME screen line on both → mortar continuity across the
      // south-top edge.
      const tPattern = ctx.createPattern(sideImg, 'repeat');

      if (sPattern && ePattern && tPattern) {
        // ── SIDE: south + east faces, per visible rect ───────────────
        for (const r of rects) {
          if (!southOccluded(r)) {
            const ex = isoX(r.x, r.y + r.h);
            const ey = isoY(r.x, r.y + r.h);
            // Pattern transform DERIVED:
            //   M_canvas (south) = (1, 0.5, 0, 1)
            //   For source-x → screen direction (1, 0.5) (along wall top
            //   edge), pattern linear part must be IDENTITY. Composing
            //   IDENTITY with the canvas shear gives source-x → screen
            //   (1, 0.5) ✓ and source-y → screen (0, 1) ✓ (gravity).
            //
            //   Previous version used (1, 0.5, 0, 1) for the linear part —
            //   that double-sheared the source so bricks ran at 45° down,
            //   instead of along the iso wall edge. This was the visible
            //   over-slant on the south face.
            //
            //   dx = ANCHOR_SX − ex       (canvas-local Δ for anchor)
            //   dy = (ANCHOR_SY − ey) − 0.5·dx   (canvas shear y-offset)
            const dx = ANCHOR_SX - ex;
            const dy = (ANCHOR_SY - ey) - 0.5 * dx;
            sPattern.setTransform({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
            ctx.save();
            ctx.translate(ex, ey);
            ctx.transform(1, 0.5, 0, 1, 0, 0);
            ctx.fillStyle = sPattern;
            ctx.fillRect(0, -drawH, r.w, drawH);
            // END-FACE grout overlay: draw horizontal mortar lines at the
            // same course pitch (8px) the side faces use, so the side's
            // brick courses visually continue ONTO the end cap. We do NOT
            // change the underlying texture — just stroke continuation
            // grout lines (and one centered vertical "perp" grout to break
            // the long brick illusion).
            if (southIsEnd(r)) {
              // END-FACE: short vertical mortar ticks descending from each
              // top COURSE-mortar line where it meets the end-face top
              // edge. One brick deep. Corner bricks (x=0, x=r.w) stay
              // unbroken — they wrap around the wall corner.
              ctx.fillStyle = '#1c1a17';
              const COURSE_PITCH = 8;
              const TICK_DEPTH = 7;
              const TICK_W = 2;
              for (let x = COURSE_PITCH; x < r.w; x += COURSE_PITCH) {
                ctx.fillRect(x - TICK_W / 2, -drawH + 1, TICK_W, TICK_DEPTH);
              }
            }
            ctx.restore();
          }
          if (!eastOccluded(r)) {
            const ex = isoX(r.x + r.w, r.y);
            const ey = isoY(r.x + r.w, r.y);
            // East canvas shear is (-1, 0.5, 0, 1). To anchor pattern source
            // (0,0) at ANCHOR via this shear:
            //   dx = ex − ANCHOR_SX  (note: −1 sign on shear flips dx sign)
            //   dy = (ANCHOR_SY − ey) − 0.5·dx
            const dx = ex - ANCHOR_SX;
            const dy = (ANCHOR_SY - ey) - 0.5 * dx;
            // Pattern axes IDENTITY in canvas-local; canvas shear already
            // gives source-x → screen (-1, 0.5) and source-y → screen (0,1).
            ePattern.setTransform({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
            ctx.save();
            ctx.translate(ex, ey);
            ctx.transform(-1, 0.5, 0, 1, 0, 0);
            ctx.fillStyle = ePattern;
            ctx.fillRect(0, -drawH, r.h, drawH);
            // Directional shading: east receives less light → darken.
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fillRect(0, -drawH, r.h, drawH);
            // END-FACE: course-aligned vertical mortar ticks (mirror).
            if (eastIsEnd(r)) {
              ctx.fillStyle = '#1c1a17';
              const COURSE_PITCH = 8;
              const TICK_DEPTH = 7;
              const TICK_W = 2;
              for (let x = COURSE_PITCH; x < r.h; x += COURSE_PITCH) {
                ctx.fillRect(x - TICK_W / 2, -drawH + 1, TICK_W, TICK_DEPTH);
              }
            }
            ctx.restore();
          }
        }

        // ── TOP: fill each rect (footprint) on the elevated diamond ──
        // The top canvas transform is matrix(1, 0.5, -1, 0.5, screenX+HALF_W,
        // elevatedY). In that frame, the ANCHOR screen point lands at
        // canvas-local (0, 128) — the back-left vertex of the diamond.
        // Pattern transform IDENTITY-with-translate (0, 128) makes source
        // (0,0) land there. Source-x axis maps via canvas shear to screen
        // (1, 0.5) — same as side-south's source-x → grout aligns.
        const elevatedY = screenY - drawH;
        const cx = screenX + HALF_W;
        // TOP pattern transform: orientation-dependent so brick rows
        // run ALONG the wall's primary length axis on the top face.
        //
        //   H-axis variants (wall extends along world-x, screen direction
        //   (1, 0.5)): pattern (1,0,0,1) → source-x → screen (1, 0.5) ✓
        //
        //   V-axis variants (wall extends along world-y, screen direction
        //   (-1, 0.5)): pattern (0,1,1,0) [transposed] composed with the
        //   top shear (1, 0.5, -1, 0.5) yields:
        //     source-x → canvas (0,1) → screen (-1, 0.5) ✓ along V-wall
        //     source-y → canvas (1,0) → screen (1, 0.5)   (course pitch)
        //
        // GROUT-RIDGE ALIGNMENT (iter14, derived):
        //
        //   Goal: at the wall's front-top ridge, top face samples the SAME
        //   source pixel the side face samples, AND the source-y axis on
        //   top runs INTO the wall (screen direction (-1, 0.5)).
        //
        //   Top frame: shear (1, 0.5, -1, 0.5). For source-y → screen
        //   (-1, 0.5) we need pattern d-axis = (0, 1) → linear (1,0,0,1).
        //
        //   At the ridge corner of straight-h core (tile 40,88), top
        //   user-space coord is (40, 88) and side samples source (80, 88)
        //   there (from anchor math). To make top sample (80, 88) at user
        //   (40, 88) with identity linear: e = 80 - 40 = 40 (mod 128),
        //   f = 88 - 88 = 0.
        //
        //   For V wall: transposed (a=0,b=1,c=-1,d=0) for source-x → screen
        //   (-1, 0.5) along V wall ridge; e=88, f=80 (mirrored algebra).
        // ── TOP-FACE RECT BUILDER (corner/tee winner-takes-strip) ──
        //
        // The `rects` array above describes the wall FOOTPRINT (used for
        // side faces, occlusion tests, and end-cap detection). For the TOP
        // face we deliberately use a DIFFERENT decomposition because brick
        // courses on top must run ALONG the wall's length axis, and a
        // single tile can contain BOTH an H run and a V run (corners/tees).
        //
        // Picking one global pattern made the whole tile read in that one
        // orientation, so a corner-br tile drawn with H pattern showed
        // H bricks bending down through the V arm — looked like the top
        // texture wrapped around the corner like an L.
        //
        // Picking pattern per footprint-rect made each arm correct in
        // isolation but introduced TWO competing brick courses meeting at
        // the inside-corner core, with neither matching the neighbor tile.
        //
        // Solution: for each variant, declare a "winner" wall (the one
        // whose bricks pass STRAIGHT through the central core) and a
        // "loser" wall (the one whose top is just the stub of footprint
        // NOT covered by the winner strip). The winner strip extends from
        // tile edge to tile edge along its axis, swallowing the central
        // core. The loser stub gets the perpendicular pattern.
        //
        // For corner-br: winner = H (strip y ∈ [off, off+W], x ∈ [off, 128]).
        //                loser  = V (stub  x ∈ [off, off+W], y ∈ [off+W, 128]).
        //
        // The choice of "H wins" for all corners/tees/cross is arbitrary
        // but consistent: H wall reads as continuous straight-through
        // wherever it meets a V wall. The V wall then butts into it on
        // the neighbor tile (the V neighbor's own straight-v top draws
        // up to the shared tile boundary, where it meets the H winner).
        const W2 = 48; const off2 = 40;
        type Rect = { x:number; y:number; w:number; h:number; v:boolean };
        const tops: Rect[] = [];
        // Two pattern transforms — kept here (not hoisted) because they
        // are only used by this block. See iter14 derivation comment above
        // for why H = (1,0,0,1, 40,0) and V = (0,1,-1,0, 88,40).
        const setH = () => tPattern.setTransform({ a: 1, b: 0, c: 0, d: 1, e: 40, f: 0 });
        const setV = () => tPattern.setTransform({ a: 0, b: 1, c: -1, d: 0, e: 88, f: 40 });
        if (variant === 'straight-h') {
          tops.push({ x: 0, y: off2, w: 128, h: W2, v: false });
        } else if (variant === 'straight-v') {
          tops.push({ x: off2, y: 0, w: W2, h: 128, v: true });
        } else if (variant === 'corner-br') {
          // H winner: core + right arm as one strip.
          // V loser:  bottom-arm stub only.
          tops.push({ x: off2, y: off2, w: 128 - off2, h: W2, v: false });
          tops.push({ x: off2, y: off2 + W2, w: W2, h: off2, v: true });
        } else if (variant === 'corner-bl') {
          tops.push({ x: 0, y: off2, w: off2 + W2, h: W2, v: false });
          tops.push({ x: off2, y: off2 + W2, w: W2, h: off2, v: true });
        } else if (variant === 'corner-tr') {
          tops.push({ x: off2, y: off2, w: 128 - off2, h: W2, v: false });
          tops.push({ x: off2, y: 0, w: W2, h: off2, v: true });
        } else if (variant === 'corner-tl') {
          tops.push({ x: 0, y: off2, w: off2 + W2, h: W2, v: false });
          tops.push({ x: off2, y: 0, w: W2, h: off2, v: true });
        } else if (variant === 'tee-t' || variant === 'tee-b' || variant === 'cross') {
          // H winner runs the full width of the tile; V stubs hang off
          // the core to whichever side(s) the variant calls for.
          tops.push({ x: 0, y: off2, w: 128, h: W2, v: false });
          if (variant === 'tee-b' || variant === 'cross') tops.push({ x: off2, y: 0, w: W2, h: off2, v: true });
          if (variant === 'tee-t' || variant === 'cross') tops.push({ x: off2, y: off2 + W2, w: W2, h: off2, v: true });
        } else if (variant === 'tee-l' || variant === 'tee-r') {
          // No H arm in these tees → V is the only continuous run, so it
          // wins. H stub on the side that has the arm.
          tops.push({ x: off2, y: 0, w: W2, h: 128, v: true });
          if (variant === 'tee-l') tops.push({ x: off2 + W2, y: off2, w: off2, h: W2, v: false });
          else                     tops.push({ x: 0,         y: off2, w: off2, h: W2, v: false });
        } else {
          // end-* and isolated — single rect, pattern matches the wall axis.
          for (const r of rects) tops.push({ ...r, v: (variant === 'end-t' || variant === 'end-b') });
        }

        ctx.save();
        clipDiamond(ctx, cx, elevatedY + HALF_H, HALF_W, HALF_H);
        ctx.transform(1, 0.5, -1, 0.5, cx, elevatedY);
        for (const r of tops) {
          if (r.v) setV(); else setH();
          ctx.fillStyle = tPattern;
          ctx.fillRect(r.x, r.y, r.w, r.h);
        }
        // (Removed per-rect strokeRect overlay — it was a debug helper that
        // drew visible orange/black dividing lines on the top face between
        // adjacent footprint rects. The brick pattern alone provides the
        // visual definition we need.)
        ctx.restore();
      } else {
        loaded = false;
      }
    } else {
      loaded = false;
    }
  } else {
    // No dedicated side texture — fall back to billboard rendering
    if (!drawPositiveNano(ctx, nano, screenX, screenY, sun)) loaded = false;
  }

  // Note: the TOP face is drawn inside the side-pattern block above (it
  // shares the same image and pattern anchor for grout continuity). We
  // intentionally ignore nano.topTextureSvg here for stone-wall — it
  // remains used by the legacy SVG render path only (AiTools).

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
