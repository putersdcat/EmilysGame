/**
 * CollectibleScatterer.ts — Coin placement phases (Doc 05 §5.1, §5.2).
 *
 * Extracted from gen.ts (B3 / #253). Two leaf phases that drop coins onto a
 * chunk's walkable cells:
 *   - scatterCollectibles: distance/difficulty-scaled coin density on
 *     walkable base terrain (grass/dirt/sand/flower), with a min-spacing
 *     rule so coins don't cluster.
 *   - layCoinTrails: BFS-traced breadcrumb trails from chunk center toward
 *     up to 3 feature targets (chests, signs, NPCs, locked doors, toll
 *     gates), placing coins every 4-6 cells.
 *
 * Both functions mutate the provided `cells` grid in place; they have no
 * module-level state of their own. `gen.ts` re-exports them so existing
 * callers (none outside gen.ts today) keep importing from `engine/gen`.
 *
 * `CellData` is imported type-only from gen.ts (erased at runtime → no
 * module cycle); it will move to src/types/ in B4.
 */
import type { BiomeDef } from '../../config/biomes.config';
import type { DifficultyProfile } from '../../config/game.config';
import type { CellData } from '../gen';

/**
 * Phase 5c: Scatter coins on walkable base terrain (Doc 05 §5.1).
 *
 * Density scales by chunk distance and difficulty. Min 3-cell spacing
 * between same-type collectibles to avoid clustering.
 *
 * TODO: DOC - distance-based collectible scaling
 */
export function scatterCollectibles(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
  chunkDist: number = 0,
  difficulty?: DifficultyProfile,
): void {
  // Distance scaling (Doc 05 §9.1):
  // dist 0: high density (1.5x), dist 1-2: normal, dist 3-5: 0.8x, dist 6+: 0.6x
  const distMultiplier = chunkDist === 0 ? 1.5
    : chunkDist <= 2 ? 1.0
    : chunkDist <= 5 ? 0.8
    : 0.6;

  // Apply difficulty collectible rate if available (stacks with distance curve)
  const diffMult = difficulty?.collectibleRate ?? 1.0;
  const effectiveMultiplier = distMultiplier * diffMult;

  // Coin density: ~2-4% of walkable base cells × collectibleRate × distance factor
  const baseRate = (0.02 + rng() * 0.02) * biome.collectibleRate * effectiveMultiplier;

  // Minimum spacing: 3 cells between same-type collectibles (Doc 05 §5.1)
  const MIN_SPACING = 3;
  const placed: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      if (!cell.walkable || cell.itemId || cell.npcId) continue;
      // Only place coins on walkable base terrain
      if (cell.assetKey !== 'grass' && cell.assetKey !== 'dirt' && cell.assetKey !== 'sand'
          && cell.assetKey !== 'flower') continue;

      if (rng() < baseRate) {
        // Check minimum spacing from already-placed coins
        let tooClose = false;
        for (let i = placed.length - 1; i >= 0; i--) {
          const dx = Math.abs(x - placed[i].x);
          const dy = Math.abs(y - placed[i].y);
          // Early exit: if we've moved far enough in Y, no prior placement can be close
          if (dy > MIN_SPACING) break;
          if (dx + dy < MIN_SPACING) { tooClose = true; break; }
        }
        if (!tooClose) {
          cell.itemId = 'coin';
          placed.push({ x, y });
        }
      }
    }
  }
}

/**
 * Phase 5d: Lay coin trails along corridors toward features (Doc 05 §5.2).
 * Creates breadcrumb trails of coins (spaced 4-6 cells apart) leading
 * toward chests, NPCs, and gates — guiding exploration naturally.
 *
 * TODO: DOC - coin trail pathfinding algorithm
 */
export function layCoinTrails(
  cells: CellData[][],
  size: number,
  rng: () => number,
): void {
  // Find feature targets (chests, signs, NPCs)
  const targets: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      if (cell.assetKey === 'chest' || cell.assetKey === 'sign' ||
          cell.npcId || cell.assetKey === 'door_locked' ||
          cell.assetKey === 'toll_gate') {
        targets.push({ x, y });
      }
    }
  }

  if (targets.length === 0) return;

  // Pick up to 3 targets to trail toward (avoid over-saturation)
  const trailTargets = targets.slice(0, Math.min(3, targets.length));

  for (const target of trailTargets) {
    // BFS backward from target to find walkable corridor path
    const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
    const path = findPathBFS(cells, size, center, target);
    if (!path || path.length < 8) continue; // Too short to trail

    // Place coins along path at spacing 4-6 cells, skip last 2 cells near target
    const spacing = 4 + Math.floor(rng() * 3); // 4-6
    for (let i = spacing; i < path.length - 2; i += spacing) {
      const { x, y } = path[i];
      const cell = cells[y][x];
      if (!cell.walkable || cell.itemId || cell.npcId) continue;
      // Only on base walkable terrain
      if (cell.assetKey !== 'grass' && cell.assetKey !== 'dirt' &&
          cell.assetKey !== 'sand' && cell.assetKey !== 'flower' &&
          cell.assetKey !== 'stone_floor') continue;
      // 70% chance per trail point (some natural gaps)
      if (rng() < 0.7) {
        cell.itemId = 'coin';
      }
    }
  }
}

/**
 * BFS pathfinder used by layCoinTrails. Walks through anything walkable
 * (coins get placed on walkable cells; the path is the corridor, not a
 * physical walk). Returns the path from start → end, or null if
 * unreachable.
 *
 * File-local helper: only layCoinTrails uses it, so it lives with the
 * scatterer module rather than a generic engine pathfinding module.
 */
function findPathBFS(
  cells: CellData[][],
  size: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
): Array<{ x: number; y: number }> | null {
  if (start.x === end.x && start.y === end.y) return [start];

  const visited = new Set<string>();
  const parent = new Map<string, string>();
  const queue: Array<{ x: number; y: number }> = [start];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = curr.x + dx;
      const ny = curr.y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (visited.has(key)) continue;
      // Allow walking through anything for path tracing (coins go on walkable cells)
      const cell = cells[ny][nx];
      if (!cell.walkable && nx !== end.x && ny !== end.y) continue;
      visited.add(key);
      parent.set(key, `${curr.x},${curr.y}`);

      if (nx === end.x && ny === end.y) {
        // Reconstruct path
        const path: Array<{ x: number; y: number }> = [];
        let k = key;
        while (k) {
          const [px, py] = k.split(',').map(Number);
          path.unshift({ x: px, y: py });
          k = parent.get(k)!;
        }
        return path;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null; // Unreachable
}
