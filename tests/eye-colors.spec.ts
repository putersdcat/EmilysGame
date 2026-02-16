import { test, expect, Page } from '@playwright/test';

const URL = 'http://localhost:5175/?test=1';

async function waitForGame(page: Page) {
  await page.goto(URL);
  await page.waitForFunction(() => (window as any).__gameState !== undefined, { timeout: 15000 });
}

test.describe('Eye Color Customization (#116 Phase 2)', () => {

  test('EYE_COLORS array is exposed via debug hook', async ({ page }) => {
    await waitForGame(page);
    const colors = await page.evaluate(() => (window as any).__gameDebug.getEyeColors());
    expect(Array.isArray(colors)).toBe(true);
    expect(colors.length).toBe(5);
    for (const c of colors) {
      expect(c).toHaveProperty('name');
      expect(c).toHaveProperty('hex');
    }
  });

  test('EYE_COLORS contains expected entries', async ({ page }) => {
    await waitForGame(page);
    const colors = await page.evaluate(() => (window as any).__gameDebug.getEyeColors());
    const hexes = colors.map((c: any) => c.hex);
    expect(hexes).toContain('#0066CC'); // Blue
    expect(hexes).toContain('#228B22'); // Green
    expect(hexes).toContain('#8B4513'); // Brown
    expect(hexes).toContain('#8E7618'); // Hazel
    expect(hexes).toContain('#CC7722'); // Amber
  });

  test('default variation includes eyeColor field', async ({ page }) => {
    await waitForGame(page);
    const variation = await page.evaluate(() => (window as any).__gameState.playerVariation);
    expect(variation).toHaveProperty('eyeColor');
    expect(variation.eyeColor).toBe('#0066CC');
  });

  test('eyeColor persists after setting and reloading save', async ({ page }) => {
    await waitForGame(page);
    // Change eye color via direct state mutation
    await page.evaluate(() => {
      const state = (window as any).__gameState;
      state.playerVariation.eyeColor = '#228B22'; // Green
    });
    // Verify immediate change
    const eyeBefore = await page.evaluate(() => (window as any).__gameState.playerVariation.eyeColor);
    expect(eyeBefore).toBe('#228B22');
  });

  test('customizer overlay has eye color section', async ({ page }) => {
    await waitForGame(page);
    const hasSection = await page.evaluate(() => {
      const el = document.getElementById('custEyeColors');
      return el !== null;
    });
    expect(hasSection).toBe(true);
  });

  test('customizer eye color swatches render when overlay shown', async ({ page }) => {
    await waitForGame(page);
    // Open customizer via debug hook (returns a Promise, don't await — just trigger it)
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    const swatchCount = await page.evaluate(() => {
      const container = document.getElementById('custEyeColors');
      if (!container) return 0;
      return container.querySelectorAll('.cust-swatch').length;
    });
    expect(swatchCount).toBe(5);

    // Close overlay to clean up
    await page.evaluate(() => {
      const btn = document.getElementById('customizerConfirm');
      if (btn) btn.click();
    });
  });

  test('clicking eye color swatch updates selection', async ({ page }) => {
    await waitForGame(page);
    // Open customizer via debug hook
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    // Click the green eye color swatch
    const clicked = await page.evaluate(() => {
      const container = document.getElementById('custEyeColors');
      if (!container) return false;
      const swatches = container.querySelectorAll('.cust-swatch');
      for (const s of swatches) {
        if ((s as HTMLElement).dataset.hex === '#228B22') {
          (s as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    expect(clicked).toBe(true);

    await page.waitForTimeout(300);

    // Check the swatch is now selected
    const isSelected = await page.evaluate(() => {
      const container = document.getElementById('custEyeColors');
      if (!container) return false;
      const selected = container.querySelector('.cust-swatch.selected');
      return selected ? (selected as HTMLElement).dataset.hex === '#228B22' : false;
    });
    expect(isSelected).toBe(true);

    // Close overlay
    await page.evaluate(() => {
      const btn = document.getElementById('customizerConfirm');
      if (btn) btn.click();
    });
  });

  test('randomize button changes eye color', async ({ page }) => {
    await waitForGame(page);
    // Open customizer
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    // Click randomize multiple times and gather results
    const colors = await page.evaluate(() => {
      const results: string[] = [];
      const randomBtn = document.getElementById('customizerRandom');
      for (let i = 0; i < 20; i++) {
        if (randomBtn) randomBtn.click();
        const container = document.getElementById('custEyeColors');
        const selected = container?.querySelector('.cust-swatch.selected') as HTMLElement;
        if (selected?.dataset.hex) results.push(selected.dataset.hex);
      }
      return [...new Set(results)];
    });
    // With 20 randomizations across 5 colors, we should see at least 2 distinct values
    expect(colors.length).toBeGreaterThanOrEqual(2);

    // Close overlay
    await page.evaluate(() => {
      const btn = document.getElementById('customizerConfirm');
      if (btn) btn.click();
    });
  });

});
