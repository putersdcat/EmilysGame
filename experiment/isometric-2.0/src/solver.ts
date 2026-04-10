/**
 * solver.ts — 2.0 Experiment: Continuous Feature Solver.
 * Resolves connections for multi-tile features: walls, fences, rivers.
 * Post-processes chunks to determine connection variants and ensure
 * seamless cross-chunk feature continuity.
 * TODO: DOC — solver algorithm, variant lookup table, cross-chunk protocol
 */

import {
  type MicroTile,
  type WorldUnitChunk,
  type NanoTileKind,
  type NanoTile,
  type FeatureConnections,
  type FeatureVariant,
  type EdgeMasks,
  type MacroAssembly,
  CHUNK_TILES,
  MICRO_TILE_SIZE,
} from './types';

// ─── Debug Mode ──────────────────────────────────────────────

/**
 * WALL_DEBUG_FLAT — when true, stone-wall SVGs render as solid flat colors
 * with white outlines instead of brick textures. Use this to inspect geometry
 * alignment at corners/tees before texturing. Set false to restore bricks.
 *
 *   Side face  → amber  #d4762a
 *   Top cap H  → green  #4caf50
 *   Top cap V  → blue   #1e88e5
 *   Outlines   → white  1.5px
 */
const WALL_DEBUG_FLAT = false;

// ─── Feature Configuration ───────────────────────────────────

/** Nano tile kinds that participate in same-kind connection solving. */
const CONNECTABLE_KINDS: ReadonlySet<NanoTileKind> = new Set([
  'stone-wall',
  'fence',
  'river',
]);

/** Extract the primary nano tile kind from a micro tile (first nano in stack). */
function getNanoKind(tile: MicroTile): NanoTileKind | null {
  return tile.nanos?.[0]?.kind ?? null;
}

/** Check if a source nano kind connects to a neighboring tile. */
function canConnect(source: NanoTileKind, neighbor: MicroTile | null): boolean {
  if (!neighbor) return false;
  const neighborNano = getNanoKind(neighbor);
  // Same nano kind connects
  if (neighborNano !== null && source === neighborNano) return true;
  // River connects to water biome tiles
  if (source === 'river' && neighbor.kind === 'water') return true;
  return false;
}

// ─── Neighbor Lookup ─────────────────────────────────────────

/**
 * Callback to get a tile from any world coordinates (cross-chunk aware).
 * Returns null if the tile doesn't exist (chunk not loaded, edge of world).
 */
export type NeighborLookup = (worldCol: number, worldRow: number) => MicroTile | null;

/** Cardinal neighbor set for a tile position. */
interface Neighbors {
  top: MicroTile | null;
  right: MicroTile | null;
  bottom: MicroTile | null;
  left: MicroTile | null;
}

/**
 * Get cardinal neighbors for a tile, using in-chunk access first,
 * then falling back to the cross-chunk lookup for boundary tiles.
 */
function getNeighbors(
  chunk: WorldUnitChunk,
  col: number,
  row: number,
  lookup: NeighborLookup,
): Neighbors {
  const worldCol = chunk.cx * CHUNK_TILES + col;
  const worldRow = chunk.cy * CHUNK_TILES + row;

  return {
    top: row > 0
      ? chunk.tiles[(row - 1) * CHUNK_TILES + col]
      : lookup(worldCol, worldRow - 1),
    right: col < CHUNK_TILES - 1
      ? chunk.tiles[row * CHUNK_TILES + col + 1]
      : lookup(worldCol + 1, worldRow),
    bottom: row < CHUNK_TILES - 1
      ? chunk.tiles[(row + 1) * CHUNK_TILES + col]
      : lookup(worldCol, worldRow + 1),
    left: col > 0
      ? chunk.tiles[row * CHUNK_TILES + col - 1]
      : lookup(worldCol - 1, worldRow),
  };
}

// ─── Connection Resolution ───────────────────────────────────

/** Determine connection flags for a connectable nano tile. */
function resolveConnections(kind: NanoTileKind, neighbors: Neighbors): FeatureConnections {
  return {
    top: canConnect(kind, neighbors.top),
    right: canConnect(kind, neighbors.right),
    bottom: canConnect(kind, neighbors.bottom),
    left: canConnect(kind, neighbors.left),
  };
}

// ─── Variant Selection ───────────────────────────────────────

/** Connection count helper. */
function connCount(c: FeatureConnections): number {
  return (c.top ? 1 : 0) + (c.right ? 1 : 0) + (c.bottom ? 1 : 0) + (c.left ? 1 : 0);
}

/**
 * Select the appropriate variant for a tile based on its connections.
 * This is a pure lookup: connections → variant.
 */
function selectVariant(conn: FeatureConnections): FeatureVariant {
  const n = connCount(conn);

  if (n === 0) return 'isolated';

  if (n === 1) {
    if (conn.top) return 'end-t';
    if (conn.right) return 'end-r';
    if (conn.bottom) return 'end-b';
    return 'end-l';
  }

  if (n === 2) {
    // Opposites → straight
    if (conn.top && conn.bottom) return 'straight-v';
    if (conn.left && conn.right) return 'straight-h';
    // Adjacent → corner
    if (conn.top && conn.right) return 'corner-tr';
    if (conn.top && conn.left) return 'corner-tl';
    if (conn.bottom && conn.right) return 'corner-br';
    return 'corner-bl';
  }

  if (n === 3) {
    // T-junction named by the missing connection
    if (!conn.top) return 'tee-t';
    if (!conn.right) return 'tee-r';
    if (!conn.bottom) return 'tee-b';
    return 'tee-l';
  }

  return 'cross';
}

// ─── Variant SVG Generation ──────────────────────────────────
// High-quality procedural SVGs for connection variants.
// TODO: DOC — SVG generation patterns for each feature kind

/**
 * Generate individual stone block SVGs for a rectangular region.
 * Produces staggered rows of stones with mortar gaps, color variation, and cracks.
 */
// ─── Seamless running-bond brick texture ────────────────────────────────────
//
// Brick spec (128-unit tile-local space):
//   BW=36  BH=14  MORTAR=4  →  courseW=40  courseH=18
//   Running bond: odd rows stagger by courseW/2 = 20 units.
//   Horizontal tiling: odd rows start at x-20 so left edge always shows a
//     half-brick (seamless with next tile's odd-row right half).
//   Vertical tiling: rows drawn from y-MORTAR so y=0 lands on clean mortar.
//
// Colors: earthy browns, terracotta, warm greys + light warm-grey mortar.
// Only <rect> elements — no filters/paths needed.

const BRICK_W = 36;
const BRICK_H = 14;
const BRICK_M = 4;  // mortar thickness

// Earthy brick palette: [r,g,b] tuples
const BRICK_PALETTE: [number, number, number][] = [
  [160, 78, 58],   // terracotta
  [148, 68, 48],   // deep terracotta
  [144, 104, 78],  // warm brown
  [124, 90, 68],   // medium brown
  [118, 86, 62],   // dark brown
  [152, 124, 98],  // tan
  [132, 118, 104], // warm grey
  [112, 100, 90],  // stone grey
];
const MORTAR_COLOR = '#c2b8b0'; // light warm-grey mortar

/**
 * Seamless running-bond brick fill for a rectangle in tile-local 128-unit space.
 * Horizontal orientation: brick courses run left-right (mortar lines are horizontal).
 * Used for side-face textures and H-arm tops.
 * bW/bH/bM: brick width, height, mortar gap — defaults match BRICK_W/H/M.
 */
function runningBondH(x: number, y: number, w: number, h: number, seed: number,
  bW = BRICK_W, bH = BRICK_H, bM = BRICK_M): string {
  const bCW = bW + bM;
  const bCH = bH + bM;
  const out: string[] = [];
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${MORTAR_COLOR}"/>`);

  let rowIdx = 0;
  for (let ry = y - bM; ry < y + h + bCH; ry += bCH) {
    const startX = x - (rowIdx % 2) * (bCW / 2);
    let colIdx = 0;
    for (let bx = startX; bx < x + w + bCW; bx += bCW) {
      const rx  = Math.max(bx, x);
      const ry2 = Math.max(ry, y);
      const rw  = Math.min(bx + bW, x + w) - rx;
      const rh  = Math.min(ry + bH, y + h) - ry2;
      if (rw <= 0 || rh <= 0) { colIdx++; continue; }

      const hash = ((seed * 1543 + rowIdx * 521 + colIdx * 97) >>> 0);
      const [br, bg, bb] = BRICK_PALETTE[hash % BRICK_PALETTE.length];
      const v = ((hash >> 8) % 17) - 8;
      const r = Math.max(0, Math.min(255, br + v));
      const g = Math.max(0, Math.min(255, bg + v));
      const b = Math.max(0, Math.min(255, bb + v));

      out.push(`<rect x="${rx}" y="${ry2}" width="${rw}" height="${rh}" fill="rgb(${r},${g},${b})"/>`);
      if (ry2 === ry && rh >= 3)
        out.push(`<rect x="${rx}" y="${ry2}" width="${rw}" height="2" fill="rgba(255,255,255,0.14)"/>`);
      if (ry + bH <= y + h) {
        const sy = Math.min(ry + bH - 2, y + h - 1);
        if (sy >= y && rh + ry2 >= sy + 2)
          out.push(`<rect x="${rx}" y="${sy}" width="${rw}" height="2" fill="rgba(0,0,0,0.18)"/>`);
      }
      colIdx++;
    }
    rowIdx++;
  }
  return out.join('');
}

/**
 * Seamless running-bond brick fill, rotated 90°.
 * Vertical orientation: brick courses run top-bottom (mortar lines are vertical).
 * Used for V-arm tops on the wall cap face so brick course direction aligns
 * with the wall's iso-projected / direction.
 */
/**
 * Vertical running-bond: brick courses run top-bottom (mortar lines are vertical).
 * Used for V-arm tops. bW/bH/bM: brick width (along arm), height (across arm), mortar gap.
 */
