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
 *     quiz_gate + place standalone quiz gates at chokepoints (#43);
 *     prefers local cut-points on main corridors (Phase A unavoidability)
 *   - sealTrivialQuizGateBypasses (Phase 5.43) — close short walk-arounds
 *     around quiz_gates so they force engagement (Docs/13 §2 #1)
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
import type { CellData } from '../../types/game.types';
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

// --- Quiz-gate unavoidability helpers (Phase A, 2026-07-15) ---
// Flat-2D graph only: a quiz_gate is "unavoidable" when its walkable
// cardinal neighbors fall into ≥2 connected components if the gate cell
// is treated as blocked. Placement prefers local cut-points on corridors
// from chunk entries; sealTrivialQuizGateBypasses repairs leftover short
// detours after fence-run punches (Docs/13 §2 #1, Next-Engine Phase 1).

const CARDINAL_DX = [1, 0, -1, 0];
const CARDINAL_DY = [0, 1, 0, -1];
const SIMPLE_TERRAIN = new Set(['grass', 'dirt', 'sand', 'stone_floor', 'path']);

function walkableCardinalNeighbors(
  cells: CellData[][],
  x: number,
  y: number,
  size: number,
  /** If set, this cell is treated as non-walkable (e.g. candidate gate). */
  treatBlocked?: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 4; i++) {
    const nx = x + CARDINAL_DX[i];
    const ny = y + CARDINAL_DY[i];
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    if (treatBlocked && nx === treatBlocked.x && ny === treatBlocked.y) continue;
    if (!cells[ny][nx].walkable) continue;
    out.push({ x: nx, y: ny });
  }
  return out;
}

/** True if treating (cx,cy) as blocked splits its walkable neighbors into ≥2 components. */
function wouldBeLocalCutPoint(
  cells: CellData[][],
  cx: number,
  cy: number,
  size: number,
): boolean {
  const nbrs = walkableCardinalNeighbors(cells, cx, cy, size);
  if (nbrs.length < 2) return false;

  const key = (x: number, y: number) => y * size + x;
  const seen = new Uint8Array(size * size);
  const qx = [nbrs[0].x];
  const qy = [nbrs[0].y];
  seen[key(nbrs[0].x, nbrs[0].y)] = 1;
  let head = 0;
  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    head++;
    for (let i = 0; i < 4; i++) {
      const nx = x + CARDINAL_DX[i];
      const ny = y + CARDINAL_DY[i];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (nx === cx && ny === cy) continue; // never step through candidate gate
      if (!cells[ny][nx].walkable) continue;
      const k = key(nx, ny);
      if (seen[k]) continue;
      seen[k] = 1;
      qx.push(nx);
      qy.push(ny);
    }
  }
  for (let i = 1; i < nbrs.length; i++) {
    if (!seen[key(nbrs[i].x, nbrs[i].y)]) return true; // at least one nbr unreachable → cut
  }
  return false;
}

/**
 * Multi-source BFS from chunk mid-edge entries. Higher values = more
 * "main corridor" traffic. Used only to bias placement scores.
 */
function buildCorridorTraffic(cells: CellData[][], size: number): Float32Array {
  const traffic = new Float32Array(size * size);
  const mid = Math.floor(size / 2);
  const seeds: Array<{ x: number; y: number }> = [
    { x: mid, y: 0 },
    { x: mid, y: size - 1 },
    { x: 0, y: mid },
    { x: size - 1, y: mid },
  ];
  // Also seed any walkable border cell every ~size/4 for broader coverage
  for (let i = 0; i < size; i += Math.max(4, Math.floor(size / 4))) {
    seeds.push({ x: i, y: 0 }, { x: i, y: size - 1 }, { x: 0, y: i }, { x: size - 1, y: i });
  }

  for (const seed of seeds) {
    if (!cells[seed.y]?.[seed.x]?.walkable) {
      // Nudge seed to nearest walkable on that edge
      let found = false;
      for (let d = 0; d < size && !found; d++) {
        for (const [ox, oy] of [[d, 0], [-d, 0], [0, d], [0, -d]] as const) {
          const sx = seed.x + ox, sy = seed.y + oy;
          if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
          // Keep seed on the same edge when possible
          if (seed.y === 0 && sy !== 0) continue;
          if (seed.y === size - 1 && sy !== size - 1) continue;
          if (seed.x === 0 && sx !== 0) continue;
          if (seed.x === size - 1 && sx !== size - 1) continue;
          if (cells[sy][sx].walkable) {
            seed.x = sx; seed.y = sy; found = true; break;
          }
        }
      }
      if (!found) continue;
    }

    const dist = new Int16Array(size * size);
    dist.fill(-1);
    const qx = [seed.x], qy = [seed.y];
    dist[seed.y * size + seed.x] = 0;
    let head = 0;
    while (head < qx.length) {
      const x = qx[head], y = qy[head];
      head++;
      const d = dist[y * size + x];
      // Weight nearer cells more (corridor core near entries)
      traffic[y * size + x] += Math.max(0, 40 - d);
      if (d >= 40) continue;
      for (let i = 0; i < 4; i++) {
        const nx = x + CARDINAL_DX[i], ny = y + CARDINAL_DY[i];
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (!cells[ny][nx].walkable) continue;
        const k = ny * size + nx;
        if (dist[k] >= 0) continue;
        dist[k] = d + 1;
        qx.push(nx); qy.push(ny);
      }
    }
  }
  return traffic;
}

