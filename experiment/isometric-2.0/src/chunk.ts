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
  type TileKind,
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
import { getFeatureKind } from './solver';
import type { SunState } from './types';

// ─── Chunk Bounding Box Constants ────────────────────────────

/** Max Z offset in pixels for headroom calculation. */
const MAX_Z_PX = MAX_Z_HEIGHT * Z_PX_PER_LEVEL;

/** Padding above the chunk canvas for Z-elevated tiles. */
const PAD_TOP = MAX_Z_PX + ISO_TILE_HEIGHT;

/** Chunk canvas width: iso footprint of CHUNK_TILES columns + CHUNK_TILES rows. */
export const CHUNK_CANVAS_W = CHUNK_TILES * ISO_TILE_WIDTH;

/** Chunk canvas height: iso footprint + Z headroom. */
export const CHUNK_CANVAS_H = (CHUNK_TILES + 1) * ISO_TILE_HEIGHT + PAD_TOP;

/** Horizontal origin offset to center the iso grid in the canvas. */
const ORIGIN_X = CHUNK_TILES * (ISO_TILE_WIDTH / 2);

// ─── Color Map for Edge Blending ─────────────────────────────

const KIND_COLORS: Record<TileKind, string> = {
  'grass':        '#3a7d44',
  'dirt':         '#8B6914',
  'rock':         '#808080',
  'water':        '#2266aa',
  'sand':         '#c2b280',
  'stone-wall':   '#5a5a5a',
  'wooden-fence': '#8B6914',
  'river':        '#1a5588',
  'river-bank':   '#7a6a30',
  'tall-grass':   '#2a7a2a',
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
  chunk.cachedCanvas.width = CHUNK_CANVAS_W;
  chunk.cachedCanvas.height = CHUNK_CANVAS_H;
  const ctx = chunk.cachedCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, CHUNK_CANVAS_W, CHUNK_CANVAS_H);

  let allLoaded = true;

  // Pass 0: Shadows (drawn first, so tiles render on top)
  if (sun) {
    for (let row = 0; row < CHUNK_TILES; row++) {
      for (let col = 0; col < CHUNK_TILES; col++) {
        const tile = chunk.tiles[row * CHUNK_TILES + col];
        if (tile.z <= 0) continue; // No shadow for ground-level
        const { sx, sy } = worldToIso(col, row, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
        const drawX = sx + ORIGIN_X - ISO_TILE_WIDTH / 2;
        const drawY = sy + PAD_TOP - ISO_TILE_HEIGHT / 2;

        if (tile.shadowPath) {
          drawTileShadow(ctx, drawX, drawY, tile.shadowPath, tile.z, sun);
        } else {
          drawDefaultShadow(ctx, drawX, drawY, tile.z, sun);
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
      ctx.drawImage(
        rendered,
        sx + ORIGIN_X - ISO_TILE_WIDTH / 2,
        sy + PAD_TOP - ISO_TILE_HEIGHT / 2 - zPx,
      );
    }
  }

  // Pass 2: Edge blending between adjacent tiles of different kinds
  for (let row = 0; row < CHUNK_TILES; row++) {
    for (let col = 0; col < CHUNK_TILES; col++) {
      const tile = chunk.tiles[row * CHUNK_TILES + col];
      const { sx, sy } = worldToIso(col, row, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
      const drawX = sx + ORIGIN_X - ISO_TILE_WIDTH / 2;
      const drawY = sy + PAD_TOP - ISO_TILE_HEIGHT / 2 - tile.z * Z_PX_PER_LEVEL;

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

const DEMO_COLORS: Record<string, string> = {
  grass:  '#3a7d44',
  dirt:   '#8B6914',
  rock:   '#808080',
  water:  '#2266aa',
  sand:   '#c2b280',
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

/**
 * Generate a demo chunk at the given chunk coords.
 * Uses loaded tile assets when available, falls back to inline demo SVGs.
 * Includes continuous feature placement (walls, rivers, tall grass) for solver.
 */
export function generateDemoChunk(cx: number, cy: number): WorldUnitChunk {
  const tiles: MicroTile[] = [];
  const baseKinds: TileKind[] = ['grass', 'grass', 'grass', 'dirt', 'rock', 'water', 'sand'];
  const useAssets = hasLoadedAssets();

  for (let row = 0; row < CHUNK_TILES; row++) {
    for (let col = 0; col < CHUNK_TILES; col++) {
      const worldCol = cx * CHUNK_TILES + col;
      const worldRow = cy * CHUNK_TILES + row;

      // Check for feature override first
      const featureKind = getFeatureKind(worldCol, worldRow);

      // Deterministic hash for biome selection
      const hash = ((worldCol * 73856093) ^ (worldRow * 19349663)) >>> 0;

      if (featureKind) {
        // Feature tiles: create with appropriate defaults
        // (solver will resolve connections and variant SVGs later)
        let z = 1;
        if (featureKind === 'stone-wall') z = 5;
        if (featureKind === 'river') z = 0;
        if (featureKind === 'tall-grass') z = 1;

        tiles.push({
          kind: featureKind,
          z,
          svg: makeDemoSvg(featureKind === 'stone-wall' ? 'rock' :
               featureKind === 'river' ? 'water' : 'grass', worldCol, worldRow),
          edgeMasks: DEFAULT_EDGE_MASKS,
        });
        continue;
      }

      const kindIdx = hash % baseKinds.length;
      const kind = baseKinds[kindIdx];

      // Try to use a loaded asset first
      if (useAssets) {
        const assetTile = pickTileForKind(kind, (hash >> 4) >>> 0);
        if (assetTile) {
          tiles.push(assetTile);
          continue;
        }
      }

      // Fallback: inline demo SVG
      let z = 1;
      if (kind === 'water' || kind === 'sand') z = 0;
      if (kind === 'rock') z = 2 + (hash >> 8) % 4;

      const edgeMasks = kind === 'grass' ? DEFAULT_EDGE_MASKS : BLEND_EDGE_MASKS;

      tiles.push({
        kind,
        z,
        svg: makeDemoSvg(kind, worldCol, worldRow),
        edgeMasks,
      });
    }
  }
  return { cx, cy, tiles, cachedCanvas: null, dirty: true };
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
