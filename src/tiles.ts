/**
 * tiles.ts - SVG micro tile loading, isometric pre-rendering, and caching.
 * Loads 32x32 SVG tiles, transforms them into 64x32 isometric diamonds,
 * and caches as offscreen canvases for fast blitting.
 * TODO: DOC - tile pipeline and caching strategy
 */

import { RENDER_CONFIG } from './config/game.config';

// ─── Types ───────────────────────────────────────────────────

export type TileType =
  | 'grass' | 'dirt' | 'rock' | 'water'
  | 'stone_wall' | 'bridge' | 'door_gate' | 'wooden_fence';

// ─── Grass Variants (4 patterns for visual variety) ──────────

const GRASS_VARIANT_SVGS: string[] = [
  // V0: Original wavy stripes (default)
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gG0" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#98FB98"/><stop offset="1" stop-color="#228B22"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#gG0)"/>
  <path d="M0 10 Q8 6 16 10 Q24 14 32 10 M0 18 Q8 14 16 18 Q24 22 32 18 M0 26 Q8 22 16 26 Q24 30 32 26" stroke="#006400" stroke-width="0.8" opacity="0.5"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.12"/>
</svg>`,

  // V1: Scattered grass blades (more organic)
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gG1" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#90EE90"/><stop offset="1" stop-color="#2E8B2E"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#gG1)"/>
  <path d="M4 6 L6 2 M10 8 L12 4 M18 5 L20 1 M26 7 L28 3 M7 15 L9 11 M15 14 L17 10 M23 16 L25 12 M3 24 L5 20 M11 22 L13 18 M19 25 L21 21 M27 23 L29 19 M8 30 L10 26 M16 31 L18 27 M24 29 L26 25" stroke="#006400" stroke-width="0.7" opacity="0.45"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.1"/>
</svg>`,

  // V2: Dense short grass (darker, denser)
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gG2" x1="0" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#7CCD7C"/><stop offset="1" stop-color="#1E7B1E"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#gG2)"/>
  <path d="M2 4 Q4 2 6 4 M10 3 Q12 1 14 3 M18 5 Q20 3 22 5 M26 2 Q28 0 30 2 M6 12 Q8 10 10 12 M14 11 Q16 9 18 11 M22 13 Q24 11 26 13 M0 10 Q2 8 4 10 M4 20 Q6 18 8 20 M12 19 Q14 17 16 19 M20 21 Q22 19 24 21 M28 18 Q30 16 32 18 M2 28 Q4 26 6 28 M10 27 Q12 25 14 27 M18 29 Q20 27 22 29 M26 26 Q28 24 30 26" stroke="#006400" stroke-width="0.6" opacity="0.4"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.1"/>
</svg>`,

  // V3: Open meadow (lighter, sparse)
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gG3" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A0E8A0"/><stop offset="1" stop-color="#3CB43C"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#gG3)"/>
  <path d="M4 14 Q8 12 12 14 M20 10 Q24 8 28 10 M2 24 Q6 22 10 24 M16 22 Q20 20 24 22 M8 6 L10 3 M22 4 L24 1" stroke="#006400" stroke-width="0.6" opacity="0.35"/>
  <circle cx="14" cy="8" r="0.8" fill="#FFFF88" opacity="0.3"/>
  <circle cx="26" cy="20" r="0.6" fill="#FFFF88" opacity="0.25"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.08"/>
</svg>`,
];

// ─── SVG Sources (opt-v4 variants, inlined) ──────────────────

