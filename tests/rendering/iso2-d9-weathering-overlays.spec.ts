/**
 * iso2-d9-weathering-overlays.spec.ts — render-time snow/mud/moss/cracks proof.
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT = 'tests/screenshots/iso2-d9-weathering-overlays.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('D.9: weathering overlays apply to actual wall faces (refs #275)', async ({ page }) => {
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

    defs.weather_stone = { ...wallBase, description: 'Weathered stone proof', tileType: 'stone_wall' };
    defs.weather_homestead = { ...hutBase, description: 'Weathered homestead proof', tileType: 'homestead_wall_plaster' };
    defs.weather_cathedral = { ...wallBase, description: 'Weathered cathedral proof', tileType: 'cathedral_wall' };

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
      { y: 9, key: 'weather_stone' },
      { y: 12, key: 'weather_homestead' },
      { y: 15, key: 'weather_cathedral' },
    ] as const;

    for (const row of rows) {
      for (let x = cx - 3; x <= cx + 3; x++) setCell(x, row.y, row.key);
    }

    debug.setTimeOfDay?.(0.82);
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

  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOT, fullPage: false });

  const ok = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const stack = debug.getNanoStackForTests?.('stone_wall', 'straight-h');
    const overlays = stack?.[0]?.weatheringOverlays;
    const lighting = debug.getCurrentLighting?.();
    return Array.isArray(overlays)
      && overlays.some((o: any) => o.kind === 'mud' && o.yRange?.[0] >= 0.65)
      && overlays.some((o: any) => o.kind === 'moss')
      && overlays.some((o: any) => o.kind === 'snow' && o.faces?.includes('top'))
      && overlays.some((o: any) => o.kind === 'cracks')
      && lighting?.brightness < 0.5;
  });

  expect(ok).toBe(true);
});
