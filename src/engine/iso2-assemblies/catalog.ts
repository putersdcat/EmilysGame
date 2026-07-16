/**
 * catalog.ts — Iso 2.0 modular scene recipes (V2 visual re-attachment).
 *
 * Multi-cell stamps using existing asset keys. Placement policy lives in
 * iso2-assemblies.ts (`maybePlaceModularScenes`); this file is data only.
 *
 * Scene openings (scene-first productization): every barrier gap declares
 * either a functional gate (`quiz_gate` / `door_locked`) or an explicit
 * open path entry. Validated/repaired by `scene-invariants.ts`.
 */

/** How a recipe opening must be realized on the grid. */
export type AssemblyOpeningKind = 'quiz_gate' | 'door_locked' | 'path';

/** Relative cell that must be a functional gate or open path entry. */
export interface AssemblyOpening {
  readonly x: number;
  readonly y: number;
  readonly kind: AssemblyOpeningKind;
}

export interface AssemblyPlacement {
  readonly x: number;
  readonly y: number;
  readonly assetKey: string;
  readonly itemId?: string;
  readonly npcId?: string;
}

export interface AssemblyRecipe {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly placements: readonly AssemblyPlacement[];
  /** Required openings — fence/wall gaps must be functional or explicit path. */
  readonly openings?: readonly AssemblyOpening[];
}

/** 5×5 fenced farmyard: perimeter fence, south entry, hut, crops, animals. */
export const FENCED_FARM: AssemblyRecipe = {
  id: 'fenced-farm',
  width: 5,
  height: 5,
  placements: [
    // North fence
    { x: 0, y: 0, assetKey: 'fence' }, { x: 1, y: 0, assetKey: 'fence' }, { x: 2, y: 0, assetKey: 'fence' },
    { x: 3, y: 0, assetKey: 'fence' }, { x: 4, y: 0, assetKey: 'fence' },
    // Sides
    { x: 0, y: 1, assetKey: 'fence' }, { x: 4, y: 1, assetKey: 'fence' },
    { x: 0, y: 2, assetKey: 'fence' }, { x: 4, y: 2, assetKey: 'fence' },
    { x: 0, y: 3, assetKey: 'fence' }, { x: 4, y: 3, assetKey: 'fence' },
    // South fence with dirt entry gap (center repaired to quiz_gate via openings)
    { x: 0, y: 4, assetKey: 'fence' }, { x: 1, y: 4, assetKey: 'dirt' }, { x: 2, y: 4, assetKey: 'dirt' },
    { x: 3, y: 4, assetKey: 'dirt' }, { x: 4, y: 4, assetKey: 'fence' },
    // Yard interior
    { x: 1, y: 1, assetKey: 'wheat' }, { x: 2, y: 1, assetKey: 'hut' }, { x: 3, y: 1, assetKey: 'wheat' },
    { x: 1, y: 2, assetKey: 'chicken' }, { x: 2, y: 2, assetKey: 'dirt' }, { x: 3, y: 2, assetKey: 'sheep' },
    { x: 1, y: 3, assetKey: 'wheat' }, { x: 2, y: 3, assetKey: 'cow' }, { x: 3, y: 3, assetKey: 'pig' },
  ],
  openings: [
    { x: 1, y: 4, kind: 'path' },
    { x: 2, y: 4, kind: 'quiz_gate' },
    { x: 3, y: 4, kind: 'path' },
  ],
};

/**
 * 5×5 pond: coherent water body + sand shore (no random salt).
 * No barrier openings — intentionally omits `openings` (vacuous validate).
 * PR3+ may declare shore path entries if needed; not a fenced scene.
 */
export const POND_CLEARING: AssemblyRecipe = {
  id: 'pond-clearing',
  width: 5,
  height: 5,
  // openings: omitted — no fence/wall gaps (see scene-invariants module header)
  placements: [
    { x: 0, y: 0, assetKey: 'grass' }, { x: 1, y: 0, assetKey: 'sand' }, { x: 2, y: 0, assetKey: 'sand' },
    { x: 3, y: 0, assetKey: 'sand' }, { x: 4, y: 0, assetKey: 'grass' },
    { x: 0, y: 1, assetKey: 'sand' }, { x: 1, y: 1, assetKey: 'water' }, { x: 2, y: 1, assetKey: 'water' },
    { x: 3, y: 1, assetKey: 'water' }, { x: 4, y: 1, assetKey: 'sand' },
    { x: 0, y: 2, assetKey: 'sand' }, { x: 1, y: 2, assetKey: 'water' }, { x: 2, y: 2, assetKey: 'water' },
    { x: 3, y: 2, assetKey: 'water' }, { x: 4, y: 2, assetKey: 'sand' },
    { x: 0, y: 3, assetKey: 'sand' }, { x: 1, y: 3, assetKey: 'water' }, { x: 2, y: 3, assetKey: 'water' },
    { x: 3, y: 3, assetKey: 'water' }, { x: 4, y: 3, assetKey: 'sand' },
    { x: 0, y: 4, assetKey: 'grass' }, { x: 1, y: 4, assetKey: 'sand' }, { x: 2, y: 4, assetKey: 'sand' },
    { x: 3, y: 4, assetKey: 'sand' }, { x: 4, y: 4, assetKey: 'grass' },
    // Duck on shore for charm
    { x: 4, y: 2, assetKey: 'duck' },
  ],
};

