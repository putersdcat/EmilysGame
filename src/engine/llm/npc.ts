/**
 * npc.ts — High-level NPC chat + quiz question rephrasing + session cleanup.
 *
 * `npcChatResponse()` — send a player utterance to the LLM using a
 *   persona system prompt. Returns a persona-appropriate flavor fallback
 *   if the LLM is offline, in test mode, or errors.
 *
 *   STATUS NOTE (2026-07-10, Step 4 gameplay audit): this function has NO
 *   callers anywhere in the codebase today. It implements the original
 *   Game Bible's "NPCs & Chats" design (archived-planning/
 *   NewGame_GameBible_StartHere.md: "Chat: Text box input (50-100 char
 *   limit), LLM responds briefly. Feeds words back into gen pool for
 *   evolution.") but no text-input UI was ever built to drive it -- the
 *   live NPC interaction path (mechanics.ts) only shows one static,
 *   pre-authored greeting line per encounter (no LLM call at all).
 *   TODO: DOC / product decision -- either wire this up to a real chat
 *   UI (a genuine new feature, with the usual child-facing open-text-input
 *   safety questions that deserve explicit sign-off) or formally retire it.
 *   Kept working + tested in the meantime so it's ready either way. If it
 *   IS wired up, prefer adding a prefetchNpcChatResponse() sibling (see
 *   prefetchQuizRephrase() below for the pattern) once there's a concrete
 *   trigger point to anticipate from (e.g. player is near/facing an NPC).
 *
 * `rephraseQuizQuestion()` — send a quiz question through the LLM for
 *   flavor rephrasing. Falls back to the original question. IS live
 *   (quiz.ts's startQuiz()). `prefetchQuizRephrase()` is the background,
 *   fire-and-forget sibling: interaction-handler.ts/main.ts call it the
 *   moment a quiz is queued (pendingQuiz), well before the dialog closes
 *   and startQuiz() actually runs -- giving the LLM the dialog-reading
 *   window as a head start so the real answer is often already cached by
 *   the time it's needed (2026-07-10 product direction: never make the
 *   player wait on LLM latency for this).
 *
 * `cleanupLlmSessions()` — best-effort cleanup of orphaned LLM
 *   sessions left behind by crashed test runs. Called on page unload
 *   or when resetting state.
 *
 * B8.6 — extracted from `llm.ts` (#271).
 */
import { LLM_CONFIG } from '../../config/game.config';
import { ENTROPY_PROMPTS } from '../../config/entropy.config';
import { isTestMode } from './test-mode';
import { llmChat, llmComplete, isLlmAvailable } from './client';
import { isLikelyToFitBudget, isTpsCutoverActive } from './tps';
import { tryAcquire, release, prefetch } from './background-queue';

/**
 * Send a player utterance to the LLM using a persona system prompt.
 * Returns a persona-appropriate flavor fallback if the LLM is offline,
 * in test mode, or errors.
 * @param persona - system prompt (NPC voice + lore)
 * @param playerInput - what the player typed
 * @param fallbackResponses - this NPC's own in-character fallback lines
 *   (NpcPersona.fallbackResponses in config/npc.config.ts). Picked at
 *   random on fallback, matching how greetings are already chosen in
 *   mechanics.ts -- so a cat persona still only meows, a ghost stays
 *   ethereal, etc, instead of every NPC saying the same generic line.
 *   Falls back further to a generic line only if this is omitted/empty.
 */
export async function npcChatResponse(
  persona: string,
  playerInput: string,
  fallbackResponses?: string[],
): Promise<string> {
  // TPS-gated (2026-07-10): if the currently measured average TPS (from
  // whatever LLM calls have already run this session, e.g. wordlist
  // gen at startup) says a 100-token reply won't fit an interactive
  // budget (INTERACTIVE_BUDGET_MS in tps.ts), skip the live call
  // entirely rather than making the player wait through a long timeout
  // for a response that was never going to arrive in time. Also skips
  // (never waits) if the shared single-request slot is already claimed
  // by another in-flight call or background prefetch (background-
  // queue.ts) -- piling a second concurrent request onto this project's
  // apparently single-threaded local server just makes both slower.
  // Falls through to the normal fallback pool below, same as any miss.
  const result = await _tryNpcChatLive(persona, playerInput);
  if (result) return result;
  if (fallbackResponses && fallbackResponses.length > 0) {
    return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
  }
  return 'Hmm, I seem to have lost my train of thought...';
}

/** Attempt the live call, gated by TPS budget + the shared request slot.
 *  Returns null (never waits/retries) if either check fails. */
async function _tryNpcChatLive(persona: string, playerInput: string): Promise<string | null> {
  if (!isLikelyToFitBudget(LLM_CONFIG.maxTokens.npcChat) || !tryAcquire()) return null;
  try {
    return await _npcChatResponseInner(persona, playerInput);
  } finally {
    release();
  }
}

/**
 * Inner live-call body, no acquire/release or TPS gate -- caller (either
 * npcChatResponse's direct path, which holds the slot itself, or a
 * future prefetch job) is responsible for both.
 * 30s timeout, not the 15s default -- live-measured against a real
 * local CPU-only BitNet server: ~0.19s/token with a system prompt
 * present, so maxTokens.npcChat=100 needs ~19s -- the default 15s
 * budget was causing near-constant silent fallback. Mirrors the
 * reasoning already applied to generateWordlist()'s 60s override in
 * entropy.ts.
 */
