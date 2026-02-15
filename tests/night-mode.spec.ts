/**
 * night-mode.spec.ts - E2E tests for Issue #114:
 * Night Mode Completion — Fog-of-War, Night Desaturation, Glowing Eyes.
 * Tests: fog tracking, fog rendering, visibility radius, desaturation filter,
 * glowing eyes at night, flashlight reveal, save/load fog persistence.
 * TODO: DOC - #114 night mode test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

/** Wait for game to fully init, clear previous state */
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
  const hasState = await page.evaluate(() => !!(window as any).__gameState);
  expect(hasState).toBe(true);
}

// ─── Fog-of-War Tests ────────────────────────────────────────

test.describe('Fog-of-War (#114)', () => {
  test('fog system initializes enabled with visited cells around spawn', async ({ page }) => {
    await waitForGame(page);
    // Wait for fog update to tick (throttled every 6th frame)
    await page.waitForTimeout(1500);

    const info = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return {
        enabled: debug.isFogEnabled(),
        visitedCount: debug.getVisitedCount(),
      };
    });

    expect(info.enabled).toBe(true);
    // Player should have revealed cells around their spawn position after a few frames
    expect(info.visitedCount).toBeGreaterThan(0);
  });

  test('visiting new areas increases visited cell count', async ({ page }) => {
    await waitForGame(page);

    const initial = await page.evaluate(() => (window as any).__gameDebug.getVisitedCount());
    expect(initial).toBeGreaterThan(0);

    // Teleport the player far from spawn to discover entirely new territory
    await page.evaluate(() => {
      const state = (window as any).__gameState;
      state.player.x += 25;
      state.player.y += 25;
    });
    // Wait for multiple fog update ticks (throttled every 6th frame)
    await page.waitForTimeout(2000);

    const after = await page.evaluate(() => (window as any).__gameDebug.getVisitedCount());
    // After teleporting 25 cells away (beyond dayRadius=10), we should have many new cells
    expect(after).toBeGreaterThan(initial);
  });

  test('toggling fog disables and re-enables the overlay', async ({ page }) => {
    await waitForGame(page);

    const before = await page.evaluate(() => (window as any).__gameDebug.isFogEnabled());
    expect(before).toBe(true);

    await page.evaluate(() => (window as any).__gameDebug.toggleFog());
    const disabled = await page.evaluate(() => (window as any).__gameDebug.isFogEnabled());
    expect(disabled).toBe(false);

    await page.evaluate(() => (window as any).__gameDebug.toggleFog());
    const reEnabled = await page.evaluate(() => (window as any).__gameDebug.isFogEnabled());
    expect(reEnabled).toBe(true);
  });

  test('fog debug info reports correct data', async ({ page }) => {
    await waitForGame(page);

    const info = await page.evaluate(() => (window as any).__gameDebug.getFogDebug());
    expect(info).toHaveProperty('enabled');
    expect(info).toHaveProperty('visitedCount');
    expect(info).toHaveProperty('revealRadius');
    expect(typeof info.enabled).toBe('boolean');
    expect(typeof info.visitedCount).toBe('number');
    expect(typeof info.revealRadius).toBe('number');
    expect(info.revealRadius).toBeGreaterThan(0);
  });

  test('visibility radius shrinks at night', async ({ page }) => {
    await waitForGame(page);

    // Day radius
    await page.evaluate(() => (window as any).__gameDebug.setTimeOfDay(0.3));
    await page.waitForTimeout(200);
    const dayInfo = await page.evaluate(() => (window as any).__gameDebug.getFogDebug());

    // Night radius (without flashlight)
    await page.evaluate(() => (window as any).__gameDebug.setTimeOfDay(0.85));
    await page.waitForTimeout(200);
    const nightInfo = await page.evaluate(() => (window as any).__gameDebug.getFogDebug());

    expect(nightInfo.revealRadius).toBeLessThan(dayInfo.revealRadius);
  });
});

// ─── Night Desaturation Tests ────────────────────────────────

