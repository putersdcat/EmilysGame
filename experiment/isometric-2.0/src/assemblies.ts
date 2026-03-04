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
import { woodenFenceSvg, gateSvg, homesteadWallSvg, cathedralWallSvg } from './solver';

// ─── Inline SVGs ─────────────────────────────────────────────
// These SVGs are generated from solver.ts functions (shared source of truth).
// Use RUBBLE_SVG for stone rubble patches since solver doesn't have a rubble kind.

/** Stone rubble SVG (128×128, flat/walkable). */
const RUBBLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="64" fill="#888"/>
  <polygon points="10,60 40,30 60,55 90,20 120,50 128,60 0,60" fill="#999"/>
  <polygon points="20,60 45,45 70,58 100,35 128,55 128,60 0,60" fill="#777"/>
</svg>`;

// ─── Fence Nano Builder ───────────────────────────────────────

/** Build a fence NanoTile for the given variant. */
function makeFenceNano(variant: FeatureVariant): NanoTile {
  return {
    kind: 'fence',
    zOffset: 2,
    zMode: 'positive',
    svg: woodenFenceSvg(variant),
    walkable: { type: 'never' },
    blendEdges: false,
    variant,
  };
}

// ─── Assembly Factories ───────────────────────────────────────

/**
 * Homestead-small: 5×5 tile footprint.
 * Wooden fence perimeter + central hut.
 * Gate at (2,4) — quiz-gated walkable.
 * Chunks: cx=6,cy=0 (rows 1-4) and cx=6,cy=1 (row 5) relative to world origin (30,1).
 */
function createHomesteadSmall(): MacroAssembly {
  const placements: AssemblyTilePlacement[] = [];

  // ── Perimeter fence nanos ──────────────────────────────────
  // Top edge (row=0)
  placements.push({ col: 0, row: 0, nanos: [makeFenceNano('corner-tl')] });
  placements.push({ col: 1, row: 0, nanos: [makeFenceNano('straight-h')] });
  placements.push({ col: 2, row: 0, nanos: [makeFenceNano('straight-h')] });
  placements.push({ col: 3, row: 0, nanos: [makeFenceNano('straight-h')] });
  placements.push({ col: 4, row: 0, nanos: [makeFenceNano('corner-tr')] });

  // Left edge (col=0, rows 1-3)
  placements.push({ col: 0, row: 1, nanos: [makeFenceNano('straight-v')] });
  placements.push({ col: 0, row: 2, nanos: [makeFenceNano('straight-v')] });
  placements.push({ col: 0, row: 3, nanos: [makeFenceNano('straight-v')] });

  // Right edge (col=4, rows 1-3)
  placements.push({ col: 4, row: 1, nanos: [makeFenceNano('straight-v')] });
  placements.push({ col: 4, row: 2, nanos: [makeFenceNano('straight-v')] });
  placements.push({ col: 4, row: 3, nanos: [makeFenceNano('straight-v')] });

  // Bottom edge (row=4)
  placements.push({ col: 0, row: 4, nanos: [makeFenceNano('corner-bl')] });
  placements.push({ col: 1, row: 4, nanos: [makeFenceNano('straight-h')] });
  // (2,4) = gate
  placements.push({
    col: 2, row: 4,
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
  placements.push({ col: 3, row: 4, nanos: [makeFenceNano('straight-h')] });
  placements.push({ col: 4, row: 4, nanos: [makeFenceNano('corner-br')] });

  // ── Center hut (2,2) ────────────────────────────────────────
  placements.push({
    col: 2, row: 2,
    nanos: [{
      kind: 'homestead-wall',
      zOffset: 10,
      zMode: 'positive',
      svg: homesteadWallSvg(),
      walkable: { type: 'always' },
      blendEdges: false,
    }],
  });

  return {
    id: 'homestead-small',
    widthTiles: 5,
    heightTiles: 5,
    placements,
  };
}

/**
 * Ruined-cathedral: 3×5 tile footprint.
 * Two crumbling wall columns flanking a central spire, with rubble patches.
 * Chunks: cx=7,cy=0 (rows 1-4) and cx=7,cy=1 (row 5) relative to world origin (37,1).
 */
function createRuinedCathedral(): MacroAssembly {
  const placements: AssemblyTilePlacement[] = [];

  // ── Left column (col=0, rows 0-4): tall stone walls ─────────
  for (let r = 0; r < 5; r++) {
    placements.push({
      col: 0, row: r,
      nanos: [{
        kind: 'cathedral-wall',
        zOffset: 16,
        zMode: 'positive',
        svg: cathedralWallSvg(),
        walkable: { type: 'never' },
        blendEdges: false,
      }],
    });
  }

  // ── Right column (col=2, rows 0-4): shorter ruined walls ─────
  for (let r = 0; r < 5; r++) {
    placements.push({
      col: 2, row: r,
      nanos: [{
        kind: 'cathedral-wall',
        zOffset: 12,
        zMode: 'positive',
        svg: cathedralWallSvg('end-b'),
        walkable: { type: 'never' },
        blendEdges: false,
      }],
    });
  }

  // ── Spire (col=1, row=0): towering central spire ─────────────
  placements.push({
    col: 1, row: 0,
    nanos: [{
      kind: 'cathedral-wall',
      zOffset: 26,
      zMode: 'positive',
      svg: cathedralWallSvg('isolated'),
      walkable: { type: 'never' },
      blendEdges: false,
    }],
  });

  // ── Rubble patches (walkable, lower z) ────────────────────────
  // Left column rubble at (0,3)
  placements.push({
    col: 0, row: 3,
    nanos: [{
      kind: 'stone-wall',
      zOffset: 2,
      zMode: 'positive',
      svg: RUBBLE_SVG,
      walkable: { type: 'always' },
      blendEdges: false,
    }],
  });
  // Right column rubble at (2,2)
  placements.push({
    col: 2, row: 2,
    nanos: [{
      kind: 'stone-wall',
      zOffset: 2,
      zMode: 'positive',
      svg: RUBBLE_SVG,
      walkable: { type: 'always' },
      blendEdges: false,
    }],
  });

  return {
    id: 'ruined-cathedral',
    widthTiles: 3,
    heightTiles: 5,
    placements,
  };
}

// ─── Assembly Registry ────────────────────────────────────────

const _assemblyCache = new Map<string, MacroAssembly>();

const _factories: Record<string, () => MacroAssembly> = {
  'homestead-small': createHomesteadSmall,
  'ruined-cathedral': createRuinedCathedral,
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
