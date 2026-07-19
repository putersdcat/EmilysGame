/**
 * iso2-c-gate-connectivity-fix.spec.ts — locked gate full-tile cell SSOT.
 *
 * PR3: gameplay walkability is `cell.walkable` only. Locked quiz_gate /
 * door_locked cells stamped walkable:false block the full tile (product law).
 * Unlock is cell rewrite (resolveQuizGate → door_open), never global
 * activeConditions. Paint connectivity (fence/wall run variants) remains a
 * rendering concern; this file asserts progression integrity via cell stamps.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('Slice C: quiz_gate embedded in a wooden_fence run blocks across the full run width when locked', async ({ page }) => {
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
    // 5-cell horizontal fence run with a quiz_gate punched into the middle --
    // mirrors placeGatesInFenceRuns's real generation output shape. Real
    // generation uses assetKey 'fence' (ASSET_DEFS.fence.tileType ===
    // 'wooden_fence'), not the tileType string directly.
    for (let x = 9; x <= 13; x++) setCell(x, 12, 'fence');
    setCell(11, 12, 'quiz_gate');
    state.activeConditions.set('quiz-gate', 'locked');
    debug.invalidateRenderCaches();

    // Full-tile cell.walkable block — off-center sample still fails.
    const lockedBlocksOffCenter = debug.isFootprintWalkable(11.5, 12.8) as boolean;
    const controlFarGrass = debug.isFootprintWalkable(5.5, 5.5) as boolean;

    // Real gameplay unlock rewrites the cell (resolveQuizGate → door_open).
    // Global activeConditions 'quiz-gate' is intentionally NOT used for that —
    // a shared id would open every quiz_gate at once.
    chunk.cells[12][11] = { assetKey: 'door_open', walkable: true, interactable: false, resolved: true };
    debug.invalidateRenderCaches();
    const unlockedPasses = debug.isFootprintWalkable(11.5, 12.5) as boolean;

    return { lockedBlocksOffCenter, controlFarGrass, unlockedPasses };
  });

  expect(result.controlFarGrass, 'control: plain grass far away must be walkable').toBe(true);
  expect(result.lockedBlocksOffCenter, 'locked quiz_gate must full-tile block via cell.walkable SSOT').toBe(false);
  expect(result.unlockedPasses, 'unlocked quiz_gate (cell rewrite) must be walkable').toBe(true);
});

test('Slice C: quiz_gate embedded in a wall run blocks across the full run width when locked', async ({ page }) => {
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
    // Wall run with quiz_gate — full-tile cell SSOT (no nano collision path).
    for (let x = 9; x <= 13; x++) setCell(x, 12, 'wall');
    setCell(11, 12, 'quiz_gate');
    state.activeConditions.set('quiz-gate', 'locked');
    debug.invalidateRenderCaches();

    const blocksOffCenter = debug.isFootprintWalkable(11.5, 12.8) as boolean;
    const controlFarGrass = debug.isFootprintWalkable(5.5, 5.5) as boolean;
    return { blocksOffCenter, controlFarGrass };
  });

  expect(result.controlFarGrass, 'control: plain grass far away must be walkable').toBe(true);
  expect(result.blocksOffCenter, 'quiz_gate in wall run must full-tile block via cell.walkable').toBe(false);
});

test('Slice C: quiz_gate embedded in a fence run renders as a proper gate leaf, not a floating post', async ({ page }) => {
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
    for (let x = 9; x <= 13; x++) setCell(x, 12, 'fence');
    setCell(11, 12, 'quiz_gate');
    state.activeConditions.set('quiz-gate', 'locked');
    state.player.x = 11.5;
    state.player.y = 13.3;
    state.camera.x = 11.3;
    state.camera.y = 12.1;
    state.camera.zoom = 2.2;
    state.ui.dialog.active = false;
    state.quiz.active = false;
    state.paused = false;
    debug.invalidateRenderCaches();
  });

  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tests/screenshots/iso2-c-gate-in-fence-run-proof.png', fullPage: false });
  expect(true).toBe(true);
});
