/**
 * nano-tile-defs.ts — Maps v1 TileType strings to IsoNanoTile descriptors.
 * Bridge between the v1 asset/config system and the Iso 2.0 nano render engine.
 *
 * Usage:
 *   const nanos = getNanoStack('stone_wall', 'straight-h');
 *   if (nanos) drawNanoStack(ctx, nanos, sx, sy, sun);
 *
 * TODO: DOC — variant inference from world connectivity, walkable rules mapping
 * @see src/nano-tile.ts — draw engine
 * @see src/nano-tile-svgs.ts — SVG texture generators
 * @see src/types/iso-renderer.types.ts — IsoNanoTile, IsoNanoStack types
 */

import {
  type IsoNanoTile,
  type IsoNanoStack,
  type IsoFeatureVariant as FeatureVariant,
  type NanoWeatheringOverlay,
} from '../types/iso-renderer.types.js';
import {
  CottageStoneFoundation, DarkCathedralStone, MudBrick, PlasterWhitewashWall,
  RedClinker, RoughWoodPlankWall, SandstoneBrick, StoneBrick, ThatchRoof,
  TimberFrameWall, fenceStyleForTile,
} from '../asset-pipeline/iso2-materials.js';
import { waterStyleForTile } from '../asset-pipeline/iso2-water-family/index.js';
import {
  cathedralWallSvg,
  cathedralWallTopSvg,
  homesteadWallSvg,
  homesteadWallTopSvg,
  stoneWallSvg,
  stoneWallTopSvg,
  trollBridgeSvg,
  waterNanoSvg,
  type NanoWaterStyleId,
  woodenBridgeSvg,
  woodenFenceSvg,
  woodenGateSvg,
} from './nano-tile-svgs.js';

/** Default walkable rule constants (avoid allocations in hot paths). */
const WALKABLE_NEVER  = { type: 'never'  } as const;
const WALKABLE_ALWAYS = { type: 'always' } as const;
const WALKABLE_QUIZ_GATE = { type: 'conditional', conditionId: 'quiz-gate' } as const;

const WALL_WEATHERING_OVERLAYS: readonly NanoWeatheringOverlay[] = [
  { kind: 'mud', color: '#3b2817', intensity: 0.38, opacity: 0.28, seed: 1729, faces: ['south', 'east'], yRange: [0.70, 1] },
  { kind: 'moss', color: '#365c2d', intensity: 0.24, opacity: 0.24, seed: 2731, faces: ['south', 'east'], yRange: [0.48, 0.88] },
  { kind: 'snow', color: '#f4fbff', intensity: 0.28, opacity: 0.35, seed: 3719, faces: ['top'], yRange: [0, 0.45] },
  { kind: 'cracks', color: 'rgba(28,24,20,0.80)', intensity: 0.10, opacity: 0.22, seed: 4721, faces: ['south', 'east', 'top'] },
] as const;

// ─── Stone Wall ───────────────────────────────────────────────────────────────

interface BrickFaceMaterial {
  svgTop(): string;
  svgTopV(): string;
  svgSouth(): string;
  svgEast(): string;
  svgEnd(): string;
}

function brickPaletteWallNano(
  material: BrickFaceMaterial,
  variant: FeatureVariant = 'isolated',
  zOffset = 4,
): IsoNanoTile {
  return {
    kind: 'stone-wall',
    zOffset,
    zMode: 'positive',
    svg: stoneWallSvg(variant),
    sideTextureSvg: stoneWallSvg(variant),
    topTextureSvg: stoneWallTopSvg(variant),
    topFaceTextureSvg: material.svgTop(),
    topFaceTextureSvgV: material.svgTopV(),
    southFaceTextureSvg: material.svgSouth(),
    eastFaceTextureSvg: material.svgEast(),
    endFaceTextureSvg: material.svgEnd(),
    faceSliceEqualLighting: true,
    weatheringOverlays: WALL_WEATHERING_OVERLAYS,
    walkable: WALKABLE_NEVER,
    blendEdges: false,
    variant,
  };
}

