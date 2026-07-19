/**
 * walkability-policy.ts — Expected walkable defaults for tests / stamp helpers.
 *
 * **Not** a second runtime authority. `isPositionWalkable` never consults this
 * module. Used by gen-agreement tests (W4) and optional stamp helpers only.
 *
 * @see memories/repo/design-play-stack-first-principles-2026-07-19.md (L4 policy)
 */

import { ASSET_DEFS } from '../config/assets.config';

/**
 * Fallback for assetKeys / tileTypes not present in ASSET_DEFS (material-only
 * variants). Checked only when ASSET_DEFS has no entry so catalog walkable
 * flags (e.g. water_flask collectible) stay authoritative.
 */
const MATERIAL_FALLBACKS: ReadonlyArray<{ test: (key: string) => boolean; walkable: boolean }> = [
  // Water / river material family (tileType strings without ASSET_DEFS entries)
  {
    test: (k) =>
      k === 'water' ||
      k.startsWith('water_clear') ||
      k.startsWith('water_muddy') ||
      k.startsWith('water_deep') ||
      k.startsWith('water_marsh'),
    walkable: false,
  },
  // Bridge decks
  { test: (k) => k === 'bridge' || k.startsWith('bridge_'), walkable: true },
  // Locked barriers
  { test: (k) => k === 'quiz_gate' || k === 'door_locked' || k === 'door_gate', walkable: false },
  { test: (k) => k === 'door_open', walkable: true },
  // Structural solids (full-tile product law)
  {
    test: (k) =>
      k === 'wall' ||
      k === 'fence' ||
      k.startsWith('stone_wall') ||
      k.startsWith('homestead_wall') ||
      k.startsWith('wooden_fence') ||
      k === 'barricade' ||
      k === 'cathedral_wall' ||
      k === 'starter_homestead_wall_plaster',
    walkable: false,
  },
];

/**
 * Default expected walkable for a freshly stamped assetKey from ASSET_DEFS
 * (+ material-only fallbacks when the key is not catalogued).
 *
 * Prefer ASSET_DEFS when present so collectibles (water_flask) and interactive
 * props keep their catalog flags. Material tileTypes without defs use product
 * law: water* false, bridge* true, walls/fences false, locked gates false.
 */
export function expectedWalkableDefault(assetKey: string): boolean {
  const def = ASSET_DEFS[assetKey];
  if (def) return def.walkable;

  for (const rule of MATERIAL_FALLBACKS) {
    if (rule.test(assetKey)) return rule.walkable;
  }
  // Unknown uncatalogued keys: open-terrain bias (tests should register keys they care about)
  return true;
}
