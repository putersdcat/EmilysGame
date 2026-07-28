/**
 * iso2-d6-water-family.spec.ts — D.6 water material family port proof (issue #275).
 *
 * Renders all four WaterFamily styles through the main terrain-cache/nano path:
 * clear-river, muddy-creek, deep-pond, and marsh-water.
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT = 'tests/screenshots/iso2-d6-water-family.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('D.6: clear river / muddy creek / deep pond / marsh water styles render (refs #275)', async ({ page }) => {
  await waitForGame(page);

  await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk');

    const waterBase = defs.water;
    if (!waterBase) throw new Error('Missing water asset def');

    const setCell = (x: number, y: number, assetKey: string) => {
      const def = defs[assetKey];
      if (!def) throw new Error(`Missing asset ${assetKey}`);
      chunk.cells[y][x] = {
        assetKey,
        walkable: def.walkable,
        interactable: def.interactable,
      };
    };

    defs.water_clear_river = { ...waterBase, description: 'Clear river test', tileType: 'water_clear_river' };
    defs.water_muddy_creek = { ...waterBase, description: 'Muddy creek test', tileType: 'water_muddy_creek' };
    defs.water_deep_pond = { ...waterBase, description: 'Deep pond test', tileType: 'water_deep_pond' };
    defs.water_marsh_water = { ...waterBase, description: 'Marsh water test', tileType: 'water_marsh_water' };

    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) setCell(x, y, 'grass');
    }

    const cx = 12;
    const rows = [
      { y: 8, key: 'water_clear_river' },
      { y: 10, key: 'water_muddy_creek' },
      { y: 12, key: 'water_deep_pond' },
      { y: 14, key: 'water_marsh_water' },
    ] as const;

    for (const row of rows) {
      for (let x = cx - 4; x <= cx + 4; x++) setCell(x, row.y, row.key);
    }

    state.camera.x = cx;
    state.camera.y = 11;
    state.player.x = cx + 0.5;
    state.player.y = 17.5;
    state.player.sinkDepth = 0;
    state.ui.dialog.active = false;
    state.quiz.active = false;
    state.paused = false;
    debug.invalidateRenderCaches();
  });

  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT, fullPage: false });

  const ok = await page.evaluate(() => {
    const water = (window as any).__gameDebug.iso2WaterMaterials;
    if (!water) return false;
    const styles = water.listWaterStyles();
    const clear = water.svgWater('straight-h', undefined, 4, 8, { style: 'clear-river' });
    const muddy = water.svgWater('straight-h', undefined, 4, 10, { style: 'muddy-creek' });
    const pond = water.svgWater('isolated', undefined, 4, 12, { style: 'deep-pond' });
    const marsh = water.svgWater('straight-h', undefined, 4, 14, { style: 'marsh-water' });
    const muddyStyle = water.waterStyleForTile('muddy-creek', 4, 10, 'straight-h');
    const pondStyle = water.waterStyleForTile('deep-pond', 4, 12, 'isolated');
    return styles.length === 4
      && styles.includes('clear-river')
      && styles.includes('muddy-creek')
      && styles.includes('deep-pond')
      && styles.includes('marsh-water')
      && muddyStyle.id === 'muddy-creek'
      && muddyStyle.channelWidth === 58
      && pondStyle.id === 'deep-pond'
      && pondStyle.channelWidth === 70
      && clear.includes('water-clear-river')
      && muddy.includes('water-muddy-creek')
      && pond.includes('water-deep-pond')
      && marsh.includes('water-marsh-water')
      && clear.includes('viewBox="0 0 144 144"')
      && pond.includes('-pond');
  });

  expect(ok).toBe(true);
});
