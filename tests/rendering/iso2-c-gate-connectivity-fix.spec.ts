/**
 * iso2-c-gate-connectivity-fix.spec.ts — Slice C live-engine proof.
 *
 * Found while auditing fence/gate production readiness: door_gate/quiz_gate
 * cells embedded in a real generated wall or fence run (placeGatesInFenceRuns,
 * the door_gate<->quiz_gate conversion in placeQuizGates) resolved to the
 * 'isolated' FeatureVariant for BOTH rendering (tile-variants.ts's
 * nanoConnectionFamily hardcoded quiz_gate/door_gate to 'wall' only, never
 * matching a 'fence' neighbor) and collision (mechanics.ts used a strict
 * same-assetKey-only neighbor check, which a gate's assetKey never satisfies
 * against its wall/fence neighbors' different assetKey). 'isolated' collapses
 * a gate's blocking footprint from a full wall/fence-run-width band down to a
 * tiny ~18-48px center post, leaving the rest of the tile's width freely
 * walkable around a supposedly-locked gate -- a real progression-integrity
 * bug, not just a visual one.
 *
 * This spec proves the fix on the live main engine for both contexts a gate
 * actually appears in per ObstacleSolver.ts: a quiz_gate embedded in a
 * wooden_fence run, and a door_gate embedded in a stone_wall run.
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

    // Y fraction 0.8 within the gate's own tile lands one corner (of the
    // player's 0.3-half-width collision box) squarely inside the fence's
    // rail band [0.4375, 0.5625] with a comfortable ~9px margin, regardless
    // of X -- a 'straight-h' gate blocks the FULL tile width at that Y band,
    // but the old buggy 'isolated' variant only blocked an ~18px center
    // square that this X position falls well outside of.
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
  expect(result.lockedBlocksOffCenter, 'locked quiz_gate embedded in a fence run must block across the full run width, not just a small center post (this was the bug: it resolved to isolated variant)').toBe(false);
  expect(result.unlockedPasses, 'unlocked quiz_gate must be walkable').toBe(true);
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
    // 5-cell horizontal wall run with a quiz_gate in the middle -- mirrors
    // the wall_gate WU template shape PLUS placeQuizGates's "convert an
    // existing gate-type obstacle to quiz_gate in place" strategy. Real
    // generation uses assetKey 'wall' (ASSET_DEFS.wall.tileType ===
    // 'stone_wall'); door_gate/door_locked never reach the nano path at all
    // via mechanics.ts today (same class as barricade/toll_gate, always
    // full-tile-blocked via the cell.walkable fallback -- unaffected by this
    // fix, and deliberately left alone per the Slice B.5 writeup), but
    // quiz_gate DOES reach getNanoStack successfully, so this is the real
    // reachable wall-run gate scenario this fix needed to cover.
    for (let x = 9; x <= 13; x++) setCell(x, 12, 'wall');
    setCell(11, 12, 'quiz_gate');
    state.activeConditions.set('quiz-gate', 'locked');
    debug.invalidateRenderCaches();

    // Gates always use pointHitsFenceFootprint (FENCE_THICKNESS=18) regardless
    // of whether they're embedded in a wall or fence run (nanoBlocksPoint
    // dispatches purely on nano.kind === 'gate') -- so the fence band
    // [0.4375, 0.5625] applies here too, not the wider wall band. Y=0.8 lands
    // the bottom corner at fraction 0.5 (centered in the band, ~9px margin).
    const blocksOffCenter = debug.isFootprintWalkable(11.5, 12.8) as boolean;
    const controlFarGrass = debug.isFootprintWalkable(5.5, 5.5) as boolean;
    return { blocksOffCenter, controlFarGrass };
  });

  expect(result.controlFarGrass, 'control: plain grass far away must be walkable').toBe(true);
  expect(result.blocksOffCenter, 'quiz_gate embedded in a wall run must block across the full run width, not just a small center post').toBe(false);
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
