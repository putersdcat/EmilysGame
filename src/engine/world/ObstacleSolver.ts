/**
 * ObstacleSolver.ts — Phase 5.4–6.5: Obstacle placement, balancing, and
 * lock-key DAG validation (Issue #98 — Solver D: No Softlocks).
 *
 * Extracted from gen.ts (B3 / #253). The largest world/ module — bundles
 * five exported phase functions plus the embedded lock-key DAG algorithm
 * (the DAG is non-separable from `balanceObstacles`; it lives inline in
 * that function's body).
 *
 * Public API (re-exported from gen.ts):
 *   - placeQuizGates          (Phase 5.4)  — convert some gate assets to
 *     quiz_gate + place standalone quiz gates at chokepoints (#43)
 *   - placeBonfires           (Phase 5.45) — 1-3 bonfires per chunk for
 *     night-time local lighting, biome-weighted fire variants (#67, #81)
 *   - placeGatesInFenceRuns   (Phase 5.42) — punch quiz_gate into fence
 *     runs for #223 conditional walk; skips central starting chunks
 *   - balanceObstacles        (Phase 6)    — ensure keys exist before
 *     locks; full lock-key DAG with layered reachability expansion;
 *     removes unreachable locks (#98)
 *   - rewardDeadEnds          (Phase 6.5)  — place a biome-appropriate
 *     collectible on every walkable dead-end (Guarantee 2: no unrewarded
 *     dead ends)
 *   - getLockKeyDebugInfo     — reads _dagAccum cumulative metrics
 *     (consumed by main.ts and ui/ui.ts)
 *
 * Private helpers (file-local):
 *   - addExtraObstacles (Phase 5.6) — difficulty-scaled extra obstacles
 *   - promoteDoorGates (Phase 5.41) — convert remaining door_gate →
 *     door_locked so the mechanics system can resolve them with keys
 *   - LockInfo / DAGResult interfaces + _dagAccum module state
 *
 * `countWalkableNeighbors` is imported from world/GridUtils.ts (slice 5).
 * `weightedPick` is imported from ../utils.
 *
 * `CellData` is imported type-only from gen.ts (erased at runtime → no
 * module cycle); it will move to src/types/ in B4.
 */
import { type DifficultyProfile } from '../../config/game.config';
import { ASSET_DEFS } from '../../config/assets.config';
import { type BiomeDef } from '../../config/biomes.config';
import { weightedPick } from '../utils';
import type { CellData } from '../gen';
import { countWalkableNeighbors } from './GridUtils';

// --- Lock-Key DAG types and module state ---

/** Lock cell tracked during DAG validation */
interface LockInfo {
  x: number;
  y: number;
  assetKey: string;
  keyItem: string;
  layer: number;        // expansion layer this lock was resolved in (-1 = unresolved)
  keyPlaced: boolean;
  removed: boolean;
}

/** Result of the DAG validation pass, stored for debug overlay */
interface DAGResult {
  totalLocks: number;
  keysPlaced: number;
  locksRemoved: number;
  layers: number;
  dagValid: boolean;
  recoveryAttempts: number;
  chunksValidated: number;
}

// Module-level cumulative state for debug visibility across all chunks
let _dagAccum: DAGResult = {
  totalLocks: 0, keysPlaced: 0, locksRemoved: 0,
  layers: 0, dagValid: true, recoveryAttempts: 0, chunksValidated: 0,
};

/** Debug info for Lock-Key DAG (Issue #98) — cumulative across all chunks */
export function getLockKeyDebugInfo(): DAGResult {
  return { ..._dagAccum };
}

/**
 * Phase 5.6: Difficulty-Scaled Extra Obstacles (#46)
 * Adds extraObstacles count of additional obstacle cells in walkable areas.
 * Uses biome obstacle weights for asset selection.
 * Protects passability by only placing in cells with 3+ walkable neighbors.
 */
