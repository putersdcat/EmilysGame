/**
 * chunk.ts — 2.0 Experiment: World Unit Chunk management.
 * Handles chunk creation, baking (pre-rendering), and demo generation.
 * A chunk is a 5×5 grid of MicroTiles that gets baked to an offscreen canvas.
 * Uses loaded assets when available, falling back to inline demo SVGs.
 * TODO: DOC — chunk lifecycle, bake strategy, edge blend pass
 */

import {
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  CHUNK_TILES,
  worldToIso,
  type MicroTile,
  type WorldUnitChunk,
  type NanoTile,
  type NanoTileKind,
  type NanoZMode,
  type WalkableRule,
  type TileKind,
  type FeatureVariant,
  MAX_Z_HEIGHT,
} from './types';
import {
  getRenderedTile,
  Z_PX_PER_LEVEL,
  applyEdgeBlend,
  applyHeightMapShading,
} from './tile';
import { hasLoadedAssets, pickTileForKind } from './asset-loader';
import {
  drawTileShadow,
  drawDefaultShadow,
  drawRimLighting,
} from './renderer';
import { getFeatureKind, getDiagonalFenceVariant, placeAssembly } from './solver';
import { drawNanoStack, drawNanoShadow, NANO_Z_SCALE } from './nano-tile';
import { loadAssembly } from './assemblies';
import type { SunState } from './types';

// ─── Chunk Bounding Box Constants ────────────────────────────

/** Max Z offset in pixels for headroom calculation. */
const MAX_Z_PX = MAX_Z_HEIGHT * Z_PX_PER_LEVEL;

/** Padding above the chunk canvas for Z-elevated tiles. */
const PAD_TOP = MAX_Z_PX + ISO_TILE_HEIGHT;

/** Chunk canvas width: iso footprint of CHUNK_TILES columns + CHUNK_TILES rows. */
export const CHUNK_CANVAS_W = CHUNK_TILES * ISO_TILE_WIDTH;

/**
 * Chunk canvas height: iso footprint + Z headroom.
 * NOTE: bakeChunk may produce a taller canvas for structure chunks with tall nanos.
 * This constant is used only by getChunkDrawPos for screen-position math.
 */
export const CHUNK_CANVAS_H = (CHUNK_TILES + 1) * ISO_TILE_HEIGHT + PAD_TOP;

/** Horizontal origin offset to center the iso grid in the canvas. */
const ORIGIN_X = CHUNK_TILES * (ISO_TILE_WIDTH / 2);

// ─── Dynamic Canvas Headroom ────────────────────────────────

/**
 * Compute needed PAD_TOP for this chunk, accommodating tall structure nanos.
 * For normal chunks this equals the constant PAD_TOP.
 * For chunks with cathedral spires (zOffset=26) it grows proportionally.
 */
function computePadTop(chunk: WorldUnitChunk): number {
  let maxNanoH = 0;
  for (const tile of chunk.tiles) {
    if (!tile.nanos) continue;
    for (const nano of tile.nanos) {
      if (nano.zMode === 'positive') {
        const h = nano.zOffset * NANO_Z_SCALE;
        if (h > maxNanoH) maxNanoH = h;
      }
    }
  }
  // Base headroom = MAX_Z_PX (terrain Z) + ISO_TILE_HEIGHT.
  // Extra headroom needed when nanos exceed the default max terrain Z.
  const extra = Math.max(0, maxNanoH - MAX_Z_PX);
  return MAX_Z_PX + ISO_TILE_HEIGHT + extra;
}

// ─── Color Map for Edge Blending ─────────────────────────────

const KIND_COLORS: Record<TileKind, string> = {
  'grass':     '#3a7d44',
  'dirt':      '#8B6914',
  'rock':      '#808080',
  'water':     '#2266aa',
  'sand':      '#c2b280',
  'dry-grass': '#7a9a3a',
};

// ─── Chunk Baking ────────────────────────────────────────────

/**
 * Bake a chunk's tiles into its cached offscreen canvas.
 * Includes shadow projection and rim lighting passes when sun state is provided.
 * Returns true if all tile images were loaded (bake complete),
 * false if some are still pending (needs re-bake next frame).
 */
