/**
 * gen.ts — World generation system (v2: grid-based world unit solver).
 *
 * Replaces random template stamping with structured 5x5 world unit grid filling.
 * Each chunk (25x25 cells) is a 5x5 grid of world unit slots, filled via
 * edge-contract-aware constraint selection.
 *
 * Design docs: WorldEngine-01 (Spatial Hierarchy), WorldEngine-03 (Solver Pipeline)
 * GitHub: #23 — Generation Pipeline Refactor
 *
 * TODO: DOC — document the grid solver algorithm and chain integrity rules
 */

import { WORLD_CONFIG } from './config/game.config';
import { ASSET_DEFS } from './config/assets.config';
import { getBiome, type BiomeDef } from './config/biomes.config';
import {
  sha256,
  fastHash,
  hexToInt,
  asciiModulo,
  seededRandom,
  PerlinNoise,
  bfsFloodFill,
  weightedPick,
} from './utils';
import { expandEntropy } from './llm';
import { DIRECTION_WORDS } from './config/entropy.config';
import {
  edgesCompatible,
  getAllRotations,
  BIOME_TEMPLATE_WEIGHTS,
  MICRO_TILE_DEFS,
  type EdgeTag,
  type RotatedTemplate,
  type Cardinal,
} from './config/tiles.config';
import type { TileType } from './tiles';

// --- Types ---

export interface CellData {
  assetKey: string;
  walkable: boolean;
  interactable: boolean;
  npcId?: string;
  itemId?: string;
  resolved?: boolean;
}

/** Edge tags along each chunk border, one per world unit slot (GRID_DIM values). */
export interface ChunkBorderEdges {
  n: EdgeTag[];
  s: EdgeTag[];
  e: EdgeTag[];
  w: EdgeTag[];
}

/** Constraints from already-generated neighboring chunks. */
export interface BorderConstraints {
  n?: EdgeTag[]; // south border Edge tags from chunk above
  s?: EdgeTag[]; // north border edge tags from chunk below
  e?: EdgeTag[]; // west border edge tags from chunk to the east
  w?: EdgeTag[]; // east border edge tags from chunk to the west
}

export interface ChunkData {
  chunkX: number;
  chunkY: number;
  biomeId: number;
  cells: CellData[][];
  seed: string;
  generated: boolean;
  /** World unit grid border edges for inter-chunk stitching (#17) */
  borderEdges?: ChunkBorderEdges;
}

// --- Entropy State ---

let wordlist: string[] = [];
let lastEntropyOutput = '';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let entropyBuffer = '';

export function setWordlist(list: string[]): void {
  wordlist = list;
}

export function getWordlist(): string[] {
  return wordlist;
}

// --- Direction Pair ---

export function getDirectionPair(direction: string, rng: () => number): string {
  const table = DIRECTION_WORDS[direction] || DIRECTION_WORDS['right'];
  const verb = table.verbs[Math.floor(rng() * table.verbs.length)];
  const noun = table.nouns[Math.floor(rng() * table.nouns.length)];
  return `${verb} ${noun}`;
}

// --- World Unit Grid Constants ---

const WU_SIZE = WORLD_CONFIG.worldUnitSize;
const GRID_DIM = WORLD_CONFIG.chunkSize / WU_SIZE;

// --- Chunk Generation (async + LLM) ---

export async function generateChunk(
  chunkX: number,
  chunkY: number,
): Promise<ChunkData> {
  const size = WORLD_CONFIG.chunkSize;

  const pairIndex = Math.abs(fastHash(`${chunkX},${chunkY}`)) % wordlist.length;
  const pair = wordlist[pairIndex] || 'obliterate quasar';

  const entropyText = await expandEntropy(pair, lastEntropyOutput);
  lastEntropyOutput = entropyText;
  entropyBuffer += entropyText;

  const hashHex = await sha256(entropyText);
  const biomeSeed = hexToInt(hashHex.slice(0, 8), WORLD_CONFIG.biomeCount - 1);
  const noiseSeed = fastHash(hashHex.slice(8, 16));
  const featureSeed = fastHash(hashHex.slice(16, 24));

  const biome = getBiome(biomeSeed);
  const { cells, borderEdges } = generateGridChunk(size, noiseSeed, featureSeed, biome, chunkX, chunkY);

  return {
    chunkX, chunkY,
    biomeId: biome.id,
    cells, seed: entropyText, generated: true,
    borderEdges,
  };
}

