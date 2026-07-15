/**
 * Populator.ts — Content population phases (Doc 05 §4–§6, WorldEngine-05).
 *
 * Extracted from gen.ts (B3 / #253). Three phase functions that place NPCs,
 * items, decorations, and collectibles onto a generated chunk:
 *   - populateAnchors (Phase 5a): walk template anchor points and dispatch
 *     to NPC/item/decoration/feature placement strategies. NPC cap of 1
 *     per world unit (#104). Difficulty-aware guardian bias (#46).
 *   - clusterDecorations (Phase 5b): cluster-based placement of biome
 *     decorations (3-7 per cluster, 5-8 cell cluster spacing, sqrt-bias
 *     for denser cluster centers). Target coverage 15-25% scaled by
 *     distance and difficulty.
 *   - scatterDecorations (Phase 5b legacy): simple scatter fallback kept
 *     for test compatibility. Replaced by clusterDecorations in production.
 *
 * Module-private helpers (placeNpcAtCell / placeItemAtCell /
 * placeDecorationAtCell / placeFeatureAtCell / isNearGate /
 * hasAdjacentInteractable) are file-local; the shared
 * `countWalkableNeighbors` helper lives in world/GridUtils.ts (also used
 * by ObstacleSolver in slice 7).
 *
 * `gen.ts` re-exports the public functions so any future caller keeps
 * importing them from `engine/gen`. Call sites in `generateChunkSync` are
 * unchanged (the function bodies just re-export through).
 *
 * `CellData` is imported type-only from gen.ts (erased at runtime → no
 * module cycle); it will move to src/types/ in B4.
 */
import { type DifficultyProfile } from '../../config/game.config';
import { ASSET_DEFS } from '../../config/assets.config';
import { type BiomeDef } from '../../config/biomes.config';
import { type RotatedTemplate } from '../../config/tiles.config';
import type { CellData } from '../../types/game.types';
import { countWalkableNeighbors } from './GridUtils';
import { getMerchantPersonaIdForBiome } from '../../config/npc.config';
// B3 micro-slice 8.6 (#253): WU_SIZE + GRID_DIM are now sourced from
// WorldGrid.ts (single source of truth shared with gen.ts and
// WorldUnitSolver.ts). Populator uses WU_SIZE for the per-template
// world-unit grid loop and GRID_DIM for cluster spread calculations.
import { WU_SIZE, GRID_DIM } from './WorldGrid';

// --- Biome-specific lookup tables (moved from gen.ts) ---

/** Biome-specific decoration palettes for SCATTER (must all be walkable!) */
const BIOME_SCATTER_DECORATIONS: Record<string, string[]> = {
  // S5: flowers dominate; animals rare so they feel special (not field salt)
  meadow:  [
    'flower', 'flower', 'flower', 'flower_pink', 'flower_red', 'sunflower',
    'mushroom', 'clover', 'tall_plant',
    'chicken', 'rabbit', 'duck', // rare — 3 of ~12 slots
  ],
  forest:  [
    'mushroom', 'mushroom', 'flower', 'flower_pink', 'tall_plant', 'stump', 'stump',
    'rabbit', 'fox',
  ],
  cave:    ['mushroom', 'mushroom', 'stump'],
  castle:  ['flower', 'flower_red', 'stump'],
};

/** Biome-specific decoration palettes for ANCHOR placement (may include non-walkable) */
const BIOME_ANCHOR_DECORATIONS: Record<string, string[]> = {
  meadow:  ['flower', 'flower_pink', 'flower_red', 'sunflower', 'bush', 'mushroom', 'tall_plant'],
  forest:  ['mushroom', 'bush', 'tree', 'tree_pine', 'tall_plant', 'stump'],
  cave:    ['rock', 'mushroom', 'stump'],
  castle:  ['wall', 'rock', 'tall_plant'],
};

/** Biome-specific NPC pools for anchor roles — includes biome-specific NPCs (Doc 05 §4.2) */
const BIOME_NPC_POOL: Record<string, string[]> = {
  meadow:  ['npc_villager', 'npc_merchant', 'npc_farmer', 'npc_beekeeper', 'npc_cat', 'npc_cat'],
  forest:  ['npc_villager', 'npc_merchant', 'npc_ranger', 'npc_hermit', 'npc_cat', 'npc_black_cat'],
  cave:    ['npc_guardian', 'npc_merchant', 'npc_miner', 'npc_miner', 'npc_black_cat'],
  castle:  ['npc_guardian', 'npc_guardian', 'npc_merchant', 'npc_knight', 'npc_ghost', 'npc_cat'],
};