function runningBondV(x: number, y: number, w: number, h: number, seed: number,
  bW = BRICK_W, bH = BRICK_H, bM = BRICK_M): string {
  const bCW = bW + bM;
  const bCH = bH + bM;
  const out: string[] = [];
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${MORTAR_COLOR}"/>`);

  let colIdx = 0;
  for (let cx = x - bM; cx < x + w + bCH; cx += bCH) {
    // Odd columns offset by half course height → seamless tiling
    const startY = y - (colIdx % 2) * (bCW / 2);
    let rowIdx = 0;
    for (let by = startY; by < y + h + bCW; by += bCW) {
      const rx  = Math.max(cx, x);
      const ry2 = Math.max(by, y);
      const rw  = Math.min(cx + bH, x + w) - rx;  // bH is the "thin" dimension (across arm)
      const rh  = Math.min(by + bW, y + h) - ry2; // bW is the "long" dimension (along arm)
      if (rw <= 0 || rh <= 0) { rowIdx++; continue; }

      const hash = ((seed * 1543 + colIdx * 521 + rowIdx * 97) >>> 0);
      const [br, bg, bb] = BRICK_PALETTE[hash % BRICK_PALETTE.length];
      const v = ((hash >> 8) % 17) - 8;
      const r = Math.max(0, Math.min(255, br + v));
      const g = Math.max(0, Math.min(255, bg + v));
      const b = Math.max(0, Math.min(255, bb + v));

      out.push(`<rect x="${rx}" y="${ry2}" width="${rw}" height="${rh}" fill="rgb(${r},${g},${b})"/>`);
      // Left-edge highlight
      if (rx === cx && rw >= 3)
        out.push(`<rect x="${rx}" y="${ry2}" width="2" height="${rh}" fill="rgba(255,255,255,0.14)"/>`);
      // Right-edge shadow
      if (cx + bH <= x + w) {
        const sx = Math.min(cx + bH - 2, x + w - 1);
        if (sx >= x && rw + rx >= sx + 2)
          out.push(`<rect x="${sx}" y="${ry2}" width="2" height="${rh}" fill="rgba(0,0,0,0.18)"/>`);
      }
      rowIdx++;
    }
    colIdx++;
  }
  return out.join('');
}

/** Get wall footprint bounds based on variant and connection direction. */
/**
 * Edge-aligned wall bounds — each variant places the wall at the OUTER edge
 * of the tile so a perimeter ring forms a clean rectangle (no # crossings).
 *
 * Coordinate convention (tile-local 128×128, iso projection):
 *   y=0 = north vertex (far from camera),   y=128 = south vertex (near camera)
 *   x=0 = west vertex (left on screen),     x=128 = east vertex (right on screen)
 *
 * Corner naming encodes which arms connect to INTERIOR tiles (not which side
 * of the tile the wall occupies):
 *   corner-br (arms go bottom+right): outer corner at tile top-left (0,0)
 *   corner-bl (arms go bottom+left):  outer corner at tile top-right (128,0)
 *   corner-tr (arms go top+right):    outer corner at tile bottom-left (0,128)
 *   corner-tl (arms go top+left):     outer corner at tile bottom-right (128,128)
/** Get wall footprint bounds based on variant. Center-aligned to match drawExtrudedNano geometry. */
/**
 * Center-aligned wall bounds — matches drawExtrudedNano() hardcoded geometry.
 * WALL_OFFSET=40, WALL_THICKNESS=48, NE=88 (see nano-tile.ts).
 * H wall strip: y=40..88. V wall strip: x=40..88.
 * Corners have the ±40 center core plus arms to tile edges.
 * end-b/end-r alias straight-h/v (same center-aligned footprint; 3D face is
 * what differs, handled in drawExtrudedNano by isVerticalWall).
 */
export function wallBounds(variant: FeatureVariant): { rects: Array<{x:number,y:number,w:number,h:number}> } {
  const W = 48;
  const off = 40; // (128-48)/2
  const rects: Array<{x:number,y:number,w:number,h:number}> = [];

  const arms = { top: false, right: false, bottom: false, left: false };
  switch (variant) {
    case 'straight-h': case 'end-r': case 'end-l':  // E-W direction → H-strip (y=40..88)
      arms.left = true; arms.right = true; break;
    case 'straight-v': case 'end-t': case 'end-b':  // N-S direction → V-strip (x=40..88)
      arms.top = true; arms.bottom = true; break;
    case 'corner-tr': arms.top = true; arms.right = true; break;
    case 'corner-tl': arms.top = true; arms.left  = true; break;
    case 'corner-br': arms.bottom = true; arms.right = true; break;
    case 'corner-bl': arms.bottom = true; arms.left  = true; break;
    case 'cross':     arms.top = arms.right = arms.bottom = arms.left = true; break;
    case 'tee-t':     arms.left = arms.right = arms.bottom = true; break;
    case 'tee-b':     arms.left = arms.right = arms.top    = true; break;
    case 'tee-r':     arms.top  = arms.bottom = arms.left  = true; break;
    case 'tee-l':     arms.top  = arms.bottom = arms.right = true; break;
    default: // isolated
      rects.push({ x: off, y: off, w: W, h: W });
      return { rects };
  }

  rects.push({ x: off, y: off, w: W, h: W }); // centre core always present
  if (arms.top)    rects.push({ x: off,       y: 0,      w: W,  h: off });
  if (arms.bottom) rects.push({ x: off,       y: off+W,  w: W,  h: off });
  if (arms.left)   rects.push({ x: 0,         y: off,    w: off, h: W  });
  if (arms.right)  rects.push({ x: off+W,     y: off,    w: off, h: W  });

  return { rects };
}

/**
 * Exact point-vs-wall-footprint test in tile-local coordinates.
 * localX/localY are in MICRO_TILE_SIZE space (0..128).
 */
export function pointHitsWallFootprint(
  variant: FeatureVariant,
  localX: number,
  localY: number,
): boolean {
  const { rects } = wallBounds(variant);
  for (const r of rects) {
    if (localX >= r.x && localX < r.x + r.w && localY >= r.y && localY < r.y + r.h) {
      return true;
    }
  }
  return false;
}

/**
 * Fine-grained walkability check for a point inside a tile.
 * Unlike buildWalkableMap(), this respects the actual wall strip footprint so
 * the player can move up to the visible geometry rather than treating the whole
 * tile as blocked.
 */
export function isPointWalkableInTile(
  tile: MicroTile,
  activeConditions: Map<string, 'locked' | 'unlocked'>,
  localColFrac: number,
  localRowFrac: number,
): boolean {
  const nanos = tile.nanos ?? [];
  if (nanos.length === 0) return true;

  const localX = localColFrac * MICRO_TILE_SIZE;
  const localY = localRowFrac * MICRO_TILE_SIZE;
  let hasAlwaysPass = false;
  let blocked = false;

  for (const nano of nanos) {
    const walkable = nano.walkable;
    if (walkable.type === 'always') {
      hasAlwaysPass = true;
      continue;
    }

    if (walkable.type === 'conditional') {
      const state = activeConditions.get(walkable.conditionId);
      if (state === 'unlocked') {
        hasAlwaysPass = true;
        continue;
      }
    }

    if (nano.kind === 'stone-wall' && nano.variant) {
      if (pointHitsWallFootprint(nano.variant, localX, localY)) {
        blocked = true;
      }
      continue;
    }

    // Fallback for other never/locked nanos that still block their whole tile.
    blocked = true;
  }

  return hasAlwaysPass || !blocked;
}


/**
 * Generate a SIDE-VIEW SVG for a stone wall tile (transparent background).
 * This is the front face of the wall as seen through Z-pinned shear transform.
 * Used as both `svg` (fallback) and `sideTextureSvg` for extruded walls.
 *
 * The variant param is used to seed pseudo-random stone block variation
 * so adjacent tiles don't look identical.
 */