// --- Chunk Generation (sync, no LLM) ---

export function generateChunkSync(
  chunkX: number,
  chunkY: number,
  borderConstraints?: BorderConstraints,
): ChunkData {
  const size = WORLD_CONFIG.chunkSize;

  const coordHash = fastHash(`chunk_${chunkX}_${chunkY}_sync`);
  const pairIndex = coordHash % wordlist.length;
  const pair = wordlist[pairIndex] || 'obliterate quasar';
  const seedText = `${pair}_${chunkX}_${chunkY}`;

  const noiseSeed = fastHash(seedText);
  const featureSeed = fastHash(seedText + '_features');
  const biomeSeed = asciiModulo(pair, WORLD_CONFIG.biomeCount);
  const biome = getBiome(biomeSeed);

  const { cells, borderEdges } = generateGridChunk(
    size, noiseSeed, featureSeed, biome, chunkX, chunkY, borderConstraints,
  );

  return {
    chunkX, chunkY,
    biomeId: biome.id,
    cells, seed: seedText, generated: true,
    borderEdges,
  };
}

// --- Grid-based chunk generation (core pipeline) ---

interface GridChunkResult {
  cells: CellData[][];
  borderEdges: ChunkBorderEdges;
}

function generateGridChunk(
  size: number,
  noiseSeed: number,
  featureSeed: number,
  biome: BiomeDef,
  chunkX: number,
  chunkY: number,
  borderConstraints?: BorderConstraints,
): GridChunkResult {
  const rng = seededRandom(featureSeed);

  // Phase 1: Perlin noise base terrain
  const cells = buildPerlinBase(size, noiseSeed, biome, chunkX, chunkY);

  // Phase 2: solve world unit grid (AC-3 constraint propagation)
  const { grid, borderEdges } = solveWorldUnitGrid(biome, rng, borderConstraints);

  // Phase 3: stamp solved templates onto cell grid
  stampWorldUnitGrid(cells, grid);

  // Phase 4: enforce passability
  enforcePassability(cells, size, seededRandom(featureSeed + 99));

  return { cells, borderEdges };
}

// --- Phase 1: Perlin Noise Base Terrain ---

function buildPerlinBase(
  size: number,
  noiseSeed: number,
  biome: BiomeDef,
  chunkX: number,
  chunkY: number,
): CellData[][] {
  const perlin = new PerlinNoise(noiseSeed);
  const cells: CellData[][] = [];

  for (let y = 0; y < size; y++) {
    cells[y] = [];
    for (let x = 0; x < size; x++) {
      const gx = chunkX * size + x;
      const gy = chunkY * size + y;
      const density = perlin.noise100(gx * 0.1, gy * 0.1);
      cells[y][x] = assignTerrainCell(density, biome);
    }
  }
  return cells;
}

function assignTerrainCell(density: number, biome: BiomeDef): CellData {
  const { terrain, obstacle } = WORLD_CONFIG.density;

  if (density <= terrain.max) {
    const assetKey = weightedPick(biome.terrainWeights, Math.random());
    const def = ASSET_DEFS[assetKey];
    return { assetKey, walkable: def?.walkable ?? true, interactable: false };
  } else if (density <= obstacle.max) {
    const def = ASSET_DEFS['rock'];
    return { assetKey: 'rock', walkable: def?.walkable ?? false, interactable: false };
  } else {
    const assetKey = weightedPick(biome.terrainWeights, Math.random());
    const def = ASSET_DEFS[assetKey];
    return { assetKey, walkable: def?.walkable ?? true, interactable: false };
  }
}

