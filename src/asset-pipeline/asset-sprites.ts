/**
 * asset-sprites.ts — SVG object sprites replacing emoji rendering.
 * Issue #115 Phase 1-3: Trees, rocks, fire, plants, collectibles, structures, animals.
 *
 * Pre-renders SVG artwork to offscreen canvases at init time.
 * Provides fast sync lookups for the render loop (zero alloc in hot path).
 * Falls back gracefully: if no sprite exists, render.ts uses emoji.
 * TODO: DOC - asset sprite pipeline, SVG design specs, cache strategy
 */

import { BIOME_DEFS } from '../config/biomes.config';
import { RENDER_CONFIG } from '../config/game.config';
import { getPngSprite, hasPngConfig, preloadPngAssets } from './asset-library';

const cache = new Map<string, HTMLCanvasElement>();
const SPRITE_SIZE = 48; // Matches emoji-cache size for drop-in replacement

/** Number of fire animation frames */
export const FIRE_FRAME_COUNT = 4;

// ─── SVG Definitions ─────────────────────────────────────────
// Paper-cut style: bold outlines, flat fills, simple gradients.
// ViewBox 48x48, designed for isometric world objects.

// --- Deciduous Tree (🌳 replacement) ---
const TREE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <radialGradient id="tc1" cx="24" cy="18" r="16" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#66BB6A"/>
      <stop offset="0.7" stop-color="#2E7D32"/>
      <stop offset="1" stop-color="#1B5E20"/>
    </radialGradient>
  </defs>
  <rect x="21" y="28" width="6" height="18" rx="1" fill="#6D4C41" stroke="#3E2723" stroke-width="1.2"/>
  <line x1="23" y1="30" x2="23" y2="44" stroke="#4E342E" stroke-width="0.6" opacity="0.4"/>
  <circle cx="24" cy="19" r="15" fill="url(#tc1)" stroke="#1B5E20" stroke-width="1.5"/>
  <circle cx="16" cy="17" r="9" fill="#388E3C" opacity="0.7" stroke="#1B5E20" stroke-width="0.8"/>
  <circle cx="32" cy="17" r="9" fill="#388E3C" opacity="0.65" stroke="#1B5E20" stroke-width="0.8"/>
  <circle cx="20" cy="12" r="7" fill="#43A047" opacity="0.6"/>
  <circle cx="28" cy="12" r="7" fill="#43A047" opacity="0.55"/>
  <circle cx="24" cy="10" r="5" fill="#66BB6A" opacity="0.45"/>
  <ellipse cx="24" cy="32" rx="10" ry="2" fill="#1B5E20" opacity="0.25"/>
</svg>`;

// --- Pine Tree (🌲 replacement) ---
const TREE_PINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="pg1" x1="24" y1="2" x2="24" y2="42" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#43A047"/>
      <stop offset="1" stop-color="#1B5E20"/>
    </linearGradient>
  </defs>
  <rect x="22" y="38" width="4" height="8" fill="#5D4037" stroke="#3E2723" stroke-width="1"/>
  <polygon points="24,2 8,42 40,42" fill="url(#pg1)" stroke="#1B5E20" stroke-width="1.5"/>
  <polygon points="24,8 12,34 36,34" fill="#2E7D32" stroke="#1B5E20" stroke-width="0.8" opacity="0.9"/>
  <polygon points="24,14 16,28 32,28" fill="#388E3C" stroke="#1B5E20" stroke-width="0.8" opacity="0.8"/>
  <polygon points="24,4 20,16 28,16" fill="#4CAF50" opacity="0.5"/>
  <line x1="24" y1="2" x2="24" y2="6" stroke="#66BB6A" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

// --- Palm Tree (🌴 replacement) ---
const TREE_PALM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="ptk" x1="22" y1="46" x2="28" y2="14" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#6D4C41"/>
      <stop offset="0.5" stop-color="#8D6E63"/>
      <stop offset="1" stop-color="#5D4037"/>
    </linearGradient>
  </defs>
  <path d="M22 46 Q20 34 22 24 Q24 18 26 14" stroke="url(#ptk)" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <path d="M22 42 Q23 41 25 42 M21 36 Q23 35 25 36 M22 30 Q24 29 26 30 M23 24 Q25 23 27 24"
        stroke="#4E342E" stroke-width="0.6" fill="none" opacity="0.4"/>
  <path d="M26 14 Q36 8 44 12" stroke="#2E7D32" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M26 14 Q34 4 42 2" stroke="#388E3C" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M26 14 Q22 4 14 2" stroke="#388E3C" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M26 14 Q16 8 6 10" stroke="#2E7D32" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M26 14 Q18 6 10 6" stroke="#43A047" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M26 14 Q32 6 38 6" stroke="#43A047" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <circle cx="25" cy="16" r="1.6" fill="#8D6E63" stroke="#5D4037" stroke-width="0.5"/>
  <circle cx="28" cy="15" r="1.3" fill="#795548" stroke="#5D4037" stroke-width="0.5"/>
</svg>`;

// ═══════════════════════════════════════════════════════════════
// PHASE 2: Plants, Collectibles, Structures
// ═══════════════════════════════════════════════════════════════

// --- Flower / Wildflower (🌼 replacement) ---
const FLOWER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <line x1="24" y1="30" x2="24" y2="44" stroke="#4CAF50" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="18" cy="42" rx="5" ry="1.5" fill="#4CAF50" opacity="0.3"/>
  <path d="M20 38 Q16 36 14 38 Q16 40 20 38Z" fill="#66BB6A"/>
  <circle cx="24" cy="26" r="10" fill="none"/>
  <ellipse cx="24" cy="18" rx="4" ry="5" fill="#FFF" stroke="#E0E0E0" stroke-width="0.5"/>
  <ellipse cx="30" cy="22" rx="4" ry="5" fill="#FFF" stroke="#E0E0E0" stroke-width="0.5" transform="rotate(72,24,26)"/>
  <ellipse cx="30" cy="32" rx="4" ry="5" fill="#FFF" stroke="#E0E0E0" stroke-width="0.5" transform="rotate(144,24,26)"/>
  <ellipse cx="18" cy="32" rx="4" ry="5" fill="#FFF" stroke="#E0E0E0" stroke-width="0.5" transform="rotate(216,24,26)"/>
  <ellipse cx="18" cy="22" rx="4" ry="5" fill="#FFF" stroke="#E0E0E0" stroke-width="0.5" transform="rotate(288,24,26)"/>
  <circle cx="24" cy="26" r="4.5" fill="#FFD54F" stroke="#F9A825" stroke-width="0.8"/>
  <circle cx="23" cy="25" r="1" fill="#FFB300" opacity="0.5"/>
</svg>`;

// --- Cherry Blossom (🌸 replacement) ---
const FLOWER_PINK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <line x1="24" y1="30" x2="24" y2="44" stroke="#4CAF50" stroke-width="1.5" stroke-linecap="round"/>
  <ellipse cx="24" cy="26" rx="4" ry="5.5" fill="#F8BBD0" stroke="#F48FB1" stroke-width="0.6" transform="rotate(0,24,26)"/>
  <ellipse cx="24" cy="26" rx="4" ry="5.5" fill="#F8BBD0" stroke="#F48FB1" stroke-width="0.6" transform="rotate(72,24,26)"/>
  <ellipse cx="24" cy="26" rx="4" ry="5.5" fill="#F8BBD0" stroke="#F48FB1" stroke-width="0.6" transform="rotate(144,24,26)"/>
  <ellipse cx="24" cy="26" rx="4" ry="5.5" fill="#F8BBD0" stroke="#F48FB1" stroke-width="0.6" transform="rotate(216,24,26)"/>
  <ellipse cx="24" cy="26" rx="4" ry="5.5" fill="#F8BBD0" stroke="#F48FB1" stroke-width="0.6" transform="rotate(288,24,26)"/>
  <circle cx="24" cy="26" r="3.5" fill="#FCE4EC" stroke="#F48FB1" stroke-width="0.6"/>
  <circle cx="24" cy="25" r="1.2" fill="#FFF" opacity="0.6"/>
</svg>`;

// --- Red Hibiscus (🌺 replacement) ---
const FLOWER_RED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <line x1="24" y1="32" x2="24" y2="44" stroke="#388E3C" stroke-width="2" stroke-linecap="round"/>
  <path d="M20 40 Q16 38 14 40 Q16 42 20 40Z" fill="#4CAF50"/>
  <path d="M28 38 Q32 36 34 38 Q32 40 28 38Z" fill="#4CAF50"/>
  <ellipse cx="24" cy="24" rx="5" ry="8" fill="#E53935" stroke="#C62828" stroke-width="0.6" transform="rotate(0,24,24)"/>
  <ellipse cx="24" cy="24" rx="5" ry="8" fill="#EF5350" stroke="#C62828" stroke-width="0.6" transform="rotate(72,24,24)"/>
  <ellipse cx="24" cy="24" rx="5" ry="8" fill="#E53935" stroke="#C62828" stroke-width="0.6" transform="rotate(144,24,24)"/>
  <ellipse cx="24" cy="24" rx="5" ry="8" fill="#EF5350" stroke="#C62828" stroke-width="0.6" transform="rotate(216,24,24)"/>
  <ellipse cx="24" cy="24" rx="5" ry="8" fill="#E53935" stroke="#C62828" stroke-width="0.6" transform="rotate(288,24,24)"/>
  <circle cx="24" cy="24" r="4" fill="#FFEB3B" stroke="#F9A825" stroke-width="0.6"/>
  <line x1="24" y1="24" x2="24" y2="16" stroke="#FFEB3B" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="24" cy="15" r="1.5" fill="#FF9800"/>