function pickSealAsset(biome: BiomeDef): string {
  // Prefer fence in open biomes, wall in built-up ones (asset keys from assets.config)
  if (biome.name === 'castle' || biome.name === 'cave') return 'wall';
  return 'fence';
}

/**
 * Phase 5.4: Quiz Gate Placement (#43)
 * Templates produce door_gate / door_locked / toll_gate cells, but never quiz_gate.
 * This phase converts some existing gate cells to quiz_gate based on biome weight,
 * AND places standalone quiz gates at chokepoints when biome config warrants it.
 * Runs after anchor population so it can see the full gate picture.
 *
 * Phase A (2026-07-15): standalone placement prefers local cut-points on
 * main corridors (entry BFS traffic) so gates force engagement rather than
 * sitting in open terrain with trivial walk-arounds (Docs/13 §2 #1).
 */
export function placeQuizGates(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
  difficulty?: DifficultyProfile,
): void {
  const weight = biome.obstacleWeights['quiz_gate'] ?? 0;
  if (weight <= 0) return;

  // Difficulty-scaled quiz frequency: at higher difficulty, spawn more quiz gates
  const quizFreqMult = difficulty?.quizGateFrequency ?? 1.0;
  const effectiveWeight = weight * quizFreqMult; // scale weight by difficulty tier

  // --- Strategy 1: Convert some existing gate-type obstacles to quiz_gate ---
  const CONVERTIBLE_GATES = ['door_gate', 'door_locked', 'toll_gate'];
  const existingGates: Array<{ x: number; y: number; cut: boolean }> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (CONVERTIBLE_GATES.includes(cells[y][x].assetKey)) {
        // Existing gates are already non-walkable; cut-point uses current graph
        // (neighbors already cannot step through the gate cell).
        const cut = wouldBeLocalCutPoint(cells, x, y, size);
        existingGates.push({ x, y, cut });
      }
    }
  }

  // Convert a proportion of existing gates to quiz gates.
  // Conversion rate = quiz_gate effectiveWeight / total gate-type weight (capped at 60%)
  const totalGateWeight = CONVERTIBLE_GATES.reduce(
    (s, k) => s + (biome.obstacleWeights[k] ?? 0), 0
  ) + effectiveWeight;
  const conversionRate = Math.min(0.6, effectiveWeight / Math.max(totalGateWeight, 0.01));

  // Prefer converting cut-point gates first (more likely unavoidable)
  existingGates.sort((a, b) => (b.cut ? 1 : 0) - (a.cut ? 1 : 0) || rng() - 0.5);
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

  const traffic = buildCorridorTraffic(cells, size);

  // Find chokepoint candidates: walkable cells with 2-3 walkable neighbors.
  // Prefer local cut-points on high-traffic corridors (Phase A).
  const candidates: Array<{ x: number; y: number; score: number; cut: boolean }> = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.itemId || cell.npcId) continue;
      // Only place on simple terrain (grass, dirt, sand, stone_floor)
      if (!['grass', 'dirt', 'sand', 'stone_floor'].includes(cell.assetKey)) continue;

      const walkable = countWalkableNeighbors(cells, x, y, size);
      if (walkable < 2 || walkable > 3) continue; // 2-3 = corridor/chokepoint

      const cut = wouldBeLocalCutPoint(cells, x, y, size);
      const corridor = traffic[y * size + x] / 40; // ~0..N seed contributions
      // Score: cut-points first, then corridor traffic, then tighter chokepoints
      const score =
        (cut ? 100 : 0) +
        corridor * 2 +
        (4 - walkable) +
        rng() * 0.5;
      candidates.push({ x, y, score, cut });
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
 * Phase 5.43: Seal trivial walk-arounds around existing quiz_gates.
 *
 * After placeQuizGates + placeGatesInFenceRuns, some gates still sit where a
 * short detour reconnects both sides. For each bypassable quiz_gate with a
 * short neighbor-to-neighbor path, place a single biome-appropriate barrier
 * on the detour so the gate becomes a local cut-point — without a full
 * re-solve. Skips seals that would fail the cut-point check or land on
 * non-simple terrain / occupied cells.
 *
 * Called from ChunkGenerator after fence-run punches (Docs/13 §2 #1).
 */
export function sealTrivialQuizGateBypasses(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
): void {
  const sealAsset = pickSealAsset(biome);
  const MAX_BYPASS_LEN = 8; // only seal short detours (baseline mean was ~6.8)
  const gates: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y][x].assetKey === 'quiz_gate') gates.push({ x, y });
    }
  }

  for (const g of gates) {
    // Already a cut-point? leave alone
    if (wouldBeLocalCutPoint(cells, g.x, g.y, size)) continue;

    const nbrs = walkableCardinalNeighbors(cells, g.x, g.y, size);
    if (nbrs.length < 2) continue;

    // Find a short path between the first neighbor and any other (bypass)
    const start = nbrs[0];
    let bestPath: Array<{ x: number; y: number }> | null = null;

    for (let ni = 1; ni < nbrs.length; ni++) {
      const goal = nbrs[ni];
      // BFS with parent pointers; never through the gate
      const parent = new Int32Array(size * size);
      parent.fill(-1);
      const qx = [start.x], qy = [start.y];
      const startK = start.y * size + start.x;
      parent[startK] = startK; // self
      let head = 0;
      let foundK = -1;
      while (head < qx.length) {
        const x = qx[head], y = qy[head];
        head++;
        if (x === goal.x && y === goal.y) {
          foundK = y * size + x;
          break;
        }
        for (let i = 0; i < 4; i++) {
          const nx = x + CARDINAL_DX[i], ny = y + CARDINAL_DY[i];
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          if (nx === g.x && ny === g.y) continue;
          if (!cells[ny][nx].walkable) continue;
          const k = ny * size + nx;
          if (parent[k] >= 0) continue;
          parent[k] = y * size + x;
          qx.push(nx); qy.push(ny);
        }
      }
      if (foundK < 0) continue;

      // Rebuild path
      const path: Array<{ x: number; y: number }> = [];
      let cur = foundK;
      const guard = size * size + 1;
      let steps = 0;
      while (steps++ < guard) {
        const px = cur % size, py = (cur / size) | 0;
        path.push({ x: px, y: py });
        if (parent[cur] === cur) break;
        cur = parent[cur];
        if (cur < 0) break;
      }
      path.reverse();
      if (path.length - 1 > MAX_BYPASS_LEN) continue;
      if (!bestPath || path.length < bestPath.length) bestPath = path;
    }

    if (!bestPath || bestPath.length < 3) {
      // Try perpendicular seal: if N-S corridor, plug E/W open cells beside gate
      const hasN = nbrs.some(n => n.x === g.x && n.y === g.y - 1);
      const hasS = nbrs.some(n => n.x === g.x && n.y === g.y + 1);
      const hasE = nbrs.some(n => n.x === g.x + 1 && n.y === g.y);
      const hasW = nbrs.some(n => n.x === g.x - 1 && n.y === g.y);
      const trySeal = (sx: number, sy: number) => {
        if (sx < 0 || sy < 0 || sx >= size || sy >= size) return false;
        const cell = cells[sy][sx];
        if (!cell.walkable || cell.itemId || cell.npcId) return false;
        if (!SIMPLE_TERRAIN.has(cell.assetKey)) return false;
        // Tentatively seal
        const prev = { ...cell };
        cells[sy][sx] = { assetKey: sealAsset, walkable: false, interactable: false };
        const ok = wouldBeLocalCutPoint(cells, g.x, g.y, size);
        if (!ok) {
          cells[sy][sx] = prev;
          return false;
        }
        return true;
      };
      if (hasN && hasS) {
        trySeal(g.x + 1, g.y);
        trySeal(g.x - 1, g.y);
      } else if (hasE && hasW) {
        trySeal(g.x, g.y + 1);
        trySeal(g.x, g.y - 1);
      }
      continue;
    }

    // Seal one interior cell on the shortest bypass (not endpoints = gate nbrs)
    const interior = bestPath.slice(1, -1);
    // Shuffle lightly for variety while remaining seeded
    for (let i = interior.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [interior[i], interior[j]] = [interior[j], interior[i]];
    }
    // Prefer cells closer to the gate (Manhattan)
    interior.sort((a, b) =>
      (Math.abs(a.x - g.x) + Math.abs(a.y - g.y)) - (Math.abs(b.x - g.x) + Math.abs(b.y - g.y))
    );

    for (const spot of interior) {
      const cell = cells[spot.y][spot.x];
      if (!cell.walkable || cell.itemId || cell.npcId) continue;
      if (!SIMPLE_TERRAIN.has(cell.assetKey)) continue;
      // Don't seal another quiz_gate or existing lock
      if (cell.assetKey === 'quiz_gate' || cell.assetKey === 'door_locked') continue;

      const prev = { assetKey: cell.assetKey, walkable: cell.walkable, interactable: cell.interactable, itemId: cell.itemId, npcId: cell.npcId };
      cells[spot.y][spot.x] = { assetKey: sealAsset, walkable: false, interactable: false };
      if (wouldBeLocalCutPoint(cells, g.x, g.y, size)) {
        break; // sealed successfully
      }
      // Revert and try next
      cells[spot.y][spot.x] = {
        assetKey: prev.assetKey,
        walkable: prev.walkable,
        interactable: prev.interactable,
        itemId: prev.itemId,
        npcId: prev.npcId,
      };
    }
  }
}

