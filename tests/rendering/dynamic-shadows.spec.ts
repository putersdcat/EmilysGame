import { test, expect } from '@playwright/test';

/**
 * Tests for Issue #83 — Dynamic Shadow Pass Driven by Time-of-Day + Weather.
 * Verifies shadow parameters change with time-of-day and weather,
 * are visible during daytime, and fade/disappear at night.
 */

// Helper: wait for game to load and dismiss splash
async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto('/');
  const splash = page.locator('#splashScreen');
  await splash.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  const startBtn = page.locator('#startButton');
  if (await startBtn.isVisible().catch(() => false)) {
    await startBtn.click();
  }
  const canvas = page.locator('#gameContainer canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(2000);
}

// Helper: enable debug overlay and set time, then read debug text after a few frames
async function getDebugAtTime(page: import('@playwright/test').Page, time: number): Promise<string> {
  return page.evaluate((t) => {
    const state = (window as any).__gameState;
    if (state) state.ui.showDebug = true;
    const lighting = (window as any).__lighting;
    if (lighting) lighting.setTimeOfDay(t);
    return new Promise<string>((resolve) => {
      let frames = 8;
      function tick() {
        if (--frames > 0) { requestAnimationFrame(tick); return; }
        const el = document.getElementById('debugOverlay');
        resolve(el?.textContent ?? '');
      }
      requestAnimationFrame(tick);
    });
  }, time);
}

test.describe('Dynamic Shadows (#83)', () => {

  test('shadow debug info appears in F3 overlay during daytime', async ({ page }) => {
    await waitForGame(page);
    const debugText = await getDebugAtTime(page, 0.35); // midday
    // Should contain shadow angle + opacity info
    expect(debugText).toContain('shadow:');
    expect(debugText).toContain('op:');
    expect(debugText).toContain('%');
  });

  test('shadows rotate direction across the day cycle', async ({ page }) => {
    await waitForGame(page);

    const dawn = await getDebugAtTime(page, 0.05);
    const midday = await getDebugAtTime(page, 0.35);
    const dusk = await getDebugAtTime(page, 0.65);

    // All should show shadow info
    expect(dawn).toContain('shadow:');
    expect(midday).toContain('shadow:');
    expect(dusk).toContain('shadow:');

    // Extract angles
    const angleRegex = /shadow:\s*(-?\d+)\u00b0/;
    const dawnMatch = dawn.match(angleRegex);
    const middayMatch = midday.match(angleRegex);
    const duskMatch = dusk.match(angleRegex);

    expect(dawnMatch).not.toBeNull();
    expect(middayMatch).not.toBeNull();
    expect(duskMatch).not.toBeNull();

    if (dawnMatch && middayMatch && duskMatch) {
      const a1 = parseInt(dawnMatch[1]);
      const a2 = parseInt(middayMatch[1]);
      const a3 = parseInt(duskMatch[1]);
      // All three angles should be meaningfully different (shadow rotates)
      expect(Math.abs(a1 - a2)).toBeGreaterThan(10);
      expect(Math.abs(a2 - a3)).toBeGreaterThan(10);
    }
  });

  test('shadow opacity is reasonable at midday clear weather', async ({ page }) => {
    await waitForGame(page);
    const debugText = await getDebugAtTime(page, 0.35);

    const opMatch = debugText.match(/op:(\d+)%/);
    expect(opMatch).not.toBeNull();
    if (opMatch) {
      const opacity = parseInt(opMatch[1]);
      // At midday with clear(ish) weather, expect 15-55% opacity
      expect(opacity).toBeGreaterThan(10);
      expect(opacity).toBeLessThanOrEqual(55);
    }
  });

  test('shadows disappear at night', async ({ page }) => {
    await waitForGame(page);
    const nightText = await getDebugAtTime(page, 0.85);

    // Night should show "off"
    expect(nightText).toContain('off');
  });

  test('no runtime errors during shadow rendering across full day cycle', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await waitForGame(page);

    // Rapidly cycle through the day in 10 steps
    await page.evaluate(() => {
      const lighting = (window as any).__lighting;
      if (!lighting) return;
      return new Promise<void>((resolve) => {
        let step = 0;
        function advance() {
          if (step >= 10) { resolve(); return; }
          lighting.setTimeOfDay(step * 0.1);
          step++;
          let f = 4;
          function waitFrames() {
            if (--f > 0) { requestAnimationFrame(waitFrames); return; }
            advance();
          }
          requestAnimationFrame(waitFrames);
        }
        advance();
      });
    });

    expect(errors).toHaveLength(0);
  });

  test('canvas continues rendering with dynamic shadows active', async ({ page }) => {
    await waitForGame(page);

    // Set to midday to ensure shadows are active
    await page.evaluate(() => {
      const lighting = (window as any).__lighting;
      if (lighting) lighting.setTimeOfDay(0.35);
    });
    await page.waitForTimeout(500);

    const pixels = await page.evaluate(() => {
      const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement;
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      function getPixelSum(): number {
        const data = ctx!.getImageData(100, 100, 50, 50).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += data[i] + data[i + 1] + data[i + 2];
        }
        return sum;
      }

      return new Promise<{ frame1: number; frame2: number }>((resolve) => {
        const f1 = getPixelSum();
        let frames = 5;
        function tick() {
          if (--frames > 0) { requestAnimationFrame(tick); return; }
          resolve({ frame1: f1, frame2: getPixelSum() });
        }
        requestAnimationFrame(tick);
      });
    });

    expect(pixels).not.toBeNull();
    expect(pixels!.frame1).toBeGreaterThan(0);
    expect(pixels!.frame2).toBeGreaterThan(0);
  });
});