async function _npcChatResponseInner(persona: string, playerInput: string): Promise<string | null> {
  return llmChat(persona, playerInput, LLM_CONFIG.maxTokens.npcChat, 30000);
}

/**
 * Inner live-call body for quiz rephrasing, no acquire/release or TPS
 * gate -- caller is responsible for both. Shared by rephraseQuizQuestion
 * (direct path) and prefetchQuizRephrase (background path).
 * 25s timeout, not the 15s default -- maxTokens.quizWrap=80 was right at
 * the edge of the old 15s budget (~15.2s measured need), causing
 * intermittent fallback even when the LLM was healthy and responding.
 *
 * Stop sequence + cleanup (2026-07-13): live-tested against a real GPU
 * backend after a server-side fix, the completions endpoint's raw
 * continuation of "...Rephrased:" would keep going past the actual
 * rephrase into unrelated rambling once max_tokens allowed room --
 * e.g. one measured response invented an entirely different question
 * ("How many legs does a cat have?") followed by several sentences of
 * wrong "reasoning" (contradicting the real question's own answer).
 * A `\n\n` stop sequence plus taking only the first line fixes this --
 * measured samples afterward were consistently single, short, on-topic
 * questions. `_cleanRephrase` also rejects empty/oversized results
 * (stop sequence not honored for some reason) so a malformed live
 * response can never reach the player as their actual quiz question --
 * it falls back to the original, unmodified question instead, same as
 * any other LLM failure.
 */
function _cleanRephrase(raw: string, originalQuestion: string): string {
  // First line only (covers both "\n\n" firing correctly and a lone "\n").
  const firstLine = raw.split('\n')[0].trim();
  if (!firstLine || firstLine.length > 160) return originalQuestion;
  return firstLine;
}

/** Test seam for `_cleanRephrase` -- pure string logic, no LLM call, no
 * test-mode/availability gate to bypass -- exposed directly so its
 * empty/oversized/multi-line guard behavior is verifiable without a live
 * backend. Not part of the public LLM API surface. */
export const _cleanRephraseForTests = _cleanRephrase;

async function _rephraseQuizQuestionInner(originalQuestion: string): Promise<string> {
  const prompt = ENTROPY_PROMPTS.quizRephrase.replace('{question}', originalQuestion);
  const result = await llmComplete(prompt, LLM_CONFIG.maxTokens.quizWrap, 25000, { stop: ['\n\n'] });
  return result ? _cleanRephrase(result, originalQuestion) : originalQuestion;
}

/**
 * Rephrase a quiz question through the LLM for flavor.
 * Falls back to the original question if unavailable, if the TPS gate
 * says it won't fit an interactive budget, or if the shared request
 * slot is already busy (background-queue.ts) -- never waits for it.
 */
export async function rephraseQuizQuestion(
  originalQuestion: string,
): Promise<string> {
  if (!isLikelyToFitBudget(LLM_CONFIG.maxTokens.quizWrap) || !tryAcquire()) {
    return originalQuestion;
  }
  try {
    return await _rephraseQuizQuestionInner(originalQuestion);
  } finally {
    release();
  }
}

/**
 * Kick off a background rephrase of `originalQuestion`, fire-and-forget.
 * Call this the moment a quiz is queued (pendingQuiz set in
 * interaction-handler.ts / main.ts), well before the dialog closes and
 * startQuiz() actually runs -- the dialog-reading window becomes a free
 * head start for the LLM. startQuiz() checks
 * getPrefetchedResult(originalQuestion) first and uses it instantly if
 * ready, falling through to rephraseQuizQuestion() (direct, TPS-gated,
 * timeout-bound) only on a cache miss.
 *
 * Not TPS-budget-gated like the direct/interactive path -- there's no
 * hard deadline for background work, so even a "too slow to feel
 * interactive" measured rate might still finish before the dialog
 * closes, or simply finish later with zero cost to anyone (nothing is
 * waiting on it). Still skipped entirely once isTpsCutoverActive()
 * trips (LLM is essentially unusable), matching generateWordlist()'s
 * own gate in entropy.ts.
 */
export function prefetchQuizRephrase(originalQuestion: string): void {
  if (isTpsCutoverActive()) return;
  prefetch(originalQuestion, () => _rephraseQuizQuestionInner(originalQuestion));
}


/**
 * Best-effort cleanup of orphaned LLM sessions from crashed test runs.
 * Call on page unload or when resetting state. No-op in test mode.
 */
export async function cleanupLlmSessions(): Promise<void> {
  if (!isLlmAvailable() || isTestMode()) return;

  try {
    const response = await fetch(`${LLM_CONFIG.endpoint}${LLM_CONFIG.sessionsPath}`, {
      headers: LLM_CONFIG.apiKey ? { Authorization: `Bearer ${LLM_CONFIG.apiKey}` } : undefined,
    });
    if (!response.ok) return;

    const sessions = await response.json() as Array<{ id: string }>;
    if (!Array.isArray(sessions) || sessions.length === 0) return;

    console.log(`[LLM] Cleaning up ${sessions.length} orphaned session(s)`);
    for (const sess of sessions) {
      try {
        await fetch(`${LLM_CONFIG.endpoint}${LLM_CONFIG.sessionsPath}/${sess.id}`, {
          method: 'DELETE',
          headers: LLM_CONFIG.apiKey ? { Authorization: `Bearer ${LLM_CONFIG.apiKey}` } : undefined,
        });
      } catch { /* best-effort */ }
    }
  } catch {
    // Sessions endpoint may not exist — that's fine
  }
}
