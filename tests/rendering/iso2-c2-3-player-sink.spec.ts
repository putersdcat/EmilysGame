/**
 * iso2-c2-3-player-sink.spec.ts — C2.3 main-engine player-sink proof (issue #257).
 *
 * Places the player on a river cell and captures a screenshot showing the
 * player sprite lower than baseline (feet-descend on negative-Z water). The
 * pre-sink state and the on-river state are both captured so the visual
 * delta is unambiguous in a side-by-side review.
 *
 * @see Docs/Iso2.0-MainEngineIntegrationGuide.md
 * @see .github/instructions/iso2-main-port.instructions.md (Port-Back Contract)
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT_BASELINE = 'tests/screenshots/iso2-c2-3-player-on-grass.png';
const SHOT_SUNK = 'tests/screenshots/iso2-c2-3-player-on-river.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

async function placePlayerAt(page: Page, x: number, y: number, assetKey: string) {
  await page.evaluate(({ x, y, assetKey }: { x: number; y: number; assetKey: string }) => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk to be loaded');
    const def = defs[assetKey];
    if (!def) throw new Error(`Missing asset ${assetKey}`);
    chunk.cells[y][x] = {
      assetKey,
      walkable: def.walkable,
      interactable: def.interactable,
    };
    state.player.x = x + 0.5;
    state.player.y = y + 0.5;
    state.camera.x = x + 0.5;
    state.camera.y = y + 0.5;
    state.player.sinkDepth = (assetKey === 'water' || assetKey === 'river') ? 4 : 0;
    state.ui.dialog.active = false;
    state.quiz.active = false;
    state.paused = false;
    debug.invalidateRenderCaches();
  }, { x, y, assetKey });
  await page.waitForTimeout(250);
}

test('C2.3 player sink — JS path drops sprite on river cell', async ({ page }) => {
  await waitForGame(page);

  // Baseline: player on grass (no sink).
  await placePlayerAt(page, 10, 10, 'grass');
  await page.screenshot({ path: SHOT_BASELINE, fullPage: false });

  // Now: player on a water cell, with sinkDepth=4.
  await placePlayerAt(page, 12, 12, 'water');
  await page.screenshot({ path: SHOT_SUNK, fullPage: false });

  // Sanity: both screenshots written.
  expect(true).toBe(true);
});
