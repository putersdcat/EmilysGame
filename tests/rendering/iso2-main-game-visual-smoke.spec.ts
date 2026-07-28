/**
 * iso2-main-game-visual-smoke.spec.ts — normal generated gameplay baseline.
 *
 * Stabilization issue: #277. This intentionally does not replace the chunk;
 * it captures the real startup canvas so visual integration work has a single
 * human-reviewable north-star screenshot without DOM/sidebar contamination.
 */

import { test, expect, Page } from '@playwright/test';
import { writeGameCanvasPng } from './canvas-capture';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT = 'tests/screenshots/iso2-main-game-visual-smoke.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('normal generated startup view has a visual smoke baseline (refs #277)', async ({ page }) => {
  await waitForGame(page);

  await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    state.ui.dialog.active = false;
    state.quiz.active = false;
    state.paused = false;
    debug.invalidateRenderCaches?.();
  });

  await page.waitForTimeout(500);
  await writeGameCanvasPng(page, SHOT);

  const stats = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug?.state;
    const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement | null;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const w = canvas.width;
    const h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let nonBlank = 0;
    let bright = 0;
    for (let i = 0; i < data.length; i += 64) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (r + g + b > 24) nonBlank++;
      if (r + g + b > 280) bright++;
    }
    let fence = 0;
    let wall = 0;
    let structure = 0;
    let starterIso2 = 0;
    let water = 0;
    if (state?.chunks) {
      const origin = state.chunks.get('0,0');
      if (origin) {
        const chunk = origin;
        for (const row of chunk.cells) {
          for (const cell of row) {
            if (cell.assetKey === 'fence') fence++;
            if (cell.assetKey === 'wall' || cell.assetKey === 'cathedral_wall') wall++;
            if (cell.assetKey === 'house' || cell.assetKey === 'hut' || cell.assetKey === 'shop' || cell.assetKey === 'outhouse') structure++;
            if (cell.assetKey.startsWith('starter_') || cell.assetKey === 'stone_floor' || cell.assetKey === 'quiz_gate' || cell.assetKey === 'campfire' || cell.assetKey === 'sign') starterIso2++;
            if (cell.assetKey === 'water' || cell.assetKey === 'bridge') water++;
          }
        }
      }
    }
    return { nonBlank, bright, samples: data.length / 64, fence, wall, structure, starterIso2, water };
  });

  expect(stats).not.toBeNull();
  expect(stats!.nonBlank).toBeGreaterThan(stats!.samples * 0.35);
  expect(stats!.bright).toBeGreaterThan(20);
  // Startup should show some authored Iso2 objects, but not freeform fence spam.
  expect(stats!.fence).toBeLessThan(80);
  expect(stats!.starterIso2).toBeGreaterThanOrEqual(10);
  expect(stats!.fence + stats!.wall + stats!.structure + stats!.starterIso2 + stats!.water).toBeGreaterThan(0);
});