</svg>`;

// --- Sunflower (🌻 replacement) ---
const SUNFLOWER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <line x1="24" y1="30" x2="24" y2="46" stroke="#4CAF50" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M22 36 Q16 34 14 36 Q16 38 22 36Z" fill="#66BB6A"/>
  <path d="M26 40 Q32 38 34 40 Q32 42 26 40Z" fill="#66BB6A"/>
  <ellipse cx="24" cy="20" rx="3" ry="6" fill="#FFD54F" stroke="#F9A825" stroke-width="0.5"/>
  <ellipse cx="24" cy="20" rx="3" ry="6" fill="#FFC107" stroke="#F9A825" stroke-width="0.5" transform="rotate(30,24,20)"/>
  <ellipse cx="24" cy="20" rx="3" ry="6" fill="#FFD54F" stroke="#F9A825" stroke-width="0.5" transform="rotate(60,24,20)"/>
  <ellipse cx="24" cy="20" rx="3" ry="6" fill="#FFC107" stroke="#F9A825" stroke-width="0.5" transform="rotate(90,24,20)"/>
  <ellipse cx="24" cy="20" rx="3" ry="6" fill="#FFD54F" stroke="#F9A825" stroke-width="0.5" transform="rotate(120,24,20)"/>
  <ellipse cx="24" cy="20" rx="3" ry="6" fill="#FFC107" stroke="#F9A825" stroke-width="0.5" transform="rotate(150,24,20)"/>
  <circle cx="24" cy="20" r="5.5" fill="#795548" stroke="#5D4037" stroke-width="1"/>
  <circle cx="22" cy="19" r="0.8" fill="#6D4C41" opacity="0.5"/>
  <circle cx="26" cy="19" r="0.8" fill="#6D4C41" opacity="0.5"/>
  <circle cx="24" cy="21" r="0.8" fill="#6D4C41" opacity="0.5"/>
</svg>`;

// --- Tulip (🌷 replacement) ---
const TULIP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <line x1="24" y1="28" x2="24" y2="44" stroke="#4CAF50" stroke-width="2" stroke-linecap="round"/>
  <path d="M22 36 Q16 34 14 36 Q16 38 22 36Z" fill="#66BB6A"/>
  <path d="M18 28 Q16 18 20 14 Q24 10 24 14 Q24 10 28 14 Q32 18 30 28 Z" fill="#E91E63" stroke="#C2185B" stroke-width="1"/>
  <path d="M20 26 Q20 20 22 16 Q24 14 24 16 Q24 14 26 16 Q28 20 28 26 Z" fill="#F06292" opacity="0.6"/>
  <path d="M23 24 Q23 18 24 16 Q25 18 25 24 Z" fill="#F8BBD0" opacity="0.5"/>
</svg>`;

// --- Bush (🌿 replacement) ---
const BUSH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <radialGradient id="bg1" cx="24" cy="30" r="16" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#66BB6A"/>
      <stop offset="0.7" stop-color="#2E7D32"/>
      <stop offset="1" stop-color="#1B5E20"/>
    </radialGradient>
  </defs>
  <ellipse cx="24" cy="38" rx="14" ry="3" fill="#1B5E20" opacity="0.3"/>
  <ellipse cx="24" cy="32" rx="16" ry="10" fill="url(#bg1)" stroke="#1B5E20" stroke-width="1.5"/>
  <ellipse cx="16" cy="30" rx="8" ry="7" fill="#388E3C" opacity="0.6"/>
  <ellipse cx="32" cy="30" rx="8" ry="7" fill="#388E3C" opacity="0.55"/>
  <ellipse cx="24" cy="26" rx="8" ry="5" fill="#43A047" opacity="0.5"/>
  <circle cx="18" cy="28" r="1.5" fill="#81C784" opacity="0.4"/>
  <circle cx="30" cy="28" r="1.5" fill="#81C784" opacity="0.4"/>
</svg>`;

// --- Mushroom (🍄 replacement) ---
const MUSHROOM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect x="21" y="30" width="6" height="12" rx="2" fill="#EFEBE9" stroke="#BCAAA4" stroke-width="0.8"/>
  <ellipse cx="24" cy="30" rx="14" ry="8" fill="#E53935" stroke="#C62828" stroke-width="1.2"/>
  <ellipse cx="24" cy="28" rx="13" ry="6" fill="#EF5350" opacity="0.7"/>
  <circle cx="18" cy="28" r="2.5" fill="#FFF" opacity="0.7"/>
  <circle cx="28" cy="26" r="2" fill="#FFF" opacity="0.65"/>
  <circle cx="22" cy="24" r="1.5" fill="#FFF" opacity="0.6"/>
  <circle cx="30" cy="30" r="1.8" fill="#FFF" opacity="0.5"/>
  <ellipse cx="24" cy="42" rx="6" ry="1.5" fill="#8D6E63" opacity="0.2"/>
</svg>`;

// --- Tree Stump (🪵 replacement) ---
const STUMP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="42" rx="12" ry="3" fill="#5D4037" opacity="0.3"/>
  <rect x="14" y="30" width="20" height="12" rx="3" fill="#8D6E63" stroke="#5D4037" stroke-width="1.5"/>
  <ellipse cx="24" cy="30" rx="10" ry="5" fill="#A1887F" stroke="#5D4037" stroke-width="1.2"/>
  <ellipse cx="24" cy="30" rx="7" ry="3.5" fill="#BCAAA4"/>
  <ellipse cx="24" cy="30" rx="4" ry="2" fill="#D7CCC8"/>
  <circle cx="24" cy="30" r="1" fill="#8D6E63"/>
  <path d="M22 28 Q24 26 26 28" stroke="#795548" stroke-width="0.4" fill="none" opacity="0.3"/>
</svg>`;

// --- Cactus (🌵 replacement) ---
const CACTUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="cg1" x1="20" y1="6" x2="28" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#66BB6A"/>
      <stop offset="1" stop-color="#2E7D32"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="44" rx="8" ry="2" fill="#1B5E20" opacity="0.2"/>
  <rect x="20" y="10" width="8" height="34" rx="4" fill="url(#cg1)" stroke="#1B5E20" stroke-width="1.2"/>
  <rect x="8" y="18" width="6" height="16" rx="3" fill="#43A047" stroke="#1B5E20" stroke-width="1"/>
  <rect x="8" y="18" width="12" height="5" rx="2.5" fill="#4CAF50" stroke="#1B5E20" stroke-width="0.8"/>
  <rect x="34" y="24" width="6" height="12" rx="3" fill="#43A047" stroke="#1B5E20" stroke-width="1"/>
  <rect x="28" y="24" width="12" height="5" rx="2.5" fill="#4CAF50" stroke="#1B5E20" stroke-width="0.8"/>
  <line x1="24" y1="14" x2="24" y2="42" stroke="#1B5E20" stroke-width="0.4" opacity="0.3"/>
  <circle cx="22" cy="20" r="0.5" fill="#1B5E20" opacity="0.3"/>
  <circle cx="26" cy="28" r="0.5" fill="#1B5E20" opacity="0.3"/>
  <circle cx="22" cy="36" r="0.5" fill="#1B5E20" opacity="0.3"/>
</svg>`;

// --- Wheat (🌾 replacement) ---
const WHEAT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <line x1="18" y1="44" x2="20" y2="16" stroke="#8D6E63" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="24" y1="44" x2="24" y2="12" stroke="#8D6E63" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="30" y1="44" x2="28" y2="18" stroke="#8D6E63" stroke-width="1.5" stroke-linecap="round"/>
  <ellipse cx="20" cy="14" rx="2" ry="4" fill="#FFD54F" stroke="#F9A825" stroke-width="0.5" transform="rotate(-5,20,14)"/>
  <ellipse cx="18" cy="18" rx="1.5" ry="3" fill="#FFC107" stroke="#F9A825" stroke-width="0.4" transform="rotate(-15,18,18)"/>
  <ellipse cx="24" cy="10" rx="2" ry="4.5" fill="#FFD54F" stroke="#F9A825" stroke-width="0.5"/>
  <ellipse cx="22" cy="14" rx="1.5" ry="3" fill="#FFC107" stroke="#F9A825" stroke-width="0.4" transform="rotate(-10,22,14)"/>
  <ellipse cx="26" cy="14" rx="1.5" ry="3" fill="#FFC107" stroke="#F9A825" stroke-width="0.4" transform="rotate(10,26,14)"/>
  <ellipse cx="28" cy="16" rx="2" ry="4" fill="#FFD54F" stroke="#F9A825" stroke-width="0.5" transform="rotate(5,28,16)"/>
  <ellipse cx="30" cy="20" rx="1.5" ry="3" fill="#FFC107" stroke="#F9A825" stroke-width="0.4" transform="rotate(15,30,20)"/>
</svg>`;

// --- Seedling (🌱 replacement) ---
const SEEDLING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="42" rx="5" ry="2" fill="#5D4037" opacity="0.25"/>
  <line x1="24" y1="42" x2="24" y2="30" stroke="#4CAF50" stroke-width="2" stroke-linecap="round"/>
  <path d="M24 32 Q18 28 16 22 Q22 24 24 30Z" fill="#66BB6A" stroke="#2E7D32" stroke-width="0.6"/>
  <path d="M24 34 Q30 30 32 24 Q26 26 24 32Z" fill="#81C784" stroke="#2E7D32" stroke-width="0.6"/>
  <line x1="18" y1="25" x2="24" y2="30" stroke="#43A047" stroke-width="0.5" opacity="0.4"/>
  <line x1="30" y1="27" x2="24" y2="32" stroke="#43A047" stroke-width="0.5" opacity="0.4"/>
</svg>`;

// --- Lucky Clover (🍀 replacement) ---
const CLOVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <line x1="24" y1="30" x2="24" y2="42" stroke="#4CAF50" stroke-width="1.5" stroke-linecap="round"/>
  <ellipse cx="20" cy="24" rx="5" ry="6" fill="#4CAF50" stroke="#2E7D32" stroke-width="0.8"/>
  <ellipse cx="28" cy="24" rx="5" ry="6" fill="#66BB6A" stroke="#2E7D32" stroke-width="0.8"/>
  <ellipse cx="24" cy="18" rx="5" ry="6" fill="#43A047" stroke="#2E7D32" stroke-width="0.8"/>
  <ellipse cx="24" cy="30" rx="5" ry="6" fill="#388E3C" stroke="#2E7D32" stroke-width="0.8"/>
  <circle cx="24" cy="24" r="2" fill="#2E7D32"/>
  <path d="M20 24 L24 24" stroke="#1B5E20" stroke-width="0.5" opacity="0.3"/>
  <path d="M28 24 L24 24" stroke="#1B5E20" stroke-width="0.5" opacity="0.3"/>
  <path d="M24 18 L24 24" stroke="#1B5E20" stroke-width="0.5" opacity="0.3"/>
</svg>`;

