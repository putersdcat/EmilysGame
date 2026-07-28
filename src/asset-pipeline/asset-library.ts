/**
 * asset-library.ts — PNG asset loader for the configurable sprite library (#189).
 *
 * Loads external PNG assets defined in ASSET_LIBRARY config at init time.
 * Returns HTMLCanvasElement for fast same-size blitting in the render loop.
 * Returns null if a PNG is absent or fails → caller falls back to SVG/emoji.
 *
 * Zero allocations in hot path: all loads happen at init, results cached by key.
 * TODO: DOC - asset-library.ts PNG loader API, cache strategy, tint support
 */

import { ASSET_LIBRARY, activePngKeys } from '../config/asset-library.config';

const SPRITE_SIZE = 48; // must match asset-sprites.ts SPRITE_SIZE

/**
 * PNG sprite cache.
 *  undefined  = not yet attempted (or key unknown)
 *  null       = load attempted, PNG missing or failed → use fallback
 *  canvas     = loaded OK, use this
 */
const pngCache = new Map<string, HTMLCanvasElement | null>();

/**
 * Load a single PNG sprite into an offscreen canvas sized to SPRITE_SIZE.
 * @param key  - logical sprite ID (e.g. 'tree', 'rock_v0')
 * @param path - path relative to public/ (e.g. 'sprites/tree.png')
 * @returns HTMLCanvasElement on success, null on failure (do not throw)
 */
async function loadPng(key: string, path: string): Promise<void> {
  try {
    // HEAD check first avoids parsing an error page as an image
    const head = await fetch(`./${path}`, { method: 'HEAD' });
    if (!head.ok) {
      pngCache.set(key, null);
      return;
    }

    const img = new Image();
    img.src = `./${path}`;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error(`PNG load failed: ${path}`));
    });

    const c = document.createElement('canvas');
    c.width = SPRITE_SIZE;
    c.height = SPRITE_SIZE;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
    pngCache.set(key, c);
  } catch {
    // Silent failure: missing PNGs fall back to SVG/emoji.
    pngCache.set(key, null);
  }
}

/**
 * Preload all active PNG assets defined in ASSET_LIBRARY.
 * Call once at game init (alongside preloadAssetSprites).
 * Safe to call even if no PNGs are configured (no-op).
 */
export async function preloadPngAssets(): Promise<void> {
  const keys = activePngKeys();
  if (keys.length === 0) return;

  await Promise.all(
    keys.map(k => {
      const entry = ASSET_LIBRARY[k];
      return entry?.pngPath ? loadPng(k, entry.pngPath) : Promise.resolve();
    }),
  );

  const loaded = [...pngCache.values()].filter(v => v !== null).length;
  console.log(`[AssetLibrary] PNG sprites: ${loaded}/${keys.length} loaded`);
}

/**
 * Synchronous cache lookup — call only after preloadPngAssets() has resolved.
 * @returns HTMLCanvasElement if PNG loaded, null if load failed, undefined if not in config.
 */
export function getPngSprite(key: string): HTMLCanvasElement | null | undefined {
  if (!ASSET_LIBRARY[key]?.pngPath) return undefined; // not configured
  return pngCache.get(key); // HTMLCanvasElement | null | undefined
}

/**
 * Returns true if the key has a PNG configured (regardless of load status).
 * Useful for hasAssetSprite() to broaden the supported set.
 */
export function hasPngConfig(key: string): boolean {
  return !!ASSET_LIBRARY[key]?.pngPath;
}

/**
 * Expose raw SPRITE_SIZE so callers don't need to import game config directly.
 * @internal
 */
export { SPRITE_SIZE as PNG_SPRITE_SIZE };
