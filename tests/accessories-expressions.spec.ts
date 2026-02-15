/**
 * accessories-expressions.spec.ts - E2E tests for Issue #102:
 * Player Accessories & Expression Variants.
 * Tests: accessory/expression UI buttons, preview SVG updates, persistence,
 * randomize coverage, save/load roundtrip, transient expression on quiz events.
 * TODO: DOC - #102 accessories & expressions test coverage
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

/** Helper: open the customizer overlay via HUD button */
async function openCustomizer(page: import('@playwright/test').Page) {
  await page.locator('#btnCustomize').click();
  await page.waitForTimeout(300);
  const visible = await page.evaluate(() => {
    const overlay = document.getElementById('customizerOverlay');
    return overlay ? overlay.style.display === 'flex' : false;
  });
  expect(visible).toBe(true);
}

test.describe('Accessories & Expressions (#102)', () => {

  test('accessory buttons exist in customizer', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    const container = page.locator('#custAccessories');
    await expect(container).toBeAttached();

    // Should have 4 buttons: None, Bow, Crown, Glasses
    const buttons = container.locator('.cust-style-btn');
    await expect(buttons).toHaveCount(4);

    // Verify data values
    const vals = await buttons.evaluateAll(els =>
      els.map(el => (el as HTMLElement).dataset.val)
    );
    expect(vals).toEqual(['none', 'bow', 'crown', 'glasses']);
  });

  test('expression buttons exist in customizer', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    const container = page.locator('#custExpressions');
    await expect(container).toBeAttached();

    // Should have 4 buttons: Happy, Neutral, Surprised, Determined
    const buttons = container.locator('.cust-style-btn');
    await expect(buttons).toHaveCount(4);

    const vals = await buttons.evaluateAll(els =>
      els.map(el => (el as HTMLElement).dataset.val)
    );
    expect(vals).toEqual(['happy', 'neutral', 'surprised', 'determined']);
  });

  test('clicking accessory updates preview SVG', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    // Get initial preview HTML (no accessory by default)
    const previewBefore = await page.locator('#customizerPreview').innerHTML();

    // Click Crown
    await page.locator('#custAccessories .cust-style-btn[data-val="crown"]').click();
    await page.waitForTimeout(200);

    const previewAfter = await page.locator('#customizerPreview').innerHTML();
    // Preview SVG should change (crown adds gold polygon)
    expect(previewAfter).not.toBe(previewBefore);
    expect(previewAfter).toContain('#FFD700'); // Crown gold color
  });

  test('clicking expression updates preview SVG', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    // Default is happy
    const previewHappy = await page.locator('#customizerPreview').innerHTML();

    // Click Surprised
    await page.locator('#custExpressions .cust-style-btn[data-val="surprised"]').click();
    await page.waitForTimeout(200);

    const previewSurprised = await page.locator('#customizerPreview').innerHTML();
    // Preview should change (surprised has different mouth/eye shapes)
    expect(previewSurprised).not.toBe(previewHappy);
  });

  test('accessory selection shows selected state', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    // Default should be 'none' selected
    const initialSelected = await page.locator('#custAccessories .cust-style-btn.selected')
      .getAttribute('data-val');
    expect(initialSelected).toBe('none');

    // Click Crown
    await page.locator('#custAccessories .cust-style-btn[data-val="crown"]').click();
    await page.waitForTimeout(100);

    // Crown should be selected, exactly one selected
    const selectedCount = await page.locator('#custAccessories .cust-style-btn.selected').count();
    expect(selectedCount).toBe(1);

    const newSelected = await page.locator('#custAccessories .cust-style-btn.selected')
      .getAttribute('data-val');
    expect(newSelected).toBe('crown');
  });

  test('expression selection shows selected state', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    // Default should be 'happy'
    const initialSelected = await page.locator('#custExpressions .cust-style-btn.selected')
      .getAttribute('data-val');
    expect(initialSelected).toBe('happy');

    // Click Determined
    await page.locator('#custExpressions .cust-style-btn[data-val="determined"]').click();
    await page.waitForTimeout(100);

    const selectedCount = await page.locator('#custExpressions .cust-style-btn.selected').count();
    expect(selectedCount).toBe(1);

    const newSelected = await page.locator('#custExpressions .cust-style-btn.selected')
      .getAttribute('data-val');
    expect(newSelected).toBe('determined');
  });

  test('accessory persists after confirm and reopen', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    // Select glasses
    await page.locator('#custAccessories .cust-style-btn[data-val="glasses"]').click();
    await page.waitForTimeout(100);

    // Confirm
    await page.locator('#customizerConfirm').click();
    await page.waitForTimeout(300);

    // Reopen
    await openCustomizer(page);

    // Glasses should still be selected
    const selected = await page.locator('#custAccessories .cust-style-btn.selected')
      .getAttribute('data-val');
    expect(selected).toBe('glasses');
  });

  test('expression persists after confirm and reopen', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    // Select neutral
    await page.locator('#custExpressions .cust-style-btn[data-val="neutral"]').click();
    await page.waitForTimeout(100);

    // Confirm
    await page.locator('#customizerConfirm').click();
    await page.waitForTimeout(300);

    // Reopen
    await openCustomizer(page);

    // Neutral should still be selected
    const selected = await page.locator('#custExpressions .cust-style-btn.selected')
      .getAttribute('data-val');
    expect(selected).toBe('neutral');
  });

  test('confirm updates gameState with accessory and expression', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    // Select bow + determined
    await page.locator('#custAccessories .cust-style-btn[data-val="bow"]').click();
    await page.waitForTimeout(100);
    await page.locator('#custExpressions .cust-style-btn[data-val="determined"]').click();
    await page.waitForTimeout(100);

    // Confirm
    await page.locator('#customizerConfirm').click();
    await page.waitForTimeout(300);

    // Verify game state
    const result = await page.evaluate(() => {
      const state = (window as any).__gameState;
      return {
        accessory: state?.playerVariation?.accessory,
        expression: state?.playerVariation?.expression,
      };
    });
    expect(result.accessory).toBe('bow');
    expect(result.expression).toBe('determined');
  });

  test('randomize includes accessory and expression changes', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    // Track what values we see across randomizations
    const seenAccessories = new Set<string>();
    const seenExpressions = new Set<string>();

    for (let i = 0; i < 20; i++) {
      await page.locator('#customizerRandom').click();
      await page.waitForTimeout(300);

      // Wait for selected buttons to appear after DOM rebuild
      const accBtn = page.locator('#custAccessories .cust-style-btn.selected');
      const exprBtn = page.locator('#custExpressions .cust-style-btn.selected');

      if (await accBtn.count() > 0) {
        const acc = await accBtn.getAttribute('data-val');
        if (acc) seenAccessories.add(acc);
      }
      if (await exprBtn.count() > 0) {
        const expr = await exprBtn.getAttribute('data-val');
        if (expr) seenExpressions.add(expr);
      }
    }

    // After 20 randomizations, should have seen at least 2 different values each
    expect(seenAccessories.size).toBeGreaterThanOrEqual(2);
    expect(seenExpressions.size).toBeGreaterThanOrEqual(2);
  });

  test('accessory and expression persist in save data', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    // Select crown + surprised
    await page.locator('#custAccessories .cust-style-btn[data-val="crown"]').click();
    await page.waitForTimeout(100);
    await page.locator('#custExpressions .cust-style-btn[data-val="surprised"]').click();
    await page.waitForTimeout(100);

    // Confirm
    await page.locator('#customizerConfirm').click();
    await page.waitForTimeout(300);

    // Save
    await page.locator('#btnSave').click();
    await page.waitForTimeout(500);

    // Read save data
    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem('emilys_game_save');
      if (!raw) return null;
      const data = JSON.parse(raw);
      return {
        accessory: data?.playerVariation?.accessory,
        expression: data?.playerVariation?.expression,
      };
    });
    expect(saved?.accessory).toBe('crown');
    expect(saved?.expression).toBe('surprised');
  });

  test('all accessories render valid SVGs in preview', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    for (const acc of ['none', 'bow', 'crown', 'glasses']) {
      await page.locator(`#custAccessories .cust-style-btn[data-val="${acc}"]`).click();
      await page.waitForTimeout(200);

      // Preview should contain valid SVGs (4 total: front, walk, side, sideL)
      const svgCount = await page.evaluate(() => {
        const preview = document.getElementById('customizerPreview');
        return preview ? preview.querySelectorAll('svg').length : 0;
      });
      expect(svgCount).toBe(4);

      // No broken SVGs (check for viewBox attribute = valid SVG)
      const allValid = await page.evaluate(() => {
        const svgs = document.querySelectorAll('#customizerPreview svg');
        return Array.from(svgs).every(svg => svg.getAttribute('viewBox') !== null);
      });
      expect(allValid).toBe(true);
    }
  });

  test('all expressions render valid SVGs in preview', async ({ page }) => {
    await waitForGame(page);
    await openCustomizer(page);

    for (const expr of ['happy', 'neutral', 'surprised', 'determined']) {
      await page.locator(`#custExpressions .cust-style-btn[data-val="${expr}"]`).click();
      await page.waitForTimeout(200);

      const svgCount = await page.evaluate(() => {
        const preview = document.getElementById('customizerPreview');
        return preview ? preview.querySelectorAll('svg').length : 0;
      });
      expect(svgCount).toBe(4);

      const allValid = await page.evaluate(() => {
        const svgs = document.querySelectorAll('#customizerPreview svg');
        return Array.from(svgs).every(svg => svg.getAttribute('viewBox') !== null);
      });
      expect(allValid).toBe(true);
    }
  });

  test('transient expression overrides base expression', async ({ page }) => {
    await waitForGame(page);

    // Verify transient expression system exists in game state
    const stateCheck = await page.evaluate(() => {
      const state = (window as any).__gameState;
      return {
        hasExpressionOverride: 'expressionOverride' in state,
        hasBaseExpression: '_baseExpression' in state,
        baseExpression: state._baseExpression,
        currentExpression: state.playerVariation?.expression,
      };
    });
    expect(stateCheck.hasExpressionOverride).toBe(true);
    expect(stateCheck.hasBaseExpression).toBe(true);
    expect(stateCheck.baseExpression).toBeTruthy();
    expect(stateCheck.currentExpression).toBeTruthy();
  });

  test('setTransientExpression changes expression temporarily', async ({ page }) => {
    await waitForGame(page);

    // Import and call setTransientExpression via page evaluate
    const result = await page.evaluate(() => {
      const state = (window as any).__gameState;
      const baseExpr = state._baseExpression;

      // Manually set a transient expression
      state.playerVariation.expression = 'surprised';
      state.expressionOverride = {
        expr: 'surprised',
        until: performance.now() + 500 // 500ms
      };

      return {
        baseExpr,
        activeExpr: state.playerVariation.expression,
        overrideSet: state.expressionOverride !== null,
      };
    });

    expect(result.overrideSet).toBe(true);
    expect(result.activeExpr).toBe('surprised');

    // Wait for override to expire
    await page.waitForTimeout(700);

    // After expiration, tickExpressionOverride should have reverted it
    const afterResult = await page.evaluate(() => {
      const state = (window as any).__gameState;
      return {
        currentExpr: state.playerVariation.expression,
        overrideNull: state.expressionOverride === null,
      };
    });

    expect(afterResult.overrideNull).toBe(true);
    expect(afterResult.currentExpr).toBe(result.baseExpr);
  });
});