// --- Wilted Rose (🥀 replacement) ---
const WILTED_FLOWER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M24 30 Q26 28 28 32 Q30 36 28 42" stroke="#6D4C41" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M24 30 Q20 28 18 24 Q16 20 18 18 Q22 16 24 20 Q26 16 30 18 Q32 20 30 24 Q28 28 24 30Z"
        fill="#AD1457" stroke="#880E4F" stroke-width="0.8" opacity="0.7"/>
  <path d="M22 24 Q24 20 26 24" stroke="#C2185B" stroke-width="0.4" fill="none" opacity="0.4"/>
  <ellipse cx="26" cy="40" rx="4" ry="1.5" fill="#8D6E63" opacity="0.2"/>
</svg>`;

// --- Maple Leaf (🍁 replacement) ---
const MAPLE_LEAF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M24 8 L22 16 L14 14 L18 22 L10 24 L18 28 L14 36 L22 32 L24 42 L26 32 L34 36 L30 28 L38 24 L30 22 L34 14 L26 16 Z"
        fill="#FF6F00" stroke="#E65100" stroke-width="1" stroke-linejoin="round"/>
  <path d="M24 12 L24 38" stroke="#E65100" stroke-width="0.6" opacity="0.3"/>
  <path d="M16 24 L32 24" stroke="#E65100" stroke-width="0.5" opacity="0.25"/>
</svg>`;

// --- Coin (💰 replacement) ---
const COIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <radialGradient id="cog" cx="22" cy="22" r="12" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFD54F"/>
      <stop offset="0.7" stop-color="#FFC107"/>
      <stop offset="1" stop-color="#FF8F00"/>
    </radialGradient>
  </defs>
  <ellipse cx="24" cy="38" rx="6" ry="2" fill="#FF8F00" opacity="0.25"/>
  <circle cx="24" cy="26" r="12" fill="url(#cog)" stroke="#E65100" stroke-width="1.5"/>
  <circle cx="24" cy="26" r="9" fill="none" stroke="#FFB300" stroke-width="0.8" opacity="0.5"/>
  <text x="24" y="31" text-anchor="middle" font-size="14" font-weight="bold" fill="#E65100" opacity="0.6">$</text>
  <ellipse cx="20" cy="22" rx="3" ry="5" fill="#FFF" opacity="0.15"/>
</svg>`;

// --- Key (🔑 replacement) ---
const KEY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="kg1" x1="10" y1="20" x2="40" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFD54F"/>
      <stop offset="1" stop-color="#FF8F00"/>
    </linearGradient>
  </defs>
  <circle cx="14" cy="24" r="8" fill="url(#kg1)" stroke="#E65100" stroke-width="1.5"/>
  <circle cx="14" cy="24" r="4" fill="none" stroke="#E65100" stroke-width="1.2"/>
  <line x1="22" y1="24" x2="40" y2="24" stroke="#FFC107" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="22" y1="24" x2="40" y2="24" stroke="#E65100" stroke-width="1" opacity="0.3"/>
  <line x1="36" y1="24" x2="36" y2="30" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="32" y1="24" x2="32" y2="28" stroke="#FFC107" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="12" cy="22" rx="2" ry="3" fill="#FFF" opacity="0.15"/>
</svg>`;

// --- Crowbar (🛠️ replacement) ---
const CROWBAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="cbg" x1="12" y1="10" x2="36" y2="40" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#90A4AE"/>
      <stop offset="1" stop-color="#546E7A"/>
    </linearGradient>
  </defs>
  <path d="M14 10 L34 38" stroke="url(#cbg)" stroke-width="4" stroke-linecap="round"/>
  <path d="M14 10 Q10 14 8 18" stroke="#78909C" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M34 38 Q38 36 40 34" stroke="#78909C" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M15 11 L33 37" stroke="#B0BEC5" stroke-width="1" opacity="0.3"/>
</svg>`;

// --- Potion (🧪 replacement) ---
const POTION_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="ptg" x1="24" y1="22" x2="24" y2="42" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#CE93D8"/>
      <stop offset="0.5" stop-color="#AB47BC"/>
      <stop offset="1" stop-color="#7B1FA2"/>
    </linearGradient>
  </defs>
  <rect x="20" y="8" width="8" height="6" rx="1" fill="#B0BEC5" stroke="#78909C" stroke-width="1"/>
  <rect x="22" y="6" width="4" height="4" rx="1" fill="#CFD8DC" stroke="#90A4AE" stroke-width="0.8"/>
  <path d="M20 14 L16 24 Q12 32 16 38 Q20 44 24 44 Q28 44 32 38 Q36 32 32 24 L28 14 Z"
        fill="url(#ptg)" stroke="#6A1B9A" stroke-width="1.2"/>
  <path d="M18 28 Q20 26 22 28 Q24 30 26 28 Q28 26 30 28" stroke="#E1BEE7" stroke-width="0.8" fill="none" opacity="0.5"/>
  <ellipse cx="20" cy="32" rx="2" ry="3" fill="#FFF" opacity="0.15"/>
  <circle cx="22" cy="24" r="1" fill="#FFF" opacity="0.3"/>
  <circle cx="26" cy="36" r="0.8" fill="#FFF" opacity="0.2"/>
</svg>`;

// --- Bandage (🩹 replacement) ---
const BANDAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="bdg" x1="8" y1="16" x2="40" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FAFAFA"/>
      <stop offset="1" stop-color="#E0E0E0"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="40" rx="10" ry="2" fill="#BDBDBD" opacity="0.2"/>
  <rect x="8" y="16" width="32" height="18" rx="4" fill="url(#bdg)" stroke="#BDBDBD" stroke-width="1.5"/>
  <rect x="16" y="16" width="16" height="18" rx="1" fill="#EF9A9A" stroke="#E57373" stroke-width="0.8"/>
  <rect x="22" y="20" width="4" height="10" rx="0.5" fill="#FAFAFA" opacity="0.6"/>
  <rect x="18" y="23" width="12" height="4" rx="0.5" fill="#FAFAFA" opacity="0.6"/>
  <circle cx="20" cy="22" r="1" fill="#E57373" opacity="0.5"/>
  <circle cx="28" cy="22" r="1" fill="#E57373" opacity="0.5"/>
  <circle cx="20" cy="28" r="1" fill="#E57373" opacity="0.5"/>
  <circle cx="28" cy="28" r="1" fill="#E57373" opacity="0.5"/>
  <line x1="8" y1="25" x2="16" y2="25" stroke="#E0E0E0" stroke-width="0.5" opacity="0.5"/>
  <line x1="32" y1="25" x2="40" y2="25" stroke="#E0E0E0" stroke-width="0.5" opacity="0.5"/>
</svg>`;

// --- Snack (🍫 replacement) ---
const SNACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="skg" x1="12" y1="10" x2="36" y2="38" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFD54F"/>
      <stop offset="1" stop-color="#FFA726"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="40" rx="8" ry="2" fill="#8D6E63" opacity="0.15"/>
  <rect x="12" y="12" width="24" height="24" rx="3" fill="url(#skg)" stroke="#F9A825" stroke-width="1.2"/>
  <path d="M12 18 L36 18" stroke="#FFA000" stroke-width="0.6" opacity="0.5"/>
  <path d="M12 30 L36 30" stroke="#FFA000" stroke-width="0.6" opacity="0.5"/>
  <rect x="15" y="19" width="18" height="10" rx="2" fill="#8D6E63"/>
  <rect x="16" y="20" width="16" height="8" rx="1.5" fill="#A1887F"/>
  <circle cx="19" cy="23" r="1.2" fill="#D7CCC8"/>
  <circle cx="23" cy="21.5" r="1" fill="#BCAAA4"/>
  <circle cx="27" cy="24" r="1.3" fill="#D7CCC8"/>
  <circle cx="21" cy="26" r="0.9" fill="#BCAAA4"/>
  <circle cx="25" cy="26.5" r="1.1" fill="#D7CCC8"/>
  <circle cx="29" cy="22" r="0.8" fill="#BCAAA4"/>
  <text x="24" y="15.5" text-anchor="middle" font-size="4" font-family="sans-serif" fill="#5D4037" font-weight="bold">SNACK</text>
</svg>`;

// --- Water Flask (🫗 replacement) ---
const WATER_FLASK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="wfg" x1="16" y1="8" x2="32" y2="40" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#B3E5FC"/>
      <stop offset="0.6" stop-color="#4FC3F7"/>
      <stop offset="1" stop-color="#0288D1"/>
    </linearGradient>
    <linearGradient id="wfw" x1="18" y1="24" x2="30" y2="38" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#29B6F6"/>
      <stop offset="1" stop-color="#0277BD"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="42" rx="7" ry="2" fill="#90CAF9" opacity="0.15"/>
  <path d="M18 14 C18 14 16 16 16 22 C16 28 16 34 18 36 C20 38 28 38 30 36 C32 34 32 28 32 22 C32 16 30 14 30 14 Z" fill="url(#wfg)" stroke="#0288D1" stroke-width="1"/>
  <path d="M17 26 Q20 24 24 26 Q28 28 31 26 L31 34 C30 37 28 38 24 38 C20 38 18 37 17 34 Z" fill="url(#wfw)" opacity="0.7"/>
  <rect x="20" y="8" width="8" height="6" rx="1" fill="#B3E5FC" stroke="#0288D1" stroke-width="0.8"/>
  <rect x="21" y="6" width="6" height="3" rx="1" fill="#8D6E63" stroke="#6D4C41" stroke-width="0.5"/>
  <ellipse cx="21" cy="20" rx="1.5" ry="4" fill="white" opacity="0.3" transform="rotate(-10 21 20)"/>
  <path d="M18 12 C14 10 14 6 20 6" stroke="#8D6E63" stroke-width="1" fill="none"/>
  <path d="M30 12 C34 10 34 6 28 6" stroke="#8D6E63" stroke-width="1" fill="none"/>
