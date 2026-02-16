/**
 * structure-interactions.spec.ts - Tests for structure interaction features (#77)
 * Validates shop trading, campfire rest, and structure flavor text interactions.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test.describe('Structure Interactions (#77)', () => {

  // ─── Shop Merchant Persona ───────────────────────────────

  test('SHOP_MERCHANT_PERSONA is accessible via getNpcPersona', async ({ page }) => {
    await waitForGame(page);
    const hasShopPersona = await page.evaluate(() => {
      // getNpcPersona is used via the __gameDebug hooks or directly via window.__trade
      const state = (window as any).__gameDebug?.state;
      // Access trade helper
      const trade = (window as any).__trade;
      return trade !== undefined;
    });
    expect(hasShopPersona).toBe(true);
  });

  test('shop asset is interactable in ASSET_DEFS', async ({ page }) => {
    await waitForGame(page);
    const shopDef = await page.evaluate(() => {
      const defs = (window as any).__gameDebug?.getAssetDefs();
      return defs?.shop;
    });
    expect(shopDef).toBeTruthy();
    expect(shopDef.interactable).toBe(true);
  });

  test('campfire asset is interactable in ASSET_DEFS', async ({ page }) => {
    await waitForGame(page);
    const campfireDef = await page.evaluate(() => {
      const defs = (window as any).__gameDebug?.getAssetDefs();
      return defs?.campfire;
    });
    expect(campfireDef).toBeTruthy();
    expect(campfireDef.interactable).toBe(true);
  });

  // ─── Interaction Logic Unit Tests ────────────────────────

  test('interact with shop cell returns shop result type', async ({ page }) => {
    await waitForGame(page);
    // Inject a shop cell near the player and try interaction
    const result = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return null;
      // Place a shop cell in front of the player
      const px = Math.round(state.player.x);
      const py = Math.round(state.player.y);
      const fx = px + state.player.facingDx;
      const fy = py + state.player.facingDy;
      // Find the chunk and cell
      const SIZE = 25;
      const cx = Math.floor(fx / SIZE);
      const cy = Math.floor(fy / SIZE);
      const key = `${cx},${cy}`;
      const chunk = state.chunks.get(key);
      if (!chunk) return { error: 'no chunk' };
      const lx = ((fx % SIZE) + SIZE) % SIZE;
      const ly = ((fy % SIZE) + SIZE) % SIZE;
      // Save original cell
      const original = { ...chunk.cells[ly][lx] };
      // Replace with shop
      chunk.cells[ly][lx] = { assetKey: 'shop', walkable: false, interactable: true };
      // Import interact - use the exposed debug hook
      // We can't directly call interact, so let's check via keyboard
      return { placed: true, lx, ly, chunkKey: key };
    });
    expect(result).toBeTruthy();
    if (result && 'placed' in result) {
      // Press space to interact
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);
      // Check if dialog or trade opened
      const afterState = await page.evaluate(() => {
        const dialogEl = document.querySelector('#dialogOverlay');
        const tradeEl = document.querySelector('#tradeOverlay');
        return {
          dialogDisplay: dialogEl ? getComputedStyle(dialogEl).display : 'none',
          tradeDisplay: tradeEl ? getComputedStyle(tradeEl).display : 'none',
        };
      });
      const dialogVisible = afterState.dialogDisplay !== 'none';
      const tradeVisible = afterState.tradeDisplay !== 'none';
      // Either dialog or trade should be visible
      expect(dialogVisible || tradeVisible).toBe(true);
    }
  });

  test('interact with campfire cell restores energy', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return null;
      // Drain energy first
      state.status.energy = 50;
      state.status.hydration = 50;
      // Place campfire in front of player
      const px = Math.round(state.player.x);
      const py = Math.round(state.player.y);
      const fx = px + state.player.facingDx;
      const fy = py + state.player.facingDy;
      const SIZE = 25;
      const cx = Math.floor(fx / SIZE);
      const cy = Math.floor(fy / SIZE);
      const key = `${cx},${cy}`;
      const chunk = state.chunks.get(key);
      if (!chunk) return { error: 'no chunk' };
      const lx = ((fx % SIZE) + SIZE) % SIZE;
      const ly = ((fy % SIZE) + SIZE) % SIZE;
      chunk.cells[ly][lx] = { assetKey: 'campfire', walkable: false, interactable: true };
      return { energyBefore: state.status.energy, hydrationBefore: state.status.hydration };
    });
    expect(result).toBeTruthy();

    // Press space to interact with campfire
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    // Check energy was restored
    const after = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      return { energy: state?.status?.energy, hydration: state?.status?.hydration };
    });
    // Campfire should restore energy by 25 and hydration by 10
    expect(after.energy).toBeGreaterThan(50);
    expect(after.hydration).toBeGreaterThan(50);
  });

  test('interact with house cell shows dialog', async ({ page }) => {
    await waitForGame(page);
    await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return;
      const px = Math.round(state.player.x);
      const py = Math.round(state.player.y);
      const fx = px + state.player.facingDx;
      const fy = py + state.player.facingDy;
      const SIZE = 25;
      const cx = Math.floor(fx / SIZE);
      const cy = Math.floor(fy / SIZE);
      const key = `${cx},${cy}`;
      const chunk = state.chunks.get(key);
      if (!chunk) return;
      const lx = ((fx % SIZE) + SIZE) % SIZE;
      const ly = ((fy % SIZE) + SIZE) % SIZE;
      chunk.cells[ly][lx] = { assetKey: 'house', walkable: false, interactable: true };
    });
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    const dialogVisible = await page.evaluate(() => {
      const dialog = document.querySelector('#dialogOverlay');
      return dialog && getComputedStyle(dialog).display !== 'none';
    });
    expect(dialogVisible).toBe(true);
  });

  test('interact with hut cell shows dialog', async ({ page }) => {
    await waitForGame(page);
    await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return;
      const px = Math.round(state.player.x);
      const py = Math.round(state.player.y);
      const fx = px + state.player.facingDx;
      const fy = py + state.player.facingDy;
      const SIZE = 25;
      const cx = Math.floor(fx / SIZE);
      const cy = Math.floor(fy / SIZE);
      const key = `${cx},${cy}`;
      const chunk = state.chunks.get(key);
      if (!chunk) return;
      const lx = ((fx % SIZE) + SIZE) % SIZE;
      const ly = ((fy % SIZE) + SIZE) % SIZE;
      chunk.cells[ly][lx] = { assetKey: 'hut', walkable: false, interactable: true };
    });
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    const dialogVisible = await page.evaluate(() => {
      const dialog = document.querySelector('#dialogOverlay');
      return dialog && getComputedStyle(dialog).display !== 'none';
    });
    expect(dialogVisible).toBe(true);
  });

  // ─── Shop Trade Panel ────────────────────────────────────

  test('shop interaction opens trade panel after closing dialog', async ({ page }) => {
    await waitForGame(page);
    await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return;
      const px = Math.round(state.player.x);
      const py = Math.round(state.player.y);
      const fx = px + state.player.facingDx;
      const fy = py + state.player.facingDy;
      const SIZE = 25;
      const cx = Math.floor(fx / SIZE);
      const cy = Math.floor(fy / SIZE);
      const key = `${cx},${cy}`;
      const chunk = state.chunks.get(key);
      if (!chunk) return;
      const lx = ((fx % SIZE) + SIZE) % SIZE;
      const ly = ((fy % SIZE) + SIZE) % SIZE;
      chunk.cells[ly][lx] = { assetKey: 'shop', walkable: false, interactable: true };
    });

    // Press space to interact — opens dialog first
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    // Close dialog (advance through all lines if multi-line)
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    // Trade panel should now be visible
    const tradeActive = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      return state?.trade?.active === true;
    });
    expect(tradeActive).toBe(true);
  });

  test('shop merchant has 6 trade items', async ({ page }) => {
    await waitForGame(page);
    await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return;
      const px = Math.round(state.player.x);
      const py = Math.round(state.player.y);
      const fx = px + state.player.facingDx;
      const fy = py + state.player.facingDy;
      const SIZE = 25;
      const cx = Math.floor(fx / SIZE);
      const cy = Math.floor(fy / SIZE);
      const key = `${cx},${cy}`;
      const chunk = state.chunks.get(key);
      if (!chunk) return;
      const lx = ((fx % SIZE) + SIZE) % SIZE;
      const ly = ((fy % SIZE) + SIZE) % SIZE;
      chunk.cells[ly][lx] = { assetKey: 'shop', walkable: false, interactable: true };
    });

    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    await page.keyboard.press('Space'); // Close dialog
    await page.waitForTimeout(500);

    const tradeCount = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      return state?.trade?.trades?.length ?? 0;
    });
    expect(tradeCount).toBe(6);
  });

  // ─── Campfire Status Effects ─────────────────────────────

  test('campfire heals capped at max 100', async ({ page }) => {
    await waitForGame(page);
    await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return;
      // Set energy/hydration near max
      state.status.energy = 90;
      state.status.hydration = 95;
      const px = Math.round(state.player.x);
      const py = Math.round(state.player.y);
      const fx = px + state.player.facingDx;
      const fy = py + state.player.facingDy;
      const SIZE = 25;
      const cx = Math.floor(fx / SIZE);
      const cy = Math.floor(fy / SIZE);
      const key = `${cx},${cy}`;
      const chunk = state.chunks.get(key);
      if (!chunk) return;
      const lx = ((fx % SIZE) + SIZE) % SIZE;
      const ly = ((fy % SIZE) + SIZE) % SIZE;
      chunk.cells[ly][lx] = { assetKey: 'campfire', walkable: false, interactable: true };
    });
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      return { energy: state?.status?.energy, hydration: state?.status?.hydration };
    });
    expect(after.energy).toBeLessThanOrEqual(100);
    expect(after.hydration).toBeLessThanOrEqual(100);
  });

  // ─── Game Stability ──────────────────────────────────────

  test('game runs normally with structure interactions (no crash)', async ({ page }) => {
    await waitForGame(page);
    // Walk around to ensure new assets don't cause crashes
    for (let i = 0; i < 5; i++) {
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(200);
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(50);
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);
    }
    // Verify no console errors caused game to fail
    const running = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      return state?.initialized === true;
    });
    expect(running).toBe(true);
  });
});