// --- Phase 2: AC-3 World Unit Grid Solver (#17) ---
// TODO: DOC — AC-3 constraint propagation solver for world unit placement.
// Design: WorldEngine-02-EdgeContracts.md, Section 6.

interface WeightedCandidate {
  template: RotatedTemplate;
  weight: number;
}

/** Possibility set for each grid slot. Candidates shrink via propagation. */
interface SlotState {
  candidates: WeightedCandidate[];
  collapsed: RotatedTemplate | null;
}

/** An arc connects two adjacent slots along a specific direction pair. */
interface Arc {
  fromY: number;
  fromX: number;
  toY: number;
  toX: number;
  /** Which edge of 'from' faces 'to' */
  fromSide: Cardinal;
  /** Which edge of 'to' faces 'from' */
  toSide: Cardinal;
}

interface SolveResult {
  grid: (RotatedTemplate | null)[][];
  borderEdges: ChunkBorderEdges;
}

// --- AC-3 Solver Budget ---
const MAX_PROPAGATION_ITERATIONS = 1000;

function solveWorldUnitGrid(
  biome: BiomeDef,
  rng: () => number,
  borderConstraints?: BorderConstraints,
): SolveResult {
  const allRotations = getAllRotations();
  const biomeCandidates = buildBiomeCandidatePool(biome, allRotations);
  const fallback = findFallbackTemplate(allRotations);

  // Phase 2a: Initialize possibility sets
  const slots: SlotState[][] = [];
  for (let gy = 0; gy < GRID_DIM; gy++) {
    slots[gy] = [];
    for (let gx = 0; gx < GRID_DIM; gx++) {
      slots[gy][gx] = {
        candidates: biomeCandidates.map(c => ({ ...c })),
        collapsed: null,
      };
    }
  }

  // Phase 2b: Apply border constraints from neighboring chunks
  if (borderConstraints) {
    applyBorderConstraints(slots, borderConstraints);
  }

  // Phase 2c: Build arc set and run initial AC-3 propagation
  const arcs = buildAllArcs();
  propagateAC3(slots, arcs);

  // Phase 2d: Collapse slots using MRV heuristic + propagation
  collapseAllMRV(slots, rng, fallback, arcs);

  // Build result grid
  const grid: (RotatedTemplate | null)[][] = [];
  for (let gy = 0; gy < GRID_DIM; gy++) {
    grid[gy] = [];
    for (let gx = 0; gx < GRID_DIM; gx++) {
      grid[gy][gx] = slots[gy][gx].collapsed;
    }
  }

  enforceChainIntegrity(grid, allRotations);
  const borderEdges = extractGridBorderEdges(grid);

  return { grid, borderEdges };
}

// --- Biome Candidate Pool ---

function buildBiomeCandidatePool(
  biome: BiomeDef,
  allRotations: Map<string, RotatedTemplate[]>,
): WeightedCandidate[] {
  const pool: WeightedCandidate[] = [];
  const biomeWeights = BIOME_TEMPLATE_WEIGHTS[biome.name] ?? {};

  for (const [templateName, rotations] of allRotations.entries()) {
    const weight = biomeWeights[templateName] ?? 0.01;
    for (const rot of rotations) {
      pool.push({ template: rot, weight });
    }
  }
  return pool;
}

function findFallbackTemplate(
  allRotations: Map<string, RotatedTemplate[]>,
): RotatedTemplate | null {
  const meadowRots = allRotations.get('meadow_base');
  if (meadowRots && meadowRots.length > 0) return meadowRots[0];
  return null;
}

// --- Border Constraints from Neighboring Chunks ---

