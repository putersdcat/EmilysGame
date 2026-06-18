/**
 * iso2-d5-fence-family.spec.ts — D.5 fence style family port proof (issue #275).
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT = 'tests/screenshots/iso2-d5-fence-family.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('D.5: split-rail / picket / wattle fence styles render (refs #275)', async ({ page }) => {
  await waitForGame(page);

  await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk');

    const fenceBase = defs.fence;
    if (!fenceBase) throw new Error('Missing fence asset def');

    const setCell = (x: number, y: number, assetKey: string) => {
      const def = defs[assetKey];
      if (!def) throw new Error(`Missing asset ${assetKey}`);
      chunk.cells[y][x] = {
        assetKey,
        walkable: def.walkable,
        interactable: def.interactable,
      };
    };

    defs.fence_split_rail = {
      ...fenceBase,
      description: 'Split rail test',
      tileType: 'wooden_fence_split_rail',
    };
    defs.fence_picket = {
      ...fenceBase,
      description: 'Picket test',
      tileType: 'wooden_fence_picket',
    };
    defs.fence_wattle = {
      ...fenceBase,
      description: 'Wattle test',
      tileType: 'wooden_fence_wattle',
    };

    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) setCell(x, y, 'grass');
    }

    const cx = 12;
    const rows = [
      { y: 10, key: 'fence_split_rail' },
      { y: 12, key: 'fence_picket' },
      { y: 14, key: 'fence_wattle' },
    ] as const;

    for (const row of rows) {
      for (let x = cx - 5; x <= cx + 5; x++) setCell(x, row.y, row.key);
    }

    state.camera.x = cx;
    state.camera.y = 12;
    state.player.x = cx + 0.5;
    state.player.y = 16.5;
    state.ui.dialog.active = false;
    state.quiz.active = false;
    state.paused = false;
    debug.invalidateRenderCaches();
  });

  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT, fullPage: false });

  const ok = await page.evaluate(() => {
    const mats = (window as any).__gameDebug.iso2FenceMaterials;
    if (!mats) return false;
    const split = mats.SplitRailOak;
    const picket = mats.RoughPicket;
    const wattle = mats.HazelWattle;
    return split.construction === 'split-rail'
      && picket.railCount === 2
      && wattle.construction === 'wattle'
      && split.railThickness === 6
      && wattle.weaveSpacing === 12;
  });

  expect(ok).toBe(true);
});