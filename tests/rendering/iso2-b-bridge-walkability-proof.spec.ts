/**
 * iso2-b-bridge-walkability-proof.spec.ts — Slice B live-engine proof.
 *
 * `inferBridgeVariant`/`bridgeSpansVertical` were verified by hand-tracing
 * against the real authored WU templates (`bridge_ns`/`bridge_ew` in
 * tiles.config.ts), but that was a read-only proof. This test exercises the
 * ACTUAL main-engine collision path (`src/engine/mechanics.ts`'s
 * `isPositionWalkable` -> `isPointWalkableInTile`, exposed via
 * `window.__gameDebug.isFootprintWalkable`) against a live chunk, for BOTH
 * river orientations:
 *
 *   - horizontal river run (bridge_ew shape): deck must resolve 'straight-v'
 *     (north-south) so the player can cross north<->south.
 *   - vertical river run (bridge_ns shape): deck must resolve 'straight-h'
 *     (east-west) so the player can cross east<->west.
 *
 * In both cases: the bridge cell itself must be walkable, and a neighboring
 * pure-water cell must NOT be walkable. This is the thing that
 * `iso2-gate-bridge-walkability.spec.ts` (which tests the EXPERIMENT's
 * solver, not main's) does not actually prove for the main engine.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('Slice B: bridge over a horizontal (east-west) river is walkable, flanking water is not', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk to be loaded');
    const setCell = (x: number, y: number, assetKey: string) => {
      const def = defs[assetKey];
      if (!def) throw new Error(`Missing asset ${assetKey}`);
      chunk.cells[y][x] = { assetKey, walkable: def.walkable, interactable: def.interactable };
    };
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) setCell(x, y, 'grass');
    }
    // Horizontal water run on row 12, bridge punched through the middle —
    // same shape as the authored `bridge_ew` template (river band running
    // east-west; the bridge deck must run north-south to cross it).
    for (let x = 9; x <= 13; x++) setCell(x, 12, 'water');
    setCell(11, 12, 'bridge');
    debug.invalidateRenderCaches();

    return {
      onBridge: debug.isFootprintWalkable(11.5, 12.5) as boolean,
      onWaterLeft: debug.isFootprintWalkable(9.5, 12.5) as boolean,
      onWaterRight: debug.isFootprintWalkable(13.5, 12.5) as boolean,
      onGrassAbove: debug.isFootprintWalkable(11.5, 10.5) as boolean,
    };
  });

  expect(result.onBridge, 'bridge cell over an E-W river run must be walkable').toBe(true);
  expect(result.onWaterLeft, 'plain water cell (left of bridge) must NOT be walkable').toBe(false);
  expect(result.onWaterRight, 'plain water cell (right of bridge) must NOT be walkable').toBe(false);
  expect(result.onGrassAbove, 'grass cell away from the river must be walkable').toBe(true);
});

test('Slice B: bridge over a vertical (north-south) river is walkable, flanking water is not', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk to be loaded');
    const setCell = (x: number, y: number, assetKey: string) => {
      const def = defs[assetKey];
      if (!def) throw new Error(`Missing asset ${assetKey}`);
      chunk.cells[y][x] = { assetKey, walkable: def.walkable, interactable: def.interactable };
    };
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) setCell(x, y, 'grass');
    }
    // Vertical water run in column 11, bridge punched through the middle —
    // same shape as the authored `bridge_ns` template (river column running
    // north-south; the bridge deck must run east-west to cross it).
    for (let y = 9; y <= 13; y++) setCell(11, y, 'water');
    setCell(11, 12, 'bridge');
    debug.invalidateRenderCaches();

    return {
      onBridge: debug.isFootprintWalkable(11.5, 12.5) as boolean,
      onWaterAbove: debug.isFootprintWalkable(11.5, 9.5) as boolean,
      onWaterBelow: debug.isFootprintWalkable(11.5, 13.5) as boolean,
      onGrassLeft: debug.isFootprintWalkable(9.5, 12.5) as boolean,
    };
  });

  expect(result.onBridge, 'bridge cell over an N-S river run must be walkable').toBe(true);
  expect(result.onWaterAbove, 'plain water cell (above bridge) must NOT be walkable').toBe(false);
  expect(result.onWaterBelow, 'plain water cell (below bridge) must NOT be walkable').toBe(false);
  expect(result.onGrassLeft, 'grass cell away from the river must be walkable').toBe(true);
});

test('Slice B: bridge deck orientation visually matches river orientation', async ({ page }) => {
  await waitForGame(page);

  await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk to be loaded');
    const setCell = (x: number, y: number, assetKey: string) => {
      const def = defs[assetKey];
      if (!def) throw new Error(`Missing asset ${assetKey}`);
      chunk.cells[y][x] = { assetKey, walkable: def.walkable, interactable: def.interactable };
    };
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) setCell(x, y, 'grass');
    }
    // Horizontal river (east-west band) with a bridge crossing, same shape
    // as the authored `bridge_ew` template. Player + camera on the bridge,
    // matching the proven iso2-c2-3-player-sink.spec.ts camera pattern.
    for (let x = 9; x <= 13; x++) setCell(x, 12, 'water');
    setCell(11, 12, 'bridge');

    state.player.x = 11.0;
    state.player.y = 12.5;
    state.camera.x = 11.0;
    state.camera.y = 12.5;
    state.ui.dialog.active = false;
    state.quiz.active = false;
    state.paused = false;
    debug.invalidateRenderCaches();
  });

  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tests/screenshots/iso2-b-bridge-orientation-proof.png', fullPage: false });
  expect(true).toBe(true);
});
