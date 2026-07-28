/**
 * npc-interaction-history.spec.ts — live-engine proof for
 * Docs/VisionAlignmentAudit.md Finding #10: WorldEngine-05 §8.5 lists
 * "NPC interaction history" as part of the save-fidelity checklist
 * (alongside collected items, resolved obstacles, discovered areas, word
 * bag -- all of which already round-trip correctly). No field previously
 * tracked which NPCs the player has talked to.
 *
 * Fix: `state.talkedToNpcs: Set<string>` (game-state.ts), recorded in
 * `interaction-handler.ts` the moment an NPC dialog opens (`state.
 * talkedToNpcs.add(result.npcId)`), persisted/restored via
 * `save-build.ts`/`save-apply.ts`'s `talkedToNpcs` field (same
 * Set<->string[] pattern as `readArticles`/`discoveredWildlife`).
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('a resumed save round-trips NPC interaction history correctly', async ({ page }) => {
  await waitForGame(page);

  await page.evaluate(() => {
    const save = {
      version: 1,
      timestamp: Date.now(),
      player: { x: 12.5, y: 12.5, direction: 1 },
      inventory: [],
      visitedChunks: [],
      resolvedCells: [],
      quizStats: { answered: 0, correct: 0 },
      wordlistSeed: 'npc-history-test-seed',
      talkedToNpcs: ['merchant_meadow', 'guardian_default'],
    };
    localStorage.setItem('emilys_game_save', JSON.stringify(save));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });

  const result = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    return {
      talkedToNpcs: debug.getTalkedToNpcs(),
      isSet: debug.state.talkedToNpcs instanceof Set,
    };
  });

  expect(result.isSet, 'talkedToNpcs must be restored as a real Set, not a plain array').toBe(true);
  expect(result.talkedToNpcs.sort()).toEqual(['guardian_default', 'merchant_meadow']);
});

test('a fresh game starts with empty NPC interaction history', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    return {
      talkedToNpcs: debug.getTalkedToNpcs(),
      isSet: debug.state.talkedToNpcs instanceof Set,
    };
  });

  expect(result.isSet).toBe(true);
  expect(result.talkedToNpcs).toEqual([]);
});

test('opening a real NPC dialog records that NPC in the interaction history', async ({ page }) => {
  await waitForGame(page);

  // Find a real dialogue NPC (cell.npcId is only ever set by Populator.ts
  // for actual NPCs, never wildlife -- see mechanics.ts's interact()).
  const npc = await page.evaluate(() => {
    const state = (window as any).__gameDebug.state;
    for (const [, chunk] of state.chunks) {
      for (let ly = 0; ly < chunk.cells.length; ly++) {
        for (let lx = 0; lx < chunk.cells[ly].length; lx++) {
          const cell = chunk.cells[ly][lx];
          if (cell.npcId) {
            const gx = chunk.chunkX * 25 + lx;
            const gy = chunk.chunkY * 25 + ly;
            // Approach from the west if possible (arbitrary deterministic choice)
            return { npcId: cell.npcId, npcX: gx, npcY: gy, approachX: gx - 1, approachY: gy };
          }
        }
      }
    }
    return null;
  });

  test.skip(!npc, 'No NPC found in loaded chunks (world-gen dependent)');
  if (!npc) return;

  await page.evaluate((info: any) => {
    const state = (window as any).__gameDebug.state;
    state.player.x = info.approachX + 0.5;
    state.player.y = info.approachY + 0.5;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    state.player.isMoving = false;
    state.paused = false;
    state.player.facingDx = info.npcX - info.approachX;
    state.player.facingDy = info.npcY - info.approachY;
  }, npc);

  await page.waitForTimeout(500);

  // Flakiness fix (2026-07-13): handleSpaceInteraction checks
  // interactWithWildlife() BEFORE the tile-based NPC interact() call
  // (main.ts) -- if a wildlife entity has wandered within INTERACT_RANGE
  // of the facing target (updateWildlife runs every 3rd frame regardless
  // of this test's teleport), the Space press opens a wildlife dialog
  // instead of the NPC's, and talkedToNpcs never gets the NPC id (this
  // was measured to fail ~2/3 of runs before any mitigation). Clearing
  // the wildlife cache immediately before each attempt removes most of
  // the race using the same existing, already-exposed hook
  // tests/gameplay/wildlife.spec.ts already relies on -- wildlife simply
  // repopulates on the next tick as designed, which is irrelevant to what
  // this test is proving. A single clear narrowed the failure rate to a
  // rare residual (~1/24 measured) rather than eliminating it outright
  // (a wildlife entity can still repopulate nearby in the gap between the
  // clear and the actual keydown reaching the page), so this retries a
  // bounded number of times, force-closing any dialog a stolen wildlife
  // interaction opened (bypassing the need to know how many lines that
  // dialog has) before trying again -- fully deterministic without
  // touching any product code.
  let result: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(() => {
      const state = (window as any).__gameDebug.state;
      (window as any).__wildlife.clearWildlife();
      // Force-close any dialog a previous attempt's stolen wildlife
      // interaction left open (avoids needing to know its line count).
      state.ui.dialog.active = false;
      state.paused = false;
    });
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    result = await page.evaluate(() => (window as any).__gameDebug.getTalkedToNpcs());
    if (result.includes(npc.npcId)) break;
  }

  console.log('[npc-interaction-history] npc:', JSON.stringify(npc), 'recorded:', JSON.stringify(result));
  expect(result).toContain(npc.npcId);
});
