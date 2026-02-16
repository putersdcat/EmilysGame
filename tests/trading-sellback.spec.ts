/**
 * trading-sellback.spec.ts - E2E tests for sell-back economy (#112).
 * Verifies: buy/sell mode toggle, sell price calc, sell execution, DOM sync.
 * TODO: DOC - sell-back test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

const TEST_PERSONA = {
  id: 'merchant_test',
  displayName: 'Test Merchant',
  trades: [
    { gives: 'key', wants: 'coin', cost: 15, description: 'Buy a key' },
    { gives: 'potion', wants: 'coin', cost: 10, description: 'Buy a potion' },
  ],
  canQuiz: false,
  quizDifficulty: 'easy' as const,
  assetKey: 'npc_merchant',
  llmPersona: '',
  greetings: [],
  fallbackResponses: [],
};

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
  expect(await page.evaluate(() => !!(window as any).__gameState)).toBe(true);
}

/** Open trade panel with test persona */
async function openTestTrade(page: import('@playwright/test').Page) {
  return page.evaluate((persona) => {
    const { openTrade, syncTradeDOM } = (window as any).__trade;
    const state = (window as any).__gameState;
    const result = openTrade(state.trade, persona);
    syncTradeDOM(state.trade, state.inventory);
    return result;
  }, TEST_PERSONA);
}

test.describe('Trading Sell-Back (#112)', () => {

  test('trade state starts in buy mode', async ({ page }) => {
    await waitForGame(page);
    await openTestTrade(page);

    const mode = await page.evaluate(() => (window as any).__gameState.trade.mode);
    expect(mode).toBe('buy');
  });

  test('toggleTradeMode switches between buy and sell', async ({ page }) => {
    await waitForGame(page);
    await openTestTrade(page);

    const modes = await page.evaluate(() => {
      const { toggleTradeMode } = (window as any).__trade;
      const ts = (window as any).__gameState.trade;
      const m1 = ts.mode;
      toggleTradeMode(ts);
      const m2 = ts.mode;
      toggleTradeMode(ts);
      const m3 = ts.mode;
      return [m1, m2, m3];
    });

    expect(modes).toEqual(['buy', 'sell', 'buy']);
  });

  test('toggle resets selectedIndex', async ({ page }) => {
    await waitForGame(page);
    await openTestTrade(page);

    const idx = await page.evaluate(() => {
      const { toggleTradeMode, tradeNavigate } = (window as any).__trade;
      const ts = (window as any).__gameState.trade;
      tradeNavigate(ts, 'down'); // index=1
      const before = ts.selectedIndex;
      toggleTradeMode(ts); // sell → index=0
      const after = ts.selectedIndex;
      return { before, after };
    });

    expect(idx.before).toBe(1);
    expect(idx.after).toBe(0);
  });

  test('getSellPrice returns 60% of buy cost', async ({ page }) => {
    await waitForGame(page);
    await openTestTrade(page);

    const prices = await page.evaluate(() => {
      const { getSellPrice } = (window as any).__trade;
      const ts = (window as any).__gameState.trade;
      return {
        key: getSellPrice('key', ts),      // 15 * 0.6 = 9
        potion: getSellPrice('potion', ts), // 10 * 0.6 = 6
        coin: getSellPrice('coin', ts),     // unsellable = 0
      };
    });

    expect(prices.key).toBe(9);
    expect(prices.potion).toBe(6);
    expect(prices.coin).toBe(0);
  });

  test('getSellableItems excludes coins and empty slots', async ({ page }) => {
    await waitForGame(page);
    await openTestTrade(page);

    const result = await page.evaluate(() => {
      const { getSellableItems } = (window as any).__trade;
      const inv = (window as any).__gameState.inventory;
      // Give player some items
      inv.addItem('key', 2);
      inv.addItem('coin', 50);
      inv.addItem('potion', 1);
      const items = getSellableItems(inv);
      return items.map((i: any) => ({ itemId: i.itemId, quantity: i.quantity }));
    });

    // coins excluded, key and potion included
    const ids = result.map((r: any) => r.itemId);
    expect(ids).toContain('key');
    expect(ids).toContain('potion');
    expect(ids).not.toContain('coin');
  });

  test('executeSell removes item and adds coins', async ({ page }) => {
    await waitForGame(page);
    await openTestTrade(page);

    const result = await page.evaluate(() => {
      const { toggleTradeMode, executeSell, getSellableItems } = (window as any).__trade;
      const state = (window as any).__gameState;
      const inv = state.inventory;

      // Setup: give player a key, switch to sell mode
      inv.addItem('key', 1);
      const coinsBefore = inv.countItem('coin');
      const keysBefore = inv.countItem('key');

      toggleTradeMode(state.trade); // → sell

      // Find the key's index in sellable items (starter items may be before it)
      const sellable = getSellableItems(inv);
      const keyIdx = sellable.findIndex((s: any) => s.itemId === 'key');
      state.trade.selectedIndex = keyIdx >= 0 ? keyIdx : 0;

      // Sell
      const sellResult = executeSell(state.trade, inv);
      return {
        ok: sellResult.ok,
        coinsBefore,
        coinsAfter: inv.countItem('coin'),
        keysBefore,
        keysAfter: inv.countItem('key'),
        keyIdx,
      };
    });

    expect(result.ok).toBe(true);
    expect(result.keyIdx).toBeGreaterThanOrEqual(0);
    expect(result.keysAfter).toBeLessThan(result.keysBefore);
    expect(result.coinsAfter).toBeGreaterThan(result.coinsBefore);
  });

  test('executeSell fails when not in sell mode', async ({ page }) => {
    await waitForGame(page);
    await openTestTrade(page);

    const result = await page.evaluate(() => {
      const { executeSell } = (window as any).__trade;
      const state = (window as any).__gameState;
      // Stay in buy mode
      return executeSell(state.trade, state.inventory);
    });

    expect(result.ok).toBe(false);
  });

  test('sell mode DOM shows player items with prices', async ({ page }) => {
    await waitForGame(page);
    await openTestTrade(page);

    await page.evaluate(() => {
      const { toggleTradeMode, syncTradeDOM } = (window as any).__trade;
      const state = (window as any).__gameState;
      state.inventory.addItem('potion', 3);
      toggleTradeMode(state.trade);
      syncTradeDOM(state.trade, state.inventory);
    });

    const overlay = page.locator('#tradeOverlay');
    await expect(overlay).toBeVisible();

    // Should show sell mode label
    const nameText = await page.locator('#tradeNpcName').textContent();
    expect(nameText).toContain('Sell');

    // Should show at least one item with price
    const listText = await page.locator('#tradeList').textContent();
    expect(listText).toContain('💰');
  });

  test('buy mode DOM shows merchant items', async ({ page }) => {
    await waitForGame(page);
    await openTestTrade(page);

    const overlay = page.locator('#tradeOverlay');
    await expect(overlay).toBeVisible();

    const nameText = await page.locator('#tradeNpcName').textContent();
    expect(nameText).toContain('Buy');

    const listText = await page.locator('#tradeList').textContent();
    expect(listText).toBeDefined();
  });

  test('hint shows Tab toggle instruction', async ({ page }) => {
    await waitForGame(page);
    await openTestTrade(page);

    const hint = await page.locator('#tradeHint').textContent();
    expect(hint).toContain('Tab');
    expect(hint).toContain('Buy/Sell');
  });

});
