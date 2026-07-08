/** starter-homestead.ts — deterministic origin safe-zone assembly (#277). */

import { ASSET_DEFS } from '../../config/assets.config';
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