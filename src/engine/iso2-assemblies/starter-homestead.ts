/** starter-homestead.ts — deterministic origin safe-zone assembly (#277). */

import { ASSET_DEFS } from '../../config/assets.config';
import { PLAYER_CONFIG } from '../../config/game.config';
import type { CellData } from '../../types/game.types';

interface StarterPlacement {
  readonly x: number;
  readonly y: number;
  readonly assetKey: string;
  readonly itemId?: string;
}

const ORIGIN = { x: 9, y: 8 } as const;

const STARTER_HOMESTEAD: readonly StarterPlacement[] = [
  { x: 0, y: 0, assetKey: 'fence' }, { x: 1, y: 0, assetKey: 'fence' }, { x: 2, y: 0, assetKey: 'fence' }, { x: 3, y: 0, assetKey: 'fence' }, { x: 4, y: 0, assetKey: 'fence' }, { x: 5, y: 0, assetKey: 'fence' }, { x: 6, y: 0, assetKey: 'fence' },
  { x: 0, y: 1, assetKey: 'fence' },                                                                                                                           { x: 6, y: 1, assetKey: 'fence' },
  { x: 0, y: 2, assetKey: 'fence' }, { x: 1, y: 2, assetKey: 'sign' }, { x: 2, y: 2, assetKey: 'flower' },                                     { x: 6, y: 2, assetKey: 'fence' },
  { x: 0, y: 3, assetKey: 'fence' },                                                                                                                           { x: 6, y: 3, assetKey: 'fence' },
  { x: 0, y: 4, assetKey: 'fence' }, { x: 1, y: 4, assetKey: 'flower_pink' },                                                                                   { x: 6, y: 4, assetKey: 'fence' },
  { x: 0, y: 5, assetKey: 'fence' },                                     { x: 2, y: 5, assetKey: 'campfire' }, { x: 3, y: 5, assetKey: 'dirt' }, { x: 4, y: 5, assetKey: 'dirt' }, { x: 6, y: 5, assetKey: 'fence' },
  { x: 0, y: 6, assetKey: 'fence' }, { x: 1, y: 6, assetKey: 'fence' }, { x: 2, y: 6, assetKey: 'dirt' }, { x: 3, y: 6, assetKey: 'quiz_gate' }, { x: 4, y: 6, assetKey: 'dirt' }, { x: 5, y: 6, assetKey: 'fence' }, { x: 6, y: 6, assetKey: 'fence' },
  { x: 3, y: 1, assetKey: 'stone_floor' }, { x: 4, y: 1, assetKey: 'stone_floor' }, { x: 5, y: 1, assetKey: 'stone_floor' },
  { x: 3, y: 2, assetKey: 'stone_floor' }, { x: 4, y: 2, assetKey: 'stone_floor' }, { x: 5, y: 2, assetKey: 'stone_floor' },
  { x: 4, y: 3, assetKey: 'starter_cottage' },
  // Breadcrumb coins toward the south quiz_gate exit (player starts ~center)
  { x: 3, y: 4, assetKey: 'dirt', itemId: 'coin' },
  { x: 3, y: 5, assetKey: 'dirt', itemId: 'coin' },
  { x: 5, y: 5, assetKey: 'grass', itemId: 'coin' },
];

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
}

/**
 * Guarantee the player's exact spawn cell (and its 4 cardinal neighbors) is
 * walkable, no matter what any OTHER generation phase placed there.
 *
 * Root cause this fixes: STARTER_HOMESTEAD above is a hand-authored SPARSE
 * cell list -- it only explicitly stamps the cells it lists (walls, the
 * cottage, the campfire, the courtyard, etc). Cells inside its 7x7 footprint
 * that are NOT explicitly listed are gaps: they silently retain whatever an
 * EARLIER phase (most notably Phase 3's WU-template stamping, which runs
 * before this assembly) happened to place there. PLAYER_CONFIG.startPosition
 * (12.5, 12.5) resolves to grid cell (12,12) = offset (3,4) inside this
 * layout, which is exactly one of those unstamped gaps (along with its
 * neighbors (3,3)/(2,4)/(4,4) -- deliberately NOT a full 3x3 box, since the
 * diagonal neighbors include the cottage at (4,3) and the campfire at (2,5),
 * which must NOT be cleared). If the WU template selected for that safe-zone
 * position (or, in principle, any later phase -- entropy-flag overrides,
 * bonfire placement, obstacle balancing) placed a blocking obstacle there,
 * the player spawns on top of / inside it -- a real, user-reported bug
 * (2026-07-09), intermittent because it depends on which template/RNG
 * outcome landed at that specific cell.
 *
 * Called LAST in the chunk (0,0) generation pipeline (after every other
 * phase that could plausibly place blocking content), not right after
 * stampStarterHomestead -- anything earlier in the pipeline is too early,
 * since a later phase could silently re-block the spawn cell after an
 * earlier clearance pass already ran.
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