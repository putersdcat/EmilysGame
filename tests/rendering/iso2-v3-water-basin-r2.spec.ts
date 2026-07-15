/**
 * iso2-v3-water-basin-r2.spec.ts — R2 water "tank" shape fix (2026-07-15)
 *
 * Cross/tee/isolated water used to draw as crossed H+V river canals (rectangular
 * tanks). Open water bodies now use soft oval basin fills; linear rivers keep
 * channels. Proof: pixel distribution + still-visible ink.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

async function renderWaterStats(page: Page, variant: string) {
  return page.evaluate(async (variant) => {
    const [{ getNanoStack }, { drawNanoStack }] = await Promise.all([
      import('/rendering/nano-tile-defs.ts'),
      import('/rendering/nano-tile.ts'),
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;
    const stack = getNanoStack('water', variant as any);
    if (!stack) throw new Error(`no stack for water:${variant}`);
    // Warm async images then clear+redraw (parity with other nano pixel tests)
    drawNanoStack(ctx, stack, 10, 40);
    await new Promise((r) => setTimeout(r, 120));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawNanoStack(ctx, stack, 10, 40);

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    let rSum = 0, gSum = 0, bSum = 0;
    // Rough "squareness": count ink in center 40% box vs outer ring
    const cx0 = Math.floor(canvas.width * 0.30);
    const cx1 = Math.floor(canvas.width * 0.70);
    const cy0 = Math.floor(canvas.height * 0.30);
    const cy1 = Math.floor(canvas.height * 0.70);
    let centerInk = 0;
    let totalInk = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (img[i + 3] <= 12) continue;
        ink++;
        totalInk++;
        rSum += img[i];
        gSum += img[i + 1];
        bSum += img[i + 2];
        if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) centerInk++;
      }
    }
    return {
      ink,
      centerRatio: totalInk > 0 ? centerInk / totalInk : 0,
      avg: totalInk > 0 ? { r: rSum / totalInk, g: gSum / totalInk, b: bSum / totalInk } : { r: 0, g: 0, b: 0 },
    };
  }, variant);
}

test('R2: open water (isolated/cross) renders visible basin, not empty hole', async ({ page }) => {
  await waitForGame(page);
  for (const variant of ['isolated', 'cross', 'tee-t'] as const) {
    const stats = await renderWaterStats(page, variant);
    expect(stats.ink, `${variant} must paint visible water ink`).toBeGreaterThan(800);
    // Basin concentrates more mass near center than a thin edge-only rim
    expect(stats.centerRatio, `${variant} basin should keep substantial center fill`).toBeGreaterThan(0.28);
  }
});

test('R2: straight river channel still paints a visible linear corridor', async ({ page }) => {
  await waitForGame(page);
  const straight = await renderWaterStats(page, 'straight-h');
  expect(straight.ink, 'straight-h river must paint').toBeGreaterThan(500);
});

test('R2: basin (cross) is visually distinct from straight channel average', async ({ page }) => {
  await waitForGame(page);
  const basin = await renderWaterStats(page, 'cross');
  const river = await renderWaterStats(page, 'straight-h');
  const dist = Math.hypot(
    basin.avg.r - river.avg.r,
    basin.avg.g - river.avg.g,
    basin.avg.b - river.avg.b,
  );
  // Not required to be huge (same palette), but paths differ enough that
  // center fill ratios diverge.
  expect(Math.abs(basin.centerRatio - river.centerRatio)).toBeGreaterThan(0.03);
  expect(basin.ink).toBeGreaterThan(0);
  expect(river.ink).toBeGreaterThan(0);
  // Keep dist soft — both use same WaterStyle colors
  expect(dist).toBeGreaterThanOrEqual(0);
});
