/**
 * emoji-cache.ts - Pre-renders emojis to offscreen canvases at init.
 * Eliminates expensive per-frame ctx.filter + ctx.fillText calls.
 * Each emoji+tint combo is rendered once and cached as a small canvas.
 * TODO: DOC - emoji sprite cache system
 */

import { ASSET_DEFS } from './config/assets.config';
import { BIOME_DEFS } from './config/biomes.config';
import { RENDER_CONFIG } from './config/game.config';

const cache = new Map<string, HTMLCanvasElement>();
const SPRITE_SIZE = 48; // px - matches render scale expectations

function key(emoji: string, tint: number): string {
  return `${emoji}|${tint}`;
}

function renderOne(emoji: string, tint: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SPRITE_SIZE;
  c.height = SPRITE_SIZE;
  const ctx = c.getContext('2d')!;

  // Apply biome tint filter (expensive) only once at cache time
  const hue = tint ? `hue-rotate(${tint}deg) ` : '';
  ctx.filter = `${hue}brightness(${RENDER_CONFIG.emojiBrightness}) saturate(${RENDER_CONFIG.emojiSaturation})`;
  ctx.font = `bold ${RENDER_CONFIG.emojiSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, SPRITE_SIZE / 2, SPRITE_SIZE / 2);
  ctx.filter = 'none';

  return c;
}

/** Pre-render all known emoji×tint combinations. Call once at init. */
export function preloadEmojiSprites(): void {
  const emojis = new Set<string>();
  for (const def of Object.values(ASSET_DEFS)) {
    emojis.add(def.emoji);
  }

  const tints = new Set<number>([0]);
  for (const b of BIOME_DEFS) tints.add(b.tintHue);

  for (const emoji of emojis) {
    for (const tint of tints) {
      cache.set(key(emoji, tint), renderOne(emoji, tint));
    }
  }

  console.log(`[PERF] Emoji sprite cache: ${cache.size} entries`);
}

/** Get pre-rendered emoji canvas. Creates on demand if missing. */
export function getEmojiSprite(emoji: string, tint: number): HTMLCanvasElement {
  const k = key(emoji, tint);
  let sprite = cache.get(k);
  if (!sprite) {
    sprite = renderOne(emoji, tint);
    cache.set(k, sprite);
  }
  return sprite;
}
