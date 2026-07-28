/**
 * iso2-d10-roof-geometry.spec.ts — sloped roof nano geometry proof (issue #275).
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT = 'tests/screenshots/iso2-d10-roof-geometry.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('D.10: thatch roofs render as sloped geometry, not billboards (refs #275)', async ({ page }) => {
  await waitForGame(page);

  await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk');

    const wallBase = defs.wall;
    if (!wallBase) throw new Error('Missing wall asset def');

    defs.roof_slope_left = { ...wallBase, description: 'D10 roof slope left', tileType: 'roof_thatch_slope_left' };
    defs.roof_slope_right = { ...wallBase, description: 'D10 roof slope right', tileType: 'roof_thatch_slope_right' };
    defs.roof_ridge = { ...wallBase, description: 'D10 roof ridge', tileType: 'roof_thatch_ridge' };

    const setCell = (x: number, y: number, assetKey: string) => {
      const def = defs[assetKey];
      if (!def) throw new Error(`Missing asset ${assetKey}`);
      chunk.cells[y][x] = {
        assetKey,
        walkable: def.walkable,
        interactable: def.interactable,
      };
    };

    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) setCell(x, y, 'grass');
    }

    const cx = 12;
    const rows = [
      { y: 9, key: 'roof_slope_left' },
      { y: 12, key: 'roof_slope_right' },
      { y: 15, key: 'roof_ridge' },
    ] as const;

    for (const row of rows) {
      for (let x = cx - 3; x <= cx + 3; x++) setCell(x, row.y, row.key);
    }

    state.camera.x = cx;
    state.camera.y = 12;
    state.player.x = cx + 0.5;
    state.player.y = 18.5;
    state.player.sinkDepth = 0;
    state.ui.dialog.active = false;
    state.quiz.active = false;
    state.paused = false;
    debug.invalidateRenderCaches();
  });

  await page.waitForTimeout(650);
  await page.screenshot({ path: SHOT, fullPage: false });

  const ok = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const left = debug.getNanoStackForTests?.('roof_thatch_slope_left')?.[0];
    const right = debug.getNanoStackForTests?.('roof_thatch_slope_right')?.[0];
    const ridge = debug.getNanoStackForTests?.('roof_thatch_ridge')?.[0];
    return left?.kind === 'roof-slope-left'
      && right?.kind === 'roof-slope-right'
      && ridge?.kind === 'roof-ridge'
      && left.sideTextureSvg?.includes('#ded0b1')
      && right.sideTextureSvg?.includes('#ded0b1')
      && left.svg.includes('#a98a38')
      && ridge.svg.includes('#80652d');
  });

  expect(ok).toBe(true);
});
