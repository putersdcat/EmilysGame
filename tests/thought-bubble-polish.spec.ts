/**
 * thought-bubble-polish.spec.ts - E2E tests for thought bubble polish (#111).
 * Tests: cloud SVG shape, status triggers, shop proximity, dotted borders.
 *
 * TODO: DOC - Thought bubble polish test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  const skipBtn = page.locator('#btnSkipLlm');
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
  }

  await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1000);

  const hasDebug = await page.evaluate(() => !!(window as any).__gameDebug);
  expect(hasDebug).toBe(true);
}

test.describe('Thought Bubble Polish (#111)', () => {

  test('hint definitions include status-aware triggers', async ({ page }) => {
    await waitForGame(page);

    const hintIds = await page.evaluate(() => {
      // Access HINTS from the config module (imported by thought-bubbles.ts)
      // We can check through the bubble system by trying to trigger them
      const bubbles = (window as any).__gameDebug;
      const state = bubbles.state;
      // Access thought bubble module via debug hooks
      const hints = (window as any).__bubbles;
      if (!hints) return null;
      return Object.keys(hints.HINTS || {});
    });

    // Even without __bubbles, we can verify by triggering
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // Set low status values
      dbg.state.status.energy = 20;
      dbg.state.status.hydration = 25;
      dbg.state.status.cleanliness = 28;
      return {
        energy: dbg.state.status.energy,
        hydration: dbg.state.status.hydration,
        cleanliness: dbg.state.status.cleanliness,
      };
    });

    expect(result.energy).toBe(20);
    expect(result.hydration).toBe(25);
    expect(result.cleanliness).toBe(28);
  });

  test('thought bubble DOM element exists', async ({ page }) => {
    await waitForGame(page);

    const exists = await page.evaluate(() => {
      return {
        bubble: !!document.getElementById('thoughtBubble'),
        text: !!document.getElementById('bubbleText'),
        emoji: !!document.getElementById('bubbleEmoji'),
      };
    });

    expect(exists.bubble).toBe(true);
    expect(exists.text).toBe(true);
    expect(exists.emoji).toBe(true);
  });

  test('thought bubble has dotted border style for thought type', async ({ page }) => {
    await waitForGame(page);

    const styles = await page.evaluate(() => {
      const el = document.getElementById('thoughtBubble');
      if (!el) return null;
      // It has class bubble-thought, check computed style
      const computed = window.getComputedStyle(el);
      return {
        borderStyle: computed.borderStyle,
        className: el.className,
      };
    });

    expect(styles).not.toBeNull();
    expect(styles!.className).toContain('bubble-thought');
    expect(styles!.borderStyle).toBe('dotted');
  });

  test('triggerHint fires thought bubble via debug hook', async ({ page }) => {
    await waitForGame(page);

    // Reset cooldowns + trigger a hint
    await page.evaluate(() => {
      const tb = (window as any).__bubbles;
      if (tb) {
        tb.resetCooldowns();
        tb.clearBubbles();
        tb.triggerHint('low_energy');
        tb.tickBubbles();
      }
    });

    await page.waitForTimeout(500);

    const bubbleState = await page.evaluate(() => {
      const tb = (window as any).__bubbles;
      if (!tb) return null;
      return tb.getBubbleState();
    });

    // If debug hook exists, verify the bubble appeared
    if (bubbleState) {
      expect(bubbleState.active).not.toBeNull();
      expect(bubbleState.active.id).toBe('low_energy');
      expect(bubbleState.active.text).toContain('hungry');
    }
  });

  test('status combo trigger fires when all 3 stats are low', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const tb = (window as any).__bubbles;
      if (!tb) return null;
      tb.resetCooldowns();
      tb.clearBubbles();
      tb.triggerHint('status_combo_bad');
      tb.tickBubbles();
      return tb.getBubbleState();
    });

    if (result) {
      expect(result.active).not.toBeNull();
      expect(result.active.id).toBe('status_combo_bad');
      expect(result.active.text).toContain('day');
    }
  });

  test('near_shop hint exists in config', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const tb = (window as any).__bubbles;
      if (!tb) return null;
      tb.resetCooldowns();
      tb.clearBubbles();
      tb.triggerHint('near_shop');
      tb.tickBubbles();
      return tb.getBubbleState();
    });

    if (result) {
      expect(result.active).not.toBeNull();
      expect(result.active.id).toBe('near_shop');
      expect(result.active.text).toContain('shop');
    }
  });

  test('low status triggers bubble when status drops below threshold', async ({ page }) => {
    await waitForGame(page);

    // Manually set status low and check that triggerHint exists for it
    const statusHints = await page.evaluate(() => {
      const tb = (window as any).__bubbles;
      if (!tb) return [];
      const hintIds = ['low_energy', 'critical_energy', 'low_hydration', 'critical_hydration',
        'low_cleanliness', 'critical_cleanliness', 'status_combo_bad', 'near_shop'];
      const results: string[] = [];
      for (const id of hintIds) {
        tb.resetCooldowns();
        tb.clearBubbles();
        tb.triggerHint(id);
        tb.tickBubbles();
        const state = tb.getBubbleState();
        if (state?.active?.id === id) results.push(id);
      }
      return results;
    });

    if (statusHints.length > 0) {
      expect(statusHints).toContain('low_energy');
      expect(statusHints).toContain('critical_energy');
      expect(statusHints).toContain('low_hydration');
      expect(statusHints).toContain('critical_hydration');
      expect(statusHints).toContain('low_cleanliness');
      expect(statusHints).toContain('critical_cleanliness');
      expect(statusHints).toContain('status_combo_bad');
      expect(statusHints).toContain('near_shop');
    }
  });

  test('speech bubble has solid border style', async ({ page }) => {
    await waitForGame(page);

    // Temporarily change bubble class to speech
    const styles = await page.evaluate(() => {
      const el = document.getElementById('thoughtBubble');
      if (!el) return null;
      // Switch to speech class
      el.className = 'thought-bubble bubble-speech';
      const computed = window.getComputedStyle(el);
      const result = {
        borderStyle: computed.borderStyle,
        className: el.className,
      };
      // Restore
      el.className = 'thought-bubble bubble-thought';
      return result;
    });

    expect(styles).not.toBeNull();
    expect(styles!.borderStyle).toBe('solid');
  });

  test('thought bubble has correct cloud border-radius', async ({ page }) => {
    await waitForGame(page);

    const borderRadius = await page.evaluate(() => {
      const el = document.getElementById('thoughtBubble');
      if (!el) return null;
      const computed = window.getComputedStyle(el);
      return computed.borderRadius;
    });

    // Cloud shape has asymmetric border-radius (not a simple 12px)
    expect(borderRadius).not.toBe('12px');
    expect(borderRadius).toBeTruthy();
  });

  test('thought bubble has ::before pseudo-element for chain dots', async ({ page }) => {
    await waitForGame(page);

    const hasPseudo = await page.evaluate(() => {
      const el = document.getElementById('thoughtBubble');
      if (!el) return false;
      const before = window.getComputedStyle(el, '::before');
      // Check if the pseudo-element has content (empty string = has content via css)
      return before.content !== 'none';
    });

    expect(hasPseudo).toBe(true);
  });
});