/**
 * Create an IsoNanoTile descriptor for a stone wall.
 * Uses drawExtrudedNano path (sideTextureSvg + topTextureSvg).
 * @param variant  Connectivity variant (default 'isolated' for unknown context).
 * @param zOffset  Wall height in nano Z levels (default 4 — visual ~48px).
 */
export function stoneWallNano(
  variant: FeatureVariant = 'isolated',
  zOffset = 4,
): IsoNanoTile {
  return brickPaletteWallNano(StoneBrick, variant, zOffset);
}

export function redClinkerWallNano(variant: FeatureVariant = 'straight-h', zOffset = 4): IsoNanoTile {
  return brickPaletteWallNano(RedClinker, variant, zOffset);
}

export function mudBrickWallNano(variant: FeatureVariant = 'straight-h', zOffset = 4): IsoNanoTile {
  return brickPaletteWallNano(MudBrick, variant, zOffset);
}

export function sandstoneBrickWallNano(variant: FeatureVariant = 'straight-h', zOffset = 4): IsoNanoTile {
  return brickPaletteWallNano(SandstoneBrick, variant, zOffset);
}

interface HomesteadFaceMaterial {
  svgTop(): string;
  svgTopV(): string;
  svgSouth(): string;
  svgEast(): string;
  svgEnd(): string;
}

function homesteadPaletteWallNano(
  material: HomesteadFaceMaterial,
  variant: FeatureVariant = 'isolated',
  zOffset = 8,
): IsoNanoTile {
  return {
    kind: 'homestead-wall',
    zOffset,
    zMode: 'positive',
    svg: homesteadWallSvg(variant),
    sideTextureSvg: homesteadWallSvg(variant),
    topTextureSvg: homesteadWallTopSvg(variant),
    topFaceTextureSvg: material.svgTop(),
    topFaceTextureSvgV: material.svgTopV(),
    southFaceTextureSvg: material.svgSouth(),
    eastFaceTextureSvg: material.svgEast(),
    endFaceTextureSvg: material.svgEnd(),
    weatheringOverlays: WALL_WEATHERING_OVERLAYS,
    walkable: WALKABLE_NEVER,
    blendEdges: false,
    variant,
  };
}

export function homesteadWallNano(
  variant: FeatureVariant = 'isolated',
  zOffset = 8,
): IsoNanoTile {
  return homesteadPaletteWallNano(TimberFrameWall, variant, zOffset);
}

export function plasterHomesteadWallNano(variant: FeatureVariant = 'straight-h', zOffset = 8): IsoNanoTile {
  return homesteadPaletteWallNano(PlasterWhitewashWall, variant, zOffset);
}

export function plankHomesteadWallNano(variant: FeatureVariant = 'straight-h', zOffset = 8): IsoNanoTile {
  return homesteadPaletteWallNano(RoughWoodPlankWall, variant, zOffset);
}

function cottageFoundationWallNano(variant: FeatureVariant = 'straight-h', zOffset = 4): IsoNanoTile {
  const faces = {
    svgTop: () => CottageStoneFoundation.svgTop(),
    svgTopV: () => CottageStoneFoundation.svgTop(),
    svgSouth: () => CottageStoneFoundation.svgSouth(),
    svgEast: () => CottageStoneFoundation.svgEast(),
    svgEnd: () => CottageStoneFoundation.svgEast(),
  };
  return brickPaletteWallNano(faces, variant, zOffset);
}

export function cathedralWallNano(
  variant: FeatureVariant = 'isolated',
  zOffset = 12,
): IsoNanoTile {
  return {
    kind: 'cathedral-wall',
    zOffset,
    zMode: 'positive',
    svg: cathedralWallSvg(variant),
    sideTextureSvg: cathedralWallSvg(variant),
    topTextureSvg: cathedralWallTopSvg(variant),
    topFaceTextureSvg: DarkCathedralStone.svgTop(),
    southFaceTextureSvg: DarkCathedralStone.svgSouth(),
    eastFaceTextureSvg: DarkCathedralStone.svgEast(),
    endFaceTextureSvg: DarkCathedralStone.svgEast(),
    topRotateWithAxis: false,
    endCapTicks: false,
    weatheringOverlays: WALL_WEATHERING_OVERLAYS,
    walkable: WALKABLE_NEVER,
    blendEdges: false,
    variant,
  };
}

