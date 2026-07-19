/** starter-homestead.ts — deterministic origin safe-zone assembly (#277). */

import { ASSET_DEFS } from '../../config/assets.config';
import { PLAYER_CONFIG } from '../../config/game.config';
import type { CellData } from '../../types/game.types';
import type { AssemblyOpening, AssemblyPlacement, AssemblyRecipe } from './catalog';
import { repairSceneOpenings } from './scene-invariants';

interface StarterPlacement {
  readonly x: number;
  readonly y: number;
  readonly assetKey: string;
  readonly itemId?: string;
}

/** Grid origin of the 7×7 homestead footprint inside chunk (0,0). */
export const STARTER_HOMESTEAD_ORIGIN = { x: 9, y: 8 } as const;

const ORIGIN = STARTER_HOMESTEAD_ORIGIN;
const HOMESTEAD_SIZE = 7;

/**
 * South fence opening: single functional quiz_gate only.
 * Dirt flanks were removed so the yard perimeter reads closed — leave only
 * through the teaching gate (scene law: no barrier without function).
 */
export const STARTER_HOMESTEAD_OPENINGS: readonly AssemblyOpening[] = [
  { x: 3, y: 6, kind: 'quiz_gate' },
];

/**
 * Authored structure / prop / opening cells. Overlaid on top of the yard
 * fill so every cell in [0..6]×[0..6] is stamped (no WU residue gaps).
 * Roles: fence ring, stone pad, cottage, sign/flowers, campfire, closed
 * south fence with center quiz_gate, breadcrumb coins toward the gate.
 */
const STARTER_HOMESTEAD_STRUCTURES: readonly StarterPlacement[] = [
  // North fence row
  { x: 0, y: 0, assetKey: 'fence' }, { x: 1, y: 0, assetKey: 'fence' }, { x: 2, y: 0, assetKey: 'fence' },
  { x: 3, y: 0, assetKey: 'fence' }, { x: 4, y: 0, assetKey: 'fence' }, { x: 5, y: 0, assetKey: 'fence' },
  { x: 6, y: 0, assetKey: 'fence' },
  // Side fences + stone pad (north courtyard)
  { x: 0, y: 1, assetKey: 'fence' }, { x: 3, y: 1, assetKey: 'stone_floor' }, { x: 4, y: 1, assetKey: 'stone_floor' },
  { x: 5, y: 1, assetKey: 'stone_floor' }, { x: 6, y: 1, assetKey: 'fence' },
  { x: 0, y: 2, assetKey: 'fence' }, { x: 1, y: 2, assetKey: 'sign' }, { x: 2, y: 2, assetKey: 'flower' },
  { x: 3, y: 2, assetKey: 'stone_floor' }, { x: 4, y: 2, assetKey: 'stone_floor' }, { x: 5, y: 2, assetKey: 'stone_floor' },
  { x: 6, y: 2, assetKey: 'fence' },
  // Cottage row
  { x: 0, y: 3, assetKey: 'fence' }, { x: 4, y: 3, assetKey: 'starter_cottage' }, { x: 6, y: 3, assetKey: 'fence' },
  // Mid yard props + dirt path toward gate (inside yard only)
  { x: 0, y: 4, assetKey: 'fence' }, { x: 1, y: 4, assetKey: 'flower_pink' },
  { x: 3, y: 4, assetKey: 'dirt', itemId: 'coin' }, { x: 6, y: 4, assetKey: 'fence' },
  { x: 0, y: 5, assetKey: 'fence' }, { x: 2, y: 5, assetKey: 'campfire' },
  { x: 3, y: 5, assetKey: 'dirt', itemId: 'coin' }, { x: 4, y: 5, assetKey: 'dirt' },
  { x: 5, y: 5, assetKey: 'grass', itemId: 'coin' }, { x: 6, y: 5, assetKey: 'fence' },
  // South fence CLOSED except center quiz_gate (no dirt walk-around)
  { x: 0, y: 6, assetKey: 'fence' }, { x: 1, y: 6, assetKey: 'fence' },
  { x: 2, y: 6, assetKey: 'fence' }, { x: 3, y: 6, assetKey: 'quiz_gate' }, { x: 4, y: 6, assetKey: 'fence' },
  { x: 5, y: 6, assetKey: 'fence' }, { x: 6, y: 6, assetKey: 'fence' },
];

