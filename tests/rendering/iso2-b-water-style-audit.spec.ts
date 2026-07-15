/**
 * iso2-b-water-style-audit.spec.ts — Slice B pixel-content revalidation.
 *
 * Structural tests (iso2-systems-showcase.spec.ts) only assert that a nano
 * stack's `.kind` matches expectations — they do not prove the tile actually
 * painted visible, style-distinct pixels. That gap hid two real bugs in the
 * negative-Z water renderer (drawSunkenCutFaces / drawProceduralRiverWater):
 *
 *   1. Isolated (no-neighbor) water tiles — e.g. a single deep-pond — drew
 *      NOTHING: both the bank cut-faces and the water fill were gated on
 *      `hasH`/`hasV`, which are both false with zero connections. A pond
 *      rendered as an invisible hole.
 *   2. Connected river water ignored the resolved WaterStyle entirely and
 *      always painted the same hardcoded clear-river palette, so
 *      muddy-creek / deep-pond / marsh-water were indistinguishable from
 *      clear-river at runtime (even though 4 distinct styles are generated).
 *
 * This spec pins pixel-level evidence so a future regression on either axis
 * (visibility, style-distinctness) fails loudly instead of silently passing
 * a `.kind`-only structural check.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';
const WATER_TILE_TYPES = ['water_clear_river', 'water_muddy_creek', 'water_deep_pond', 'water_marsh_water'];

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

/** Render one nano stack alone on a transparent canvas and summarize its ink. */
async function renderStackStats(page: Page, tileType: string, variant: string) {
  return page.evaluate(async ({ tileType, variant }) => {
    const [{ getNanoStack }, { drawNanoStack }] = await Promise.all([
      import('/rendering/nano-tile-defs.ts'),
      import('/rendering/nano-tile.ts'),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 176; // 128 diamond height + margin for sunken cut faces below
    const ctx = canvas.getContext('2d')!;
    const stack = getNanoStack(tileType, variant as any);
    if (!stack) throw new Error(`Missing nano stack for ${tileType}:${variant}`);
    drawNanoStack(ctx, stack, 0, 24);

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let inkCount = 0;
    let rSum = 0, gSum = 0, bSum = 0;
    const total = img.length / 4;
    for (let i = 0; i < img.length; i += 4) {
      const a = img[i + 3];
      if (a > 10) {
        inkCount++;
        rSum += img[i];
        gSum += img[i + 1];
        bSum += img[i + 2];
      }
    }
    return {
      ratio: inkCount / total,
      avg: inkCount > 0 ? [rSum / inkCount, gSum / inkCount, bSum / inkCount] : [0, 0, 0],
    };
  }, { tileType, variant });
}

function colorDistance(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test('Slice B audit: isolated water renders a visible, style-distinct basin', async ({ page }) => {
  await waitForGame(page);

  const stats: Record<string, { ratio: number; avg: number[] }> = {};
  for (const tileType of WATER_TILE_TYPES) {
    stats[tileType] = await renderStackStats(page, tileType, 'isolated');
  }

  for (const tileType of WATER_TILE_TYPES) {
    expect(stats[tileType].ratio, `${tileType} isolated pond must paint visible pixels (was invisible pre-fix)`).toBeGreaterThan(0.05);
  }

  // Threshold catches the real regression (style discarded entirely → distance
  // ~0 for every pair). Muddy-creek vs marsh-water are both earthy greens;
  // the V3 R2 basin fill blends more stops so they sit ~7–10 apart rather
  // than the old canal-fill ~9–10. Keep floor above "styles collapsed".
  const names = WATER_TILE_TYPES;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const dist = colorDistance(stats[names[i]].avg, stats[names[j]].avg);
      expect(dist, `${names[i]} vs ${names[j]} isolated-pond average color must differ (style must not be discarded)`).toBeGreaterThan(6);
    }
  }
});

test('Slice B audit: connected river water is style-distinct, not always clear-river', async ({ page }) => {
  await waitForGame(page);

  const stats: Record<string, { ratio: number; avg: number[] }> = {};
  for (const tileType of WATER_TILE_TYPES) {
    stats[tileType] = await renderStackStats(page, tileType, 'straight-h');
  }

  for (const tileType of WATER_TILE_TYPES) {
    expect(stats[tileType].ratio, `${tileType} connected river must paint visible pixels`).toBeGreaterThan(0.05);
  }

  const names = WATER_TILE_TYPES;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const dist = colorDistance(stats[names[i]].avg, stats[names[j]].avg);
      expect(dist, `${names[i]} vs ${names[j]} connected-river average color must differ`).toBeGreaterThan(8);
    }
  }
});

test('Slice B audit: isolated fence/bridge regression net (other procedural nano paths)', async ({ page }) => {
  await waitForGame(page);

  const fence = await renderStackStats(page, 'wooden_fence', 'isolated');
  const bridge = await renderStackStats(page, 'bridge', 'isolated');

  expect(fence.ratio, 'isolated fence post must still paint visible pixels').toBeGreaterThan(0.005);
  expect(bridge.ratio, 'isolated bridge deck must still paint visible pixels').toBeGreaterThan(0.03);
});