function applyBorderConstraints(
  slots: SlotState[][],
  bc: BorderConstraints,
): void {
  // North border: our row 0 must match the south edge of the chunk above
  if (bc.n) {
    for (let gx = 0; gx < GRID_DIM && gx < bc.n.length; gx++) {
      const requiredTag = bc.n[gx];
      slots[0][gx].candidates = slots[0][gx].candidates.filter(
        c => edgesCompatible(c.template.edgeTags.n, requiredTag),
      );
    }
  }
  // South border: our last row must match the north edge of the chunk below
  if (bc.s) {
    const lastRow = GRID_DIM - 1;
    for (let gx = 0; gx < GRID_DIM && gx < bc.s.length; gx++) {
      const requiredTag = bc.s[gx];
      slots[lastRow][gx].candidates = slots[lastRow][gx].candidates.filter(
        c => edgesCompatible(c.template.edgeTags.s, requiredTag),
      );
    }
  }
  // West border: our column 0 must match the east edge of the chunk to the left
  if (bc.w) {
    for (let gy = 0; gy < GRID_DIM && gy < bc.w.length; gy++) {
      const requiredTag = bc.w[gy];
      slots[gy][0].candidates = slots[gy][0].candidates.filter(
        c => edgesCompatible(c.template.edgeTags.w, requiredTag),
      );
    }
  }
  // East border: our last column must match the west edge of the chunk to the right
  if (bc.e) {
    const lastCol = GRID_DIM - 1;
    for (let gy = 0; gy < GRID_DIM && gy < bc.e.length; gy++) {
      const requiredTag = bc.e[gy];
      slots[gy][lastCol].candidates = slots[gy][lastCol].candidates.filter(
        c => edgesCompatible(c.template.edgeTags.e, requiredTag),
      );
    }
  }
}

// --- Arc Construction ---

const OPPOSITES: Record<Cardinal, Cardinal> = { n: 's', s: 'n', e: 'w', w: 'e' };

function buildAllArcs(): Arc[] {
  const arcs: Arc[] = [];
  for (let gy = 0; gy < GRID_DIM; gy++) {
    for (let gx = 0; gx < GRID_DIM; gx++) {
      // Right neighbor
      if (gx + 1 < GRID_DIM) {
        arcs.push({ fromY: gy, fromX: gx, toY: gy, toX: gx + 1, fromSide: 'e', toSide: 'w' });
        arcs.push({ fromY: gy, fromX: gx + 1, toY: gy, toX: gx, fromSide: 'w', toSide: 'e' });
      }
      // Bottom neighbor
      if (gy + 1 < GRID_DIM) {
        arcs.push({ fromY: gy, fromX: gx, toY: gy + 1, toX: gx, fromSide: 's', toSide: 'n' });
        arcs.push({ fromY: gy + 1, fromX: gx, toY: gy, toX: gx, fromSide: 'n', toSide: 's' });
      }
    }
  }
  return arcs;
}

// --- AC-3 Constraint Propagation ---

function propagateAC3(slots: SlotState[][], allArcs: Arc[]): void {
  // Worklist: start with all arcs
  const queue: Arc[] = [...allArcs];
  let iterations = 0;

  while (queue.length > 0 && iterations < MAX_PROPAGATION_ITERATIONS) {
    iterations++;
    const arc = queue.shift()!;
    const fromSlot = slots[arc.fromY][arc.fromX];
    const toSlot = slots[arc.toY][arc.toX];

    // Skip if either is already collapsed
    if (fromSlot.collapsed || toSlot.collapsed) continue;

    // Revise: remove candidates from 'from' that have no compatible candidate in 'to'
    const before = fromSlot.candidates.length;
    fromSlot.candidates = fromSlot.candidates.filter(fc => {
      // At least one candidate in 'to' must be compatible with fc on the shared edge
      return toSlot.candidates.some(tc =>
        edgesCompatible(fc.template.edgeTags[arc.fromSide], tc.template.edgeTags[arc.toSide]),
      );
    });

    // If candidates were removed, re-enqueue arcs pointing TO this slot
    if (fromSlot.candidates.length < before) {
      for (const otherArc of allArcs) {
        if (otherArc.toY === arc.fromY && otherArc.toX === arc.fromX &&
            !(otherArc.fromY === arc.toY && otherArc.fromX === arc.toX)) {
          queue.push(otherArc);
        }
      }
    }
  }
}

