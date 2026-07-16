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
 * South fence openings: dirt flanks + quiz_gate at center exit.
 * Mirrors scene-law openings used by modular fenced recipes.
 */
export const STARTER_HOMESTEAD_OPENINGS: readonly AssemblyOpening[] = [
  { x: 2, y: 6, kind: 'path' },
  { x: 3, y: 6, kind: 'quiz_gate' },
  { x: 4, y: 6, kind: 'path' },
];

/**
 * Authored structure / prop / opening cells. Overlaid on top of the yard
 * fill so every cell in [0..6]×[0..6] is stamped (no WU residue gaps).
 * Roles: fence ring, stone pad, cottage, sign/flowers, campfire, south
 * quiz_gate + dirt flanks, breadcrumb coins toward the exit.
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
  // Mid yard props + dirt path toward gate
  { x: 0, y: 4, assetKey: 'fence' }, { x: 1, y: 4, assetKey: 'flower_pink' },
  { x: 3, y: 4, assetKey: 'dirt', itemId: 'coin' }, { x: 6, y: 4, assetKey: 'fence' },
  { x: 0, y: 5, assetKey: 'fence' }, { x: 2, y: 5, assetKey: 'campfire' },
  { x: 3, y: 5, assetKey: 'dirt', itemId: 'coin' }, { x: 4, y: 5, assetKey: 'dirt' },
  { x: 5, y: 5, assetKey: 'grass', itemId: 'coin' }, { x: 6, y: 5, assetKey: 'fence' },
  // South fence + openings (quiz_gate teacher + path flanks)
  { x: 0, y: 6, assetKey: 'fence' }, { x: 1, y: 6, assetKey: 'fence' },
  { x: 2, y: 6, assetKey: 'dirt' }, { x: 3, y: 6, assetKey: 'quiz_gate' }, { x: 4, y: 6, assetKey: 'dirt' },
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
  // Scene law: south openings stay functional (quiz_gate + path flanks).
  repairSceneOpenings(cells, ORIGIN.x, ORIGIN.y, STARTER_HOMESTEAD_RECIPE);
}

/**
 * Guarantee the player's exact spawn cell (and its 4 cardinal neighbors) is
 * walkable, no matter what any OTHER generation phase placed there.
 *
 * The homestead stamp now fills every cell of its 7×7 footprint (yard +
 * structures), so unstamped residue gaps are no longer the primary risk.
 * This still runs LAST on chunk (0,0) after every phase that could re-block
 * the spawn cell (entropy overrides, obstacle balancing, etc.).
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
