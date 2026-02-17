/**
 * tesla-mode.spec.ts — E2E tests for Tesla in-car browser mode (#185)
 * Validates: ?tesla=1 URL param, settings toggle, T badge, touch controls activation,
 *   conservative auto-detection heuristic, and ?tesla=0 force-disable.
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';
const TESLA_URL = 'http://localhost:5173/?test=1&tesla=1';
const TESLA_OFF_URL = 'http://localhost:5173/?test=1&tesla=0';

async function waitForGame(page: Page) {
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
  await page.waitForTimeout(500);
}

test.describe('Tesla Mode #185 — URL param activation', () => {

  test('?tesla=1 enables touch controls overlay', async ({ page }) => {
    await page.goto(TESLA_URL);
    await waitForGame(page);
    const overlayExists = await page.evaluate(() => !!document.getElementById('touchControlsOverlay'));
    expect(overlayExists).toBe(true);
  });

  test('?tesla=1 shows Tesla T badge', async ({ page }) => {
    await page.goto(TESLA_URL);
    await waitForGame(page);
    const badgeActive = await page.evaluate(() => {
      const badge = document.getElementById('teslaBadge');
      return badge?.classList.contains('active') ?? false;
    });
    expect(badgeActive).toBe(true);
  });

  test('?tesla=1 badge has SVG content', async ({ page }) => {
    await page.goto(TESLA_URL);
    await waitForGame(page);
    const hasSvg = await page.evaluate(() => {
      const badge = document.getElementById('teslaBadge');
      return badge?.querySelector('svg') !== null;
    });
    expect(hasSvg).toBe(true);
  });

  test('default (no tesla param) does NOT show Tesla badge', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForGame(page);
    const badgeActive = await page.evaluate(() => {
      const badge = document.getElementById('teslaBadge');
      return badge?.classList.contains('active') ?? false;
    });
    expect(badgeActive).toBe(false);
  });

  test('?tesla=0 force-disables even after localStorage enable', async ({ page }) => {
    // First enable via localStorage
    await page.goto(BASE_URL);
    await waitForGame(page);
    await page.evaluate(() => localStorage.setItem('emilys_game_tesla_mode', '1'));

    // Now visit with ?tesla=0 — should override localStorage
    await page.goto(TESLA_OFF_URL);
    await waitForGame(page);
    const badgeActive = await page.evaluate(() => {
      const badge = document.getElementById('teslaBadge');
      return badge?.classList.contains('active') ?? false;
    });
    expect(badgeActive).toBe(false);
  });
});

test.describe('Tesla Mode #185 — Settings toggle', () => {

  test('Tesla Mode select has off/on/auto options', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForGame(page);
    const options = await page.evaluate(() => {
      const select = document.getElementById('optTeslaMode') as HTMLSelectElement | null;
      if (!select) return null;
      return Array.from(select.options).map(o => o.value);
    });
    expect(options).toEqual(['off', 'on', 'auto']);
  });

  test('enabling Tesla mode via debug API activates badge', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForGame(page);

    await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.setTeslaMode(true);
      dbg.applyTeslaMode(true);
    });
    await page.waitForTimeout(300);

    const badgeActive = await page.evaluate(() => {
      const badge = document.getElementById('teslaBadge');
      return badge?.classList.contains('active') ?? false;
    });
    expect(badgeActive).toBe(true);
  });

  test('setTeslaMode persists to localStorage', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForGame(page);

    await page.evaluate(() => {
      (window as any).__gameDebug.setTeslaMode(true);
    });
    await page.waitForTimeout(200);

    const stored = await page.evaluate(() => localStorage.getItem('emilys_game_tesla_mode'));
    expect(stored).toBe('1');
  });

  test('disabling Tesla mode via debug API removes badge', async ({ page }) => {
    await page.goto(TESLA_URL);
    await waitForGame(page);

    // Badge should be active from ?tesla=1
    let badgeActive = await page.evaluate(() => {
      const badge = document.getElementById('teslaBadge');
      return badge?.classList.contains('active') ?? false;
    });
    expect(badgeActive).toBe(true);

    // Disable via debug API
    await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.setTeslaMode(false);
      dbg.applyTeslaMode(false);
    });
    await page.waitForTimeout(300);

    badgeActive = await page.evaluate(() => {
      const badge = document.getElementById('teslaBadge');
      return badge?.classList.contains('active') ?? false;
    });
    expect(badgeActive).toBe(false);
  });
});

test.describe('Tesla Mode #185 — Conservative auto-detection', () => {

  test('detectTeslaBrowser returns false on default Playwright UA', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForGame(page);
    // Playwright's default UA is not a Linux x86_64 Chrome-only UA
    const detected = await page.evaluate(() => {
      const ua = navigator.userAgent;
      const isLinuxChrome = /X11;\s*Linux\s+x86_64/.test(ua)
        && /Chrome\/\d/.test(ua)
        && !/Edg|Firefox|OPR|SamsungBrowser/.test(ua);
      return isLinuxChrome && window.innerWidth >= 1200 && window.innerHeight >= 600;
    });
    expect(detected).toBe(false);
  });

  test.describe('with real Tesla UA (Linux Chrome, no Tesla token)', () => {
    test.use({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.92 Safari/537.36',
      viewport: { width: 1920, height: 1200 },
    });

    test('auto-detect heuristic matches real Tesla UA + large viewport', async ({ page }) => {
      await page.goto(BASE_URL);
      await waitForGame(page);
      const detected = await page.evaluate(() => {
        const ua = navigator.userAgent;
        const isLinuxChrome = /X11;\s*Linux\s+x86_64/.test(ua)
          && /Chrome\/\d/.test(ua)
          && !/Edg|Firefox|OPR|SamsungBrowser/.test(ua);
        return isLinuxChrome && window.innerWidth >= 1200 && window.innerHeight >= 600;
      });
      expect(detected).toBe(true);
    });

    test('auto-detect does NOT auto-enable touch controls (conservative)', async ({ page }) => {
      // Even with matching UA, touch should NOT auto-show without explicit opt-in
      await page.goto(BASE_URL);
      await waitForGame(page);
      const overlayExists = await page.evaluate(() => !!document.getElementById('touchControlsOverlay'));
      expect(overlayExists).toBe(false);
    });
  });

  test.describe('with Edge on Linux (should not match)', () => {
    test.use({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0',
      viewport: { width: 1920, height: 1200 },
    });

    test('Edge on Linux does NOT trigger auto-detect', async ({ page }) => {
      await page.goto(BASE_URL);
      await waitForGame(page);
      const detected = await page.evaluate(() => {
        const ua = navigator.userAgent;
        const isLinuxChrome = /X11;\s*Linux\s+x86_64/.test(ua)
          && /Chrome\/\d/.test(ua)
          && !/Edg|Firefox|OPR|SamsungBrowser/.test(ua);
        return isLinuxChrome && window.innerWidth >= 1200 && window.innerHeight >= 600;
      });
      expect(detected).toBe(false);
    });
  });
});

test.describe('Tesla Mode #185 — Touch controls integration', () => {

  test('?tesla=1 creates joystick and action buttons', async ({ page }) => {
    await page.goto(TESLA_URL);
    await waitForGame(page);

    const elements = await page.evaluate(() => ({
      joystick: !!document.getElementById('touchJoystickZone'),
      actionBtn: !!document.getElementById('touchActionBtn'),
      flashlightBtn: !!document.getElementById('touchFlashlightBtn'),
      menuBtn: !!document.getElementById('touchMenuBtn'),
    }));
    expect(elements.joystick).toBe(true);
    expect(elements.actionBtn).toBe(true);
    expect(elements.flashlightBtn).toBe(true);
    expect(elements.menuBtn).toBe(true);
  });

  test('Tesla badge has accessible aria-label', async ({ page }) => {
    await page.goto(TESLA_URL);
    await waitForGame(page);
    const ariaLabel = await page.evaluate(() => {
      const badge = document.getElementById('teslaBadge');
      return badge?.getAttribute('aria-label');
    });
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel).toContain('Tesla');
  });
});
