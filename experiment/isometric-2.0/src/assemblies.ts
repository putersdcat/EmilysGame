/**
 * assemblies.ts — 2.0 Experiment: Macro Assembly definitions.
 * Multi-tile structure descriptors: homestead-small, ruined-cathedral.
 * Each assembly places nanos onto existing base biome tiles via placeAssembly().
 * TODO: DOC — assembly format, placement pipeline, multi-chunk spanning rules
 */

import type {
  MacroAssembly,
  AssemblyTilePlacement,
  NanoTile,
  FeatureVariant,
} from './types';
import { gateSvg } from './solver';
import { TimberFrameWall, DarkCathedralStone } from './textures';

export type AssemblyEntry = AssemblyTilePlacement;

type FaceSliceMaterial = {
  svg(): string;
  svgTop(): string;
  svgSouth(): string;
  svgEast(): string;
  svgTopV?: () => string;
  svgEnd?: () => string;
};

function makeExtrudedWallNano(
  kind: 'homestead-wall' | 'cathedral-wall',
  zOffset: number,
  material: FaceSliceMaterial,
  walkable: NanoTile['walkable'],
  variant?: FeatureVariant,
): NanoTile {
  return {
    kind,
    zOffset,
    zMode: 'positive',
    svg: material.svg(),
    sideTextureSvg: material.svg(),
    topTextureSvg: material.svgTop(),
    topFaceTextureSvg: material.svgTop(),
    topFaceTextureSvgV: material.svgTopV?.(),
    southFaceTextureSvg: material.svgSouth(),
    eastFaceTextureSvg: material.svgEast(),
    endFaceTextureSvg: material.svgEnd?.(),
    walkable,
    blendEdges: false,
    variant,
    topRotateWithAxis: !!material.svgTopV,
    endCapTicks: false,
  };
}

// ─── Assembly Factories ───────────────────────────────────────

/**
 * Homestead-small: 5×4 tile footprint.
 * Homestead-wall perimeter with a south-side quiz gate.
 * Gate at (2,3) — quiz-gated walkable.
 * Chunks: cx=6,cy=0 and cx=6,cy=1 relative to world origin (30,1).
 */
function createHomesteadSmall(): MacroAssembly {
  const placements: AssemblyTilePlacement[] = [];

  const wall = (variant: FeatureVariant): NanoTile =>
    makeExtrudedWallNano('homestead-wall', 4, TimberFrameWall, { type: 'never' }, variant);

  // ── Homestead-wall perimeter nanos ─────────────────────────
  placements.push({ col: 0, row: 0, nanos: [wall('corner-br')] });
  placements.push({ col: 1, row: 0, nanos: [wall('straight-h')] });
  placements.push({ col: 2, row: 0, nanos: [wall('straight-h')] });
  placements.push({ col: 3, row: 0, nanos: [wall('straight-h')] });
  placements.push({ col: 4, row: 0, nanos: [wall('corner-bl')] });

  placements.push({ col: 0, row: 1, nanos: [wall('straight-v')] });
  placements.push({ col: 4, row: 1, nanos: [wall('straight-v')] });
  placements.push({ col: 0, row: 2, nanos: [wall('straight-v')] });
  placements.push({ col: 4, row: 2, nanos: [wall('straight-v')] });

  placements.push({ col: 0, row: 3, nanos: [wall('corner-tr')] });
  placements.push({ col: 1, row: 3, nanos: [wall('straight-h')] });
  // (2,3) = gate
  placements.push({
    col: 2, row: 3,
    nanos: [{
      kind: 'gate',
      zOffset: 2,
      zMode: 'positive',
      svg: gateSvg(),
      walkable: { type: 'conditional', conditionId: 'quiz:homestead-gate' },
      blendEdges: false,
      variant: 'straight-h',
    }],
  });
  placements.push({ col: 3, row: 3, nanos: [wall('straight-h')] });
  placements.push({ col: 4, row: 3, nanos: [wall('corner-tl')] });

  return {
    id: 'homestead-small',
    widthTiles: 5,
    heightTiles: 4,
    placements,
  };
}

/**
 * Ruined-cathedral: 3×6 tile footprint.
 * Nave side walls with two taller north spires.
 * Chunks: cx=7,cy=0 (rows 1-4) and cx=7,cy=1 (row 5) relative to world origin (37,1).
 */
function createRuinedCathedral(): MacroAssembly {
  const placements: AssemblyTilePlacement[] = [];

  const wall = (variant: FeatureVariant, zOffset: number): NanoTile =>
    makeExtrudedWallNano('cathedral-wall', zOffset, DarkCathedralStone, { type: 'never' }, variant);

  // North spires and front lintel.
  placements.push({ col: 0, row: 0, nanos: [wall('isolated', 8)] });
  placements.push({ col: 1, row: 0, nanos: [wall('straight-h', 6)] });
  placements.push({ col: 2, row: 0, nanos: [wall('isolated', 8)] });

  // Nave side walls with staggered ruin heights.
  placements.push({ col: 0, row: 1, nanos: [wall('straight-v', 6)] });
  placements.push({ col: 2, row: 1, nanos: [wall('straight-v', 6)] });
  placements.push({ col: 0, row: 2, nanos: [wall('straight-v', 6)] });
  placements.push({ col: 2, row: 2, nanos: [wall('straight-v', 5)] });
  placements.push({ col: 0, row: 3, nanos: [wall('straight-v', 5)] });
  placements.push({ col: 2, row: 3, nanos: [wall('straight-v', 6)] });
  placements.push({ col: 0, row: 4, nanos: [wall('straight-v', 6)] });
  placements.push({ col: 2, row: 4, nanos: [wall('straight-v', 5)] });

  // South ruin edge.
  placements.push({ col: 0, row: 5, nanos: [wall('corner-tr', 4)] });
  placements.push({ col: 1, row: 5, nanos: [wall('straight-h', 4)] });
  placements.push({ col: 2, row: 5, nanos: [wall('corner-tl', 4)] });

  return {
    id: 'ruined-cathedral',
    widthTiles: 3,
    heightTiles: 6,
    placements,
  };
}

export const HOMESTEAD_ASSEMBLY: MacroAssembly = createHomesteadSmall();
export const CATHEDRAL_ASSEMBLY: MacroAssembly = createRuinedCathedral();

export const HOMESTEAD_BLUEPRINT: readonly AssemblyEntry[] = HOMESTEAD_ASSEMBLY.placements;
export const CATHEDRAL_BLUEPRINT: readonly AssemblyEntry[] = CATHEDRAL_ASSEMBLY.placements;

// ─── Assembly Registry ────────────────────────────────────────

const _assemblyCache = new Map<string, MacroAssembly>();

const _factories: Record<string, () => MacroAssembly> = {
  'homestead-small': () => HOMESTEAD_ASSEMBLY,
  'ruined-cathedral': () => CATHEDRAL_ASSEMBLY,
};

/**
 * Load a MacroAssembly by ID (cached after first call).
 * Returns null with a warning if the ID is unknown.
 */
export function loadAssembly(id: string): MacroAssembly | null {
  if (_assemblyCache.has(id)) return _assemblyCache.get(id)!;
  const factory = _factories[id];
  if (!factory) {
    console.warn(`⚠️ Unknown assembly: ${id}`);
    return null;
  }
  const a = factory();
  _assemblyCache.set(id, a);
  return a;
}