</svg>`;

// --- Soap (🧼 replacement) ---
const SOAP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="spg" x1="12" y1="14" x2="36" y2="34" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#CE93D8"/>
      <stop offset="1" stop-color="#AB47BC"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="40" rx="9" ry="2" fill="#9C27B0" opacity="0.1"/>
  <rect x="12" y="18" width="24" height="14" rx="5" fill="url(#spg)" stroke="#9C27B0" stroke-width="1"/>
  <rect x="16" y="21" width="16" height="8" rx="2" fill="#E1BEE7" opacity="0.4"/>
  <text x="24" y="27" text-anchor="middle" font-size="5" font-family="sans-serif" fill="#7B1FA2" font-weight="bold">SOAP</text>
  <circle cx="10" cy="16" r="2.5" fill="white" opacity="0.4" stroke="#E1BEE7" stroke-width="0.3"/>
  <circle cx="14" cy="12" r="1.8" fill="white" opacity="0.35" stroke="#E1BEE7" stroke-width="0.3"/>
  <circle cx="8" cy="12" r="1.2" fill="white" opacity="0.3"/>
  <circle cx="36" cy="14" r="2" fill="white" opacity="0.35" stroke="#E1BEE7" stroke-width="0.3"/>
  <circle cx="38" cy="18" r="1.5" fill="white" opacity="0.3"/>
  <ellipse cx="18" cy="22" rx="2" ry="1" fill="white" opacity="0.3" transform="rotate(-15 18 22)"/>
</svg>`;

// --- Torch (🔦 replacement) ---
const TORCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="thg" x1="20" y1="20" x2="28" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#8D6E63"/>
      <stop offset="1" stop-color="#5D4037"/>
    </linearGradient>
    <radialGradient id="tfl" cx="24" cy="6" r="10" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFF176"/>
      <stop offset="0.4" stop-color="#FFB74D"/>
      <stop offset="0.8" stop-color="#FF7043"/>
      <stop offset="1" stop-color="#E64A19" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="24" cy="44" rx="5" ry="1.5" fill="#5D4037" opacity="0.15"/>
  <rect x="21" y="18" width="6" height="24" rx="1.5" fill="url(#thg)" stroke="#4E342E" stroke-width="0.8"/>
  <rect x="19" y="16" width="10" height="6" rx="2" fill="#A1887F" stroke="#6D4C41" stroke-width="0.8"/>
  <path d="M24 2 C28 6 30 10 28 14 C26 18 22 18 20 14 C18 10 20 6 24 2 Z" fill="url(#tfl)" opacity="0.9"/>
  <path d="M24 6 C26 8 27 10 26 13 C25 15 23 15 22 13 C21 10 22 8 24 6 Z" fill="#FFF176" opacity="0.8"/>
  <circle cx="24" cy="10" r="6" fill="#FF9800" opacity="0.15"/>
</svg>`;

// --- Map Scroll (🗺️ replacement) ---
const MAP_SCROLL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="msg" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFF8E1"/>
      <stop offset="1" stop-color="#FFE082"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="42" rx="8" ry="2" fill="#8D6E63" opacity="0.12"/>
  <rect x="12" y="10" width="24" height="28" rx="2" fill="url(#msg)" stroke="#D4A438" stroke-width="1"/>
  <ellipse cx="24" cy="10" rx="13" ry="3" fill="#FFE082" stroke="#D4A438" stroke-width="0.8"/>
  <ellipse cx="24" cy="10" rx="13" ry="2" fill="#FFF8E1"/>
  <ellipse cx="24" cy="38" rx="13" ry="3" fill="#FFE082" stroke="#D4A438" stroke-width="0.8"/>
  <ellipse cx="24" cy="38" rx="13" ry="2" fill="#FFF8E1"/>
  <path d="M16 16 L32 16" stroke="#C9A94E" stroke-width="0.6" opacity="0.5"/>
  <path d="M16 20 L28 20" stroke="#C9A94E" stroke-width="0.6" opacity="0.5"/>
  <path d="M16 24 L30 24" stroke="#C9A94E" stroke-width="0.6" opacity="0.5"/>
  <path d="M16 28 L26 28" stroke="#C9A94E" stroke-width="0.6" opacity="0.5"/>
  <path d="M16 32 L32 32" stroke="#C9A94E" stroke-width="0.6" opacity="0.5"/>
  <circle cx="27" cy="26" r="3" fill="none" stroke="#D32F2F" stroke-width="1" opacity="0.6"/>
  <line x1="25" y1="24" x2="29" y2="28" stroke="#D32F2F" stroke-width="0.8" opacity="0.6"/>
  <line x1="29" y1="24" x2="25" y2="28" stroke="#D32F2F" stroke-width="0.8" opacity="0.6"/>
  <rect x="11" y="22" width="3" height="6" rx="0.5" fill="#D32F2F" stroke="#B71C1C" stroke-width="0.3"/>
</svg>`;

// --- Chest (📦 replacement) ---
const CHEST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="chg" x1="8" y1="20" x2="40" y2="42" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A1887F"/>
      <stop offset="1" stop-color="#6D4C41"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="42" rx="14" ry="2.5" fill="#5D4037" opacity="0.25"/>
  <rect x="8" y="24" width="32" height="16" rx="2" fill="url(#chg)" stroke="#4E342E" stroke-width="1.5"/>
  <path d="M8 24 Q24 18 40 24" fill="#8D6E63" stroke="#4E342E" stroke-width="1.2"/>
  <rect x="22" y="28" width="4" height="6" rx="1" fill="#FFD54F" stroke="#E65100" stroke-width="0.8"/>
  <circle cx="24" cy="31" r="1.2" fill="#E65100"/>
  <line x1="8" y1="32" x2="40" y2="32" stroke="#5D4037" stroke-width="0.8" opacity="0.3"/>
  <line x1="24" y1="18" x2="24" y2="24" stroke="#4E342E" stroke-width="0.8" opacity="0.3"/>
</svg>`;

// --- Sign Post (🪧 replacement) ---
const SIGN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="44" rx="5" ry="1.5" fill="#5D4037" opacity="0.2"/>
  <rect x="22" y="18" width="4" height="26" fill="#8D6E63" stroke="#5D4037" stroke-width="1"/>
  <rect x="8" y="10" width="32" height="14" rx="2" fill="#D7CCC8" stroke="#795548" stroke-width="1.5"/>
  <line x1="12" y1="15" x2="36" y2="15" stroke="#8D6E63" stroke-width="1" opacity="0.4"/>
  <line x1="12" y1="19" x2="30" y2="19" stroke="#8D6E63" stroke-width="0.8" opacity="0.3"/>
  <circle cx="24" cy="8" r="2" fill="#795548" stroke="#5D4037" stroke-width="0.8"/>
</svg>`;

// --- House (🏠 replacement) ---
const HOUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="hrf" x1="24" y1="6" x2="24" y2="24" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#EF5350"/>
      <stop offset="1" stop-color="#C62828"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="44" rx="16" ry="3" fill="#5D4037" opacity="0.2"/>
  <rect x="10" y="22" width="28" height="20" fill="#EFEBE9" stroke="#795548" stroke-width="1.5"/>
  <polygon points="4,24 24,6 44,24" fill="url(#hrf)" stroke="#B71C1C" stroke-width="1.5"/>
  <rect x="14" y="28" width="6" height="6" fill="#81D4FA" stroke="#0288D1" stroke-width="0.8"/>
  <line x1="17" y1="28" x2="17" y2="34" stroke="#0288D1" stroke-width="0.5" opacity="0.5"/>
  <line x1="14" y1="31" x2="20" y2="31" stroke="#0288D1" stroke-width="0.5" opacity="0.5"/>
  <rect x="28" y="28" width="6" height="6" fill="#81D4FA" stroke="#0288D1" stroke-width="0.8"/>
  <line x1="31" y1="28" x2="31" y2="34" stroke="#0288D1" stroke-width="0.5" opacity="0.5"/>
  <line x1="28" y1="31" x2="34" y2="31" stroke="#0288D1" stroke-width="0.5" opacity="0.5"/>
  <rect x="20" y="32" width="8" height="10" rx="1" fill="#8D6E63" stroke="#5D4037" stroke-width="1"/>
  <circle cx="26" cy="37" r="1" fill="#FFD54F"/>
</svg>`;

// --- Hut (🛖 replacement) ---
const HUT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="htf" x1="24" y1="6" x2="24" y2="28" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A1887F"/>
      <stop offset="0.5" stop-color="#8D6E63"/>
      <stop offset="1" stop-color="#6D4C41"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="44" rx="15" ry="2.5" fill="#5D4037" opacity="0.2"/>
  <rect x="12" y="26" width="24" height="16" fill="#D7CCC8" stroke="#795548" stroke-width="1.2"/>
  <polygon points="2,28 24,6 46,28" fill="url(#htf)" stroke="#5D4037" stroke-width="1.5"/>
  <line x1="8" y1="24" x2="24" y2="10" stroke="#795548" stroke-width="0.5" opacity="0.3"/>
  <line x1="40" y1="24" x2="24" y2="10" stroke="#795548" stroke-width="0.5" opacity="0.3"/>
  <rect x="20" y="32" width="8" height="10" rx="1" fill="#6D4C41" stroke="#4E342E" stroke-width="1"/>
  <line x1="24" y1="32" x2="24" y2="42" stroke="#4E342E" stroke-width="0.6" opacity="0.4"/>
  <circle cx="26" cy="37" r="0.8" fill="#A1887F"/>
</svg>`;

// --- Shop (🏪 replacement) ---
const SHOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="srf" x1="4" y1="12" x2="44" y2="12" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FF7043"/>
      <stop offset="0.25" stop-color="#FFF"/>
      <stop offset="0.5" stop-color="#FF7043"/>
      <stop offset="0.75" stop-color="#FFF"/>
      <stop offset="1" stop-color="#FF7043"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="44" rx="16" ry="2.5" fill="#5D4037" opacity="0.2"/>
  <rect x="8" y="18" width="32" height="24" fill="#FFF3E0" stroke="#BF360C" stroke-width="1.2"/>
  <rect x="4" y="12" width="40" height="8" fill="url(#srf)" stroke="#BF360C" stroke-width="1"/>
  <rect x="14" y="24" width="8" height="8" fill="#81D4FA" stroke="#0288D1" stroke-width="0.8"/>
  <rect x="26" y="24" width="8" height="8" fill="#81D4FA" stroke="#0288D1" stroke-width="0.8"/>
  <rect x="20" y="34" width="8" height="8" rx="1" fill="#8D6E63" stroke="#5D4037" stroke-width="1"/>
  <circle cx="26" cy="38" r="0.8" fill="#FFD54F"/>
  <text x="24" y="10" text-anchor="middle" font-size="6" fill="#BF360C" opacity="0.6">SHOP</text>