function stoneWallSvg(_variant: FeatureVariant): string {
  const SIDE_H = 48;
  if (WALL_DEBUG_FLAT) {
    // Flat amber fill + white border lines — pure geometry, no texture noise.
    // Vertical tick marks every 16px help spot misalignment.
    let ticks = '';
    for (let x = 16; x < 128; x += 16) {
      ticks += `<line x1="${x}" y1="0" x2="${x}" y2="${SIDE_H}" stroke="rgba(255,255,255,0.25)" stroke-width="0.5"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="${SIDE_H}" viewBox="0 0 128 ${SIDE_H}">`
      + `<rect width="128" height="${SIDE_H}" fill="#d4762a"/>`
      + ticks
      + `<rect width="128" height="${SIDE_H}" fill="none" stroke="white" stroke-width="1.5"/>`
      + `</svg>`;
  }
  const SIDE_H2 = 48;
  const seed = 0x4B57;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="${SIDE_H2}" viewBox="0 0 128 ${SIDE_H2}">`
    + runningBondH(0, 0, 128, SIDE_H2, seed, 20, 9, 2)
    + `</svg>`;
}

/**
 * Generate a TOP-VIEW SVG for a stone wall cap (transparent background).
 * Shows the wall footprint from above for the extruded top cap.
 *
 * Key rule: draw CONTINUOUS strips, not per-rect fragments.
 * The old per-rect approach used aspect ratio (w>h) to choose H vs V orientation
 * per rect, but the centre core is always square (48×48), so it was always forced
 * to H — causing visible 90° orientation flips right next to V-arm rects.
 *
 * Fix: two passes based on which arms are present:
 *   H-strip (left or right arm) → runningBondH, full y=off..off+W row
 *   V-strip (top or bottom arm) → runningBondV, full x=off..off+W column
 * Where both strips share the centre square, V is drawn last (wins), creating a
 * natural brick-course joint that reads correctly in iso.
 *
 * Exported so AiTools game-tile-renderer can use it for the extruded top face.
 */
export function stoneWallTopSvg(variant: FeatureVariant): string {
  const W = 48;
  const off = 40; // (128-W)/2 — matches drawExtrudedNano WALL_OFFSET
  const seed = 0x4B57; // same base seed as side face for colour continuity

  // Top cap units are stretched by the iso basis length sqrt(1^2 + 0.5^2) ≈ 1.118.
  // Side bricks are authored at 20×9 with 2px mortar, so shrink the top texture
  // to ~1/1.118 of those dimensions for a true 1:1 visual brick size match.
  // 20 / 1.118 ≈ 17.9 → 18, 9 / 1.118 ≈ 8.0 → 8, 2 / 1.118 ≈ 1.8 → 2.
  const capBW = 18, capBH = 8, capBM = 2;
  const parts: string[] = [];

  // Determine which cardinal arms are present for this variant
  const arms = { top: false, right: false, bottom: false, left: false };
  switch (variant) {
    case 'straight-h': case 'end-r': case 'end-l':  // E-W direction → H-strip
      arms.left = true;  arms.right  = true;  break;
    case 'straight-v': case 'end-t': case 'end-b':  // N-S direction → V-strip
      arms.top  = true;  arms.bottom = true;  break;
    case 'corner-tr': arms.top = true;    arms.right  = true; break;
    case 'corner-tl': arms.top = true;    arms.left   = true; break;
    case 'corner-br': arms.bottom = true; arms.right  = true; break;
    case 'corner-bl': arms.bottom = true; arms.left   = true; break;
    case 'cross':     arms.top = arms.right = arms.bottom = arms.left = true; break;
    case 'tee-t':     arms.left = arms.right  = arms.bottom = true; break;
    case 'tee-b':     arms.left = arms.right  = arms.top    = true; break;
    case 'tee-r':     arms.top  = arms.bottom = arms.left   = true; break;
    case 'tee-l':     arms.top  = arms.bottom = arms.right  = true; break;
    default: break; // isolated — only centre square
  }

  const hasH = arms.left  || arms.right;
  const hasV = arms.top   || arms.bottom;

  if (!hasH && !hasV) {
    // isolated — centre square only
    if (WALL_DEBUG_FLAT) {
      parts.push(`<rect x="${off}" y="${off}" width="${W}" height="${W}" fill="#4caf50"/>`);
      parts.push(`<rect x="${off}" y="${off}" width="${W}" height="${W}" fill="none" stroke="white" stroke-width="1.5"/>`);
    } else {
      parts.push(runningBondH(off, off, W, W, seed, capBW, capBH, capBM));
    }
  } else {
    // Pass 1: H strip
    const x0 = arms.left  ? 0   : off;
    const x1 = arms.right ? 128 : off + W;
    if (WALL_DEBUG_FLAT) {
      parts.push(`<rect x="${x0}" y="${off}" width="${x1 - x0}" height="${W}" fill="#4caf50"/>`);
      parts.push(`<rect x="${x0}" y="${off}" width="${x1 - x0}" height="${W}" fill="none" stroke="white" stroke-width="1.5"/>`);
    } else {
      parts.push(runningBondH(x0, off, x1 - x0, W, seed, capBW, capBH, capBM));
    }

    // Pass 2: V strip (drawn on top so corners look like two walls meeting)
    if (hasV) {
      const y0 = arms.top    ? 0   : off;
      const y1 = arms.bottom ? 128 : off + W;
      if (WALL_DEBUG_FLAT) {
        parts.push(`<rect x="${off}" y="${y0}" width="${W}" height="${y1 - y0}" fill="#1e88e5"/>`);
        parts.push(`<rect x="${off}" y="${y0}" width="${W}" height="${y1 - y0}" fill="none" stroke="white" stroke-width="1.5"/>`);
      } else {
        parts.push(runningBondV(off, y0, W, y1 - y0, seed, capBW, capBH, capBM));
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${parts.join('')}</svg>`;
}

/** Generate an SVG for a river tile variant. */
function riverSvg(variant: FeatureVariant, conn: FeatureConnections): string {
  const parts: string[] = [];

  // Grass background
  parts.push(`<rect width="128" height="128" fill="#3a7d44" />`);
  parts.push(`<ellipse cx="20" cy="20" rx="14" ry="10" fill="#458550" opacity="0.3" />`);
  parts.push(`<ellipse cx="108" cy="108" rx="12" ry="8" fill="#2d6838" opacity="0.25" />`);

  // Determine channel areas
  const chW = 64; // channel width
  const off = (128 - chW) / 2; // 32
  const bankW = 10; // bank thickness

  // Helper: draw a natural-edged bank using wavy paths
  function bankPath(x1: number, y1: number, x2: number, y2: number, waveSide: number): string {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(4, Math.floor(len / 16));
    let d = `M ${x1} ${y1}`;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mx = x1 + dx * t;
      const my = y1 + dy * t;
      const wave = Math.sin(t * Math.PI * 3) * 3 * waveSide;
      // Perpendicular offset
      const nx = -dy / len * wave;
      const ny = dx / len * wave;
      d += ` L ${(mx + nx).toFixed(1)} ${(my + ny).toFixed(1)}`;
    }
    return d;
  }

  // Isolated: circular pond
  if (variant === 'isolated') {
    parts.push(`<circle cx="64" cy="64" r="38" fill="#5a4a28" />`);
    parts.push(`<circle cx="64" cy="64" r="34" fill="#1a5588" />`);
    parts.push(`<circle cx="64" cy="64" r="24" fill="#2277aa" opacity="0.5" />`);
    parts.push(`<ellipse cx="58" cy="55" rx="10" ry="4" fill="rgba(255,255,255,0.1)" />`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">\n    ${parts.join('\n    ')}\n  </svg>`;
  }

  // Draw channel water with depth gradient
  const waterDefsId = `wg-${variant.replace(/[^a-z]/g, '')}`;
  parts.push(`<defs>`);
  parts.push(`  <linearGradient id="${waterDefsId}-h" x1="0" y1="0" x2="0" y2="1">`);
  parts.push(`    <stop offset="0%" stop-color="#3a6a30" />`);
  parts.push(`    <stop offset="15%" stop-color="#1a5588" />`);
  parts.push(`    <stop offset="50%" stop-color="#0d3a6a" />`);
  parts.push(`    <stop offset="85%" stop-color="#1a5588" />`);
  parts.push(`    <stop offset="100%" stop-color="#3a6a30" />`);
  parts.push(`  </linearGradient>`);
  parts.push(`  <linearGradient id="${waterDefsId}-v" x1="0" y1="0" x2="1" y2="0">`);
  parts.push(`    <stop offset="0%" stop-color="#3a6a30" />`);
  parts.push(`    <stop offset="15%" stop-color="#1a5588" />`);
  parts.push(`    <stop offset="50%" stop-color="#0d3a6a" />`);
  parts.push(`    <stop offset="85%" stop-color="#1a5588" />`);
  parts.push(`    <stop offset="100%" stop-color="#3a6a30" />`);
  parts.push(`  </linearGradient>`);
  parts.push(`</defs>`);

  // Water channels
  if (conn.top || conn.bottom) {
    const y1 = conn.top ? 0 : off;
    const y2 = conn.bottom ? 128 : off + chW;
    parts.push(`<rect x="${off - 4}" y="${y1}" width="${chW + 8}" height="${y2 - y1}" fill="url(#${waterDefsId}-v)" />`);
  }
  if (conn.left || conn.right) {
    const x1 = conn.left ? 0 : off;
    const x2 = conn.right ? 128 : off + chW;
    parts.push(`<rect x="${x1}" y="${off - 4}" width="${x2 - x1}" height="${chW + 8}" fill="url(#${waterDefsId}-h)" />`);
  }

  // Deeper center highlight
  if (conn.top || conn.bottom) {
    const y1 = conn.top ? 0 : off + 8;
    const y2 = conn.bottom ? 128 : off + chW - 8;
    parts.push(`<rect x="${off + 14}" y="${y1}" width="${chW - 28}" height="${y2 - y1}" fill="#0d3a6a" opacity="0.4" rx="4" />`);
  }
  if (conn.left || conn.right) {
    const x1 = conn.left ? 0 : off + 8;
    const x2 = conn.right ? 128 : off + chW - 8;
    parts.push(`<rect x="${x1}" y="${off + 14}" width="${x2 - x1}" height="${chW - 28}" fill="#0d3a6a" opacity="0.4" rx="4" />`);
  }

  // Natural-edge banks with earthy colors
  const bankColors = ['#6a5a28', '#5a4a20', '#7a6a34'];
  if (!conn.top) {
    const by = conn.left || conn.right ? off - 4 : off;
    parts.push(`<path d="${bankPath(off - 6, by, off + chW + 6, by, 1)} L ${off + chW + 6} ${by + bankW} L ${off - 6} ${by + bankW} Z" fill="${bankColors[0]}" />`);
    // Pebbles on bank
    parts.push(`<circle cx="${off + 10}" cy="${by + 5}" r="2" fill="#8a7a48" opacity="0.5" />`);
    parts.push(`<circle cx="${off + chW - 8}" cy="${by + 4}" r="1.5" fill="#9a8a58" opacity="0.4" />`);
  }
  if (!conn.bottom) {
    const by = conn.left || conn.right ? off + chW + 4 : off + chW;
    parts.push(`<path d="${bankPath(off - 6, by, off + chW + 6, by, -1)} L ${off + chW + 6} ${by - bankW} L ${off - 6} ${by - bankW} Z" fill="${bankColors[1]}" />`);
    parts.push(`<circle cx="${off + 20}" cy="${by - 4}" r="2" fill="#8a7a48" opacity="0.4" />`);
  }
  if (!conn.left) {
    const bx = conn.top || conn.bottom ? off - 4 : off;
    parts.push(`<path d="${bankPath(bx, off - 6, bx, off + chW + 6, 1)} L ${bx + bankW} ${off + chW + 6} L ${bx + bankW} ${off - 6} Z" fill="${bankColors[2]}" />`);
    parts.push(`<circle cx="${bx + 5}" cy="${off + 14}" r="1.5" fill="#8a7a48" opacity="0.5" />`);
  }
  if (!conn.right) {
    const bx = conn.top || conn.bottom ? off + chW + 4 : off + chW;
    parts.push(`<path d="${bankPath(bx, off - 6, bx, off + chW + 6, -1)} L ${bx - bankW} ${off + chW + 6} L ${bx - bankW} ${off - 6} Z" fill="${bankColors[0]}" />`);
    parts.push(`<circle cx="${bx - 5}" cy="${off + chW - 10}" r="2" fill="#9a8a58" opacity="0.4" />`);
  }

  // Flow ripple lines
  parts.push(`<g opacity="0.2">`);
  if (conn.top && conn.bottom) {
    for (let y = 10; y < 128; y += 18) {
      const x1 = off + 10 + Math.sin(y * 0.1) * 4;
      const x2 = off + chW - 10 + Math.sin(y * 0.1 + 1) * 4;
      parts.push(`<path d="M ${x1} ${y} Q ${64 + Math.sin(y * 0.08) * 6} ${y + 3} ${x2} ${y}" stroke="rgba(180,220,255,0.6)" stroke-width="1.2" fill="none" />`);
    }
  }
  if (conn.left && conn.right) {
    for (let x = 10; x < 128; x += 18) {
      const y1 = off + 10 + Math.sin(x * 0.1) * 4;
      const y2 = off + chW - 10 + Math.sin(x * 0.1 + 1) * 4;
      parts.push(`<path d="M ${x} ${y1} Q ${x + 3} ${64 + Math.sin(x * 0.08) * 6} ${x} ${y2}" stroke="rgba(180,220,255,0.6)" stroke-width="1.2" fill="none" />`);
    }
  }
  parts.push(`</g>`);

  // Surface light reflection
  parts.push(`<g opacity="0.15">`);
  if (conn.top || conn.bottom) {
    parts.push(`<ellipse cx="${64 - 6}" cy="40" rx="8" ry="3" fill="white" />`);
    parts.push(`<ellipse cx="${64 + 4}" cy="88" rx="6" ry="2.5" fill="white" />`);
  }
  if (conn.left || conn.right) {
    parts.push(`<ellipse cx="40" cy="${64 - 4}" rx="3" ry="7" fill="white" />`);
    parts.push(`<ellipse cx="90" cy="${64 + 2}" rx="2.5" ry="6" fill="white" />`);
  }
  parts.push(`</g>`);

  // Shore vegetation (small grass tufts near banks)
  parts.push(`<g stroke="#4a9a44" stroke-width="1.2" stroke-linecap="round" opacity="0.45">`);
  if (!conn.top) {
    parts.push(`<line x1="${off - 2}" y1="${off + bankW + 2}" x2="${off - 5}" y2="${off + bankW - 5}" />`);
    parts.push(`<line x1="${off + chW + 2}" y1="${off + bankW + 3}" x2="${off + chW + 5}" y2="${off + bankW - 4}" />`);
  }
  if (!conn.bottom) {
    parts.push(`<line x1="${off + 4}" y1="${off + chW - bankW}" x2="${off + 1}" y2="${off + chW - bankW + 6}" />`);
    parts.push(`<line x1="${off + chW - 4}" y1="${off + chW - bankW - 1}" x2="${off + chW - 1}" y2="${off + chW - bankW + 5}" />`);
  }
  parts.push(`</g>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join('\n    ')}
  </svg>`;
}

/** Generate an SVG for a tall grass tile with height variation. */
function tallGrassSvg(z: number, worldCol: number, worldRow: number): string {
  const hash = ((worldCol * 31337) ^ (worldRow * 82139)) >>> 0;
  const baseGreen = 0x2a + (hash % 30);
  const parts: string[] = [];

  // Rich base with color patches
  parts.push(`<rect width="128" height="128" fill="rgb(${baseGreen}, ${baseGreen + 50}, ${baseGreen - 8})" />`);
  // Ground variation
  const p1g = baseGreen + 10;
  parts.push(`<ellipse cx="40" cy="80" rx="28" ry="20" fill="rgb(${p1g - 5}, ${p1g + 45}, ${p1g - 12})" opacity="0.35" />`);
  parts.push(`<ellipse cx="95" cy="40" rx="22" ry="16" fill="rgb(${p1g - 15}, ${p1g + 35}, ${p1g - 18})" opacity="0.3" />`);

  // Dark ground shadow at root level
  parts.push(`<g fill="rgba(0,0,0,0.1)">`);
  parts.push(`<ellipse cx="35" cy="110" rx="24" ry="10" />`);
  parts.push(`<ellipse cx="80" cy="105" rx="28" ry="12" />`);
  parts.push(`<ellipse cx="110" cy="115" rx="16" ry="8" />`);
  parts.push(`</g>`);

  // Generate blade clusters based on z-height
  const bladeCount = 20 + z * 10;
  const blades: string[] = [];

  for (let i = 0; i < bladeCount; i++) {
    const h = ((hash * (i + 1) + i * 7717) >>> 0);
    const bx = 4 + (h % 120);
    const by = 120 - (h >> 8) % (15 + z * 8);
    const height = 14 + (z * 10) + (h >> 16) % 18;
    const sway = ((h >> 20) % 12) - 6;
    const green = baseGreen + (h >> 24) % 25;
    const width = 1.2 + z * 0.6 + ((h >> 4) % 3) * 0.3;

    // Curved blade using quadratic bezier
    const cpx = bx + sway * 0.6;
    const cpy = by - height * 0.5;
    const tipX = bx + sway;
    const tipY = by - height;

    const r = Math.max(0, green - 12);
    const g2 = Math.min(255, green + 48);
    const b2 = Math.max(0, green - 22);

    blades.push(
      `<path d="M ${bx} ${by} Q ${cpx} ${cpy} ${tipX} ${tipY}" stroke="rgb(${r},${g2},${b2})" stroke-width="${width}" stroke-linecap="round" fill="none" />`
    );

    // Seed head on some taller blades
    if (z >= 2 && height > 28 && (h >> 28) % 3 === 0) {
      blades.push(
        `<ellipse cx="${tipX}" cy="${tipY}" rx="1.5" ry="3" fill="rgb(${green + 30}, ${green + 20}, ${green - 10})" opacity="0.6" transform="rotate(${sway * 3},${tipX},${tipY})" />`
      );
    }
  }

  // Sort blades by y-position for crude depth
  parts.push(`<g>`);
  parts.push(blades.join('\n    '));
  parts.push(`</g>`);

  // Flower accents on some tiles
  if ((hash >> 12) % 4 === 0) {
    const fx = 20 + (hash % 88);
    const fy = 70 + (hash >> 6) % 30;
    const fc = (hash >> 10) % 3;
    const colors = ['#e8e040', '#e86080', '#d0a0e0'];
    parts.push(`<circle cx="${fx}" cy="${fy}" r="2.5" fill="${colors[fc]}" opacity="0.7" />`);
    parts.push(`<circle cx="${fx}" cy="${fy}" r="1" fill="white" opacity="0.5" />`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join('\n    ')}
  </svg>`;
}

/**
 * Generate a SIDE-VIEW SVG for a wooden fence tile (transparent background).
 * Shows the fence from the front: posts rising from bottom, rails connecting them.
 * Z-pinned shear will make it "stand up" along the iso left axis.
 *
 * Variant determines post layout:
 * - straight/cross/tee: Full-width fence with evenly-spaced posts + rails
 * - end-*: Half-width fence ending at a post
 * - isolated: Single prominent post (corner or terminal)
 * - diagonal/vertex: Handled by early-return above (not reached here)
 */
export function woodenFenceSvg(variant: FeatureVariant): string {
  const parts: string[] = [];

  // Side-view fence — NO grass background (transparent)
  // 128×128 SVG: x=0..128 is width along iso axis, y=0..128 is height
  // y=128 is ground level, y=0 is top

  const postW = 10;   // post width
  const railH = 7;    // rail thickness
  const capRy = 3;    // cap ellipse ry

  // Helper: post at centre-x, rising from base y=128 to topY
  function sidePost(cx: number, topY: number): string {
    const px = cx - postW / 2;
    const h = 128 - topY;
    return [
      // Post shadow
      `<rect x="${px + 2}" y="${topY + 3}" width="${postW}" height="${h}" rx="1.5" fill="rgba(0,0,0,0.15)" />`,
      // Post body
      `<rect x="${px}" y="${topY}" width="${postW}" height="${h}" rx="2" fill="#8B6914" />`,
      // Lighter grain strip
      `<rect x="${px + 2}" y="${topY}" width="3" height="${h}" fill="#a07820" opacity="0.4" />`,
      // Dark right edge
      `<rect x="${px + postW - 2}" y="${topY}" width="2" height="${h}" fill="#6a5010" opacity="0.3" />`,
      // Rounded top cap
      `<ellipse cx="${cx}" cy="${topY}" rx="${postW / 2}" ry="${capRy}" fill="#9a7018" />`,
      `<ellipse cx="${cx}" cy="${topY}" rx="${postW / 2 - 1}" ry="${capRy - 1}" fill="#b08828" opacity="0.5" />`,
    ].join('\n    ');
  }

  // Helper: horizontal rail from x1 to x2 at vertical position y
  function sideRail(x1: number, x2: number, y: number, lighter: boolean): string {
    const fill = lighter ? '#9a7018' : '#8B6914';
    const high = lighter ? '#b08828' : '#a07820';
    return [
      // Rail shadow
      `<rect x="${x1}" y="${y + 2}" width="${x2 - x1}" height="${railH}" rx="1.5" fill="rgba(0,0,0,0.12)" />`,
      // Rail body
      `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="${railH}" rx="1.5" fill="${fill}" />`,
      // Top highlight
      `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="2" rx="1" fill="${high}" opacity="0.3" />`,
    ].join('\n    ');
  }

  // Post top Y and rail positions (relative to 128-high canvas, ground at y=128)
  const postTopY = 10;          // posts extend from y=10 to y=128
  const topRailY = 30;          // upper rail
  const botRailY = 80;          // lower rail

  // ── Diagonal / vertex variants: early return with angled rail SVG ──
  // These don't fit the horizontal-arm model — draw perspective diagonal rails instead.
  // diagonal-right (\): rails slope downward left→right (fence goes into depth, NE-SW)
  // diagonal-left  (/): rails slope upward left→right (fence goes NW-SE cross-axis)
  // vertex: single centre post only (junction of two diagonal runs)
  if (variant === 'diagonal-right' || variant === 'diagonal-left' || variant === 'vertex') {
    const diagParts: string[] = [];
    if (variant === 'vertex') {
      // Just a single prominent post at centre
      diagParts.push(sidePost(64, postTopY));
    } else {
      // Angled rail: parallelogram strip from left edge to right edge
      // diagonal-right (\): y decreases left→right (going "up into" the scene)
      // diagonal-left (/): y increases left→right (coming "out of" the scene)
      const [yL, yR] = variant === 'diagonal-right'
        ? [topRailY + 22, topRailY - 8]   // left side lower, right side higher
        : [topRailY - 8,  topRailY + 22];  // left side higher, right side lower
      const [yL2, yR2] = variant === 'diagonal-right'
        ? [botRailY + 18, botRailY - 8]
        : [botRailY - 8,  botRailY + 18];
      // Upper rail as polygon parallelogram
      diagParts.push(
        `<polygon points="0,${yL + railH} 128,${yR + railH} 128,${yR} 0,${yL}" fill="#9a7018" />`,
        `<polygon points="0,${yL + 2} 128,${yR + 2} 128,${yR} 0,${yL}" fill="#b08828" opacity="0.3" />`,
        // Lower rail
        `<polygon points="0,${yL2 + railH} 128,${yR2 + railH} 128,${yR2} 0,${yL2}" fill="#8B6914" />`,
        `<polygon points="0,${yL2 + 2} 128,${yR2 + 2} 128,${yR2} 0,${yL2}" fill="#a07820" opacity="0.3" />`,
      );
      // Posts at left and right anchor points
      diagParts.push(sidePost(6,  Math.min(yL,  yL2)  - 6));
      diagParts.push(sidePost(122, Math.min(yR,  yR2) - 6));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${diagParts.join('\n    ')}
  </svg>`;
  }

  // Determine arm presence for orthogonal variants
  const arms = { left: false, right: false };

  switch (variant) {
    case 'straight-h': case 'cross': case 'tee-t': case 'tee-b':
      arms.left = arms.right = true; break;
    case 'straight-v':
      arms.left = arms.right = true; break; // show full fence face for vertical too
    case 'corner-tr': case 'end-r': case 'tee-l':
      arms.right = true; break;
    case 'corner-tl': case 'end-l': case 'tee-r':
      arms.left = true; break;
    case 'corner-br':
      arms.right = true; break;
    case 'corner-bl':
      arms.left = true; break;
    case 'end-t': case 'end-b':
      arms.left = arms.right = true; break; // terminal, show rail section
    case 'isolated':
      break; // just a post
    default:
      arms.left = arms.right = true; break;
  }

  // Draw rails behind posts
  if (arms.left && arms.right) {
    // Full-width rails: 0 → 128
    parts.push(sideRail(0, 128, topRailY, true));
    parts.push(sideRail(0, 128, botRailY, false));
  } else if (arms.right) {
    // Right half: center → right edge
    parts.push(sideRail(64, 128, topRailY, true));
    parts.push(sideRail(64, 128, botRailY, false));
  } else if (arms.left) {
    // Left half: left edge → center
    parts.push(sideRail(0, 64, topRailY, true));
    parts.push(sideRail(0, 64, botRailY, false));
  }

  // Draw posts
  if (arms.left && arms.right) {
    // Three-post full-width: left, center, right
    parts.push(sidePost(6, postTopY));
    parts.push(sidePost(64, postTopY));
    parts.push(sidePost(122, postTopY));
  } else if (arms.right) {
    parts.push(sidePost(64, postTopY));
    parts.push(sidePost(122, postTopY));
  } else if (arms.left) {
    parts.push(sidePost(6, postTopY));
    parts.push(sidePost(64, postTopY));
  } else {
    // Isolated: single prominent centre post
    parts.push(sidePost(64, postTopY));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join('\n    ')}
  </svg>`;
}

// ─── Tall Grass Height ──────────────────────────────────────

/** Hash-based height variation for tall grass: z = 1, 2, or 3. */
function tallGrassZ(worldCol: number, worldRow: number): number {
  const hash = ((worldCol * 48271) ^ (worldRow * 67867)) >>> 0;
  return 1 + (hash % 3);
}

// ─── Assembly Structure SVGs ─────────────────────────────────
// Shared between solver (getVariantSvg) and assemblies.ts (NanoTile.svg).
// TODO: DOC — all 128×128, viewBox 0 0 128 128, transparent-safe.

/**
 * Homestead wall — flat front-face panel for z-pinned billboard rendering.
 * Brown plank wall with red roof trim band, centered window, bottom door.
 * Designed for drawPositiveNano() z-pinned shear (128×128 flat panel).
 */
export function homesteadWallSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="#8B5E3C"/>
  <line x1="0" y1="20" x2="128" y2="20" stroke="#6a4028" stroke-width="1.5"/>
  <line x1="0" y1="40" x2="128" y2="40" stroke="#6a4028" stroke-width="1.5"/>
  <line x1="0" y1="60" x2="128" y2="60" stroke="#6a4028" stroke-width="1.5"/>
  <line x1="0" y1="80" x2="128" y2="80" stroke="#6a4028" stroke-width="1.5"/>
  <line x1="0" y1="100" x2="128" y2="100" stroke="#6a4028" stroke-width="1.5"/>
  <line x1="0" y1="21" x2="128" y2="21" stroke="#a06a40" stroke-width="1" opacity="0.4"/>
  <line x1="0" y1="41" x2="128" y2="41" stroke="#a06a40" stroke-width="1" opacity="0.4"/>
  <line x1="0" y1="61" x2="128" y2="61" stroke="#a06a40" stroke-width="1" opacity="0.4"/>
  <rect x="0" y="0" width="128" height="12" fill="#c0392b"/>
  <line x1="0" y1="12" x2="128" y2="12" stroke="#8a2020" stroke-width="1.5"/>
  <rect x="44" y="42" width="40" height="36" rx="2" fill="#1a3a5a"/>
  <rect x="44" y="42" width="40" height="36" rx="2" fill="none" stroke="#5a3a1a" stroke-width="3"/>
  <line x1="44" y1="60" x2="84" y2="60" stroke="#5a3a1a" stroke-width="2"/>
  <line x1="64" y1="42" x2="64" y2="78" stroke="#5a3a1a" stroke-width="2"/>
  <rect x="48" y="46" width="14" height="12" fill="#acd4e8" opacity="0.4"/>
  <rect x="50" y="90" width="28" height="38" rx="2" fill="#3d2010"/>
  <rect x="50" y="90" width="28" height="38" rx="2" fill="none" stroke="#5a2a10" stroke-width="2"/>
  <circle cx="74" cy="109" r="2.5" fill="#c09030"/>
</svg>`;
}

/** Cathedral stone wall column. variant='isolated'→spire, 'end-b'→ruined, default→full column. */
export function cathedralWallSvg(variant?: FeatureVariant): string {
  if (variant === 'isolated') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <polygon points="64,0 90,80 38,80"    fill="#4a4a4a"/>
  <rect x="30" y="80" width="68" height="48" fill="#6a6a6a"/>
  <line x1="30" y1="100" x2="98" y2="100" stroke="#555" stroke-width="1"/>
  <line x1="30" y1="118" x2="98" y2="118" stroke="#555" stroke-width="1"/>
  <polygon points="64,0 90,80 64,60" fill="#5a5a5a" opacity="0.4"/>
  <line x1="64" y1="4"  x2="64" y2="16" stroke="#999" stroke-width="2"/>
  <line x1="58" y1="8"  x2="70" y2="8"  stroke="#999" stroke-width="2"/>
</svg>`;
  }
  if (variant === 'end-b') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64">
  <rect x="0" y="0" width="128" height="64" fill="#6d6d6d"/>
  <line x1="0"  y1="22" x2="128" y2="22" stroke="#4a4a4a" stroke-width="1.5"/>
  <line x1="0"  y1="44" x2="128" y2="44" stroke="#4a4a4a" stroke-width="1.5"/>
  <line x1="32" y1="0"  x2="32"  y2="64" stroke="#4a4a4a" stroke-width="1"/>
  <line x1="80" y1="0"  x2="80"  y2="64" stroke="#4a4a4a" stroke-width="1"/>
  <polygon points="0,0 15,4 30,1 50,6 70,0 90,5 110,2 128,0 128,10 0,10" fill="#5a5a5a"/>
  <rect x="48" y="12" width="6" height="16" rx="3" fill="#1a1a1a"/>
</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64">
  <rect x="0" y="0" width="128" height="64" fill="#7f7f7f"/>
  <line x1="0"  y1="21" x2="128" y2="21" stroke="#555" stroke-width="1.5"/>
  <line x1="0"  y1="43" x2="128" y2="43" stroke="#555" stroke-width="1.5"/>
  <line x1="32" y1="0"  x2="32"  y2="64" stroke="#555" stroke-width="1"/>
  <line x1="64" y1="0"  x2="64"  y2="64" stroke="#555" stroke-width="1"/>
  <line x1="96" y1="0"  x2="96"  y2="64" stroke="#555" stroke-width="1"/>
  <rect x="0"  y="0"  width="128" height="64" fill="rgba(0,0,0,0.08)" opacity="0.15"/>
  <rect x="56" y="8"  width="6"   height="18" rx="3"  fill="#1a1a1a"/>
</svg>`;
}

// ─── SVG Selection ───────────────────────────────────────────

/**
 * Get the appropriate variant SVG for a solved nano tile.
 * Returns null if no variant SVG is needed (tile uses standard asset).
 */
export function getVariantSvg(
  nanoKind: NanoTileKind,
  variant: FeatureVariant,
  connections: FeatureConnections,
  zOffset: number,
  worldCol: number,
  worldRow: number,
): string | null {
  switch (nanoKind) {
    case 'stone-wall':
      return stoneWallSvg(variant);
    case 'fence':
      return woodenFenceSvg(variant);
    case 'river':
      return riverSvg(variant, connections);
    case 'tall-grass':
      return tallGrassSvg(zOffset, worldCol, worldRow);
    case 'gate':
      return gateSvg(false); // closed gate for preview
    case 'bridge':
      return bridgeSvg();
    case 'troll-bridge':
      return trollBridgeSvg(false); // not unlocked for preview
    case 'homestead-wall':
      return homesteadWallSvg();
    case 'cathedral-wall':
      return cathedralWallSvg(variant);
    case 'river-bank':
      return riverSvg(variant, connections); // reuse river texture with bank blend
    default:
      return null;
  }
}

// ─── Default Edge Masks ──────────────────────────────────────

const WALL_EDGE_MASKS: EdgeMasks = {
  top:    { samples: [1, 1, 1, 1, 1, 1, 1, 1] },
  right:  { samples: [1, 1, 1, 1, 1, 1, 1, 1] },
  bottom: { samples: [1, 1, 1, 1, 1, 1, 1, 1] },
  left:   { samples: [1, 1, 1, 1, 1, 1, 1, 1] },
};

const RIVER_EDGE_MASKS: EdgeMasks = {
  top:    { samples: [0.9, 0.7, 0.4, 0.2, 0.2, 0.4, 0.7, 0.9] },
  right:  { samples: [0.9, 0.7, 0.4, 0.2, 0.2, 0.4, 0.7, 0.9] },
  bottom: { samples: [0.9, 0.7, 0.4, 0.2, 0.2, 0.4, 0.7, 0.9] },
  left:   { samples: [0.9, 0.7, 0.4, 0.2, 0.2, 0.4, 0.7, 0.9] },
};

const GRASS_BLEND_MASKS: EdgeMasks = {
  top:    { samples: [0.8, 0.6, 0.4, 0.2, 0.2, 0.4, 0.6, 0.8] },
  right:  { samples: [0.8, 0.6, 0.4, 0.2, 0.2, 0.4, 0.6, 0.8] },
  bottom: { samples: [0.8, 0.6, 0.4, 0.2, 0.2, 0.4, 0.6, 0.8] },
  left:   { samples: [0.8, 0.6, 0.4, 0.2, 0.2, 0.4, 0.6, 0.8] },
};

// ─── World Pattern Generation ────────────────────────────────
// Demo patterns for continuous features that span multiple chunks.

/**
 * Check if a world position should be a stone wall.
 * Creates an L-shaped wall for demo purposes.
 */
export function isWallPosition(worldCol: number, worldRow: number): boolean {
  // Horizontal wall along row=5 from col=-2 to col=15
  if (worldRow === 5 && worldCol >= -2 && worldCol <= 15) return true;
  // Vertical wall along col=15 from row=5 to row=18
  if (worldCol === 15 && worldRow >= 5 && worldRow <= 18) return true;
  // Small T-junction wall
  if (worldRow === 12 && worldCol >= 10 && worldCol <= 15) return true;
  return false;
}

/**
 * Check if a world position should be a river tile.
 * Creates a winding river for demo purposes.
 */
export function isRiverPosition(worldCol: number, worldRow: number): boolean {
  // Main river running diagonally then horizontally
  // Diagonal segment: col 0-8, row 20 down to row 12
  const diagRow = 20 - worldCol;
  if (worldCol >= 0 && worldCol <= 8 && worldRow === diagRow) return true;
  // Horizontal segment: col 8-22, row 12
  if (worldRow === 12 && worldCol >= 8 && worldCol <= 22) return false; // overlap with wall
  if (worldRow === 18 && worldCol >= 3 && worldCol <= 20) return true;
  // Vertical segment: col 3, row 18 down to row 22
  if (worldCol === 3 && worldRow >= 18 && worldRow <= 24) return true;
  return false;
}

/**
 * Check if a world position should be tall grass.
 * Creates clusters using noise.
 */
export function isTallGrassPosition(worldCol: number, worldRow: number): boolean {
  const hash = ((worldCol * 92821) ^ (worldRow * 41077)) >>> 0;
  // ~15% of tiles in certain regions become tall grass
  if (worldRow >= 0 && worldRow <= 10 && worldCol >= -5 && worldCol <= 5) {
    return (hash % 7) === 0;
  }
  return false;
}

/**
 * Check if a world position should be a wooden fence.
 * Creates a rectangular fenced area for demo purposes.
 */
export function isFencePosition(worldCol: number, worldRow: number): boolean {
  // Fenced garden area: rectangle from (20,0) to (28,8)
  if (worldRow >= 0 && worldRow <= 8 && worldCol >= 20 && worldCol <= 28) {
    // Only the perimeter
    if (worldRow === 0 || worldRow === 8 || worldCol === 20 || worldCol === 28) {
      return true;
    }
  }
  return false;
}

// ─── Main Solver ─────────────────────────────────────────────

/**
 * Solve continuous features for a chunk.
 * Mutates tile array with resolved connections, variants, and SVGs.
 * Returns a new chunk with solved tiles.
 */
export function solveChunkFeatures(
  chunk: WorldUnitChunk,
  lookup: NeighborLookup,
): WorldUnitChunk {
  const newTiles: MicroTile[] = [];
  let changed = false;

  for (let row = 0; row < CHUNK_TILES; row++) {
    for (let col = 0; col < CHUNK_TILES; col++) {
      const tile = chunk.tiles[row * CHUNK_TILES + col];
      const worldCol = chunk.cx * CHUNK_TILES + col;
      const worldRow = chunk.cy * CHUNK_TILES + row;
      const nanoKind = getNanoKind(tile);

      // Diagonal fence tiles carry a pre-set variant — skip connection solving, just apply SVG
      if (nanoKind === 'fence') {
        const nano = tile.nanos![0]!;
        const v = nano.variant;
        if (v === 'diagonal-left' || v === 'diagonal-right' || v === 'vertex') {
          const updatedNano: NanoTile = { ...nano, svg: woodenFenceSvg(v) };
          newTiles.push({ ...tile, edgeMasks: GRASS_BLEND_MASKS, nanos: [updatedNano] });
          changed = true;
          continue;
        }
      }

      // Solve connections for connectable nano features
      if (nanoKind && CONNECTABLE_KINDS.has(nanoKind)) {
        const nano = tile.nanos![0]!;
        const neighbors = getNeighbors(chunk, col, row, lookup);
        const connections = resolveConnections(nanoKind, neighbors);
        const variant = selectVariant(connections);
        const variantSvg = getVariantSvg(
          nanoKind,
          variant,
          connections,
          nano.zOffset,
          worldCol,
          worldRow,
        );

        const edgeMasks = nanoKind === 'river' ? RIVER_EDGE_MASKS
          : nanoKind === 'fence' ? GRASS_BLEND_MASKS
          : WALL_EDGE_MASKS;

        const updatedNano: NanoTile = {
          ...nano,
          connections,
          variant,
          svg: variantSvg ?? nano.svg,
          // For extruded nanos (stone walls), set side+top textures properly
          ...(nanoKind === 'stone-wall' && variantSvg ? {
            sideTextureSvg: variantSvg,
            topTextureSvg: stoneWallTopSvg(variant),
          } : {}),
        };

        newTiles.push({
          ...tile,
          edgeMasks,
          nanos: [updatedNano],
        });
        changed = true;
        continue;
      }

      // Solve tall grass height variation
      if (nanoKind === 'tall-grass') {
        const nano = tile.nanos![0]!;
        const z = tallGrassZ(worldCol, worldRow);
        const svg = tallGrassSvg(z, worldCol, worldRow);

        const updatedNano: NanoTile = {
          ...nano,
          zOffset: z,
          svg,
        };

        newTiles.push({
          ...tile,
          edgeMasks: GRASS_BLEND_MASKS,
          nanos: [updatedNano],
        });
        changed = true;
        continue;
      }

      newTiles.push(tile);
    }
  }

  if (!changed) {
    // Still compute walkable map if not done yet
    if (chunk.walkableMap.length === 0) {
      return { ...chunk, walkableMap: buildWalkableMap(chunk) };
    }
    return chunk;
  }

  // ─── Gate & Bridge Placement Passes ───────────────────────────
  const { tiles: gatedTiles, newConditions: gateConditions } =
    placeGatesInFenceRuns(newTiles as MicroTile[], chunk.cx, chunk.cy);

  const { tiles: bridgedTiles, newConditions: bridgeConditions } =
    placeRiverCrossings(gatedTiles as MicroTile[], chunk.cx, chunk.cy);

  // Merge new conditions into the existing map (mutates chunk.activeConditions in place)
  for (const [id, state] of gateConditions) chunk.activeConditions.set(id, state);
  for (const [id, state] of bridgeConditions) chunk.activeConditions.set(id, state);

  // Build walkable map with merged conditions (temp object for computation only)
  const tempForWalkable = { ...chunk, tiles: bridgedTiles, activeConditions: chunk.activeConditions } as WorldUnitChunk;
  const wm = buildWalkableMap(tempForWalkable);

  return {
    ...chunk,
    tiles: bridgedTiles,
    dirty: true,
    walkableMap: wm,
    // activeConditions already mutated above — same Map reference carried via spread
  };
}


/**
 * Generate raw feature tiles for a world position.
 * Returns the NanoTileKind override if a feature should be placed here, or null.
 * This is called during chunk generation to lay down features before solving.
 */
/**
 * Returns the pre-set FeatureVariant for a diagonal fence demo tile, or null.
 * Diagonal fence tiles bypass orthogonal connection solving.
 */
export function getDiagonalFenceVariant(worldCol: number, worldRow: number): FeatureVariant | null {
  // Diagonal-right run (\ direction SW to NE): vertex → diag-r → diag-r → vertex
  if (worldCol === 17 && worldRow === 1) return 'vertex';
  if (worldCol === 18 && worldRow === 2) return 'diagonal-right';
  if (worldCol === 19 && worldRow === 3) return 'diagonal-right';
  if (worldCol === 20 && worldRow === 4) return 'vertex';
  // Diagonal-left run (/ direction SE to NW): vertex → diag-l → diag-l → vertex
  if (worldCol === 25 && worldRow === 1) return 'vertex';
  if (worldCol === 24 && worldRow === 2) return 'diagonal-left';
  if (worldCol === 23 && worldRow === 3) return 'diagonal-left';
  if (worldCol === 22 && worldRow === 4) return 'vertex';
  return null;
}

export function getFeatureKind(worldCol: number, worldRow: number): NanoTileKind | null {
  if (isWallPosition(worldCol, worldRow)) return 'stone-wall';
  if (isFencePosition(worldCol, worldRow)) return 'fence';
  if (getDiagonalFenceVariant(worldCol, worldRow)) return 'fence'; // diagonal demo fences
  if (isRiverPosition(worldCol, worldRow)) return 'river';
  if (isTallGrassPosition(worldCol, worldRow)) return 'tall-grass';
  return null;
}

// ─── Gate SVG Generator ───────────────────────────────────────

/** Generate an open or closed gate SVG. Horizontal orientation (rails run left-right). */
export function gateSvg(unlocked = false): string {
  const parts: string[] = [];
  parts.push(`<rect width="128" height="128" fill="#3a7d44" />`);
  parts.push(`<ellipse cx="64" cy="100" rx="30" ry="16" fill="#458550" opacity="0.4" />`);

  const postH = 48;
  const mid = 64;
  const railW = 6;

  // Left post
  parts.push(`<rect x="4" y="${mid - postH}" width="10" height="${postH}" rx="1.5" fill="#8B6914" />`);
  parts.push(`<rect x="6" y="${mid - postH}" width="3" height="${postH}" fill="#a07820" opacity="0.4" />`);
  parts.push(`<ellipse cx="9" cy="${mid - postH}" rx="5" ry="3" fill="#9a7018" />`);

  // Right post
  parts.push(`<rect x="114" y="${mid - postH}" width="10" height="${postH}" rx="1.5" fill="#8B6914" />`);
  parts.push(`<rect x="116" y="${mid - postH}" width="3" height="${postH}" fill="#a07820" opacity="0.4" />`);
  parts.push(`<ellipse cx="119" cy="${mid - postH}" rx="5" ry="3" fill="#9a7018" />`);

  if (unlocked) {
    // Gate swung open: gate panels angle away, showing opening
    parts.push(`<rect x="4" y="${mid - railW - 18}" width="${railW}" height="44" rx="1" fill="#9a7018" transform="rotate(-30, 9, ${mid - railW})" />`);
    parts.push(`<rect x="114" y="${mid - railW - 18}" width="${railW}" height="44" rx="1" fill="#9a7018" transform="rotate(30, 119, ${mid - railW})" />`);
    parts.push(`<text x="64" y="${mid - 4}" text-anchor="middle" font-size="14" fill="#4a8a54" font-family="monospace">[ open ]</text>`);
  } else {
    // Gate closed: two rails connecting posts
    const topY = mid - 18;
    const botY = mid + 2;
    // Top rail
    parts.push(`<rect x="14" y="${topY}" width="100" height="${railW}" rx="1" fill="#9a7018" />`);
    parts.push(`<rect x="14" y="${topY}" width="100" height="2" fill="#b08828" opacity="0.3" />`);
    // Bottom rail
    parts.push(`<rect x="14" y="${botY}" width="100" height="${railW}" rx="1" fill="#8B6914" />`);
    // Center picket cross-bar
    parts.push(`<rect x="61" y="${topY - 4}" width="${railW}" height="26" rx="1" fill="#a07820" />`);
    // Lock icon
    parts.push(`<rect x="58" y="${topY + 6}" width="12" height="9" rx="2" fill="#c0a020" />`);
    parts.push(`<path d="M61 ${topY + 6} Q61 ${topY + 2} 64 ${topY + 2} Q67 ${topY + 2} 67 ${topY + 6}" fill="none" stroke="#c0a020" stroke-width="2" />`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join('\n    ')}
  </svg>`;
}

// ─── Bridge SVG Generator ─────────────────────────────────────

/** Free bridge — stone arch supports, wooden deck, rope railing, water below.
 * Side-view panel for z-pinned billboard rendering (drawPositiveNano). */
function bridgeSvg(): string {
  const parts: string[] = [];
  // Water at base
  parts.push(`<rect x="0" y="88" width="128" height="40" fill="#1a5588"/>`);
  parts.push(`<rect x="0" y="88" width="128" height="12" fill="#0d3a6a"/>`);
  parts.push(`<path d="M8 94 Q40 90 72 94 Q104 98 120 94" stroke="rgba(180,220,255,0.6)" stroke-width="1" fill="none"/>`);
  // Stone arch piers
  parts.push(`<rect x="0" y="60" width="20" height="68" fill="#7a7060"/>`);
  parts.push(`<rect x="108" y="60" width="20" height="68" fill="#6a6050"/>`);
  parts.push(`<ellipse cx="10" cy="105" rx="9" ry="14" fill="#1a5588" opacity="0.6"/>`);
  parts.push(`<ellipse cx="118" cy="105" rx="9" ry="14" fill="#1a5588" opacity="0.6"/>`);
  parts.push(`<line x1="0" y1="72" x2="20" y2="72" stroke="#5a5040" stroke-width="1"/>`);
  parts.push(`<line x1="0" y1="82" x2="20" y2="82" stroke="#5a5040" stroke-width="1"/>`);
  parts.push(`<line x1="108" y1="72" x2="128" y2="72" stroke="#5a5040" stroke-width="1"/>`);
  parts.push(`<line x1="108" y1="82" x2="128" y2="82" stroke="#5a5040" stroke-width="1"/>`);
  // Wooden deck planks
  parts.push(`<rect x="18" y="60" width="92" height="8" fill="#8B6914"/>`);
  parts.push(`<rect x="18" y="68" width="92" height="6" fill="#7a5810"/>`);
  parts.push(`<rect x="18" y="74" width="92" height="6" fill="#9a7020"/>`);
  parts.push(`<rect x="18" y="80" width="92" height="8" fill="#8B6914"/>`);
  parts.push(`<line x1="18" y1="60" x2="110" y2="60" stroke="#b08828" stroke-width="1" opacity="0.4"/>`);
  parts.push(`<line x1="18" y1="68" x2="110" y2="68" stroke="#b08828" stroke-width="1" opacity="0.3"/>`);
  // Rope railing
  parts.push(`<path d="M18 58 Q50 52 64 55 Q78 52 110 58" stroke="#9a7850" stroke-width="2.5" fill="none"/>`);
  parts.push(`<line x1="28" y1="55" x2="28" y2="62" stroke="#7a5830" stroke-width="1.5"/>`);
  parts.push(`<line x1="50" y1="53" x2="50" y2="61" stroke="#7a5830" stroke-width="1.5"/>`);
  parts.push(`<line x1="78" y1="53" x2="78" y2="61" stroke="#7a5830" stroke-width="1.5"/>`);
  parts.push(`<line x1="100" y1="55" x2="100" y2="62" stroke="#7a5830" stroke-width="1.5"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join('\n    ')}
  </svg>`;
}

/** Troll bridge — rough stone piers, gapped planks, chain barrier, toll sign.
 * Side-view panel for z-pinned billboard rendering (drawPositiveNano).
 * Locked unless condition resolved. */
function trollBridgeSvg(unlocked: boolean): string {
  const parts: string[] = [];
  // Water at base
  parts.push(`<rect x="0" y="88" width="128" height="40" fill="#1a5588"/>`);
  parts.push(`<rect x="0" y="88" width="128" height="10" fill="#0d3a6a"/>`);
  parts.push(`<path d="M8 92 Q40 88 72 92 Q104 96 120 92" stroke="rgba(180,220,255,0.5)" stroke-width="1" fill="none"/>`);
  // Rough stone piers
  parts.push(`<rect x="0" y="52" width="24" height="76" fill="#6a6050"/>`);
  parts.push(`<rect x="104" y="52" width="24" height="76" fill="#5a5040"/>`);
  parts.push(`<line x1="0" y1="65" x2="24" y2="65" stroke="#4a4030" stroke-width="1"/>`);
  parts.push(`<line x1="0" y1="78" x2="24" y2="78" stroke="#4a4030" stroke-width="1"/>`);
  parts.push(`<line x1="0" y1="91" x2="24" y2="91" stroke="#4a4030" stroke-width="1"/>`);
  parts.push(`<line x1="104" y1="65" x2="128" y2="65" stroke="#4a4030" stroke-width="1"/>`);
  parts.push(`<line x1="104" y1="78" x2="128" y2="78" stroke="#4a4030" stroke-width="1"/>`);
  parts.push(`<line x1="104" y1="91" x2="128" y2="91" stroke="#4a4030" stroke-width="1"/>`);
  // Rough planks with gaps
  const roughColors = ['#6a4a10','#8B6014','#5a3a08','#7a5518','#6a4a10'];
  for (let i = 0; i < 5; i++) {
    const py = 58 + i * 7;
    parts.push(`<rect x="22" y="${py}" width="84" height="5" rx="0.5" fill="${roughColors[i]}"/>`);
    if (i === 1 || i === 3) {
      parts.push(`<rect x="55" y="${py}" width="5" height="5" fill="#2a1a04" opacity="0.6"/>`);
    }
  }
  if (unlocked) {
    // No barrier — text says open
    parts.push(`<text x="64" y="42" text-anchor="middle" font-size="10" font-family="monospace" fill="#4aff4a">OPEN</text>`);
  } else {
    // Chain barrier
    parts.push(`<path d="M22 38 Q64 44 106 38" stroke="#888888" stroke-width="3" fill="none"/>`);
    parts.push(`<path d="M22 44 Q64 50 106 44" stroke="#777777" stroke-width="2" fill="none"/>`);
    parts.push(`<circle cx="40" cy="41" r="3" fill="#999" stroke="#666" stroke-width="1"/>`);
    parts.push(`<circle cx="64" cy="47" r="3" fill="#999" stroke="#666" stroke-width="1"/>`);
    parts.push(`<circle cx="88" cy="41" r="3" fill="#999" stroke="#666" stroke-width="1"/>`);
    // Sign
    parts.push(`<rect x="46" y="14" width="36" height="28" rx="2" fill="#8B4513"/>`);
    parts.push(`<rect x="46" y="14" width="36" height="28" rx="2" fill="none" stroke="#6a3010" stroke-width="1.5"/>`);
    parts.push(`<text x="64" y="25" text-anchor="middle" font-size="7" font-family="monospace" font-weight="bold" fill="#ffd700">TROLL</text>`);
    parts.push(`<text x="64" y="35" text-anchor="middle" font-size="5" font-family="monospace" fill="#ffa500">TOLL: QUIZ</text>`);
    parts.push(`<line x1="50" y1="14" x2="46" y2="38" stroke="#888" stroke-width="1.5"/>`);
    parts.push(`<line x1="78" y1="14" x2="82" y2="38" stroke="#888" stroke-width="1.5"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join('\n    ')}
  </svg>`;
}

// ─── Gate Placement Pass ──────────────────────────────────────

/**
 * After connection solving, scan fence tiles and insert one gate per
 * continuous straight run. The gate position is entropy-seeded by (cx, cy).
 * Returns modified tile array and any new conditionIds to register.
 */
function placeGatesInFenceRuns(
  tiles: MicroTile[],
  cx: number,
  cy: number,
): { tiles: MicroTile[]; newConditions: Map<string, 'locked' | 'unlocked'> } {
  const newConditions = new Map<string, 'locked' | 'unlocked'>();
  const result = [...tiles];
  const N = CHUNK_TILES;

  // Scan horizontal runs (straight-h fence)
  for (let row = 0; row < N; row++) {
    const runIndices: number[] = [];
    for (let col = 0; col < N; col++) {
      const idx = row * N + col;
      const tile = result[idx];
      const nano = tile.nanos?.[0];
      if (nano?.kind === 'fence' && nano.variant === 'straight-h') {
        runIndices.push(idx);
      } else {
        if (runIndices.length >= 3) {
          const seed = ((cx * 131 + cy * 97 + row * 7) >>> 0);
          const gatePos = runIndices[seed % runIndices.length];
          const gt = result[gatePos];
          const wc = (cx * N) + (gatePos % N);
          const wr = (cy * N) + Math.floor(gatePos / N);
          const conditionId = `quiz:gate-${wc}-${wr}`;
          newConditions.set(conditionId, 'locked');
          const gateNano: NanoTile = {
            ...gt.nanos![0],
            kind: 'gate',
            svg: gateSvg(false),
            walkable: { type: 'conditional', conditionId },
          };
          result[gatePos] = { ...gt, nanos: [gateNano] };
        }
        runIndices.length = 0;
      }
    }
    // End of row
    if (runIndices.length >= 3) {
      const seed = ((cx * 131 + cy * 97 + row * 7) >>> 0);
      const gatePos = runIndices[seed % runIndices.length];
      const gt = result[gatePos];
      const wc = (cx * N) + (gatePos % N);
      const wr = (cy * N) + Math.floor(gatePos / N);
      const conditionId = `quiz:gate-${wc}-${wr}`;
      newConditions.set(conditionId, 'locked');
      const gateNano: NanoTile = {
        ...gt.nanos![0],
        kind: 'gate',
        svg: gateSvg(false),
        walkable: { type: 'conditional', conditionId },
      };
      result[gatePos] = { ...gt, nanos: [gateNano] };
    }
  }

  // Scan vertical runs (straight-v fence)
  for (let col = 0; col < N; col++) {
    const runIndices: number[] = [];
    for (let row = 0; row < N; row++) {
      const idx = row * N + col;
      const tile = result[idx];
      const nano = tile.nanos?.[0];
      if (nano?.kind === 'fence' && nano.variant === 'straight-v') {
        runIndices.push(idx);
      } else {
        if (runIndices.length >= 3) {
          const seed = ((cx * 97 + cy * 131 + col * 11) >>> 0);
          const gatePos = runIndices[seed % runIndices.length];
          const gt = result[gatePos];
          const wc = (cx * N) + (gatePos % N);
          const wr = (cy * N) + Math.floor(gatePos / N);
          const conditionId = `quiz:gate-${wc}-${wr}`;
          newConditions.set(conditionId, 'locked');
          const gateNano: NanoTile = {
            ...gt.nanos![0],
            kind: 'gate',
            svg: gateSvg(false),
            walkable: { type: 'conditional', conditionId },
          };
          result[gatePos] = { ...gt, nanos: [gateNano] };
        }
        runIndices.length = 0;
      }
    }
    if (runIndices.length >= 3) {
      const seed = ((cx * 97 + cy * 131 + col * 11) >>> 0);
      const gatePos = runIndices[seed % runIndices.length];
      const gt = result[gatePos];
      const wc = (cx * N) + (gatePos % N);
      const wr = (cy * N) + Math.floor(gatePos / N);
      const conditionId = `quiz:gate-${wc}-${wr}`;
      newConditions.set(conditionId, 'locked');
      const gateNano: NanoTile = {
        ...gt.nanos![0],
        kind: 'gate',
        svg: gateSvg(false),
        walkable: { type: 'conditional', conditionId },
      };
      result[gatePos] = { ...gt, nanos: [gateNano] };
    }
  }

  return { tiles: result, newConditions };
}

// ─── River Crossing Pass ──────────────────────────────────────

/**
 * After connection solving, find river tiles that form crossings
 * (connected on left+right OR top+bottom, with open banks on the crossing axis).
 * Place bridge or troll-bridge nanos on crossing tiles.
 * Uses entropy from (cx, cy) to choose bridge type.
 */
function placeRiverCrossings(
  tiles: MicroTile[],
  cx: number,
  cy: number,
): { tiles: MicroTile[]; newConditions: Map<string, 'locked' | 'unlocked'> } {
  const newConditions = new Map<string, 'locked' | 'unlocked'>();
  const result = [...tiles];
  const N = CHUNK_TILES;
  const entropy = ((cx * 31 + cy * 17) >>> 0);

  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const idx = row * N + col;
      const tile = result[idx];
      const nano = tile.nanos?.[0];
      if (!nano || nano.kind !== 'river') continue;

      // Find horizontal crossing: river running left-right (straight-h), flanked by non-river above/below
      const conn = nano.connections;
      if (!conn) continue;
      const isHorizontalRun = (conn.left || conn.right) && !(conn.top || conn.bottom);
      const isVerticalRun   = (conn.top || conn.bottom) && !(conn.left || conn.right);

      // Only flat-crossing tiles (a river run bridged perpendicular)
      if (!isHorizontalRun && !isVerticalRun) continue;

      // Check if it's a "crossing" — tile above or below (horizontal) is non-river
      // For a bridge, we need accessibility from both sides
      // Simple heuristic: place bridge every 5th tile along the crossing axis
      const straightIdx = isHorizontalRun ? col : row;
      if (straightIdx % 5 !== 2) continue; // bridge every 5 tiles, offset by 2

      const worldCol = cx * N + col;
      const worldRow = cy * N + row;

      // Entropy: 1/3 chance of troll bridge, 2/3 free bridge
      const isTroll = (entropy + col * 7 + row * 13) % 3 === 0;

      if (isTroll) {
        const conditionId = `quiz:bridge-${worldCol}-${worldRow}`;
        newConditions.set(conditionId, 'locked');
        const bridgeNano: NanoTile = {
          kind: 'troll-bridge',
          zOffset: 0,
          zMode: 'flat',
          svg: trollBridgeSvg(false),
          walkable: { type: 'conditional', conditionId },
          blendEdges: false,
        };
        result[idx] = { ...tile, nanos: [...tile.nanos!, bridgeNano] };
      } else {
        const bridgeNano: NanoTile = {
          kind: 'bridge',
          zOffset: 0,
          zMode: 'flat',
          svg: bridgeSvg(),
          walkable: { type: 'always' },
          blendEdges: false,
        };
        result[idx] = { ...tile, nanos: [...tile.nanos!, bridgeNano] };
      }
    }
  }

  return { tiles: result, newConditions };
}

// ─── Walkable Map ─────────────────────────────────────────────

/**
 * Build a boolean walkable map for the chunk.
 * true = passable, false = blocked.
 *
 * Rules (in priority order):
 *   1. Base tile = walkable
 *   2. ANY nano with type:'never' blocks (most restrictive rule)
 *   3. UNLESS any nano with type:'always' overrides (bridge wins over river)
 *   4. type:'conditional' blocks if condition is 'locked', passable if 'unlocked'
 */
export function buildWalkableMap(chunk: WorldUnitChunk): boolean[] {
  const N = CHUNK_TILES;
  const map: boolean[] = new Array(N * N).fill(true);

  for (let i = 0; i < N * N; i++) {
    const tile = chunk.tiles[i];
    if (!tile.nanos || tile.nanos.length === 0) continue;

    let hasNeverBlock = false;
    let hasAlwaysPass = false;
    let hasConditionalUnlocked = false;
    let hasConditionalLocked = false;

    for (const nano of tile.nanos) {
      switch (nano.walkable.type) {
        case 'never':
          hasNeverBlock = true;
          break;
        case 'always':
          hasAlwaysPass = true; // bridge overrides river never-walkable
          break;
        case 'conditional': {
          const state = chunk.activeConditions.get(nano.walkable.conditionId);
          if (state === 'unlocked') hasConditionalUnlocked = true;
          else hasConditionalLocked = true; // locked gate/troll-bridge
          break;
        }
      }
    }

    // Priority order: locked conditional > unlocked conditional > always > never > passable
    if (hasConditionalLocked) {
      map[i] = false; // locked gate/troll-bridge always blocks, even over bridge
    } else if (hasConditionalUnlocked || hasAlwaysPass) {
      map[i] = true;  // unlocked or always-passable bridge overrides river
    } else if (hasNeverBlock) {
      map[i] = false; // wall/fence/river without bridge
    }
    // else: stays true (plain passable tile)
  }

  return map;
}

// ─── BFS Traversability ───────────────────────────────────────

/**
 * BFS from every traversable tile on the N-edge.
 * Checks if at least one S-edge tile is reachable.
 * Returns false if any chunk edge is entirely blocked (trap detected).
 *
 * Uses locked walkable map (worst-case; conditional nanos = blocked).
 */
export function validateChunkTraversability(chunk: WorldUnitChunk): boolean {
  const N = CHUNK_TILES;
  const walkable = chunk.walkableMap.length === N * N
    ? chunk.walkableMap
    : buildWalkableMap(chunk);

  const visited = new Uint8Array(N * N);
  const queue: number[] = [];

  // Seed BFS from all N-edge (row=0) walkable tiles
  for (let col = 0; col < N; col++) {
    const idx = col;
    if (walkable[idx] && !visited[idx]) {
      visited[idx] = 1;
      queue.push(idx);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const r = Math.floor(cur / N);
    const c = cur % N;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const ni = nr * N + nc;
      if (!visited[ni] && walkable[ni]) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
  }

  // Check if any S-edge (row=N-1) tile was reached
  for (let col = 0; col < N; col++) {
    if (visited[(N - 1) * N + col]) return true;
  }

  // Also check W and E edges for any reachability
  for (let row = 0; row < N; row++) {
    if (visited[row * N] || visited[row * N + N - 1]) return true;
  }

  return false;
}

// ─── Condition Resolution ─────────────────────────────────────

/**
 * Unlock a condition on a chunk (gate/bridge quiz answer).
 * Updates the gate/bridge SVG to show open state, marks chunk dirty.
 */
export function resolveCondition(chunk: WorldUnitChunk, conditionId: string): void {
  if (!chunk.activeConditions.has(conditionId)) return;
  chunk.activeConditions.set(conditionId, 'unlocked');
  chunk.dirty = true;

  // The visual update (open SVG swap) happens via chunk re-bake in the render loop.
  // For the walkable map, rebuild it immediately so movement unblocks right away.
  const newMap = buildWalkableMap(chunk);
  chunk.walkableMap.length = 0;
  chunk.walkableMap.push(...newMap);
}

/**
 * Unlock all conditions in a chunk (debug shortcut: U key).
 */
export function resolveAllConditions(chunk: WorldUnitChunk): void {
  for (const key of chunk.activeConditions.keys()) {
    chunk.activeConditions.set(key, 'unlocked');
  }
  chunk.dirty = true;
  const newMap = buildWalkableMap(chunk);
  chunk.walkableMap.length = 0;
  chunk.walkableMap.push(...newMap);
}

// ─── Macro Assembly Placement ─────────────────────────────────

/**
 * Place a MacroAssembly's nanos into the tiles of a single chunk.
 * Tiles outside this chunk's bounds are silently skipped (multi-chunk assemblies
 * apply partially per chunk — call for every generated chunk).
 * Merges nanos into existing tile nanos, sorted neg→flat→pos by zMode.
 * TODO: DOC — assembly placement pipeline, multi-chunk spanning
 */
export function placeAssembly(
  assembly: MacroAssembly,
  originCol: number,
  originRow: number,
  chunk: WorldUnitChunk,
): void {
  const chunkOriginCol = chunk.cx * CHUNK_TILES;
  const chunkOriginRow = chunk.cy * CHUNK_TILES;

  const zOrder: Record<string, number> = { 'negative': 0, 'flat': 1, 'positive': 2 };

  for (const placement of assembly.placements) {
    const worldCol = originCol + placement.col;
    const worldRow = originRow + placement.row;

    const localCol = worldCol - chunkOriginCol;
    const localRow = worldRow - chunkOriginRow;
    if (localCol < 0 || localCol >= CHUNK_TILES || localRow < 0 || localRow >= CHUNK_TILES) {
      // TODO: multi-chunk spanning tracked — tile belongs to a different chunk
      continue;
    }

    const idx = localRow * CHUNK_TILES + localCol;
    const tile = chunk.tiles[idx];
    const existing: readonly NanoTile[] = tile.nanos ?? [];
    const merged: NanoTile[] = [...existing, ...placement.nanos];
    merged.sort((a, b) => (zOrder[a.zMode] ?? 1) - (zOrder[b.zMode] ?? 1));

    (chunk.tiles as MicroTile[])[idx] = { ...tile, nanos: merged };
  }

  chunk.dirty = true;
}

