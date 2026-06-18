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
} from '../types/iso-renderer.types.js';
import {
  CottageStoneFoundation, DarkCathedralStone, MudBrick, PlasterWhitewashWall,
  RedClinker, RoughWoodPlankWall, SandstoneBrick, StoneBrick, TimberFrameWall,
} from '../asset-pipeline/iso2-materials.js';
import {
  cathedralWallSvg,
  cathedralWallTopSvg,
  homesteadWallSvg,
  homesteadWallTopSvg,
  stoneWallSvg,
  stoneWallTopSvg,
  trollBridgeSvg,
  waterNanoSvg,
  woodenBridgeSvg,
  woodenFenceSvg,
  woodenGateSvg,
} from './nano-tile-svgs.js';

/** Default walkable rule constants (avoid allocations in hot paths). */
const WALKABLE_NEVER  = { type: 'never'  } as const;
const WALKABLE_ALWAYS = { type: 'always' } as const;
const WALKABLE_QUIZ_GATE = { type: 'conditional', conditionId: 'quiz-gate' } as const;

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
    endFaceTextureSvg: DarkCathedralStone.svgEnd(),
    topRotateWithAxis: false,
    endCapTicks: false,
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
): IsoNanoTile {
  return {
    kind: 'fence',
    zOffset,
    zMode: 'positive',
    svg: woodenFenceSvg(variant),
    walkable: WALKABLE_NEVER,
    blendEdges: false,
    variant,
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
): IsoNanoTile {
  return {
    kind: 'river',
    zOffset,
    zMode: 'negative',
    svg: waterNanoSvg(variant, variant === 'isolated' ? 'deep-pond' : 'clear-river'),
    walkable: WALKABLE_NEVER,
    blendEdges: true,
    variant,
  };
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
    case 'homestead_wall_planks':
      stack = [plankHomesteadWallNano(variant ?? 'straight-h')]; break;
    case 'stone_wall_cottage_foundation':
      stack = [cottageFoundationWallNano(variant ?? 'straight-h')]; break;
    case 'cathedral_wall':
      stack = [cathedralWallNano(variant ?? 'isolated')]; break;
    case 'wooden_fence':
      stack = [woodenFenceNano(variant ?? 'straight-h')]; break;
    case 'door_gate':
      stack = [woodenGateNano(variant ?? 'straight-h')]; break;
    case 'quiz_gate':
      stack = [woodenGateNano(variant ?? 'straight-h', true)]; break;
    case 'water':
      stack = [waterNano(variant ?? 'straight-h')]; break;
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
    || tileType === 'wooden_fence' || tileType === 'door_gate'
    || tileType === 'quiz_gate' || tileType === 'water' || tileType === 'bridge'
    || tileType === 'troll_bridge' || tileType === 'homestead_wall'
    || tileType === 'homestead_wall_plaster' || tileType === 'homestead_wall_planks'
    || tileType === 'cathedral_wall';
}
