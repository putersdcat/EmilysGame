/**
 * walkability-policy.ts — Expected walkable defaults for tests / stamp helpers.
 *
 * **Not** a second runtime authority. `isPositionWalkable` / walkability-query
 * never consult this module (cell.walkable only). Used by gen-agreement tests
 * (W4), place-coherence P3 audits, and optional stamp helpers only.
 *
 * **Bridge-over-water exception (product law):** gen stamps `assetKey: 'bridge'`
 * (walkable true) **replacing** the water cell — it does not leave
 * `assetKey: 'water'` with walkable flipped. Policy therefore treats water*
 * as false and bridge* as true independently; the overlay case is "bridge cell
 * where water would have been," not a dual-key cell.
 *
 * @see memories/repo/design-play-stack-first-principles-2026-07-19.md (L4 policy)
 * @see memories/repo/design-place-coherence-epic-2026-07-19.md (P3)
 */

import { ASSET_DEFS } from '../config/assets.config';

/**
 * Place-family keys / prefixes that place-coherence walk matrix covers.
 * Catalogued keys prefer ASSET_DEFS; uncatalogued material variants use
 * {@link MATERIAL_FALLBACKS}.
 */
export const PLACE_WALK_FAMILY_KEYS = [
  'fence',
  'wall',
  'wooden_fence',
  'stone_wall',
  'quiz_gate',
  'door_locked',
  'door_open',
  'door_gate',
  'toll_gate',
  'water',
  'bridge',
] as const;

/**
 * Fallback for assetKeys / tileTypes not present in ASSET_DEFS (material-only
 * variants). Checked only when ASSET_DEFS has no entry so catalog walkable
 * flags (e.g. water_flask collectible) stay authoritative.
 */
const MATERIAL_FALLBACKS: ReadonlyArray<{ test: (key: string) => boolean; walkable: boolean }> = [
  // Water / river material family (tileType strings without ASSET_DEFS entries).
  // water_flask is a collectible in ASSET_DEFS (walkable true) — never match it here.
  {
    test: (k) =>
      k === 'water' ||
      (k.startsWith('water_') && k !== 'water_flask') ||
      k.startsWith('water_clear') ||
      k.startsWith('water_muddy') ||
      k.startsWith('water_deep') ||
      k.startsWith('water_marsh'),
    walkable: false,
  },
  // Bridge decks (including bridge stamped over a former water cell)
  { test: (k) => k === 'bridge' || k.startsWith('bridge_'), walkable: true },
  // Locked / functional barriers (gates stay closed until cell rewrite)
  {
    test: (k) =>
      k === 'quiz_gate' ||
      k === 'door_locked' ||
      k === 'door_gate' ||
      k === 'toll_gate',
    walkable: false,
  },
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