</svg>`;

// --- Outhouse (🚽 replacement) ---
const OUTHOUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="44" rx="12" ry="2" fill="#5D4037" opacity="0.2"/>
  <rect x="14" y="16" width="20" height="26" fill="#A1887F" stroke="#6D4C41" stroke-width="1.5"/>
  <polygon points="12,18 24,6 36,18" fill="#8D6E63" stroke="#5D4037" stroke-width="1.2"/>
  <rect x="20" y="22" width="8" height="14" rx="1" fill="#795548" stroke="#5D4037" stroke-width="1"/>
  <path d="M22 30 Q24 28 26 30" fill="none" stroke="#6D4C41" stroke-width="0.6" opacity="0.5"/>
  <circle cx="27" cy="29" r="1" fill="#D7CCC8"/>
</svg>`;

// --- Wall (🧱 replacement) ---
const WALL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect x="4" y="8" width="40" height="34" fill="#D7CCC8" stroke="#795548" stroke-width="1.5"/>
  <rect x="4" y="8" width="12" height="8" fill="#BCAAA4" stroke="#8D6E63" stroke-width="0.6"/>
  <rect x="16" y="8" width="16" height="8" fill="#A1887F" stroke="#8D6E63" stroke-width="0.6"/>
  <rect x="32" y="8" width="12" height="8" fill="#BCAAA4" stroke="#8D6E63" stroke-width="0.6"/>
  <rect x="4" y="16" width="16" height="8" fill="#A1887F" stroke="#8D6E63" stroke-width="0.6"/>
  <rect x="20" y="16" width="12" height="8" fill="#BCAAA4" stroke="#8D6E63" stroke-width="0.6"/>
  <rect x="32" y="16" width="12" height="8" fill="#A1887F" stroke="#8D6E63" stroke-width="0.6"/>
  <rect x="4" y="24" width="12" height="8" fill="#BCAAA4" stroke="#8D6E63" stroke-width="0.6"/>
  <rect x="16" y="24" width="16" height="8" fill="#A1887F" stroke="#8D6E63" stroke-width="0.6"/>
  <rect x="32" y="24" width="12" height="8" fill="#BCAAA4" stroke="#8D6E63" stroke-width="0.6"/>
  <rect x="4" y="32" width="16" height="8" fill="#A1887F" stroke="#8D6E63" stroke-width="0.6"/>
  <rect x="20" y="32" width="12" height="8" fill="#BCAAA4" stroke="#8D6E63" stroke-width="0.6"/>
  <rect x="32" y="32" width="12" height="8" fill="#A1887F" stroke="#8D6E63" stroke-width="0.6"/>
</svg>`;

// --- Door Locked (🔒 replacement) ---
const DOOR_LOCKED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect x="12" y="10" width="24" height="34" rx="2" fill="#8D6E63" stroke="#5D4037" stroke-width="1.5"/>
  <rect x="14" y="12" width="20" height="30" rx="1" fill="#A1887F" stroke="#795548" stroke-width="0.8"/>
  <line x1="24" y1="12" x2="24" y2="42" stroke="#795548" stroke-width="0.6" opacity="0.3"/>
  <rect x="18" y="16" width="12" height="10" rx="3" fill="none" stroke="#FFD54F" stroke-width="2"/>
  <rect x="20" y="24" width="8" height="8" rx="1" fill="#FFD54F" stroke="#E65100" stroke-width="1"/>
  <circle cx="24" cy="28" r="1.5" fill="#E65100"/>
  <line x1="24" y1="28" x2="24" y2="31" stroke="#E65100" stroke-width="1.2"/>
</svg>`;

// --- Door Open (🚪 replacement) ---
const DOOR_OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect x="12" y="10" width="24" height="34" rx="2" fill="#424242" stroke="#212121" stroke-width="1"/>
  <rect x="10" y="8" width="20" height="36" rx="2" fill="#A1887F" stroke="#5D4037" stroke-width="1.5" transform="skewY(-3)"/>
  <line x1="20" y1="10" x2="20" y2="42" stroke="#795548" stroke-width="0.5" opacity="0.3"/>
  <circle cx="26" cy="28" r="1.5" fill="#FFD54F" stroke="#E65100" stroke-width="0.6"/>
</svg>`;

// --- Fence (🚧 replacement) ---
const FENCE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect x="4" y="16" width="40" height="4" fill="#D7CCC8" stroke="#8D6E63" stroke-width="1"/>
  <rect x="4" y="30" width="40" height="4" fill="#D7CCC8" stroke="#8D6E63" stroke-width="1"/>
  <rect x="8" y="8" width="4" height="34" fill="#BCAAA4" stroke="#8D6E63" stroke-width="1"/>
  <polygon points="8,8 10,4 12,8" fill="#BCAAA4" stroke="#8D6E63" stroke-width="0.8"/>
  <rect x="22" y="8" width="4" height="34" fill="#BCAAA4" stroke="#8D6E63" stroke-width="1"/>
  <polygon points="22,8 24,4 26,8" fill="#BCAAA4" stroke="#8D6E63" stroke-width="0.8"/>
  <rect x="36" y="8" width="4" height="34" fill="#BCAAA4" stroke="#8D6E63" stroke-width="1"/>
  <polygon points="36,8 38,4 40,8" fill="#BCAAA4" stroke="#8D6E63" stroke-width="0.8"/>
</svg>`;

// --- Quiz Gate (❓ replacement) ---
const QUIZ_GATE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect x="4" y="14" width="4" height="30" fill="#7B1FA2" stroke="#4A148C" stroke-width="1"/>
  <rect x="40" y="14" width="4" height="30" fill="#7B1FA2" stroke="#4A148C" stroke-width="1"/>
  <rect x="4" y="10" width="40" height="8" rx="2" fill="#9C27B0" stroke="#6A1B9A" stroke-width="1.2"/>
  <circle cx="24" cy="28" r="10" fill="#CE93D8" stroke="#7B1FA2" stroke-width="1.5"/>
  <text x="24" y="33" text-anchor="middle" font-size="16" font-weight="bold" fill="#4A148C">?</text>
</svg>`;

// --- Toll Gate (🚧 replacement - different from fence) ---
const TOLL_GATE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect x="4" y="16" width="4" height="28" fill="#F44336" stroke="#B71C1C" stroke-width="1"/>
  <rect x="40" y="16" width="4" height="28" fill="#F44336" stroke="#B71C1C" stroke-width="1"/>
  <rect x="4" y="12" width="40" height="8" rx="1" fill="#FFC107" stroke="#F57F17" stroke-width="1.5"/>
  <rect x="8" y="14" width="6" height="4" fill="#F44336"/>
  <rect x="20" y="14" width="6" height="4" fill="#F44336"/>
  <rect x="34" y="14" width="6" height="4" fill="#F44336"/>
  <circle cx="24" cy="30" r="6" fill="#FFD54F" stroke="#F57F17" stroke-width="1"/>
  <text x="24" y="34" text-anchor="middle" font-size="8" font-weight="bold" fill="#E65100">$</text>
</svg>`;

// --- Barricade (🪵 obstacle replacement) ---
const BARRICADE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect x="6" y="26" width="36" height="6" rx="2" fill="#8D6E63" stroke="#5D4037" stroke-width="1.2" transform="rotate(-15,24,29)"/>
  <rect x="6" y="18" width="36" height="6" rx="2" fill="#A1887F" stroke="#5D4037" stroke-width="1.2" transform="rotate(10,24,21)"/>
  <rect x="6" y="34" width="36" height="5" rx="2" fill="#795548" stroke="#4E342E" stroke-width="1.2" transform="rotate(-5,24,36)"/>
  <rect x="10" y="10" width="5" height="34" rx="2" fill="#BCAAA4" stroke="#795548" stroke-width="1"/>
  <rect x="33" y="10" width="5" height="34" rx="2" fill="#BCAAA4" stroke="#795548" stroke-width="1"/>
</svg>`;

// --- Sparkle (✨ replacement) ---
const SPARKLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M24 8 L26 20 L38 22 L26 24 L24 36 L22 24 L10 22 L22 20 Z" fill="#FFD54F" stroke="#FFC107" stroke-width="0.8"/>
  <path d="M14 12 L15 18 L21 19 L15 20 L14 26 L13 20 L7 19 L13 18 Z" fill="#FFF176" opacity="0.6"/>
  <path d="M36 28 L37 32 L41 33 L37 34 L36 38 L35 34 L31 33 L35 32 Z" fill="#FFF176" opacity="0.5"/>
</svg>`;

// --- Bridge (🌉 replacement) ---
const BRIDGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect x="2" y="20" width="44" height="12" fill="#8D6E63" stroke="#5D4037" stroke-width="1.5"/>
  <line x1="6" y1="20" x2="6" y2="32" stroke="#6D4C41" stroke-width="1.5"/>
  <line x1="14" y1="20" x2="14" y2="32" stroke="#6D4C41" stroke-width="1.5"/>
  <line x1="22" y1="20" x2="22" y2="32" stroke="#6D4C41" stroke-width="1.5"/>
  <line x1="30" y1="20" x2="30" y2="32" stroke="#6D4C41" stroke-width="1.5"/>
  <line x1="38" y1="20" x2="38" y2="32" stroke="#6D4C41" stroke-width="1.5"/>
  <rect x="2" y="18" width="44" height="4" fill="#A1887F" stroke="#5D4037" stroke-width="1"/>
  <rect x="2" y="30" width="44" height="4" fill="#A1887F" stroke="#5D4037" stroke-width="1"/>
  <rect x="0" y="14" width="4" height="22" fill="#BCAAA4" stroke="#795548" stroke-width="1"/>
  <rect x="44" y="14" width="4" height="22" fill="#BCAAA4" stroke="#795548" stroke-width="1"/>
</svg>`;

// --- Tall Plant (🪾 replacement) ---
const TALL_PLANT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <line x1="24" y1="44" x2="24" y2="14" stroke="#4CAF50" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M24 18 Q16 14 12 16 Q18 18 24 24Z" fill="#66BB6A" stroke="#2E7D32" stroke-width="0.6"/>
  <path d="M24 24 Q32 20 36 22 Q30 24 24 30Z" fill="#81C784" stroke="#2E7D32" stroke-width="0.6"/>
  <path d="M24 30 Q16 26 12 28 Q18 30 24 36Z" fill="#66BB6A" stroke="#2E7D32" stroke-width="0.6"/>
  <path d="M24 14 Q20 10 18 8" stroke="#43A047" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M24 14 Q28 10 30 8" stroke="#43A047" stroke-width="1.5" fill="none" stroke-linecap="round"/>
</svg>`;

