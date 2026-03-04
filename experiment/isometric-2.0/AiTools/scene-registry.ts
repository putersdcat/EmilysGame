/**
 * scene-registry.ts — Pre-defined test scenes for the AiTools renderer.
 *
 * Mirrors the color + Z logic from experiment/isometric-2.0/src/chunk.ts
 * (makeNanoDemoSvg / makeFeatureNano) without importing game source directly.
 * Keeps AiTools self-contained.
 *
 * Usage:
 *   const chain = resolveScene('wall-h-run');
 *   renderSvg('<svg/>', { mode: 'isometric_assembly', assemblyChain: chain, ... });
 *
 * Built-in named scenes:
 *   wall-h-run       — 8-tile horizontal stone-wall run
 *   wall-v-run       — 8-tile vertical stone-wall run
 *   fence-perimeter  — 4×4 fence box with gate
 *   river-crossing   — river segment with bridge
 *   tall-grass-patch — scattered tall-grass on grass terrain
 *   homestead        — homestead-wall assembly (3×3 footprint)
 *   mixed-biomes     — showcase of all terrain tile kinds
 *
 * TODO: DOC
 */

import type { AssemblyChainItem } from './svg-renderer-tool.js';

// ─── Types ───────────────────────────────────────────────────

export type TileKind = 'grass' | 'dirt' | 'rock' | 'water' | 'sand' | 'dry-grass';
export type NanoKind =
  | 'fence' | 'stone-wall' | 'river' | 'river-bank' | 'bridge'
  | 'tall-grass' | 'gate' | 'troll-bridge' | 'cathedral-wall' | 'homestead-wall';

/** One entry in a scene descriptor. */
export interface SceneEntry {
  /** TileKind or NanoKind slug. */
  kind: TileKind | NanoKind;
  col: number;
  row: number;
  /** Optional display label for annotation. */
  label?: string;
}

/** A named set of tile entries that compose a test scene. */
export interface SceneDescriptor {
  name: string;
  description: string;
  entries: SceneEntry[];
  /** Recommended canvas width for this scene. */
  canvasWidth?: number;
  canvasHeight?: number;
}

// ─── Base tile colors (mirrors KIND_COLORS in chunk.ts) ──────

const TILE_COLORS: Record<TileKind, string> = {
  'grass':    '#4a7c4e',
  'dirt':     '#8b6f47',
  'rock':     '#6b6b6b',
  'water':    '#1e6b8c',
  'sand':     '#c2a05a',
  'dry-grass':'#8b7a32',
};

const NANO_COLORS: Record<NanoKind, string> = {
  'fence':          '#8b5e3c',
  'stone-wall':     '#6a6a6a',
  'river':          '#1e6b8c',
  'river-bank':     '#2a7a9c',
  'bridge':         '#a07850',
  'tall-grass':     '#3a6b3a',
  'gate':           '#7a5a30',
  'troll-bridge':   '#5a4a30',
  'cathedral-wall': '#555555',
  'homestead-wall': '#8a6a3a',
};

const NANO_Z: Record<NanoKind, number> = {
  'fence':          2,
  'stone-wall':     4,
  'river':         -2,
  'river-bank':     1,
  'bridge':         0,
  'tall-grass':     0,
  'gate':           2,
  'troll-bridge':   1,
  'cathedral-wall': 6,
  'homestead-wall': 3,
};

const NANO_Z_MODE: Record<NanoKind, 'positive' | 'negative' | 'flat'> = {
  'fence':          'positive',
  'stone-wall':     'positive',
  'river':          'negative',
  'river-bank':     'flat',
  'bridge':         'flat',
  'tall-grass':     'flat',
  'gate':           'positive',
  'troll-bridge':   'positive',
  'cathedral-wall': 'positive',
  'homestead-wall': 'positive',
};

const NANO_WALKABLE: Record<NanoKind, boolean> = {
  'fence':          false,
  'stone-wall':     false,
  'river':          false,
  'river-bank':     true,
  'bridge':         true,
  'tall-grass':     true,
  'gate':           true,
  'troll-bridge':   true,
  'cathedral-wall': false,
  'homestead-wall': false,
};

// ─── SVG Generators ──────────────────────────────────────────

function isNanoKind(kind: string): kind is NanoKind {
  return kind in NANO_COLORS;
}