// ─── Wooden Fence ─────────────────────────────────────────────────────────────

/**
 * Create an IsoNanoTile descriptor for a wooden fence.
 * Uses drawPositiveNano path (z-pinned billboard — no extrusion).
 * @param variant  Connectivity variant (default 'straight-h').
 * @param zOffset  Fence height in nano Z levels (default 2 — visual ~24px).
 */
export function woodenFenceNano(
  variant: FeatureVariant = 'straight-h',
  zOffset = 2,
  styleId?: string,
  worldCol = 0,
  worldRow = 0,
): IsoNanoTile {
  const fenceStyle = styleId
    ? fenceStyleForTile(styleId, worldCol, worldRow, variant)
    : undefined;
  return {
    kind: 'fence',
    zOffset,
    zMode: 'positive',
    svg: woodenFenceSvg(variant, (styleId ?? 'weathered-post-rail') as import('./nano-tile-svgs.js').NanoFenceStyleId),
    walkable: WALKABLE_NEVER,
    blendEdges: false,
    variant,
    fenceStyle,
  };
}

function roofBillboardNano(
  kind: 'roof-slope-left' | 'roof-slope-right' | 'roof-ridge',
  svg: string,
  zOffset = 6,
  gableSvg?: string,
): IsoNanoTile {
  return {
    kind,
    zOffset,
    zMode: 'positive',
    svg,
    sideTextureSvg: gableSvg,
    walkable: WALKABLE_NEVER,
    blendEdges: false,
    variant: 'isolated',
  };
}

export function thatchRoofSlopeLeftNano(zOffset = 6): IsoNanoTile {
  return roofBillboardNano('roof-slope-left', ThatchRoof.svgSlopeLeft(), zOffset, ThatchRoof.svgGable());
}

export function thatchRoofSlopeRightNano(zOffset = 6): IsoNanoTile {
  return roofBillboardNano('roof-slope-right', ThatchRoof.svgSlopeRight(), zOffset, ThatchRoof.svgGable());
}

export function thatchRoofRidgeNano(zOffset = 6): IsoNanoTile {
  return roofBillboardNano('roof-ridge', ThatchRoof.svgRidge(), zOffset);
}

export function starterCottageNano(zOffset = 4): IsoNanoTile {
  return {
    kind: 'starter-cottage',
    zOffset,
    zMode: 'positive',
    // Drawn procedurally by nano-cottage.ts; svg is kept for the shared type contract.
    svg: '',
    walkable: WALKABLE_NEVER,
    blendEdges: false,
    variant: 'isolated',
  };
}

export function castleKeepNano(zOffset = 7): IsoNanoTile {
  return {
    kind: 'castle-keep',
    zOffset,
    zMode: 'positive',
    // Drawn procedurally by nano-cottage.ts; svg is kept for the shared type contract.
    svg: '',
    walkable: WALKABLE_NEVER,
    blendEdges: false,
    variant: 'isolated',
  };
}

export function cathedralChapelNano(zOffset = 7): IsoNanoTile {
  return {
    kind: 'cathedral-chapel',
    zOffset,
    zMode: 'positive',
    // Drawn procedurally by nano-castle.ts; svg is kept for the shared type contract.
    svg: '',
    walkable: WALKABLE_NEVER,
    blendEdges: false,
    variant: 'isolated',
  };
}

// ─── Gate / Quiz Gate ───────────────────────────────────────────────────────

/**
 * Create a rustic gate descriptor for locked doors and quiz gates.
 * Uses the same lightweight positive-Z billboard path as fences.
 */
export function woodenGateNano(
  variant: FeatureVariant = 'straight-h',
  conditional = false,
  zOffset = 3,
): IsoNanoTile {
  return {
    kind: 'gate',
    zOffset,
    zMode: 'positive',
    svg: woodenGateSvg(false, conditional ? 'mossy-farm-rail' : 'weathered-post-rail'),
    walkable: conditional ? WALKABLE_QUIZ_GATE : WALKABLE_NEVER,
    blendEdges: false,
    variant,
  };
}

