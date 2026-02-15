/**
 * thought-bubbles.spec.ts — E2E tests for the contextual thought/speech bubble system (#71).
 * Tests: trigger, queue, priority, cooldown, dismiss, and DOM rendering.
 */
import { test, expect } from '@playwright/test';

const GAME_URL = '/?test=1';

// Helper: Wait for game to be initialized and ready
async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(GAME_URL);
  await page.waitForFunction(() => (window as any).__gameState?.initialized, { timeout: 30000 });
  // Wait for bubble API to be exposed
  await page.waitForFunction(() => (window as any).__bubbles?.triggerHint, { timeout: 5000 });
}

test.describe('Thought Bubbles (#71)', () => {
  test('bubble DOM element exists and is hidden by default', async ({ page }) => {
    await waitForGame(page);
    const bubble = page.locator('#thoughtBubble');
    await expect(bubble).toHaveCount(1);
    // Should be hidden initially
    const display = await bubble.evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('triggering a hint shows a bubble after tick', async ({ page }) => {
    await waitForGame(page);

    // Reset cooldowns so we can trigger freely
    await page.evaluate(() => {
      const b = (window as any).__bubbles;
      b.resetCooldowns();
      b.clearBubbles();
    });

    // Trigger a hint and tick
    const state = await page.evaluate(() => {
      const b = (window as any).__bubbles;
      b.triggerHint('low_coins');
      b.tickBubbles();
      return b.getBubbleState();
    });

    expect(state.active).not.toBeNull();
    expect(state.active.id).toBe('low_coins');
    expect(state.active.type).toBe('thought');

    // DOM should be visible
    const display = await page.locator('#thoughtBubble').evaluate(el => el.style.display);
    expect(display).toBe('block');
  });

  test('bubble respects cooldown', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const b = (window as any).__bubbles;
      b.resetCooldowns();
      b.clearBubbles();

      // Trigger and show hint
      b.triggerHint('near_npc');
      b.tickBubbles();
      const first = b.getBubbleState();

      // Dismiss and try triggering the same hint again
      b.dismissBubble();
      b.triggerHint('near_npc');
      b.tickBubbles();
      const second = b.getBubbleState();

      return { first, second };
    });

    // First trigger should work
    expect(result.first.active).not.toBeNull();
    expect(result.first.active.id).toBe('near_npc');

    // Second trigger should be blocked by cooldown
    expect(result.second.active).toBeNull();
  });

  test('higher priority hint bumps lower in queue', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const b = (window as any).__bubbles;
      b.resetCooldowns();
      b.clearBubbles();

      // Queue low priority first, then high priority
      b.triggerHint('far_from_spawn');   // priority 1
      b.triggerHint('danger_zone');      // priority 7

      // Don't tick yet — check queue order
      const state = b.getBubbleState();

      // Tick to promote highest priority
      b.tickBubbles();
      const active = b.getBubbleState();

      return { queueLength: state.queueLength, active };
    });

    // Both should have been queued
    expect(result.queueLength).toBe(2);

    // Highest priority should be promoted to active
    expect(result.active.active).not.toBeNull();
    expect(result.active.active.id).toBe('danger_zone');
  });

  test('dismissBubble hides the active bubble', async ({ page }) => {
    await waitForGame(page);

    await page.evaluate(() => {
      const b = (window as any).__bubbles;
      b.resetCooldowns();
      b.clearBubbles();
      b.triggerHint('near_chest');
      b.tickBubbles();
    });

    // Verify it's active
    let state = await page.evaluate(() => (window as any).__bubbles.getBubbleState());
    expect(state.active).not.toBeNull();

    // Dismiss
    await page.evaluate(() => {
      const b = (window as any).__bubbles;
      b.dismissBubble();
    });

    state = await page.evaluate(() => (window as any).__bubbles.getBubbleState());
    expect(state.active).toBeNull();

    // DOM should be hidden
    const display = await page.locator('#thoughtBubble').evaluate(el => el.style.display);
    expect(display).toBe('none');
  });

  test('clearBubbles removes everything', async ({ page }) => {
    await waitForGame(page);

    await page.evaluate(() => {
      const b = (window as any).__bubbles;
      b.resetCooldowns();
      b.clearBubbles();

      // Queue multiple, activate one
      b.triggerHint('low_coins');
      b.triggerHint('near_npc');
      b.tickBubbles();
    });

    let state = await page.evaluate(() => (window as any).__bubbles.getBubbleState());
    expect(state.active).not.toBeNull();

    // Clear all
    await page.evaluate(() => (window as any).__bubbles.clearBubbles());
    state = await page.evaluate(() => (window as any).__bubbles.getBubbleState());
    expect(state.active).toBeNull();
    expect(state.queueLength).toBe(0);
  });

  test('thought vs speech styling', async ({ page }) => {
    await waitForGame(page);

    // Trigger a thought-type hint
    await page.evaluate(() => {
      const b = (window as any).__bubbles;
      b.resetCooldowns();
      b.clearBubbles();
      b.updateBubblePosition(400, 300);
      b.triggerHint('low_coins');  // type: 'thought'
      b.tickBubbles();
    });

    const bubbleEl = page.locator('#thoughtBubble');
    const classes = await bubbleEl.getAttribute('class');
    expect(classes).toContain('bubble-thought');

    // Now trigger a speech-type hint (full reset including cooldowns)
    // Wait for MIN_BUBBLE_GAP (2000ms) so the arbiter allows a new bubble
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const b = (window as any).__bubbles;
      b.clearBubbles();
      b.resetCooldowns();
      b.triggerHint('wildlife_spotted');  // type: 'speech'
      b.tickBubbles();
    });

    // Verify the speech bubble is active
    const state2 = await page.evaluate(() => (window as any).__bubbles.getBubbleState());
    expect(state2.active).not.toBeNull();
    expect(state2.active.id).toBe('wildlife_spotted');

    const classes2 = await bubbleEl.getAttribute('class');
    expect(classes2).toContain('bubble-speech');
  });

  test('bubble text and emoji render correctly', async ({ page }) => {
    await waitForGame(page);

    await page.evaluate(() => {
      const b = (window as any).__bubbles;
      b.resetCooldowns();
      b.clearBubbles();
      b.updateBubblePosition(400, 300);
      b.triggerHint('no_keys');
      b.tickBubbles();
    });

    const emoji = await page.locator('#bubbleEmoji').textContent();
    const text = await page.locator('#bubbleText').textContent();
    expect(emoji).toBe('🔑');
    expect(text).toBe('I need a key to open locked gates!');
  });

  test('bubble auto-expires after duration', async ({ page }) => {
    await waitForGame(page);

    // Clear everything and use a high-priority custom hint with short 1s duration
    // so game-loop triggers (which are lower priority) don't interfere
    await page.evaluate(() => {
      const b = (window as any).__bubbles;
      b.clearBubbles();
      b.resetCooldowns();
      b.updateBubblePosition(400, 300);
      // Use triggerHint with a known short hint — but hints config has 3s min.
      // Instead just trigger and wait.
      b.triggerHint('wildlife_spotted'); // 2500ms duration, priority 2
      b.tickBubbles();
    });

    // Verify active
    let state = await page.evaluate(() => (window as any).__bubbles.getBubbleState());
    expect(state.active).not.toBeNull();
    expect(state.active.id).toBe('wildlife_spotted');

    // Wait for natural expiry (2500ms + margin)
    await page.waitForTimeout(3500);

    // Clear queue first (game loop may have added more), then tick to expire
    await page.evaluate(() => {
      const b = (window as any).__bubbles;
      // Only clear the queue, don't clear active (we want to test expiry)
      b.tickBubbles();
    });
    state = await page.evaluate(() => (window as any).__bubbles.getBubbleState());
    // The original bubble should have expired
    if (state.active) {
      expect(state.active.id).not.toBe('wildlife_spotted');
    }
  });
});