// ═══════════════════════════════════════════════════════════════

// --- Rock Variants (🪨 replacement, 3 variants) ---
const ROCK_SVGS = [
  // V0: Angular boulder
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="rg0" x1="10" y1="14" x2="40" y2="42" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#BDBDBD"/>
      <stop offset="0.5" stop-color="#9E9E9E"/>
      <stop offset="1" stop-color="#616161"/>
    </linearGradient>
  </defs>
  <polygon points="10,34 16,18 24,14 38,18 42,30 38,40 18,42" fill="url(#rg0)" stroke="#424242" stroke-width="1.5"/>
  <polygon points="16,18 24,14 32,22 22,26" fill="#BDBDBD" opacity="0.3"/>
  <path d="M18 26 L24 30 L20 36 M30 22 L34 28 L32 34" stroke="#424242" stroke-width="0.6" fill="none" opacity="0.35"/>
  <path d="M20 17 L26 15 L30 18" stroke="#E0E0E0" stroke-width="0.7" fill="none" opacity="0.3"/>
</svg>`,

  // V1: Rounded mossy stone
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <radialGradient id="rg1" cx="22" cy="30" r="16" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#B0BEC5"/>
      <stop offset="1" stop-color="#616161"/>
    </radialGradient>
  </defs>
  <ellipse cx="24" cy="32" rx="16" ry="11" fill="url(#rg1)" stroke="#424242" stroke-width="1.5"/>
  <ellipse cx="18" cy="28" rx="5" ry="2.5" fill="#66BB6A" opacity="0.3"/>
  <ellipse cx="30" cy="34" rx="3.5" ry="2" fill="#81C784" opacity="0.25"/>
  <ellipse cx="22" cy="26" rx="7" ry="3" fill="#CFD8DC" opacity="0.15"/>
  <path d="M16 32 L20 28 M28 36 L32 32" stroke="#455A64" stroke-width="0.5" fill="none" opacity="0.3"/>
</svg>`,

  // V2: Stacked rocks
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="rg2" x1="0" y1="16" x2="48" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#CFD8DC"/>
      <stop offset="1" stop-color="#607D8B"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="38" rx="18" ry="9" fill="url(#rg2)" stroke="#37474F" stroke-width="1.5"/>
  <ellipse cx="24" cy="34" rx="16" ry="7" fill="#90A4AE"/>
  <ellipse cx="22" cy="24" rx="10" ry="7" fill="#B0BEC5" stroke="#455A64" stroke-width="1.2"/>
  <ellipse cx="22" cy="22" rx="9" ry="6" fill="#90A4AE"/>
  <path d="M16 36 L20 32 M30 38 L32 34" stroke="#37474F" stroke-width="0.5" fill="none" opacity="0.3"/>
</svg>`,
];

// --- Fire Frames (🔥 replacement, 4 frames for animation) ---
const FIRE_FRAME_SVGS = [
  // Frame 0: Short flame
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <radialGradient id="fg0" cx="24" cy="36" r="14" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFF176"/>
      <stop offset="0.35" stop-color="#FF9800"/>
      <stop offset="0.7" stop-color="#F44336"/>
      <stop offset="1" stop-color="#B71C1C" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="24" cy="42" rx="10" ry="3" fill="#FF6F00" opacity="0.4"/>
  <path d="M18 42 Q14 32 20 24 Q22 20 24 16 Q26 20 28 24 Q34 32 30 42 Z" fill="url(#fg0)"/>
  <path d="M22 40 Q20 34 22 28 Q24 24 26 28 Q28 34 26 40 Z" fill="#FFEB3B" opacity="0.8"/>
  <path d="M23 38 Q23 32 24 28 Q25 32 25 38 Z" fill="#FFF" opacity="0.5"/>
</svg>`,

  // Frame 1: Tall flame, leaning left
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <radialGradient id="fg1" cx="22" cy="34" r="16" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFF176"/>
      <stop offset="0.35" stop-color="#FF9800"/>
      <stop offset="0.7" stop-color="#F44336"/>
      <stop offset="1" stop-color="#B71C1C" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="24" cy="42" rx="10" ry="3" fill="#FF6F00" opacity="0.35"/>
  <path d="M18 42 Q12 30 18 20 Q22 14 22 10 Q26 16 28 22 Q34 32 30 42 Z" fill="url(#fg1)"/>
  <path d="M20 40 Q16 32 20 24 Q22 20 24 24 Q28 32 26 40 Z" fill="#FFEB3B" opacity="0.8"/>
  <path d="M22 38 Q20 30 22 24 Q24 28 24 38 Z" fill="#FFF" opacity="0.5"/>
  <circle cx="18" cy="14" r="1" fill="#FFEB3B" opacity="0.5"/>
</svg>`,

  // Frame 2: Big flame
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <radialGradient id="fg2" cx="24" cy="30" r="20" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFF176"/>
      <stop offset="0.3" stop-color="#FF9800"/>
      <stop offset="0.65" stop-color="#F44336"/>
      <stop offset="1" stop-color="#B71C1C" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="24" cy="42" rx="12" ry="4" fill="#FF6F00" opacity="0.5"/>
  <path d="M16 42 Q10 28 18 16 Q22 10 24 6 Q26 10 30 16 Q38 28 32 42 Z" fill="url(#fg2)"/>
  <path d="M20 40 Q16 30 22 20 Q24 16 26 20 Q30 30 28 40 Z" fill="#FFEB3B" opacity="0.8"/>
  <path d="M22 38 Q22 28 24 22 Q26 28 26 38 Z" fill="#FFF" opacity="0.5"/>
  <circle cx="20" cy="14" r="1.2" fill="#FFEB3B" opacity="0.5"/>
  <circle cx="30" cy="10" r="0.8" fill="#FF9800" opacity="0.4"/>
</svg>`,

  // Frame 3: Medium flame, leaning right
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <radialGradient id="fg3" cx="26" cy="34" r="16" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFF176"/>
      <stop offset="0.35" stop-color="#FF9800"/>
      <stop offset="0.7" stop-color="#F44336"/>
      <stop offset="1" stop-color="#B71C1C" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="24" cy="42" rx="10" ry="3" fill="#FF6F00" opacity="0.35"/>
  <path d="M18 42 Q16 32 22 22 Q24 16 26 12 Q28 18 32 24 Q36 34 30 42 Z" fill="url(#fg3)"/>
  <path d="M22 40 Q20 34 22 26 Q24 20 26 24 Q30 32 28 40 Z" fill="#FFEB3B" opacity="0.8"/>
  <path d="M23 38 Q23 30 24 26 Q26 30 25 38 Z" fill="#FFF" opacity="0.5"/>
  <circle cx="32" cy="16" r="0.9" fill="#FF9800" opacity="0.4"/>
</svg>`,
];

// ─── Phase 3: Animals ────────────────────────────────────────
// Paper-cut style farm animals and wildlife. Simple shapes, bold outlines.

// --- Chicken (🐔 replacement) ---
const CHICKEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="32" rx="10" ry="8" fill="#F5F5F0" stroke="#795548" stroke-width="1.5"/>
  <circle cx="28" cy="24" r="6" fill="#F5F5F0" stroke="#795548" stroke-width="1.5"/>
  <polygon points="34,23 38,22 34,25" fill="#FF9800" stroke="#E65100" stroke-width="0.8"/>
  <circle cx="30" cy="22" r="1.2" fill="#1A1A1A"/>
  <path d="M26 18 Q28 14 30 18" fill="#F44336" stroke="#C62828" stroke-width="0.8"/>
  <path d="M28 28 L26 30" stroke="#795548" stroke-width="1"/>
  <line x1="20" y1="40" x2="18" y2="44" stroke="#FF9800" stroke-width="1.5"/>
  <line x1="24" y1="40" x2="24" y2="44" stroke="#FF9800" stroke-width="1.5"/>
  <path d="M14 32 Q12 28 16 30" fill="#F5F5F0" stroke="#795548" stroke-width="1"/>
</svg>`;

// --- Rooster (🐓 replacement) ---
const ROOSTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="32" rx="10" ry="8" fill="#E8D5B7" stroke="#5D4037" stroke-width="1.5"/>
  <circle cx="28" cy="23" r="6" fill="#E8D5B7" stroke="#5D4037" stroke-width="1.5"/>
  <polygon points="34,22 39,20 34,24" fill="#FF9800" stroke="#E65100" stroke-width="0.8"/>
  <circle cx="30" cy="21" r="1.3" fill="#1A1A1A"/>
  <path d="M25 17 Q27 11 29 13 Q31 11 33 17" fill="#F44336" stroke="#C62828" stroke-width="0.8"/>
  <path d="M28 29 L30 32" stroke="#5D4037" stroke-width="0.8"/>
  <path d="M12 30 Q8 26 14 28" fill="#1B5E20" stroke="#0D3B0E" stroke-width="0.8"/>
  <path d="M13 32 Q9 30 14 30" fill="#2E7D32" stroke="#1B5E20" stroke-width="0.8"/>
  <path d="M14 34 Q10 34 15 32" fill="#43A047" stroke="#2E7D32" stroke-width="0.8"/>
  <line x1="20" y1="40" x2="18" y2="44" stroke="#FF9800" stroke-width="1.5"/>
  <line x1="24" y1="40" x2="24" y2="44" stroke="#FF9800" stroke-width="1.5"/>
</svg>`;

// --- Pig (🐖 replacement) ---
const PIG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="30" rx="14" ry="10" fill="#F8BBD0" stroke="#AD1457" stroke-width="1.5"/>
  <circle cx="30" cy="22" r="8" fill="#F8BBD0" stroke="#AD1457" stroke-width="1.5"/>
  <ellipse cx="32" cy="24" rx="4" ry="3" fill="#F48FB1" stroke="#AD1457" stroke-width="1"/>
  <circle cx="33" cy="23" r="1" fill="#AD1457"/>
  <circle cx="31" cy="23" r="1" fill="#AD1457"/>
  <circle cx="28" cy="19" r="1.5" fill="#1A1A1A"/>
  <circle cx="34" cy="19" r="1.5" fill="#1A1A1A"/>
  <path d="M25 16 Q24 13 26 14" fill="#F8BBD0" stroke="#AD1457" stroke-width="0.8"/>
  <path d="M35 16 Q36 13 34 14" fill="#F8BBD0" stroke="#AD1457" stroke-width="0.8"/>
  <path d="M10 28 Q8 30 10 32" fill="#F8BBD0" stroke="#AD1457" stroke-width="0.8"/>
  <line x1="18" y1="40" x2="16" y2="44" stroke="#AD1457" stroke-width="1.5"/>
  <line x1="22" y1="40" x2="22" y2="44" stroke="#AD1457" stroke-width="1.5"/>
  <line x1="26" y1="40" x2="26" y2="44" stroke="#AD1457" stroke-width="1.5"/>
  <line x1="30" y1="40" x2="32" y2="44" stroke="#AD1457" stroke-width="1.5"/>
</svg>`;

// --- Cow (🐄 replacement) ---
const COW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="28" rx="16" ry="11" fill="#FAFAFA" stroke="#424242" stroke-width="1.5"/>
  <ellipse cx="20" cy="26" rx="5" ry="4" fill="#1A1A1A" opacity="0.7"/>
  <ellipse cx="30" cy="30" rx="4" ry="3" fill="#1A1A1A" opacity="0.7"/>
  <circle cx="32" cy="18" r="7" fill="#FAFAFA" stroke="#424242" stroke-width="1.5"/>
  <ellipse cx="34" cy="22" rx="3.5" ry="2.5" fill="#F8BBD0" stroke="#AD1457" stroke-width="0.8"/>
  <circle cx="30" cy="16" r="1.5" fill="#1A1A1A"/>
  <circle cx="35" cy="16" r="1.5" fill="#1A1A1A"/>
  <path d="M28 12 Q26 8 28 10" fill="#795548" stroke="#4E342E" stroke-width="0.8"/>
  <path d="M36 12 Q38 8 36 10" fill="#795548" stroke="#4E342E" stroke-width="0.8"/>
  <line x1="16" y1="38" x2="14" y2="44" stroke="#424242" stroke-width="2"/>
  <line x1="22" y1="38" x2="22" y2="44" stroke="#424242" stroke-width="2"/>
  <line x1="26" y1="38" x2="26" y2="44" stroke="#424242" stroke-width="2"/>
  <line x1="32" y1="38" x2="34" y2="44" stroke="#424242" stroke-width="2"/>
</svg>`;

// --- Sheep (🐑 replacement) ---
const SHEEP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="28" rx="14" ry="10" fill="#F5F5F5" stroke="#BDBDBD" stroke-width="1"/>
  <circle cx="20" cy="26" r="5" fill="#EEEEEE"/>
  <circle cx="28" cy="26" r="5" fill="#EEEEEE"/>
  <circle cx="24" cy="22" r="4" fill="#EEEEEE"/>
  <circle cx="18" cy="32" r="4" fill="#EEEEEE"/>
  <circle cx="30" cy="32" r="4" fill="#EEEEEE"/>
  <circle cx="32" cy="18" r="6" fill="#3E2723" stroke="#1B0F0A" stroke-width="1.2"/>
  <circle cx="30" cy="16" r="1.3" fill="#FAFAFA"/>
  <circle cx="34" cy="16" r="1.3" fill="#FAFAFA"/>
  <circle cx="30" cy="16" r="0.6" fill="#1A1A1A"/>
  <circle cx="34" cy="16" r="0.6" fill="#1A1A1A"/>
  <line x1="18" y1="38" x2="16" y2="44" stroke="#3E2723" stroke-width="1.5"/>
  <line x1="22" y1="38" x2="22" y2="44" stroke="#3E2723" stroke-width="1.5"/>
  <line x1="26" y1="38" x2="26" y2="44" stroke="#3E2723" stroke-width="1.5"/>
  <line x1="30" y1="38" x2="32" y2="44" stroke="#3E2723" stroke-width="1.5"/>
</svg>`;

// --- Goat (🐐 replacement) ---
const GOAT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="28" rx="13" ry="9" fill="#E0D6C8" stroke="#5D4037" stroke-width="1.5"/>
  <circle cx="30" cy="18" r="7" fill="#E0D6C8" stroke="#5D4037" stroke-width="1.5"/>
  <ellipse cx="32" cy="22" rx="2.5" ry="2" fill="#F5E6D0" stroke="#5D4037" stroke-width="0.8"/>
  <circle cx="28" cy="16" r="1.3" fill="#1A1A1A"/>
  <circle cx="33" cy="16" r="1.3" fill="#1A1A1A"/>
  <path d="M26 12 L24 6" stroke="#795548" stroke-width="2" stroke-linecap="round"/>
  <path d="M34 12 L36 6" stroke="#795548" stroke-width="2" stroke-linecap="round"/>
  <path d="M30 24 Q32 28 30 30" stroke="#E0D6C8" stroke-width="1.5" fill="none"/>
  <line x1="18" y1="36" x2="16" y2="44" stroke="#5D4037" stroke-width="1.5"/>
  <line x1="22" y1="36" x2="22" y2="44" stroke="#5D4037" stroke-width="1.5"/>
  <line x1="26" y1="36" x2="26" y2="44" stroke="#5D4037" stroke-width="1.5"/>
  <line x1="30" y1="36" x2="32" y2="44" stroke="#5D4037" stroke-width="1.5"/>
</svg>`;

// --- Rabbit (🐇 replacement) ---
const RABBIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="34" rx="8" ry="7" fill="#E0D6C8" stroke="#795548" stroke-width="1.2"/>
  <circle cx="24" cy="24" r="6" fill="#E0D6C8" stroke="#795548" stroke-width="1.2"/>
  <path d="M20 18 Q18 6 20 10 Q22 6 22 18" fill="#F5E6D0" stroke="#795548" stroke-width="1"/>
  <path d="M26 18 Q24 6 26 10 Q28 6 28 18" fill="#F5E6D0" stroke="#795548" stroke-width="1"/>
  <ellipse cx="19" cy="8" rx="1.5" ry="4" fill="#F8BBD0" opacity="0.6"/>
  <ellipse cx="27" cy="8" rx="1.5" ry="4" fill="#F8BBD0" opacity="0.6"/>
  <circle cx="22" cy="22" r="1.3" fill="#1A1A1A"/>
  <circle cx="26" cy="22" r="1.3" fill="#1A1A1A"/>
  <ellipse cx="24" cy="25" rx="1.5" ry="1" fill="#F8BBD0"/>
  <circle cx="24" cy="40" r="3" fill="#F5F5F0" stroke="#795548" stroke-width="0.8"/>
</svg>`;

// --- Duck (🦆 replacement) ---
const DUCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="32" rx="12" ry="8" fill="#4CAF50" stroke="#2E7D32" stroke-width="1.5"/>
  <circle cx="30" cy="22" r="7" fill="#4CAF50" stroke="#2E7D32" stroke-width="1.5"/>
  <polygon points="37,22 43,20 37,24" fill="#FF9800" stroke="#E65100" stroke-width="0.8"/>
  <circle cx="32" cy="20" r="1.5" fill="#1A1A1A"/>
  <path d="M28 16 Q30 13 32 16" fill="#4CAF50" stroke="#2E7D32" stroke-width="0.8"/>
  <path d="M14 34 Q10 38 14 36" fill="#4CAF50" stroke="#2E7D32" stroke-width="1"/>
  <line x1="20" y1="40" x2="18" y2="44" stroke="#FF9800" stroke-width="1.5"/>
  <line x1="26" y1="40" x2="26" y2="44" stroke="#FF9800" stroke-width="1.5"/>
</svg>`;

// --- Fox (🦊 replacement) ---
const FOX_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="22" cy="30" rx="13" ry="8" fill="#FF8F00" stroke="#E65100" stroke-width="1.5"/>
  <path d="M10 28 Q6 32 10 34" fill="#F5F5F0" stroke="#E65100" stroke-width="0.8"/>
  <circle cx="30" cy="20" r="8" fill="#FF8F00" stroke="#E65100" stroke-width="1.5"/>
  <polygon points="24,12 22,4 26,14" fill="#FF8F00" stroke="#E65100" stroke-width="0.8"/>
  <polygon points="36,12 38,4 34,14" fill="#FF8F00" stroke="#E65100" stroke-width="0.8"/>
  <path d="M24 14 L22 6" fill="none" stroke="#1A1A1A" stroke-width="0.3"/>
  <path d="M36 14 L38 6" fill="none" stroke="#1A1A1A" stroke-width="0.3"/>
  <path d="M26 24 Q30 28 34 24" fill="#F5F5F0" stroke="#E65100" stroke-width="0.8"/>
  <circle cx="28" cy="18" r="1.5" fill="#1A1A1A"/>
  <circle cx="33" cy="18" r="1.5" fill="#1A1A1A"/>
  <ellipse cx="30" cy="22" rx="1.5" ry="1" fill="#1A1A1A"/>
  <line x1="18" y1="38" x2="16" y2="44" stroke="#E65100" stroke-width="1.5"/>
  <line x1="26" y1="38" x2="26" y2="44" stroke="#E65100" stroke-width="1.5"/>
</svg>`;

// --- Deer (🦌 replacement) ---
const DEER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="22" cy="28" rx="14" ry="9" fill="#A1887F" stroke="#5D4037" stroke-width="1.5"/>
  <ellipse cx="20" cy="26" rx="3" ry="2" fill="#FAFAFA" opacity="0.5"/>
  <circle cx="32" cy="16" r="7" fill="#A1887F" stroke="#5D4037" stroke-width="1.5"/>
  <path d="M28 10 L26 2 L24 6 L22 0" stroke="#795548" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M36 10 L38 2 L40 6 L42 0" stroke="#795548" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <circle cx="30" cy="14" r="1.5" fill="#1A1A1A"/>
  <circle cx="35" cy="14" r="1.5" fill="#1A1A1A"/>
  <ellipse cx="33" cy="19" rx="2" ry="1.2" fill="#5D4037"/>
  <line x1="14" y1="36" x2="12" y2="44" stroke="#5D4037" stroke-width="1.8"/>
  <line x1="20" y1="36" x2="20" y2="44" stroke="#5D4037" stroke-width="1.8"/>
  <line x1="26" y1="36" x2="26" y2="44" stroke="#5D4037" stroke-width="1.8"/>
  <line x1="30" y1="36" x2="32" y2="44" stroke="#5D4037" stroke-width="1.8"/>
</svg>`;

// --- Horse (🐎 replacement) ---
const HORSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="22" cy="26" rx="15" ry="10" fill="#8D6E63" stroke="#4E342E" stroke-width="1.5"/>
  <path d="M32 18 Q36 10 34 8 Q38 10 36 18" fill="#8D6E63" stroke="#4E342E" stroke-width="1.2"/>
  <circle cx="34" cy="14" r="6" fill="#8D6E63" stroke="#4E342E" stroke-width="1.5"/>
  <polygon points="40,14 46,12 40,16" fill="#BCAAA4" stroke="#4E342E" stroke-width="0.8"/>
  <circle cx="36" cy="12" r="1.5" fill="#1A1A1A"/>
  <path d="M32 8 Q30 4 32 6" fill="#4E342E" stroke="#3E2723" stroke-width="0.8"/>
  <path d="M36 8 Q38 4 36 6" fill="#4E342E" stroke="#3E2723" stroke-width="0.8"/>
  <path d="M8 24 Q4 20 8 22 Q6 18 10 22" fill="#4E342E" stroke="#3E2723" stroke-width="0.8"/>
  <line x1="14" y1="36" x2="12" y2="44" stroke="#4E342E" stroke-width="2"/>
  <line x1="20" y1="36" x2="20" y2="44" stroke="#4E342E" stroke-width="2"/>
  <line x1="26" y1="36" x2="26" y2="44" stroke="#4E342E" stroke-width="2"/>
  <line x1="30" y1="36" x2="32" y2="44" stroke="#4E342E" stroke-width="2"/>
</svg>`;

// --- Dog (🐕 replacement) ---
const DOG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="22" cy="30" rx="12" ry="8" fill="#D7A86E" stroke="#8D6031" stroke-width="1.5"/>
  <circle cx="30" cy="20" r="7" fill="#D7A86E" stroke="#8D6031" stroke-width="1.5"/>
  <path d="M24 14 Q20 10 22 16" fill="#C09050" stroke="#8D6031" stroke-width="0.8"/>
  <path d="M36 14 Q40 10 38 16" fill="#C09050" stroke="#8D6031" stroke-width="0.8"/>
  <circle cx="28" cy="18" r="1.5" fill="#1A1A1A"/>
  <circle cx="33" cy="18" r="1.5" fill="#1A1A1A"/>
  <ellipse cx="30" cy="22" rx="2.5" ry="1.8" fill="#5D4037" stroke="#3E2723" stroke-width="0.8"/>
  <circle cx="30" cy="21" r="0.8" fill="#1A1A1A"/>
  <path d="M10 28 Q4 24 8 30 Q4 34 10 32" fill="#D7A86E" stroke="#8D6031" stroke-width="0.8"/>
  <line x1="16" y1="38" x2="14" y2="44" stroke="#8D6031" stroke-width="1.5"/>
  <line x1="22" y1="38" x2="22" y2="44" stroke="#8D6031" stroke-width="1.5"/>
  <line x1="26" y1="38" x2="26" y2="44" stroke="#8D6031" stroke-width="1.5"/>
  <line x1="30" y1="38" x2="32" y2="44" stroke="#8D6031" stroke-width="1.5"/>
</svg>`;

// ─── Asset SVG Registry ──────────────────────────────────────

/** Map asset keys → SVG source strings. Rock variants are separate entries. */
const ASSET_SVG_MAP: Record<string, string> = {
  // Phase 1: Trees & rocks
  tree: TREE_SVG,
  tree_pine: TREE_PINE_SVG,
  tree_palm: TREE_PALM_SVG,
  rock_v0: ROCK_SVGS[0],
  rock_v1: ROCK_SVGS[1],
  rock_v2: ROCK_SVGS[2],
  // Phase 2: Plants
  flower: FLOWER_SVG,
  flower_pink: FLOWER_PINK_SVG,
  flower_red: FLOWER_RED_SVG,
  sunflower: SUNFLOWER_SVG,
  tulip: TULIP_SVG,
  bush: BUSH_SVG,
  mushroom: MUSHROOM_SVG,
  stump: STUMP_SVG,
  cactus: CACTUS_SVG,
  wheat: WHEAT_SVG,
  seedling: SEEDLING_SVG,
  clover: CLOVER_SVG,
  wilted_flower: WILTED_FLOWER_SVG,
  maple_leaf: MAPLE_LEAF_SVG,
  tall_plant: TALL_PLANT_SVG,
  // Phase 2: Collectibles
  coin: COIN_SVG,
  key: KEY_SVG,
  crowbar: CROWBAR_SVG,
  potion: POTION_SVG,
  bandage: BANDAGE_SVG,
  snack: SNACK_SVG,
  water_flask: WATER_FLASK_SVG,
  soap: SOAP_SVG,
  torch: TORCH_SVG,
  map_scroll: MAP_SCROLL_SVG,
  // Phase 2: Structures & interactives
  chest: CHEST_SVG,
  sign: SIGN_SVG,
  house: HOUSE_SVG,
  hut: HUT_SVG,
  shop: SHOP_SVG,
  outhouse: OUTHOUSE_SVG,
  wall: WALL_SVG,
  door_locked: DOOR_LOCKED_SVG,
  door_open: DOOR_OPEN_SVG,
  fence: FENCE_SVG,
  quiz_gate: QUIZ_GATE_SVG,
  toll_gate: TOLL_GATE_SVG,
  barricade: BARRICADE_SVG,
  sparkle: SPARKLE_SVG,
  bridge: BRIDGE_SVG,
  // Phase 3: Animals
  chicken: CHICKEN_SVG,
  rooster: ROOSTER_SVG,
  pig: PIG_SVG,
  cow: COW_SVG,
  sheep: SHEEP_SVG,
  goat: GOAT_SVG,
  rabbit: RABBIT_SVG,
  duck: DUCK_SVG,
  fox: FOX_SVG,
  deer: DEER_SVG,
  horse: HORSE_SVG,
  dog: DOG_SVG,
};

/** Fire asset keys → array of frame SVGs (all fire types share frames). */
const FIRE_SVG_MAP: Record<string, readonly string[]> = {
  bonfire: FIRE_FRAME_SVGS,
  campfire: FIRE_FRAME_SVGS,
  biomass_fire: FIRE_FRAME_SVGS,
};

// Set of all asset keys that have SVG sprites
const SUPPORTED_KEYS = new Set([
  ...Object.keys(ASSET_SVG_MAP),
  ...Object.keys(FIRE_SVG_MAP),
  'rock', // resolved to rock_v0/v1/v2 at lookup time
  // Shop variants share the shop sprite
  'shop_general', 'shop_snack', 'shop_trading',
]);

// ─── Cache Helpers ───────────────────────────────────────────

function cacheKey(assetKey: string, tint: number): string {
  return `${assetKey}|${tint}`;
}

async function renderSvgToCanvas(svg: string, tint: number): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });

  const c = document.createElement('canvas');
  c.width = SPRITE_SIZE;
  c.height = SPRITE_SIZE;
  const ctx = c.getContext('2d')!;

  // Apply biome tint filter (same as emoji-cache)
  if (tint) {
    ctx.filter = `hue-rotate(${tint}deg) brightness(${RENDER_CONFIG.emojiBrightness}) saturate(${RENDER_CONFIG.emojiSaturation})`;
  }
  ctx.drawImage(img, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
  ctx.filter = 'none';

  return c;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Pre-render all SVG asset sprites at init time.
 * Must complete before rendering. Called from main.ts init().
 */
export async function preloadAssetSprites(): Promise<void> {
  const tints = new Set<number>([0]);
  for (const b of BIOME_DEFS) tints.add(b.tintHue);

  const promises: Promise<void>[] = [];

  // Static assets (trees, rock variants) — cache per tint
  for (const [key, svg] of Object.entries(ASSET_SVG_MAP)) {
    for (const tint of tints) {
      promises.push(
        renderSvgToCanvas(svg, tint).then(canvas => {
          cache.set(cacheKey(key, tint), canvas);
        }),
      );
    }
  }

  // Fire frames — stored with frame index, no biome tinting (fire is always warm)
  for (const [key, frames] of Object.entries(FIRE_SVG_MAP)) {
    for (let i = 0; i < frames.length; i++) {
      promises.push(
        renderSvgToCanvas(frames[i], 0).then(canvas => {
          cache.set(`${key}_f${i}`, canvas);
        }),
      );
    }
  }

  await Promise.all(promises);
  // Load any PNG overrides from the asset library config (#189)
  await preloadPngAssets();
  console.log(`[PERF] Asset sprite cache: ${cache.size} entries`);
}

/** Check if an asset key has SVG sprites or a PNG entry configured. */
export function hasAssetSprite(assetKey: string): boolean {
  return SUPPORTED_KEYS.has(assetKey) || hasPngConfig(assetKey);
}

/**
 * Get SVG sprite canvas for a static asset.
 * For rocks, selects variant deterministically by grid position.
 * @returns HTMLCanvasElement or undefined if no SVG sprite exists.
 */
export function getAssetSprite(assetKey: string, tint: number, gx = 0, gy = 0): HTMLCanvasElement | undefined {
  let key = assetKey;
  // Rock: pick variant by position hash
  if (assetKey === 'rock') {
    const rIdx = Math.abs((gx * 73 + gy * 137) % 3);
    key = `rock_v${rIdx}`;
  }
  // Shop variants all use the shop sprite
  if (assetKey === 'shop_general' || assetKey === 'shop_snack' || assetKey === 'shop_trading') {
    key = 'shop';
  }
  // PNG overrides from asset library (#189): PNG wins if loaded, else fall through to SVG
  const png = getPngSprite(key);
  if (png !== undefined) return png ?? undefined; // null → undefined (PNG failed, use SVG)
  return cache.get(cacheKey(key, tint));
}

/**
 * Get fire animation frame canvas.
 * @param assetKey Fire asset key (bonfire, campfire, biomass_fire)
 * @param frameIndex Frame index (will be modulo'd by FIRE_FRAME_COUNT)
 */
export function getFireFrame(assetKey: string, frameIndex: number): HTMLCanvasElement | undefined {
  const fi = ((frameIndex % FIRE_FRAME_COUNT) + FIRE_FRAME_COUNT) % FIRE_FRAME_COUNT;
  return cache.get(`${assetKey}_f${fi}`);
}
