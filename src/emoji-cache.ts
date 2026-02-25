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

// Color emoji font stack — explicitly requests color fonts before fallbacks.
// 'bold' weight is intentionally excluded: color emoji fonts don't have a bold variant
// and using bold forces Chrome on Linux to fall back to monochrome outline rendering.
const EMOJI_FONT_STACK = `'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;

function renderOne(emoji: string, tint: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SPRITE_SIZE;
  c.height = SPRITE_SIZE;
  const ctx = c.getContext('2d')!;

  const hue = tint ? `hue-rotate(${tint}deg) ` : '';
  const filterStr = `${hue}brightness(${RENDER_CONFIG.emojiBrightness}) saturate(${RENDER_CONFIG.emojiSaturation})`;
  const needsFilter = !!(tint || RENDER_CONFIG.emojiBrightness !== 1 || RENDER_CONFIG.emojiSaturation !== 1);

  if (needsFilter) {
    // IMPORTANT: On Linux Chrome (inc. Tesla browser), applying ctx.filter before fillText
    // causes color emoji fonts to fall back to monochrome/outline rendering.
    // Workaround: render emoji to a temp canvas without filter, then composite with filter
    // via drawImage — drawImage + filter works correctly on all platforms.
    const tmp = document.createElement('canvas');
    tmp.width = SPRITE_SIZE;
    tmp.height = SPRITE_SIZE;
    const tctx = tmp.getContext('2d')!;
    tctx.font = `${RENDER_CONFIG.emojiSize}px ${EMOJI_FONT_STACK}`;
    tctx.textAlign = 'center';
    tctx.textBaseline = 'middle';
    tctx.fillText(emoji, SPRITE_SIZE / 2, SPRITE_SIZE / 2);
    ctx.filter = filterStr;
    ctx.drawImage(tmp, 0, 0);
    ctx.filter = 'none';
  } else {
    ctx.font = `${RENDER_CONFIG.emojiSize}px ${EMOJI_FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, SPRITE_SIZE / 2, SPRITE_SIZE / 2);
  }

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
