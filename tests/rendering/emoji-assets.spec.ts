/**
 * emoji-assets.spec.ts - Tests for expanded emoji asset library (#58)
 * Validates new full-body animals, plants, structures, and effects in ASSET_DEFS
 * and their integration with biome weight tables.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test.describe('Emoji Assets Library (#58)', () => {

  // --- Animal assets ---
  const farmAnimals = ['chicken', 'rooster', 'pig', 'cow', 'sheep', 'goat', 'rabbit', 'duck', 'dog', 'horse'];
  const wildAnimals = ['fox', 'deer'];
  const allAnimals = [...farmAnimals, ...wildAnimals];

  for (const animal of allAnimals) {
    test(`ASSET_DEFS has walkable ${animal}`, async ({ page }) => {
      await waitForGame(page);
      const def = await page.evaluate((key) => {
        const defs = (window as any).__gameDebug.getAssetDefs();
        const d = defs[key];
        return d ? { emoji: d.emoji, walkable: d.walkable, height: d.height, category: d.category } : null;
      }, animal);
      expect(def).not.toBeNull();
      expect(def!.walkable).toBe(true);
      expect(def!.emoji).toBeTruthy();
    });
  }

  // --- New plant assets ---
  const newPlants = ['tulip', 'clover', 'wheat', 'cactus', 'seedling', 'wilted_flower', 'maple_leaf'];
  for (const plant of newPlants) {
    test(`ASSET_DEFS has ${plant}`, async ({ page }) => {
      await waitForGame(page);
      const def = await page.evaluate((key) => {
        const defs = (window as any).__gameDebug.getAssetDefs();
        const d = defs[key];
        return d ? { emoji: d.emoji, walkable: d.walkable, category: d.category } : null;
      }, plant);
      expect(def).not.toBeNull();
      expect(def!.emoji).toBeTruthy();
      expect(def!.category).toBe('plant');
    });
  }

  test('cactus is non-walkable', async ({ page }) => {
    await waitForGame(page);
    const walkable = await page.evaluate(() => {
      return (window as any).__gameDebug.getAssetDefs()['cactus']?.walkable;
    });
    expect(walkable).toBe(false);
  });

  // --- Structure assets ---
  const structures = ['house', 'hut', 'shop', 'fence'];
  for (const structure of structures) {
    test(`ASSET_DEFS has ${structure} (non-walkable obstacle)`, async ({ page }) => {
      await waitForGame(page);
      const def = await page.evaluate((key) => {
        const defs = (window as any).__gameDebug.getAssetDefs();
        const d = defs[key];
        return d ? { emoji: d.emoji, walkable: d.walkable, category: d.category, height: d.height } : null;
      }, structure);
      expect(def).not.toBeNull();
      expect(def!.walkable).toBe(false);
      expect(def!.category).toBe('obstacle');
      expect(def!.height).toBeGreaterThan(0);
    });
  }

  // --- Effect assets ---
  test('sparkle asset is walkable with ✨ emoji', async ({ page }) => {
    await waitForGame(page);
    const def = await page.evaluate(() => {
      const d = (window as any).__gameDebug.getAssetDefs()['sparkle'];
      return d ? { emoji: d.emoji, walkable: d.walkable, layer: d.layer } : null;
    });
    expect(def).not.toBeNull();
    expect(def!.walkable).toBe(true);
    expect(def!.emoji).toBe('✨');
  });

  test('campfire asset is non-walkable with 🔥 emoji', async ({ page }) => {
    await waitForGame(page);
    const def = await page.evaluate(() => {
      const d = (window as any).__gameDebug.getAssetDefs()['campfire'];
      return d ? { emoji: d.emoji, walkable: d.walkable } : null;
    });
    expect(def).not.toBeNull();
    expect(def!.walkable).toBe(false);
    expect(def!.emoji).toBe('🔥');
  });

  // --- Biome integration ---
  test('meadow biome includes farm animals in terrain weights', async ({ page }) => {
    await waitForGame(page);
    const weights = await page.evaluate(() => {
      return (window as any).__gameDebug.getBiomeDefs()[0].terrainWeights;
    });
    expect(weights['chicken']).toBeGreaterThan(0);
    expect(weights['sheep']).toBeGreaterThan(0);
    expect(weights['cow']).toBeGreaterThan(0);
    expect(weights['pig']).toBeGreaterThan(0);
  });

  test('meadow biome includes new plants', async ({ page }) => {
    await waitForGame(page);
    const weights = await page.evaluate(() => {
      return (window as any).__gameDebug.getBiomeDefs()[0].terrainWeights;
    });
    expect(weights['tulip']).toBeGreaterThan(0);
    expect(weights['clover']).toBeGreaterThan(0);
    expect(weights['wheat']).toBeGreaterThan(0);
  });

  test('meadow obstacles include structures', async ({ page }) => {
    await waitForGame(page);
    const weights = await page.evaluate(() => {
      return (window as any).__gameDebug.getBiomeDefs()[0].obstacleWeights;
    });
    expect(weights['house']).toBeGreaterThan(0);
    expect(weights['fence']).toBeGreaterThan(0);
    expect(weights['hut']).toBeGreaterThan(0);
  });

  test('forest biome includes wild animals', async ({ page }) => {
    await waitForGame(page);
    const weights = await page.evaluate(() => {
      return (window as any).__gameDebug.getBiomeDefs()[1].terrainWeights;
    });
    expect(weights['fox']).toBeGreaterThan(0);
    expect(weights['deer']).toBeGreaterThan(0);
    expect(weights['rabbit']).toBeGreaterThan(0);
  });

  test('all biome weight keys exist in ASSET_DEFS', async ({ page }) => {
    await waitForGame(page);
    const missing = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const assetDefs = debug.getAssetDefs();
      const biomeDefs = debug.getBiomeDefs();
      const missingKeys: string[] = [];
      for (const biome of biomeDefs) {
        for (const key of Object.keys(biome.terrainWeights)) {
          if (!assetDefs[key]) missingKeys.push(`${biome.name}:terrain:${key}`);
        }
        for (const key of Object.keys(biome.obstacleWeights)) {
          if (!assetDefs[key]) missingKeys.push(`${biome.name}:obstacle:${key}`);
        }
      }
      return missingKeys;
    });
    expect(missing).toEqual([]);
  });

  // --- Total asset count ---
  test('ASSET_DEFS has at least 50 entries', async ({ page }) => {
    await waitForGame(page);
    const count = await page.evaluate(() => {
      return Object.keys((window as any).__gameDebug.getAssetDefs()).length;
    });
    expect(count).toBeGreaterThanOrEqual(50);
  });

  // --- Rendering smoke test ---
  test('game renders without errors with expanded assets', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await waitForGame(page);
    // Walk around to trigger chunk generation
    for (let i = 0; i < 5; i++) {
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(200);
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(500);
    const canvasVisible = await page.locator('#gameContainer canvas').isVisible();
    expect(canvasVisible).toBe(true);
    expect(errors).toEqual([]);
  });

  test('new assets spawn in generated chunks', async ({ page }) => {
    await waitForGame(page);
    // Walk around in multiple directions to generate more chunks
    const directions = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    for (const dir of directions) {
      for (let i = 0; i < 8; i++) {
        await page.keyboard.down(dir);
        await page.waitForTimeout(250);
        await page.keyboard.up(dir);
        await page.waitForTimeout(50);
      }
    }
    await page.waitForTimeout(1000);

    const foundNewAssets = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return [];
      // chunks is state.chunks (Map<string, ChunkData>), not state.world.chunks
      const chunks = state.chunks as Map<string, any>;
      if (!chunks || !(chunks instanceof Map)) return [];
      const newKeys = new Set([
        'chicken', 'rooster', 'pig', 'cow', 'sheep', 'goat', 'rabbit',
        'fox', 'deer', 'horse', 'tulip', 'clover',
        'sparkle', 'campfire', 'house', 'hut', 'shop', 'fence', 'cactus',
        'reed', 'vine', 'cloud',
      ]);
      const found = new Set<string>();
      chunks.forEach((chunk: any) => {
        if (!chunk?.cells) return;
        for (const row of chunk.cells) {
          for (const cell of row) {
            if (cell?.assetKey && newKeys.has(cell.assetKey)) {
              found.add(cell.assetKey);
            }
          }
        }
      });
      return [...found];
    });
    // With expanded weights, at least some new assets should appear
    expect(foundNewAssets.length).toBeGreaterThan(0);
  });
});
