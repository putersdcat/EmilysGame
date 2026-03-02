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
  type TileKind,
  type FeatureConnections,
  type FeatureVariant,
  type EdgeMasks,
  CHUNK_TILES,
} from './types';

// ─── Feature Configuration ───────────────────────────────────

/** Tile kinds that participate in same-kind connection solving. */
const CONNECTABLE_KINDS: ReadonlySet<TileKind> = new Set([
  'stone-wall',
  'wooden-fence',
  'river',
]);

/** Check if two kinds connect to each other. */
function canConnect(source: TileKind, neighbor: TileKind): boolean {
  // Rivers also connect to water (flow into lakes/ocean)
  if (source === 'river' && neighbor === 'water') return true;
  return source === neighbor;
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

/** Determine connection flags for a connectable tile. */
function resolveConnections(kind: TileKind, neighbors: Neighbors): FeatureConnections {
  return {
    top: neighbors.top !== null && canConnect(kind, neighbors.top.kind),
    right: neighbors.right !== null && canConnect(kind, neighbors.right.kind),
    bottom: neighbors.bottom !== null && canConnect(kind, neighbors.bottom.kind),
    left: neighbors.left !== null && canConnect(kind, neighbors.left.kind),
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
function stoneBlocks(x: number, y: number, w: number, h: number, seed: number): string {
  const blocks: string[] = [];
  const gap = 2; // mortar gap
  const rowH = 12;
  let row = 0;

  for (let ry = y; ry < y + h - 2; ry += rowH + gap) {
    const remainH = Math.min(rowH, y + h - ry - gap);
    if (remainH < 4) break;
    // Stagger every other row
    const offset = (row % 2 === 0) ? 0 : 14;
    let bx = x + offset;
    let stoneIdx = 0;

    while (bx < x + w - 2) {
      const hash = ((seed * 7919 + row * 6581 + stoneIdx * 3571) >>> 0);
      const bw = 20 + (hash % 18); // Stone width 20-37
      const actualW = Math.min(bw, x + w - bx - gap);
      if (actualW < 8) break;

      // Color variation: base grey with slight warm/cool shift
      const base = 88 + (hash >> 8) % 30;
      const r = base + ((hash >> 12) % 10) - 5;
      const g = base + ((hash >> 16) % 8) - 4;
      const b = base + ((hash >> 20) % 12) - 2;

      blocks.push(
        `<rect x="${bx}" y="${ry}" width="${actualW}" height="${remainH}" rx="1.5" fill="rgb(${r},${g},${b})" />`
      );

      // Top highlight
      blocks.push(
        `<rect x="${bx}" y="${ry}" width="${actualW}" height="${Math.min(3, remainH)}" rx="1" fill="rgba(255,255,255,0.08)" />`
      );

      // Bottom shadow
      blocks.push(
        `<rect x="${bx}" y="${ry + remainH - 2}" width="${actualW}" height="2" rx="0.5" fill="rgba(0,0,0,0.12)" />`
      );

      // Occasional crack
      if ((hash >> 24) % 5 === 0 && actualW > 14) {
        const cx1 = bx + 4 + (hash % (actualW - 8));
        const cy1 = ry + 2;
        const cx2 = cx1 + ((hash >> 4) % 5) - 2;
        const cy2 = ry + remainH - 2;
        blocks.push(
          `<line x1="${cx1}" y1="${cy1}" x2="${cx2}" y2="${cy2}" stroke="rgba(0,0,0,0.18)" stroke-width="0.8" />`
        );
      }

      bx += actualW + gap;
      stoneIdx++;
    }
    row++;
  }
  return blocks.join('\n    ');
}

/**
 * Generate capstone row (slightly different colored stones on top of wall).
 */
function capStones(x: number, y: number, w: number, seed: number): string {
  const caps: string[] = [];
  const capH = 6;
  let bx = x;
  let idx = 0;
  while (bx < x + w - 2) {
    const hash = ((seed * 4271 + idx * 9137) >>> 0);
    const bw = 16 + (hash % 14);
    const actualW = Math.min(bw, x + w - bx - 2);
    if (actualW < 6) break;
    const grey = 105 + (hash >> 8) % 20;
    caps.push(
      `<rect x="${bx}" y="${y}" width="${actualW}" height="${capH}" rx="1.5" fill="rgb(${grey},${grey - 2},${grey - 5})" stroke="rgba(0,0,0,0.1)" stroke-width="0.5" />`
    );
    bx += actualW + 2;
    idx++;
  }
  return caps.join('\n    ');
}

/** Get wall footprint bounds based on variant and connection direction. */
function wallBounds(variant: FeatureVariant): { rects: Array<{x:number,y:number,w:number,h:number}> } {
  const W = 48; // wall thickness
  const off = (128 - W) / 2; // 40
  const rects: Array<{x:number,y:number,w:number,h:number}> = [];

  // Arm definitions: which edges the wall extends to
  const arms = { top: false, right: false, bottom: false, left: false };
  switch (variant) {
    case 'straight-h': arms.left = true; arms.right = true; break;
    case 'straight-v': arms.top = true; arms.bottom = true; break;
    case 'corner-tr': arms.top = true; arms.right = true; break;
    case 'corner-tl': arms.top = true; arms.left = true; break;
    case 'corner-br': arms.bottom = true; arms.right = true; break;
    case 'corner-bl': arms.bottom = true; arms.left = true; break;
    case 'cross': arms.top = arms.right = arms.bottom = arms.left = true; break;
    case 'tee-t': arms.left = arms.right = arms.bottom = true; break;
    case 'tee-b': arms.left = arms.right = arms.top = true; break;
    case 'tee-r': arms.top = arms.bottom = arms.left = true; break;
    case 'tee-l': arms.top = arms.bottom = arms.right = true; break;
    case 'end-t': arms.bottom = true; break;
    case 'end-b': arms.top = true; break;
    case 'end-r': arms.left = true; break;
    case 'end-l': arms.right = true; break;
    default: // isolated — central block
      rects.push({ x: off, y: off, w: W, h: W });
      return { rects };
  }

  // Central core
  rects.push({ x: off, y: off, w: W, h: W });
  // Arms extending to tile edges
  if (arms.top) rects.push({ x: off, y: 0, w: W, h: off });
  if (arms.bottom) rects.push({ x: off, y: off + W, w: W, h: off });
  if (arms.left) rects.push({ x: 0, y: off, w: off, h: W });
  if (arms.right) rects.push({ x: off + W, y: off, w: off, h: W });

  return { rects };
}

/** Generate an SVG for a stone-wall tile variant. */
function stoneWallSvg(variant: FeatureVariant): string {
  const { rects } = wallBounds(variant);
  const parts: string[] = [];
  const seed = variant.charCodeAt(0) * 137 + variant.charCodeAt(variant.length - 1) * 31;

  // Grass background
  parts.push(`<rect width="128" height="128" fill="#3a7d44" />`);
  // Subtle grass patches under the wall
  parts.push(`<ellipse cx="30" cy="100" rx="18" ry="12" fill="#458550" opacity="0.4" />`);
  parts.push(`<ellipse cx="100" cy="30" rx="16" ry="10" fill="#2d6838" opacity="0.3" />`);

  // Wall shadow (offset slightly)
  for (const r of rects) {
    parts.push(
      `<rect x="${r.x + 3}" y="${r.y + 3}" width="${r.w}" height="${r.h}" fill="rgba(0,0,0,0.2)" rx="1" />`
    );
  }

  // Stone body — clip to wall footprint then draw stones
  const clipId = `wc-${variant.replace(/[^a-z]/g, '')}`;
  let clipRects = '';
  for (const r of rects) {
    clipRects += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" />`;
  }
  parts.push(`<defs><clipPath id="${clipId}">${clipRects}</clipPath></defs>`);

  // Wall base fill
  for (const r of rects) {
    parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#6a6a72" rx="1" />`);
  }

  // Stone blocks (clipped to wall shape)
  parts.push(`<g clip-path="url(#${clipId})">`);
  // Draw stones into the bounding box of all rects
  const minX = Math.min(...rects.map(r => r.x));
  const minY = Math.min(...rects.map(r => r.y));
  const maxX = Math.max(...rects.map(r => r.x + r.w));
  const maxY = Math.max(...rects.map(r => r.y + r.h));
  parts.push(stoneBlocks(minX, minY, maxX - minX, maxY - minY, seed));

  // Cap stones along top edges
  for (const r of rects) {
    parts.push(capStones(r.x, r.y, r.w, seed + r.x * 17 + r.y * 31));
  }
  parts.push(`</g>`);

  // Wall border/outline
  for (const r of rects) {
    parts.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1" rx="1" />`
    );
  }

  // Small vegetation at wall base
  const grassSeeds = [
    { x: 8, y: 118 }, { x: 35, y: 122 }, { x: 90, y: 120 }, { x: 115, y: 116 },
    { x: 60, y: 124 }, { x: 20, y: 6 }, { x: 75, y: 4 }, { x: 110, y: 8 },
  ];
  parts.push(`<g stroke="#4a8a54" stroke-width="1.2" stroke-linecap="round" opacity="0.5">`);
  for (const gs of grassSeeds) {
    // Only draw grass if it's NOT inside the wall footprint
    const insideWall = rects.some(r =>
      gs.x >= r.x && gs.x <= r.x + r.w && gs.y >= r.y && gs.y <= r.y + r.h
    );
    if (!insideWall) {
      parts.push(`<line x1="${gs.x}" y1="${gs.y}" x2="${gs.x - 2}" y2="${gs.y - 6}" />`);
      parts.push(`<line x1="${gs.x + 4}" y1="${gs.y}" x2="${gs.x + 6}" y2="${gs.y - 5}" />`);
    }
  }
  parts.push(`</g>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join('\n    ')}
  </svg>`;
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

/** Generate an SVG for a wooden fence tile variant. */
function woodenFenceSvg(variant: FeatureVariant): string {
  const parts: string[] = [];

  // Grass background
  parts.push(`<rect width="128" height="128" fill="#3a7d44" />`);
  parts.push(`<ellipse cx="35" cy="95" rx="22" ry="14" fill="#458550" opacity="0.4" />`);
  parts.push(`<ellipse cx="95" cy="35" rx="18" ry="12" fill="#2d6838" opacity="0.35" />`);

  // Fence dimensions
  const railW = 6;   // rail thickness
  const postW = 10;  // post width
  const postH = 48;  // post height (appears as full post in flat space)
  const mid = 64;    // center

  // Helper to draw a fence post
  function post(x: number, y: number): string {
    const px = x - postW / 2;
    const py = y - postH;
    return [
      // Post shadow
      `<rect x="${px + 2}" y="${py + 4}" width="${postW}" height="${postH}" rx="1" fill="rgba(0,0,0,0.15)" />`,
      // Post body (wood grain)
      `<rect x="${px}" y="${py}" width="${postW}" height="${postH}" rx="1.5" fill="#8B6914" />`,
      // Lighter strip (grain)
      `<rect x="${px + 2}" y="${py}" width="3" height="${postH}" fill="#a07820" opacity="0.4" />`,
      // Dark edge
      `<rect x="${px + postW - 2}" y="${py}" width="2" height="${postH}" fill="#6a5010" opacity="0.3" />`,
      // Top cap (rounded)
      `<ellipse cx="${x}" cy="${py}" rx="${postW / 2}" ry="3" fill="#9a7018" />`,
      `<ellipse cx="${x}" cy="${py}" rx="${postW / 2 - 1}" ry="2" fill="#b08828" opacity="0.5" />`,
    ].join('\n    ');
  }

  // Helper to draw horizontal rails
  function hRails(x1: number, x2: number, cy: number): string {
    const topY = cy - 18;
    const botY = cy + 2;
    return [
      // Rail shadows
      `<rect x="${x1}" y="${topY + 2}" width="${x2 - x1}" height="${railW}" rx="1" fill="rgba(0,0,0,0.12)" />`,
      `<rect x="${x1}" y="${botY + 2}" width="${x2 - x1}" height="${railW}" rx="1" fill="rgba(0,0,0,0.12)" />`,
      // Top rail
      `<rect x="${x1}" y="${topY}" width="${x2 - x1}" height="${railW}" rx="1" fill="#9a7018" />`,
      `<rect x="${x1}" y="${topY}" width="${x2 - x1}" height="2" fill="#b08828" opacity="0.3" />`,
      // Bottom rail
      `<rect x="${x1}" y="${botY}" width="${x2 - x1}" height="${railW}" rx="1" fill="#8B6914" />`,
      `<rect x="${x1}" y="${botY}" width="${x2 - x1}" height="2" fill="#a07820" opacity="0.3" />`,
    ].join('\n    ');
  }

  // Helper to draw vertical rails
  function vRails(y1: number, y2: number, cx: number): string {
    const leftX = cx - 18;
    const rightX = cx + 2;
    return [
      `<rect x="${leftX + 2}" y="${y1}" width="${railW}" height="${y2 - y1}" rx="1" fill="rgba(0,0,0,0.12)" />`,
      `<rect x="${rightX + 2}" y="${y1}" width="${railW}" height="${y2 - y1}" rx="1" fill="rgba(0,0,0,0.12)" />`,
      `<rect x="${leftX}" y="${y1}" width="${railW}" height="${y2 - y1}" rx="1" fill="#9a7018" />`,
      `<rect x="${leftX}" y="${y1}" width="2" height="${y2 - y1}" fill="#b08828" opacity="0.3" />`,
      `<rect x="${rightX}" y="${y1}" width="${railW}" height="${y2 - y1}" rx="1" fill="#8B6914" />`,
      `<rect x="${rightX}" y="${y1}" width="2" height="${y2 - y1}" fill="#a07820" opacity="0.3" />`,
    ].join('\n    ');
  }

  const arms = { top: false, right: false, bottom: false, left: false };
  switch (variant) {
    case 'straight-h': arms.left = arms.right = true; break;
    case 'straight-v': arms.top = arms.bottom = true; break;
    case 'corner-tr': arms.top = arms.right = true; break;
    case 'corner-tl': arms.top = arms.left = true; break;
    case 'corner-br': arms.bottom = arms.right = true; break;
    case 'corner-bl': arms.bottom = arms.left = true; break;
    case 'cross': arms.top = arms.right = arms.bottom = arms.left = true; break;
    case 'tee-t': arms.left = arms.right = arms.bottom = true; break;
    case 'tee-b': arms.left = arms.right = arms.top = true; break;
    case 'tee-r': arms.top = arms.bottom = arms.left = true; break;
    case 'tee-l': arms.top = arms.bottom = arms.right = true; break;
    case 'end-t': arms.bottom = true; break;
    case 'end-b': arms.top = true; break;
    case 'end-r': arms.left = true; break;
    case 'end-l': arms.right = true; break;
    default: break; // isolated
  }

  // Draw rails first (behind posts)
  if (arms.left) parts.push(hRails(0, mid, mid));
  if (arms.right) parts.push(hRails(mid, 128, mid));
  if (arms.top) parts.push(vRails(0, mid, mid));
  if (arms.bottom) parts.push(vRails(mid, 128, mid));

  // Corner post always
  parts.push(post(mid, mid + postH / 2));

  // End posts on arms
  if (arms.left) parts.push(post(postW / 2, mid + postH / 2));
  if (arms.right) parts.push(post(128 - postW / 2, mid + postH / 2));
  if (arms.top) parts.push(post(mid, postH / 2 + 4));
  if (arms.bottom) parts.push(post(mid, 128 - 4));

  // Small grass tufts at base of posts
  parts.push(`<g stroke="#4a8a54" stroke-width="1" stroke-linecap="round" opacity="0.4">`);
  parts.push(`<line x1="${mid - 8}" y1="${mid + postH / 2 + 2}" x2="${mid - 11}" y2="${mid + postH / 2 - 4}" />`);
  parts.push(`<line x1="${mid + 8}" y1="${mid + postH / 2 + 1}" x2="${mid + 11}" y2="${mid + postH / 2 - 3}" />`);
  parts.push(`</g>`);

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

// ─── SVG Selection ───────────────────────────────────────────

/**
 * Get the appropriate variant SVG for a solved tile.
 * Returns null if no variant SVG is needed (tile uses standard asset).
 */
export function getVariantSvg(
  tile: MicroTile,
  worldCol: number,
  worldRow: number,
): string | null {
  if (!tile.variant || !tile.connections) return null;

  switch (tile.kind) {
    case 'stone-wall':
      return stoneWallSvg(tile.variant);
    case 'wooden-fence':
      return woodenFenceSvg(tile.variant);
    case 'river':
      return riverSvg(tile.variant, tile.connections);
    case 'tall-grass':
      return tallGrassSvg(tile.z, worldCol, worldRow);
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

      // Solve connections for connectable features
      if (CONNECTABLE_KINDS.has(tile.kind)) {
        const neighbors = getNeighbors(chunk, col, row, lookup);
        const connections = resolveConnections(tile.kind, neighbors);
        const variant = selectVariant(connections);
        const variantSvg = getVariantSvg(
          { ...tile, connections, variant },
          worldCol,
          worldRow,
        );

        const edgeMasks = tile.kind === 'river' ? RIVER_EDGE_MASKS
          : tile.kind === 'wooden-fence' ? GRASS_BLEND_MASKS
          : WALL_EDGE_MASKS;

        newTiles.push({
          ...tile,
          connections,
          variant,
          edgeMasks,
          svg: variantSvg ?? tile.svg,
        });
        changed = true;
        continue;
      }

      // Solve tall grass height variation
      if (tile.kind === 'tall-grass') {
        const z = tallGrassZ(worldCol, worldRow);
        const svg = tallGrassSvg(z, worldCol, worldRow);
        newTiles.push({
          ...tile,
          z,
          svg,
          edgeMasks: GRASS_BLEND_MASKS,
        });
        changed = true;
        continue;
      }

      newTiles.push(tile);
    }
  }

  if (!changed) return chunk;

  return {
    ...chunk,
    tiles: newTiles,
    dirty: true,
  };
}

/**
 * Generate raw feature tiles for a world position.
 * Returns the TileKind override if a feature should be placed here, or null.
 * This is called during chunk generation to lay down features before solving.
 */
export function getFeatureKind(worldCol: number, worldRow: number): TileKind | null {
  if (isWallPosition(worldCol, worldRow)) return 'stone-wall';
  if (isFencePosition(worldCol, worldRow)) return 'wooden-fence';
  if (isRiverPosition(worldCol, worldRow)) return 'river';
  if (isTallGrassPosition(worldCol, worldRow)) return 'tall-grass';
  return null;
}