/** NPC id mapping by asset key — default persona fallbacks */
const NPC_ID_MAP: Record<string, string> = {
  npc_merchant: 'merchant_default',
  npc_villager: 'villager_default',
  npc_guardian: 'guardian_default',
  npc_cat: 'cat_default',
  npc_black_cat: 'black_cat_default',
  npc_farmer: 'farmer_meadow',
  npc_beekeeper: 'beekeeper_meadow',
  npc_ranger: 'ranger_forest',
  npc_hermit: 'hermit_forest',
  npc_miner: 'miner_cave',
  npc_ghost: 'ghost_castle',
  npc_knight: 'knight_castle',
};

/**
 * Phase 5a: Place entities at template anchor points.
 * Each anchor role maps to a placement strategy:
 *   - 'npc'        → place an NPC from biome pool
 *   - 'item'       → place a collectible (coin, key, potion) based on biome feature weights
 *   - 'decoration' → place a biome-appropriate decorative object
 *   - 'feature'    → place a chest or sign (special interactive)
 *
 * NPC Cap (#104): Max 1 NPC per world unit (5×5 slot). When multiple NPC anchors
 * exist, the first eligible one wins. Priority: gate-adjacent > junction > pool.
 */
export function populateAnchors(
  cells: CellData[][],
  grid: (RotatedTemplate | null)[][],
  biome: BiomeDef,
  rng: () => number,
  difficulty?: DifficultyProfile,
): void {
  // #104: Track which world-unit slots already have an NPC placed
  const npcPlacedInUnit = new Set<string>();
  // Merchant spacing (WorldEngine-05 §4.1: "at least one macro tile between
  // merchants"): macro tiles don't exist as a spatial unit yet (see
  // VisionAlignmentAudit.md Finding #3), so this approximates the same
  // intent at the next-best available granularity -- at most one wandering
  // npc_merchant per chunk (populateAnchors is always called once per
  // chunk). Object wrapper so nested placeNpcAtCell calls can mutate it.
  const merchantTracker = { placed: false };
  // Debug counters
  let npcAttempts = 0;
  let npcPlaced = 0;
  let npcDropped = 0;

  for (let gy = 0; gy < GRID_DIM; gy++) {
    for (let gx = 0; gx < GRID_DIM; gx++) {
      const template = grid[gy][gx];
      if (!template || !template.anchors) continue;

      const baseX = gx * WU_SIZE;
      const baseY = gy * WU_SIZE;
      const unitKey = `${gy},${gx}`;

      for (const anchor of template.anchors) {
        const cx = baseX + anchor.x;
        const cy = baseY + anchor.y;
        if (cy >= cells.length || cx >= cells[0].length) continue;

        const cell = cells[cy][cx];
        // Skip if cell is already occupied by a non-terrain object
        if (!cell.walkable && cell.assetKey !== 'grass' && cell.assetKey !== 'dirt') continue;

        switch (anchor.role) {
          case 'npc':
            npcAttempts++;
            // #104: enforce max-1 NPC per world unit
            if (npcPlacedInUnit.has(unitKey)) {
              npcDropped++;
              break;
            }
            if (placeNpcAtCell(cells, cx, cy, biome, rng, difficulty, merchantTracker)) {
              npcPlacedInUnit.add(unitKey);
              npcPlaced++;
            }
            break;
          case 'item':
            placeItemAtCell(cells, cx, cy, biome, rng);
            break;
          case 'decoration':
            placeDecorationAtCell(cells, cx, cy, biome, rng);
            break;
          case 'feature':
            placeFeatureAtCell(cells, cx, cy, biome, rng);
            break;
          // #101: new anchor roles — fall through to decoration for now
          case 'merchant':
          case 'quest':
            // Merchant/quest anchors place NPCs when supported
            if (!npcPlacedInUnit.has(unitKey)) {
              if (placeNpcAtCell(cells, cx, cy, biome, rng, difficulty, merchantTracker)) {
                npcPlacedInUnit.add(unitKey);
                npcPlaced++;
              }
            }
            break;
          case 'waypoint':
          case 'spawn':
          case 'landmark':
          case 'puzzle':
            // TODO: DOC — new anchor roles placeholder, treat as decoration
            placeDecorationAtCell(cells, cx, cy, biome, rng);
            break;
        }
      }
    }
  }

  // Debug logging for NPC population (#104)
  if (typeof window !== 'undefined' && (window as any).__DEBUG_GEN) {
    console.log(`[gen] NPC pop: ${npcPlaced} placed, ${npcDropped} dropped (cap), ${npcAttempts} attempts`);
  }
}

