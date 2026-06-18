/**
 * iso2-d4-roof-materials.spec.ts — D.4 roof material port proof (issue #275).
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT = 'tests/screenshots/iso2-d4-roof-materials.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('D.4: thatch roof slope-left / slope-right / ridge materials render (refs #275)', async ({ page }) => {
  await waitForGame(page);

  await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk');

    const wallBase = defs.wall;
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

    defs.roof_slope_left = { ...wallBase, description: 'Roof slope left', tileType: 'roof_thatch_slope_left' };
    defs.roof_slope_right = { ...wallBase, description: 'Roof slope right', tileType: 'roof_thatch_slope_right' };
    defs.roof_ridge = { ...wallBase, description: 'Roof ridge', tileType: 'roof_thatch_ridge' };

    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) setCell(x, y, 'grass');
    }

    const cx = 12;
    const rows = [
      { y: 10, key: 'roof_slope_left' },
      { y: 12, key: 'roof_slope_right' },
      { y: 14, key: 'roof_ridge' },
    ] as const;

    for (const row of rows) {
      for (let x = cx - 3; x <= cx + 3; x++) setCell(x, row.y, row.key);
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
    const roof = (window as any).__gameDebug.iso2RoofMaterials?.ThatchRoof;
    if (!roof) return false;
    const left = roof.svgSlopeLeft();
    const right = roof.svgSlopeRight();
    const ridge = roof.svgRidge();
    const gable = roof.svgGable();
    return left.includes('144') && right.includes('144') && ridge.includes('144')
      && left.includes('#a98a38') && gable.includes('#ded0b1');
  });

  expect(ok).toBe(true);
});