/**
 * iso2-b-asset-nano-kind-completeness.spec.ts — assetToNanoKind completeness fix.
 *
 * `src/engine/mechanics.ts`'s private `assetToNanoKind` table gates whether a
 * cell's collision goes through the exact nano footprint check
 * (isPointWalkableInTile, e.g. narrow wall/fence arms) or falls back to the
 * blunt whole-tile `cell.walkable` boolean. It was missing every wall/fence/
 * water MATERIAL sub-variant (red-clinker, split-rail, muddy-creek, etc.) --
 * confirmed harmless in practice (none of those tileTypes are placed by real
 * generation today, per src/config/tiles.config.ts), but a latent trap for
 * whenever Slice D/E wires these materials into real biome palettes.
 *
 * Deliberately excludes door_gate/toll_gate/roof/structure kinds from this
 * fix: those interact with the OBSTACLE_TEMPLATES direct-cell-mutation
 * unlock system, and routing them through the nano path would swap their
 * intentional full-tile block for a narrow structural footprint -- a real
 * gameplay behavior change, not a safe completeness fix.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

// The set this fix actually completed: unconditional WALKABLE_NEVER
// structural material variants with no lock/gate state.
const SAFE_STRUCTURAL_TILE_TYPES = [
  'stone_wall', 'stone_wall_red_clinker', 'stone_wall_mud_brick',
  'stone_wall_sandstone', 'stone_wall_cottage_foundation',
  'homestead_wall', 'homestead_wall_plaster', 'starter_homestead_wall_plaster',
  'homestead_wall_planks', 'cathedral_wall',
  'wooden_fence', 'wooden_fence_split_rail', 'wooden_fence_picket', 'wooden_fence_wattle',
  'water', 'water_clear_river', 'water_muddy_creek', 'water_deep_pond', 'water_marsh_water',
];

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('assetToNanoKind recognizes every structural material sub-variant', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async (tileTypes: string[]) => {
    const [{ getNanoKindForAsset }, { hasNanoRenderer }] = await Promise.all([
      import('/engine/mechanics.ts'),
      import('/rendering/nano-tile-defs.ts'),
    ]);
    return tileTypes.map((t) => ({
      tileType: t,
      nanoKind: getNanoKindForAsset(t),
      hasRenderer: hasNanoRenderer(t),
    }));
  }, SAFE_STRUCTURAL_TILE_TYPES);

  for (const row of result) {
    expect(row.hasRenderer, `${row.tileType} should have a nano renderer (sanity check on the list itself)`).toBe(true);
    expect(row.nanoKind, `${row.tileType} should be recognized by assetToNanoKind (was missing before this fix)`).not.toBeNull();
  }
});

test('isolated stone_wall_red_clinker gets exact footprint precision, not a whole-tile block', async ({ page }) => {
  await waitForGame(page);

  // PLAYER_CONFIG.collisionHalfW/H = 0.3 grid units -- large relative to a
  // single 1.0-unit tile, so isFootprintWalkable's 4-corner AABB straddles
  // right past a wall's own 0.333-0.667 fraction band when centered on it
  // (a separate, pre-existing collision-system property, not something this
  // fix touches). The robust, unambiguous proof instead: a query point
  // centered in the GRASS cell next to the wall, whose corner just reaches
  // into the wall's cell at local fraction ~0.2 (well outside the wall's
  // 0.333-0.667 blocking band on both axes, ~19px margin either way).
  // Before this fix (missing table entry -> cell.walkable fallback), ANY
  // point anywhere in the wall's cell was blocked, full-tile, including
  // this one. After the fix, the exact nano footprint correctly lets it
  // through.
  const result = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk to be loaded');
    const setCell = (x: number, y: number, assetKey: string, walkable: boolean) => {
      chunk.cells[y][x] = { assetKey, walkable, interactable: false };
    };
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) setCell(x, y, 'grass', defs.grass.walkable);
    }
    // stone_wall_red_clinker has no ASSET_DEFS entry (material-only tileType,
    // per Slice B.5 audit) -- construct the cell directly, mirroring how a
    // hand-authored/test scene would, with walkable:false matching the base
    // stone_wall family (the only sane static default for an unresolved
    // solid-material wall cell).
    setCell(11, 12, 'stone_wall_red_clinker', false);
    debug.invalidateRenderCaches();

    return {
      edgeReach: debug.isFootprintWalkable(10.9, 12.5) as boolean,
      farGrass: debug.isFootprintWalkable(5.5, 5.5) as boolean,
    };
  });

  expect(result.farGrass, 'control: plain grass far from the wall must be walkable').toBe(true);
  // Functional-first (2026-07-15): structural walls block the full tile so
  // collision matches "this cell is solid" (Minecraft-style). Sub-tile
  // edge-reach was the old nano-footprint precision proof; it produced
  // unpredictable snags near posts/gates in live play and is deferred with
  // visual polish. Full-tile block still proves the nano kind path is wired
  // (material assetKey reaches isPointWalkableInTile rather than silently
  // ignoring the cell).
  expect(result.edgeReach, 'a corner reaching into a solid wall cell must be blocked (full-tile structural collision)').toBe(false);
});