function placeNpcAtCell(
  cells: CellData[][], cx: number, cy: number,
  biome: BiomeDef, rng: () => number,
  difficulty?: DifficultyProfile,
  merchantTracker?: { placed: boolean },
): boolean {
  // Respect biome NPC rate (skip some NPCs at random)
  if (rng() > biome.npcRate * 0.3) return false; // ~30% chance per anchor × npcRate

  const size = cells.length;

  // Clearance check: don't place NPCs in narrow 1-cell corridors (Doc 05 §4.3)
  // Need at least 2 walkable cardinal neighbors to ensure player can pass
  const walkableNeighbors = countWalkableNeighbors(cells, cx, cy, size);
  if (walkableNeighbors < 2) return false;

  // Difficulty-aware NPC selection: higher guardianRatio biases toward guardians
  const guardianRatio = difficulty?.guardianRatio ?? 0.1;

  // Context-aware NPC selection (Doc 05 §4.1):
  // 1. Near gate/door → guardian (always)
  // 2. Random roll < guardianRatio → guardian (difficulty-scaled)
  // 3. At junction (3+ walkable neighbors) → merchant
  // 4. Otherwise → biome pool
  let npcAsset: string;

  const merchantAvailable = !merchantTracker?.placed;

  if (isNearGate(cells, cx, cy, size)) {
    // Guards at gates — always
    npcAsset = 'npc_guardian';
  } else if (rng() < guardianRatio) {
    // Difficulty-scaled guardian spawn — more guardians at higher difficulty
    npcAsset = 'npc_guardian';
  } else if (walkableNeighbors >= 3 && merchantAvailable) {
    // Merchants at junctions (3+ passable directions = junction).
    // Gated on merchantAvailable so at most one wandering merchant spawns
    // per chunk (see merchantTracker comment in populateAnchors above).
    npcAsset = 'npc_merchant';
  } else {
    // Standard biome pool selection. Exclude npc_merchant from the pool
    // once this chunk already has one, so the random pick can't sneak a
    // second one in via the biome pool path.
    const pool = BIOME_NPC_POOL[biome.name] ?? ['npc_villager'];
    const candidates = merchantAvailable ? pool : pool.filter((a) => a !== 'npc_merchant');
    const finalPool = candidates.length ? candidates : pool; // never produce an empty pool
    npcAsset = finalPool[Math.floor(rng() * finalPool.length)];
  }

  if (npcAsset === 'npc_merchant' && merchantTracker) merchantTracker.placed = true;

  // Wandering merchants get a biome-specific persona/inventory (WorldEngine-05
  // §4.1 gap fix); every other NPC type uses the flat asset->persona map,
  // since those personas are already biome-distinct via BIOME_NPC_POOL's
  // per-biome pool composition (farmer/ranger/miner/knight etc. only ever
  // appear in their own biome's pool).
  const npcId = npcAsset === 'npc_merchant'
    ? getMerchantPersonaIdForBiome(biome.name)
    : (NPC_ID_MAP[npcAsset] ?? 'villager_default');

  cells[cy][cx] = {
    assetKey: npcAsset,
    walkable: false,
    interactable: true,
    npcId,
  };
  return true;
}

/**
 * Check if a cell is near a gate/door (within 2 cells Manhattan distance).
 * Used to contextually place guardian NPCs near gates (Doc 05 §4.1).
 */
function isNearGate(
  cells: CellData[][], cx: number, cy: number, size: number,
): boolean {
  const GATE_ASSETS = ['door_locked', 'toll_gate', 'door_gate', 'quiz_gate'];
  const RANGE = 2;
  for (let dy = -RANGE; dy <= RANGE; dy++) {
    for (let dx = -RANGE; dx <= RANGE; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > RANGE) continue;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
        if (GATE_ASSETS.includes(cells[ny][nx].assetKey)) return true;
      }
    }
  }
  return false;
}

