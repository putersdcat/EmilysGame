/**
 * quiz-gate-retry-loop.spec.ts — Step 4 audit: quiz retry-loop softlock check
 * (2026-07-10, gameplay-systems audit, resumed after the Vision Alignment
 * Audit findings were closed out).
 *
 * MAJOR FINDING (this is the real reason this file exists): while
 * debugging why this test's "submit a wrong answer" step never produced
 * the expected toast, detailed state snapshots revealed
 * `handleQuizInput`/`handleDialogInput` in main.ts BOTH always
 * `return false` unconditionally -- the `return false;` sat OUTSIDE their
 * `if (state.quiz.active) {...}` / `if (state.ui.dialog.active) {...}`
 * blocks, so it ran regardless of whether a quiz/dialog was actually
 * active/handled. This directly contradicted their own JSDoc ("Returns
 * true if... handled input... caller should call input.endFrame() and
 * return early") and broke `update()`'s intended short-circuit
 * (`if (handleQuizInput(...)) { input.endFrame(); return; }` never fired).
 * Consequence: `handleMovement` + `handleSpaceInteraction` ALSO ran in the
 * SAME frame using the SAME justKeys.interact=true, silently re-firing a
 * brand-new interaction the instant a quiz was submitted or a dialog was
 * closed, if the player was still facing the same interactable (a gate,
 * NPC, sign, etc). For a quiz_gate specifically, this meant every single
 * "submit answer" press immediately re-triggered the gate interaction,
 * re-showing the dialog and re-calling startQuiz() with a fresh random
 * question -- looking like "nothing happened" from outside.
 *
 * This is almost certainly the true root cause of the long-standing
 * "flaky" tests/core/npc-interaction.spec.ts "dialog can be closed with
 * Space" failure, dismissed multiple times earlier in this session as
 * unrelated "pre-existing world-gen-dependent flakiness". After this fix
 * (main.ts: both functions now capture `const wasActive = state.x.active`
 * BEFORE their body runs -- since quizClose()/closeDialog() flip that flag
 * false as part of normal result processing -- and `return wasActive`
 * instead of a hardcoded `false`, matching the ALREADY-correct sibling
 * handleTradeInput), that test's dialog-close/re-open assertions became
 * reliable; its two remaining flake sources were separate and unrelated
 * (see npc-interaction.spec.ts's own comments: throttled HUD DOM sync, and
 * a leftover trade-panel/pendingQuiz state bleed between its own test
 * iterations -- both test-only issues, not further main.ts bugs).
 *
 * The ORIGINAL, narrower audit question this file also still answers:
 * does a quiz_gate obstacle (Doc 05 §3.5 -- "answer a question to pass")
 * ever leave a player permanently stuck? Traced the full flow
 * (interaction-handler.ts -> main.ts's handleDialogInput/handleQuizInput ->
 * quiz.ts/mechanics.ts):
 * - A wrong/idk answer NEVER touches the gate cell itself (only a correct
 *   answer calls resolveQuizGate(), converting it to door_open). This means
 *   the cell stays assetKey='quiz_gate' after any failed attempt, so the
 *   player can freely walk away and re-approach it -- genuinely unlimited
 *   retries, no attempt counter anywhere in the code.
 * - Checked the one real way this could still fail silently:
 *   startQuiz()'s `if (eligible.length === 0) { state.active = false; return; }`
 *   early-exit (which would leave `state.paused` stuck true with no active
 *   quiz overlay to interact with). Measured directly via
 *   window.__gameDebug.getMergedQuestions()/getStaticQuestions(): the
 *   merged pool has 123/156/137 questions for easy/medium/hard respectively
 *   (416 total), and even the static-only fallback (content-pack load
 *   failure scenario) has 14/14/7 -- this path is not reachable with real
 *   content, so no softlock exists here today.
 * - getQuizBias() (category weighting for a gate quiz) only ever assigns
 *   positive weights (>= 1, via a `|| 1` fallback that also neutralizes an
 *   explicit 0), so it can never zero out the eligible pool either.
 *
 * Conclusion: the retry mechanism itself is genuinely sound (matches the
 * Phase 7 lock-key DAG audit's "quiz gates always passable via retry"
 * assumption, from earlier this session -- that assumption HOLDS) -- but
 * it was UNTESTABLE/UNRELIABLE end-to-end until the handleQuizInput/
 * handleDialogInput dispatch bug above was fixed, since every retry
 * attempt was silently re-triggering a fresh interaction instead of
 * actually submitting the chosen answer.
 *
 * One additional small UX gap was found and fixed alongside the dispatch
 * bug: the "I don't know" outcome at a quiz gate cleared `pendingGateQuiz`
 * silently -- the Book of Knowledge opening could read as a "reward"
 * rather than "you're still blocked", unlike the 'wrong' branch's explicit
 * "gate remains shut" toast. Added a matching toast for the idk-at-a-gate
 * case (main.ts).
 *
 * This test proves: the retry mechanism (wrong -> retry -> correct opens
 * the gate) now genuinely works end-to-end, the idk-toast fix, and (as a
 * byproduct) the handleQuizInput/handleDialogInput dispatch fix itself --
 * this test could not pass reliably before that fix landed.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, undefined, { timeout: 15000 });
}

/** Press Space with sufficient hold time for edge detection (matches the
 * established tests/core/npc-interaction.spec.ts pattern). */