const TILE_SVG_SOURCES: Record<TileType, string> = {
  grass: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gG" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#98FB98"/>
      <stop offset="1" stop-color="#228B22"/>
    </linearGradient>
    <pattern id="gN" width="4" height="4" patternUnits="userSpaceOnUse">
      <path d="M0 0 L4 4 M0 4 L4 0" stroke="#006400" stroke-width="0.5" opacity="0.2"/>
    </pattern>
  </defs>
  <rect width="32" height="32" fill="url(#gG)"/>
  <rect width="32" height="32" fill="url(#gN)" opacity="0.3"/>
  <path d="M0 10 Q8 6 16 10 Q24 14 32 10 M0 14 Q8 10 16 14 Q24 18 32 14 M0 18 Q8 14 16 18 Q24 22 32 18 M0 22 Q8 18 16 22 Q24 26 32 22" stroke="#006400" stroke-width="0.8"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.15"/>
</svg>`,

  dirt: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="dN" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="1" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1"/>
    </filter>
    <radialGradient id="dG" cx="16" cy="16" r="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A0522D"/>
      <stop offset="1" stop-color="#654321"/>
    </radialGradient>
  </defs>
  <rect width="32" height="32" fill="url(#dG)" filter="url(#dN)"/>
  <path d="M4 4 L12 12 M8 20 L20 8 M16 24 L28 12 M4 28 L16 16 M6 10 L10 14 M14 18 L18 22 M22 6 L26 10" stroke="#4B3621" stroke-width="0.8" opacity="0.7"/>
  <circle cx="10" cy="10" r="1.5" fill="#654321" opacity="0.5"/>
  <circle cx="22" cy="18" r="1" fill="#654321" opacity="0.5"/>
  <circle cx="6" cy="26" r="1.5" fill="#654321" opacity="0.5"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.2"/>
</svg>`,

  rock: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rG" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C0C0C0"/>
      <stop offset="1" stop-color="#696969"/>
    </linearGradient>
    <pattern id="rP" width="8" height="8" patternUnits="userSpaceOnUse">
      <polygon points="4,0 8,4 4,8 0,4" fill="#D3D3D3" opacity="0.2"/>
    </pattern>
  </defs>
  <path d="M1 3 L7 1 L15 5 L23 1 L29 3 L32 15 L28 23 L20 29 L12 25 L4 29 L0 19 Z" fill="url(#rG)"/>
  <rect width="32" height="32" fill="url(#rP)" opacity="0.3"/>
  <path d="M3 7 L11 11 M7 19 L15 15 M19 9 L27 13 M5 25 L13 21 M8 12 L12 16 M16 20 L20 24 M24 8 L28 12" stroke="#404040" stroke-width="0.8" opacity="0.7"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.25"/>
</svg>`,

  water: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wG" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1E90FF"/>
      <stop offset="1" stop-color="#4169E1"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#wG)"/>
  <path d="M0 10 Q8 6 16 10 Q24 14 32 10 M0 18 Q8 14 16 18 Q24 22 32 18 M0 26 Q8 22 16 26 Q24 30 32 26" stroke="#FFF" stroke-width="1.5" opacity="0.5"/>
  <circle cx="8" cy="16" r="2" fill="#FFF" opacity="0.4"/>
  <circle cx="24" cy="24" r="1" fill="#FFF" opacity="0.3"/>
  <path d="M4 28 Q8 26 12 28 Q16 30 20 28 Q24 26 28 28" stroke="#ADD8E6" stroke-width="1" opacity="0.3"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.15"/>
</svg>`,

  stone_wall: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="swG" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C0C0C0"/>
      <stop offset="1" stop-color="#808080"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#swG)"/>
  <path d="M0 0 L32 0 M0 6 L32 6 M0 12 L32 12 M0 18 L32 18 M0 24 L32 24 M0 32 L32 32 M4 0 V32 M10 0 V32 M16 0 V32 M22 0 V32 M28 0 V32 M2 2 H30 M2 8 H30 M2 14 H30 M2 20 H30 M2 26 H30" stroke="#696969" stroke-width="0.8" opacity="0.9"/>
  <path d="M6 4 L8 6 M14 10 L16 12 M22 16 L24 18" stroke="#404040" stroke-width="0.5"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.2"/>
</svg>`,

  bridge: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bG" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#CD853F"/>
      <stop offset="1" stop-color="#8B4513"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#bG)"/>
  <path d="M0 4 H32 M0 12 H32 M0 20 H32 M0 28 H32" stroke="#654321" stroke-width="2" opacity="0.8"/>
  <path d="M4 0 V32 M12 0 V32 M20 0 V32 M28 0 V32" stroke="#A0522D" stroke-width="1.5"/>
  <path d="M0 8 Q8 4 16 8 Q24 4 32 8 M0 24 Q8 28 16 24 Q24 28 32 24" stroke="#654321" stroke-width="1.5" opacity="0.9"/>
  <circle cx="8" cy="8" r="1.5" fill="#696969"/>
  <circle cx="24" cy="24" r="1.5" fill="#696969"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.2"/>
</svg>`,

  door_gate: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="dgG" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#CD853F"/>
      <stop offset="1" stop-color="#8B4513"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#dgG)"/>
  <path d="M2 2 H30 V30 H2 Z" stroke="#654321" stroke-width="2" fill="none"/>
  <path d="M10 2 V30 M22 2 V30 M2 10 H30 M2 22 H30" stroke="#654321" stroke-width="1" opacity="0.8"/>
  <circle cx="16" cy="16" r="3" fill="#FFD700"/>
  <circle cx="16" cy="16" r="1.5" fill="#FFF" opacity="0.4"/>
  <path d="M4 4 L6 6 M4 26 L6 28" stroke="#696969" stroke-width="1"/>
  <rect x="14" y="14" width="4" height="4" fill="#696969" opacity="0.9"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.2"/>
</svg>`,

  wooden_fence: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wfG" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A0522D"/>
      <stop offset="1" stop-color="#654321"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="transparent"/>
  <path d="M0 4 H32 M0 12 H32 M0 20 H32 M0 28 H32" stroke="url(#wfG)" stroke-width="4"/>
  <path d="M4 0 V32 M12 0 V32 M20 0 V32 M28 0 V32" stroke="#A0522D" stroke-width="2" opacity="0.9"/>
  <path d="M6 8 Q16 4 26 8 M6 24 Q16 28 26 24" stroke="#654321" stroke-width="1" opacity="0.7"/>
  <circle cx="8" cy="8" r="1" fill="#696969"/>
  <circle cx="24" cy="24" r="1" fill="#696969"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.15"/>
</svg>`,
};