export function bakeChunk(chunk: WorldUnitChunk, sun?: SunState): boolean {
  if (!chunk.cachedCanvas) {
    chunk.cachedCanvas = document.createElement('canvas');
  }
  const padTop = computePadTop(chunk);
  const canvasH = (CHUNK_TILES + 1) * ISO_TILE_HEIGHT + padTop;
  chunk.cachedCanvas.width = CHUNK_CANVAS_W;
  chunk.cachedCanvas.height = canvasH;
  const ctx = chunk.cachedCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, CHUNK_CANVAS_W, canvasH);

  let allLoaded = true;

  // Pass 0: Shadows (drawn first, so tiles render on top)
  if (sun) {
    for (let row = 0; row < CHUNK_TILES; row++) {
      for (let col = 0; col < CHUNK_TILES; col++) {
        const tile = chunk.tiles[row * CHUNK_TILES + col];
        const { sx, sy } = worldToIso(col, row, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
        const drawX = sx + ORIGIN_X - ISO_TILE_WIDTH / 2;
        const drawY = sy + padTop - ISO_TILE_HEIGHT / 2;

        // Base tile shadow
        if (tile.z > 0) {
          if (tile.shadowPath) {
            drawTileShadow(ctx, drawX, drawY, tile.shadowPath, tile.z, sun);
          } else {
            drawDefaultShadow(ctx, drawX, drawY, tile.z, sun);
          }
        }

        // Nano tile shadows
        if (tile.nanos) {
          for (const nano of tile.nanos) {
            drawNanoShadow(ctx, nano, drawX, drawY, sun);
          }
        }
      }
    }
  }

  // Pass 1: Draw tiles in back-to-front order (row-major for iso)
  for (let row = 0; row < CHUNK_TILES; row++) {
    for (let col = 0; col < CHUNK_TILES; col++) {
      const tile = chunk.tiles[row * CHUNK_TILES + col];
      const rendered = getRenderedTile(tile);
      if (!rendered) { allLoaded = false; continue; }

      const { sx, sy } = worldToIso(col, row, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
      const zPx = tile.z * Z_PX_PER_LEVEL;

      // Position: offset by ORIGIN_X for centering, PAD_TOP for Z headroom
      // The rendered tile canvas has height = ISO_TILE_HEIGHT + zPx,
      // so we draw it so the top-face diamond top aligns with the grid position.
      const drawX = sx + ORIGIN_X - ISO_TILE_WIDTH / 2;
      const drawY = sy + padTop - ISO_TILE_HEIGHT / 2 - zPx;
      ctx.drawImage(rendered, drawX, drawY);

      // Draw nano overlays for this tile (negative → flat → positive order)
      if (tile.nanos && tile.nanos.length > 0) {
        const nanoResult = drawNanoStack(ctx, tile.nanos, drawX, drawY, sun);
        if (!nanoResult.allImagesLoaded) allLoaded = false;
      }
    }
  }

  // Pass 2: Edge blending between adjacent tiles of different kinds
  for (let row = 0; row < CHUNK_TILES; row++) {
    for (let col = 0; col < CHUNK_TILES; col++) {
      const tile = chunk.tiles[row * CHUNK_TILES + col];
      const { sx, sy } = worldToIso(col, row, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
      const drawX = sx + ORIGIN_X - ISO_TILE_WIDTH / 2;
      const drawY = sy + padTop - ISO_TILE_HEIGHT / 2 - tile.z * Z_PX_PER_LEVEL;

      // Check each neighbor and blend if different kind
      // Top neighbor (row-1)
      if (row > 0) {
        const neighbor = chunk.tiles[(row - 1) * CHUNK_TILES + col];
        if (neighbor.kind !== tile.kind) {
          applyEdgeBlend(ctx, drawX, drawY, 'top', tile.edgeMasks.top.samples, KIND_COLORS[neighbor.kind]);
        }
      }
      // Right neighbor (col+1)
      if (col < CHUNK_TILES - 1) {
        const neighbor = chunk.tiles[row * CHUNK_TILES + col + 1];
        if (neighbor.kind !== tile.kind) {
          applyEdgeBlend(ctx, drawX, drawY, 'right', tile.edgeMasks.right.samples, KIND_COLORS[neighbor.kind]);
        }
      }
      // Bottom neighbor (row+1)
      if (row < CHUNK_TILES - 1) {
        const neighbor = chunk.tiles[(row + 1) * CHUNK_TILES + col];
        if (neighbor.kind !== tile.kind) {
          applyEdgeBlend(ctx, drawX, drawY, 'bottom', tile.edgeMasks.bottom.samples, KIND_COLORS[neighbor.kind]);
        }
      }
      // Left neighbor (col-1)
      if (col > 0) {
        const neighbor = chunk.tiles[row * CHUNK_TILES + col - 1];
        if (neighbor.kind !== tile.kind) {
          applyEdgeBlend(ctx, drawX, drawY, 'left', tile.edgeMasks.left.samples, KIND_COLORS[neighbor.kind]);
        }
      }

      // Pass 3: Height map shading (if present)
      if (tile.heightMap) {
        applyHeightMapShading(ctx, drawX, drawY, tile.heightMap);
      }

      // Pass 4: Rim lighting on sun-facing edges
      if (sun) {
        drawRimLighting(ctx, drawX, drawY, sun);
      }
    }
  }

  chunk.dirty = !allLoaded;
  return allLoaded;
}

// ─── Demo Chunk Generation ───────────────────────────────────
// 2.0 Experiment: Procedural placeholder chunks for visual testing.

/** Simple value noise: smooth hash-based continuous noise. */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  // Smooth interpolation (fade)
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  // Corner values
  function h(cx: number, cy: number): number {
    const n = ((cx * 73856093) ^ (cy * 19349663) ^ (seed * 83492791)) >>> 0;
    return (n & 0xffff) / 0xffff;
  }
  const a = h(ix, iy);
  const b = h(ix + 1, iy);
  const c = h(ix, iy + 1);
  const d = h(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Multi-octave fractal noise for terrain variety. */
function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    val += valueNoise(x * freq, y * freq, seed + i * 997) * amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return val;
}

/**
 * Determine the base terrain kind for a world position.
 * Uses multi-layered noise for coherent biome regions.
 * Predominantly grass with clustered biomes — not random scatter.
 */
function getBaseKind(worldCol: number, worldRow: number): TileKind {
  // Moisture map — determines dry vs wet areas
  const moisture = fbm(worldCol * 0.08, worldRow * 0.08, 42, 4);
  // Elevation map — determines height
  const elevation = fbm(worldCol * 0.06, worldRow * 0.06, 137, 4);
  // Temperature — W/E variation
  const temp = fbm(worldCol * 0.05, worldRow * 0.05, 251, 3);

  // High elevation → rock
  if (elevation > 0.72) return 'rock';
  // Low elevation + high moisture → water
  if (elevation < 0.32 && moisture > 0.55) return 'water';
  // Low elevation + medium moisture → sand (beach/shore)
  if (elevation < 0.38 && moisture > 0.4) return 'sand';
  // Dry areas → dirt/sand
  if (moisture < 0.3 && temp > 0.6) return 'dirt';
  if (moisture < 0.28) return 'sand';
  // Everything else → grass (the majority)
  return 'grass';
}

const DEMO_COLORS: Record<string, string> = {
  grass:       '#3a7d44',
  dirt:        '#8B6914',
  rock:        '#808080',
  water:       '#2266aa',
  sand:        '#c2b280',
  'dry-grass': '#7a9a3a',
};

/** Create a simple colored SVG tile for demo purposes. */
function makeDemoSvg(kind: string, col: number, row: number): string {
  const base = DEMO_COLORS[kind] ?? '#555';
  const r = ((col * 7 + row * 13) & 0xff);
  const g = ((col * 11 + row * 3) & 0xff);
  const rr = (parseInt(base.slice(1, 3), 16) + (r % 20) - 10) & 0xff;
  const gg = (parseInt(base.slice(3, 5), 16) + (g % 20) - 10) & 0xff;
  const bb = parseInt(base.slice(5, 7), 16);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="rgb(${rr},${gg},${bb})" />
    <text x="64" y="64" text-anchor="middle" dy=".35em" font-size="10" fill="rgba(255,255,255,0.4)">${col},${row}</text>
  </svg>`;
}

/** Default fully-opaque edge masks. */
const DEFAULT_EDGE_MASKS = {
  top:    { samples: [1, 1, 1, 1, 1, 1, 1, 1] },
  right:  { samples: [1, 1, 1, 1, 1, 1, 1, 1] },
  bottom: { samples: [1, 1, 1, 1, 1, 1, 1, 1] },
  left:   { samples: [1, 1, 1, 1, 1, 1, 1, 1] },
};

/** Gradient edge masks for blending. */
const BLEND_EDGE_MASKS = {
  top:    { samples: [0.8, 0.7, 0.5, 0.3, 0.3, 0.5, 0.7, 0.8] },
  right:  { samples: [0.8, 0.7, 0.5, 0.3, 0.3, 0.5, 0.7, 0.8] },
  bottom: { samples: [0.8, 0.7, 0.5, 0.3, 0.3, 0.5, 0.7, 0.8] },
  left:   { samples: [0.8, 0.7, 0.5, 0.3, 0.3, 0.5, 0.7, 0.8] },
};

/** Nano-specific color palette for demo SVGs (distinct from biome colors). */
const NANO_DEMO_COLORS: Record<string, string> = {
  'fence':           '#8B5A2B',
  'stone-wall':      '#6a6a6a',
  'river':           '#2255aa',
  'river-bank':      '#5a4a1a',
  'tall-grass':      '#2a6a2a',
  'bridge':          '#7a5a30',
  'gate':            '#aa8844',
  'troll-bridge':    '#5a4a30',
  'cathedral-wall':  '#555555',
  'homestead-wall':  '#8a6a3a',
};

/** Create a demo SVG for nano tiles with appropriate feature colors. */
function makeNanoDemoSvg(kind: NanoTileKind, col: number, row: number): string {
  const base = NANO_DEMO_COLORS[kind] ?? '#555';
  const r = ((col * 7 + row * 13) & 0xff);
  const g = ((col * 11 + row * 3) & 0xff);
  const rr = (parseInt(base.slice(1, 3), 16) + (r % 12) - 6) & 0xff;
  const gg = (parseInt(base.slice(3, 5), 16) + (g % 12) - 6) & 0xff;
  const bb = parseInt(base.slice(5, 7), 16);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="rgb(${rr},${gg},${bb})" />
    <text x="64" y="64" text-anchor="middle" dy=".35em" font-size="8" fill="rgba(255,255,255,0.5)">${kind}</text>
  </svg>`;
}

/** Create a demo side-texture SVG for extrusion rendering. */
function makeNanoSideSvg(baseColor: string, col: number, row: number): string {
  const rr = (parseInt(baseColor.slice(1, 3), 16) - 15) & 0xff;
  const gg = (parseInt(baseColor.slice(3, 5), 16) - 15) & 0xff;
  const bb = (parseInt(baseColor.slice(5, 7), 16) - 10) & 0xff;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="rgb(${rr},${gg},${bb})" />
    <line x1="0" y1="32" x2="128" y2="32" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
    <line x1="0" y1="64" x2="128" y2="64" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
    <line x1="0" y1="96" x2="128" y2="96" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
    <text x="64" y="64" text-anchor="middle" dy=".35em" font-size="7" fill="rgba(255,255,255,0.3)">${col},${row}</text>
  </svg>`;
}

/** Create a demo top-cap SVG for extrusion rendering. */
function makeNanoTopSvg(baseColor: string, _col: number, _row: number): string {
  const rr = (parseInt(baseColor.slice(1, 3), 16) + 20) & 0xff;
  const gg = (parseInt(baseColor.slice(3, 5), 16) + 20) & 0xff;
  const bb = (parseInt(baseColor.slice(5, 7), 16) + 15) & 0xff;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="rgb(${rr},${gg},${bb})" />
  </svg>`;
}

/** Create a stub NanoTile for a feature kind with demo visuals. */
function makeFeatureNano(kind: NanoTileKind, worldCol: number, worldRow: number, presetVariant?: FeatureVariant): NanoTile {
    const zOffset = kind === 'stone-wall' ? 3.5 : kind === 'fence' ? 2 : kind === 'river' ? -2 : 0;
  const zMode: NanoZMode = kind === 'river' ? 'negative' : kind === 'tall-grass' ? 'flat' : 'positive';
  const walkable: WalkableRule = (kind === 'stone-wall' || kind === 'fence')
    ? { type: 'never' }
    : { type: 'always' };

  const base: NanoTile = {
    kind,
    zOffset,
    zMode,
    svg: makeNanoDemoSvg(kind, worldCol, worldRow),
    walkable,
    blendEdges: kind === 'river' || kind === 'tall-grass',
    variant: presetVariant ?? 'isolated',
  };

  // Add extrusion textures for stone walls (side + top cap demo)
  if (kind === 'stone-wall') {
    return {
      ...base,
      sideTextureSvg: makeNanoSideSvg('#6a6a6a', worldCol, worldRow),
      topTextureSvg: makeNanoTopSvg('#7a7a7a', worldCol, worldRow),
    };
  }

  return base;
}

/**
 * Z-heights for base biome terrain tiles.
 * Structural feature Z now lives in NanoTile.zOffset.
 */
function getTerrainZ(kind: TileKind): number {
  switch (kind) {
    case 'rock':  return 1;
    default:      return 0;
  }
}

/**
 * Generate a demo chunk at the given chunk coords.
 * Uses loaded tile assets when available, falls back to inline demo SVGs.
 * Uses coherent noise-based biome generation for natural-looking terrain.
 */
export function generateDemoChunk(cx: number, cy: number): WorldUnitChunk {
  const tiles: MicroTile[] = [];
  const useAssets = hasLoadedAssets();

  for (let row = 0; row < CHUNK_TILES; row++) {
    for (let col = 0; col < CHUNK_TILES; col++) {
      const worldCol = cx * CHUNK_TILES + col;
      const worldRow = cy * CHUNK_TILES + row;

      // Check for feature override first (walls, fences, rivers, tall grass)
      const featureKind = getFeatureKind(worldCol, worldRow);

      if (featureKind) {
        const presetVariant = featureKind === 'fence'
          ? (getDiagonalFenceVariant(worldCol, worldRow) ?? undefined) : undefined;
        const baseKind = getBaseKind(worldCol, worldRow);
        tiles.push({
          kind: baseKind,
          z: getTerrainZ(baseKind),
          svg: makeDemoSvg(baseKind, worldCol, worldRow),
          edgeMasks: DEFAULT_EDGE_MASKS,
          nanos: [makeFeatureNano(featureKind, worldCol, worldRow, presetVariant)],
        });
        continue;
      }

      // Use coherent noise biome selection
      const kind = getBaseKind(worldCol, worldRow);

      // Try to use a loaded asset first
      if (useAssets) {
        const hash = ((worldCol * 73856093) ^ (worldRow * 19349663)) >>> 0;
        const assetTile = pickTileForKind(kind, (hash >> 4) >>> 0);
        if (assetTile) {
          // Override z to keep terrain flat
          tiles.push({ ...assetTile, z: getTerrainZ(kind) });
          continue;
        }
      }

      // Fallback: inline demo SVG
      const edgeMasks = kind === 'grass' ? DEFAULT_EDGE_MASKS : BLEND_EDGE_MASKS;

      tiles.push({
        kind,
        z: getTerrainZ(kind),
        svg: makeDemoSvg(kind, worldCol, worldRow),
        edgeMasks,
      });
    }
  }

  const chunk: WorldUnitChunk = {
    cx, cy, tiles,
    cachedCanvas: null,
    dirty: true,
    activeConditions: new Map<string, 'locked' | 'unlocked'>(),
    walkableMap: [],
  };

  // ─── Assembly Placement ───────────────────────────────
  // Homestead at world (30, 1): 5×5 footprint → chunks cx=6,cy=0 and cx=6,cy=1.
  // Cathedral at world (37, 1): 3×5 footprint → chunks cx=7,cy=0 and cx=7,cy=1.
  // placeAssembly skips tiles not in this chunk automatically.

  const homestead = loadAssembly('homestead-small');
  if (homestead) placeAssembly(homestead, 30, 1, chunk);

  const cathedral = loadAssembly('ruined-cathedral');
  if (cathedral) placeAssembly(cathedral, 37, 1, chunk);

  return chunk;
}

// ─── Chunk Screen Position ───────────────────────────────────

/** Get the screen-space draw position for a chunk's cached canvas. */
export function getChunkDrawPos(cx: number, cy: number): { dx: number; dy: number } {
  const chunkCol = cx * CHUNK_TILES;
  const chunkRow = cy * CHUNK_TILES;
  const { sx, sy } = worldToIso(chunkCol, chunkRow, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
  return {
    dx: sx - ORIGIN_X,
    dy: sy - PAD_TOP,
  };
}