async function pressSpace(page: Page) {
  await page.keyboard.down(' ');
  await page.waitForTimeout(200);
  await page.keyboard.up(' ');
  await page.waitForTimeout(300);
}

/** Place a real quiz_gate cell at a safe, known grid position in chunk
 * (0,0) (already loaded at game start, clear of the starter homestead
 * footprint) and position the player directly adjacent to it, facing it.
 * Chunks are 25x25 (5x5 world-units of 5x5 micro cells each, per
 * WorldEngine-01-SpatialHierarchy.md), valid indices 0-24. Clears a small
 * area around the test coordinates first (plain grass) so a pre-existing
 * decoration/collectible from real generation can't interfere with the
 * interaction (e.g. an auto-collected coin firing instead of the gate). */
async function placeGateAndApproach(page: Page) {
  return page.evaluate(() => {
    const state = (window as any).__gameDebug.state;
    const GX = 20, GY = 20; // safely away from the (12,12)-ish spawn/homestead area
    const chunk = state.chunks.get('0,0');
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        chunk.cells[GY + dy][GX + dx] = { assetKey: 'grass', walkable: true, interactable: false, resolved: true };
      }
    }
    chunk.cells[GY][GX] = { assetKey: 'quiz_gate', walkable: false, interactable: true, resolved: false };
    // Player one tile SOUTH of the gate, facing north toward it. Uses
    // INTEGER positions (not +0.5 cell-center) deliberately: the
    // interaction target is computed as Math.round(playerY + facingDy),
    // and Math.round(x.5) rounds HALF-UP in JS -- combining a .5 offset
    // with a -1 facing direction silently targets the WRONG cell (one row
    // south of the actual gate). Integer coordinates avoid the ambiguity.
    state.player.x = GX;
    state.player.y = GY + 1;
    state.player.isMoving = false;
    state.player.facingDx = 0;
    state.player.facingDy = -1;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    state.paused = false;
    return { GX, GY };
  });
}

function readDialog(page: Page) {
  return page.evaluate(() => {
    const overlay = document.getElementById('dialogOverlay');
    const name = document.getElementById('dialogName');
    return { visible: overlay ? overlay.style.display !== 'none' : false, name: name?.textContent || '' };
  });
}

function readToasts(page: Page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#toastContainer .toast')).map(el => el.textContent || ''));
}

function readGateCell(page: Page, gx: number, gy: number) {
  return page.evaluate(({ gx, gy }: { gx: number; gy: number }) => {
    const state = (window as any).__gameDebug.state;
    const cell = state.chunks.get('0,0').cells[gy][gx];
    return { assetKey: cell.assetKey, walkable: cell.walkable };
  }, { gx, gy });
}

