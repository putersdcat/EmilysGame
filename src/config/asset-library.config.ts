/**
 * asset-library.config.ts — PNG asset library mapping (#189).
 *
 * Maps logical sprite IDs (same keys as ASSET_SVG_MAP in asset-sprites.ts)
 * to optional external PNG file paths under public/.
 *
 * Usage:
 *   - Set pngPath to a path relative to public/ (e.g. 'sprites/tree.png')
 *     to use a PNG instead of the inline SVG for that sprite.
 *   - Leave pngPath undefined to keep using the current SVG/emoji fallback.
 *   - fallback controls what the renderer falls back to if the PNG is missing
 *     or fails to load: 'svg' = use inline SVG sprite, 'emoji' = use emoji-cache.
 *
 * All keys must match keys in ASSET_SVG_MAP / FIRE_SVG_MAP or be valid emoji asset keys.
 * TODO: DOC - asset-library.config.ts schema and migration guide
 */

export interface AssetLibraryEntry {
  /** Optional PNG path relative to public/. If undefined, uses fallback. */
  pngPath?: string;
  /** What to render if pngPath is absent or fails to load. */
  fallback: 'svg' | 'emoji';
}

/**
 * Master asset library config.
 * Add entries here as PNG assets become available.
 * Initially empty — all sprites use their existing SVG/emoji fallbacks.
 *
 * Example entry (activate once a PNG exists):
 *   tree: { pngPath: 'sprites/tree.png', fallback: 'svg' },
 */
export const ASSET_LIBRARY: Record<string, AssetLibraryEntry> = {
  // TODO: populate as PNG assets are created and placed in public/sprites/
  // tree:        { pngPath: 'sprites/tree.png',        fallback: 'svg' },
  // tree_pine:   { pngPath: 'sprites/tree_pine.png',   fallback: 'svg' },
  // rock_v0:     { pngPath: 'sprites/rock_v0.png',     fallback: 'svg' },
  // coin:        { pngPath: 'sprites/coin.png',        fallback: 'svg' },
  // chest:       { pngPath: 'sprites/chest.png',       fallback: 'svg' },
};

/** All configured sprite IDs that have a pngPath set. */
export function activePngKeys(): string[] {
  return Object.entries(ASSET_LIBRARY)
    .filter(([, e]) => !!e.pngPath)
    .map(([k]) => k);
}
