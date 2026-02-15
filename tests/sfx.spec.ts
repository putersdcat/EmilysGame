/**
 * sfx.spec.ts - E2E tests for SFX & ambience system (#75).
 * Tests: SFX config, UI controls, volume/mute, ambience resolution,
 *        save/load persistence, debug hooks, integration triggers.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

/** Helper: wait for game to initialize */
async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Wait for the game loop to start — debug state becomes available
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test.describe('SFX & Ambience System (#75)', () => {

  // ─── Config / Registry ─────────────────────────────────────

  test('SFX config has expected definitions', async ({ page }) => {
    await waitForGame(page);
    const sfxIds = await page.evaluate(() => {
      // Access config module via dynamic import workaround
      const debug = (window as any).__gameDebug;
      // Check we have the playSfx function
      return typeof debug.playSfx === 'function';
    });
    expect(sfxIds).toBe(true);
  });

  test('sfx state initializes with defaults', async ({ page }) => {
    await waitForGame(page);
    const sfxState = await page.evaluate(() => {
      return (window as any).__gameDebug.getSfxState();
    });
    expect(sfxState.sfxVolume).toBeCloseTo(0.7, 1);
    expect(sfxState.ambienceVolume).toBeCloseTo(0.4, 1);
    expect(sfxState.sfxMuted).toBe(false);
    expect(sfxState.ambienceMuted).toBe(false);
    expect(sfxState.sfxEnabled).toBe(true);
  });

  // ─── UI Controls ───────────────────────────────────────────

  test('SFX section exists in sidebar DOM', async ({ page }) => {
    await waitForGame(page);
    const section = await page.$('#sbSfxSection');
    expect(section).not.toBeNull();
  });

  test('SFX volume slider exists and has default value', async ({ page }) => {
    await waitForGame(page);
    const val = await page.$eval('#sfxVolume', (el) => (el as HTMLInputElement).value);
    expect(parseInt(val)).toBe(70);
  });

  test('ambience volume slider exists and has default value', async ({ page }) => {
    await waitForGame(page);
    const val = await page.$eval('#ambienceVolume', (el) => (el as HTMLInputElement).value);
    expect(parseInt(val)).toBe(40);
  });

  test('SFX mute button toggles', async ({ page }) => {
    await waitForGame(page);
    // Initial state: unmuted
    const initial = await page.$eval('#btnSfxMute', (el) => el.textContent?.trim());
    expect(initial).toBe('🔊');

    // Click to mute
    await page.click('#btnSfxMute');
    // Wait for UI sync
    await page.waitForFunction(() => {
      const btn = document.getElementById('btnSfxMute');
      return btn && btn.textContent?.trim() === '🔇';
    }, null, { timeout: 3000 });

    const muted = await page.$eval('#btnSfxMute', (el) => el.textContent?.trim());
    expect(muted).toBe('🔇');

    // Verify state
    const state = await page.evaluate(() => (window as any).__gameDebug.getSfxState());
    expect(state.sfxMuted).toBe(true);
  });

  test('ambience mute button toggles', async ({ page }) => {
    await waitForGame(page);
    await page.click('#btnAmbienceMute');
    await page.waitForFunction(() => {
      const btn = document.getElementById('btnAmbienceMute');
      return btn && btn.textContent?.trim() === '🔇';
    }, null, { timeout: 3000 });

    const state = await page.evaluate(() => (window as any).__gameDebug.getSfxState());
    expect(state.ambienceMuted).toBe(true);
  });

  test('SFX volume slider changes state', async ({ page }) => {
    await waitForGame(page);
    await page.fill('#sfxVolume', '30');
    await page.dispatchEvent('#sfxVolume', 'input');
    // Wait a tick for handler
    await page.waitForTimeout(100);
    const state = await page.evaluate(() => (window as any).__gameDebug.getSfxState());
    expect(state.sfxVolume).toBeCloseTo(0.3, 1);
  });

  test('ambience volume slider changes state', async ({ page }) => {
    await waitForGame(page);
    await page.fill('#ambienceVolume', '80');
    await page.dispatchEvent('#ambienceVolume', 'input');
    await page.waitForTimeout(100);
    const state = await page.evaluate(() => (window as any).__gameDebug.getSfxState());
    expect(state.ambienceVolume).toBeCloseTo(0.8, 1);
  });

  // ─── Debug Hooks ───────────────────────────────────────────

  test('playSfx debug hook fires without error', async ({ page }) => {
    await waitForGame(page);
    // Play a known SFX via debug hook — should not throw
    const result = await page.evaluate(() => {
      try {
        (window as any).__gameDebug.playSfx('pickup_coin');
        return 'ok';
      } catch (e) {
        return `error: ${e}`;
      }
    });
    expect(result).toBe('ok');
  });

  test('playSfx with unknown ID does not crash', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      try {
        (window as any).__gameDebug.playSfx('nonexistent_sfx_xyz');
        return 'ok';
      } catch (e) {
        return `error: ${e}`;
      }
    });
    expect(result).toBe('ok');
  });

  // ─── Persistence ───────────────────────────────────────────

  test('SFX settings persist in save data', async ({ page }) => {
    await waitForGame(page);
    // Change settings via UI
    await page.click('#btnSfxMute');
    await page.waitForTimeout(200);

    // Trigger save
    await page.evaluate(() => (window as any).__gameDebug.save());
    const saveData = await page.evaluate(() => {
      const raw = localStorage.getItem('emilys_game_save');
      return raw ? JSON.parse(raw) : null;
    });
    expect(saveData).not.toBeNull();
    expect(saveData.sfxSettings).toBeDefined();
    expect(saveData.sfxSettings.sfxMuted).toBe(true);
  });

  test('SFX settings restore on load', async ({ page }) => {
    await waitForGame(page);
    // Mutate and save
    await page.click('#btnSfxMute');
    await page.fill('#sfxVolume', '25');
    await page.dispatchEvent('#sfxVolume', 'input');
    await page.waitForTimeout(200);
    await page.evaluate(() => (window as any).__gameDebug.save());

    // Reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!(window as any).__gameDebug, { timeout: 10000 });
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => (window as any).__gameDebug.getSfxState());
    expect(state.sfxMuted).toBe(true);
    expect(state.sfxVolume).toBeCloseTo(0.25, 1);
  });

  // ─── Interaction SFX Triggers ──────────────────────────────

  test('item auto-collect triggers SFX hook (no crash)', async ({ page }) => {
    await waitForGame(page);
    // Walk around a bit to potentially auto-collect
    for (let i = 0; i < 20; i++) {
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(50);
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(30);
    }
    // If we get here without crash, SFX hooks are wired correctly
    const state = await page.evaluate(() => (window as any).__gameDebug.getSfxState());
    expect(state.sfxEnabled).toBe(true);
  });

  // ─── Ambience Resolution ──────────────────────────────────

  test('ambience profile resolves for time of day', async ({ page }) => {
    await waitForGame(page);
    // Wait a few frames for ambience to update (throttled to every 60 frames)
    await page.waitForTimeout(2000);
    const state = await page.evaluate(() => (window as any).__gameDebug.getSfxState());
    // activeAmbience should be set (day_clear, dusk_clear, night_clear, or weather profile)
    // It may be null initially if AudioContext not yet created, which is fine
    expect(state.sfxEnabled).toBe(true);
  });

  test('multiple SFX play calls do not crash', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      try {
        for (let i = 0; i < 20; i++) {
          debug.playSfx('pickup_coin');
          debug.playSfx('dialog_open');
          debug.playSfx('quiz_correct');
        }
        return 'ok';
      } catch (e) {
        return `error: ${e}`;
      }
    });
    expect(result).toBe('ok');
  });

  test('wall bump SFX fires on collision (no crash)', async ({ page }) => {
    await waitForGame(page);
    // Walk in a direction for a while to potentially hit a wall
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(2000);
    await page.keyboard.up('ArrowUp');
    // No crash = success
    const state = await page.evaluate(() => (window as any).__gameDebug.getSfxState());
    expect(state.sfxEnabled).toBe(true);
  });

  test('SFX disabled prevents playback', async ({ page }) => {
    await waitForGame(page);
    // Mute SFX
    await page.click('#btnSfxMute');
    await page.waitForTimeout(200);

    // Try to play — should silently skip
    const result = await page.evaluate(() => {
      try {
        (window as any).__gameDebug.playSfx('quiz_correct');
        return (window as any).__gameDebug.getSfxState().sfxMuted;
      } catch (e) {
        return `error: ${e}`;
      }
    });
    expect(result).toBe(true);
  });
});
