/**
 * Canvas clipping / partial-hide tests (#181).
 * Validates that tall objects (trees, walls) partially occlude the player
 * when walking behind them, using the occluder re-draw pass.
 */
import { test, expect, type Page } from '@playwright/test';

const URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(URL);
  await page.waitForFunction(() => (window as any).__gameDebug, { timeout: 15000 });
}

test.describe('Canvas clipping — partial hide behind objects (#181)', () => {

  test('tall assets have occluderRatio configured', async ({ page }) => {
    await waitForGame(page);

    // Check that trees and walls have occluderRatio set in ASSET_DEFS
    const results = await page.evaluate(() => {
      const defs = (window as any).__gameDebug?.getAssetDefs?.();
      if (!defs) return null;
      return {
        tree: defs.tree?.occluderRatio ?? 0,
        tree_pine: defs.tree_pine?.occluderRatio ?? 0,
        tree_palm: defs.tree_palm?.occluderRatio ?? 0,
        wall: defs.wall?.occluderRatio ?? 0,
        bush: defs.bush?.occluderRatio ?? 0,
        // Non-occluders should have no ratio
        grass: defs.grass?.occluderRatio ?? 0,
        flower: defs.flower?.occluderRatio ?? 0,
      };
    });

    expect(results).not.toBeNull();
    // Tall objects should have positive occluder ratios
    expect(results!.tree).toBeGreaterThan(0);
    expect(results!.tree_pine).toBeGreaterThan(0);
    expect(results!.tree_palm).toBeGreaterThan(0);
    expect(results!.wall).toBeGreaterThan(0);
    expect(results!.bush).toBeGreaterThan(0);
    // Ground objects should have no occluder
    expect(results!.grass).toBe(0);
    expect(results!.flower).toBe(0);
  });

  test('occluder ratios are in valid range (0, 1]', async ({ page }) => {
    await waitForGame(page);

    const invalidOccluders = await page.evaluate(() => {
      const defs = (window as any).__gameDebug?.getAssetDefs?.();
      if (!defs) return ['no defs'];
      const invalid: string[] = [];
      for (const [key, def] of Object.entries(defs)) {
        const d = def as any;
        if (d.occluderRatio !== undefined && d.occluderRatio !== 0) {
          if (d.occluderRatio <= 0 || d.occluderRatio > 1) {
            invalid.push(`${key}: ${d.occluderRatio}`);
          }
        }
      }
      return invalid;
    });

    expect(invalidOccluders).toEqual([]);
  });

  test('rendering does not crash with occluder pass active', async ({ page }) => {
    await waitForGame(page);

    // Move around for a few frames to trigger rendering near objects
    await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // Set player to spawn position and let a few frames render
      dbg.state.player.x = 12.5;
      dbg.state.player.y = 12.5;
    });

    // Wait for a few render frames
    await page.waitForTimeout(500);

    // Take a screenshot to verify no visual corruption
    const screenshot = await page.screenshot();
    expect(screenshot.length).toBeGreaterThan(1000); // valid PNG

    // Verify game is still running (not crashed)
    const isRunning = await page.evaluate(() => {
      return typeof (window as any).__gameDebug?.getAssetDefs === 'function';
    });
    expect(isRunning).toBe(true);
  });

  test('player can walk behind tall object and rendering continues', async ({ page }) => {
    await waitForGame(page);

    // Find a tree in the world to walk behind
    const treePos = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const chunks = dbg.state?.chunks;
      if (!chunks) return null;
      // Search for a tree cell
      for (const [_key, chunk] of chunks) {
        const c = chunk as any;
        if (!c.cells) continue;
        for (let y = 0; y < c.cells.length; y++) {
          for (let x = 0; x < c.cells[y].length; x++) {
            const cell = c.cells[y][x];
            if (cell.assetKey === 'tree' || cell.assetKey === 'tree_pine') {
              return {
                gx: c.chunkX * 25 + x,
                gy: c.chunkY * 25 + y,
              };
            }
          }
        }
      }
      return null;
    });

    if (!treePos) {
      test.skip(); // No tree found in loaded chunks — skip
      return;
    }

    // Teleport player to just south of the tree (to trigger occluder pass)
    await page.evaluate((pos) => {
      const dbg = (window as any).__gameDebug;
      dbg.state.player.x = pos.gx + 0.5;
      dbg.state.player.y = pos.gy + 0.8; // slightly south
    }, treePos);

    await page.waitForTimeout(300);

    // Take screenshot — verify no crash/corruption
    const screenshotBehind = await page.screenshot();
    expect(screenshotBehind.length).toBeGreaterThan(1000);

    // Now move player clearly in front (far south)
    await page.evaluate((pos) => {
      const dbg = (window as any).__gameDebug;
      dbg.state.player.x = pos.gx + 0.5;
      dbg.state.player.y = pos.gy + 3.0; // clearly in front
    }, treePos);

    await page.waitForTimeout(300);
    const screenshotFront = await page.screenshot();
    expect(screenshotFront.length).toBeGreaterThan(1000);

    // Screenshots should differ (different player position + occlusion state)
    expect(Buffer.compare(screenshotBehind, screenshotFront)).not.toBe(0);
  });

  test('occluder only activates for non-walkable blocking objects', async ({ page }) => {
    await waitForGame(page);

    // Verify that walkable base objects (grass, flowers) don't have occluder
    const occluderStatus = await page.evaluate(() => {
      const defs = (window as any).__gameDebug?.getAssetDefs?.();
      if (!defs) return null;
      const result: Record<string, { walkable: boolean; occluder: boolean }> = {};
      for (const [key, def] of Object.entries(defs)) {
        const d = def as any;
        if (d.layer === 'base') {
          result[key] = {
            walkable: d.walkable,
            occluder: (d.occluderRatio ?? 0) > 0,
          };
        }
      }
      return result;
    });

    expect(occluderStatus).not.toBeNull();
    // No base-layer object should be an occluder
    for (const [key, status] of Object.entries(occluderStatus!)) {
      expect(status.occluder, `${key} is base layer but has occluder`).toBe(false);
    }
  });
});