/**
 * Phase 5.44: Guarantee at least one quiz_gate in a chunk that has quiz
 * content enabled, so leaving spawn always surfaces the core loop even
 * when random placement + fence runs produced zero gates.
 */
export function ensureMinimumQuizGates(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
  minCount = 1,
): void {
  if ((biome.obstacleWeights['quiz_gate'] ?? 0) <= 0) return;
  let count = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y][x].assetKey === 'quiz_gate') count++;
    }
  }
  if (count >= minCount) return;

  const traffic = buildCorridorTraffic(cells, size);
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      const cell = cells[y][x];
      if (!cell.walkable || cell.itemId || cell.npcId) continue;
      if (!['grass', 'dirt', 'sand', 'stone_floor'].includes(cell.assetKey)) continue;
      const n = countWalkableNeighbors(cells, x, y, size);
      if (n < 2 || n > 3) continue;
      const cut = wouldBeLocalCutPoint(cells, x, y, size);
      candidates.push({
        x, y,
        score: (cut ? 50 : 0) + traffic[y * size + x] + (4 - n) + rng() * 0.3,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    if (count >= minCount) break;
    cells[c.y][c.x] = { assetKey: 'quiz_gate', walkable: false, interactable: true };
    count++;
  }

  // Last resort: any walkable cell without content (flowers/animals count —
  // meadow soft-terrain is full of them after decorations / modular stamps).
  if (count < minCount) {
    for (let y = 1; y < size - 1 && count < minCount; y++) {
      for (let x = 1; x < size - 1 && count < minCount; x++) {
        const cell = cells[y][x];
        if (!cell.walkable || cell.itemId || cell.npcId) continue;
        if (cell.assetKey === 'quiz_gate' || cell.assetKey === 'water' || cell.assetKey === 'bridge') continue;
        if (countWalkableNeighbors(cells, x, y, size) < 1) continue;
        cells[y][x] = { assetKey: 'quiz_gate', walkable: false, interactable: true };
        count++;
      }
    }
  }

  // Absolute last resort: force-overwrite the first walkable cell in the
  // interior (even isolated). Better a weird gate than a gate-less chunk.
  if (count < minCount) {
    for (let y = 1; y < size - 1 && count < minCount; y++) {
      for (let x = 1; x < size - 1 && count < minCount; x++) {
        const cell = cells[y][x];
        if (cell.assetKey === 'quiz_gate') continue;
        if (cell.itemId || cell.npcId) continue;
        // Prefer walkable; if none exist, punch a solid (tree/rock) instead
        if (!cell.walkable && cell.assetKey !== 'rock' && cell.assetKey !== 'bush'
            && cell.assetKey !== 'tree' && cell.assetKey !== 'tree_pine'
            && cell.assetKey !== 'tree_palm' && cell.assetKey !== 'fence') {
          continue;
        }
        cells[y][x] = { assetKey: 'quiz_gate', walkable: false, interactable: true };
        count++;
      }
    }
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
