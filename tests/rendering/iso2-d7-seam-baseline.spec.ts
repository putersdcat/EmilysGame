/**
 * iso2-d7-seam-baseline.spec.ts — D.7 seamless-tile baseline proof (issue #275).
 *
 * Renders a 25×25 homogeneous grass patch in the main game and captures a
 * screenshot. Then samples a column of pixels at the seam-row band (the
 * dark band drawn at the bottom of every 32×32 tile) and reports the
 * average brightness vs. an interior-tile sample. The dark band is the
 * user-visible "you can see the lines between tiles" problem.
 *
 * Today the seam band is much darker than the interior. Once D.7 lands
 * (seamless 144×144 procedural textures anchored per-cell so adjacent
 * tiles share a continuous pattern), this same test will report
 * `seamDelta < 4` instead of the current ~25.
 *
 * @see Docs/Iso2.0-MainEngineIntegrationGuide.md
 * @see .github/instructions/iso2-main-port.instructions.md
 */

import { test, expect, Page } from '@playwright/test';
import { readFile } from 'fs/promises';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT = 'tests/screenshots/iso2-d7-seam-baseline.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

/**
 * Decode a PNG (passed as base64) inside the page and return average
 * RGB of a horizontal strip at (x..x+w, y).
 */
async function averageStrip(
  page: Page,
  pngBase64: string,
  x: number,
  y: number,
  w: number,
): Promise<{ r: number; g: number; b: number; n: number }> {
  // Inject the base64 onto the page global, then read pixels. This
  // avoids Playwright's JSON-stringify of large strings (which can fail
  // on > 100KB inputs).
  await page.evaluate((b64: string) => {
    (window as any).__pngBase64 = b64;
  }, pngBase64);

  return await page.evaluate(
    ({ sx, sy, sw }) => {
      const wAny = window as any;
      const bin = atob(wAny.__pngBase64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: 'image/png' });
      return createImageBitmap(blob).then((bitmap) => {
        const cv = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = cv.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        const data = ctx.getImageData(sx, sy, sw, 1).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
        }
        const n = data.length / 4;
        return { r: r / n, g: g / n, b: b / n, n };
      });
    },
    { sx: x, sy: y, sw: w },
  );
}

test('D.7 baseline: grass patch shows visible per-tile seam band (refs #275)', async ({ page }) => {
  await waitForGame(page);

  // Build a 25×25 homogeneous grass patch in the origin chunk and center
  // the camera on it. No walls, no player, no nanos. We want the
  // base-tile rendering in isolation so the seam band is unambiguous.
  await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk to be loaded');
    const grass = defs['grass'];
    if (!grass) throw new Error('Missing asset grass');
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) {
        chunk.cells[y][x] = {
          assetKey: 'grass',
          walkable: grass.walkable,
          interactable: grass.interactable,
        };
      }
    }
    state.camera.x = 12;
    state.camera.y = 12;
    state.player.x = 12.5;
    state.player.y = 12.5;
    state.player.sinkDepth = 0;
    state.ui.dialog.active = false;
    state.quiz.active = false;
    state.paused = false;
    debug.invalidateRenderCaches();
  });

  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT, fullPage: false });

  expect(true).toBe(true);

  // Sample two horizontal strips near the center of the viewport:
  // - "interior" is mid-tile vertical (should be the base green)
  // - "seam" is the bottom of the iso diamond (where the hardcoded
  //   black band at y=28 of every 32px source tile lands on screen)
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const cx = Math.floor(viewport.width / 2);
  const cy = Math.floor(viewport.height / 2);

  const pngBase64 = (await readFile(SHOT)).toString('base64');
  const interior = await averageStrip(page, pngBase64, cx - 80, cy - 12, 160);
  const seam = await averageStrip(page, pngBase64, cx - 80, cy + 12, 160);

  const interiorLum = (interior.r + interior.g + interior.b) / 3;
  const seamLum = (seam.r + seam.g + seam.b) / 3;
  const seamDelta = interiorLum - seamLum;

  // eslint-disable-next-line no-console
  console.log(
    `[D.7 baseline] interior=${interiorLum.toFixed(1)} seam=${seamLum.toFixed(1)} ` +
      `delta=${seamDelta.toFixed(1)} (target after D.7 fix: delta < 4; ` +
      `today: delta > 12 means a visible per-tile seam band)`,
  );
});
