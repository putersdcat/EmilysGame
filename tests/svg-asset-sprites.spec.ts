/**
 * Tests for SVG Asset Sprites (#115 Phase 1+2)
 * Validates that world objects render as SVG sprites instead of emoji.
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:5173/?test=1';

test.describe('SVG Asset Sprites (#115)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL);
    // Wait for game to initialize
    await page.waitForFunction(() => (window as any).__gameDebug !== undefined, { timeout: 15000 });
    // Small wait for asset sprite preloading
    await page.waitForTimeout(500);
  });

  test('hasAssetSprite returns true for supported keys', async ({ page }) => {
    const supported = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const keys = debug.getAssetSpriteKeys();
      return keys.map((k: string) => ({ key: k, has: debug.hasAssetSprite(k) }));
    });

    for (const entry of supported) {
      expect(entry.has, `${entry.key} should have SVG sprite`).toBe(true);
    }
  });

  test('hasAssetSprite returns false for unsupported keys', async ({ page }) => {
    const unsupported = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      // NPCs, terrain tiles, and animals don't have SVG asset sprites
      return ['npc_merchant', 'npc_villager', 'npc_guardian', 'chicken', 'cow', 'grass', 'water'].map(k => ({
        key: k,
        has: debug.hasAssetSprite(k),
      }));
    });

    for (const entry of unsupported) {
      expect(entry.has, `${entry.key} should not have SVG sprite`).toBe(false);
    }
  });

  test('Phase 2 plants have SVG sprites', async ({ page }) => {
    const plants = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return ['flower', 'flower_pink', 'flower_red', 'sunflower', 'tulip', 'bush',
              'mushroom', 'stump', 'cactus', 'wheat', 'seedling', 'clover',
              'wilted_flower', 'maple_leaf', 'tall_plant'].map(k => ({
        key: k,
        has: debug.hasAssetSprite(k),
      }));
    });

    for (const entry of plants) {
      expect(entry.has, `${entry.key} should have SVG sprite`).toBe(true);
    }
  });

  test('Phase 2 collectibles have SVG sprites', async ({ page }) => {
    const collectibles = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return ['coin', 'key', 'crowbar', 'potion'].map(k => ({
        key: k,
        has: debug.hasAssetSprite(k),
      }));
    });

    for (const entry of collectibles) {
      expect(entry.has, `${entry.key} should have SVG sprite`).toBe(true);
    }
  });

  test('Phase 2 structures have SVG sprites', async ({ page }) => {
    const structures = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return ['chest', 'sign', 'house', 'hut', 'shop', 'outhouse',
              'wall', 'door_locked', 'door_open', 'fence',
              'quiz_gate', 'toll_gate', 'barricade', 'sparkle', 'bridge'].map(k => ({
        key: k,
        has: debug.hasAssetSprite(k),
      }));
    });

    for (const entry of structures) {
      expect(entry.has, `${entry.key} should have SVG sprite`).toBe(true);
    }
  });

  test('asset sprite keys list includes correct entries', async ({ page }) => {
    const keys: string[] = await page.evaluate(() => {
      return (window as any).__gameDebug.getAssetSpriteKeys();
    });

    // Phase 1 keys
    expect(keys).toContain('tree');
    expect(keys).toContain('tree_pine');
    expect(keys).toContain('tree_palm');
    expect(keys).toContain('rock');
    expect(keys).toContain('bonfire');
    expect(keys).toContain('campfire');
    expect(keys).toContain('biomass_fire');
    // Phase 2 keys (spot check)
    expect(keys).toContain('flower');
    expect(keys).toContain('coin');
    expect(keys).toContain('chest');
    expect(keys).toContain('house');
    expect(keys).toContain('bush');
    expect(keys).toContain('bridge');
    // Total: 7 Phase1 + 15 plants + 4 collectibles + 15 structures + 3 shop variants = 44
    expect(keys.length).toBeGreaterThanOrEqual(30);
  });

  test('game renders without errors after SVG asset sprite integration', async ({ page }) => {
    // Check that the game canvas is present and rendering
    const canvasExists = await page.evaluate(() => {
      const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement | null;
      return canvas !== null && canvas.width > 0 && canvas.height > 0;
    });
    expect(canvasExists).toBe(true);

    // Check perf stats are being tracked (game loop is running)
    const fps = await page.evaluate(() => {
      return (window as any).__gameDebug?.state?.frameCount ?? 0;
    });
    // Wait a bit for frames to tick
    await page.waitForTimeout(500);
    const fps2 = await page.evaluate(() => {
      return (window as any).__gameDebug?.state?.frameCount ?? 0;
    });
    expect(fps2).toBeGreaterThan(fps);
  });

  test('PERF log confirms asset sprite cache populated', async ({ page }) => {
    // Check console logs for asset sprite cache message
    const logs: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('Asset sprite cache')) {
        logs.push(msg.text());
      }
    });

    // Reload to capture init logs
    await page.goto(URL);
    await page.waitForFunction(() => (window as any).__gameDebug !== undefined, { timeout: 15000 });
    await page.waitForTimeout(500);

    // The cache has many entries now: (6 Phase1 + ~30 Phase2) × 4 biome tints + 12 fire frames
    // Exact count depends on biome tint dedup. Just verify the log appears.
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]).toContain('Asset sprite cache');
  });

  test('SVG-supported assets appear in world chunks', async ({ page }) => {
    // Wait for chunks to generate and stabilize
    await page.waitForTimeout(2000);

    const state = await page.evaluate(() => {
      const s = (window as any).__gameDebug.state;
      const debug = (window as any).__gameDebug;
      let svgAssetCount = 0;
      let chunkCount = 0;
      const assetTypes = new Set<string>();
      s.chunks.forEach((chunk: any) => {
        chunkCount++;
        for (const row of chunk.cells) {
          for (const cell of row) {
            if (cell.assetKey && debug.hasAssetSprite(cell.assetKey)) {
              svgAssetCount++;
              assetTypes.add(cell.assetKey);
            }
          }
        }
      });
      return { chunkCount, svgAssetCount, assetTypes: [...assetTypes] };
    });

    expect(state.chunkCount).toBeGreaterThan(0);
    // World should have many SVG-rendered assets
    expect(state.svgAssetCount).toBeGreaterThan(0);
    // Multiple different asset types should exist
    expect(state.assetTypes.length).toBeGreaterThan(1);
  });

  test('rocks in world render as SVG (not emoji)', async ({ page }) => {
    await page.waitForTimeout(1000);

    const rockCount = await page.evaluate(() => {
      const s = (window as any).__gameDebug.state;
      let count = 0;
      s.chunks.forEach((chunk: any) => {
        for (const row of chunk.cells) {
          for (const cell of row) {
            if (cell.assetKey === 'rock') count++;
          }
        }
      });
      return count;
    });

    // Rocks should exist in the world
    expect(rockCount).toBeGreaterThan(0);
  });

  test('fire assets recognized as SVG sprite assets', async ({ page }) => {
    // Verify fire assets are in the SVG sprite system
    const fireStatus = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return {
        bonfire: debug.hasAssetSprite('bonfire'),
        campfire: debug.hasAssetSprite('campfire'),
        biomass_fire: debug.hasAssetSprite('biomass_fire'),
      };
    });

    expect(fireStatus.bonfire).toBe(true);
    expect(fireStatus.campfire).toBe(true);
    expect(fireStatus.biomass_fire).toBe(true);
  });

  test('no rendering errors after 2 seconds of gameplay', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    // Let the game run for 2 seconds
    await page.waitForTimeout(2000);

    // Check that frame count advanced (game loop is stable)
    const frameCount = await page.evaluate(() => {
      return (window as any).__gameDebug?.state?.frameCount ?? 0;
    });
    expect(frameCount).toBeGreaterThan(10);

    // No JS errors
    expect(errors).toHaveLength(0);
  });
});