test.describe('Night Desaturation (#114)', () => {
  test('canvas has no filter during daytime', async ({ page }) => {
    await waitForGame(page);

    await page.evaluate(() => (window as any).__gameDebug.setTimeOfDay(0.3));
    // Wait for a couple render frames so the filter applies
    await page.waitForTimeout(300);

    const filter = await page.evaluate(() => {
      const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement;
      return canvas?.style.filter || '';
    });

    // During day, filter should be empty or gone
    expect(filter === '' || filter === 'none').toBe(true);
  });

  test('canvas gets desaturation filter at night', async ({ page }) => {
    await waitForGame(page);

    await page.evaluate(() => (window as any).__gameDebug.setTimeOfDay(0.85));
    await page.waitForTimeout(500);

    const filter = await page.evaluate(() => {
      const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement;
      return canvas?.style.filter || '';
    });

    expect(filter).toContain('saturate');
    expect(filter).toContain('brightness');

    // Parse saturate value — should be < 0.5 at full night
    const satMatch = filter.match(/saturate\(([0-9.]+)\)/);
    expect(satMatch).not.toBeNull();
    const satValue = parseFloat(satMatch![1]);
    expect(satValue).toBeLessThan(0.5);
  });

  test('desaturation smoothly transitions during dusk', async ({ page }) => {
    await waitForGame(page);

    // Early dusk — partial desaturation
    await page.evaluate(() => (window as any).__gameDebug.setTimeOfDay(0.70));
    await page.waitForTimeout(300);
    const earlyFilter = await page.evaluate(() => {
      const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement;
      return canvas?.style.filter || '';
    });

    // Late dusk — more desaturation
    await page.evaluate(() => (window as any).__gameDebug.setTimeOfDay(0.78));
    await page.waitForTimeout(300);
    const lateFilter = await page.evaluate(() => {
      const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement;
      return canvas?.style.filter || '';
    });

    // Both should have filters
    expect(earlyFilter).toContain('saturate');
    expect(lateFilter).toContain('saturate');

    // Late dusk should have lower saturation than early dusk
    const earlySat = parseFloat(earlyFilter.match(/saturate\(([0-9.]+)\)/)![1]);
    const lateSat = parseFloat(lateFilter.match(/saturate\(([0-9.]+)\)/)![1]);
    expect(lateSat).toBeLessThan(earlySat);
  });

  test('filter clears when returning to day', async ({ page }) => {
    await waitForGame(page);

    // Set to night
    await page.evaluate(() => (window as any).__gameDebug.setTimeOfDay(0.85));
    await page.waitForTimeout(300);
    const nightFilter = await page.evaluate(() => {
      const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement;
      return canvas?.style.filter || '';
    });
    expect(nightFilter).toContain('saturate');

    // Return to day
    await page.evaluate(() => (window as any).__gameDebug.setTimeOfDay(0.3));
    await page.waitForTimeout(300);
    const dayFilter = await page.evaluate(() => {
      const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement;
      return canvas?.style.filter || '';
    });
    expect(dayFilter === '' || dayFilter === 'none').toBe(true);
  });
});

// ─── Glowing Eyes Tests ──────────────────────────────────────

test.describe('Glowing Eyes & Flashlight Reveal (#114)', () => {
  test('revealedCreatures counter starts at zero', async ({ page }) => {
    await waitForGame(page);

    const count = await page.evaluate(() => (window as any).__gameDebug.getRevealedCreatures());
    expect(count).toBe(0);
  });

  test('time slot changes correctly via setTimeOfDay', async ({ page }) => {
    await waitForGame(page);

    // Day time
    await page.evaluate(() => (window as any).__gameDebug.setTimeOfDay(0.3));
    await page.waitForTimeout(200);
    const daySlot = await page.evaluate(() => (window as any).__gameDebug.getTimeSlot());
    expect(daySlot).toBe('day');

    // Dusk
    await page.evaluate(() => (window as any).__gameDebug.setTimeOfDay(0.70));
    await page.waitForTimeout(200);
    const duskSlot = await page.evaluate(() => (window as any).__gameDebug.getTimeSlot());
    expect(duskSlot).toBe('dusk');

    // Night
    await page.evaluate(() => (window as any).__gameDebug.setTimeOfDay(0.85));
    await page.waitForTimeout(200);
    const nightSlot = await page.evaluate(() => (window as any).__gameDebug.getTimeSlot());
    expect(nightSlot).toBe('night');
  });

  test('flashlight can be toggled via debug hook', async ({ page }) => {
    await waitForGame(page);

    const initial = await page.evaluate(() => (window as any).__gameDebug.isFlashlightOn());
    await page.evaluate(() => (window as any).__gameDebug.toggleFlashlight());
    const toggled = await page.evaluate(() => (window as any).__gameDebug.isFlashlightOn());
    expect(toggled).not.toBe(initial);

    // Toggle back
    await page.evaluate(() => (window as any).__gameDebug.toggleFlashlight());
    const restored = await page.evaluate(() => (window as any).__gameDebug.isFlashlightOn());
    expect(restored).toBe(initial);
  });
});

