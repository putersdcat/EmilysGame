/**
 * themed-shops.spec.ts - E2E tests for themed shop variants (#112 Phase 2).
 * Tests: shop_general, shop_snack, shop_trading assets, personas, biome weights, interactions.
 * TODO: DOC - Themed shop variant test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const skipBtn = page.locator('#btnSkipLlm');
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
  }
  await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1000);
  const hasDebug = await page.evaluate(() => !!(window as any).__gameDebug);
  expect(hasDebug).toBe(true);
}

test.describe('Themed Shop Variants (#112 Phase 2)', () => {

  // ── Asset Definitions ──

  test('shop_general asset is defined and interactable', async ({ page }) => {
    await waitForGame(page);
    const def = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return debug?.getAssetDefs?.()?.shop_general;
    });
    expect(def).toBeTruthy();
    expect(def.interactable).toBe(true);
    expect(def.walkable).toBe(false);
    expect(def.emoji).toBe('🏬');
  });

  test('shop_snack asset is defined and interactable', async ({ page }) => {
    await waitForGame(page);
    const def = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return debug?.getAssetDefs?.()?.shop_snack;
    });
    expect(def).toBeTruthy();
    expect(def.interactable).toBe(true);
    expect(def.walkable).toBe(false);
    expect(def.emoji).toBe('🍿');
  });

  test('shop_trading asset is defined and interactable', async ({ page }) => {
    await waitForGame(page);
    const def = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return debug?.getAssetDefs?.()?.shop_trading;
    });
    expect(def).toBeTruthy();
    expect(def.interactable).toBe(true);
    expect(def.walkable).toBe(false);
    expect(def.emoji).toBe('🛒');
  });

  // ── Persona Lookup ──

  test('getShopPersona returns correct persona for shop_general', async ({ page }) => {
    await waitForGame(page);
    const persona = await page.evaluate(() => {
      const trade = (window as any).__trade;
      const p = trade?.getShopPersona?.('shop_general');
      return p ? { id: p.id, displayName: p.displayName, tradeCount: p.trades?.length } : null;
    });
    expect(persona).toBeTruthy();
    expect(persona!.id).toBe('shop_general_merchant');
    expect(persona!.displayName).toBe('General Store Owner');
    expect(persona!.tradeCount).toBeGreaterThanOrEqual(7);
  });

  test('getShopPersona returns correct persona for shop_snack', async ({ page }) => {
    await waitForGame(page);
    const persona = await page.evaluate(() => {
      const trade = (window as any).__trade;
      const p = trade?.getShopPersona?.('shop_snack');
      return p ? { id: p.id, displayName: p.displayName, tradeCount: p.trades?.length } : null;
    });
    expect(persona).toBeTruthy();
    expect(persona!.id).toBe('shop_snack_vendor');
    expect(persona!.displayName).toBe('Snack Vendor');
    expect(persona!.tradeCount).toBeGreaterThanOrEqual(3);
  });

  test('getShopPersona returns correct persona for shop_trading', async ({ page }) => {
    await waitForGame(page);
    const persona = await page.evaluate(() => {
      const trade = (window as any).__trade;
      const p = trade?.getShopPersona?.('shop_trading');
      return p ? { id: p.id, displayName: p.displayName, tradeCount: p.trades?.length } : null;
    });
    expect(persona).toBeTruthy();
    expect(persona!.id).toBe('shop_trading_merchant');
    expect(persona!.displayName).toBe('Trading Post Dealer');
    expect(persona!.tradeCount).toBeGreaterThanOrEqual(5);
  });

  test('getShopPersona falls back to default for unknown shop key', async ({ page }) => {
    await waitForGame(page);
    const persona = await page.evaluate(() => {
      const trade = (window as any).__trade;
      const p = trade?.getShopPersona?.('shop_unknown');
      return p ? { id: p.id } : null;
    });
    expect(persona).toBeTruthy();
    expect(persona!.id).toBe('shop_merchant'); // Falls back to default
  });

  test('getShopPersona returns shopkeeper for plain shop', async ({ page }) => {
    await waitForGame(page);
    const persona = await page.evaluate(() => {
      const trade = (window as any).__trade;
      const p = trade?.getShopPersona?.('shop');
      return p ? { id: p.id, displayName: p.displayName } : null;
    });
    expect(persona).toBeTruthy();
    expect(persona!.id).toBe('shop_merchant');
    expect(persona!.displayName).toBe('Shopkeeper');
  });

  // ── Trading Post Barter Trades ──

  test('trading post has barter trades (non-coin wants)', async ({ page }) => {
    await waitForGame(page);
    const trades = await page.evaluate(() => {
      const trade = (window as any).__trade;
      const p = trade?.getShopPersona?.('shop_trading');
      return p?.trades?.map((t: any) => ({ gives: t.gives, wants: t.wants, cost: t.cost }));
    });
    expect(trades).toBeTruthy();
    // Trading post should have at least one trade that wants something other than coins
    const barterTrades = trades!.filter((t: any) => t.wants !== 'coin');
    expect(barterTrades.length).toBeGreaterThan(0);
  });

  // ── Snack Stand Focus ──

  test('snack stand trades are food-focused', async ({ page }) => {
    await waitForGame(page);
    const trades = await page.evaluate(() => {
      const trade = (window as any).__trade;
      const p = trade?.getShopPersona?.('shop_snack');
      return p?.trades?.map((t: any) => t.gives);
    });
    expect(trades).toBeTruthy();
    const foodItems = ['snack', 'mushroom', 'water', 'potion'];
    const allFood = trades!.every((item: string) => foodItems.includes(item));
    expect(allFood).toBe(true);
  });

  // ── General Store Breadth ──

  test('general store has wider inventory than basic shop', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const trade = (window as any).__trade;
      const general = trade?.getShopPersona?.('shop_general');
      const basic = trade?.getShopPersona?.('shop');
      return {
        generalCount: general?.trades?.length ?? 0,
        basicCount: basic?.trades?.length ?? 0,
      };
    });
    expect(result.generalCount).toBeGreaterThan(result.basicCount);
  });

  // ── Biome Weights ──

  test('shop_general spawns in meadow biome', async ({ page }) => {
    await waitForGame(page);
    const weight = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const biomes = debug?.getBiomeDefs?.();
      const meadow = biomes?.find((b: any) => b.name === 'meadow');
      return meadow?.obstacleWeights?.shop_general;
    });
    expect(weight).toBeGreaterThan(0);
  });

  test('shop_snack spawns in meadow and forest biomes', async ({ page }) => {
    await waitForGame(page);
    const weights = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const biomes = debug?.getBiomeDefs?.();
      const meadow = biomes?.find((b: any) => b.name === 'meadow');
      const forest = biomes?.find((b: any) => b.name === 'forest');
      return {
        meadow: meadow?.obstacleWeights?.shop_snack ?? 0,
        forest: forest?.obstacleWeights?.shop_snack ?? 0,
      };
    });
    expect(weights.meadow).toBeGreaterThan(0);
    expect(weights.forest).toBeGreaterThan(0);
  });

  test('shop_trading spawns in forest and castle biomes', async ({ page }) => {
    await waitForGame(page);
    const weights = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const biomes = debug?.getBiomeDefs?.();
      const forest = biomes?.find((b: any) => b.name === 'forest');
      const castle = biomes?.find((b: any) => b.name === 'castle');
      return {
        forest: forest?.obstacleWeights?.shop_trading ?? 0,
        castle: castle?.obstacleWeights?.shop_trading ?? 0,
      };
    });
    expect(weights.forest).toBeGreaterThan(0);
    expect(weights.castle).toBeGreaterThan(0);
  });

  // ── Persona Greetings ──

  test('each themed shop has unique greetings', async ({ page }) => {
    await waitForGame(page);
    const greetings = await page.evaluate(() => {
      const trade = (window as any).__trade;
      const keys = ['shop', 'shop_general', 'shop_snack', 'shop_trading'];
      return keys.map(k => {
        const p = trade?.getShopPersona?.(k);
        return { key: k, greetings: p?.greetings ?? [] };
      });
    });
    // Each shop type should have at least 2 greetings
    for (const g of greetings) {
      expect(g.greetings.length).toBeGreaterThanOrEqual(2);
    }
    // Greetings should be unique across types
    const allGreetings = greetings.flatMap(g => g.greetings);
    const uniqueGreetings = new Set(allGreetings);
    expect(uniqueGreetings.size).toBe(allGreetings.length);
  });
});