// --- Arcs Affected by a Specific Slot ---

function getArcsAffectedBy(
  gy: number, gx: number, allArcs: Arc[],
): Arc[] {
  return allArcs.filter(a => a.toY === gy && a.toX === gx);
}

// --- MRV Collapse with Propagation ---

function collapseAllMRV(
  slots: SlotState[][],
  rng: () => number,
  fallback: RotatedTemplate | null,
  allArcs: Arc[],
): void {
  const totalSlots = GRID_DIM * GRID_DIM;

  for (let step = 0; step < totalSlots; step++) {
    // Find uncollapsed slot with minimum remaining values (MRV)
    let bestY = -1, bestX = -1, bestCount = Infinity;
    for (let gy = 0; gy < GRID_DIM; gy++) {
      for (let gx = 0; gx < GRID_DIM; gx++) {
        const slot = slots[gy][gx];
        if (slot.collapsed) continue;
        if (slot.candidates.length < bestCount) {
          bestCount = slot.candidates.length;
          bestY = gy;
          bestX = gx;
        }
      }
    }

    if (bestY < 0) break; // All collapsed

    const slot = slots[bestY][bestX];

    // Collapse: pick from candidates (weighted) or use fallback
    if (slot.candidates.length > 0) {
      slot.collapsed = weightedSelectTemplate(slot.candidates, rng);
    } else {
      // Contradiction: use fallback (recovery strategy 1: degrade)
      slot.collapsed = fallback;
    }
    slot.candidates = [];

    // After collapsing, propagate constraints from this slot's neighbors
    // Re-enqueue arcs involving this slot's neighbors
    const affectedArcs = getArcsAffectedBy(bestY, bestX, allArcs);
    // For each neighbor of the collapsed slot, filter their candidates
    for (const arc of affectedArcs) {
      const neighborSlot = slots[arc.fromY][arc.fromX];
      if (neighborSlot.collapsed) continue;

      const oppSide = OPPOSITES[arc.fromSide];
      if (slot.collapsed) {
        neighborSlot.candidates = neighborSlot.candidates.filter(c =>
          edgesCompatible(c.template.edgeTags[arc.fromSide], slot.collapsed!.edgeTags[oppSide]),
        );
      }
    }

    // Run AC-3 from the affected neighbors outward
    const propagationQueue: Arc[] = [];
    for (const arc of affectedArcs) {
      if (!slots[arc.fromY][arc.fromX].collapsed) {
        // Re-enqueue arcs pointing to the affected neighbor
        for (const otherArc of allArcs) {
          if (otherArc.toY === arc.fromY && otherArc.toX === arc.fromX) {
            propagationQueue.push(otherArc);
          }
        }
      }
    }
    propagateAC3Partial(slots, propagationQueue, allArcs);
  }
}

