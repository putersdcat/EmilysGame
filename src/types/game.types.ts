/**
 * game.types.ts — Core game data types shared across engine, rendering, and game layers.
 *
 * Centralizes types that were previously declared in `src/engine/gen.ts` and
 * consumed by 3+ modules across the codebase. Per `types.instructions.md`,
 * shared types used by 3+ modules live here.
 *
 * B4 series (#253) — extracted from gen.ts after B3 series completed the
 * world/ module split. gen.ts now imports these types and re-exports them
 * for backward compatibility with existing consumers.
 *
 * @see .github/instructions/types.instructions.md
 */

import type { EdgeTag } from '../config/tiles.config';
import type { MoodProfile } from '../engine/world/BiomeSelector';

// ─── Cell & Chunk Data ────────────────────────────────────────────────────────

/**
 * Single cell within a generated chunk. Carries the resolved asset key plus
 * gameplay metadata (walkability, interactability, NPC/item placement).
 */
export interface CellData {
  assetKey: string;
  walkable: boolean;
  interactable: boolean;
  npcId?: string;
  /** NPC direction (#85) */
  npcFacing?: 'south' | 'north' | 'east' | 'west';
  itemId?: string;
  resolved?: boolean;
}

/**
 * Edge tags along each chunk border, one per world unit slot (GRID_DIM values).
 * Used for inter-chunk stitching (#17) and traversal continuity (#46).
 */
export interface ChunkBorderEdges {
  n: EdgeTag[];
  s: EdgeTag[];
  e: EdgeTag[];
  w: EdgeTag[];
  /** Traversal walkability per border position (#46) */
  nTraversal?: boolean[];
  sTraversal?: boolean[];
  eTraversal?: boolean[];
  wTraversal?: boolean[];
}

/**
 * Constraints from already-generated neighboring chunks. Each direction
 * carries the edge tags from the facing border of the neighbor.
 */
export interface BorderConstraints {
  /** South border Edge tags from chunk above */
  n?: EdgeTag[];
  /** North border edge tags from chunk below */
  s?: EdgeTag[];
  /** West border edge tags from chunk to the east */
  e?: EdgeTag[];
  /** East border edge tags from chunk to the west */
  w?: EdgeTag[];
  /** Traversal continuity from neighbors (#46) */
  nTraversal?: boolean[];
  sTraversal?: boolean[];
  eTraversal?: boolean[];
  wTraversal?: boolean[];
}

/**
 * Fully-resolved chunk data returned by `generateChunk` / `generateChunkSync`.
 * Consumed by rendering, wildlife, terrain-cache, minimap, particles, and
 * the WASM bridge.
 */
export interface ChunkData {
  chunkX: number;
  chunkY: number;
  biomeId: number;
  /** Biome name for cross-chunk coherence queries */
  biomeName: string;
  cells: CellData[][];
  seed: string;
  generated: boolean;
  /** World unit grid border edges for inter-chunk stitching (#17) */
  borderEdges?: ChunkBorderEdges;
  /** Chunk-level climate derived from noise fields (#101) */
  climate?: { moisture: number; temperature: number };
  /** Mood profile derived from entropy seed (#46) */
  mood?: MoodProfile;
  /** Biome transition flags for border zones (#46) */
  biomeTransitions?: { n: boolean; s: boolean; e: boolean; w: boolean };
}

/**
 * Internal result of `generateGridChunk` — the cells + border edges before
 * they are wrapped into a `ChunkData`. Not exported from gen.ts; lives here
 * for type-sharing with the world/ modules.
 */
export interface GridChunkResult {
  cells: CellData[][];
  borderEdges: ChunkBorderEdges;
}
