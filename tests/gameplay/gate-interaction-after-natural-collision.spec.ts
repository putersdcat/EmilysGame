/**
 * gate-interaction-after-natural-collision.spec.ts — 2026-07-13 diagnostic,
 * gameplay-feel audit (user report: "not really rendering a playable world
 * where movement is restricted and requires you to solve things to move
 * on"). Cross-referenced against `Docs/Next-Engine-And-Gameplay-Plan.md`
 * (authored same day on the sneakernet sync workstation via live Playwright
 * probing): "Interaction targeting... requires being adjacent + facing the
 * cell... Teleport+Space at gate didn't trigger quiz in probe (positioning/
 * facing friction)."
 *
 * ROOT CAUSE FOUND: `input.ts`'s `getMovementVector()` rotates screen-
 * relative arrow keys 45° for isometric alignment (`dx = sdx+sdy; dy =
 * -sdx+sdy`) — a SINGLE arrow key (the natural way a real player, especially
 * a child, presses a key) produces a DIAGONAL grid-space movement vector
 * (e.g. ArrowRight alone -> grid dx=+1,dy=-1 normalized), never
 * pure-cardinal. `player.facingDx/Dy` are `Math.sign()` of that vector, so
 * facing is diagonal too. But `handleSpaceInteraction` (main.ts) only ever
 * tried the exact facing cell, then the 4 pure-CARDINAL neighbors — never
 * the 2 cardinal components of a diagonal facing. Gates/fences/walls are
 * always single cardinal-aligned cells, so a diagonal facing aims BETWEEN
 * two real candidate cells and can miss both, and the 4-neighbor fallback
 * (computed from the player's raw position, not the facing components)
 * doesn't reliably catch it either. Confirmed live (test 1 below) and fixed
 * in `handleSpaceInteraction` by decomposing a diagonal facing into its two
 * cardinal components and trying those before the generic 4-neighbor
 * fallback.
 *
 * Every PRE-EXISTING gate test (quiz-gate-retry-loop.spec.ts,
 * iso2-c-gate-connectivity-fix.spec.ts, iso2-native-visual-scene.spec.ts)
 * avoided this entirely by hand-placing the player with an explicit
 * CARDINAL (non-diagonal) facing exactly one tile from the gate — none of
 * them exercise the realistic "single arrow key held toward a gate"
 * scenario this file adds.
 *
 * NOTE on a SEPARATE finding, NOT fixed here: an earlier draft of this file
 * tried to reproduce the natural-approach scenario using a fence-lined
 * corridor (matching how ObstacleSolver actually embeds a gate in a fence
 * run) and expected `handleMovement`'s existing X-only/Y-only wall-slide to
 * redirect diagonal movement along the fence into the gate. Instead, the
 * player drifted straight through/past cells flagged `walkable: false`
 * (`wooden_fence`) without being stopped at all in that setup. This smells
 * like a real nano-footprint collision-precision gap (fences resolved via
 * `isPositionWalkable`'s nano path may have a much narrower blocking band
 * than the full tile when injected directly via the debug API rather than
 * through real generation/chain-integrity), but it wasn't isolated cleanly
 * enough this session to be a confirmed, safe, narrow fix — flagging for a
 * dedicated follow-up rather than guessing at a collision-precision change
 * under time pressure. The tests below avoid that confound by using either
 * a direct controlled placement (test 1) or a fully open area with the gate
 * positioned exactly on the natural diagonal path (test 2), neither of
 * which depends on fence wall-sliding.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, undefined, { timeout: 15000 });
}

async function pressSpace(page: Page) {
  await page.keyboard.down(' ');
  await page.waitForTimeout(200);
  await page.keyboard.up(' ');
  await page.waitForTimeout(300);
}

function readDialog(page: Page) {
  return page.evaluate(() => {
    const overlay = document.getElementById('dialogOverlay');
    const name = document.getElementById('dialogName');
    return { visible: overlay ? overlay.style.display !== 'none' : false, name: name?.textContent || '' };
  });
}

async function isQuizOrDialogOpen(page: Page) {
  const dialog = await readDialog(page);
  const quizActive = await page.evaluate(() => (window as any).__gameDebug.state.quiz.active);
  return { open: dialog.visible || quizActive, dialog, quizActive };
}

test('a player facing DIAGONALLY (the natural result of a single arrow key) can still trigger an adjacent gate with Space', async ({ page }) => {
  await waitForGame(page);

  // Controlled setup: player sits exactly one cell WEST + one cell SOUTH of
  // the gate, with facing set to the diagonal a single ArrowRight/Up-style
  // key press naturally produces (dx=1, dy=-1) -- pointing at the gate's
  // northeast neighbor, NOT the gate itself, and NOT a pure cardinal
  // direction. Before the fix, neither the facing check nor the old
  // 4-cardinal fallback (which fires from the player's raw position) would
  // find a cell exactly at (dx=1,dy=0) or (dx=0,dy=-1) from here relative
  // to the gate -- this reproduces the bug deterministically, independent
  // of any movement/collision timing.
  const { GX, GY } = await page.evaluate(() => {
    const state = (window as any).__gameDebug.state;
    const GX = 15, GY = 12;
    const chunk = state.chunks.get('0,0');
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        chunk.cells[GY + dy][GX + dx] = { assetKey: 'grass', walkable: true, interactable: false, resolved: true };
      }
    }
    chunk.cells[GY][GX] = { assetKey: 'quiz_gate', walkable: false, interactable: true, resolved: false };

    // One cell SW of the gate (integer position -- isolates the diagonal-
    // facing question from the separate fractional-position rounding
    // question already covered by quiz-gate-retry-loop.spec.ts).
    state.player.x = GX - 1;
    state.player.y = GY + 1;
    state.player.isMoving = false;
    state.player.facingDx = 1;
    state.player.facingDy = -1;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    state.paused = false;
    return { GX, GY };
  });

  await pressSpace(page);
  const result = await isQuizOrDialogOpen(page);
  expect(
    result.open,
    `Space with a diagonal facing (1,-1) one cell SW of the gate at (${GX},${GY}) must trigger it via the ` +
    `cardinal-component fallback. dialog=${JSON.stringify(result.dialog)}`,
  ).toBe(true);
});

/** Realistic end-to-end version: WALK the player via a single arrow key
 * (real movement input, not teleport) across an open area, with the gate
 * placed exactly on the diagonal line that key produces, so continuous
 * collision naturally stops the player adjacent to it -- exactly like a
 * real child holding one key toward a visible gate. No corridor/fence
 * walls involved (see the file-level note on why). */