export function addExtraObstacles(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
  difficulty: DifficultyProfile,
): void {
  const targetCount = difficulty.extraObstacles;
  if (targetCount <= 0) return;

  // Collect eligible walkable cells with enough clearance
  const eligible: Array<{ x: number; y: number }> = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.itemId || cell.npcId) continue;
      // Only base terrain
      if (!['grass', 'dirt', 'sand', 'stone_floor'].includes(cell.assetKey)) continue;
      // Must have 3+ walkable neighbors so placing an obstacle won't block passage
      if (countWalkableNeighbors(cells, x, y, size) < 3) continue;
      eligible.push({ x, y });
    }
  }

  // Shuffle and place
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  let placed = 0;
  for (const spot of eligible) {
    if (placed >= targetCount) break;
    const assetKey = weightedPick(biome.obstacleWeights, rng());
    // Skip quiz_gate — those are placed in placeQuizGates
    if (assetKey === 'quiz_gate') continue;
    const def = ASSET_DEFS[assetKey];
    cells[spot.y][spot.x] = {
      assetKey,
      walkable: def?.walkable ?? false,
      interactable: def?.interactable ?? false,
    };
    placed++;
  }
}

/**
 * Phase 5.4: Quiz Gate Placement (#43)
 * Templates produce door_gate / door_locked / toll_gate cells, but never quiz_gate.
 * This phase converts some existing gate cells to quiz_gate based on biome weight,
 * AND places standalone quiz gates at chokepoints when biome config warrants it.
 * Runs after anchor population so it can see the full gate picture.
 */
export function placeQuizGates(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
  difficulty?: DifficultyProfile,
): void {
  const weight = biome.obstacleWeights['quiz_gate'] ?? 0;
  if (weight <= 0) return; // e.g. meadow has no quiz gates

  // Difficulty-scaled quiz frequency: at higher difficulty, spawn more quiz gates
  const quizFreqMult = difficulty?.quizGateFrequency ?? 1.0;
  const effectiveWeight = weight * quizFreqMult; // scale weight by difficulty tier

  // --- Strategy 1: Convert some existing gate-type obstacles to quiz_gate ---
  const CONVERTIBLE_GATES = ['door_gate', 'door_locked', 'toll_gate'];
  const existingGates: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (CONVERTIBLE_GATES.includes(cells[y][x].assetKey)) {
        existingGates.push({ x, y });
      }
    }
  }

  // Convert a proportion of existing gates to quiz gates.
  // Conversion rate = quiz_gate effectiveWeight / total gate-type weight (capped at 60%)
  const totalGateWeight = CONVERTIBLE_GATES.reduce(
    (s, k) => s + (biome.obstacleWeights[k] ?? 0), 0
  ) + effectiveWeight;
  const conversionRate = Math.min(0.6, effectiveWeight / Math.max(totalGateWeight, 0.01));

  // Shuffle existing gates and convert first N
  for (let i = existingGates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [existingGates[i], existingGates[j]] = [existingGates[j], existingGates[i]];
  }
  const numToConvert = Math.max(0, Math.round(existingGates.length * conversionRate));
  for (let i = 0; i < numToConvert; i++) {
    const g = existingGates[i];
    cells[g.y][g.x] = {
      assetKey: 'quiz_gate',
      walkable: false,
      interactable: true,
    };
  }

  // --- Strategy 2: Place standalone quiz gates at chokepoints ---
  // Target: ~1-2 quiz gates per chunk in forest, ~2-3 in cave, ~3-4 in castle
  // Difficulty-scaled: higher quizFrequency increases target count
  const alreadyPlaced = numToConvert;
  const targetTotal = Math.round(effectiveWeight * 30); // e.g. 0.05→1.5, 0.08→2.4, 0.15→4.5
  const remaining = Math.max(0, targetTotal - alreadyPlaced);
  if (remaining <= 0) return;

  // Find chokepoint candidates: walkable cells with ≤ 2 walkable neighbors
  // and at least 1 non-walkable neighbor (natural bottleneck)
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.itemId || cell.npcId) continue;
      // Only place on simple terrain (grass, dirt, sand, stone_floor)
      if (!['grass', 'dirt', 'sand', 'stone_floor'].includes(cell.assetKey)) continue;

      const walkable = countWalkableNeighbors(cells, x, y, size);
      if (walkable < 2 || walkable > 3) continue; // 2-3 = corridor/chokepoint

      // Score: prefer cells at corridor ends (fewer walkable neighbors = better gate spot)
      candidates.push({ x, y, score: 4 - walkable + rng() * 0.5 });
    }
  }

  // Sort by score descending, place quiz gates at best spots
  candidates.sort((a, b) => b.score - a.score);
  let placed = 0;
  for (const c of candidates) {
    if (placed >= remaining) break;
    // Don't place too close to another quiz gate (min 4 cells apart)
    let tooClose = false;
    for (let dy = -4; dy <= 4 && !tooClose; dy++) {
      for (let dx = -4; dx <= 4 && !tooClose; dx++) {
        const nx = c.x + dx, ny = c.y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
          if (cells[ny][nx].assetKey === 'quiz_gate') tooClose = true;
        }
      }
    }
    if (tooClose) continue;

    cells[c.y][c.x] = {
      assetKey: 'quiz_gate',
      walkable: false,
      interactable: true,
    };
    placed++;
  }
}

