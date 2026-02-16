import { test, expect, Page } from '@playwright/test';

const URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(URL);
  await page.waitForFunction(() => (window as any).__gameState !== undefined, { timeout: 15000 });
}

test.describe('Outfit Patterns & New Accessories (#116 Phase 3)', () => {

  // ─── Accessories ──────────────────────────────────────────

  test('ACCESSORIES array has 7 entries including new hats', async ({ page }) => {
    await waitForGame(page);
    const accessories = await page.evaluate(() => (window as any).__gameDebug.getAccessories());
    expect(accessories.length).toBe(7);
    const values = accessories.map((a: any) => a.value);
    expect(values).toContain('cowboy_hat');
    expect(values).toContain('wizard_hat');
    expect(values).toContain('flower_crown');
  });

  test('new accessories render in customizer when opened', async ({ page }) => {
    await waitForGame(page);
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    const btnTexts = await page.evaluate(() => {
      const container = document.getElementById('custAccessories');
      if (!container) return [];
      return Array.from(container.querySelectorAll('.cust-style-btn')).map(b => b.textContent?.trim());
    });
    expect(btnTexts.length).toBe(7);
    expect(btnTexts.some(t => t?.includes('Cowboy'))).toBe(true);
    expect(btnTexts.some(t => t?.includes('Wizard'))).toBe(true);
    expect(btnTexts.some(t => t?.includes('Flower'))).toBe(true);

    await page.evaluate(() => document.getElementById('customizerConfirm')?.click());
  });

  test('clicking cowboy hat accessory selects it', async ({ page }) => {
    await waitForGame(page);
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    const clicked = await page.evaluate(() => {
      const container = document.getElementById('custAccessories');
      if (!container) return false;
      const btns = container.querySelectorAll('.cust-style-btn');
      for (const b of btns) {
        if ((b as HTMLElement).dataset.val === 'cowboy_hat') {
          (b as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    expect(clicked).toBe(true);

    await page.waitForTimeout(300);
    const selected = await page.evaluate(() => {
      const container = document.getElementById('custAccessories');
      const sel = container?.querySelector('.cust-style-btn.selected') as HTMLElement;
      return sel?.dataset.val;
    });
    expect(selected).toBe('cowboy_hat');

    await page.evaluate(() => document.getElementById('customizerConfirm')?.click());
  });

  // ─── Outfit Patterns ─────────────────────────────────────

  test('OUTFIT_PATTERNS array has 4 entries', async ({ page }) => {
    await waitForGame(page);
    const patterns = await page.evaluate(() => (window as any).__gameDebug.getOutfitPatterns());
    expect(patterns.length).toBe(4);
    const values = patterns.map((p: any) => p.value);
    expect(values).toContain('plain');
    expect(values).toContain('floral');
    expect(values).toContain('striped');
    expect(values).toContain('starry');
  });

  test('outfit pattern section renders in customizer', async ({ page }) => {
    await waitForGame(page);
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    const btnCount = await page.evaluate(() => {
      const container = document.getElementById('custOutfitPatterns');
      if (!container) return 0;
      return container.querySelectorAll('.cust-style-btn').length;
    });
    expect(btnCount).toBe(4);

    await page.evaluate(() => document.getElementById('customizerConfirm')?.click());
  });

  test('clicking floral pattern selects it', async ({ page }) => {
    await waitForGame(page);
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      const container = document.getElementById('custOutfitPatterns');
      if (!container) return;
      const btns = container.querySelectorAll('.cust-style-btn');
      for (const b of btns) {
        if ((b as HTMLElement).dataset.val === 'floral') {
          (b as HTMLElement).click();
          return;
        }
      }
    });
    await page.waitForTimeout(300);

    const selected = await page.evaluate(() => {
      const container = document.getElementById('custOutfitPatterns');
      const sel = container?.querySelector('.cust-style-btn.selected') as HTMLElement;
      return sel?.dataset.val;
    });
    expect(selected).toBe('floral');

    await page.evaluate(() => document.getElementById('customizerConfirm')?.click());
  });

  test('default variation has plain outfit pattern', async ({ page }) => {
    await waitForGame(page);
    const pattern = await page.evaluate(() => (window as any).__gameState.playerVariation.outfitPattern);
    expect(pattern).toBe('plain');
  });

  test('setting outfitPattern to starry is reflected in state', async ({ page }) => {
    await waitForGame(page);
    await page.evaluate(() => {
      (window as any).__gameState.playerVariation.outfitPattern = 'starry';
    });
    const p = await page.evaluate(() => (window as any).__gameState.playerVariation.outfitPattern);
    expect(p).toBe('starry');
  });

  test('randomize changes outfit pattern', async ({ page }) => {
    await waitForGame(page);
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    const values = await page.evaluate(() => {
      const results: string[] = [];
      const randomBtn = document.getElementById('customizerRandom');
      for (let i = 0; i < 30; i++) {
        if (randomBtn) randomBtn.click();
        const container = document.getElementById('custOutfitPatterns');
        const sel = container?.querySelector('.cust-style-btn.selected') as HTMLElement;
        if (sel?.dataset.val) results.push(sel.dataset.val);
      }
      return [...new Set(results)];
    });
    // With 30 randomizations across 4 patterns, should see ≥2 distinct
    expect(values.length).toBeGreaterThanOrEqual(2);

    await page.evaluate(() => document.getElementById('customizerConfirm')?.click());
  });

  test('randomize changes accessory to include new types', async ({ page }) => {
    await waitForGame(page);
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    const values = await page.evaluate(() => {
      const results: string[] = [];
      const randomBtn = document.getElementById('customizerRandom');
      for (let i = 0; i < 50; i++) {
        if (randomBtn) randomBtn.click();
        const container = document.getElementById('custAccessories');
        const sel = container?.querySelector('.cust-style-btn.selected') as HTMLElement;
        if (sel?.dataset.val) results.push(sel.dataset.val);
      }
      return [...new Set(results)];
    });
    // With 50 randomizations across 7 accessories, should see ≥3 distinct
    expect(values.length).toBeGreaterThanOrEqual(3);

    await page.evaluate(() => document.getElementById('customizerConfirm')?.click());
  });

});
