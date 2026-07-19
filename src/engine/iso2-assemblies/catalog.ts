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
    // South fence: dirt flanks + functional quiz_gate at entry center (not dirt-only)
    { x: 0, y: 4, assetKey: 'fence' }, { x: 1, y: 4, assetKey: 'dirt' }, { x: 2, y: 4, assetKey: 'quiz_gate' },
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

/**
 * 4×4 fenced flower garden with quiz_gate south entry (expandability rails PR5).
 * Compact intentional place — fence ring + functional gate, not dirt-only.
 */
export const FENCED_GARDEN_QUIZ: AssemblyRecipe = {
  id: 'fenced-garden-quiz',
  width: 4,
  height: 4,
  placements: [
    // North fence
    { x: 0, y: 0, assetKey: 'fence' }, { x: 1, y: 0, assetKey: 'fence' },
    { x: 2, y: 0, assetKey: 'fence' }, { x: 3, y: 0, assetKey: 'fence' },
    // Sides + interior blooms
    { x: 0, y: 1, assetKey: 'fence' }, { x: 1, y: 1, assetKey: 'flower' },
    { x: 2, y: 1, assetKey: 'tulip' }, { x: 3, y: 1, assetKey: 'fence' },
    { x: 0, y: 2, assetKey: 'fence' }, { x: 1, y: 2, assetKey: 'sunflower' },
    { x: 2, y: 2, assetKey: 'flower_pink' }, { x: 3, y: 2, assetKey: 'fence' },
    // South: dirt flank + quiz_gate + dirt flank (not dirt-only entry)
    { x: 0, y: 3, assetKey: 'fence' }, { x: 1, y: 3, assetKey: 'dirt' },
    { x: 2, y: 3, assetKey: 'quiz_gate' }, { x: 3, y: 3, assetKey: 'fence' },
  ],
  openings: [
    { x: 1, y: 3, kind: 'path' },
    { x: 2, y: 3, kind: 'quiz_gate' },
  ],
};

/**
 * 5×5 meadow shrine: low stone enclosure, rock altar, sign, quiz_gate entry.
 * Intentional gated place via catalog only (no WorldUnitSolver).
 */
export const MEADOW_SHRINE_GATE: AssemblyRecipe = {
  id: 'meadow-shrine-gate',
  width: 5,
  height: 5,
  placements: [
    // North wall
    { x: 0, y: 0, assetKey: 'wall' }, { x: 1, y: 0, assetKey: 'wall' }, { x: 2, y: 0, assetKey: 'wall' },
    { x: 3, y: 0, assetKey: 'wall' }, { x: 4, y: 0, assetKey: 'wall' },
    // Sides + stone nave
    { x: 0, y: 1, assetKey: 'wall' }, { x: 1, y: 1, assetKey: 'stone_floor' },
    { x: 2, y: 1, assetKey: 'rock' }, { x: 3, y: 1, assetKey: 'stone_floor' }, { x: 4, y: 1, assetKey: 'wall' },
    { x: 0, y: 2, assetKey: 'wall' }, { x: 1, y: 2, assetKey: 'flower' },
    { x: 2, y: 2, assetKey: 'sign' }, { x: 3, y: 2, assetKey: 'flower_pink' }, { x: 4, y: 2, assetKey: 'wall' },
    { x: 0, y: 3, assetKey: 'wall' }, { x: 1, y: 3, assetKey: 'stone_floor' },
    { x: 2, y: 3, assetKey: 'stone_floor' }, { x: 3, y: 3, assetKey: 'stone_floor' }, { x: 4, y: 3, assetKey: 'wall' },
    // South: dirt flanks + quiz_gate center (progression gate into shrine)
    { x: 0, y: 4, assetKey: 'wall' }, { x: 1, y: 4, assetKey: 'dirt' },
    { x: 2, y: 4, assetKey: 'quiz_gate' }, { x: 3, y: 4, assetKey: 'dirt' }, { x: 4, y: 4, assetKey: 'wall' },
  ],
  openings: [
    { x: 1, y: 4, kind: 'path' },
    { x: 2, y: 4, kind: 'quiz_gate' },
    { x: 3, y: 4, kind: 'path' },
  ],
};