/**
 * Phase 5.45: Place bonfires for night-time local lighting (#67)
 * 1-3 bonfires per chunk on walkable ground, spaced apart.
 * Bonfires don't appear in water or on existing non-walkable cells.
 */
export function placeBonfires(
  cells: CellData[][],
  size: number,
  _biome: BiomeDef,
  rng: () => number,
): void {
  const target = 1 + Math.floor(rng() * 3); // 1-3 per chunk
  const MIN_SPACING = 6; // Minimum grid distance between bonfires
  const placed: Array<{ x: number; y: number }> = [];

  // Fire variant selection weights by biome (#81)
  const FIRE_WEIGHTS: Record<string, Array<{ key: string; weight: number }>> = {
    meadow:  [{ key: 'bonfire', weight: 0.5 }, { key: 'campfire', weight: 0.4 }, { key: 'biomass_fire', weight: 0.1 }],
    forest:  [{ key: 'bonfire', weight: 0.3 }, { key: 'campfire', weight: 0.3 }, { key: 'biomass_fire', weight: 0.4 }],
    cave:    [{ key: 'bonfire', weight: 0.6 }, { key: 'campfire', weight: 0.3 }, { key: 'biomass_fire', weight: 0.1 }],
    castle:  [{ key: 'bonfire', weight: 0.7 }, { key: 'campfire', weight: 0.2 }, { key: 'biomass_fire', weight: 0.1 }],
  };

  function pickFireVariant(): string {
    const weights = FIRE_WEIGHTS[_biome.name] || FIRE_WEIGHTS.meadow;
    const r = rng();
    let cumulative = 0;
    for (const w of weights) {
      cumulative += w.weight;
      if (r < cumulative) return w.key;
    }
    return 'bonfire';
  }

  // Safe-zone check: fire must be near a structure or NPC (#81)
  function isNearStructure(cx: number, cy: number): boolean {
    const radius = 4;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const ak = cells[ny][nx].assetKey;
        if (ak === 'house' || ak === 'hut' || ak === 'shop' || ak?.startsWith('shop_') || ak === 'fence' || ak === 'outhouse' ||
            cells[ny][nx].npcId) return true;
      }
    }
    return false;
  }

  // Collect candidate walkable cells away from edges
  const candidates: Array<{ x: number; y: number; nearStructure: boolean }> = [];
  for (let y = 3; y < size - 3; y++) {
    for (let x = 3; x < size - 3; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.assetKey === 'water' || cell.assetKey === 'bridge') continue;
      let walkableNeighbors = 0;
      for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nx = x + ddx, ny = y + ddy;
        if (ny >= 0 && ny < size && nx >= 0 && nx < size && cells[ny][nx].walkable) {
          walkableNeighbors++;
        }
      }
      if (walkableNeighbors >= 3) {
        candidates.push({ x, y, nearStructure: isNearStructure(x, y) });
      }
    }
  }

  // Sort: prefer structure-adjacent candidates first (#81 safe-zone rule)
  candidates.sort((a, b) => (b.nearStructure ? 1 : 0) - (a.nearStructure ? 1 : 0));

  // Shuffle within each group (structure-adjacent first, then non-adjacent)
  const split = candidates.findIndex(c => !c.nearStructure);
  const structureCands = split === -1 ? candidates : candidates.slice(0, split);
  const openCands = split === -1 ? [] : candidates.slice(split);
  for (const group of [structureCands, openCands]) {
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
  }
  const sortedCandidates = [...structureCands, ...openCands];

  // Place fires with spacing constraint
  for (const c of sortedCandidates) {
    if (placed.length >= target) break;
    const tooClose = placed.some(p =>
      Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < MIN_SPACING
    );
    if (tooClose) continue;

    const fireKey = pickFireVariant();
    cells[c.y][c.x] = {
      assetKey: fireKey,
      walkable: false,
      interactable: fireKey === 'campfire', // campfires are interactable
    };
    placed.push(c);
  }
}

