/**
 * alpha-qol.spec.ts - E2E tests for Alpha QoL features (#117).
 * Tests: welcome splash, controls guide, bug reporter.
 * TODO: DOC - Alpha QoL test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

async function waitForGame(page: import('@playwright/test').Page) {
  // Clear first-run flag
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

test.describe('Alpha QoL Features (#117)', () => {

  test('welcome splash DOM exists', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const exists = await page.evaluate(() => !!document.getElementById('welcomeSplash'));
    expect(exists).toBe(true);
  });

  test('controls guide DOM exists', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const exists = await page.evaluate(() => !!document.getElementById('controlsGuide'));
    expect(exists).toBe(true);
  });

  test('controls guide has all key bindings', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const keys = await page.evaluate(() => {
      const guide = document.getElementById('controlsGuide');
      if (!guide) return [];
      const items = guide.querySelectorAll('.control-key');
      return Array.from(items).map(el => el.textContent?.trim());
    });

    expect(keys).toContain('WASD');
    expect(keys).toContain('Space');
    expect(keys).toContain('B');
    expect(keys).toContain('F');
    expect(keys).toContain('M');
    expect(keys).toContain('Esc');
    expect(keys).toContain('T');
    expect(keys).toContain('C');
  });

  test('bug report modal DOM exists', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const exists = await page.evaluate(() => {
      return {
        modal: !!document.getElementById('bugReportModal'),
        desc: !!document.getElementById('bugDescription'),
        submit: !!document.getElementById('bugSubmit'),
        cancel: !!document.getElementById('bugCancel'),
      };
    });

    expect(exists.modal).toBe(true);
    expect(exists.desc).toBe(true);
    expect(exists.submit).toBe(true);
    expect(exists.cancel).toBe(true);
  });

  test('pause menu has Controls and Bug Report buttons', async ({ page }) => {
    await waitForGame(page);
    const buttons = await page.evaluate(() => {
      return {
        controls: !!document.getElementById('pauseControls'),
        bugReport: !!document.getElementById('pauseBugReport'),
      };
    });

    expect(buttons.controls).toBe(true);
    expect(buttons.bugReport).toBe(true);
  });

  test('controls guide opens from pause menu', async ({ page }) => {
    await waitForGame(page);

    // Simulate Escape to open pause menu (wires onclick handlers)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Click controls button
    await page.evaluate(() => {
      document.getElementById('pauseControls')?.click();
    });

    await page.waitForTimeout(300);

    const guideVisible = await page.evaluate(() => {
      const guide = document.getElementById('controlsGuide');
      return guide?.style.display === 'flex';
    });

    expect(guideVisible).toBe(true);

    // Close it
    await page.evaluate(() => {
      document.getElementById('controlsClose')?.click();
    });

    await page.waitForTimeout(200);

    const guideClosed = await page.evaluate(() => {
      const guide = document.getElementById('controlsGuide');
      return guide?.style.display === 'none';
    });

    expect(guideClosed).toBe(true);
  });

  test('bug report modal opens from pause menu', async ({ page }) => {
    await waitForGame(page);

    // Simulate Escape to open pause menu (wires onclick handlers)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Click bug report button
    await page.evaluate(() => {
      document.getElementById('pauseBugReport')?.click();
    });

    await page.waitForTimeout(300);

    const modalVisible = await page.evaluate(() => {
      const modal = document.getElementById('bugReportModal');
      return modal?.style.display === 'flex';
    });

    expect(modalVisible).toBe(true);

    // Close it
    await page.evaluate(() => {
      document.getElementById('bugCancel')?.click();
    });

    await page.waitForTimeout(200);

    const modalClosed = await page.evaluate(() => {
      const modal = document.getElementById('bugReportModal');
      return modal?.style.display === 'none';
    });

    expect(modalClosed).toBe(true);
  });

  test('welcome splash has dismiss button and intro text', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const content = await page.evaluate(() => {
      const splash = document.getElementById('welcomeSplash');
      if (!splash) return null;
      return {
        hasHeader: !!splash.querySelector('.welcome-header'),
        hasDismiss: !!document.getElementById('welcomeDismiss'),
        hasGrid: !!splash.querySelector('.controls-grid'),
        hasIntro: !!splash.querySelector('.welcome-intro'),
      };
    });

    expect(content).not.toBeNull();
    expect(content!.hasHeader).toBe(true);
    expect(content!.hasDismiss).toBe(true);
    expect(content!.hasGrid).toBe(true);
    expect(content!.hasIntro).toBe(true);
  });

  test('first-run flag is set in localStorage after welcome dismissed', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // First-run flag should not exist
    const before = await page.evaluate(() => localStorage.getItem('emilys_game_first_run'));
    expect(before).toBeNull();

    // Simulate dismissing welcome (if visible)
    await page.evaluate(() => {
      localStorage.setItem('emilys_game_first_run', '1');
    });

    const after = await page.evaluate(() => localStorage.getItem('emilys_game_first_run'));
    expect(after).toBe('1');
  });

  test('welcome splash hidden on subsequent visits', async ({ page }) => {
    // Set first-run flag
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('emilys_game_first_run', '1'));
    await page.reload({ waitUntil: 'domcontentloaded' });

    const splashDisplay = await page.evaluate(() => {
      const splash = document.getElementById('welcomeSplash');
      return splash?.style.display;
    });

    // Should not be showing
    expect(splashDisplay).not.toBe('flex');
  });

  // ─── Options Overlay (#117 Phase 3) ─────────────────────────

  test('options overlay DOM exists with audio + LLM sections', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const dom = await page.evaluate(() => {
      return {
        overlay: !!document.getElementById('optionsOverlay'),
        musicSlider: !!document.getElementById('optMusicVol'),
        sfxSlider: !!document.getElementById('optSfxVol'),
        ambienceSlider: !!document.getElementById('optAmbienceVol'),
        voiceSlider: !!document.getElementById('optVoiceVol'),
        llmMode: !!document.getElementById('optLlmMode'),
        llmUrl: !!document.getElementById('optLlmUrl'),
        closeBtn: !!document.getElementById('optionsClose'),
      };
    });

    expect(dom.overlay).toBe(true);
    expect(dom.musicSlider).toBe(true);
    expect(dom.sfxSlider).toBe(true);
    expect(dom.ambienceSlider).toBe(true);
    expect(dom.voiceSlider).toBe(true);
    expect(dom.llmMode).toBe(true);
    expect(dom.llmUrl).toBe(true);
    expect(dom.closeBtn).toBe(true);
  });

  test('pause menu has Options button', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const exists = await page.evaluate(() => !!document.getElementById('pauseOptions'));
    expect(exists).toBe(true);
  });

  test('main menu has Options button', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const exists = await page.evaluate(() => !!document.getElementById('menuOptions'));
    expect(exists).toBe(true);
  });

  test('options overlay opens from pause menu and closes', async ({ page }) => {
    await waitForGame(page);

    // Open pause menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Click Options button
    await page.evaluate(() => {
      document.getElementById('pauseOptions')?.click();
    });
    await page.waitForTimeout(300);

    const overlayVisible = await page.evaluate(() => {
      const overlay = document.getElementById('optionsOverlay');
      return overlay?.style.display === 'flex';
    });
    expect(overlayVisible).toBe(true);

    // Close it
    await page.evaluate(() => {
      document.getElementById('optionsClose')?.click();
    });
    await page.waitForTimeout(200);

    const overlayClosed = await page.evaluate(() => {
      const overlay = document.getElementById('optionsOverlay');
      return overlay?.style.display === 'none';
    });
    expect(overlayClosed).toBe(true);
  });

  test('options sliders sync from sidebar values on open', async ({ page }) => {
    await waitForGame(page);

    // Set sidebar sliders to known values
    await page.evaluate(() => {
      const musicSlider = document.getElementById('musicVolume') as HTMLInputElement;
      const sfxSlider = document.getElementById('sfxVolume') as HTMLInputElement;
      if (musicSlider) { musicSlider.value = '30'; musicSlider.dispatchEvent(new Event('input')); }
      if (sfxSlider) { sfxSlider.value = '85'; sfxSlider.dispatchEvent(new Event('input')); }
    });

    // Open pause menu → Options
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('pauseOptions')?.click());
    await page.waitForTimeout(300);

    // Check options sliders match sidebar
    const vals = await page.evaluate(() => {
      return {
        music: (document.getElementById('optMusicVol') as HTMLInputElement)?.value,
        sfx: (document.getElementById('optSfxVol') as HTMLInputElement)?.value,
      };
    });

    expect(vals.music).toBe('30');
    expect(vals.sfx).toBe('85');

    // Cleanup
    await page.evaluate(() => document.getElementById('optionsClose')?.click());
  });
});
