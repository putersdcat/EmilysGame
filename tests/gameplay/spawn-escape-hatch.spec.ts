/**
 * spawn-escape-hatch.spec.ts — live-reported bug fix (2026-07-09): "when
 * the LLM entropy is on, the player spawns inside walls often."
 *
 * Root cause: a brand-new game's spawn is already hardened
 * (`ensureSpawnClearance` force-clears the fixed `PLAYER_CONFIG.startPosition`
 * + its 4 cardinal neighbors for chunk (0,0) — see
 * `iso2-e-spawn-clearance-fix.spec.ts`), but a RESUMED save is not: its
 * `player.x/y` can be ANYWHERE, in any chunk, and chunks are regenerated
 * (never persisted) from the save's seed/entropy state on every load. Real
 * LLM entropy expansion is not perfectly reproducible run-to-run (sampling
 * variance in the async LLM call), so the freshly-regenerated chunk around
 * a saved position can differ from what was there when the game was saved
 * — occasionally dropping an obstacle exactly where the player was
 * standing, with nothing to force-clear it (unlike the fixed chunk-(0,0)
 * case, there's no principled "safe cell list" for an arbitrary resume
 * position).
 *
 * Fix (per user's own proposed design): rather than mutating world
 * content, `state-init.ts` detects a non-walkable resolved spawn position
 * and sets `state.player.spawnEscape = true` +
 * `state.player.sinkDepth = SPAWN_ESCAPE_RISE_PX` (-40px) so the player
 * renders visibly ON TOP of the obstruction. `main.ts`'s `handleMovement`
 * bypasses collision entirely while `spawnEscape` is true (guaranteed
 * escape even if fully enclosed) and clears the flag (+ resets sinkDepth
 * to 0) the instant the player reaches a genuinely walkable cell.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('a resumed save landing on a blocked cell elevates the player instead of trapping them, and clears the instant they reach walkable ground', async ({ page }) => {
  await waitForGame(page);

  // Craft a fake save whose player position is INSIDE the starter
  // homestead's deterministic starter_cottage structure -- always a solid,
  // full-tile-blocking obstacle regardless of entropy/seed (unlike a
  // fence/wall, which uses a NARROW nano-precision collision band that a
  // large player footprint can straddle cleanly over -- a documented
  // pre-existing property, not suitable for this repro). ORIGIN {x:9,y:8}
  // + relative (4,3) = absolute (13,11), matching STARTER_HOMESTEAD's
  // `{x:4,y:3,assetKey:'starter_cottage'}`. One step north (relative
  // (4,2) = absolute (13,10)) is the courtyard's stamped 'stone_floor' --
  // also unconditional, giving a fully deterministic repro + escape route.
  await page.evaluate(() => {
    const save = {
      version: 1,
      timestamp: Date.now(),
      player: { x: 13.5, y: 11.5, direction: 1 },
      inventory: [],
      visitedChunks: [],
      resolvedCells: [],
      quizStats: { answered: 0, correct: 0 },
      wordlistSeed: 'spawn-escape-hatch-test-seed',
    };
    localStorage.setItem('emilys_game_save', JSON.stringify(save));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });

  const before = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const s = debug.state;
    return {
      x: s.player.x,
      y: s.player.y,
      spawnEscape: s.player.spawnEscape,
      sinkDepth: s.player.sinkDepth,
      walkableAtSpawn: debug.isFootprintWalkable(s.player.x, s.player.y),
    };
  });

  expect(before.walkableAtSpawn, 'sanity: the crafted resume position must actually be non-walkable (inside the cottage) -- proves this is a real repro, not a no-op').toBe(false);
  expect(before.spawnEscape, 'spawnEscape must engage for a blocked resumed position').toBe(true);
  expect(before.sinkDepth, 'player must render elevated (SPAWN_ESCAPE_RISE_PX) while escaping').toBe(-40);

  // Walk screen-north (iso NW in grid) toward courtyard stone_floor / grass yard.
  // Collision is bypassed while spawnEscape is true. Wait until the footprint
  // is genuinely walkable rather than a fixed timeout (escape needs ~0.8+ cells
  // to clear the cottage under diagonal iso motion; fixed 500ms is flaky).
  await page.keyboard.down('w');
  await page.waitForFunction(() => {
    const debug = (window as any).__gameDebug;
    const s = debug.state;
    return debug.isFootprintWalkable(s.player.x, s.player.y) && !s.player.spawnEscape;
  }, { timeout: 5000 });
  await page.keyboard.up('w');
  await page.waitForTimeout(100);

  const after = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const s = debug.state;
    return {
      x: s.player.x,
      y: s.player.y,
      spawnEscape: s.player.spawnEscape,
      sinkDepth: s.player.sinkDepth,
      walkableNow: debug.isFootprintWalkable(s.player.x, s.player.y),
    };
  });

  expect(after.y, 'the player must have actually moved north (proves collision was bypassed, not just idle)').toBeLessThan(before.y - 0.3);
  expect(after.walkableNow, 'the player must have reached genuinely walkable ground').toBe(true);
  expect(after.spawnEscape, 'spawnEscape must clear the instant walkable ground is reached').toBe(false);
  expect(after.sinkDepth, 'sinkDepth must return to ground level once escape resolves').toBe(0);
});

test('a normal resumed save at an already-walkable position never engages the escape hatch', async ({ page }) => {
  await waitForGame(page);

  // A save position deep in the starter homestead's stamped courtyard --
  // always walkable, regardless of entropy/seed.
  await page.evaluate(() => {
    const save = {
      version: 1,
      timestamp: Date.now(),
      player: { x: 13.5, y: 9.5, direction: 1 }, // absolute (13,9) = relative (4,1) stone_floor
      inventory: [],
      visitedChunks: [],
      resolvedCells: [],
      quizStats: { answered: 0, correct: 0 },
      wordlistSeed: 'spawn-escape-hatch-negative-test-seed',
    };
    localStorage.setItem('emilys_game_save', JSON.stringify(save));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });

  const state = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const s = debug.state;
    return {
      spawnEscape: s.player.spawnEscape,
      sinkDepth: s.player.sinkDepth,
      walkable: debug.isFootprintWalkable(s.player.x, s.player.y),
    };
  });

  expect(state.walkable, 'sanity: this resume position must be walkable').toBe(true);
  expect(state.spawnEscape, 'a genuinely walkable resume position must never engage the escape hatch').toBeFalsy();
  expect(state.sinkDepth, 'sinkDepth must be normal ground level for a walkable resume position').toBe(0);
});