/**
 * 7×3 market stall row: shops along an open dirt corridor.
 * Path openings are explicit at both corridor ends + south approach center
 * (public market — no fence pen; no functional gate required).
 */
export const MARKET_STALL_ROW: AssemblyRecipe = {
  id: 'market-stall-row',
  width: 7,
  height: 3,
  placements: [
    // Stall line (existing shop keys only)
    { x: 0, y: 0, assetKey: 'shop_snack' },
    { x: 1, y: 0, assetKey: 'dirt' },
    { x: 2, y: 0, assetKey: 'shop' },
    { x: 3, y: 0, assetKey: 'sign' },
    { x: 4, y: 0, assetKey: 'shop_trading' },
    { x: 5, y: 0, assetKey: 'dirt' },
    { x: 6, y: 0, assetKey: 'shop_general' },
    // Dirt corridor (walkable market path)
    { x: 0, y: 1, assetKey: 'dirt' }, { x: 1, y: 1, assetKey: 'dirt' },
    { x: 2, y: 1, assetKey: 'dirt' }, { x: 3, y: 1, assetKey: 'dirt' },
    { x: 4, y: 1, assetKey: 'dirt' }, { x: 5, y: 1, assetKey: 'dirt' },
    { x: 6, y: 1, assetKey: 'dirt' },
    // South approach strip
    { x: 0, y: 2, assetKey: 'grass' }, { x: 1, y: 2, assetKey: 'dirt' },
    { x: 2, y: 2, assetKey: 'dirt' }, { x: 3, y: 2, assetKey: 'dirt' },
    { x: 4, y: 2, assetKey: 'dirt' }, { x: 5, y: 2, assetKey: 'dirt' },
    { x: 6, y: 2, assetKey: 'grass' },
  ],
  openings: [
    { x: 0, y: 1, kind: 'path' },
    { x: 6, y: 1, kind: 'path' },
    { x: 3, y: 2, kind: 'path' },
  ],
};

/**
 * Scene recipe registry — **this is the primary expand surface**.
 * Add a new place type here (or via {@link registerSceneRecipe}); do not
 * invent nano kinds or open WorldUnitSolver for a new farm/church/market.
 */
export const ASSEMBLY_RECIPES: Record<string, AssemblyRecipe> = {
  'fenced-farm': FENCED_FARM,
  'pond-clearing': POND_CLEARING,
  gatehouse: GATEHOUSE,
  'bridge-crossing': BRIDGE_CROSSING,
  'church-graveyard': CHURCH_GRAVEYARD,
  'fenced-garden-quiz': FENCED_GARDEN_QUIZ,
  'meadow-shrine-gate': MEADOW_SHRINE_GATE,
  'market-stall-row': MARKET_STALL_ROW,
};

/**
 * Thin register API for expandability rails (PR7).
 * Catalog data is the source of truth; this helper is optional sugar for
 * tests and future content loaders. Placement weights still live in
 * `iso2-assemblies.ts` (`BIOME_SCENE_WEIGHTS` / `setBiomeSceneWeight`).
 */
export function registerSceneRecipe(recipe: AssemblyRecipe): AssemblyRecipe {
  if (!recipe?.id) {
    throw new Error('registerSceneRecipe: recipe.id is required');
  }
  if (!recipe.placements || recipe.placements.length === 0) {
    throw new Error(`registerSceneRecipe: recipe "${recipe.id}" needs placements`);
  }
  if (recipe.width < 1 || recipe.height < 1) {
    throw new Error(`registerSceneRecipe: recipe "${recipe.id}" needs positive width/height`);
  }
  ASSEMBLY_RECIPES[recipe.id] = recipe;
  return recipe;
}
