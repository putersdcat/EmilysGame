/**
 * PathSkeleton.ts — Early-chunk dirt path corridor (scene-first P1 / PR4).
 *
 * For chunkDist ≤ {@link PATH_SKELETON_MAX_DIST}, lays a simple manhattan dirt
 * path from a south or west border entry toward a landmark cell (existing
 * house / quiz_gate / cottage near center, else soft terrain near center).
 *
 * Policy:
 *   - Only overwrites grass / flower soft terrain (and reaffirms dirt).
 *   - Never erases structures, gates, water, hard obstacles, items, or NPCs.
 *   - Quiz density stays with ensureMinimumQuizGates (wired after modular stamps).
 *
 * Pipeline slot: after passability, before population / modular scenes so
 * dirt corridors exist when scenes and gates are placed.
 */

import { ASSET_DEFS } from '../../config/assets.config';
import type { CellData } from '../../types/game.types';

/** Early world distance band that gets intentional path language. */
export const PATH_SKELETON_MAX_DIST = 2;

/** Soft terrain the path may paint over (grass/flower family + existing dirt). */
const SOFT_TERRAIN = new Set([
  'grass',
  'dirt',
  'flower',
  'flower_pink',
  'flower_red',
  'sunflower',
  'tulip',
  'wilted_flower',
  'wheat',
  'seedling',
  'clover',
  'tall_plant',
]);

/** Prefer path destinations that already feel like a place. */
const LANDMARK_KEYS = new Set([
  'house',
  'hut',
  'starter_cottage',
  'quiz_gate',
  'door_locked',
  'shop',
  'sign',
  'campfire',
  'bonfire',
  'chest',
  'castle_keep',
  'cathedral_wall',
]);

export interface PathSkeletonResult {
  applied: boolean;
  painted: number;
  entry: { x: number; y: number } | null;
  landmark: { x: number; y: number } | null;
}

function isSoftTerrain(key: string): boolean {
  return SOFT_TERRAIN.has(key) || key.startsWith('flower');
}

function canPaintPath(cell: CellData): boolean {
  if (cell.itemId || cell.npcId) return false;
  // Existing dirt is already path surface (counts as paint for reaffirm).
  if (cell.assetKey === 'dirt') return true;
  // Never stomp non-walkable solids (gates, walls, water, trees, etc.).
  if (!cell.walkable && cell.assetKey !== 'grass') return false;
  return isSoftTerrain(cell.assetKey);
}

function paintDirt(cells: CellData[][], x: number, y: number): boolean {
  const cell = cells[y]?.[x];
  if (!cell) return false;
  if (!canPaintPath(cell)) return false;
  // Already dirt: treat as painted surface without rewrite churn.
  if (cell.assetKey === 'dirt' && cell.walkable) return true;
  const def = ASSET_DEFS.dirt;
  cells[y][x] = {
    assetKey: 'dirt',
    walkable: def.walkable,
    interactable: def.interactable,
  };
  return true;
}

