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
// Procedural SVGs for different connection variants.
// These serve as visual placeholders until hand-crafted assets are made.

/** Generate an SVG for a stone-wall tile variant. */
function stoneWallSvg(variant: FeatureVariant): string {
  const wallColor = '#5a5a6a';
  const wallDark = '#3a3a4a';
  const mortarColor = '#8a8a8a';

  // Base wall block on all variants
  let paths = '';

  switch (variant) {
    case 'straight-h':
      paths = `
        <rect x="0" y="36" width="128" height="56" fill="${wallColor}" />
        <line x1="0" y1="52" x2="128" y2="52" stroke="${mortarColor}" stroke-width="1.5" />
        <line x1="0" y1="68" x2="128" y2="68" stroke="${mortarColor}" stroke-width="1.5" />
        <rect x="0" y="36" width="128" height="4" fill="${wallDark}" />`;
      break;
    case 'straight-v':
      paths = `
        <rect x="36" y="0" width="56" height="128" fill="${wallColor}" />
        <line x1="52" y1="0" x2="52" y2="128" stroke="${mortarColor}" stroke-width="1.5" />
        <line x1="68" y1="0" x2="68" y2="128" stroke="${mortarColor}" stroke-width="1.5" />
        <rect x="36" y="0" width="4" height="128" fill="${wallDark}" />`;
      break;
    case 'corner-tr':
      paths = `
        <rect x="36" y="0" width="56" height="92" fill="${wallColor}" />
        <rect x="36" y="36" width="92" height="56" fill="${wallColor}" />
        <rect x="36" y="36" width="4" height="56" fill="${wallDark}" />
        <rect x="36" y="0" width="4" height="40" fill="${wallDark}" />
        <line x1="52" y1="0" x2="52" y2="36" stroke="${mortarColor}" stroke-width="1" />`;
      break;
    case 'corner-tl':
      paths = `
        <rect x="36" y="0" width="56" height="92" fill="${wallColor}" />
        <rect x="0" y="36" width="92" height="56" fill="${wallColor}" />
        <rect x="88" y="36" width="4" height="56" fill="${wallDark}" />
        <rect x="88" y="0" width="4" height="40" fill="${wallDark}" />
        <line x1="76" y1="0" x2="76" y2="36" stroke="${mortarColor}" stroke-width="1" />`;
      break;
    case 'corner-br':
      paths = `
        <rect x="36" y="36" width="56" height="92" fill="${wallColor}" />
        <rect x="36" y="36" width="92" height="56" fill="${wallColor}" />
        <rect x="36" y="36" width="4" height="92" fill="${wallDark}" />
        <line x1="52" y1="92" x2="52" y2="128" stroke="${mortarColor}" stroke-width="1" />`;
      break;
    case 'corner-bl':
      paths = `
        <rect x="36" y="36" width="56" height="92" fill="${wallColor}" />
        <rect x="0" y="36" width="92" height="56" fill="${wallColor}" />
        <rect x="88" y="36" width="4" height="92" fill="${wallDark}" />
        <line x1="76" y1="92" x2="76" y2="128" stroke="${mortarColor}" stroke-width="1" />`;
      break;
    case 'cross':
      paths = `
        <rect x="36" y="0" width="56" height="128" fill="${wallColor}" />
        <rect x="0" y="36" width="128" height="56" fill="${wallColor}" />
        <rect x="36" y="0" width="4" height="128" fill="${wallDark}" />
        <line x1="0" y1="52" x2="36" y2="52" stroke="${mortarColor}" stroke-width="1" />
        <line x1="92" y1="52" x2="128" y2="52" stroke="${mortarColor}" stroke-width="1" />`;
      break;
    case 'tee-t':
      paths = `
        <rect x="0" y="36" width="128" height="56" fill="${wallColor}" />
        <rect x="36" y="36" width="56" height="92" fill="${wallColor}" />
        <line x1="0" y1="52" x2="128" y2="52" stroke="${mortarColor}" stroke-width="1" />
        <rect x="36" y="36" width="4" height="92" fill="${wallDark}" />`;
      break;
    case 'tee-b':
      paths = `
        <rect x="0" y="36" width="128" height="56" fill="${wallColor}" />
        <rect x="36" y="0" width="56" height="92" fill="${wallColor}" />
        <line x1="0" y1="68" x2="128" y2="68" stroke="${mortarColor}" stroke-width="1" />
        <rect x="36" y="0" width="4" height="92" fill="${wallDark}" />`;
      break;
    case 'tee-r':
      paths = `
        <rect x="36" y="0" width="56" height="128" fill="${wallColor}" />
        <rect x="0" y="36" width="92" height="56" fill="${wallColor}" />
        <line x1="52" y1="0" x2="52" y2="128" stroke="${mortarColor}" stroke-width="1" />
        <rect x="0" y="36" width="92" height="4" fill="${wallDark}" />`;
      break;
    case 'tee-l':
      paths = `
        <rect x="36" y="0" width="56" height="128" fill="${wallColor}" />
        <rect x="36" y="36" width="92" height="56" fill="${wallColor}" />
        <line x1="68" y1="0" x2="68" y2="128" stroke="${mortarColor}" stroke-width="1" />
        <rect x="36" y="36" width="92" height="4" fill="${wallDark}" />`;
      break;
    case 'end-t':
      paths = `
        <rect x="36" y="36" width="56" height="92" fill="${wallColor}" />
        <rect x="36" y="36" width="4" height="92" fill="${wallDark}" />
        <circle cx="64" cy="50" r="8" fill="${wallDark}" opacity="0.4" />`;
      break;
    case 'end-b':
      paths = `
        <rect x="36" y="0" width="56" height="92" fill="${wallColor}" />
        <rect x="36" y="0" width="4" height="92" fill="${wallDark}" />
        <circle cx="64" cy="78" r="8" fill="${wallDark}" opacity="0.4" />`;
      break;
    case 'end-r':
      paths = `
        <rect x="0" y="36" width="92" height="56" fill="${wallColor}" />
        <rect x="0" y="36" width="92" height="4" fill="${wallDark}" />
        <circle cx="78" cy="64" r="8" fill="${wallDark}" opacity="0.4" />`;
      break;
    case 'end-l':
      paths = `
        <rect x="36" y="36" width="92" height="56" fill="${wallColor}" />
        <rect x="36" y="36" width="92" height="4" fill="${wallDark}" />
        <circle cx="50" cy="64" r="8" fill="${wallDark}" opacity="0.4" />`;
      break;
    default: // isolated
      paths = `
        <rect x="32" y="32" width="64" height="64" fill="${wallColor}" rx="4" />
        <rect x="32" y="32" width="64" height="4" fill="${wallDark}" />
        <rect x="32" y="32" width="4" height="64" fill="${wallDark}" />`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="#3a7d44" />
    ${paths}
  </svg>`;
}

/** Generate an SVG for a river tile variant. */
function riverSvg(variant: FeatureVariant, conn: FeatureConnections): string {
  const waterColor = '#1a5588';
  const waterLight = '#2277aa';
  const bankColor = '#7a6a30';

  let water = '';
  let banks = '';

  // Draw water channel based on connections
  if (conn.top || conn.bottom) {
    water += `<rect x="28" y="0" width="72" height="128" fill="${waterColor}" />`;
    water += `<rect x="40" y="0" width="48" height="128" fill="${waterLight}" opacity="0.4" />`;
  }
  if (conn.left || conn.right) {
    water += `<rect x="0" y="28" width="128" height="72" fill="${waterColor}" />`;
    water += `<rect x="0" y="40" width="128" height="48" fill="${waterLight}" opacity="0.4" />`;
  }

  // Central pool for isolated / single-end
  if (variant === 'isolated') {
    water = `<circle cx="64" cy="64" r="40" fill="${waterColor}" />
             <circle cx="64" cy="64" r="28" fill="${waterLight}" opacity="0.4" />`;
  }

  // Banks: filled strips on non-connected sides
  if (!conn.top && variant !== 'isolated') {
    banks += `<rect x="24" y="0" width="80" height="8" fill="${bankColor}" rx="2" />`;
  }
  if (!conn.bottom && variant !== 'isolated') {
    banks += `<rect x="24" y="120" width="80" height="8" fill="${bankColor}" rx="2" />`;
  }
  if (!conn.left && variant !== 'isolated') {
    banks += `<rect x="0" y="24" width="8" height="80" fill="${bankColor}" rx="2" />`;
  }
  if (!conn.right && variant !== 'isolated') {
    banks += `<rect x="120" y="24" width="8" height="80" fill="${bankColor}" rx="2" />`;
  }

  // Flow direction indicator (subtle ripple lines)
  let ripples = '';
  if (conn.top && conn.bottom) {
    // Vertical flow
    for (let y = 16; y < 128; y += 24) {
      ripples += `<line x1="44" y1="${y}" x2="84" y2="${y}" stroke="rgba(255,255,255,0.15)" stroke-width="2" />`;
    }
  } else if (conn.left && conn.right) {
    // Horizontal flow
    for (let x = 16; x < 128; x += 24) {
      ripples += `<line x1="${x}" y1="44" x2="${x}" y2="84" stroke="rgba(255,255,255,0.15)" stroke-width="2" />`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="#3a7d44" />
    ${water}
    ${banks}
    ${ripples}
  </svg>`;
}

/** Generate an SVG for a tall grass tile with height variation. */
function tallGrassSvg(z: number, worldCol: number, worldRow: number): string {
  const hash = ((worldCol * 31337) ^ (worldRow * 82139)) >>> 0;
  const baseGreen = 0x2a + (hash % 30);
  const blades: string[] = [];

  // Generate grass blade clusters based on z-height
  const bladeCount = 12 + z * 6;
  for (let i = 0; i < bladeCount; i++) {
    const h = ((hash * (i + 1)) >>> 0);
    const bx = 8 + (h % 112);
    const by = 128 - (h >> 8) % (20 + z * 12);
    const height = 8 + (z * 6) + (h >> 16) % 12;
    const sway = ((h >> 20) % 8) - 4;
    const green = baseGreen + (h >> 24) % 20;
    blades.push(
      `<line x1="${bx}" y1="${by}" x2="${bx + sway}" y2="${by - height}" stroke="rgb(${green - 10}, ${green + 40}, ${green - 20})" stroke-width="${1 + z * 0.5}" stroke-linecap="round" />`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="rgb(${baseGreen}, ${baseGreen + 50}, ${baseGreen - 8})" />
    ${blades.join('\n    ')}
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

        const edgeMasks = tile.kind === 'river' ? RIVER_EDGE_MASKS : WALL_EDGE_MASKS;

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
  if (isRiverPosition(worldCol, worldRow)) return 'river';
  if (isTallGrassPosition(worldCol, worldRow)) return 'tall-grass';
  return null;
}
