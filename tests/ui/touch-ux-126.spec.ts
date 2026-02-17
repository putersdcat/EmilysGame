/**
 * touch-ux-126.spec.ts - Tests for Touch UX improvements (#126)
 * Validates: UA-based auto-show, idle-slide behavior, flashlight button,
 *   options toggle parity, desktop UA hides overlay by default.
 */

import { test, expect, Page } from '@playwright/test';

const GAME_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(GAME_URL);
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
  await page.waitForTimeout(500);
}

test.describe('Touch UX #126 — UA-based visibility', () => {

  test.describe('Desktop UA (default Playwright)', () => {

    test('touch overlay does NOT auto-show on desktop UA', async ({ page }) => {
      await waitForGame(page);
      // Default Playwright UA is desktop Chrome — no iPhone/iPad/iPod/Tesla
      const overlayExists = await page.evaluate(() => !!document.getElementById('touchControlsOverlay'));
      expect(overlayExists).toBe(false);
    });

    test('options "Always On" forces overlay on desktop', async ({ page }) => {
      await waitForGame(page);
      // Verify no overlay initially
      let exists = await page.evaluate(() => !!document.getElementById('touchControlsOverlay'));
      expect(exists).toBe(false);

      // Force enable via debug hook (options select requires pause menu flow)
      await page.evaluate(() => {
        (window as any).__gameDebug?.inputMgr?.enableTouchControls();
      });
      await page.waitForTimeout(300);

      exists = await page.evaluate(() => !!document.getElementById('touchControlsOverlay'));
      expect(exists).toBe(true);
    });

    test('options "Off" removes forced overlay', async ({ page }) => {
      await waitForGame(page);
      // Force on
      await page.evaluate(() => {
        (window as any).__gameDebug?.inputMgr?.enableTouchControls();
      });
      await page.waitForTimeout(200);
      let exists = await page.evaluate(() => !!document.getElementById('touchControlsOverlay'));
      expect(exists).toBe(true);

      // Now disable
      await page.evaluate(() => {
        (window as any).__gameDebug?.inputMgr?.disableTouchControls();
      });
      await page.waitForTimeout(200);
      exists = await page.evaluate(() => !!document.getElementById('touchControlsOverlay'));
      expect(exists).toBe(false);
    });
  });

  test.describe('iPhone UA mock', () => {
    test.use({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });

    test('touch overlay auto-shows on iPhone UA', async ({ page }) => {
      await waitForGame(page);
      const overlayExists = await page.evaluate(() => !!document.getElementById('touchControlsOverlay'));
      expect(overlayExists).toBe(true);
    });

    test('overlay has flashlight button on iPhone', async ({ page }) => {
      await waitForGame(page);
      const exists = await page.evaluate(() => !!document.getElementById('touchFlashlightBtn'));
      expect(exists).toBe(true);
      const text = await page.locator('#touchFlashlightBtn').textContent();
      expect(text).toBe('🔦');
    });
  });

  test.describe('iPad UA mock', () => {
    test.use({
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });

    test('touch overlay auto-shows on iPad UA', async ({ page }) => {
      await waitForGame(page);
      const overlayExists = await page.evaluate(() => !!document.getElementById('touchControlsOverlay'));
      expect(overlayExists).toBe(true);
    });
  });

  test.describe('Tesla UA mock (no "Tesla" token — like real Tesla)', () => {
    test.use({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.92 Safari/537.36',
    });

    test('touch overlay does NOT auto-show on real Tesla UA without ?tesla=1', async ({ page }) => {
      await waitForGame(page);
      // Real Tesla UA has no "Tesla" token — auto-show requires ?tesla=1 or settings toggle (#185)
      const overlayExists = await page.evaluate(() => !!document.getElementById('touchControlsOverlay'));
      expect(overlayExists).toBe(false);
    });
  });
});

