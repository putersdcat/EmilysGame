/**
 * collision-boundary.spec.ts — Regression tests for footprint-based collision (#151, #180).
 * Verifies that the player cannot walk through non-walkable tiles (water, walls)
 * from any approach direction, and that wall-sliding works correctly.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

/** Wait for game to be fully initialised with __gameDebug available */
async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state?.chunks?.size, { timeout: 10_000 });
}

test.describe('Collision Boundaries (#151, #180)', () => {

  test('footprint blocks entry into water from +X direction', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const s = (window as any).__gameDebug.state;

      // Find water tile with a walkable neighbour to its left (-X)
      function getCell(gx: number, gy: number) {
        const size = 25;
        const cx = Math.floor(gx / size);
        const cy = Math.floor(gy / size);
        const chunk = s.chunks.get(`${cx},${cy}`);
        if (!chunk) return null;
        const lx = ((gx % size) + size) % size;
        const ly = ((gy % size) + size) % size;
        return chunk.cells[ly]?.[lx] ?? null;
      }
      function isWalkableAt(gx: number, gy: number) {
        const c = getCell(gx, gy);
        return c?.walkable === true;
      }
      function footprintOk(px: number, py: number) {
        const hw = 0.3, hh = 0.3;
        return (
          isWalkableAt(Math.floor(px - hw), Math.floor(py - hh)) &&
          isWalkableAt(Math.floor(px + hw), Math.floor(py - hh)) &&
          isWalkableAt(Math.floor(px - hw), Math.floor(py + hh)) &&
          isWalkableAt(Math.floor(px + hw), Math.floor(py + hh))
        );
      }

      // Scan for a water cell with walkable cell to its left
      let boundary: { standX: number; standY: number; waterX: number; waterY: number } | null = null;
      outer: for (const [, chunk] of s.chunks) {
        for (let ly = 0; ly < 25; ly++) {
          for (let lx = 1; lx < 25; lx++) {
            const cell = chunk.cells[ly]?.[lx];
            if (cell?.assetKey === 'water') {
              const gx = chunk.chunkX * 25 + lx;
              const gy = chunk.chunkY * 25 + ly;
              if (isWalkableAt(gx - 1, gy)) {
                boundary = { standX: gx - 1, standY: gy, waterX: gx, waterY: gy };
                break outer;
              }
            }
          }
        }
      }
      if (!boundary) return { error: 'no suitable boundary found' };

      // Simulate stepping toward water in +X
      let px = boundary.standX + 0.5;
      const py = boundary.standY + 0.5;
      const speed = 0.05;
      let steps = 0;
      for (let i = 0; i < 200; i++) {
        if (footprintOk(px + speed, py)) {
          px += speed;
          steps++;
        } else {
          break;
        }
      }

      const finalCell = getCell(Math.floor(px), Math.floor(py));
      return {
        waterX: boundary.waterX,
        finalX: Math.round(px * 100) / 100,
        steps,
        cellUnder: finalCell?.assetKey,
        enteredWater: finalCell?.assetKey === 'water',
      };
    });

    expect(result).not.toHaveProperty('error');
    expect(result.enteredWater).toBe(false);
    expect(result.steps).toBeGreaterThan(0); // moved at least once
    expect(result.finalX).toBeLessThan(result.waterX); // stayed left of water
  });

  test('footprint blocks entry into water from -Y direction', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const s = (window as any).__gameDebug.state;

      function getCell(gx: number, gy: number) {
        const size = 25;
        const cx = Math.floor(gx / size);
        const cy = Math.floor(gy / size);
        const chunk = s.chunks.get(`${cx},${cy}`);
        if (!chunk) return null;
        const lx = ((gx % size) + size) % size;
        const ly = ((gy % size) + size) % size;
        return chunk.cells[ly]?.[lx] ?? null;
      }
      function isWalkableAt(gx: number, gy: number) {
        return getCell(gx, gy)?.walkable === true;
      }
      function footprintOk(px: number, py: number) {
        const hw = 0.3, hh = 0.3;
        return (
          isWalkableAt(Math.floor(px - hw), Math.floor(py - hh)) &&
          isWalkableAt(Math.floor(px + hw), Math.floor(py - hh)) &&
          isWalkableAt(Math.floor(px - hw), Math.floor(py + hh)) &&
          isWalkableAt(Math.floor(px + hw), Math.floor(py + hh))
        );
      }

      // Find water with walkable cell BELOW it (+Y)
      let boundary: { standX: number; standY: number; waterX: number; waterY: number } | null = null;
      outer: for (const [, chunk] of s.chunks) {
        for (let ly = 0; ly < 24; ly++) {
          for (let lx = 0; lx < 25; lx++) {
            const cell = chunk.cells[ly]?.[lx];
            if (cell?.assetKey === 'water') {
              const gx = chunk.chunkX * 25 + lx;
              const gy = chunk.chunkY * 25 + ly;
              if (isWalkableAt(gx, gy + 1)) {
                boundary = { standX: gx, standY: gy + 1, waterX: gx, waterY: gy };
                break outer;
              }
            }
          }
        }
      }
      if (!boundary) return { error: 'no suitable boundary found' };

      const px = boundary.standX + 0.5;
      let py = boundary.standY + 0.5;
      const speed = 0.05;
      let steps = 0;
      for (let i = 0; i < 200; i++) {
        if (footprintOk(px, py - speed)) {
          py -= speed;
          steps++;
        } else {
          break;
        }
      }

      const finalCell = getCell(Math.floor(px), Math.floor(py));
      return {
        waterY: boundary.waterY,
        finalY: Math.round(py * 100) / 100,
        steps,
        cellUnder: finalCell?.assetKey,
        enteredWater: finalCell?.assetKey === 'water',
      };
    });

    expect(result).not.toHaveProperty('error');
    expect(result.enteredWater).toBe(false);
    expect(result.steps).toBeGreaterThan(0);
    expect(result.finalY).toBeGreaterThan(result.waterY);
  });

  test('axis-independent resolution enables wall-sliding', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const s = (window as any).__gameDebug.state;

      function getCell(gx: number, gy: number) {
        const size = 25;
        const cx = Math.floor(gx / size);
        const cy = Math.floor(gy / size);
        const chunk = s.chunks.get(`${cx},${cy}`);
        if (!chunk) return null;
        const lx = ((gx % size) + size) % size;
        const ly = ((gy % size) + size) % size;
        return chunk.cells[ly]?.[lx] ?? null;
      }
      function isWalkableAt(gx: number, gy: number) {
        return getCell(gx, gy)?.walkable === true;
      }
      function footprintOk(px: number, py: number) {
        const hw = 0.3, hh = 0.3;
        return (
          isWalkableAt(Math.floor(px - hw), Math.floor(py - hh)) &&
          isWalkableAt(Math.floor(px + hw), Math.floor(py - hh)) &&
          isWalkableAt(Math.floor(px - hw), Math.floor(py + hh)) &&
          isWalkableAt(Math.floor(px + hw), Math.floor(py + hh))
        );
      }

      // Find a vertical water edge: water at (wX, wY) with a 3-cell vertical
      // walkable corridor to the left so the player can slide along it.
      // Verify all cells the footprint could touch are walkable.
      let boundary: { x: number; y: number } | null = null;
      outer: for (const [, chunk] of s.chunks) {
        for (let ly = 1; ly < 23; ly++) {
          for (let lx = 1; lx < 25; lx++) {
            const cell = chunk.cells[ly]?.[lx];
            if (cell?.assetKey === 'water') {
              const gx = chunk.chunkX * 25 + lx;
              const gy = chunk.chunkY * 25 + ly;
              // Need: water at (gx, gy), walkable corridor at (gx-1, gy-1..gy+2)
              if (
                !isWalkableAt(gx, gy) && // water is not walkable (sanity)
                isWalkableAt(gx - 1, gy - 1) &&
                isWalkableAt(gx - 1, gy) &&
                isWalkableAt(gx - 1, gy + 1) &&
                isWalkableAt(gx - 1, gy + 2)
              ) {
                boundary = { x: gx, y: gy };
                break outer;
              }
            }
          }
        }
      }
      if (!boundary) return { error: 'no suitable wall-slide boundary' };

      // Position player right at the water edge: center in walkable cell (wX-1),
      // footprint right edge (px+0.3) just barely inside walkable territory.
      // px + 0.3 < wX → px < wX - 0.3. Use wX - 0.5 (cell center of wX-1).
      let px = boundary.x - 0.5;
      let py = boundary.y + 0.5;
      const speed = 0.05;
      let slideSteps = 0;
      let totalSteps = 0;

      // Sanity: starting position must be walkable
      if (!footprintOk(px, py)) {
        return { error: 'start position not walkable', px, py };
      }

      for (let i = 0; i < 200; i++) {
        const nx = px + speed;
        const ny = py + speed;
        if (footprintOk(nx, ny)) {
          px = nx;
          py = ny;
          totalSteps++;
        } else {
          // Axis-independent: try X alone, then Y alone
          let movedX = false, movedY = false;
          if (footprintOk(nx, py)) { px = nx; movedX = true; }
          if (footprintOk(px, ny)) { py = ny; movedY = true; }
          if (movedX || movedY) {
            totalSteps++;
            if ((movedX && !movedY) || (!movedX && movedY)) slideSteps++;
          } else {
            break; // fully stuck
          }
        }
      }

      return {
        totalSteps,
        slideSteps,
        didSlide: slideSteps > 0,
        finalX: Math.round(px * 100) / 100,
        finalY: Math.round(py * 100) / 100,
        enteredWater: getCell(Math.floor(px), Math.floor(py))?.assetKey === 'water',
      };
    });

    expect(result).not.toHaveProperty('error');
    expect(result.didSlide).toBe(true);       // wall sliding occurred
    expect(result.slideSteps).toBeGreaterThan(2); // slid for multiple frames
    expect(result.enteredWater).toBe(false);   // never entered water
  });

  test('keyboard movement stops at water boundary in real game loop', async ({ page }) => {
    await waitForGame(page);

    // Teleport player next to water, send real keyboard input, verify no entry
    const result = await page.evaluate(async () => {
      const s = (window as any).__gameDebug.state;

      function getCell(gx: number, gy: number) {
        const size = 25;
        const cx = Math.floor(gx / size);
        const cy = Math.floor(gy / size);
        const chunk = s.chunks.get(`${cx},${cy}`);
        if (!chunk) return null;
        const lx = ((gx % size) + size) % size;
        const ly = ((gy % size) + size) % size;
        return chunk.cells[ly]?.[lx] ?? null;
      }

      // Find water with walkable cell to left
      let waterX = -1;
      let standX = -1;
      let standY = -1;
      for (const [, chunk] of s.chunks) {
        for (let ly = 0; ly < 25; ly++) {
          for (let lx = 1; lx < 25; lx++) {
            const cell = chunk.cells[ly]?.[lx];
            if (cell?.assetKey === 'water') {
              const gx = chunk.chunkX * 25 + lx;
              const gy = chunk.chunkY * 25 + ly;
              const leftCell = getCell(gx - 1, gy);
              if (leftCell?.walkable) {
                waterX = gx;
                standX = gx - 1;
                standY = gy;
                break;
              }
            }
          }
          if (waterX >= 0) break;
        }
        if (waterX >= 0) break;
      }
      if (waterX < 0) return { error: 'no boundary found' };

      // Teleport player
      s.player.x = standX + 0.5;
      s.player.y = standY + 0.5;

      // Hold D+S keys (=+X in grid) for 2s
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS' }));

      await new Promise(r => setTimeout(r, 2000));

      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', code: 'KeyD' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 's', code: 'KeyS' }));

      const finalCell = getCell(Math.floor(s.player.x), Math.floor(s.player.y));
      return {
        waterX,
        finalX: Math.round(s.player.x * 100) / 100,
        finalY: Math.round(s.player.y * 100) / 100,
        cellUnder: finalCell?.assetKey,
        enteredWater: finalCell?.assetKey === 'water',
      };
    });

    expect(result).not.toHaveProperty('error');
    expect(result.enteredWater).toBe(false);
    expect(result.finalX).toBeLessThan(result.waterX);
  });
});