function placeItemAtCell(
  cells: CellData[][], cx: number, cy: number,
  biome: BiomeDef, rng: () => number,
): void {
  // Use biome feature weights to pick item type
  const roll = rng();
  if (roll > biome.collectibleRate * 0.4) return; // ~40% × collectibleRate

  const fw = biome.featureWeights;
  const itemPool: Array<{ key: string; w: number }> = [];
  if (fw.coin) itemPool.push({ key: 'coin', w: fw.coin });
  if (fw.key) itemPool.push({ key: 'key', w: fw.key });
  if (fw.potion) itemPool.push({ key: 'potion', w: fw.potion });
  if (fw.mushroom) itemPool.push({ key: 'mushroom', w: fw.mushroom });

  if (itemPool.length === 0) {
    // Default: coins
    cells[cy][cx].itemId = 'coin';
    return;
  }

  const totalW = itemPool.reduce((s, e) => s + e.w, 0);
  let pick = rng() * totalW;
  for (const entry of itemPool) {
    pick -= entry.w;
    if (pick <= 0) {
      cells[cy][cx].itemId = entry.key;
      return;
    }
  }
  cells[cy][cx].itemId = itemPool[itemPool.length - 1].key;
}

function placeDecorationAtCell(
  cells: CellData[][], cx: number, cy: number,
  biome: BiomeDef, rng: () => number,
): void {
  // 60% chance to place a decoration at anchor
  if (rng() > 0.6) return;

  const palette = BIOME_ANCHOR_DECORATIONS[biome.name] ?? ['flower'];
  const deco = palette[Math.floor(rng() * palette.length)];
  const def = ASSET_DEFS[deco];
  if (!def) return;

  // Only place on walkable cells to avoid blocking movement
  if (!cells[cy][cx].walkable) return;

  cells[cy][cx] = {
    assetKey: deco,
    walkable: def.walkable,
    interactable: def.interactable,
  };
}

function placeFeatureAtCell(
  cells: CellData[][], cx: number, cy: number,
  _biome: BiomeDef, rng: () => number,
): void {
  // 12% chance for chest, 10% for sign, rest skip (tuned for less clutter)
  const roll = rng();
  if (roll < 0.12) {
    cells[cy][cx] = {
      assetKey: 'chest',
      walkable: false,
      interactable: true,
    };
  } else if (roll < 0.22) {
    cells[cy][cx] = {
      assetKey: 'sign',
      walkable: false,
      interactable: true,
    };
  }
  // else: leave cell as-is (not every feature anchor gets content)
}

/**
 * Phase 5b: Cluster-based decoration placement (WorldEngine-05 §6.2).
 * Creates natural-looking clusters of 3-7 decorations around center points,
 * with biome-appropriate variety within each cluster.
 * Target coverage: 15-25% of eligible cells, scaled by distance from origin.
 * TODO: DOC - decoration clustering algorithm details
 */
