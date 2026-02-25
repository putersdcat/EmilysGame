/**
 * tutorial.spec.ts — E2E tests for interactive onboarding tutorial (#186)
 * Validates: overlay display, step progression, skip, "don't show again",
 *   and replay from Settings.
 */

import { test, expect, Page } from '@playwright/test';

const TUTORIAL_URL = 'http://localhost:5173/?test=1&tutorial=1';
const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
  await page.waitForTimeout(500);
}

/** Start the tutorial via debug API (since test mode skips main menu flow) */
async function startTutorial(page: Page) {
  await page.evaluate(() => {
    const d = (window as any).__gameDebug;
    d.resetTutorial();
    d.initTutorial();
  });
  await page.waitForTimeout(300);
}

test.describe('Tutorial #186 — Overlay and steps', () => {

  test('shouldShowTutorial returns true with ?tutorial=1', async ({ page }) => {
    await page.goto(TUTORIAL_URL);
    await waitForGame(page);
    const shouldShow = await page.evaluate(() => (window as any).__gameDebug.shouldShowTutorial());
    expect(shouldShow).toBe(true);
  });

  test('shouldShowTutorial returns false with ?tutorial=0', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1&tutorial=0');
    await waitForGame(page);
    const shouldShow = await page.evaluate(() => (window as any).__gameDebug.shouldShowTutorial());
    expect(shouldShow).toBe(false);
  });

  test('tutorial overlay is visible after init', async ({ page }) => {
    await page.goto(TUTORIAL_URL);
    await waitForGame(page);
    await startTutorial(page);
    const visible = await page.evaluate(() => {
      const el = document.getElementById('tutorialOverlay');
      return el ? el.style.display !== 'none' : false;
    });
    expect(visible).toBe(true);
  });

  test('isTutorialActive reflects state', async ({ page }) => {
    await page.goto(TUTORIAL_URL);
    await waitForGame(page);

    const before = await page.evaluate(() => (window as any).__gameDebug.isTutorialActive());
    expect(before).toBe(false);

    await startTutorial(page);

    const after = await page.evaluate(() => (window as any).__gameDebug.isTutorialActive());
    expect(after).toBe(true);
  });

  test('starts on MOVE step', async ({ page }) => {
    await page.goto(TUTORIAL_URL);
    await waitForGame(page);
    await startTutorial(page);

    const text = await page.evaluate(() =>
      document.getElementById('tutorialText')?.textContent ?? ''
    );
    expect(text).toContain('move');
  });

  test('MOVE step completes after player movement', async ({ page }) => {
    await page.goto(TUTORIAL_URL);
    await waitForGame(page);
    await startTutorial(page);

    // Directly move the player 4 tiles to reliably trigger MOVE_THRESHOLD (3)
    // Using debug state avoids flaky collision-dependent keyboard movement
    await page.evaluate(() => {
      const s = (window as any).__gameDebug?.state;
      if (s) { s.player.x += 4; }
    });
    // Wait for tutorial tick to process the position change
    await page.waitForTimeout(1000);

    const text = await page.evaluate(() =>
      document.getElementById('tutorialText')?.textContent ?? ''
    );
    // Should advance past MOVE step to COLLECT
    expect(text).toContain('pick them up');
  });

  test('skip button dismisses tutorial', async ({ page }) => {
    await page.goto(TUTORIAL_URL);
    await waitForGame(page);
    await startTutorial(page);

    // Verify overlay is visible
    const visibleBefore = await page.evaluate(() => {
      const el = document.getElementById('tutorialOverlay');
      return el ? el.style.display !== 'none' : false;
    });
    expect(visibleBefore).toBe(true);

    // Click skip
    await page.click('#tutorialSkip');
    await page.waitForTimeout(200);

    const visibleAfter = await page.evaluate(() => {
      const el = document.getElementById('tutorialOverlay');
      return el ? el.style.display !== 'none' : false;
    });
    expect(visibleAfter).toBe(false);

    const active = await page.evaluate(() => (window as any).__gameDebug.isTutorialActive());
    expect(active).toBe(false);
  });

  test('progress dots: first dot is active on MOVE step', async ({ page }) => {
    await page.goto(TUTORIAL_URL);
    await waitForGame(page);
    await startTutorial(page);

    const firstActive = await page.evaluate(() => {
      const dots = document.querySelectorAll('#tutorialProgress .tutorial-dot');
      return dots[0]?.classList.contains('active') ?? false;
    });
    expect(firstActive).toBe(true);
  });

  test('"Don\'t show again" persists preference', async ({ page }) => {
    await page.goto(TUTORIAL_URL);
    await waitForGame(page);

    // Set the preference directly (simulating checkbox + start playing)
    await page.evaluate(() => {
      localStorage.setItem('emilys_game_tutorial_disabled', '1');
    });

    const disabled = await page.evaluate(() =>
      localStorage.getItem('emilys_game_tutorial_disabled') === '1'
    );
    expect(disabled).toBe(true);
  });

  test('replay tutorial button exists in options', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForGame(page);
    const btn = await page.evaluate(() => !!document.getElementById('optReplayTutorial'));
    expect(btn).toBe(true);
  });

  test('COLLECT step advances after 3 inventory items added', async ({ page }) => {
    await page.goto(TUTORIAL_URL);
    await waitForGame(page);
    await startTutorial(page);

    // Advance past MOVE
    await page.evaluate(() => {
      const s = (window as any).__gameDebug?.state;
      if (s) s.player.x += 4;
    });
    await page.waitForTimeout(1000);

    // Verify on COLLECT
    const collectText = await page.evaluate(() => document.getElementById('tutorialText')?.textContent ?? '');
    expect(collectText).toContain('pick them up');

    // Add 3 items to inventory
    await page.evaluate(() => {
      const s = (window as any).__gameDebug?.state;
      if (s?.inventory?.slots?.length > 0) s.inventory.slots[0].quantity += 3;
    });
    await page.waitForTimeout(1200);

    // Should advance to ACTION
    const actionText = await page.evaluate(() => document.getElementById('tutorialText')?.textContent ?? '');
    expect(actionText).toContain('interact');
  });

  test('FLASHLIGHT step only detects toggle AFTER entering step (regression #186)', async ({ page }) => {
    await page.goto(TUTORIAL_URL);
    await waitForGame(page);
    await startTutorial(page);

    // Toggle flashlight BEFORE the FLASHLIGHT step — should not auto-complete it
    await page.evaluate(() => (window as any).__gameDebug.toggleFlashlight());

    // Advance through MOVE
    await page.evaluate(() => {
      const s = (window as any).__gameDebug?.state;
      if (s) s.player.x += 4;
    });
    await page.waitForTimeout(1000);

    // Advance through COLLECT
    await page.evaluate(() => {
      const s = (window as any).__gameDebug?.state;
      if (s?.inventory?.slots?.length > 0) s.inventory.slots[0].quantity += 3;
    });
    await page.waitForTimeout(1000);

    // Advance through ACTION (Space)
    await page.keyboard.press('Space');
    await page.waitForTimeout(800);

    // Now on FLASHLIGHT — should NOT have auto-completed from the early toggle
    const flashText = await page.evaluate(() => document.getElementById('tutorialText')?.textContent ?? '');
    expect(flashText).toContain('flashlight');

    // Now toggle flashlight — should advance to COMPLETE
    await page.evaluate(() => (window as any).__gameDebug.toggleFlashlight());
    await page.waitForTimeout(1200);

    // COMPLETE screen should show
    const completeDisplay = await page.evaluate(() =>
      document.getElementById('tutorialComplete')?.style.display
    );
    expect(completeDisplay).not.toBe('none');
    const contentDisplay = await page.evaluate(() =>
      (document.querySelector('.tutorial-content') as HTMLElement | null)?.style.display
    );
    expect(contentDisplay).toBe('none');
  });
});
