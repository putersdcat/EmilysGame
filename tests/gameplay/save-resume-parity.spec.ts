/**
 * save-resume-parity.spec.ts — live-engine proof for a significant,
 * previously-undiscovered save-fidelity bug found while investigating
 * Docs/VisionAlignmentAudit.md Finding #10 (NPC interaction history).
 *
 * `state-init.ts`'s `createInitialState()` (the auto-resume-on-page-load
 * path, using localStorage key `emilys_game_save`) had its OWN inline
 * restore-from-save block, separate from `save-apply.ts`'s
 * `applySaveData()` (used only by the manual save-SLOT-load UI). The two
 * had silently diverged: `applySaveData` correctly restored discovered
 * wildlife (#68), survival status (#70), injury state (#109), quiz streak
 * history (#103), cumulative playtime (#136), and touch control mode
 * (#144) -- but `createInitialState()` restored NONE of these. A player
 * who simply closed and reopened the browser (the single most common
 * resume path) silently lost all six, even though the same data round-
 * tripped correctly through the manual slot-load UI.
 *
 * Fixed by bringing `state-init.ts`'s inline restoration to parity with
 * `save-apply.ts` for all six fields, plus the new `talkedToNpcs` field
 * (see npc-interaction-history.spec.ts for that specific proof).
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('auto-resume (page reload with a save) restores wildlife discovery, survival status, injury state, quiz streak, playtime, and touch mode -- not just the manual slot-load path', async ({ page }) => {
  await waitForGame(page);

  await page.evaluate(() => {
    const save = {
      version: 1,
      timestamp: Date.now(),
      player: { x: 12.5, y: 12.5, direction: 1 },
      inventory: [],
      visitedChunks: [],
      resolvedCells: [],
      quizStats: { answered: 4, correct: 3 },
      wordlistSeed: 'save-resume-parity-test-seed',
      discoveredWildlife: ['rabbit', 'deer'],
      playerStatus: { energy: 42, hydration: 55, cleanliness: 61 },
      injuryState: { injured: true, injuryCount: 2 },
      streakHistory: ['correct', 'correct', 'wrong', 'correct'],
      playedSeconds: 1234,
      touchControlMode: 'slide',
    };
    localStorage.setItem('emilys_game_save', JSON.stringify(save));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });

  const result = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const s = debug.state;
    return {
      discoveredWildlife: debug.getDiscoveredSpeciesArray().sort(),
      status: { energy: s.status.energy, hydration: s.status.hydration, cleanliness: s.status.cleanliness },
      injury: { injured: s.injury.injured, injuryCount: s.injury.injuryCount },
      streakLength: s.streak.history.length,
      playedSeconds: debug.getPlayedSeconds(),
      touchControlMode: localStorage.getItem('emilys_game_touch_vis'),
    };
  });

  console.log('[save-resume-parity]', JSON.stringify(result));

  expect(result.discoveredWildlife).toEqual(['deer', 'rabbit']);
  expect(result.status).toEqual({ energy: 42, hydration: 55, cleanliness: 61 });
  expect(result.injury).toEqual({ injured: true, injuryCount: 2 });
  expect(result.streakLength).toBe(4);
  expect(result.playedSeconds).toBe(1234);
  expect(result.touchControlMode).toBe('slide');
});
