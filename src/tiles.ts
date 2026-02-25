/**
 * tiles.ts - SVG micro tile loading, isometric pre-rendering, and caching.
 * Loads SVG tiles (source size = RENDER_CONFIG.microTileSize), transforms them
 * into 64x32 isometric diamonds, and caches as offscreen canvases for fast blitting.
 * TODO: DOC - tile pipeline and caching strategy
 */

import { RENDER_CONFIG } from './config/game.config';

// ─── Types ───────────────────────────────────────────────────

export type TileType =
  | 'grass' | 'dirt' | 'rock' | 'water' | 'sand'
  | 'stone_wall' | 'stone_floor' | 'bridge' | 'door_gate' | 'wooden_fence' | 'quiz_gate';

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

// ─── Dirt Variants (3 patterns for visual variety) ───────────

const DIRT_VARIANT_SVGS: string[] = [
  // V0: Cracked earth
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="dV0" cx="16" cy="16" r="22" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A0522D"/><stop offset="1" stop-color="#654321"/>
    </radialGradient>
  </defs>
  <rect width="32" height="32" fill="url(#dV0)"/>
  <path d="M6 4 L18 14 M18 14 L28 8 M18 14 L12 28 M18 14 L30 24 M2 18 L12 12 M8 26 L16 20" stroke="#4B3621" stroke-width="0.8" opacity="0.55"/>
  <circle cx="8" cy="8" r="1.2" fill="#654321" opacity="0.4"/>
  <circle cx="24" cy="20" r="1" fill="#654321" opacity="0.35"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.18"/>
</svg>`,

  // V1: Pebbly dirt
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="dV1" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#9B7653"/><stop offset="1" stop-color="#6B4226"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#dV1)"/>
  <circle cx="5" cy="6" r="2" fill="#7B5B3A" opacity="0.5"/>
  <circle cx="14" cy="4" r="1.5" fill="#8B6B4A" opacity="0.4"/>
  <circle cx="26" cy="8" r="2.5" fill="#6B4226" opacity="0.35"/>
  <circle cx="8" cy="18" r="1.8" fill="#7B5B3A" opacity="0.4"/>
  <circle cx="20" cy="16" r="1.2" fill="#8B6B4A" opacity="0.35"/>
  <circle cx="28" cy="22" r="2" fill="#6B4226" opacity="0.45"/>
  <circle cx="12" cy="26" r="1.5" fill="#7B5B3A" opacity="0.3"/>
  <circle cx="22" cy="28" r="1" fill="#8B6B4A" opacity="0.35"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.15"/>
</svg>`,

  // V2: Sandy dirt with footprints
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="dV2" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#B8860B"/><stop offset="1" stop-color="#8B6914"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#dV2)"/>
  <ellipse cx="10" cy="12" rx="2" ry="3" fill="#9B7653" opacity="0.3"/>
  <ellipse cx="20" cy="20" rx="2" ry="3" fill="#9B7653" opacity="0.25"/>
  <path d="M4 8 Q8 6 12 8 M20 14 Q24 12 28 14 M8 24 Q12 22 16 24" stroke="#6B4226" stroke-width="0.6" opacity="0.3"/>
  <circle cx="6" cy="22" r="0.8" fill="#654321" opacity="0.3"/>
  <circle cx="26" cy="6" r="0.8" fill="#654321" opacity="0.3"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.12"/>
</svg>`,
];

// ─── Rock Variants (3 patterns for visual variety) ───────────

const ROCK_VARIANT_SVGS: string[] = [
  // V0: Rough granite
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rV0" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#B8B8B8"/><stop offset="1" stop-color="#606060"/>
    </linearGradient>
  </defs>
  <path d="M2 5 L8 1 L18 4 L26 1 L30 5 L32 16 L28 26 L18 30 L10 28 L2 30 L0 18 Z" fill="url(#rV0)"/>
  <path d="M4 8 L14 12 M8 20 L18 16 M20 8 L28 14 M6 26 L14 22" stroke="#505050" stroke-width="0.8" opacity="0.5"/>
  <path d="M12 6 L16 10 M20 18 L24 22" stroke="#888" stroke-width="0.4" opacity="0.3"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.22"/>
</svg>`,

  // V1: Mossy stones
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rV1" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A0A0A0"/><stop offset="1" stop-color="#707070"/>
    </linearGradient>
  </defs>
  <path d="M1 4 L10 1 L20 3 L30 1 L32 14 L28 24 L16 30 L4 28 L0 16 Z" fill="url(#rV1)"/>
  <path d="M2 8 L12 12 M6 22 L16 18 M18 10 L28 14 M10 26 L20 22" stroke="#505050" stroke-width="0.7" opacity="0.45"/>
  <ellipse cx="8" cy="14" rx="4" ry="3" fill="#4A7A3A" opacity="0.3"/>
  <ellipse cx="22" cy="22" rx="3" ry="2" fill="#3A6A2A" opacity="0.25"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.2"/>
</svg>`,

  // V2: Slate layers
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rV2" x1="0" y1="0" x2="32" y2="16" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#9898A0"/><stop offset="1" stop-color="#585868"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#rV2)"/>
  <path d="M0 6 L32 4 M0 12 L32 10 M0 18 L32 16 M0 24 L32 22 M0 30 L32 28" stroke="#484858" stroke-width="1.2" opacity="0.4"/>
  <path d="M8 3 L12 5 M20 9 L24 11 M6 15 L10 17 M22 21 L26 23 M14 27 L18 29" stroke="#686878" stroke-width="0.5" opacity="0.3"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.22"/>
</svg>`,
];

