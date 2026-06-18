/**
 * iso2-d3-homestead-materials.spec.ts — D.3 homestead material port proof (issue #275).
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT = 'tests/screenshots/iso2-d3-homestead-materials.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('D.3: plaster / plank / cottage-foundation materials render (refs #275)', async ({ page }) => {
  await waitForGame(page);

  await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk');

    const wallBase = defs.wall;
    const hutBase = defs.hut ?? defs.house ?? wallBase;
    if (!wallBase) throw new Error('Missing wall asset def');

    const setCell = (x: number, y: number, assetKey: string) => {
      const def = defs[assetKey];
      if (!def) throw new Error(`Missing asset ${assetKey}`);
      chunk.cells[y][x] = {
        assetKey,
        walkable: def.walkable,
        interactable: def.interactable,
      };
    };

    defs.wall_plaster = { ...hutBase, description: 'Plaster test', tileType: 'homestead_wall_plaster' };
    defs.wall_planks = { ...hutBase, description: 'Plank test', tileType: 'homestead_wall_planks' };
    defs.wall_foundation = { ...wallBase, description: 'Foundation test', tileType: 'stone_wall_cottage_foundation' };

    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) setCell(x, y, 'grass');
    }

    const cx = 12;
    const rows = [
      { y: 10, key: 'wall_plaster' },
      { y: 12, key: 'wall_planks' },
      { y: 14, key: 'wall_foundation' },
    ] as const;

    for (const row of rows) {
      for (let x = cx - 4; x <= cx + 4; x++) setCell(x, row.y, row.key);
    }

    state.camera.x = cx;
    state.camera.y = 12;
    state.player.x = cx + 0.5;
    state.player.y = 15.5;
    state.ui.dialog.active = false;
    state.quiz.active = false;
    state.paused = false;
    debug.invalidateRenderCaches();
  });

  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT, fullPage: false });

  const ok = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const homestead = debug.iso2HomesteadMaterials;
    const stone = debug.iso2StoneMaterials;
    if (!homestead || !stone) return false;
    const plaster = homestead.PlasterWhitewashWall.svg();
    const planks = homestead.RoughWoodPlankWall.svg();
    const foundation = stone.CottageStoneFoundation.svg();
    return plaster.includes('144') && planks.includes('144') && foundation.includes('polygon');
  });

  expect(ok).toBe(true);
});