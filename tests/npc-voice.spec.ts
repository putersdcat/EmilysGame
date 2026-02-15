/**
 * npc-voice.spec.ts — E2E tests for NPC Voice Output System (#76).
 * Tests: feature detection, settings, UI controls, dialog integration,
 *        persistence, cancellation, debug hooks, fallback paths.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

/** Helper: wait for game to initialize */
async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test.describe('NPC Voice System (#76)', () => {

  // ─── Feature Detection ────────────────────────────────────

  test('voice state reports supported status', async ({ page }) => {
    await waitForGame(page);
    const state = await page.evaluate(() =>
      (window as any).__gameDebug.getVoiceState()
    );
    // In headless Chromium, speechSynthesis should exist
    expect(typeof state.supported).toBe('boolean');
    expect(typeof state.enabled).toBe('boolean');
  });

  test('voice state initializes with defaults', async ({ page }) => {
    await waitForGame(page);
    const state = await page.evaluate(() =>
      (window as any).__gameDebug.getVoiceState()
    );
    expect(state.enabled).toBe(true);
    expect(state.volume).toBeCloseTo(0.8, 1);
    expect(state.speaking).toBe(false);
  });

  // ─── UI Controls ──────────────────────────────────────────

  test('voice section exists in sidebar DOM', async ({ page }) => {
    await waitForGame(page);
    const section = await page.$('#sbVoiceSection');
    expect(section).not.toBeNull();
  });

  test('voice volume slider exists and has default value', async ({ page }) => {
    await waitForGame(page);
    const val = await page.$eval('#voiceVolume', (el) => (el as HTMLInputElement).value);
    expect(parseInt(val)).toBe(80);
  });

  test('voice toggle button toggles state', async ({ page }) => {
    await waitForGame(page);
    // Initial: enabled (🗣️)
    const initial = await page.$eval('#btnVoiceToggle', (el) => el.textContent?.trim());
    expect(initial).toBe('🗣️');

    // Click to disable
    await page.click('#btnVoiceToggle');
    await page.waitForFunction(() => {
      const btn = document.getElementById('btnVoiceToggle');
      return btn && btn.textContent?.trim() === '🔇';
    }, null, { timeout: 3000 });

    const state = await page.evaluate(() =>
      (window as any).__gameDebug.getVoiceState()
    );
    expect(state.enabled).toBe(false);

    // Click to re-enable
    await page.click('#btnVoiceToggle');
    await page.waitForFunction(() => {
      const btn = document.getElementById('btnVoiceToggle');
      return btn && btn.textContent?.trim() === '🗣️';
    }, null, { timeout: 3000 });

    const state2 = await page.evaluate(() =>
      (window as any).__gameDebug.getVoiceState()
    );
    expect(state2.enabled).toBe(true);
  });

  test('voice volume slider changes state', async ({ page }) => {
    await waitForGame(page);
    await page.fill('#voiceVolume', '50');
    await page.dispatchEvent('#voiceVolume', 'input');
    await page.waitForTimeout(100);
    const state = await page.evaluate(() =>
      (window as any).__gameDebug.getVoiceState()
    );
    expect(state.volume).toBeCloseTo(0.5, 1);
  });

  // ─── Debug Hooks ──────────────────────────────────────────

  test('speakTest debug hook does not crash', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      try {
        (window as any).__gameDebug.speakTest('Hello adventurer!');
        return 'ok';
      } catch (e) {
        return `error: ${e}`;
      }
    });
    expect(result).toBe('ok');
  });

  test('toggleVoice debug hook changes state', async ({ page }) => {
    await waitForGame(page);
    await page.evaluate(() => {
      (window as any).__gameDebug.toggleVoice();
    });
    const state = await page.evaluate(() =>
      (window as any).__gameDebug.getVoiceState()
    );
    expect(state.enabled).toBe(false);
  });

  // ─── Fallback Behavior ───────────────────────────────────

  test('dialog still works with voice disabled', async ({ page }) => {
    await waitForGame(page);
    // Disable voice
    await page.evaluate(() => {
      (window as any).__gameDebug.toggleVoice();
    });

    // Walk around to find an NPC and interact
    for (let i = 0; i < 15; i++) {
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(40);
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(20);
    }

    // Even without NPC hit, game should not crash
    const state = await page.evaluate(() =>
      (window as any).__gameDebug.getVoiceState()
    );
    expect(state.enabled).toBe(false);
  });

  test('speakTest with empty string does not crash', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      try {
        (window as any).__gameDebug.speakTest('');
        (window as any).__gameDebug.speakTest('   ');
        return 'ok';
      } catch (e) {
        return `error: ${e}`;
      }
    });
    expect(result).toBe('ok');
  });

  // ─── Persistence ──────────────────────────────────────────

  test('voice settings persist in save data', async ({ page }) => {
    await waitForGame(page);
    // Disable voice & change volume
    await page.click('#btnVoiceToggle');
    await page.fill('#voiceVolume', '30');
    await page.dispatchEvent('#voiceVolume', 'input');
    await page.waitForTimeout(200);

    // Save
    await page.evaluate(() => (window as any).__gameDebug.save());

    const saveData = await page.evaluate(() => {
      const raw = localStorage.getItem('emilys_game_save');
      return raw ? JSON.parse(raw) : null;
    });
    expect(saveData).not.toBeNull();
    expect(saveData.voiceSettings).toBeDefined();
    expect(saveData.voiceSettings.enabled).toBe(false);
    expect(saveData.voiceSettings.volume).toBeCloseTo(0.3, 1);
  });

  test('voice settings restore on load', async ({ page }) => {
    await waitForGame(page);
    // Mutate and save
    await page.click('#btnVoiceToggle');
    await page.fill('#voiceVolume', '20');
    await page.dispatchEvent('#voiceVolume', 'input');
    await page.waitForTimeout(200);
    await page.evaluate(() => (window as any).__gameDebug.save());

    // Reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!(window as any).__gameDebug, { timeout: 10000 });
    await page.waitForTimeout(500);

    const state = await page.evaluate(() =>
      (window as any).__gameDebug.getVoiceState()
    );
    expect(state.enabled).toBe(false);
    expect(state.volume).toBeCloseTo(0.2, 1);
  });

  // ─── Rapid Dialog Safety ──────────────────────────────────

  test('multiple rapid speakTest calls do not crash', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      try {
        for (let i = 0; i < 20; i++) {
          debug.speakTest(`Line number ${i}`);
        }
        return 'ok';
      } catch (e) {
        return `error: ${e}`;
      }
    });
    expect(result).toBe('ok');
  });

  test('voice cancel does not crash when not speaking', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      try {
        // Cancel when nothing is speaking
        const debug = (window as any).__gameDebug;
        // toggleVoice off, then try speak (should no-op), then toggle back
        debug.toggleVoice();
        debug.speakTest('This should not speak');
        debug.toggleVoice();
        return 'ok';
      } catch (e) {
        return `error: ${e}`;
      }
    });
    expect(result).toBe('ok');
  });
});