/**
 * Phase 5.41: Convert remaining door_gate cells to door_locked (#98).
 * After placeQuizGates, any door_gate cells that weren't converted to quiz_gate
 * become door_locked so the mechanics system (OBSTACLE_TEMPLATES) can resolve them.
 * TODO: DOC - door_gate promotion rationale
 */
export function promoteDoorGates(cells: CellData[][], size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y][x].assetKey === 'door_gate') {
        cells[y][x].assetKey = 'door_locked';
        cells[y][x].interactable = true;
      }
    }
  }
}

/**
 * Phase 5.42: Place quiz gates at openings in fence runs (ref #223 + AUTONOMOUS_LOOP.md).
 * Solver-style post-process: detects continuous fence segments (wooden_fence/fence/barricade),
 * replaces an interior cell with quiz_gate (walkable:false default; nano gets conditional 'quiz-gate').
 * Enables exact iso2 walk (isPointWalkableInTile fence footprint + cond unlock) and BFS.
 * Horizontal then vertical to catch perimeters.
 */
export function placeGatesInFenceRuns(
  cells: CellData[][],
  size: number,
  rng: () => number,
  biome: BiomeDef,
): void {
  const w = biome.obstacleWeights ?? {};
  if ((w['quiz_gate'] ?? 0) <= 0 && (w['fence'] ?? 0) <= 0) return;
  const FENCE_ASSETS = ['wooden_fence', 'fence', 'barricade'];
  const GATE = 'quiz_gate';
  // Horizontal runs
  for (let y = 0; y < size; y++) {
    let start = -1;
    for (let x = 0; x <= size; x++) {
      const isF = x < size && FENCE_ASSETS.includes(cells[y][x]?.assetKey);
      if (isF && start < 0) start = x;
      if ((!isF || x === size) && start >= 0) {
        const len = x - start;
        if (len >= 3) {
          const off = Math.floor(rng() * (len - 2)) + 1; // vary gate pos in run interior
          const p = start + off;
          const c = cells[y][p];
          if (c && !c.npcId && !c.itemId) {
            cells[y][p] = { assetKey: GATE, walkable: false, interactable: true };
          }
        }
        start = -1;
      }
    }
  }
  // Vertical runs
  for (let x = 0; x < size; x++) {
    let start = -1;
    for (let y = 0; y <= size; y++) {
      const isF = y < size && FENCE_ASSETS.includes(cells[y]?.[x]?.assetKey);
      if (isF && start < 0) start = y;
      if ((!isF || y === size) && start >= 0) {
        const len = y - start;
        if (len >= 3) {
          const off = Math.floor(rng() * (len - 2)) + 1;
          const p = start + off;
          const c = cells[p]?.[x];
          if (c && !c.npcId && !c.itemId) {
            cells[p][x] = { assetKey: GATE, walkable: false, interactable: true };
          }
        }
        start = -1;
      }
    }
  }
}

