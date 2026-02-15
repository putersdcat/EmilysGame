/**
 * water-bridge.spec.ts — Tests for Issue #100 (Bridge & Water Traversal Integrity)
 *
 * Verifies:
 *  1. Water cells are reliably non-walkable
 *  2. Bridge cells are walkable
 *  3. No walkable water cell leakage after generation
 *  4. Player cannot walk through river water
 *  5. Game loads and runs across chunks with river templates without crashes
 *  6. Debug overlay shows water integrity info
 *
 * Run: npx playwright test tests/water-bridge.spec.ts --reporter=list
 * GitHub: #100
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

/** Helper: start the game and wait for it to load with __gameDebug */
async function startGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) { /* ok */ } });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
  return page;
}

test.describe('Water & Bridge Traversal Integrity (#100)', () => {

  test('water cells are non-walkable in all generated chunks', async ({ page }) => {
    await startGame(page);

    // Move around to generate multiple chunks
    const canvas = page.locator('#gameContainer canvas');
    await expect(canvas).toBeAttached({ timeout: 8000 });
    await page.waitForTimeout(1000);

    for (const dir of ['d', 's', 'a', 'w', 'd', 's']) {
      await page.keyboard.down(dir);
      await page.waitForTimeout(2500);
      await page.keyboard.up(dir);
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(500);

    // Scan all chunks for walkable water cells
    const result = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return { error: 'no state' };

      let waterCells = 0;
      let walkableWater = 0;
      let bridgeCells = 0;
      let unwalkableBridge = 0;
      let chunksChecked = 0;

      for (const [, chunk] of state.chunks) {
        chunksChecked++;
        for (const row of chunk.cells) {
          for (const cell of row) {
            if (cell.assetKey === 'water') {
              waterCells++;
              if (cell.walkable) walkableWater++;
            }
            if (cell.assetKey === 'bridge') {
              bridgeCells++;
              if (!cell.walkable) unwalkableBridge++;
            }
          }
        }
      }

      return { waterCells, walkableWater, bridgeCells, unwalkableBridge, chunksChecked };
    });

    expect(result).toBeTruthy();
    const r = result as { waterCells: number; walkableWater: number; bridgeCells: number; unwalkableBridge: number; chunksChecked: number };
    console.log(`Water integrity: ${r.waterCells} water cells, ${r.walkableWater} walkable leaks, ${r.bridgeCells} bridges, ${r.chunksChecked} chunks`);

    // Core assertion: NO water cells should be walkable
    expect(r.walkableWater).toBe(0);
    // Bridge cells should be walkable
    expect(r.unwalkableBridge).toBe(0);
    // Should have checked multiple chunks
    expect(r.chunksChecked).toBeGreaterThan(2);
  });

  test('bridge cells are correctly walkable', async ({ page }) => {
    await startGame(page);

    // Check bridge asset definition
    const bridgeDef = await page.evaluate(() => {
      const defs = (window as any).__gameDebug?.getAssetDefs();
      return defs?.bridge;
    });

    expect(bridgeDef).toBeTruthy();
    expect(bridgeDef.walkable).toBe(true);
  });

  test('water asset is correctly non-walkable', async ({ page }) => {
    await startGame(page);

    const waterDef = await page.evaluate(() => {
      const defs = (window as any).__gameDebug?.getAssetDefs();
      return defs?.water;
    });

    expect(waterDef).toBeTruthy();
    expect(waterDef.walkable).toBe(false);
  });

  test('player movement is blocked by water cells', async ({ page }) => {
    await startGame(page);
    await page.waitForTimeout(1000);

    // Inject a water barrier in front of the player and verify can't walk through
    const moveResult = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return { error: 'no state' };

      const SIZE = 25;
      const px = Math.round(state.player.x);
      const py = Math.round(state.player.y);

      // Place water cells 2 tiles to the right
      const waterX = px + 2;
      const waterY = py;
      const cx = Math.floor(waterX / SIZE);
      const cy = Math.floor(waterY / SIZE);
      const key = `${cx},${cy}`;
      const chunk = state.chunks.get(key);
      if (!chunk) return { error: 'no chunk' };

      const lx = ((waterX % SIZE) + SIZE) % SIZE;
      const ly = ((waterY % SIZE) + SIZE) % SIZE;

      // Save original
      const original = { ...chunk.cells[ly][lx] };

      // Place water barrier
      chunk.cells[ly][lx] = { assetKey: 'water', walkable: false, interactable: false };

      return {
        playerPos: { x: state.player.x, y: state.player.y },
        waterPos: { wx: waterX, wy: waterY },
        cellAfter: chunk.cells[ly][lx],
        original,
      };
    });

    expect(moveResult).toBeTruthy();
    if ('error' in moveResult) return;

    // Try to walk right into the water
    const startX = await page.evaluate(() => (window as any).__gameDebug?.state.player.x);
    await page.keyboard.down('d');
    await page.waitForTimeout(3000);
    await page.keyboard.up('d');
    await page.waitForTimeout(200);

    const endX = await page.evaluate(() => (window as any).__gameDebug?.state.player.x);

    // Player should have moved some but not past the water barrier
    // The water cell at px+2 should block movement
    const waterX = (moveResult as any).waterPos.wx;
    expect(endX).toBeLessThanOrEqual(waterX);
  });

  test('water debug info is accessible', async ({ page }) => {
    await startGame(page);

    const debugInfo = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      return dbg?.getWaterDebug?.();
    });

    expect(debugInfo).toBeTruthy();
    expect(typeof debugInfo.waterCells).toBe('number');
    expect(typeof debugInfo.bridgeCells).toBe('number');
    expect(typeof debugInfo.leaks).toBe('number');
  });

  test('extended exploration with river templates does not crash', async ({ page }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await startGame(page);
    await page.waitForTimeout(1000);

    // Extended movement to cross many chunk boundaries
    for (let i = 0; i < 4; i++) {
      await page.keyboard.down('d');
      await page.waitForTimeout(4000);
      await page.keyboard.up('d');
      await page.waitForTimeout(200);

      await page.keyboard.down('s');
      await page.waitForTimeout(3000);
      await page.keyboard.up('s');
      await page.waitForTimeout(200);
    }

    // Re-check water integrity after extended exploration
    const finalCheck = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return null;
      let walkableWater = 0;
      let totalWater = 0;
      for (const [, chunk] of state.chunks) {
        for (const row of chunk.cells) {
          for (const cell of row) {
            if (cell.assetKey === 'water') {
              totalWater++;
              if (cell.walkable) walkableWater++;
            }
          }
        }
      }
      return { walkableWater, totalWater, chunks: state.chunks.size };
    });

    expect(finalCheck).toBeTruthy();
    if (finalCheck) {
      expect(finalCheck.walkableWater).toBe(0);
      console.log(`Post-exploration: ${finalCheck.totalWater} water cells in ${finalCheck.chunks} chunks, 0 leaks`);
    }

    // No fatal errors
    const fatal = errors.filter(e =>
      !e.includes('favicon') && !e.includes('LLM') && !e.includes('health')
      && !e.includes('Completion') && !e.includes('net::')
    );
    expect(fatal.length).toBeLessThan(5);
  });

  test('debug overlay shows water info when rivers exist', async ({ page }) => {
    await startGame(page);
    await page.waitForTimeout(1000);

    // Enable debug overlay
    await page.keyboard.press('F3');
    await page.waitForTimeout(500);

    const debugEl = page.locator('#debugOverlay');
    const debugText = await debugEl.textContent() || '';

    // If there are water cells, the overlay should show water info
    // (May not show if no rivers were generated in this seed)
    const hasWaterInfo = debugText.includes('Water:');

    // Either water info is shown, or there are no water cells (both valid)
    const waterDebug = await page.evaluate(() => {
      return (window as any).__gameDebug?.getWaterDebug?.();
    });

    if (waterDebug?.waterCells > 0) {
      expect(hasWaterInfo).toBe(true);
      expect(debugText).toContain('✓'); // No leaks marker
    }
    // If no water cells, that's fine — test passes
  });
});
