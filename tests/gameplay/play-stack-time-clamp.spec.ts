/**
 * play-stack-time-clamp.spec.ts — L0 time contract (play-stack PR1).
 *
 * Proves artificial hitch injection via `__gameDebug.injectDtMs` does not
 * produce multi-cell teleports: sim integration clamps to MOVE_MAX_CATCHUP_MS
 * and `dtClampedCount` increments when raw sim dt exceeds the cap.
 *
 * See memories/repo/design-play-stack-first-principles-2026-07-19.md (PR1 / T2).
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state?.chunks?.size, {
    timeout: 15000,
  });
  await page.evaluate(() => {
    localStorage.setItem('emilys_game_first_run', '1');
    const splash = document.getElementById('welcomeSplash');
    if (splash) {
      splash.style.display = 'none';
      (splash as HTMLElement).style.pointerEvents = 'none';
    }
    const d = (window as any).__gameDebug;
    if (d?.state) d.state.paused = false;
  });
}

test('injectDtMs large hitch: clamp metrics + no multi-cell teleport', async ({ page }) => {
  await waitForGame(page);

  const setup = await page.evaluate(() => {
    const d = (window as any).__gameDebug;
    if (typeof d.injectDtMs !== 'function' || typeof d.getDtClampedCount !== 'function') {
      return { ok: false as const, reason: 'injectDtMs / getDtClampedCount missing on __gameDebug' };
    }
    const tc = d.getTimeContract();
    // Open courtyard north of starter cottage (deterministic walkable).
    const x = 11.5;
    const y = 10.5;
    d.setPlayerPosition(x, y);
    d.state.player.spawnEscape = false;
    d.state.player.sinkDepth = 0;
    d.state.paused = false;
    d.state.camera.x = x;
    d.state.camera.y = y;
    const walkable = d.isFootprintWalkable(x, y);
    return {
      ok: true as const,
      walkable,
      speed: d.state.player.speed as number,
      moveStepMs: tc.moveStepMs as number,
      moveMaxCatchupMs: tc.moveMaxCatchupMs as number,
      clampedBefore: d.getDtClampedCount() as number,
    };
  });

  expect(setup.ok, setup.ok === false ? setup.reason : 'debug API ready').toBe(true);
  if (!setup.ok) return;
  expect(setup.walkable, 'test spawn must be walkable open ground').toBe(true);

  // Cap displacement for one clamped integrate: speed * (capMs / stepMs).
  // Unclamped 500ms would be ~5× larger → multi-cell teleport territory.
  const maxClampedCells =
    setup.speed * (setup.moveMaxCatchupMs / setup.moveStepMs);
  const unclamped500Cells = setup.speed * (500 / setup.moveStepMs);
  expect(unclamped500Cells).toBeGreaterThan(maxClampedCells * 2);

  // Hold east while the injected hitch frame runs.
  await page.keyboard.down('d');
  await page.waitForTimeout(50);

  const clampedBefore = await page.evaluate(() => {
    const d = (window as any).__gameDebug;
    d.state.paused = false;
    d.state.player.spawnEscape = false;
    const before = d.getDtClampedCount() as number;
    d.injectDtMs(500);
    return before;
  });

  // Wait until inject frame is latched (stable across subsequent rAF ticks).
  await page.waitForFunction(
    (c0) => {
      const d = (window as any).__gameDebug;
      const tc = d.getTimeContract();
      return d.getDtClampedCount() > c0 && tc.lastInject && tc.lastInject.rawMs >= 500;
    },
    clampedBefore,
    { timeout: 3000 },
  );

  const latch = await page.evaluate(() => {
    const d = (window as any).__gameDebug;
    const tc = d.getTimeContract();
    const s = d.state;
    return {
      clamped: d.getDtClampedCount() as number,
      inject: tc.lastInject as { rawMs: number; clampedMs: number; displacement: number },
      pendingInject: tc.pendingInject as boolean,
      moveMaxCatchupMs: tc.moveMaxCatchupMs as number,
      speed: d.state.player.speed as number,
      x: s.player.x as number,
      y: s.player.y as number,
      frame: s.frameCount as number,
    };
  });

  expect(latch.clamped, 'raw sim dt 500ms must increment dtClampedCount').toBeGreaterThan(
    clampedBefore,
  );
  expect(latch.inject, 'inject frame must latch metrics').toBeTruthy();
  expect(latch.inject.rawMs, 'latched raw sim dt is the inject').toBeGreaterThanOrEqual(500);
  expect(
    latch.inject.clampedMs,
    'motor must clamp integrate dt to MOVE_MAX_CATCHUP_MS',
  ).toBeLessThanOrEqual(setup.moveMaxCatchupMs + 1e-6);
  expect(latch.pendingInject, 'inject is one-shot — pending cleared after consume').toBe(false);

  // Escape recovery can add one free step (≤ speed * 1); allow that margin.
  const maxWithEscapeStep = maxClampedCells + setup.speed + 1e-3;
  expect(
    latch.inject.displacement,
    `inject-frame displacement ${latch.inject.displacement.toFixed(4)} ` +
      `must stay ≤ clamp×speed (+escape step) ${maxWithEscapeStep.toFixed(4)}; ` +
      `unclamped 500ms would be ~${unclamped500Cells.toFixed(3)}`,
  ).toBeLessThanOrEqual(maxWithEscapeStep);

  // Hard fail: multi-cell teleport as if hitch were fully integrated.
  expect(latch.inject.displacement).toBeLessThan(unclamped500Cells * 0.5);

  // L0 Done #2: no multi-second catch-up dash on subsequent frames (drop, not queue).
  // Hold move ~150ms; displacement must stay within nominal budget, not residual hitch.
  await page.waitForTimeout(150);

  const post = await page.evaluate(() => {
    const d = (window as any).__gameDebug;
    const tc = d.getTimeContract();
    const s = d.state;
    return {
      x: s.player.x as number,
      y: s.player.y as number,
      frame: s.frameCount as number,
      clamped: d.getDtClampedCount() as number,
      pendingInject: tc.pendingInject as boolean,
      lastInjectRaw: tc.lastInject?.rawMs as number | undefined,
      lastSimDtRawMs: tc.lastSimDtRawMs as number,
    };
  });

  await page.keyboard.up('d');

  expect(post.pendingInject, 'inject must not re-queue after consume').toBe(false);
  // Latch stays on the original hitch frame (not re-applied as a second 500ms inject).
  expect(post.lastInjectRaw).toBe(latch.inject.rawMs);
  // No second hitch clamp from sticky inject (wall-clock hitches during CI are rare;
  // allow at most +1 for flaky machine stalls).
  expect(post.clamped - latch.clamped).toBeLessThanOrEqual(1);

  const postDist = Math.hypot(post.x - latch.x, post.y - latch.y);
  const framesAfter = Math.max(1, post.frame - latch.frame);
  // Each post-inject frame integrates ≤ MOVE_MAX_CATCHUP_MS; real frames are ~16ms.
  // Bound: frames × clamp-budget + small slack (escape step / scheduling).
  const maxPostDist =
    framesAfter * maxClampedCells + setup.speed * 2;
  expect(
    postDist,
    `post-inject Δpos ${postDist.toFixed(3)} over ${framesAfter} frames must stay ≤ ` +
      `${maxPostDist.toFixed(3)} (no hitch backlog dash; unclamped residual 400ms alone ~${(
        setup.speed *
        (400 / setup.moveStepMs)
      ).toFixed(2)})`,
  ).toBeLessThanOrEqual(maxPostDist);

  // Residual hitch queue would dump ~400ms+ of leftover on the next frames → multi-cell.
  const residualHitchCells = setup.speed * (400 / setup.moveStepMs);
  expect(postDist).toBeLessThan(residualHitchCells);
});