// ─── Sand Variants (3 patterns for beach/shore variety) ──────

const SAND_VARIANT_SVGS: string[] = [
  // V0: Smooth dunes with wind ripples
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="saV0" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F0D080"/><stop offset="1" stop-color="#D4B87C"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#saV0)"/>
  <path d="M0 8 Q8 6 16 8 Q24 10 32 8" stroke="#C4A46C" stroke-width="0.8" opacity="0.35"/>
  <path d="M0 16 Q10 14 20 16 Q28 18 32 16" stroke="#C4A46C" stroke-width="0.7" opacity="0.3"/>
  <path d="M0 24 Q6 22 14 24 Q22 26 32 24" stroke="#C4A46C" stroke-width="0.6" opacity="0.25"/>
  <circle cx="7" cy="12" r="0.5" fill="#BFA06A" opacity="0.3"/>
  <circle cx="25" cy="20" r="0.4" fill="#BFA06A" opacity="0.25"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.1"/>
</svg>`,

  // V1: Pebbly sand with small shells
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="saV1" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#E8C878"/><stop offset="1" stop-color="#CCAE70"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#saV1)"/>
  <circle cx="6" cy="5" r="1.2" fill="#D4B87C" opacity="0.4"/>
  <circle cx="18" cy="8" r="0.8" fill="#C0A060" opacity="0.35"/>
  <circle cx="10" cy="18" r="1.0" fill="#D4B87C" opacity="0.3"/>
  <circle cx="26" cy="14" r="0.9" fill="#C0A060" opacity="0.35"/>
  <circle cx="14" cy="26" r="1.1" fill="#D4B87C" opacity="0.3"/>
  <circle cx="28" cy="24" r="0.7" fill="#C0A060" opacity="0.3"/>
  <ellipse cx="8" cy="22" rx="1.5" ry="1" fill="#EDE0C0" opacity="0.25" transform="rotate(20 8 22)"/>
  <ellipse cx="22" cy="10" rx="1.2" ry="0.8" fill="#EDE0C0" opacity="0.2" transform="rotate(-15 22 10)"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.1"/>
</svg>`,

  // V2: Wet compact sand (darker, near water)
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="saV2" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C8A868"/><stop offset="1" stop-color="#B09058"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#saV2)"/>
  <path d="M2 6 Q10 4 18 6 Q26 8 30 6" stroke="#A08850" stroke-width="0.5" opacity="0.3"/>
  <path d="M0 14 Q8 12 16 14 Q24 16 32 14" stroke="#A08850" stroke-width="0.4" opacity="0.25"/>
  <circle cx="5" cy="10" r="0.4" fill="#9A8248" opacity="0.25"/>
  <circle cx="20" cy="18" r="0.5" fill="#9A8248" opacity="0.2"/>
  <circle cx="12" cy="24" r="0.3" fill="#9A8248" opacity="0.2"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.12"/>
</svg>`,
];

// ─── Stone Floor Variants (3 patterns for cave/castle variety) ───

const STONE_FLOOR_VARIANT_SVGS: string[] = [
  // V0: Flagstone (large regular tiles)
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sfV0" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#B0A898"/><stop offset="1" stop-color="#887868"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#sfV0)"/>
  <path d="M0 8 H16 V0 M16 8 H32 M0 16 H10 V8 M16 16 H32 V8 M0 24 H16 V16 M16 24 H32 V16 M0 32 H32 V24" stroke="#706050" stroke-width="0.6" opacity="0.4"/>
  <circle cx="8" cy="12" r="0.5" fill="#706050" opacity="0.25"/>
  <circle cx="24" cy="20" r="0.4" fill="#706050" opacity="0.2"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.1"/>
</svg>`,

  // V1: Worn cobblestone (irregular smaller tiles)
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sfV1" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A09888"/><stop offset="1" stop-color="#908070"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#sfV1)"/>
  <path d="M5 0 V10 H0 M12 0 V8 H5 M22 0 V12 H12 M32 0 V10 H22 M0 10 V20 H8 V10 M8 20 H18 V8 M18 12 V22 H32 V10 M0 20 V32 H10 V20 M10 32 V22 H20 V32 M20 22 H32 V32" stroke="#706050" stroke-width="0.5" opacity="0.35"/>
  <circle cx="4" cy="5" r="0.6" fill="#605040" opacity="0.2"/>
  <circle cx="15" cy="15" r="0.5" fill="#605040" opacity="0.18"/>
  <circle cx="26" cy="26" r="0.4" fill="#605040" opacity="0.15"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.1"/>
</svg>`,

  // V2: Cracked stone (aged, with visible wear)
  `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sfV2" x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#B8A898"/><stop offset="1" stop-color="#807060"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#sfV2)"/>
  <path d="M0 8 H32 M0 16 H32 M0 24 H32 M8 0 V32 M16 0 V32 M24 0 V32" stroke="#706050" stroke-width="0.5" opacity="0.3"/>
  <path d="M6 4 L10 8 L8 14 M18 2 L22 10 M26 14 L20 22 L24 28 M4 18 L12 24 L8 30" stroke="#605040" stroke-width="0.4" opacity="0.25"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.1"/>
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

  sand: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sG" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F4D68C"/>
      <stop offset="1" stop-color="#D2B48C"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#sG)"/>
  <circle cx="5" cy="7" r="0.8" fill="#C4A46C" opacity="0.5"/>
  <circle cx="14" cy="4" r="0.6" fill="#BFA06A" opacity="0.4"/>
  <circle cx="24" cy="9" r="0.7" fill="#C4A46C" opacity="0.45"/>
  <circle cx="8" cy="18" r="0.5" fill="#BFA06A" opacity="0.4"/>
  <circle cx="20" cy="16" r="0.9" fill="#C4A46C" opacity="0.5"/>
  <circle cx="28" cy="22" r="0.6" fill="#BFA06A" opacity="0.35"/>
  <circle cx="12" cy="26" r="0.7" fill="#C4A46C" opacity="0.4"/>
  <path d="M2 14 Q10 12 18 14 Q26 16 30 14" stroke="#C4A46C" stroke-width="0.6" opacity="0.3"/>
  <path d="M0 22 Q8 20 16 22 Q24 24 32 22" stroke="#BFA06A" stroke-width="0.6" opacity="0.25"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.1"/>
</svg>`,

  stone_floor: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sfG" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#B8B0A0"/>
      <stop offset="1" stop-color="#8A8070"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#sfG)"/>
  <path d="M0 8 H32 M0 16 H32 M0 24 H32 M8 0 V32 M16 0 V32 M24 0 V32" stroke="#706858" stroke-width="0.5" opacity="0.35"/>
  <circle cx="6" cy="6" r="0.6" fill="#706858" opacity="0.3"/>
  <circle cx="20" cy="12" r="0.5" fill="#706858" opacity="0.25"/>
  <circle cx="10" cy="22" r="0.7" fill="#706858" opacity="0.3"/>
  <circle cx="26" cy="28" r="0.4" fill="#706858" opacity="0.2"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.12"/>
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

  quiz_gate: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="qgG" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#7B68EE"/>
      <stop offset="1" stop-color="#483D8B"/>
    </linearGradient>
    <filter id="qgGlow">
      <feGaussianBlur stdDeviation="1.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="32" height="32" fill="url(#qgG)"/>
  <path d="M2 2 H30 V30 H2 Z" stroke="#9370DB" stroke-width="2" fill="none"/>
  <path d="M8 2 V30 M24 2 V30 M2 8 H30 M2 24 H30" stroke="#6A5ACD" stroke-width="1" opacity="0.6"/>
  <text x="16" y="20" font-size="14" text-anchor="middle" fill="#FFD700" filter="url(#qgGlow)">?</text>
  <circle cx="6" cy="6" r="2" fill="#E0E0FF" opacity="0.5"/>
  <circle cx="26" cy="6" r="2" fill="#E0E0FF" opacity="0.5"/>
  <circle cx="6" cy="26" r="2" fill="#E0E0FF" opacity="0.5"/>
  <circle cx="26" cy="26" r="2" fill="#E0E0FF" opacity="0.5"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.2"/>
</svg>`,
};