function pickBorderEntry(
  cells: CellData[][],
  size: number,
  rng: () => number,
): { x: number; y: number } | null {
  const candidates: Array<{ x: number; y: number }> = [];
  const sy = size - 1;

  // South border (prefer soft walkable)
  for (let x = 1; x < size - 1; x++) {
    const c = cells[sy][x];
    if (c.walkable && isSoftTerrain(c.assetKey) && !c.itemId && !c.npcId) {
      candidates.push({ x, y: sy });
    }
  }
  // West border
  for (let y = 1; y < size - 1; y++) {
    const c = cells[y][0];
    if (c.walkable && isSoftTerrain(c.assetKey) && !c.itemId && !c.npcId) {
      candidates.push({ x: 0, y });
    }
  }

  if (candidates.length === 0) {
    // Fallback: any walkable cell on S/W (passability usually ensures mid-edges)
    for (let x = 1; x < size - 1; x++) {
      const c = cells[sy][x];
      if (c.walkable && !c.itemId && !c.npcId) candidates.push({ x, y: sy });
    }
    for (let y = 1; y < size - 1; y++) {
      const c = cells[y][0];
      if (c.walkable && !c.itemId && !c.npcId) candidates.push({ x: 0, y });
    }
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

function pickLandmark(
  cells: CellData[][],
  size: number,
  rng: () => number,
): { x: number; y: number } {
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);

  const landmarks: Array<{ x: number; y: number; dist: number }> = [];
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      if (LANDMARK_KEYS.has(cells[y][x].assetKey)) {
        landmarks.push({ x, y, dist: Math.abs(x - cx) + Math.abs(y - cy) });
      }
    }
  }
  if (landmarks.length > 0) {
    landmarks.sort((a, b) => a.dist - b.dist);
    // Prefer the closest place-like cell; only RNG among equal-distance ties.
    const best = landmarks[0].dist;
    const ties = landmarks.filter((l) => l.dist === best);
    return ties[Math.floor(rng() * ties.length)];
  }

  // Soft terrain near center
  const soft: Array<{ x: number; y: number; dist: number }> = [];
  for (let y = Math.max(2, cy - 4); y <= Math.min(size - 3, cy + 4); y++) {
    for (let x = Math.max(2, cx - 4); x <= Math.min(size - 3, cx + 4); x++) {
      const c = cells[y][x];
      if (c.walkable && isSoftTerrain(c.assetKey) && !c.itemId && !c.npcId) {
        soft.push({ x, y, dist: Math.abs(x - cx) + Math.abs(y - cy) });
      }
    }
  }
  if (soft.length > 0) {
    soft.sort((a, b) => a.dist - b.dist);
    const top = soft.slice(0, Math.min(5, soft.length));
    return top[Math.floor(rng() * top.length)];
  }

  return { x: cx, y: cy };
}

/**
 * Paint an L-shaped manhattan corridor. Skips non-soft cells (structures/water).
 */
function paintManhattanCorridor(
  cells: CellData[][],
  size: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  horizontalFirst: boolean,
): number {
  let painted = 0;
  const tryPaint = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    if (paintDirt(cells, x, y)) painted++;
  };

  if (horizontalFirst) {
    const stepX = from.x <= to.x ? 1 : -1;
    for (let x = from.x; ; x += stepX) {
      tryPaint(x, from.y);
      if (x === to.x) break;
    }
    const stepY = from.y <= to.y ? 1 : -1;
    for (let y = from.y; ; y += stepY) {
      tryPaint(to.x, y);
      if (y === to.y) break;
    }
  } else {
    const stepY = from.y <= to.y ? 1 : -1;
    for (let y = from.y; ; y += stepY) {
      tryPaint(from.x, y);
      if (y === to.y) break;
    }
    const stepX = from.x <= to.x ? 1 : -1;
    for (let x = from.x; ; x += stepX) {
      tryPaint(x, to.y);
      if (x === to.x) break;
    }
  }
  return painted;
}

/**
 * Lay a dirt path skeleton for early chunks.
 *
 * @returns result metadata (applied / painted count / endpoints) for tests
 */
export function layPathSkeleton(
  cells: CellData[][],
  size: number,
  rng: () => number,
  chunkDist: number,
): PathSkeletonResult {
  if (chunkDist > PATH_SKELETON_MAX_DIST) {
    return { applied: false, painted: 0, entry: null, landmark: null };
  }

  const entry = pickBorderEntry(cells, size, rng);
  if (!entry) {
    return { applied: false, painted: 0, entry: null, landmark: null };
  }

  const landmark = pickLandmark(cells, size, rng);
  const horizontalFirst = rng() < 0.5;
  const painted = paintManhattanCorridor(cells, size, entry, landmark, horizontalFirst);

  return { applied: true, painted, entry, landmark };
}