/**
 * Interior default for cells not covered by structures: grass yard with a
 * short dirt approach toward the south gate (reads as a place, not residue).
 */
function yardFill(x: number, y: number): string {
  // Dirt corridor: center columns leading into the south openings.
  if (y >= 4 && y <= 5 && (x === 3 || x === 4)) return 'dirt';
  return 'grass';
}

/** Full 7×7 stamp: yard first, then structures (structures win). */
function buildFullHomestead(): readonly StarterPlacement[] {
  const byKey = new Map<string, StarterPlacement>();
  for (let y = 0; y < HOMESTEAD_SIZE; y++) {
    for (let x = 0; x < HOMESTEAD_SIZE; x++) {
      byKey.set(`${x},${y}`, { x, y, assetKey: yardFill(x, y) });
    }
  }
  for (const p of STARTER_HOMESTEAD_STRUCTURES) {
    byKey.set(`${p.x},${p.y}`, p);
  }
  return Array.from(byKey.values());
}

const STARTER_HOMESTEAD: readonly StarterPlacement[] = buildFullHomestead();

/**
 * Scene-recipe view of the starter homestead (openings declared for invariants).
 * Not in ASSEMBLY_RECIPES / modular placement — origin-only stamp.
 */
export const STARTER_HOMESTEAD_RECIPE: AssemblyRecipe = {
  id: 'starter-homestead',
  width: HOMESTEAD_SIZE,
  height: HOMESTEAD_SIZE,
  placements: STARTER_HOMESTEAD as readonly AssemblyPlacement[],
  openings: STARTER_HOMESTEAD_OPENINGS,
};

function makeCell(p: StarterPlacement): CellData {
  const def = ASSET_DEFS[p.assetKey];
  if (!def) throw new Error(`Unknown starter homestead asset: ${p.assetKey}`);
  return { assetKey: p.assetKey, walkable: def.walkable, interactable: def.interactable, itemId: p.itemId };
}

export function stampStarterHomestead(cells: CellData[][]): void {
  for (const p of STARTER_HOMESTEAD) {
    const x = ORIGIN.x + p.x;
    const y = ORIGIN.y + p.y;
    if (y < 0 || y >= cells.length || x < 0 || x >= cells[y].length) continue;
    cells[y][x] = makeCell(p);
  }
  // Scene law: south quiz_gate stays functional (sole yard exit).
  repairSceneOpenings(cells, ORIGIN.x, ORIGIN.y, STARTER_HOMESTEAD_RECIPE);
}

/**
 * Guarantee the player's exact spawn cell (and its 4 cardinal neighbors) is
 * walkable, no matter what any earlier generation phase placed there.
 *
 * The homestead stamp fills every cell of its 7×7 footprint (yard +
 * structures), so unstamped residue gaps are no longer the primary risk.
 * Runs late on chunk (0,0) after entropy / obstacle balancing / playability
 * carves. Place-coherence (`runPlaceCoherencePass`) may still rewrite barrier
 * stamps afterward — under the current homestead layout that only touches
 * the south perimeter (y = origin+6), not the spawn plus-shape, so it does
 * not re-block spawn. If spawn softlocks reappear, re-call this after the pass.
 *
 * PLAYER_CONFIG.startPosition (12.5, 12.5) → grid (12,12) = offset (3,4).
 * Plus shape only (not full 3×3): diagonal neighbors include the cottage at
 * (4,3) and campfire at (2,5), which must NOT be cleared.
 */
export function ensureSpawnClearance(cells: CellData[][]): void {
  const spawnX = Math.floor(PLAYER_CONFIG.startPosition.x);
  const spawnY = Math.floor(PLAYER_CONFIG.startPosition.y);
  const grassDef = ASSET_DEFS.grass;
  const offsets: ReadonlyArray<readonly [number, number]> = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of offsets) {
    const x = spawnX + dx;
    const y = spawnY + dy;
    if (y < 0 || y >= cells.length || x < 0 || x >= cells[y].length) continue;
    // Only touch cells that are actually blocking -- preserves any
    // intentional walkable content already there (e.g. the dirt path,
    // the coin-marked grass) untouched.
    if (!cells[y][x].walkable) {
      cells[y][x] = { assetKey: 'grass', walkable: grassDef.walkable, interactable: grassDef.interactable };
    }
  }
}