/**
 * Phase 6: Lock-Key DAG Validation + Forward Key Placement
 * (Issue #98 — Solver D: No Softlocks)
 *
 * Layered reachability expansion guarantees no softlocks:
 * 1. BFS from center to find freely reachable region (stops at all locks)
 * 2. Identify boundary locks (locks directly adjacent to reachable region)
 * 3. Place keys for boundary locks in the reachable region
 * 4. "Open" those locks and expand the reachable region
 * 5. Repeat until no new locks are resolved
 * 6. Remove any locks that couldn't be resolved (recovery)
 * 7. Store DAG result for debug overlay
 *
 * Quiz gates are treated as passable (always solvable via quiz retry).
 * Toll gates are excluded (coins are scattered organically).
 * TODO: DOC - lock-key DAG algorithm, layered expansion proof
 */
export function balanceObstacles(
  cells: CellData[][],
  size: number,
  rng: () => number,
): void {
  const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) };

  // Lock types that require item-based resolution
  const LOCK_KEYS: Record<string, string> = {
    door_locked: 'key',
    barricade: 'crowbar',
    // toll_gate excluded: coins are organic, not DAG-placed
  };

  // Identify all lock cells
  const allLocks: LockInfo[] = [];
  const lockSet = new Set<string>(); // "x,y" for BFS barrier lookup

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      const keyItem = LOCK_KEYS[cell.assetKey];
      if (!keyItem) continue;
      // barricade must be interactable to count as a lock
      if (cell.assetKey === 'barricade' && !cell.interactable) continue;
      allLocks.push({
        x, y, assetKey: cell.assetKey,
        keyItem, layer: -1, keyPlaced: false, removed: false,
      });
      lockSet.add(`${x},${y}`);
    }
  }

  if (allLocks.length === 0) {
    _dagAccum.chunksValidated++;
    return;
  }

  // Quiz gates are soft barriers — passable for reachability
  const quizGates = new Set<string>();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y][x].assetKey === 'quiz_gate') quizGates.add(`${x},${y}`);
    }
  }

  // BFS that stops at lock cells but passes through quiz gates
  const bfsStoppingAtLocks = (starts: Array<{ x: number; y: number }>): Set<string> => {
    const visited = new Set<string>();
    const queue = [...starts];
    for (const s of starts) visited.add(`${s.x},${s.y}`);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = curr.x + dx;
        const ny = curr.y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const k = `${nx},${ny}`;
        if (visited.has(k)) continue;
        if (lockSet.has(k)) continue;   // stop at item-locks
        const cell = cells[ny][nx];
        // passable: walkable cells OR quiz gates (always solvable)
        if (!cell.walkable && !quizGates.has(k)) continue;
        visited.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
    return visited;
  };

  const reachable = new Set<string>();
  let layer = 0;
  let keysPlaced = 0;
  let locksRemoved = 0;
  let recoveryAttempts = 0;

  // Layer 0: freely reachable from center (before any locks)
  for (const k of bfsStoppingAtLocks([center])) reachable.add(k);

  // Iterative expansion: resolve boundary locks layer by layer
  let changed = true;
  while (changed) {
    changed = false;

    // Find locks adjacent to the reachable frontier
    const boundaryLocks = allLocks.filter(lock => {
      if (lock.layer !== -1 || lock.removed) return false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (reachable.has(`${lock.x + dx},${lock.y + dy}`)) return true;
      }
      return false;
    });

    if (boundaryLocks.length === 0) break;

    // For each boundary lock, place its key in the current reachable region
    for (const lock of boundaryLocks) {
      const candidates: Array<{ x: number; y: number; dist: number }> = [];
      for (const k of reachable) {
        const [px, py] = k.split(',').map(Number);
        const cell = cells[py][px];
        if (!cell.walkable || cell.itemId || cell.npcId) continue;
        const dist = Math.abs(px - center.x) + Math.abs(py - center.y);
        candidates.push({ x: px, y: py, dist });
      }

      if (candidates.length > 0) {
        // Place key closer to center (early in player's path)
        candidates.sort((a, b) => a.dist - b.dist);
        const poolSize = Math.max(1, Math.floor(candidates.length * 0.3));
        const pick = candidates[Math.floor(rng() * poolSize)];
        cells[pick.y][pick.x].itemId = lock.keyItem;
        lock.keyPlaced = true;
        lock.layer = layer;
        keysPlaced++;
      } else {
        // Recovery: no room for key → remove the lock entirely
        recoveryAttempts++;
        cells[lock.y][lock.x] = {
          ...cells[lock.y][lock.x],
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        };
        lock.removed = true;
        lock.layer = layer;
        locksRemoved++;
        lockSet.delete(`${lock.x},${lock.y}`);
      }
      changed = true;
    }

    // Expand reachable region through resolved/removed locks
    const newStarts = boundaryLocks
      .filter(l => l.keyPlaced || l.removed)
      .map(l => {
        lockSet.delete(`${l.x},${l.y}`); // no longer a barrier
        reachable.add(`${l.x},${l.y}`);
        return { x: l.x, y: l.y };
      });

    if (newStarts.length > 0) {
      for (const k of bfsStoppingAtLocks(newStarts)) reachable.add(k);
    }
    layer++;
  }

  // Cleanup: any remaining unresolved locks are unreachable from center
  for (const lock of allLocks) {
    if (lock.layer === -1 && !lock.removed) {
      recoveryAttempts++;
      cells[lock.y][lock.x] = {
        ...cells[lock.y][lock.x],
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      };
      lock.removed = true;
      locksRemoved++;
    }
  }

  _dagAccum.totalLocks += allLocks.length;
  _dagAccum.keysPlaced += keysPlaced;
  _dagAccum.locksRemoved += locksRemoved;
  _dagAccum.layers = Math.max(_dagAccum.layers, layer);
  _dagAccum.recoveryAttempts += recoveryAttempts;
  _dagAccum.chunksValidated++;
  if (locksRemoved > 0) _dagAccum.dagValid = false;
}