// ─── Isometric Tile Cache ────────────────────────────────────

/** Pre-rendered isometric diamond tiles (64x32 canvases) */
const isoTileCache = new Map<TileType, HTMLCanvasElement>();

/** All available tile types */
export const ALL_TILE_TYPES: TileType[] = Object.keys(TILE_SVG_SOURCES) as TileType[];

/**
 * Render an SVG into a 64x32 isometric diamond on an offscreen canvas.
 * Uses affine transform: maps unit square (RENDER_CONFIG.microTileSize) to isometric diamond.
 * SVG size 96 → rasterises at 96px for crisp downsampling into the 64×32 diamond (#192).
 */
async function renderIsoTile(svg: string): Promise<HTMLCanvasElement> {
  const tileSize = RENDER_CONFIG.microTileSize;
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

  // Pre-render dirt variants
  const dirtResults = await Promise.all(
    DIRT_VARIANT_SVGS.map(svg => renderIsoTile(svg)),
  );
  for (const canvas of dirtResults) {
    dirtVariantCache.push(canvas);
  }

  // Pre-render rock variants
  const rockResults = await Promise.all(
    ROCK_VARIANT_SVGS.map(svg => renderIsoTile(svg)),
  );
  for (const canvas of rockResults) {
    rockVariantCache.push(canvas);
  }

  // Pre-render sand variants
  const sandResults = await Promise.all(
    SAND_VARIANT_SVGS.map(svg => renderIsoTile(svg)),
  );
  for (const canvas of sandResults) {
    sandVariantCache.push(canvas);
  }

  // Pre-render stone floor variants
  const stoneFloorResults = await Promise.all(
    STONE_FLOOR_VARIANT_SVGS.map(svg => renderIsoTile(svg)),
  );
  for (const canvas of stoneFloorResults) {
    stoneFloorVariantCache.push(canvas);
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

/**
 * Get a deterministic dirt variant tile based on cell position.
 */
export function getDirtVariant(cx: number, cy: number): HTMLCanvasElement | undefined {
  if (dirtVariantCache.length === 0) return isoTileCache.get('dirt');
  const hash = ((cx * 5413) + (cy * 8291)) & 0x7FFFFFFF;
  return dirtVariantCache[hash % dirtVariantCache.length];
}

/**
 * Get a deterministic rock variant tile based on cell position.
 */
export function getRockVariant(cx: number, cy: number): HTMLCanvasElement | undefined {
  if (rockVariantCache.length === 0) return isoTileCache.get('rock');
  const hash = ((cx * 3571) + (cy * 9127)) & 0x7FFFFFFF;
  return rockVariantCache[hash % rockVariantCache.length];
}

/**
 * Get a deterministic sand variant tile based on cell position.
 */
export function getSandVariant(cx: number, cy: number): HTMLCanvasElement | undefined {
  if (sandVariantCache.length === 0) return isoTileCache.get('sand');
  const hash = ((cx * 6197) + (cy * 4523)) & 0x7FFFFFFF;
  return sandVariantCache[hash % sandVariantCache.length];
}

/**
 * Get a deterministic stone floor variant tile based on cell position.
 */
export function getStoneFloorVariant(cx: number, cy: number): HTMLCanvasElement | undefined {
  if (stoneFloorVariantCache.length === 0) return isoTileCache.get('stone_floor');
  const hash = ((cx * 4297) + (cy * 7331)) & 0x7FFFFFFF;
  return stoneFloorVariantCache[hash % stoneFloorVariantCache.length];
}

/** Pre-rendered grass variant isometric tiles */
const grassVariantCache: HTMLCanvasElement[] = [];

/** Pre-rendered sand variant isometric tiles */
const sandVariantCache: HTMLCanvasElement[] = [];

/** Pre-rendered stone floor variant isometric tiles */
const stoneFloorVariantCache: HTMLCanvasElement[] = [];

/** Pre-rendered dirt variant isometric tiles */
const dirtVariantCache: HTMLCanvasElement[] = [];

/** Pre-rendered rock variant isometric tiles */
const rockVariantCache: HTMLCanvasElement[] = [];