/**
 * Generate a demo base-tile SVG (128×128) for a TileKind.
 * Matches the appearance of chunk.ts's inline fallback tiles.
 */
function makeTileSvg(kind: TileKind, col: number, row: number): string {
  const base = TILE_COLORS[kind];
  const rVariance = ((col * 7 + row * 13) & 0x0f) - 8;
  const gVariance = ((col * 11 + row * 3) & 0x0f) - 8;
  const rr = Math.max(0, Math.min(255, parseInt(base.slice(1, 3), 16) + rVariance));
  const gg = Math.max(0, Math.min(255, parseInt(base.slice(3, 5), 16) + gVariance));
  const bb = parseInt(base.slice(5, 7), 16);

  // Texture detail lines for visual richness
  let detail = '';
  if (kind === 'grass') {
    detail = `<line x1="0" y1="64" x2="128" y2="64" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>`;
  } else if (kind === 'water') {
    detail = `<rect x="0" y="48" width="128" height="32" fill="rgba(255,255,255,0.07)" rx="2"/>
              <rect x="0" y="80" width="128" height="16" fill="rgba(255,255,255,0.05)" rx="1"/>`;
  } else if (kind === 'rock') {
    detail = `<polygon points="20,40 50,20 80,40 60,70 30,70" fill="rgba(0,0,0,0.15)"/>`;
  } else if (kind === 'sand') {
    detail = `<circle cx="32" cy="40" r="4" fill="rgba(255,255,255,0.12)"/>
              <circle cx="88" cy="80" r="3" fill="rgba(255,255,255,0.09)"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="rgb(${rr},${gg},${bb})"/>
  ${detail}
  <text x="64" y="64" text-anchor="middle" dy=".35em" font-size="8" fill="rgba(255,255,255,0.35)">${kind}</text>
</svg>`;
}

/**
 * Generate a demo nano-tile SVG (128×128) for a NanoKind.
 * Mirrors makeNanoDemoSvg from chunk.ts.
 */
function makeNanoSvg(kind: NanoKind, col: number, row: number): string {
  const base = NANO_COLORS[kind];
  const rr = Math.max(0, Math.min(255, parseInt(base.slice(1, 3), 16) + ((col * 7 + row * 13) & 0x0f) - 6));
  const gg = Math.max(0, Math.min(255, parseInt(base.slice(3, 5), 16) + ((col * 11 + row * 3) & 0x0f) - 6));
  const bb = parseInt(base.slice(5, 7), 16);

  let detail = '';
  if (kind === 'stone-wall' || kind === 'cathedral-wall') {
    // Stone/brick pattern
    detail = `
      <line x1="0" y1="43" x2="128" y2="43" stroke="rgba(0,0,0,0.25)" stroke-width="1.5"/>
      <line x1="0" y1="85" x2="128" y2="85" stroke="rgba(0,0,0,0.25)" stroke-width="1.5"/>
      <line x1="32" y1="43" x2="32" y2="85" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
      <line x1="96" y1="43" x2="96" y2="85" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
      <line x1="64" y1="0"  x2="64" y2="43" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
      <line x1="64" y1="85" x2="64" y2="128" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>`;
  } else if (kind === 'fence') {
    detail = `
      <rect x="4"  y="20" width="6"  height="88" rx="2" fill="rgba(0,0,0,0.3)"/>
      <rect x="118" y="20" width="6" height="88" rx="2" fill="rgba(0,0,0,0.3)"/>
      <rect x="4"  y="36" width="120" height="8"  rx="2" fill="rgba(0,0,0,0.25)"/>
      <rect x="4"  y="72" width="120" height="8"  rx="2" fill="rgba(0,0,0,0.25)"/>`;
  } else if (kind === 'river' || kind === 'river-bank') {
    detail = `
      <rect x="0" y="24" width="128" height="80" fill="rgba(255,255,255,0.07)" rx="3"/>
      <path d="M0,48 Q32,36 64,48 Q96,60 128,48" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
      <path d="M0,80 Q32,68 64,80 Q96,92 128,80" fill="none" stroke="rgba(255,255,255,0.1)"  stroke-width="2"/>`;
  } else if (kind === 'tall-grass') {
    detail = `
      <line x1="24"  y1="100" x2="20"  y2="30"  stroke="rgba(0,180,0,0.6)" stroke-width="2"/>
      <line x1="48"  y1="100" x2="52"  y2="20"  stroke="rgba(0,200,0,0.6)" stroke-width="2"/>
      <line x1="72"  y1="100" x2="68"  y2="28"  stroke="rgba(0,160,0,0.6)" stroke-width="2"/>
      <line x1="96"  y1="100" x2="100" y2="25"  stroke="rgba(0,190,0,0.6)" stroke-width="2"/>
      <line x1="110" y1="100" x2="115" y2="40"  stroke="rgba(0,170,0,0.6)" stroke-width="2"/>`;
  } else if (kind === 'bridge' || kind === 'troll-bridge') {
    detail = `
      <rect x="8"  y="44" width="112" height="40" rx="3" fill="rgba(0,0,0,0.2)"/>
      <line x1="24"  y1="44" x2="24"  y2="84" stroke="rgba(0,0,0,0.3)" stroke-width="2"/>
      <line x1="64"  y1="44" x2="64"  y2="84" stroke="rgba(0,0,0,0.3)" stroke-width="2"/>
      <line x1="104" y1="44" x2="104" y2="84" stroke="rgba(0,0,0,0.3)" stroke-width="2"/>`;
  } else if (kind === 'gate') {
    detail = `
      <rect x="36" y="20" width="56" height="88" rx="4" fill="rgba(0,0,0,0.3)"/>
      <rect x="44" y="28" width="16" height="40" rx="2" fill="rgba(255,200,100,0.3)"/>
      <rect x="68" y="28" width="16" height="40" rx="2" fill="rgba(255,200,100,0.3)"/>
      <circle cx="60"  cy="68" r="4" fill="rgba(255,200,100,0.6)"/>
      <circle cx="68"  cy="68" r="4" fill="rgba(255,200,100,0.6)"/>`;
  } else if (kind === 'homestead-wall') {
    detail = `
      <rect x="0"  y="48" width="128" height="80" fill="rgba(0,0,0,0.15)"/>
      <line x1="0"  y1="80" x2="128" y2="80" stroke="rgba(0,0,0,0.2)" stroke-width="1.5"/>
      <line x1="48" y1="48" x2="48" y2="128" stroke="rgba(0,0,0,0.18)" stroke-width="1"/>
      <line x1="80" y1="48" x2="80" y2="128" stroke="rgba(0,0,0,0.18)" stroke-width="1"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="rgb(${rr},${gg},${bb})"/>
  ${detail}
  <text x="64" y="118" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.45)">${kind}</text>
</svg>`;
}

// ─── Scene Resolution ─────────────────────────────────────────

/**
 * Resolve a SceneDescriptor into an AssemblyChainItem[] ready for renderSvg.
 */
export function resolveScene(descriptor: SceneDescriptor): AssemblyChainItem[] {
  return descriptor.entries.map((entry) => {
    const { kind, col, row } = entry;
    if (isNanoKind(kind)) {
      return {
        svg: makeNanoSvg(kind, col, row),
        col,
        row,
        zMode: NANO_Z_MODE[kind],
        zOffset: NANO_Z[kind],
        walkable: NANO_WALKABLE[kind],
      };
    } else {
      return {
        svg: makeTileSvg(kind as TileKind, col, row),
        col,
        row,
        zMode: 'flat' as const,
        zOffset: 0,
        walkable: true,
      };
    }
  });
}

/**
 * Resolve a named scene by ID to an AssemblyChainItem array.
 * Throws if the scene name is not found.
 */
export function resolveNamedScene(name: string): { chain: AssemblyChainItem[]; descriptor: SceneDescriptor } {
  const descriptor = BUILT_IN_SCENES[name];
  if (!descriptor) {
    const available = Object.keys(BUILT_IN_SCENES).join(', ');
    throw new Error(`Unknown scene "${name}". Available: ${available}`);
  }
  return { chain: resolveScene(descriptor), descriptor };
}

/** Returns all built-in scene names and descriptions. */
export function listScenes(): { name: string; description: string; tileCount: number; canvasWidth?: number; canvasHeight?: number }[] {
  return Object.values(BUILT_IN_SCENES).map(s => ({
    name: s.name,
    description: s.description,
    tileCount: s.entries.length,
    canvasWidth: s.canvasWidth,
    canvasHeight: s.canvasHeight,
  }));
}

// ─── Built-in Scenes ─────────────────────────────────────────

function grassRow(cols: number[], row: number): SceneEntry[] {
  return cols.map(col => ({ kind: 'grass' as TileKind, col, row }));
}

function nanoRow(kind: NanoKind, cols: number[], row: number): SceneEntry[] {
  return cols.map(col => ({ kind, col, row, label: `${kind}(${col},${row})` }));
}

export const BUILT_IN_SCENES: Record<string, SceneDescriptor> = {

  // ── 8-tile horizontal stone-wall run on grass ─────────────
  'wall-h-run': {
    name: 'wall-h-run',
    description: '8-tile horizontal stone-wall run on grass base. Tests east-west extrusion alignment.',
    canvasWidth: 1200,
    canvasHeight: 600,
    entries: [
      // Grass base layer
      ...grassRow([0,1,2,3,4,5,6,7], 0),
      ...grassRow([0,1,2,3,4,5,6,7], 1),
      // Stone wall across row 0
      ...nanoRow('stone-wall', [0,1,2,3,4,5,6,7], 0),
    ],
  },

  // ── 8-tile vertical (NW-SE) stone-wall run ────────────────
  'wall-v-run': {
    name: 'wall-v-run',
    description: '8-tile vertical stone-wall run. Tests north-south extrusion and face inversion.',
    canvasWidth: 900,
    canvasHeight: 900,
    entries: [
      ...grassRow([0,1,2], 0),
      ...grassRow([0,1,2], 1),
      ...grassRow([0,1,2], 2),
      ...grassRow([0,1,2], 3),
      ...grassRow([0,1,2], 4),
      ...grassRow([0,1,2], 5),
      ...grassRow([0,1,2], 6),
      ...grassRow([0,1,2], 7),
      ...nanoRow('stone-wall', [1], 0),
      ...nanoRow('stone-wall', [1], 1),
      ...nanoRow('stone-wall', [1], 2),
      ...nanoRow('stone-wall', [1], 3),
      ...nanoRow('stone-wall', [1], 4),
      ...nanoRow('stone-wall', [1], 5),
      ...nanoRow('stone-wall', [1], 6),
      ...nanoRow('stone-wall', [1], 7),
    ],
  },

  // ── 4×4 fence perimeter with gate ────────────────────────
  'fence-perimeter': {
    name: 'fence-perimeter',
    description: '4×4 fence perimeter with one gate. Tests fence corner rendering and gate alignment.',
    canvasWidth: 900,
    canvasHeight: 700,
    entries: [
      // Grass base
      ...[ [0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[2,2],[3,2],[0,3],[1,3],[2,3],[3,3] ]
        .map(([c,r]) => ({ kind: 'grass' as TileKind, col: c, row: r })),
      // Fence top row
      { kind: 'fence' as NanoKind, col: 0, row: 0 },
      { kind: 'gate'  as NanoKind, col: 1, row: 0, label: 'GATE' },
      { kind: 'fence' as NanoKind, col: 2, row: 0 },
      { kind: 'fence' as NanoKind, col: 3, row: 0 },
      // Fence sides
      { kind: 'fence' as NanoKind, col: 0, row: 1 },
      { kind: 'fence' as NanoKind, col: 3, row: 1 },
      { kind: 'fence' as NanoKind, col: 0, row: 2 },
      { kind: 'fence' as NanoKind, col: 3, row: 2 },
      // Fence bottom
      { kind: 'fence' as NanoKind, col: 0, row: 3 },
      { kind: 'fence' as NanoKind, col: 1, row: 3 },
      { kind: 'fence' as NanoKind, col: 2, row: 3 },
      { kind: 'fence' as NanoKind, col: 3, row: 3 },
    ],
  },

  // ── River with bridge crossing ─────────────────────────────
  'river-crossing': {
    name: 'river-crossing',
    description: 'River segment with bridge crossing. Tests negative-Z river alignment and flat bridge surface.',
    canvasWidth: 1100,
    canvasHeight: 600,
    entries: [
      // Grass banks
      ...[ [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],
           [0,1],[1,1],[2,1],           [4,1],[5,1],[6,1],
           [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2] ]
        .map(([c,r]) => ({ kind: 'grass' as TileKind, col: c, row: r })),
      // River channel (row 1)
      { kind: 'river' as NanoKind, col: 0, row: 1 },
      { kind: 'river' as NanoKind, col: 1, row: 1 },
      { kind: 'river' as NanoKind, col: 2, row: 1 },
      // Bridge crossing
      { kind: 'bridge' as NanoKind, col: 3, row: 1, label: 'BRIDGE' },
      { kind: 'river' as NanoKind, col: 4, row: 1 },
      { kind: 'river' as NanoKind, col: 5, row: 1 },
      { kind: 'river' as NanoKind, col: 6, row: 1 },
    ],
  },

  // ── Scattered tall-grass on grass base ────────────────────
  'tall-grass-patch': {
    name: 'tall-grass-patch',
    description: 'Scattered tall-grass on grass base. Tests flat-mode nano rendering.',
    canvasWidth: 900,
    canvasHeight: 600,
    entries: [
      ...[ [0,0],[1,0],[2,0],[3,0],[4,0],
           [0,1],[1,1],[2,1],[3,1],[4,1],
           [0,2],[1,2],[2,2],[3,2],[4,2] ]
        .map(([c,r]) => ({ kind: 'grass' as TileKind, col: c, row: r })),
      { kind: 'tall-grass' as NanoKind, col: 0, row: 0 },
      { kind: 'tall-grass' as NanoKind, col: 2, row: 0 },
      { kind: 'tall-grass' as NanoKind, col: 1, row: 1 },
      { kind: 'tall-grass' as NanoKind, col: 3, row: 1 },
      { kind: 'tall-grass' as NanoKind, col: 4, row: 0 },
      { kind: 'tall-grass' as NanoKind, col: 0, row: 2 },
      { kind: 'tall-grass' as NanoKind, col: 4, row: 2 },
    ],
  },

  // ── Homestead wall assembly ────────────────────────────────
  'homestead': {
    name: 'homestead',
    description: '3×3 homestead-wall assembly with entrance. Mirrors assemblies.ts homestead layout.',
    canvasWidth: 900,
    canvasHeight: 700,
    entries: [
      ...[ [0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2] ]
        .map(([c,r]) => ({ kind: 'grass' as TileKind, col: c, row: r })),
      // Walls: perimeter of 3×3     
      { kind: 'homestead-wall' as NanoKind, col: 0, row: 0 },
      { kind: 'homestead-wall' as NanoKind, col: 1, row: 0 },
      { kind: 'homestead-wall' as NanoKind, col: 2, row: 0 },
      { kind: 'homestead-wall' as NanoKind, col: 0, row: 1 },
      // col=1,row=1 = interior (grass only)
      { kind: 'homestead-wall' as NanoKind, col: 2, row: 1 },
      { kind: 'homestead-wall' as NanoKind, col: 0, row: 2 },
      { kind: 'gate'           as NanoKind, col: 1, row: 2, label: 'ENTRANCE' },
      { kind: 'homestead-wall' as NanoKind, col: 2, row: 2 },
    ],
  },

  // ── All terrain tile kinds showcase ──────────────────────
  'mixed-biomes': {
    name: 'mixed-biomes',
    description: 'One of each TileKind in a row. Quick visual check of all biome colors.',
    canvasWidth: 1200,
    canvasHeight: 400,
    entries: [
      { kind: 'grass'    as TileKind, col: 0, row: 0 },
      { kind: 'dirt'     as TileKind, col: 1, row: 0 },
      { kind: 'rock'     as TileKind, col: 2, row: 0 },
      { kind: 'water'    as TileKind, col: 3, row: 0 },
      { kind: 'sand'     as TileKind, col: 4, row: 0 },
      { kind: 'dry-grass'as TileKind, col: 5, row: 0 },
    ],
  },

  // ── All nano kinds showcase ────────────────────────────────
  'all-nanos': {
    name: 'all-nanos',
    description: 'One of each NanoKind, each on a grass base. Quick visual check of all nano tile colors and Z modes.',
    canvasWidth: 1800,
    canvasHeight: 600,
    entries: [
      // Grass base for each
      ...([ 'fence','stone-wall','river','river-bank','bridge',
            'tall-grass','gate','troll-bridge','cathedral-wall','homestead-wall' ] as NanoKind[])
        .map((_, i) => ({ kind: 'grass' as TileKind, col: i, row: 0 })),
      // Nano tiles
      ...([ 'fence','stone-wall','river','river-bank','bridge',
            'tall-grass','gate','troll-bridge','cathedral-wall','homestead-wall' ] as NanoKind[])
        .map((kind, i) => ({ kind, col: i, row: 0, label: kind })),
    ],
  },
};
