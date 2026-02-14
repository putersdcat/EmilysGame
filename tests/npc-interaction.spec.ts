/**
 * npc-interaction.spec.ts - E2E tests for NPC dialog interaction.
 * Verifies: multi-directional interaction, dialog overlay, NPC name/text.
 * TODO: DOC - NPC interaction test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

/** Helper: press Space with sufficient hold time for edge detection */
async function pressSpace(page: import('@playwright/test').Page) {
  await page.keyboard.down(' ');
  await page.waitForTimeout(200); // Hold for multiple game frames
  await page.keyboard.up(' ');
  await page.waitForTimeout(300); // Wait for render to sync dialog state
}

/** Helper: wait for the game to fully initialize (canvas + gameState available) */
async function waitForGame(page: import('@playwright/test').Page) {
  // Clear saved state to ensure deterministic world generation
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Click skip if LLM splash is showing
  const skipBtn = page.locator('#btnSkipLlm');
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
  }

  // Wait for canvas (game started)
  await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1000); // Let a few frames tick

  // Ensure __gameState is accessible
  const hasState = await page.evaluate(() => !!(window as any).__gameState);
  expect(hasState).toBe(true);
}

/**
 * Find the first NPC adjacent to walkable ground in the loaded world.
 * Returns { npcX, npcY, npcId, approachX, approachY } or null.
 */
async function findNearestNpc(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const state = (window as any).__gameState;
    if (!state) return null;

    const chunks = state.chunks as Map<string, any>;
    const size = 25; // WORLD_CONFIG.chunkSize

    interface NpcHit {
      npcX: number;
      npcY: number;
      npcId: string;
      approachX: number;
      approachY: number;
      dist: number;
    }

    const hits: NpcHit[] = [];
    const px = state.player.x;
    const py = state.player.y;

    chunks.forEach((chunk: any) => {
      for (let ly = 0; ly < chunk.cells.length; ly++) {
        for (let lx = 0; lx < chunk.cells[ly].length; lx++) {
          const cell = chunk.cells[ly][lx];
          if (!cell.npcId) continue;

          const wx = chunk.chunkX * size + lx;
          const wy = chunk.chunkY * size + ly;

          // Find a walkable neighbor to stand on
          const dirs = [
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
            { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
          ];
          for (const d of dirs) {
            const ax = wx + d.dx;
            const ay = wy + d.dy;

            // Check if approach cell is walkable
            const acx = Math.floor(ax / size);
            const acy = Math.floor(ay / size);
            const aChunk = chunks.get(`${acx},${acy}`);
            if (!aChunk) continue;
            const alx = ax - acx * size;
            const aly = ay - acy * size;
            if (alx < 0 || alx >= size || aly < 0 || aly >= size) continue;
            if (!aChunk.cells[aly][alx].walkable) continue;
            // Also check it's not another NPC cell
            if (aChunk.cells[aly][alx].npcId) continue;

            const dist = Math.abs(ax - px) + Math.abs(ay - py);
            hits.push({
              npcX: wx, npcY: wy, npcId: cell.npcId,
              approachX: ax, approachY: ay, dist,
            });
            break; // One approach cell is enough
          }
        }
      }
    });

    if (hits.length === 0) return null;

    // Return closest NPC
    hits.sort((a, b) => a.dist - b.dist);
    return hits[0];
  });
}

