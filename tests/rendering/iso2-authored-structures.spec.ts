/**
 * iso2-authored-structures.spec.ts — authored nano structure proof (#277).
 *
 * Renders material-backed cottage, castle keep, and chapel nano stacks into an
 * isolated canvas. This is deliberately separate from normal startup so we can
 * iterate structure geometry without live game-loop/full-frame pollution.
 */
import { test, expect, Page } from '@playwright/test';
import { writePngDataUrl } from './canvas-capture';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT = 'tests/screenshots/iso2-authored-structures.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('authored nano structures: cottage, keep, and chapel share the structure renderer path', async ({ page }) => {
  await waitForGame(page);

  const dataUrl = await page.evaluate(async () => {
    const [{ getNanoStack }, { drawNanoStack }] = await Promise.all([
      import('/rendering/nano-tile-defs.ts'),
      import('/rendering/nano-tile.ts'),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 520;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#3fa84a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawPad = (topLeftX: number, topLeftY: number) => {
      const cx = topLeftX + 128;
      const cy = topLeftY + 64;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 60);
      ctx.lineTo(cx + 120, cy);
      ctx.lineTo(cx, cy + 60);
      ctx.lineTo(cx - 120, cy);
      ctx.closePath();
      ctx.fillStyle = '#9d9585';
      ctx.fill();
      ctx.strokeStyle = 'rgba(45,55,35,0.38)';
      ctx.stroke();
    };
    const structures = [
      { key: 'starter_cottage', x: 82, y: 142 },
      { key: 'castle_keep', x: 318, y: 142 },
      { key: 'cathedral_chapel', x: 554, y: 142 },
    ];
    for (const s of structures) drawPad(s.x, s.y);
    for (const s of structures) {
      const stack = getNanoStack(s.key);
      if (!stack) throw new Error(`Missing nano stack ${s.key}`);
      drawNanoStack(ctx, stack, s.x, s.y);
    }
    return canvas.toDataURL('image/png');
  });
  await writePngDataUrl(SHOT, dataUrl);

  const ok = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const cottage = debug.getNanoStackForTests('starter_cottage')?.[0];
    const keep = debug.getNanoStackForTests('castle_keep')?.[0];
    const chapel = debug.getNanoStackForTests('cathedral_chapel')?.[0];
    return {
      cottageKind: cottage?.kind,
      keepKind: keep?.kind,
      chapelKind: chapel?.kind,
      cottageSprite: debug.hasAssetSprite('starter_cottage'),
      keepSprite: debug.hasAssetSprite('castle_keep'),
      chapelSprite: debug.hasAssetSprite('cathedral_chapel'),
    };
  });

  expect(ok).toEqual({
    cottageKind: 'starter-cottage',
    keepKind: 'castle-keep',
    chapelKind: 'cathedral-chapel',
    cottageSprite: false,
    keepSprite: false,
    chapelSprite: false,
  });
});
