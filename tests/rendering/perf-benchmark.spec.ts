/**
 * perf-benchmark.spec.ts - Automated performance benchmarks (#183)
 * Validates frame time targets in representative gameplay scenes.
 * Uses the __gameDebug.getFrameBenchmark() API for real frame timing data.
 *
 * NOTE: Playwright runs headless Chromium without GPU acceleration,
 * so canvas compositing (especially lighting) is ~50x slower than real browsers.
 * Thresholds here catch regressions rather than proving the <10ms interactive target.
 * Interactive target (<10ms median) is verified separately via debug overlay (F3).
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173/?test=1';

// Headless-adjusted thresholds (real browser is ~5x faster)
// NOTE: lighting subsystem in headless ~20ms alone; movement adds chunk evaluation overhead.
const MEDIAN_LIMIT_MS = 40;    // Catches severe regressions; interactive target is <10ms
const P95_LIMIT_MS = 70;       // Allow spikes in headless canvas
const SUBSYSTEM_LIMIT_MS = 15; // No single subsystem should dominate
const MIN_FPS = 20;            // Absolute floor even in headless

// Wait for game to finish initialization
async function waitForGameReady(page: import('@playwright/test').Page) {
  await page.goto(BASE);
  await page.waitForFunction(() => {
    const dbg = (window as any).__gameDebug;
    return dbg?.getFrameBenchmark && dbg.getFrameBenchmark().count >= 10;
  }, { timeout: 15000 });
}

// Collect benchmark data after running the game for a set duration
async function collectBenchmark(page: import('@playwright/test').Page, durationMs: number) {
  await page.evaluate(() => (window as any).__gameDebug.resetFrameHistory());
  await page.waitForTimeout(durationMs);
  return page.evaluate(() => (window as any).__gameDebug.getFrameBenchmark());
}

test.describe('Performance Benchmarks (#183)', () => {
  test('idle scene frame time within regression limits', async ({ page }) => {
    await waitForGameReady(page);
    const bench = await collectBenchmark(page, 3000);

    console.log(`[PERF] Idle scene: ${bench.count} frames, median=${bench.median.toFixed(2)}ms, p95=${bench.p95.toFixed(2)}ms, p99=${bench.p99.toFixed(2)}ms, max=${bench.max.toFixed(2)}ms`);
    console.log(`[PERF] Subsystems: render=${bench.subsystems.render.toFixed(2)}ms, update=${bench.subsystems.update.toFixed(2)}ms, particles=${bench.subsystems.particles.toFixed(2)}ms, wildlife=${bench.subsystems.wildlife.toFixed(2)}ms, lighting=${bench.subsystems.lighting.toFixed(2)}ms, weather=${bench.subsystems.weather.toFixed(2)}ms, total=${bench.subsystems.total.toFixed(2)}ms`);

    expect(bench.median, `Median frame time should be <${MEDIAN_LIMIT_MS}ms`).toBeLessThan(MEDIAN_LIMIT_MS);
    expect(bench.p95, `P95 frame time should be <${P95_LIMIT_MS}ms`).toBeLessThan(P95_LIMIT_MS);
    expect(bench.count, 'Should collect at least 60 frames in 3s').toBeGreaterThan(60);
  });

  test('gameplay with movement within regression limits', async ({ page }) => {
    await waitForGameReady(page);

    // First, move to trigger chunk generation while NOT benchmarking
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500); // let chunks finish generating

    // NOW reset and benchmark steady-state movement (chunks already cached)
    await page.evaluate(() => (window as any).__gameDebug.resetFrameHistory());
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(2000);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(500);

    const bench = await page.evaluate(() => (window as any).__gameDebug.getFrameBenchmark());

    console.log(`[PERF] Movement (cached): ${bench.count} frames, median=${bench.median.toFixed(2)}ms, p95=${bench.p95.toFixed(2)}ms, max=${bench.max.toFixed(2)}ms`);
    console.log(`[PERF] Subsystems: render=${bench.subsystems.render.toFixed(2)}ms, update=${bench.subsystems.update.toFixed(2)}ms, total=${bench.subsystems.total.toFixed(2)}ms`);

    expect(bench.median, `Median with movement should be <${MEDIAN_LIMIT_MS}ms`).toBeLessThan(MEDIAN_LIMIT_MS);
    expect(bench.p95, `P95 with movement should be <${P95_LIMIT_MS}ms`).toBeLessThan(P95_LIMIT_MS);
    expect(bench.count).toBeGreaterThan(60);
  });

  test('no single subsystem exceeds regression limit', async ({ page }) => {
    await waitForGameReady(page);
    const bench = await collectBenchmark(page, 3000);

    const subs = bench.subsystems;
    console.log(`[PERF] Subsystem breakdown: render=${subs.render.toFixed(2)}ms, update=${subs.update.toFixed(2)}ms, particles=${subs.particles.toFixed(2)}ms, wildlife=${subs.wildlife.toFixed(2)}ms, lighting=${subs.lighting.toFixed(2)}ms, weather=${subs.weather.toFixed(2)}ms, total=${subs.total.toFixed(2)}ms`);

    expect(subs.render, `Render should be <${SUBSYSTEM_LIMIT_MS}ms`).toBeLessThan(SUBSYSTEM_LIMIT_MS);
    expect(subs.update, `Update should be <${SUBSYSTEM_LIMIT_MS}ms`).toBeLessThan(SUBSYSTEM_LIMIT_MS);
    expect(subs.particles, `Particles should be <${SUBSYSTEM_LIMIT_MS}ms`).toBeLessThan(SUBSYSTEM_LIMIT_MS);
    expect(subs.wildlife, `Wildlife should be <${SUBSYSTEM_LIMIT_MS}ms`).toBeLessThan(SUBSYSTEM_LIMIT_MS);
    expect(subs.lighting, `Lighting should be <${SUBSYSTEM_LIMIT_MS}ms`).toBeLessThan(SUBSYSTEM_LIMIT_MS);
    expect(subs.weather, `Weather should be <${SUBSYSTEM_LIMIT_MS}ms`).toBeLessThan(SUBSYSTEM_LIMIT_MS);
  });

  test('debug overlay shows performance data (F3)', async ({ page }) => {
    await waitForGameReady(page);
    await page.waitForTimeout(1000);

    // Toggle debug overlay
    await page.keyboard.press('F3');
    await page.waitForTimeout(500);

    // Check debug overlay contains perf data including total (T:) marker
    const debugEl = page.locator('#debugOverlay');
    const debugText = await debugEl.textContent({ timeout: 5000 });
    expect(debugText).toBeTruthy();
    expect(debugText).toContain('Perf:');
    expect(debugText).toContain('T:');
  });

  test('FPS maintains minimum floor during gameplay', async ({ page }) => {
    await waitForGameReady(page);
    await page.waitForTimeout(2000);

    const fps = await page.evaluate(() => (window as any).__gameDebug.getFrameBenchmark().fps);
    console.log(`[PERF] Calculated FPS: ${fps.toFixed(1)}`);
    expect(fps, `Should maintain at least ${MIN_FPS}fps`).toBeGreaterThan(MIN_FPS);
  });
});