/** Partial AC-3 propagation from a specific worklist. */
function propagateAC3Partial(
  slots: SlotState[][],
  queue: Arc[],
  allArcs: Arc[],
): void {
  let iterations = 0;
  while (queue.length > 0 && iterations < MAX_PROPAGATION_ITERATIONS) {
    iterations++;
    const arc = queue.shift()!;
    const fromSlot = slots[arc.fromY][arc.fromX];
    const toSlot = slots[arc.toY][arc.toX];

    if (fromSlot.collapsed) continue;

    // If toSlot is collapsed, filter from against the single collapsed value
    let changed = false;
    if (toSlot.collapsed) {
      const before = fromSlot.candidates.length;
      fromSlot.candidates = fromSlot.candidates.filter(fc =>
        edgesCompatible(fc.template.edgeTags[arc.fromSide], toSlot.collapsed!.edgeTags[arc.toSide]),
      );
      changed = fromSlot.candidates.length < before;
    } else {
      const before = fromSlot.candidates.length;
      fromSlot.candidates = fromSlot.candidates.filter(fc =>
        toSlot.candidates.some(tc =>
          edgesCompatible(fc.template.edgeTags[arc.fromSide], tc.template.edgeTags[arc.toSide]),
        ),
      );
      changed = fromSlot.candidates.length < before;
    }

    if (changed) {
      for (const otherArc of allArcs) {
        if (otherArc.toY === arc.fromY && otherArc.toX === arc.fromX &&
            !(otherArc.fromY === arc.toY && otherArc.fromX === arc.toX)) {
          queue.push(otherArc);
        }
      }
    }
  }
}

function weightedSelectTemplate(
  candidates: WeightedCandidate[],
  rng: () => number,
): RotatedTemplate {
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = rng() * totalWeight;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) return c.template;
  }
  return candidates[candidates.length - 1].template;
}

// --- Border Edge Extraction ---

function extractGridBorderEdges(
  grid: (RotatedTemplate | null)[][],
): ChunkBorderEdges {
  return {
    n: Array.from({ length: GRID_DIM }, (_, gx) => grid[0]?.[gx]?.edgeTags.n ?? 'open'),
    s: Array.from({ length: GRID_DIM }, (_, gx) => grid[GRID_DIM - 1]?.[gx]?.edgeTags.s ?? 'open'),
    e: Array.from({ length: GRID_DIM }, (_, gy) => grid[gy]?.[GRID_DIM - 1]?.edgeTags.e ?? 'open'),
    w: Array.from({ length: GRID_DIM }, (_, gy) => grid[gy]?.[0]?.edgeTags.w ?? 'open'),
  };
}

// --- Chain Integrity ---

function enforceChainIntegrity(
  grid: (RotatedTemplate | null)[][],
  allRotations: Map<string, RotatedTemplate[]>,
): void {
  for (let gy = 0; gy < GRID_DIM; gy++) {
    for (let gx = 0; gx < GRID_DIM; gx++) {
      const template = grid[gy][gx];
      if (!template) continue;

      const chainEdges = getChainEdges(template);
      if (chainEdges.length === 0) continue;

      for (const { dir, tag } of chainEdges) {
        const nx = gx + (dir === 'e' ? 1 : dir === 'w' ? -1 : 0);
        const ny = gy + (dir === 's' ? 1 : dir === 'n' ? -1 : 0);

        const needsFix =
          nx < 0 || nx >= GRID_DIM || ny < 0 || ny >= GRID_DIM ||
          !grid[ny]?.[nx];

        if (needsFix && tag !== 'open') {
          const replacement = findTerminator(template.baseName, allRotations);
          if (replacement) {
            // Check that replacement is compatible with placed neighbors
            const nTag = gy > 0 && grid[gy - 1][gx] ? grid[gy - 1][gx]!.edgeTags.s : undefined;
            const wTag = gx > 0 && grid[gy][gx - 1] ? grid[gy][gx - 1]!.edgeTags.e : undefined;
            if (
              (!nTag || edgesCompatible(replacement.edgeTags.n, nTag)) &&
              (!wTag || edgesCompatible(replacement.edgeTags.w, wTag))
            ) {
              grid[gy][gx] = replacement;
            }
          }
        }
      }
    }
  }
}

function getChainEdges(template: RotatedTemplate): Array<{ dir: Cardinal; tag: EdgeTag }> {
  const edges: Array<{ dir: Cardinal; tag: EdgeTag }> = [];
  const dirs: Cardinal[] = ['n', 's', 'e', 'w'];
  for (const dir of dirs) {
    const tag = template.edgeTags[dir];
    if (tag !== 'open') edges.push({ dir, tag });
  }
  return edges;
}