// ─── Water / River ──────────────────────────────────────────────────────────

/**
 * Create a negative-Z water descriptor. This is the first main-game port of
 * the Iso 2.0 sunken water material; base terrain wiring comes later because
 * main terrain is chunk-cached.
 */
export function waterNano(
  variant: FeatureVariant = 'straight-h',
  zOffset = -2,
  styleId?: NanoWaterStyleId,
  worldCol = 0,
  worldRow = 0,
): IsoNanoTile {
  const waterStyleId = styleId ?? (variant === 'isolated' ? 'deep-pond' : 'clear-river');
  // Resolved palette threads through to drawSunkenCutFaces/drawProceduralRiverWater
  // (nano-tile.ts) so the 4 water styles are actually visible at draw time —
  // previously only the (unused-for-river) nano.svg carried style information.
  const resolvedWaterStyle = waterStyleForTile(waterStyleId, worldCol, worldRow, variant);
  return {
    kind: 'river',
    zOffset,
    zMode: 'negative',
    svg: waterNanoSvg(variant, waterStyleId, 0, worldCol, worldRow),
    walkable: WALKABLE_NEVER,
    blendEdges: true,
    variant,
    waterStyle: resolvedWaterStyle,
  };
}

/** Pick a D.6 water family by main-game biome id. */
export function waterStyleIdForBiome(biomeId: number): NanoWaterStyleId {
  switch (((biomeId % 4) + 4) % 4) {
    case 1: return 'muddy-creek';
    case 2: return 'deep-pond';
    case 3: return 'marsh-water';
    default: return 'clear-river';
  }
}

/** Optional explicit water style tile types for tests/tools; plain water falls back to biome style. */
export function waterStyleForTileType(tileType: string, biomeId: number): NanoWaterStyleId | null {
  switch (tileType) {
    case 'water': return waterStyleIdForBiome(biomeId);
    case 'water_clear_river': return 'clear-river';
    case 'water_muddy_creek': return 'muddy-creek';
    case 'water_deep_pond': return 'deep-pond';
    case 'water_marsh_water': return 'marsh-water';
    default: return null;
  }
}

// ─── Slice E: wall/fence material variety by biome ─────────────────────────
// Mirrors waterStyleIdForBiome's one-pick-per-biome pattern. Only ever
// substitutes WITHIN the same nano `kind` family (stone-wall / fence) that
// the bare 'wall'/'fence' assetKeys already resolve to below -- Slice B.5
// confirmed every stone_wall_* and wooden_fence_* sub-variant shares
// identical footprint geometry, so swapping material here never changes
// collision, only the rendered look. Biome ids/themes from biomes.config.ts:
// 0 meadow (fence-only), 1 forest (no wall/fence in obstacleWeights today),
// 2 cave (wall-only, neutral gray fits underground), 3 castle (both, wants
// an aged/ruined look).

/** Pick a Slice E wall material tileType by main-game biome id. */
export function wallTileTypeForBiome(biomeId: number): string {
  switch (((biomeId % 4) + 4) % 4) {
    case 3: return 'stone_wall_cottage_foundation'; // castle — ancient/ruined stone
    default: return 'stone_wall'; // meadow/forest/cave — neutral masonry
  }
}

/** Pick a Slice E fence material tileType by main-game biome id. */
export function fenceTileTypeForBiome(biomeId: number): string {
  switch (((biomeId % 4) + 4) % 4) {
    case 0: return 'wooden_fence_picket'; // meadow — cheerful white picket
    case 3: return 'wooden_fence_split_rail'; // castle — rugged/aged rail
    default: return 'wooden_fence'; // forest/cave — plain default (rare here today)
  }
}

// ─── Bridge ─────────────────────────────────────────────────────────────────

/** Lightweight placeholder bridge deck so bridge/gate/water APIs can be tested
 * through the same nano bridge before the full troll-bridge family lands. */
