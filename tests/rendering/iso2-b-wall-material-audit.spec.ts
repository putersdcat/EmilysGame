/**
 * iso2-b-wall-material-audit.spec.ts — Slice B.5 wall/material pixel audit.
 *
 * Source-level audit (Slice A.5) already confirmed drawExtrudedNano() draws
 * REAL per-face material images via ctx.drawImage() (no procedural-discard
 * pattern like the water bug), and wallBounds() always returns at least one
 * rect for every variant (including 'isolated'), so walls are structurally
 * immune to the "isolated = invisible" bug class. This spec turns that
 * source-level confidence into pixel-level proof, matching the standard set
 * by the water fix: non-empty ink for every variant, and material-to-
 * material visual distinctness, not just "a nano stack was returned".
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

const WALL_MATERIAL_TILE_TYPES = [
  'stone_wall', 'stone_wall_red_clinker', 'stone_wall_mud_brick', 'stone_wall_sandstone',
  'stone_wall_cottage_foundation', 'homestead_wall', 'homestead_wall_plaster',
  'homestead_wall_planks', 'cathedral_wall',
];

const ALL_WALL_VARIANTS = [
  'isolated', 'straight-h', 'straight-v',
  'corner-tl', 'corner-tr', 'corner-bl', 'corner-br',
  'cross', 'tee-t', 'tee-r', 'tee-b', 'tee-l',
  'end-t', 'end-r', 'end-b', 'end-l',
];

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

/** Render one wall nano stack alone on a generous transparent canvas and summarize its ink. */
async function renderWallStats(page: Page, tileType: string, variant: string) {
  return page.evaluate(async ({ tileType, variant }) => {
    const [{ getNanoStack }, { drawNanoStack }] = await Promise.all([
      import('/rendering/nano-tile-defs.ts'),
      import('/rendering/nano-tile.ts'),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = 260;
    canvas.height = 320; // extra headroom above the tile for wall height (positive-Z extrusion)
    const ctx = canvas.getContext('2d')!;
    const stack = getNanoStack(tileType, variant as any);
    if (!stack) throw new Error(`Missing nano stack for ${tileType}:${variant}`);

    // drawExtrudedNano (unlike the procedural water/fence/bridge paths) needs
    // its face-texture SVGs already decoded via loadSvgImage's async
    // data-URI Image() -- it silently no-ops on the very first call before
    // decode completes (self-heals within a frame or two in the real game
    // loop, but a single-shot capture needs an explicit warm-up + wait).
    drawNanoStack(ctx, stack, 2, 190);
    await new Promise((resolve) => setTimeout(resolve, 200));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawNanoStack(ctx, stack, 2, 190);

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

test('Slice B.5: every wall material renders visible ink for isolated/straight-h/cross', async ({ page }) => {
  await waitForGame(page);

  for (const tileType of WALL_MATERIAL_TILE_TYPES) {
    for (const variant of ['isolated', 'straight-h', 'cross']) {
      const stats = await renderWallStats(page, tileType, variant);
      expect(stats.ratio, `${tileType}:${variant} must paint visible pixels`).toBeGreaterThan(0.02);
    }
  }
});

test('Slice B.5: every wall variant (all 16) renders visible ink for a representative material', async ({ page }) => {
  await waitForGame(page);

  for (const variant of ALL_WALL_VARIANTS) {
    const stats = await renderWallStats(page, 'stone_wall', variant);
    expect(stats.ratio, `stone_wall:${variant} must paint visible pixels (catches any degenerate zero-rect variant, mirroring the water isolated-pond bug class)`).toBeGreaterThan(0.02);
  }
});

test('Slice B.5: wall materials are visually distinct from each other', async ({ page }) => {
  await waitForGame(page);

  const stats: Record<string, { ratio: number; avg: number[] }> = {};
  for (const tileType of WALL_MATERIAL_TILE_TYPES) {
    stats[tileType] = await renderWallStats(page, tileType, 'straight-h');
  }

  const names = WALL_MATERIAL_TILE_TYPES;
  const tooClose: string[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const dist = colorDistance(stats[names[i]].avg, stats[names[j]].avg);
      if (dist <= 4) tooClose.push(`${names[i]} vs ${names[j]}: ${dist.toFixed(1)}`);
    }
  }

  // Report (not hard-fail) near-duplicate pairs: some material families are
  // deliberately close (e.g. plaster/planks share a base palette), so this
  // is evidence to review rather than an automatic bug, unlike the water
  // case where the distance was mathematically forced to exactly 0.
  expect(tooClose, `near-duplicate material pairs (avg color distance <= 4): ${tooClose.join(', ') || 'none'}`).toEqual([]);
});