test('walking a single arrow key toward a gate positioned on the natural diagonal path still lets Space trigger it', async ({ page }) => {
  await waitForGame(page);

  const setup = await page.evaluate(() => {
    const state = (window as any).__gameDebug.state;
    // Start at (5.5, 15.5); ArrowRight -> grid (dx=+1,dy=-1) normalized, so
    // the player travels along row(y) = 15.5 - (x - 5.5). Gate placed
    // exactly on that line: col 13, row 15.5-(13-5.5)=8 -> use row 8.
    const START_X = 5.5, START_Y = 15.5, GATE_COL = 13, GATE_ROW = 8;
    const chunk = state.chunks.get('0,0');
    for (let row = 4; row <= 18; row++) {
      for (let col = 2; col <= 18; col++) {
        chunk.cells[row][col] = { assetKey: 'grass', walkable: true, interactable: false, resolved: true };
      }
    }
    chunk.cells[GATE_ROW][GATE_COL] = { assetKey: 'quiz_gate', walkable: false, interactable: true, resolved: false };

    state.player.x = START_X;
    state.player.y = START_Y;
    state.player.isMoving = false;
    state.player.facingDx = 1;
    state.player.facingDy = -1;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    state.paused = false;
    return { START_X, START_Y, GATE_COL, GATE_ROW };
  });

  // Hold ArrowRight until the player is actually adjacent to the gate (or we
  // time out). Fixed wall-clock holds (e.g. 3500ms) are flaky under headless
  // frame rates: at ~30fps and speed 0.05 the player can stop short of the
  // gate and Space correctly does nothing — a measurement artifact, not an
  // interaction bug. Proximity wait is the real-player-equivalent of "keep
  // walking until you hit the obstacle."
  await page.keyboard.down('ArrowRight');
  const reached = await page.waitForFunction(
    ({ col, row }) => {
      const p = (window as any).__gameDebug.state.player;
      const dx = Math.abs(p.x - (col + 0.5));
      const dy = Math.abs(p.y - (row + 0.5));
      // Within ~1.2 cells of gate center = footprint-adjacent / pressed against it
      return dx + dy < 1.8;
    },
    { col: setup.GATE_COL, row: setup.GATE_ROW },
    { timeout: 12000 },
  ).then(() => true).catch(() => false);
  await page.keyboard.up('ArrowRight');
  // Wait for the physics to genuinely settle (isMoving=false) rather than a
  // fixed guess -- avoids a race where an edge-detected Space press lands on
  // a frame where isMoving briefly reads true and the whole attempt is
  // skipped (handleSpaceInteraction requires `!state.player.isMoving`).
  await page.waitForFunction(() => (window as any).__gameDebug.state.player.isMoving === false, undefined, { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(150);

  expect(
    reached,
    `player never got within adjacency of gate (${setup.GATE_COL},${setup.GATE_ROW}) while holding ArrowRight for up to 12s — movement/collision setup issue, not Space targeting`,
  ).toBe(true);

  const stopped = await page.evaluate(() => {
    const p = (window as any).__gameDebug.state.player;
    return { x: p.x, y: p.y, facingDx: p.facingDx, facingDy: p.facingDy, isMoving: p.isMoving };
  });
  console.log(
    `Player naturally stopped at x=${stopped.x}, y=${stopped.y} ` +
    `(gate at col=${setup.GATE_COL}, row=${setup.GATE_ROW}), facing dx=${stopped.facingDx}/dy=${stopped.facingDy}`,
  );

  // Sanity: must have actually traveled the diagonal, not stayed put.
  expect(stopped.x, 'player should have moved east from the 5.5 start').toBeGreaterThan(7);
  expect(stopped.y, 'player should have moved north (decreasing y) from the 15.5 start').toBeLessThan(14);

  // Real players just press Space again if nothing happens the first time
  // (no cooldown/penalty exists for that) -- retry a couple of times before
  // failing, so this test measures "can the player realistically trigger
  // the gate" rather than "does frame-perfect single-press timing align
  // with Playwright's own event-loop timing".
  let result = await (async () => { await pressSpace(page); return isQuizOrDialogOpen(page); })();
  for (let attempt = 0; attempt < 2 && !result.open; attempt++) {
    result = await (async () => { await pressSpace(page); return isQuizOrDialogOpen(page); })();
  }
  expect(
    result.open,
    `Space (tried up to 3x) after a natural single-key diagonal approach to a gate on that exact path must trigger it. ` +
    `Player rest position was x=${stopped.x}, y=${stopped.y}, facing dx=${stopped.facingDx}/dy=${stopped.facingDy}. ` +
    `dialog=${JSON.stringify(result.dialog)}`,
  ).toBe(true);
});