test('a wrong answer at a quiz gate leaves it re-triable, and a later correct answer genuinely opens it (no softlock)', async ({ page }) => {
  await waitForGame(page);
  const { GX, GY } = await placeGateAndApproach(page);

  // 1. First interaction: dialog opens.
  await pressSpace(page);
  let dialog = await readDialog(page);
  expect(dialog.visible, 'quiz gate interaction must open a dialog').toBe(true);
  expect(dialog.name).toBe('Quiz Gate');

  // 2. Advance dialog -> quiz starts.
  await pressSpace(page);
  await page.waitForTimeout(400); // let the async startQuiz() (LLM rephrase, bypassed in test mode) settle
  let quiz = await page.evaluate(() => {
    const q = (window as any).__gameDebug.state.quiz;
    return { active: q.active, correctIndex: q.correctIndex, choicesLen: q.choices.length };
  });
  expect(quiz.active, 'quiz must actually become active after advancing the gate dialog').toBe(true);
  expect(quiz.choicesLen).toBeGreaterThan(1);

  // 3. Deliberately select a WRONG answer (never correctIndex, never the
  // trailing "I don't know" slot).
  const wrongIndex = [...Array(quiz.choicesLen).keys()].find(i => i !== quiz.correctIndex && i !== quiz.choicesLen - 1)!;
  await page.evaluate((idx: number) => (window as any).__gameDebug.quizSelectIndex(idx), wrongIndex);

  // 4. Submit, then process the result.
  await pressSpace(page); // submit -> result = 'wrong'
  await pressSpace(page); // process result -> toast + gate stays shut

  const toastsAfterWrong = await readToasts(page);
  expect(toastsAfterWrong.some(t => /remains shut/i.test(t)), `expected a "gate remains shut" toast, got: ${JSON.stringify(toastsAfterWrong)}`).toBe(true);

  const gateAfterWrong = await readGateCell(page, GX, GY);
  expect(gateAfterWrong.assetKey, 'a wrong answer must NOT resolve the gate -- it must stay quiz_gate').toBe('quiz_gate');
  expect(gateAfterWrong.walkable).toBe(false);

  // 5. RETRY: re-approach the SAME still-locked gate. If this dialog opens
  // again, the retry mechanism is proven genuinely unlimited (no attempt
  // counter, no lockout).
  await page.evaluate(() => {
    const state = (window as any).__gameDebug.state;
    state.player.isMoving = false;
    state.paused = false;
  });
  await pressSpace(page);
  dialog = await readDialog(page);
  expect(dialog.visible, 'the SAME gate must remain interactable after a wrong answer -- this is the core retry-loop guarantee').toBe(true);
  expect(dialog.name).toBe('Quiz Gate');

  await pressSpace(page); // advance dialog -> new quiz starts (possibly a different random question)
  await page.waitForTimeout(400);
  quiz = await page.evaluate(() => {
    const q = (window as any).__gameDebug.state.quiz;
    return { active: q.active, correctIndex: q.correctIndex, choicesLen: q.choices.length };
  });
  expect(quiz.active, 'retry must produce a genuinely new active quiz').toBe(true);

  // 6. This time, answer CORRECTLY.
  await page.evaluate((idx: number) => (window as any).__gameDebug.quizSelectIndex(idx), quiz.correctIndex);
  await pressSpace(page); // submit -> result = 'correct'
  await pressSpace(page); // process result -> gate opens

  const toastsAfterCorrect = await readToasts(page);
  expect(toastsAfterCorrect.some(t => /gate opens/i.test(t)), `expected a "gate opens" toast, got: ${JSON.stringify(toastsAfterCorrect)}`).toBe(true);

  const gateAfterCorrect = await readGateCell(page, GX, GY);
  expect(gateAfterCorrect.assetKey, 'a correct answer on retry must resolve the gate to door_open').toBe('door_open');
  expect(gateAfterCorrect.walkable, 'the resolved gate must become walkable').toBe(true);
});

test('"I don\'t know" at a quiz gate clearly communicates the gate is still locked (not just silently opens the Book)', async ({ page }) => {
  await waitForGame(page);
  const { GX, GY } = await placeGateAndApproach(page);

  await pressSpace(page); // dialog opens
  await pressSpace(page); // quiz starts
  await page.waitForTimeout(400);

  const quiz = await page.evaluate(() => {
    const q = (window as any).__gameDebug.state.quiz;
    return { choicesLen: q.choices.length };
  });
  // "I don't know" is always the trailing choice.
  const idkIndex = quiz.choicesLen - 1;
  await page.evaluate((idx: number) => (window as any).__gameDebug.quizSelectIndex(idx), idkIndex);

  await pressSpace(page); // submit -> result = 'idk'
  await pressSpace(page); // process result -> Book opens + (new) "still locked" toast

  const toasts = await readToasts(page);
  console.log('[quiz-gate-idk] toasts:', JSON.stringify(toasts));
  expect(toasts.some(t => /still locked/i.test(t)), `expected a "still locked" toast for the idk-at-a-gate case, got: ${JSON.stringify(toasts)}`).toBe(true);

  const gate = await readGateCell(page, GX, GY);
  expect(gate.assetKey, 'idk must NOT resolve the gate either').toBe('quiz_gate');
});