function findTerminator(
  baseName: string,
  allRotations: Map<string, RotatedTemplate[]>,
): RotatedTemplate | null {
  if (baseName.startsWith('river_')) {
    const pondRots = allRotations.get('river_end_pond');
    if (pondRots && pondRots.length > 0) return pondRots[0];
  }
  if (baseName.startsWith('wall_') || baseName === 'guard_tower') {
    const wallEndRots = allRotations.get('wall_end');
    if (wallEndRots && wallEndRots.length > 0) return wallEndRots[0];
  }
  const meadowRots = allRotations.get('meadow_base');
  if (meadowRots && meadowRots.length > 0) return meadowRots[0];
  return null;
}

// --- Phase 3: Stamp Grid onto Cells ---

function stampWorldUnitGrid(
  cells: CellData[][],
  grid: (RotatedTemplate | null)[][],
): void {
  for (let gy = 0; gy < GRID_DIM; gy++) {
    for (let gx = 0; gx < GRID_DIM; gx++) {
      const template = grid[gy][gx];
      if (!template) continue;

      const baseX = gx * WU_SIZE;
      const baseY = gy * WU_SIZE;

      for (let ty = 0; ty < WU_SIZE; ty++) {
        for (let tx = 0; tx < WU_SIZE; tx++) {
          const cellKey = template.cells[ty]?.[tx];
          if (cellKey === null || cellKey === undefined) continue;

          const microDef = MICRO_TILE_DEFS[cellKey as TileType];
          const def = ASSET_DEFS[cellKey];
          cells[baseY + ty][baseX + tx] = {
            assetKey: cellKey,
            walkable: microDef?.walkable ?? def?.walkable ?? true,
            interactable: def?.interactable ?? false,
          };
        }
      }
    }
  }
}

// --- Phase 4: Passability Enforcement ---

function enforcePassability(
  cells: CellData[][],
  size: number,
  rng: () => number,
): void {
  const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
  cells[center.y][center.x].walkable = true;
  cells[center.y][center.x].assetKey = 'grass';

  const reachable = bfsFloodFill(
    (x, y) => cells[y][x].walkable,
    size, size, center,
  );

  const totalCells = size * size;
  const passabilityRatio = reachable.size / totalCells;

  if (passabilityRatio < WORLD_CONFIG.passabilityTarget) {
    const needed = Math.floor(WORLD_CONFIG.passabilityTarget * totalCells) - reachable.size;
    let carved = 0;
    for (let attempt = 0; attempt < totalCells && carved < needed; attempt++) {
      const x = Math.floor(rng() * size);
      const y = Math.floor(rng() * size);
      if (!cells[y][x].walkable) {
        cells[y][x] = { assetKey: 'grass', walkable: true, interactable: false };
        carved++;
      }
    }
  }

  const mid = Math.floor(size / 2);
  const edgePoints = [
    { x: mid, y: 0 },
    { x: mid, y: size - 1 },
    { x: 0, y: mid },
    { x: size - 1, y: mid },
  ];
  for (const ep of edgePoints) {
    cells[ep.y][ep.x] = { assetKey: 'grass', walkable: true, interactable: false };
  }
}

// --- Population Hooks (modular stubs) ---
// TODO: DOC — Population phase will be re-enabled once world building is stable.
// See WorldEngine-05-PopulationAndProgression.md for design.

export function populateAnchors(
  _cells: CellData[][],
  _grid: (RotatedTemplate | null)[][],
  _biome: BiomeDef,
  _rng: () => number,
): void {
  // TODO: Iterate over grid slots, find anchor points, spawn entities
}

export function balanceObstacles(
  _cells: CellData[][],
  _size: number,
  _rng: () => number,
): void {
  // TODO: Scan for locked doors/barricades and spawn matching keys/tools
}