export function clusterDecorations(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
  chunkDist: number = 0,
  difficulty?: DifficultyProfile,
): void {
  const palette = BIOME_SCATTER_DECORATIONS[biome.name] ?? ['flower'];

  // S5 density (2026-07-15): FOV zoom-out shows more cells — lower coverage so
  // structure language (fence/farm/pond) is not buried under emoji salt.
  // Base: ~8–12% near origin (was 18–25%), tapering outward.
  const distFactor = Math.max(0.45, 1.0 - chunkDist * 0.05);
  const obstacleMult = difficulty?.obstacleDensity ?? 1.0;
  const targetCoverage = (0.08 + rng() * 0.04) * distFactor * Math.min(obstacleMult, 1.3);

  // Gather eligible cells (walkable base terrain with no existing content)
  const eligible: Array<{ x: number; y: number }> = [];
  const eligibleSet = new Set<string>();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.itemId || cell.npcId) continue;
      if (cell.assetKey !== 'grass' && cell.assetKey !== 'dirt' && cell.assetKey !== 'sand') continue;
      eligible.push({ x, y });
      eligibleSet.add(`${x},${y}`);
    }
  }

  if (eligible.length === 0) return;

  const targetCount = Math.floor(eligible.length * targetCoverage);
  let placed = 0;
  const usedCells = new Set<string>();

  // Shuffle eligible cells for random cluster center selection
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  // Pick cluster centers spaced 5-8 cells apart
  const clusterCenters: Array<{ x: number; y: number }> = [];
  const MIN_CLUSTER_SPACING = 5;

  for (const cell of eligible) {
    if (placed >= targetCount) break;

    // Check spacing from existing cluster centers
    let tooClose = false;
    for (const c of clusterCenters) {
      const dist = Math.abs(cell.x - c.x) + Math.abs(cell.y - c.y);
      if (dist < MIN_CLUSTER_SPACING) { tooClose = true; break; }
    }
    if (tooClose) continue;
    if (usedCells.has(`${cell.x},${cell.y}`)) continue;
    if (hasAdjacentInteractable(cells, cell.x, cell.y, size)) continue;

    clusterCenters.push(cell);

    // Generate cluster: 3-7 decorations within radius 2-4 of center
    const clusterSize = 3 + Math.floor(rng() * 5); // 3-7
    const radius = 2 + Math.floor(rng() * 3); // 2-4

    // Pick 2-3 decoration types for variety within this cluster
    const clusterTypes: string[] = [];
    const typeCount = 2 + Math.floor(rng() * 2); // 2-3 types
    for (let t = 0; t < typeCount; t++) {
      clusterTypes.push(palette[Math.floor(rng() * palette.length)]);
    }

    // Place decorations in cluster: denser at center, sparser at edges
    let clusterPlaced = 0;
    for (let attempt = 0; attempt < clusterSize * 3 && clusterPlaced < clusterSize; attempt++) {
      // Random offset within radius, biased toward center (triangular distribution)
      const angle = rng() * Math.PI * 2;
      const r = radius * Math.sqrt(rng()) * 0.8; // Sqrt bias = denser at center
      const dx = Math.round(Math.cos(angle) * r);
      const dy = Math.round(Math.sin(angle) * r);
      const px = cell.x + dx;
      const py = cell.y + dy;
      const key = `${px},${py}`;

      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      if (usedCells.has(key)) continue;
      if (!eligibleSet.has(key)) continue;
      if (hasAdjacentInteractable(cells, px, py, size)) continue;

      const deco = clusterTypes[Math.floor(rng() * clusterTypes.length)];
      const def = ASSET_DEFS[deco];
      if (!def || !def.walkable) continue;

      cells[py][px] = {
        assetKey: deco,
        walkable: true,
        interactable: def.interactable,
      };
      usedCells.add(key);
      clusterPlaced++;
      placed++;
    }
  }
}

/**
 * Phase 5b (legacy): Simple scatter decorations.
 * Kept for test compatibility — use clusterDecorations for production.
 */
export function scatterDecorations(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
): void {
  const palette = BIOME_SCATTER_DECORATIONS[biome.name] ?? ['flower'];
  // Target density: 8-15% of walkable base cells
  const targetRate = 0.08 + rng() * 0.07;

  // Gather eligible cells (walkable base terrain with no existing content)
  const eligible: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.itemId || cell.npcId) continue;
      // Only decorate base terrain types
      if (cell.assetKey !== 'grass' && cell.assetKey !== 'dirt' && cell.assetKey !== 'sand') continue;
      eligible.push({ x, y });
    }
  }

  // Shuffle eligible cells deterministically
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const count = Math.floor(eligible.length * targetRate);
  for (let i = 0; i < count && i < eligible.length; i++) {
    const { x, y } = eligible[i];
    const deco = palette[Math.floor(rng() * palette.length)];
    const def = ASSET_DEFS[deco];
    if (!def) continue;

    // Don't place next to NPCs or interactables (per design doc §6.4)
    if (hasAdjacentInteractable(cells, x, y, size)) continue;

    // Safety: scatter should only place walkable decorations
    if (!def.walkable) continue;

    cells[y][x] = {
      assetKey: deco,
      walkable: true,
      interactable: def.interactable,
    };
  }
}

/** Check if any adjacent cell has an NPC or interactable object */
function hasAdjacentInteractable(
  cells: CellData[][], x: number, y: number, size: number,
): boolean {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    const n = cells[ny][nx];
    if (n.npcId || n.interactable) return true;
  }
  return false;
}