export function bridgeNano(
  variant: FeatureVariant = 'straight-h',
): IsoNanoTile {
  return {
    kind: 'bridge',
    zOffset: 1,
    zMode: 'flat',
    svg: woodenBridgeSvg(variant),
    walkable: WALKABLE_ALWAYS,
    blendEdges: false,
    variant,
  };
}

export function trollBridgeNano(
  variant: FeatureVariant = 'straight-h',
): IsoNanoTile {
  return {
    kind: 'troll-bridge',
    zOffset: 1,
    zMode: 'flat',
    svg: trollBridgeSvg(false),
    walkable: WALKABLE_QUIZ_GATE,
    blendEdges: false,
    variant,
  };
}

// ─── Nano Stack Factory ───────────────────────────────────────────────────────

/** Module-level cache: key=`${tileType}:${variant}` → IsoNanoStack. */
const _nanoStackCache = new Map<string, IsoNanoStack>();

/**
 * Maps a v1 TileType string to a NanoStack (or null for base terrain types).
 *
 * For feature tiles (stone_wall, wooden_fence, etc.) returns a one-element
 * stack. For base terrain (grass, rock, etc.) returns null — these are handled
 * by the standard terrain-cache / getIsoTile path.
 *
 * Results are cached by (tileType, variant) key — safe to call every frame.
 *
 * @param tileType  v1 TileType key from ASSET_DEFS
 * @param variant   Connectivity variant (optional — pass when gen.ts annotates tiles)
 * @returns IsoNanoStack if this tileType has a nano renderer, null otherwise
 */
export function getNanoStack(
  tileType: string,
  variant?: FeatureVariant,
): IsoNanoStack | null {
  const key = `${tileType}:${variant ?? ''}`;
  const cached = _nanoStackCache.get(key);
  if (cached) return cached;

  let stack: IsoNanoStack | null = null;
  switch (tileType) {
    // Bare assetKey aliases (Slice E): real generation places 'wall'/'fence'
    // as the literal cell.assetKey (see ObstacleSolver.ts), never the
    // resolved 'stone_wall'/'wooden_fence' tileType -- these cases let
    // mechanics.ts's collision path (which looks up getNanoStack using the
    // RAW cell.assetKey, not def.tileType) resolve real generated walls and
    // fences to their precise nano footprint instead of falling through to
    // a blunt whole-tile cell.walkable block. The render path never calls
    // getNanoStack with these bare strings (it always resolves def.tileType
    // first), so this only changes collision precision, not rendering.
    case 'wall':
      stack = [stoneWallNano(variant ?? 'isolated')]; break;
    case 'fence':
      stack = [woodenFenceNano(variant ?? 'straight-h')]; break;
    case 'stone_wall':
      stack = [stoneWallNano(variant ?? 'isolated')]; break;
    case 'stone_wall_red_clinker':
      stack = [redClinkerWallNano(variant ?? 'straight-h')]; break;
    case 'stone_wall_mud_brick':
      stack = [mudBrickWallNano(variant ?? 'straight-h')]; break;
    case 'stone_wall_sandstone':
      stack = [sandstoneBrickWallNano(variant ?? 'straight-h')]; break;
    case 'homestead_wall':
      stack = [homesteadWallNano(variant ?? 'isolated')]; break;
    case 'homestead_wall_plaster':
      stack = [plasterHomesteadWallNano(variant ?? 'straight-h')]; break;
    case 'starter_homestead_wall_plaster':
      stack = [plasterHomesteadWallNano(variant ?? 'straight-h', 3)]; break;
    case 'starter_cottage':
      stack = [starterCottageNano()]; break;
    case 'castle_keep':
      stack = [castleKeepNano()]; break;
    case 'cathedral_chapel':
      stack = [cathedralChapelNano()]; break;
    case 'homestead_wall_planks':
      stack = [plankHomesteadWallNano(variant ?? 'straight-h')]; break;
    case 'stone_wall_cottage_foundation':
      stack = [cottageFoundationWallNano(variant ?? 'straight-h')]; break;
    case 'cathedral_wall':
      stack = [cathedralWallNano(variant ?? 'isolated')]; break;
    case 'wooden_fence':
      stack = [woodenFenceNano(variant ?? 'straight-h')]; break;
    case 'wooden_fence_split_rail':
      stack = [woodenFenceNano(variant ?? 'straight-h', 2, 'split-rail-oak')]; break;
    case 'wooden_fence_picket':
      stack = [woodenFenceNano(variant ?? 'straight-h', 2, 'rough-picket')]; break;
    case 'wooden_fence_wattle':
      stack = [woodenFenceNano(variant ?? 'straight-h', 2, 'hazel-wattle')]; break;
    case 'roof_thatch_slope_left':
      stack = [thatchRoofSlopeLeftNano()]; break;
    case 'starter_roof_thatch_slope_left':
      stack = [thatchRoofSlopeLeftNano(4)]; break;
    case 'roof_thatch_slope_right':
      stack = [thatchRoofSlopeRightNano()]; break;
    case 'starter_roof_thatch_slope_right':
      stack = [thatchRoofSlopeRightNano(4)]; break;
    case 'roof_thatch_ridge':
      stack = [thatchRoofRidgeNano()]; break;
    case 'starter_roof_thatch_ridge':
      stack = [thatchRoofRidgeNano(4)]; break;
    case 'door_gate':
      stack = [woodenGateNano(variant ?? 'straight-h')]; break;
    case 'quiz_gate':
      stack = [woodenGateNano(variant ?? 'straight-h', true)]; break;
    case 'water':
      stack = [waterNano(variant ?? 'straight-h')]; break;
    case 'water_clear_river':
      stack = [waterNano(variant ?? 'straight-h', -2, 'clear-river')]; break;
    case 'water_muddy_creek':
      stack = [waterNano(variant ?? 'straight-h', -2, 'muddy-creek')]; break;
    case 'water_deep_pond':
      stack = [waterNano(variant ?? 'isolated', -2, 'deep-pond')]; break;
    case 'water_marsh_water':
      stack = [waterNano(variant ?? 'straight-h', -2, 'marsh-water')]; break;
    case 'bridge':
      stack = [bridgeNano(variant ?? 'straight-h')]; break;
    case 'troll_bridge':
      stack = [trollBridgeNano(variant ?? 'straight-h')]; break;
  }
  if (stack) _nanoStackCache.set(key, stack);
  return stack;
}