/** 5×4 gatehouse: wall wings + locked door + stone approach. */
export const GATEHOUSE: AssemblyRecipe = {
  id: 'gatehouse',
  width: 5,
  height: 4,
  placements: [
    { x: 0, y: 0, assetKey: 'grass' }, { x: 1, y: 0, assetKey: 'dirt' }, { x: 2, y: 0, assetKey: 'dirt' },
    { x: 3, y: 0, assetKey: 'dirt' }, { x: 4, y: 0, assetKey: 'grass' },
    { x: 0, y: 1, assetKey: 'wall' }, { x: 1, y: 1, assetKey: 'wall' }, { x: 2, y: 1, assetKey: 'door_locked' },
    { x: 3, y: 1, assetKey: 'wall' }, { x: 4, y: 1, assetKey: 'wall' },
    { x: 0, y: 2, assetKey: 'stone_floor' }, { x: 1, y: 2, assetKey: 'stone_floor' },
    { x: 2, y: 2, assetKey: 'stone_floor' }, { x: 3, y: 2, assetKey: 'stone_floor' },
    { x: 4, y: 2, assetKey: 'stone_floor' },
    { x: 0, y: 3, assetKey: 'grass' }, { x: 1, y: 3, assetKey: 'dirt' }, { x: 2, y: 3, assetKey: 'dirt' },
    { x: 3, y: 3, assetKey: 'dirt' }, { x: 4, y: 3, assetKey: 'grass' },
  ],
  openings: [{ x: 2, y: 1, kind: 'door_locked' }],
};

/** 5×3 bridge over a short water channel with dirt approaches. */
export const BRIDGE_CROSSING: AssemblyRecipe = {
  id: 'bridge-crossing',
  width: 5,
  height: 3,
  placements: [
    { x: 0, y: 0, assetKey: 'grass' }, { x: 1, y: 0, assetKey: 'dirt' }, { x: 2, y: 0, assetKey: 'dirt' },
    { x: 3, y: 0, assetKey: 'dirt' }, { x: 4, y: 0, assetKey: 'grass' },
    { x: 0, y: 1, assetKey: 'sand' }, { x: 1, y: 1, assetKey: 'water' }, { x: 2, y: 1, assetKey: 'bridge' },
    { x: 3, y: 1, assetKey: 'water' }, { x: 4, y: 1, assetKey: 'sand' },
    { x: 0, y: 2, assetKey: 'grass' }, { x: 1, y: 2, assetKey: 'dirt' }, { x: 2, y: 2, assetKey: 'dirt' },
    { x: 3, y: 2, assetKey: 'dirt' }, { x: 4, y: 2, assetKey: 'grass' },
  ],
  openings: [
    { x: 2, y: 0, kind: 'path' },
    { x: 2, y: 2, kind: 'path' },
  ],
};

/** 5×5 simple church ruin + grave markers (stone + flowers). */
export const CHURCH_GRAVEYARD: AssemblyRecipe = {
  id: 'church-graveyard',
  width: 5,
  height: 5,
  placements: [
    { x: 0, y: 0, assetKey: 'wall' }, { x: 1, y: 0, assetKey: 'wall' }, { x: 2, y: 0, assetKey: 'wall' },
    { x: 3, y: 0, assetKey: 'wall' }, { x: 4, y: 0, assetKey: 'wall' },
    { x: 0, y: 1, assetKey: 'wall' }, { x: 1, y: 1, assetKey: 'stone_floor' }, { x: 2, y: 1, assetKey: 'stone_floor' },
    { x: 3, y: 1, assetKey: 'stone_floor' }, { x: 4, y: 1, assetKey: 'wall' },
    { x: 0, y: 2, assetKey: 'wall' }, { x: 1, y: 2, assetKey: 'stone_floor' }, { x: 2, y: 2, assetKey: 'sign' },
    { x: 3, y: 2, assetKey: 'stone_floor' }, { x: 4, y: 2, assetKey: 'wall' },
    { x: 0, y: 3, assetKey: 'wall' }, { x: 1, y: 3, assetKey: 'stone_floor' }, { x: 2, y: 3, assetKey: 'door_locked' },
    { x: 3, y: 3, assetKey: 'stone_floor' }, { x: 4, y: 3, assetKey: 'wall' },
    // Graveyard strip south of the door
    { x: 0, y: 4, assetKey: 'flower' }, { x: 1, y: 4, assetKey: 'rock' }, { x: 2, y: 4, assetKey: 'dirt' },
    { x: 3, y: 4, assetKey: 'rock' }, { x: 4, y: 4, assetKey: 'flower_pink' },
  ],
  openings: [{ x: 2, y: 3, kind: 'door_locked' }],
};

export const ASSEMBLY_RECIPES: Record<string, AssemblyRecipe> = {
  'fenced-farm': FENCED_FARM,
  'pond-clearing': POND_CLEARING,
  gatehouse: GATEHOUSE,
  'bridge-crossing': BRIDGE_CROSSING,
  'church-graveyard': CHURCH_GRAVEYARD,
};
