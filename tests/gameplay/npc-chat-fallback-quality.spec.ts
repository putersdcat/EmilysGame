/**
 * npc-chat-fallback-quality.spec.ts — Step 4 audit: NPC dialogue
 * LLM-fallback persona-quality check (2026-07-10, gameplay-systems audit).
 *
 * FRAMING CORRECTION: this task was originally scoped as "check the
 * quality of NPC dialogue's LLM fallback," which assumes a LIVE,
 * LLM-driven "chat with an NPC" feature exists in the game today. It
 * does not. Traced to the original design in
 * archived-planning/NewGame_GameBible_StartHere.md ("NPCs & Chats":
 * "Chat: Text box input (50-100 char limit), LLM responds briefly. Feeds
 * words back into gen pool for evolution.") -- the backend function
 * (`npcChatResponse` in src/engine/llm/npc.ts) and rich per-NPC
 * `fallbackResponses` config data (src/config/npc.config.ts) were built
 * for this, but a full codebase grep found ZERO call sites for
 * `npcChatResponse` anywhere in src/ or tests/, and no chat-input UI
 * exists in index.html/the DOM. What IS live: `mechanics.ts`'s NPC
 * interaction picks ONE static, pre-authored greeting line at random
 * (no LLM call, fully synchronous) -- see the "opens dialog" tests in
 * tests/core/npc-interaction.spec.ts. The one genuinely-live LLM-touched
 * NPC-adjacent feature is `rephraseQuizQuestion()` (quiz flavor text),
 * wired into quiz.ts, also covered here since it had zero direct tests.
 *
 * Given the live-feature premise doesn't hold, this file instead proves:
 * 1. `npcChatResponse`'s fallback (which fires unconditionally in test
 *    mode, since isTestMode() short-circuits llmChat() before any
 *    network call) is now PERSONA-AWARE -- picks from that NPC's own
 *    curated `fallbackResponses` array, not a single generic
 *    "lost my train of thought" line shared by every NPC regardless of
 *    voice (a real quality bug: a cat-sounds-only persona or a poetic
 *    castle ghost would previously have spoken in plain modern English).
 * 2. An unknown npcId fails gracefully (no throw).
 * 3. `rephraseQuizQuestion`'s fallback (return the original question
 *    unmodified) behaves correctly -- the one live LLM-adjacent fallback
 *    path, and a simpler one since a quiz question has no persona voice
 *    to preserve.
 *
 * Exposed via new window.__gameDebug.npcChatResponse/rephraseQuizQuestion
 * hooks (src/game/debug-api.ts) rather than the fragile
 * dynamic-import-inside-page.evaluate technique used by
 * tests/education/math-solver-93.spec.ts (that technique is the ONLY
 * other user of it in this codebase and is currently broken there --
 * confirmed via git log that math-solver.ts itself is untouched for a
 * month, so it's a pre-existing, unrelated environment issue, not
 * something to copy for new tests).
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, undefined, { timeout: 15000 });
}

/** Representative sample spanning very distinct voices: goblin-pun
 * merchant, warm villager, sounds-only cat, poetic castle ghost, and a
 * themed shop persona (a different persona pool, see getShopPersona). */
const SAMPLE_NPC_IDS = ['merchant_default', 'villager_default', 'cat_default', 'ghost_castle', 'shop_general_merchant'];

