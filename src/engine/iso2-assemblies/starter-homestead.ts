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

/** Grid origin of the 9×9 homestead footprint inside chunk (0,0). */
export const STARTER_HOMESTEAD_ORIGIN = { x: 9, y: 8 } as const;

const ORIGIN = STARTER_HOMESTEAD_ORIGIN;
/** Critical-path PR6: 9×9 yard (was 7×7). */
export const HOMESTEAD_SIZE = 9;

/**
 * South fence opening: single functional quiz_gate only.
 * Relative (4, 8) → absolute (13, 16). Closed south except this teaching gate.
 */
export const STARTER_HOMESTEAD_OPENINGS: readonly AssemblyOpening[] = [
  { x: 4, y: 8, kind: 'quiz_gate' },
];

/**
 * Authored structure / prop / opening cells. Overlaid on top of the yard
 * fill so every cell in [0..8]×[0..8] is stamped (no WU residue gaps).
 *
 * Layout (relative; design §6 stamp sketch):
 *   Cottage mass 2×2 north of spawn at (3–4,2–3); (4,3)=starter_cottage.
 *   Spawn (3,4) abs (12,12) walkable yard — not cottage mass.
 *   Dirt approach (3–4,5–7) toward south gate.
 *   South row y=8 closed fence except sole quiz_gate at (4,8).
 */
const STARTER_HOMESTEAD_STRUCTURES: readonly StarterPlacement[] = [
  // North fence row
  { x: 0, y: 0, assetKey: 'fence' }, { x: 1, y: 0, assetKey: 'fence' }, { x: 2, y: 0, assetKey: 'fence' },
  { x: 3, y: 0, assetKey: 'fence' }, { x: 4, y: 0, assetKey: 'fence' }, { x: 5, y: 0, assetKey: 'fence' },
  { x: 6, y: 0, assetKey: 'fence' }, { x: 7, y: 0, assetKey: 'fence' }, { x: 8, y: 0, assetKey: 'fence' },
  // y=1: sides + light props north of cottage
  { x: 0, y: 1, assetKey: 'fence' }, { x: 1, y: 1, assetKey: 'flower' }, { x: 6, y: 1, assetKey: 'flower_pink' },
  { x: 8, y: 1, assetKey: 'fence' },
  // y=2: cottage mass north edge + sides
  { x: 0, y: 2, assetKey: 'fence' }, { x: 1, y: 2, assetKey: 'sign' },
  { x: 3, y: 2, assetKey: 'starter_foundation' }, { x: 4, y: 2, assetKey: 'starter_wall_plaster' },
  { x: 8, y: 2, assetKey: 'fence' },
  // y=3: cottage mass south edge (cottage preferred SE) + sides
  { x: 0, y: 3, assetKey: 'fence' },
  { x: 3, y: 3, assetKey: 'starter_wall_plaster' }, { x: 4, y: 3, assetKey: 'starter_cottage' },
  { x: 8, y: 3, assetKey: 'fence' },
  // y=4: spawn row — (3,4) left to yard fill (walkable); props off spawn plus-shape
  { x: 0, y: 4, assetKey: 'fence' }, { x: 1, y: 4, assetKey: 'flower_pink' },
  { x: 6, y: 4, assetKey: 'flower' }, { x: 8, y: 4, assetKey: 'fence' },
  // y=5: dirt approach + campfire (west of path)
  { x: 0, y: 5, assetKey: 'fence' }, { x: 2, y: 5, assetKey: 'campfire' },
  { x: 3, y: 5, assetKey: 'dirt', itemId: 'coin' }, { x: 4, y: 5, assetKey: 'dirt' },
  { x: 8, y: 5, assetKey: 'fence' },
  // y=6–7: dirt corridor toward gate
  { x: 0, y: 6, assetKey: 'fence' },
  { x: 3, y: 6, assetKey: 'dirt', itemId: 'coin' }, { x: 4, y: 6, assetKey: 'dirt' },
  { x: 8, y: 6, assetKey: 'fence' },
  { x: 0, y: 7, assetKey: 'fence' },
  { x: 3, y: 7, assetKey: 'dirt' }, { x: 4, y: 7, assetKey: 'dirt', itemId: 'coin' },
  { x: 5, y: 7, assetKey: 'grass', itemId: 'coin' }, { x: 8, y: 7, assetKey: 'fence' },
  // South fence CLOSED except center-ish quiz_gate at (4,8) — abs (13,16)
  { x: 0, y: 8, assetKey: 'fence' }, { x: 1, y: 8, assetKey: 'fence' },
  { x: 2, y: 8, assetKey: 'fence' }, { x: 3, y: 8, assetKey: 'fence' },
  { x: 4, y: 8, assetKey: 'quiz_gate' },
  { x: 5, y: 8, assetKey: 'fence' }, { x: 6, y: 8, assetKey: 'fence' },
  { x: 7, y: 8, assetKey: 'fence' }, { x: 8, y: 8, assetKey: 'fence' },
];

/**
 * Interior default for cells not covered by structures: grass yard with a
 * dirt approach toward the south gate (reads as a place, not residue).
 */
function yardFill(x: number, y: number): string {
  // Dirt corridor: columns under/toward south gate (not under cottage mass).
  if (y >= 5 && y <= 7 && (x === 3 || x === 4)) return 'dirt';
  return 'grass';
}

/** Full 9×9 stamp: yard first, then structures (structures win). */
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
 * True when asset is authored starter cottage mass / roof / foundation.
 * ensureSpawnClearance must never grass-carve these (I13).
 */
function isStarterStructureKey(assetKey: string): boolean {
  return assetKey.startsWith('starter_');
}

/**
 * Guarantee the player's exact spawn cell (and its 4 cardinal neighbors) is
 * walkable **unless** the neighbor is intentional starter_* cottage mass.
 *
 * The homestead stamp fills every cell of its 9×9 footprint (yard +
 * structures). Cottage mass sits **north** of spawn at abs (12–13,10–11);
 * spawn abs (12,12) stays walkable. Plus-shape north samples cottage at
 * (12,11) — collision half-extents stay sub-cell so footprint center on
 * grass is legal; this clearance must **not** destroy that mass.
 *
 * PLAYER_CONFIG.startPosition (12.5, 12.5) → grid (12,12) = offset (3,4).
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
    const cell = cells[y][x];
    // Never destroy authored starter cottage mass / structure (I13).
    if (isStarterStructureKey(cell.assetKey)) continue;
    // Only touch cells that are actually blocking — preserves intentional
    // walkable content (dirt path, coin-marked grass) untouched.
    if (!cell.walkable) {
      cells[y][x] = { assetKey: 'grass', walkable: grassDef.walkable, interactable: grassDef.interactable };
    }
  }
}
