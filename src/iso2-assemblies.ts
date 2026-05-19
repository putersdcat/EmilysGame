/**
 * iso2-assemblies.ts — lightweight main-game bridge for Iso 2.0 macro assemblies.
 *
 * Ports the experiment's first assembly layouts into the v1 ChunkData grid by
 * stamping existing asset keys. Rendering then goes through tileType→nano
 * descriptors, so this module stays data-oriented and avoids renderer logic.
 */

import { ASSET_DEFS } from './config/assets.config';
import type { ChunkData, CellData } from './gen';

export type Iso2AssemblyId = 'homestead-small' | 'ruined-cathedral';

interface AssemblyPlacement {
  readonly x: number;
  readonly y: number;
  readonly assetKey: string;
}

const HOMESTEAD_SMALL: readonly AssemblyPlacement[] = [
  // 5×5 fence perimeter, gate on south edge, house core.
  { x: 0, y: 0, assetKey: 'fence' }, { x: 1, y: 0, assetKey: 'fence' }, { x: 2, y: 0, assetKey: 'fence' }, { x: 3, y: 0, assetKey: 'fence' }, { x: 4, y: 0, assetKey: 'fence' },
  { x: 0, y: 1, assetKey: 'fence' }, { x: 4, y: 1, assetKey: 'fence' },
  { x: 0, y: 2, assetKey: 'fence' }, { x: 2, y: 2, assetKey: 'house' }, { x: 4, y: 2, assetKey: 'fence' },
  { x: 0, y: 3, assetKey: 'fence' }, { x: 4, y: 3, assetKey: 'fence' },
  { x: 0, y: 4, assetKey: 'fence' }, { x: 1, y: 4, assetKey: 'fence' }, { x: 2, y: 4, assetKey: 'door_locked' }, { x: 3, y: 4, assetKey: 'fence' }, { x: 4, y: 4, assetKey: 'fence' },
];

const RUINED_CATHEDRAL: readonly AssemblyPlacement[] = [
  // 3×5 ruined-column footprint with a tall central spire-ish wall.
  { x: 0, y: 0, assetKey: 'cathedral_wall' }, { x: 1, y: 0, assetKey: 'cathedral_wall' }, { x: 2, y: 0, assetKey: 'cathedral_wall' },
  { x: 0, y: 1, assetKey: 'cathedral_wall' }, { x: 2, y: 1, assetKey: 'cathedral_wall' },
  { x: 0, y: 2, assetKey: 'wall' },           { x: 2, y: 2, assetKey: 'wall' },
  { x: 0, y: 3, assetKey: 'stone_floor' },    { x: 1, y: 3, assetKey: 'stone_floor' }, { x: 2, y: 3, assetKey: 'stone_floor' },
  { x: 0, y: 4, assetKey: 'wall' },           { x: 2, y: 4, assetKey: 'wall' },
];

function makeCell(assetKey: string): CellData {
  const def = ASSET_DEFS[assetKey];
  if (!def) throw new Error(`Unknown assembly asset: ${assetKey}`);
  return {
    assetKey,
    walkable: def.walkable,
    interactable: def.interactable,
  };
}

function placementsFor(id: Iso2AssemblyId): readonly AssemblyPlacement[] {
  switch (id) {
    case 'homestead-small': return HOMESTEAD_SMALL;
    case 'ruined-cathedral': return RUINED_CATHEDRAL;
  }
}

/** Stamp an assembly into one already-loaded main-game chunk. Out-of-bounds placements are skipped. */
export function stampIso2Assembly(chunk: ChunkData, id: Iso2AssemblyId, originX: number, originY: number): void {
  for (const p of placementsFor(id)) {
    const x = originX + p.x;
    const y = originY + p.y;
    if (y < 0 || y >= chunk.cells.length || x < 0 || x >= chunk.cells[y].length) continue;
    chunk.cells[y][x] = makeCell(p.assetKey);
  }
}
