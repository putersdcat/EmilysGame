/**
 * asset-sprites.ts — SVG object sprites for trees, rocks, fire.
 * Issue #115 Phase 1: Replaces emoji rendering with custom SVG artwork.
 *
 * Pre-renders SVG artwork to offscreen canvases at init time.
 * Provides fast sync lookups for the render loop (zero alloc in hot path).
 * Falls back gracefully: if no sprite exists, render.ts uses emoji.
 * TODO: DOC - asset sprite pipeline, SVG design specs, cache strategy
 */

import { BIOME_DEFS } from './config/biomes.config';
import { RENDER_CONFIG } from './config/game.config';

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

// ─── Asset SVG Registry ──────────────────────────────────────

/** Map asset keys → SVG source strings. Rock variants are separate entries. */
const ASSET_SVG_MAP: Record<string, string> = {
  tree: TREE_SVG,
  tree_pine: TREE_PINE_SVG,
  tree_palm: TREE_PALM_SVG,
  rock_v0: ROCK_SVGS[0],
  rock_v1: ROCK_SVGS[1],
  rock_v2: ROCK_SVGS[2],
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
  console.log(`[PERF] Asset sprite cache: ${cache.size} entries`);
}

/** Check if an asset key has SVG sprites available. */
export function hasAssetSprite(assetKey: string): boolean {
  return SUPPORTED_KEYS.has(assetKey);
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