// ─── Isometric Tile Cache ────────────────────────────────────

/** Pre-rendered isometric diamond tiles (64x32 canvases) */
const isoTileCache = new Map<TileType, HTMLCanvasElement>();

/** All available tile types */
export const ALL_TILE_TYPES: TileType[] = Object.keys(TILE_SVG_SOURCES) as TileType[];

/**
 * Render a 32x32 SVG into a 64x32 isometric diamond on an offscreen canvas.
 * Uses affine transform: maps unit square to isometric diamond.
 */
async function renderIsoTile(svg: string): Promise<HTMLCanvasElement> {
  const tileSize = 32;
  const tw = RENDER_CONFIG.tileWidth;   // 64
  const th = RENDER_CONFIG.tileHeight;  // 32

  // Load SVG as Image
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });

  // Create offscreen canvas sized to isometric diamond
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d')!;

  // Isometric transform: maps (0,0)-(32,32) square to diamond
  // Top vertex: (tw/2, 0), Right: (tw, th/2), Bottom: (tw/2, th), Left: (0, th/2)
  ctx.setTransform(
    tw / (2 * tileSize),    // a = 1
    th / (2 * tileSize),    // b = 0.5
    -tw / (2 * tileSize),   // c = -1
    th / (2 * tileSize),    // d = 0.5
    tw / 2,                 // e = 32 (x offset for top vertex)
    0,                      // f = 0  (y offset for top vertex)
  );

  ctx.drawImage(img, 0, 0, tileSize, tileSize);

  return canvas;
}

/**
 * Preload all tile types as isometric diamonds.
 * Call during game init (async). Must complete before rendering.
 */
export async function preloadTiles(): Promise<void> {
  const entries = Object.entries(TILE_SVG_SOURCES) as [TileType, string][];
  const results = await Promise.all(
    entries.map(async ([type, svg]) => ({
      type,
      canvas: await renderIsoTile(svg),
    })),
  );
  for (const { type, canvas } of results) {
    isoTileCache.set(type, canvas);
  }

  // Pre-render grass variants
  const grassResults = await Promise.all(
    GRASS_VARIANT_SVGS.map(svg => renderIsoTile(svg)),
  );
  for (const canvas of grassResults) {
    grassVariantCache.push(canvas);
  }
}

/**
 * Get pre-rendered isometric tile canvas (64x32 diamond).
 * Returns undefined if tile type not loaded.
 */
export function getIsoTile(type: TileType): HTMLCanvasElement | undefined {
  return isoTileCache.get(type);
}

/**
 * Get a deterministic grass variant tile based on cell position.
 * Uses a fast hash to distribute variants evenly across the terrain.
 */
export function getGrassVariant(cx: number, cy: number): HTMLCanvasElement | undefined {
  if (grassVariantCache.length === 0) return isoTileCache.get('grass');
  // Simple position hash for deterministic but varied selection
  const hash = ((cx * 7919) + (cy * 6271)) & 0x7FFFFFFF;
  return grassVariantCache[hash % grassVariantCache.length];
}

/** Pre-rendered grass variant isometric tiles */
const grassVariantCache: HTMLCanvasElement[] = [];

/**
 * Check if tiles have been preloaded.
 */
export function tilesReady(): boolean {
  return isoTileCache.size === ALL_TILE_TYPES.length;
}