test.describe('NPC Interaction', () => {

  test('teleporting next to NPC and pressing Space opens dialog', async ({ page }) => {
    await waitForGame(page);

    // Find a nearby NPC
    const npc = await findNearestNpc(page);
    expect(npc).not.toBeNull();

    // Log NPC context for debugging flaky failures
    console.log('[TEST] NPC found:', JSON.stringify(npc));

    // Teleport player to the approach cell
    await page.evaluate((info: any) => {
      const state = (window as any).__gameState;
      state.player.x = info.approachX;
      state.player.y = info.approachY;
      state.camera.x = info.approachX;
      state.camera.y = info.approachY;
      state.player.isMoving = false;
      state.paused = false;
      // Set facing toward NPC
      state.player.facingDx = info.npcX - info.approachX;
      state.player.facingDy = info.npcY - info.approachY;
    }, npc);

    await page.waitForTimeout(500); // Let game frames tick after teleport

    // Press Space to interact
    await pressSpace(page);

    // Check dialog overlay
    const dialog = await page.evaluate(() => {
      const overlay = document.getElementById('dialogOverlay');
      const name = document.getElementById('dialogName');
      const text = document.getElementById('dialogText');
      return {
        visible: overlay ? overlay.style.display !== 'none' : false,
        name: name?.textContent || '',
        text: text?.textContent || '',
      };
    });

    expect(dialog.visible).toBe(true);
    expect(dialog.name.length).toBeGreaterThan(0);
    expect(dialog.text.length).toBeGreaterThan(0);

    // Name should not be 'Stranger' (we have known NPC personas)
    // It should be one of: Merchant, Villager, Guardian, or Cat NPCs
    expect(dialog.name).toMatch(/Merchant|Villager|Guardian|Cat/i);
  });

  test('dialog can be closed with Space', async ({ page }) => {
    await waitForGame(page);

    const npc = await findNearestNpc(page);
    expect(npc).not.toBeNull();

    // Teleport and face NPC (same setup as open-dialog test)
    await page.evaluate((info: any) => {
      const state = (window as any).__gameState;
      state.player.x = info.approachX;
      state.player.y = info.approachY;
      state.camera.x = info.approachX;
      state.camera.y = info.approachY;
      state.player.isMoving = false;
      state.paused = false;
      state.player.facingDx = info.npcX - info.approachX;
      state.player.facingDy = info.npcY - info.approachY;
    }, npc);

    // Log NPC context for debugging flaky failures
    console.log('[TEST] Close-dialog NPC:', JSON.stringify(npc));

    await page.waitForTimeout(800); // Extra settle time after teleport

    await pressSpace(page);

    // Dialog should be open
    let visible = await page.evaluate(() => {
      const overlay = document.getElementById('dialogOverlay');
      return overlay ? overlay.style.display !== 'none' : false;
    });
    expect(visible).toBe(true);

    // Press Space again to close
    await pressSpace(page);

    // Dialog should be closed
    visible = await page.evaluate(() => {
      const overlay = document.getElementById('dialogOverlay');
      return overlay ? overlay.style.display !== 'none' : false;
    });
    expect(visible).toBe(false);
  });

  test('interaction works from all 4 directions', async ({ page }) => {
    await waitForGame(page);

    // Find NPC with all 4 neighbors walkable for full direction test
    const npcInfo = await page.evaluate(() => {
      const state = (window as any).__gameState;
      if (!state) return null;
      const chunks = state.chunks as Map<string, any>;
      const size = 25;

      let best: any = null;
      chunks.forEach((chunk: any) => {
        for (let ly = 1; ly < chunk.cells.length - 1; ly++) {
          for (let lx = 1; lx < chunk.cells[ly].length - 1; lx++) {
            const cell = chunk.cells[ly][lx];
            if (!cell.npcId) continue;

            const wx = chunk.chunkX * size + lx;
            const wy = chunk.chunkY * size + ly;

            // Check all 4 neighbors walkable
            const dirs = [
              { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
              { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
            ];
            let allWalkable = true;
            for (const d of dirs) {
              const nx = wx + d.dx;
              const ny = wy + d.dy;
              const ncx = Math.floor(nx / size);
              const ncy = Math.floor(ny / size);
              const nc = chunks.get(`${ncx},${ncy}`);
              if (!nc) { allWalkable = false; break; }
              const nlx = nx - ncx * size;
              const nly = ny - ncy * size;
              if (nlx < 0 || nlx >= size || nly < 0 || nly >= size) { allWalkable = false; break; }
              if (!nc.cells[nly][nlx].walkable || nc.cells[nly][nlx].npcId) { allWalkable = false; break; }
            }

            if (allWalkable) {
              best = { npcX: wx, npcY: wy, npcId: cell.npcId };
              return;
            }
          }
        }
      });

      return best;
    });

    // Skip if no NPC with 4 walkable neighbors (world-gen dependent)
    test.skip(!npcInfo, 'No NPC found with all 4 neighbors walkable');

    const directions = [
      { dx: 0, dy: -1, label: 'north' },
      { dx: 0, dy: 1, label: 'south' },
      { dx: -1, dy: 0, label: 'west' },
      { dx: 1, dy: 0, label: 'east' },
    ];

    for (const dir of directions) {
      // Force-close any prior dialog or quiz state before next direction
      await page.evaluate(() => {
        const state = (window as any).__gameState;
        if (state.ui?.dialog) {
          state.ui.dialog.active = false;
          state.ui.dialog.currentLine = 0;
          state.ui.dialog.lines = [];
        }
        if (state.quiz) {
          state.quiz.active = false;
        }
        const overlay = document.getElementById('dialogOverlay');
        if (overlay) overlay.style.display = 'none';
        const quizOverlay = document.getElementById('quizOverlay');
        if (quizOverlay) quizOverlay.style.display = 'none';
        state.paused = false;
      });
      await page.waitForTimeout(300);

      // Teleport to neighbor, face NPC
      await page.evaluate(
        (info: { npc: any; dir: any }) => {
          const state = (window as any).__gameState;
          state.player.x = info.npc.npcX + info.dir.dx;
          state.player.y = info.npc.npcY + info.dir.dy;
          state.camera.x = state.player.x;
          state.camera.y = state.player.y;
          state.player.facingDx = -info.dir.dx;
          state.player.facingDy = -info.dir.dy;
          state.paused = false;
        },
        { npc: npcInfo, dir },
      );

      // Wait long enough for game loop to process new position
      await page.waitForTimeout(800);
      await pressSpace(page);

      const dialogResult = await page.evaluate(() => {
        const overlay = document.getElementById('dialogOverlay');
        const name = document.getElementById('dialogName');
        return {
          visible: overlay ? overlay.style.display !== 'none' : false,
          name: name?.textContent || '',
        };
      });

      expect(dialogResult.visible, `Dialog should open from ${dir.label}`).toBe(true);
      expect(dialogResult.name.length, `NPC name should show from ${dir.label}`).toBeGreaterThan(0);

      // Close dialog before next direction
      await pressSpace(page);
      await page.waitForTimeout(500);
    }
  });
});