// ─── Save/Load Fog Persistence ───────────────────────────────

test.describe('Fog Save/Load (#114)', () => {
  test('fog visited state persists across save and reload', async ({ page }) => {
    await waitForGame(page);

    // Explore some area
    for (let i = 0; i < 6; i++) {
      await page.keyboard.down('d');
      await page.waitForTimeout(150);
      await page.keyboard.up('d');
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(600);

    const beforeSave = await page.evaluate(() => (window as any).__gameDebug.getVisitedCount());
    expect(beforeSave).toBeGreaterThan(0);

    // Save the game (auto-save)
    await page.evaluate(() => (window as any).__gameDebug.save());
    await page.waitForTimeout(300);

    // Reload page — game auto-loads save data on init
    await page.reload({ waitUntil: 'domcontentloaded' });
    const skipBtn = page.locator('#btnSkipLlm');
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
    await page.waitForTimeout(1500);

    const afterReload = await page.evaluate(() => (window as any).__gameDebug.getVisitedCount());
    // Fog visited cells should persist — at least as many as before
    // (may have a few more from updateFog ticking right after load)
    expect(afterReload).toBeGreaterThanOrEqual(beforeSave);
  });
});

// ─── Backward Compatibility & Rendering ──────────────────────

test.describe('Night Mode Backward Compat (#114)', () => {
  test('game still runs and renders with fog enabled', async ({ page }) => {
    await waitForGame(page);

    // Game should have rendered frames
    const hasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement;
      return !!canvas && canvas.width > 0 && canvas.height > 0;
    });
    expect(hasCanvas).toBe(true);

    // Performance should be acceptable (not broken by fog) — wait for fps to accumulate
    await page.waitForTimeout(1500);
    const fps = await page.evaluate(() => (window as any).__gameState.fps);
    expect(fps).toBeGreaterThan(5);
  });

  test('player can move normally with fog and night mode active', async ({ page }) => {
    await waitForGame(page);

    // Set night mode
    await page.evaluate(() => (window as any).__gameDebug.setTimeOfDay(0.85));
    await page.waitForTimeout(300);

    const posBefore = await page.evaluate(() => {
      const s = (window as any).__gameState;
      return { x: s.player.x, y: s.player.y };
    });

    // Move
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('w');
      await page.waitForTimeout(150);
      await page.keyboard.up('w');
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(300);

    const posAfter = await page.evaluate(() => {
      const s = (window as any).__gameState;
      return { x: s.player.x, y: s.player.y };
    });

    // Player should have moved
    const moved = posBefore.x !== posAfter.x || posBefore.y !== posAfter.y;
    expect(moved).toBe(true);
  });

  test('fog disabled via toggle allows rendering without overlay', async ({ page }) => {
    await waitForGame(page);

    await page.evaluate(() => (window as any).__gameDebug.setFogEnabled(false));
    await page.waitForTimeout(300);

    const disabled = await page.evaluate(() => !(window as any).__gameDebug.isFogEnabled());
    expect(disabled).toBe(true);

    // Game should still render fine
    await page.waitForTimeout(1500);
    const fps = await page.evaluate(() => (window as any).__gameState.fps);
    expect(fps).toBeGreaterThan(5);

    // Re-enable
    await page.evaluate(() => (window as any).__gameDebug.setFogEnabled(true));
  });
});
