/**
 * iso2-b-asset-nano-kind-completeness.spec.ts — paint-path nano completeness.
 *
 * PR3 (Walkability SSOT): gameplay collision is cell.walkable only
 * (`walkability-query.ts`). Nano kind mapping is a **paint** concern —
 * `hasNanoRenderer` / getNanoStack for visuals. Walk assertions live in
 * `tests/core/walkability-ssot.spec.ts` and cell.walkable / policy tests.
 *
 * Retargeted from the old assetToNanoKind → isPointWalkableInTile collision
 * path (removed from mechanics.ts). Full-tile structural solids are product
 * law; no "narrow arm" walk expectations.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

// Structural material variants that must paint via nano renderers.
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

test('structural material tileTypes have nano paint renderers', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async (tileTypes: string[]) => {
    const { hasNanoRenderer } = await import('/rendering/nano-tile-defs.ts');
    return tileTypes.map((t) => ({
      tileType: t,
      hasRenderer: hasNanoRenderer(t),
    }));
  }, SAFE_STRUCTURAL_TILE_TYPES);

  for (const row of result) {
    expect(row.hasRenderer, `${row.tileType} should have a nano renderer (paint completeness)`).toBe(true);
  }
});

test('solid wall cell blocks footprint via cell.walkable SSOT (full-tile)', async ({ page }) => {
  await waitForGame(page);

  // Functional-first: structural walls block the full tile so collision
  // matches "this cell is solid". Gameplay path is cell SSOT (PR3), not nano.
  const result = await page.evaluate(async () => {
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
    // Material-only tileType without ASSET_DEFS — stamp walkable:false per policy
    const { expectedWalkableDefault } = await import('/engine/walkability-policy.ts');
    const wallKey = 'stone_wall_red_clinker';
    setCell(11, 12, wallKey, expectedWalkableDefault(wallKey));
    debug.invalidateRenderCaches();

    return {
      edgeReach: debug.isFootprintWalkable(10.9, 12.5) as boolean,
      farGrass: debug.isFootprintWalkable(5.5, 5.5) as boolean,
      policyWalkable: expectedWalkableDefault(wallKey),
      cellWalkable: chunk.cells[12][11].walkable as boolean,
    };
  });

  expect(result.farGrass, 'control: plain grass far from the wall must be walkable').toBe(true);
  expect(result.policyWalkable, 'policy default for solid wall material is non-walkable').toBe(false);
  expect(result.cellWalkable).toBe(false);
  expect(result.edgeReach, 'a corner reaching into a solid wall cell must be blocked (full-tile cell SSOT)').toBe(false);
});