test.describe('NPC chat LLM-fallback persona quality (Step 4 audit)', () => {

  for (const npcId of SAMPLE_NPC_IDS) {
    test(`npcChatResponse(${npcId}) falls back to one of THIS NPC's own fallbackResponses, not a generic line`, async ({ page }) => {
      await waitForGame(page);

      const result = await page.evaluate(
        ({ npcId }: { npcId: string }) => (window as any).__gameDebug.npcChatResponse(npcId, 'Hello there!'),
        { npcId },
      );

      const expectedPool: string[] = await page.evaluate(
        ({ npcId }: { npcId: string }) => (window as any).__gameDebug.getNpcFallbackResponses(npcId),
        { npcId },
      );

      expect(Array.isArray(expectedPool) && expectedPool.length > 0, `${npcId} must have a non-empty fallbackResponses pool configured`).toBe(true);
      expect(typeof result, `npcChatResponse(${npcId}) must return a string in test mode, got: ${JSON.stringify(result)}`).toBe('string');
      expect(expectedPool, `npcChatResponse(${npcId}) fallback "${result}" must be one of this NPC's OWN curated fallbackResponses, not a generic line`).toContain(result);
    });
  }

  test('npcChatResponse with an unknown npcId fails gracefully (no throw, returns null)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => (window as any).__gameDebug.npcChatResponse('totally_not_a_real_npc_id', 'hi'));
    expect(result).toBeNull();
  });

  test('cat persona fallback never breaks character into plain human words (sounds-only voice check)', async ({ page }) => {
    await waitForGame(page);

    // Sample repeatedly -- fallback picks randomly from the pool, so a
    // single call could get lucky/unlucky on a small pool; sampling
    // several times gives real confidence the WHOLE pool stays in-voice,
    // not just whichever one line happened to be picked once.
    const results: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await page.evaluate(() => (window as any).__gameDebug.npcChatResponse('cat_default', 'What is your name?'));
      results.push(r);
    }

    for (const r of results) {
      // The cat persona's whole voice is "cat sounds and purring... never
      // use human words" (see llmPersona in npc.config.ts) -- its
      // fallbackResponses are hand-authored to match (asterisked actions,
      // no real sentences). A generic-line regression would immediately
      // fail this by inserting real English like "I seem to have lost".
      expect(r, `cat fallback must stay in-character, got: "${r}"`).not.toContain('lost my train of thought');
    }
  });

  test('rephraseQuizQuestion falls back to the exact original question when the LLM is unavailable (test mode)', async ({ page }) => {
    await waitForGame(page);

    const original = 'What is 7 + 5?';
    const result = await page.evaluate(
      ({ original }: { original: string }) => (window as any).__gameDebug.rephraseQuizQuestion(original),
      { original },
    );

    expect(result, 'rephraseQuizQuestion must return the UNMODIFIED original question on fallback, so a quiz never loses its actual content').toBe(original);
  });

  // ─── _cleanRephrase (2026-07-13) ────────────────────────────────────
  // Live-tested against a real GPU backend: without a stop sequence, the
  // completions endpoint's raw continuation of the quiz-rephrase prompt
  // would keep rambling past the actual rephrase (one measured sample
  // invented an entirely different question -- "How many legs does a
  // cat have?" -- followed by several sentences of wrong "reasoning").
  // A `\n\n` stop sequence plus this cleanup makes a malformed live
  // response structurally unable to reach the player as their actual
  // quiz question. Pure string logic, no LLM call needed to test it.

  test('cleanRephrase takes only the first line of a well-formed single-line response', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() =>
      (window as any).__gameDebug.cleanRephraseForTests('What is 5 and 5, oh my?', 'What is half of 10?'),
    );
    expect(result).toBe('What is 5 and 5, oh my?');
  });

  test('cleanRephrase discards everything after a lone newline (single "\\n" case)', async ({ page }) => {
    await waitForGame(page);
    const raw = 'How many berries fill the basket?\nThe answer is 5, since half of 10 is 5.';
    const result = await page.evaluate(
      ({ raw }: { raw: string }) => (window as any).__gameDebug.cleanRephraseForTests(raw, 'What is half of 10?'),
      { raw },
    );
    expect(result).toBe('How many berries fill the basket?');
  });

  test('cleanRephrase discards rambling after a double newline (real measured failure mode)', async ({ page }) => {
    await waitForGame(page);
    // Exact shape of a live sample captured before the stop sequence was
    // added: the model invented an unrelated question, then rambled with
    // wrong reasoning across a blank-line-separated paragraph.
    const raw = '"How many legs does a cat have?"\n\nThe answer is 4. A cat has 4 legs. 10 is half of 20.';
    const result = await page.evaluate(
      ({ raw }: { raw: string }) => (window as any).__gameDebug.cleanRephraseForTests(raw, 'What is half of 10?'),
      { raw },
    );
    expect(result).toBe('"How many legs does a cat have?"');
  });

  test('cleanRephrase falls back to the original question when the result is empty/whitespace-only', async ({ page }) => {
    await waitForGame(page);
    const original = 'What is half of 10?';
    for (const raw of ['', '   ', '\n\n\n']) {
      const result = await page.evaluate(
        ({ raw, original }: { raw: string; original: string }) => (window as any).__gameDebug.cleanRephraseForTests(raw, original),
        { raw, original },
      );
      expect(result, `raw=${JSON.stringify(raw)} must fall back to the original`).toBe(original);
    }
  });

  test('cleanRephrase falls back to the original question when the first line is implausibly long', async ({ page }) => {
    await waitForGame(page);
    const original = 'What is half of 10?';
    const raw = 'A'.repeat(200); // no newline at all -- stop sequence never fired
    const result = await page.evaluate(
      ({ raw, original }: { raw: string; original: string }) => (window as any).__gameDebug.cleanRephraseForTests(raw, original),
      { raw, original },
    );
    expect(result, 'an oversized single-line result (stop sequence not honored) must not reach the player as-is').toBe(original);
  });
});
