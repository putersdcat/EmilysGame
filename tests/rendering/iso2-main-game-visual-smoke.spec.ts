/**
 * iso2-main-game-visual-smoke.spec.ts — normal generated gameplay baseline.
 *
 * Stabilization issue: #277. This intentionally does not replace the chunk;
 * it captures the real startup view so visual integration work has a single
 * human-reviewable north-star screenshot.
 */

import { test, expect, Page } from '@playwright/test';

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
  await page.screenshot({ path: SHOT, fullPage: false });

  const stats = await page.evaluate(() => {
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
    return { nonBlank, bright, samples: data.length / 64 };
  });

  expect(stats).not.toBeNull();
  expect(stats!.nonBlank).toBeGreaterThan(stats!.samples * 0.35);
  expect(stats!.bright).toBeGreaterThan(20);
});