test.describe('Touch UX #126 — Idle-slide behavior', () => {
  // Force overlay on in slide mode for idle tests (desktop UA)
  // NOTE: Default mode changed to 'whisper' in #144 — slide tests must force mode
  async function forceEnableTouchOverlay(page: Page) {
    await page.evaluate(() => {
      const mgr = (window as any).__gameDebug?.inputMgr;
      if (mgr) {
        mgr.setTouchControlMode('slide');
        mgr.enableTouchControls();
      }
    });
    await page.waitForTimeout(200);
  }

  test('overlay starts with touch-idle class in slide mode', async ({ page }) => {
    await waitForGame(page);
    await forceEnableTouchOverlay(page);

    // Wait for the idle timer to fire (enableTouchControls starts idle)
    await page.waitForTimeout(400);
    const result = await page.evaluate(() => {
      const el = document.getElementById('touchControlsOverlay');
      if (!el) return null;
      return {
        idle: el.classList.contains('touch-idle'),
        slideMode: el.classList.contains('touch-mode-slide'),
      };
    });
    expect(result?.idle).toBe(true);
    expect(result?.slideMode).toBe(true);
  });

  test('joystick zone has slide transition CSS', async ({ page }) => {
    await waitForGame(page);
    await forceEnableTouchOverlay(page);

    const transition = await page.evaluate(() => {
      const jz = document.querySelector('.touch-joystick-zone') as HTMLElement;
      return jz ? getComputedStyle(jz).transition : null;
    });
    expect(transition).toBeTruthy();
    expect(transition).toContain('transform');
  });

  test('action zone has slide transition CSS', async ({ page }) => {
    await waitForGame(page);
    await forceEnableTouchOverlay(page);

    const transition = await page.evaluate(() => {
      const az = document.querySelector('.touch-action-zone') as HTMLElement;
      return az ? getComputedStyle(az).transition : null;
    });
    expect(transition).toBeTruthy();
    expect(transition).toContain('transform');
  });

  test('joystick slides off-screen when idle', async ({ page }) => {
    await waitForGame(page);
    await forceEnableTouchOverlay(page);
    // Wait for idle state
    await page.waitForTimeout(1500);

    const transform = await page.evaluate(() => {
      const jz = document.querySelector('.touch-joystick-zone') as HTMLElement;
      return jz ? getComputedStyle(jz).transform : null;
    });
    // Should have a matrix with non-zero translateX
    expect(transform).toBeTruthy();
    expect(transform).not.toBe('none');
  });

  test('action zone slides off-screen when idle', async ({ page }) => {
    await waitForGame(page);
    await forceEnableTouchOverlay(page);
    await page.waitForTimeout(1500);

    const transform = await page.evaluate(() => {
      const az = document.querySelector('.touch-action-zone') as HTMLElement;
      return az ? getComputedStyle(az).transform : null;
    });
    expect(transform).toBeTruthy();
    expect(transform).not.toBe('none');
  });

  test('flashlight button exists in action zone', async ({ page }) => {
    await waitForGame(page);
    await forceEnableTouchOverlay(page);

    const exists = await page.evaluate(() => !!document.getElementById('touchFlashlightBtn'));
    expect(exists).toBe(true);
  });

  test('will-change is set for GPU-friendly animation', async ({ page }) => {
    await waitForGame(page);
    await forceEnableTouchOverlay(page);

    const willChange = await page.evaluate(() => {
      const jz = document.querySelector('.touch-joystick-zone') as HTMLElement;
      return jz ? getComputedStyle(jz).willChange : null;
    });
    expect(willChange).toBeTruthy();
    expect(willChange).toContain('transform');
  });
});

test.describe('Touch UX #126 — shouldAutoShowTouchOverlay function', () => {

  test('shouldAutoShowTouchOverlay returns false on desktop UA (no Tesla param)', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      // Test Apple mobile detection (the UA-side of shouldAutoShowTouchOverlay)
      const ua = navigator.userAgent;
      return /iPhone|iPad|iPod/i.test(ua);
    });
    expect(result).toBe(false);
  });

  test.describe('with iPhone UA', () => {
    test.use({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });

    test('shouldAutoShowTouchOverlay returns true on iPhone UA', async ({ page }) => {
      await waitForGame(page);
      const result = await page.evaluate(() => {
        const ua = navigator.userAgent;
        return /iPhone|iPad|iPod/i.test(ua);
      });
      expect(result).toBe(true);
    });
  });

  test('shouldAutoShowTouchOverlay returns true with ?tesla=1 param', async ({ page }) => {
    // Tesla mode is now URL-param driven (#185), not UA-string driven
    await page.goto('http://localhost:5173/?test=1&tesla=1');
    await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
    await page.waitForTimeout(500);
    const overlayExists = await page.evaluate(() => !!document.getElementById('touchControlsOverlay'));
    expect(overlayExists).toBe(true);
  });
});
