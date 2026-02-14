/**
 * sprite-customizer.spec.ts - E2E tests for Player Sprite Customizer.
 * Tests: overlay visibility, color/style interactions, randomize, confirm,
 * HUD button access, C key access, save/load persistence.
 * TODO: DOC - customizer test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

/** Helper: wait for game to fully initialize */
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

test.describe('Sprite Customizer', () => {

  test('customizer overlay exists in DOM', async ({ page }) => {
    await waitForGame(page);

    const overlay = page.locator('#customizerOverlay');
    await expect(overlay).toBeAttached();

    // Should be hidden initially (game already started in test mode)
    const display = await overlay.evaluate(el => (el as HTMLElement).style.display);
    expect(display === 'none' || display === '').toBe(true);
  });

  test('HUD 🎨 button opens customizer', async ({ page }) => {
    await waitForGame(page);

    // Click HUD button
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(200);

    // Customizer should be visible
    const visible = await page.evaluate(() => {
      const overlay = document.getElementById('customizerOverlay');
      return overlay ? overlay.style.display === 'flex' : false;
    });
    expect(visible).toBe(true);

    // Should show preview, color swatches, confirm button
    await expect(page.locator('#customizerPreview')).toBeVisible();
    await expect(page.locator('#custHairColors')).toBeVisible();
    await expect(page.locator('#custOutfitColors')).toBeVisible();
    await expect(page.locator('#custSkinTones')).toBeVisible();
    await expect(page.locator('#custHairStyles')).toBeVisible();
    await expect(page.locator('#customizerConfirm')).toBeVisible();
  });

  test('C key opens customizer', async ({ page }) => {
    await waitForGame(page);

    // Focus the page and press C
    await page.keyboard.press('c');
    await page.waitForTimeout(300);

    // Customizer should be visible
    const visible = await page.evaluate(() => {
      const overlay = document.getElementById('customizerOverlay');
      return overlay ? overlay.style.display === 'flex' : false;
    });
    expect(visible).toBe(true);
  });

  test('hair style buttons change selection', async ({ page }) => {
    await waitForGame(page);

    // Open customizer
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(200);

    // Default should have a selected style
    const initialSelected = await page.locator('#custHairStyles .cust-style-btn.selected').count();
    expect(initialSelected).toBe(1);

    // Click each style and verify selection changes
    for (const style of ['straight', 'pigtails', 'wavy']) {
      await page.locator(`#custHairStyles .cust-style-btn[data-style="${style}"]`).click();
      await page.waitForTimeout(100);

      const selectedStyle = await page.locator('#custHairStyles .cust-style-btn.selected')
        .getAttribute('data-style');
      expect(selectedStyle).toBe(style);
    }
  });

  test('color swatches change selection', async ({ page }) => {
    await waitForGame(page);
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(200);

    // Click second hair color swatch
    const secondSwatch = page.locator('#custHairColors .cust-swatch').nth(1);
    await secondSwatch.click();
    await page.waitForTimeout(100);

    // That swatch should now be selected
    const isSelected = await secondSwatch.evaluate(el => el.classList.contains('selected'));
    expect(isSelected).toBe(true);

    // Only one should be selected at a time
    const selectedCount = await page.locator('#custHairColors .cust-swatch.selected').count();
    expect(selectedCount).toBe(1);
  });

  test('randomize button changes character', async ({ page }) => {
    await waitForGame(page);
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(200);

    // Get initial state
    const initialHair = await page.locator('#custHairColors .cust-swatch.selected')
      .getAttribute('data-hex');

    // Click randomize a few times - at least one should differ
    let changed = false;
    for (let i = 0; i < 5; i++) {
      await page.locator('#customizerRandom').click();
      await page.waitForTimeout(100);
      const newHair = await page.locator('#custHairColors .cust-swatch.selected')
        .getAttribute('data-hex');
      if (newHair !== initialHair) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  test('confirm button closes customizer and applies variation', async ({ page }) => {
    await waitForGame(page);
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(200);

    // Change hair color to something specific
    await page.locator('#custHairColors .cust-swatch[data-hex="#5588CC"]').click();
    await page.waitForTimeout(100);

    // Click confirm
    await page.locator('#customizerConfirm').click();
    await page.waitForTimeout(300);

    // Overlay should be hidden
    const visible = await page.evaluate(() => {
      const overlay = document.getElementById('customizerOverlay');
      return overlay ? overlay.style.display === 'flex' : false;
    });
    expect(visible).toBe(false);

    // Check game state has updated variation
    const hairColor = await page.evaluate(() => {
      const state = (window as any).__gameState;
      return state?.playerVariation?.hairColor;
    });
    expect(hairColor).toBe('#5588CC');
  });

  test('customizer preserves choices when reopened', async ({ page }) => {
    await waitForGame(page);

    // Open customizer and set specific values
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(200);

    // Select blue hair
    await page.locator('#custHairColors .cust-swatch[data-hex="#5588CC"]').click();
    await page.waitForTimeout(100);

    // Select wavy
    await page.locator('#custHairStyles .cust-style-btn[data-style="wavy"]').click();
    await page.waitForTimeout(100);

    // Confirm
    await page.locator('#customizerConfirm').click();
    await page.waitForTimeout(300);

    // Re-open
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(200);

    // Verify blue hair is still selected
    const selectedHair = await page.locator('#custHairColors .cust-swatch.selected')
      .getAttribute('data-hex');
    expect(selectedHair?.toLowerCase()).toBe('#5588cc');

    // Verify wavy is still selected
    const selectedStyle = await page.locator('#custHairStyles .cust-style-btn.selected')
      .getAttribute('data-style');
    expect(selectedStyle).toBe('wavy');
  });

  test('preview shows both idle and walking sprites', async ({ page }) => {
    await waitForGame(page);
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(200);

    // Preview should contain SVGs
    const previewHtml = await page.locator('#customizerPreview').innerHTML();
    expect(previewHtml).toContain('svg');
    expect(previewHtml).toContain('Idle');
    expect(previewHtml).toContain('Walking');
  });

  test('playerVariation persists in save data', async ({ page }) => {
    await waitForGame(page);

    // Change character
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(200);
    await page.locator('#custHairColors .cust-swatch[data-hex="#CC4444"]').click();
    await page.waitForTimeout(100);
    await page.locator('#customizerConfirm').click();
    await page.waitForTimeout(300);

    // Save the game using the HUD save button
    await page.locator('#btnSave').click();
    await page.waitForTimeout(500);

    // Read save data
    const savedHairColor = await page.evaluate(() => {
      const raw = localStorage.getItem('emilys_game_save');
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data?.playerVariation?.hairColor;
    });
    expect(savedHairColor).toBe('#CC4444');
  });
});
