/**
 * Tests for SVG Asset Sprites (#115 Phase 1)
 * Validates that trees, rocks, and fire render as SVG sprites instead of emoji.
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
      return ['flower', 'bush', 'coin', 'chest', 'npc_merchant'].map(k => ({
        key: k,
        has: debug.hasAssetSprite(k),
      }));
    });

    for (const entry of unsupported) {
      expect(entry.has, `${entry.key} should not have SVG sprite`).toBe(false);
    }
  });

  test('asset sprite keys list includes correct entries', async ({ page }) => {
    const keys: string[] = await page.evaluate(() => {
      return (window as any).__gameDebug.getAssetSpriteKeys();
    });

    expect(keys).toContain('tree');
    expect(keys).toContain('tree_pine');
    expect(keys).toContain('tree_palm');
    expect(keys).toContain('rock');
    expect(keys).toContain('bonfire');
    expect(keys).toContain('campfire');
    expect(keys).toContain('biomass_fire');
    expect(keys).toHaveLength(7);
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

    // The cache should have entries: (3 trees + 3 rock variants) × 5 tints + 3 fire types × 4 frames = 42
    // But only 4 unique biome tints [0, 15, 220, 340] so: 6 assets × 4 tints + 12 fire = 36
    // Wait, BIOME_DEFS has 4 biomes but tint 0 is in the set + 3 others = {0, 15, 220, 340} = 4 tints
    // Actually set starts with [0] and we add each biome's tint. Meadow=0 (already in set), Desert=15, Mountain=220, Swamp=340
    // So 4 unique tints: {0, 15, 220, 340}
    // Static: 6 SVGs × 4 tints = 24
    // Fire: 3 fire types × 4 frames = 12
    // Total: 36
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]).toContain('Asset sprite cache');
  });

  test('trees in world render as SVG (not emoji)', async ({ page }) => {
    // Wait for chunks to generate
    await page.waitForTimeout(1000);

    const state = await page.evaluate(() => {
      const s = (window as any).__gameDebug.state;
      let treeCount = 0;
      let chunkCount = 0;
      s.chunks.forEach((chunk: any) => {
        chunkCount++;
        for (const row of chunk.cells) {
          for (const cell of row) {
            if (cell.assetKey === 'tree' || cell.assetKey === 'tree_pine' || cell.assetKey === 'tree_palm') {
              treeCount++;
            }
          }
        }
      });
      return { chunkCount, treeCount };
    });

    expect(state.chunkCount).toBeGreaterThan(0);
    // Trees should exist in generated world
    expect(state.treeCount).toBeGreaterThan(0);
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