/**
 * True if this v1 TileType has a nano draw path (should skip getIsoTile).
 * Quick check avoids constructing the descriptor just to see if it exists.
 */
export function hasNanoRenderer(tileType: string): boolean {
  return tileType === 'stone_wall' || tileType === 'stone_wall_red_clinker'
    || tileType === 'stone_wall_mud_brick' || tileType === 'stone_wall_sandstone'
    || tileType === 'stone_wall_cottage_foundation'
    || tileType === 'wooden_fence' || tileType === 'wooden_fence_split_rail'
    || tileType === 'wooden_fence_picket' || tileType === 'wooden_fence_wattle'
    || tileType === 'roof_thatch_slope_left' || tileType === 'roof_thatch_slope_right'
    || tileType === 'roof_thatch_ridge'
    || tileType === 'starter_roof_thatch_slope_left' || tileType === 'starter_roof_thatch_slope_right'
    || tileType === 'starter_roof_thatch_ridge'
    || tileType === 'door_gate'
    || tileType === 'quiz_gate' || tileType === 'water'
    || tileType === 'water_clear_river' || tileType === 'water_muddy_creek'
    || tileType === 'water_deep_pond' || tileType === 'water_marsh_water'
    || tileType === 'bridge'
    || tileType === 'troll_bridge' || tileType === 'homestead_wall'
    || tileType === 'homestead_wall_plaster' || tileType === 'starter_homestead_wall_plaster'
    || tileType === 'starter_cottage' || tileType === 'castle_keep' || tileType === 'cathedral_chapel'
    || tileType === 'homestead_wall_planks'
    || tileType === 'cathedral_wall';
}
