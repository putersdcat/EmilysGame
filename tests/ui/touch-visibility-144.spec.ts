/**
 * touch-visibility-144.spec.ts — Tests for 3-way touch control visibility (#144)
 * Validates: whisper (default), slide, visible modes + settings persistence + UI dropdowns
 */
import { test, expect, Page } from '@playwright/test';

const GAME_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(GAME_URL);
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
  await page.waitForTimeout(500);
}

// Enable touch and set a specific mode
async function enableWithMode(page: Page, mode: 'whisper' | 'slide' | 'visible') {
  await page.evaluate((m) => {
    const mgr = (window as any).__gameDebug?.inputMgr;
    if (mgr) {
      mgr.setTouchControlMode(m);
      mgr.enableTouchControls();
    }
  }, mode);
  await page.waitForTimeout(300);
}

// Helper to read overlay state after idle timer fires
async function getIdleState(page: Page) {
  return page.evaluate(() => {
    const el = document.getElementById('touchControlsOverlay');
    if (!el) return null;
    const jz = el.querySelector('.touch-joystick-zone') as HTMLElement | null;
    const az = el.querySelector('.touch-action-zone') as HTMLElement | null;
    return {
      classes: [...el.classList],
      joystick: jz
        ? { opacity: getComputedStyle(jz).opacity, transform: getComputedStyle(jz).transform }
        : null,
      action: az
        ? { opacity: getComputedStyle(az).opacity, transform: getComputedStyle(az).transform }
        : null,
    };
  });
}

test.describe('Touch Visibility #144 — Whisper mode (default)', () => {
  test('default touchControlMode is whisper', async ({ page }) => {
    await waitForGame(page);
    const mode = await page.evaluate(
      () => (window as any).__gameDebug?.inputMgr?.touchControlMode,
    );
    expect(mode).toBe('whisper');
  });

  test('whisper mode fades to low opacity, no slide', async ({ page }) => {
    await waitForGame(page);
    await enableWithMode(page, 'whisper');
    await page.waitForTimeout(1500); // wait for idle timer

    const state = await getIdleState(page);
    expect(state).toBeTruthy();
    expect(state!.classes).toContain('touch-mode-whisper');
    expect(state!.classes).toContain('touch-idle');
    // Opacity should be low (whisper = 0.15)
    expect(parseFloat(state!.joystick!.opacity)).toBeLessThanOrEqual(0.2);
    // Transform should be none (no slide)
    expect(state!.joystick!.transform).toBe('none');
    expect(state!.action!.transform).toBe('none');
  });

  test('whisper overlay has touch-mode-whisper class on overlay', async ({ page }) => {
    await waitForGame(page);
    await enableWithMode(page, 'whisper');
    const cls = await page.evaluate(() => {
      const el = document.getElementById('touchControlsOverlay');
      return el ? [...el.classList] : [];
    });
    expect(cls).toContain('touch-mode-whisper');
  });
});

test.describe('Touch Visibility #144 — Slide mode', () => {
  test('slide mode moves controls off-screen', async ({ page }) => {
    await waitForGame(page);
    await enableWithMode(page, 'slide');
    await page.waitForTimeout(1500);

    const state = await getIdleState(page);
    expect(state).toBeTruthy();
    expect(state!.classes).toContain('touch-mode-slide');
    expect(state!.classes).toContain('touch-idle');
    // Transform should NOT be none (controls slid off)
    expect(state!.joystick!.transform).not.toBe('none');
    expect(state!.action!.transform).not.toBe('none');
  });
});

test.describe('Touch Visibility #144 — Visible mode', () => {
  test('visible mode keeps controls at full opacity', async ({ page }) => {
    await waitForGame(page);
    await enableWithMode(page, 'visible');
    await page.waitForTimeout(1500); // even after idle timer

    const state = await getIdleState(page);
    expect(state).toBeTruthy();
    expect(state!.classes).toContain('touch-mode-visible');
    // NO touch-idle class
    expect(state!.classes).not.toContain('touch-idle');
    // Full opacity
    expect(state!.joystick!.opacity).toBe('1');
    expect(state!.action!.opacity).toBe('1');
    // No transform
    expect(state!.joystick!.transform).toBe('none');
    expect(state!.action!.transform).toBe('none');
  });
});

test.describe('Touch Visibility #144 — Settings persistence', () => {
  test('localStorage stores selected mode via sidebar', async ({ page }) => {
    await waitForGame(page);
    // Extra wait for sidebar wiring to complete after __gameDebug is set
    await page.waitForTimeout(500);

    // Verify sidebar element exists and handler is wired
    const handlerWired = await page.evaluate(() => {
      const sel = document.getElementById('sbTouchVisMode') as HTMLSelectElement | null;
      return sel ? typeof sel.onchange : 'no element';
    });
    expect(handlerWired).toBe('function');

    // Set mode via the sidebar dropdown (simulates user action)
    await page.selectOption('#sbTouchVisMode', 'slide');
    await page.waitForTimeout(200);

    const stored = await page.evaluate(() => localStorage.getItem('emilys_game_touch_vis'));
    expect(stored).toBe('slide');
  });

  test('mode persists across page reload', async ({ page }) => {
    await waitForGame(page);
    // Set mode to 'visible' via the sidebar to persist it properly
    await page.selectOption('#sbTouchVisMode', 'visible');
    await page.waitForTimeout(200);

    // Verify it was stored
    const stored = await page.evaluate(() => localStorage.getItem('emilys_game_touch_vis'));
    expect(stored).toBe('visible');

    // Reload
    await page.reload();
    await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
    await page.waitForTimeout(1000); // wait for init to complete

    const mode = await page.evaluate(
      () => (window as any).__gameDebug?.inputMgr?.touchControlMode,
    );
    expect(mode).toBe('visible');
  });
});

test.describe('Touch Visibility #144 — Options & Sidebar UI', () => {
  test('sidebar has touch visibility dropdown', async ({ page }) => {
    await waitForGame(page);
    const exists = await page.evaluate(() => !!document.getElementById('sbTouchVisMode'));
    expect(exists).toBe(true);
  });

  test('options panel has touch visibility dropdown', async ({ page }) => {
    await waitForGame(page);
    const exists = await page.evaluate(() => !!document.getElementById('optTouchVisibility'));
    expect(exists).toBe(true);
  });

  test('sidebar dropdown has 3 options', async ({ page }) => {
    await waitForGame(page);
    const options = await page.evaluate(() => {
      const sel = document.getElementById('sbTouchVisMode') as HTMLSelectElement | null;
      return sel ? [...sel.options].map((o) => o.value) : [];
    });
    expect(options).toEqual(['whisper', 'slide', 'visible']);
  });

  test('options dropdown has 3 options', async ({ page }) => {
    await waitForGame(page);
    const options = await page.evaluate(() => {
      const sel = document.getElementById('optTouchVisibility') as HTMLSelectElement | null;
      return sel ? [...sel.options].map((o) => o.value) : [];
    });
    expect(options).toEqual(['whisper', 'slide', 'visible']);
  });
});