/**
 * Phase 6.5: Dead-End Reward Scanner (WorldEngine-05 §7.1, Guarantee 2).
 * Finds dead-end corridors (walkable cells with only 1 walkable neighbor)
 * and ensures each has at least one collectible or NPC.
 * "No Dead Ends Without Reward" — player should never be punished for exploring.
 * TODO: DOC - dead-end reward algorithm and collectible pools
 */
export function rewardDeadEnds(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
): void {
  // Biome-appropriate dead-end reward pools (more valuable in harder biomes)
  const rewardPools: Record<string, string[]> = {
    meadow:  ['coin', 'coin', 'flower', 'mushroom'],
    forest:  ['coin', 'coin', 'mushroom', 'key'],
    cave:    ['coin', 'coin', 'coin', 'key', 'potion'],
    castle:  ['coin', 'coin', 'key', 'potion', 'potion'],
  };
  const pool = rewardPools[biome.name] ?? ['coin'];

  // Find dead-end cells: walkable cells with exactly 1 walkable orthogonal neighbor
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.itemId || cell.npcId) continue; // Already has content

      let walkableNeighbors = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny][nx].walkable) {
          walkableNeighbors++;
        }
      }

      // Dead end = exactly 1 walkable neighbor (corridor terminus)
      if (walkableNeighbors === 1) {
        // 80% chance to place a reward (avoid feeling formulaic)
        if (rng() < 0.8) {
          const reward = pool[Math.floor(rng() * pool.length)];
          cell.itemId = reward;
        }
      }
    }
  }
}
