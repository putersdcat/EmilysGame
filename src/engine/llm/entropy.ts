/**
 * entropy.ts — High-level entropy helpers built on the LLM client.
 *
 * `generateWordlist()` — get a 50-pair verb-noun wordlist, preferring
 *   LLM generation but falling back to a bundled scrambled list if:
 *     - test mode is on
 *     - the sessionStorage cache has a valid list
 *     - TPS cutover is active (LLM was too slow recently)
 *     - the LLM call fails
 *
 * `expandEntropy()` — turn a verb-noun pair into a nonsense sentence
 *   for entropy hacking. Falls back to a deterministic template if
 *   the LLM call fails.
 *
 * B8.5 — extracted from `llm.ts` (#271).
 */
import { LLM_CONFIG } from '../../config/game.config';
import { ENTROPY_PROMPTS, FALLBACK_WORDLIST } from '../../config/entropy.config';
import { getScrambledWordlist } from '../../config/wordlists.asset';
import { isTestMode } from './test-mode';
import { isTpsCutoverActive, isLikelyToFitBudget } from './tps';
import { getCachedWordlist, setCachedWordlist } from './wordlist-cache';
import { tryAcquire, release } from './background-queue';
import { llmComplete } from './client';

/**
 * Get a wordlist for entropy. Priority order:
 * 1. Test mode → scrambled bundled wordlist (no LLM call)
 * 2. sessionStorage cache → reuse from previous generation
 * 3. TPS cutover active → scrambled bundled wordlist
 * 4. LLM generation → generate fresh, cache result
 * 5. Fallback → scrambled bundled wordlist
 *
 * This is called ONCE at startup. The result is cached in sessionStorage
 * so subsequent startups (including rapid test re-runs) never hit the LLM.
 */
export async function generateWordlist(): Promise<string[]> {
  // 1) Test mode: never call LLM
  if (isTestMode()) {
    console.log('[LLM] Test mode: using scrambled bundled wordlist');
    return getScrambledWordlist();
  }

  // 2) Check sessionStorage cache first
  const cached = getCachedWordlist();
  if (cached) {
    console.log(`[LLM] Using cached wordlist (${cached.length} pairs)`);
    return cached;
  }

  // 3) TPS cutover: don't call LLM if it was too slow recently
  if (isTpsCutoverActive()) {
    console.log('[LLM] TPS cutover active: using bundled wordlist');
    const list = getScrambledWordlist();
    setCachedWordlist(list);
    return list;
  }

  // 4) Try LLM generation with optimized prompt
  // tryAcquire() guard added 2026-07-10 for consistency with the rest of
  // the module (background-queue.ts) -- in practice this is always the
  // first LLM call of a session so acquisition never fails, but this
  // keeps the invariant "never more than one real request in flight"
  // true even if a future caller re-triggers wordlist generation
  // mid-session (e.g. a debug/regenerate action) while something else
  // is in flight.
  const text = await _tryGenerateWordlistLive();

  if (text) {
    const pairs = text
      .split('\n')
      .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      .filter((line) => line.length >= LLM_CONFIG.minPairLetters);

    if (pairs.length >= 10) {
      console.log(`[LLM] Generated ${pairs.length} wordlist pairs`);
      // Pad to target size from bundled lists if LLM returned fewer
      while (pairs.length < LLM_CONFIG.wordlistSize) {
        pairs.push(FALLBACK_WORDLIST[pairs.length % FALLBACK_WORDLIST.length]);
      }
      const result = pairs.slice(0, LLM_CONFIG.wordlistSize);
      setCachedWordlist(result); // Cache for future startups
      return result;
    }
  }

  // 5) Fallback: scrambled bundled wordlist
  console.log('[LLM] LLM unavailable, using scrambled bundled wordlist');
  const fallback = getScrambledWordlist();
  setCachedWordlist(fallback);
  return fallback;
}

/**
 * Attempt the live wordlist-generation call, gated by the shared request
 * slot. Returns null (never waits/retries) if acquisition fails.
 * Tuned prompt: lower token count, stop sequence, simpler prompt for
 * speed. 60s timeout (was 120s — optimized prompt needs fewer tokens).
 */
async function _tryGenerateWordlistLive(): Promise<string | null> {
  if (!tryAcquire()) return null;
  try {
    return await llmComplete(
      ENTROPY_PROMPTS.wordlistInit,
      LLM_CONFIG.maxTokens.wordlist,
      60000,
      { temperature: 0.9, stop: ['\n\n', '51.', '51 '] },
    );
  } finally {
    release();
  }
}

/**
 * Expand a verb-noun pair into a nonsense sentence for entropy hacking.
 * @param pair - e.g. "obliterate quasar"
 * @param previousOutput - prior sentence for chaining (optional)
 *
 * STATUS NOTE (2026-07-10): this function has NO live callers today.
 * The only production chunk generator, generateChunkSync()
 * (ChunkGenerator.ts), is fully synchronous and derives its per-chunk
 * seed from fastHash() + a snapshot of the (also currently never
 * populated live) NPC-chat entropy buffer -- it never calls this
 * async, LLM-backed sibling (generateChunk()). Kept working + tested
 * (TPS-gated, shared-slot-gated, safety-net timeout) in case a future
 * async chunk-load path or explicit "entropy hack" player action wires
 * it up live -- see npc.ts's identical STATUS NOTE on npcChatResponse
 * for the same kind of "scaffolding built, UI/call-site never
 * finished" situation.
 */
export async function expandEntropy(
  pair: string,
  previousOutput?: string,
): Promise<string> {
  const prompt = previousOutput
    ? ENTROPY_PROMPTS.entropyChained
        .replace('{previous}', previousOutput)
        .replace('{pair}', pair)
    : ENTROPY_PROMPTS.entropyExpand.replace('{pair}', pair);

  const text = await _tryExpandEntropyLive(prompt);

  if (text) {
    return text;
  }

  // Deterministic fallback (e.g., test mode, LLM offline)
  return `${pair[0]?.toUpperCase() ?? ''}${pair.slice(1)} spirals into ${previousOutput ?? 'the void'}.`;
}

/**
 * Attempt the live call, gated by TPS budget + the shared request slot.
 * Returns null (never waits/retries) if either check fails.
 * TPS-gated + shared-slot-gated + 25s safety-net timeout (2026-07-10,
 * live-measured against a real local CPU-only BitNet server:
 * ~0.19s/token with a system prompt present, so maxTokens.entropy=80
 * needs ~15.2s -- right at the edge of the old 15s default, causing
 * intermittent silent fallback. tryAcquire() also ensures this never
 * piles a second concurrent request onto an in-flight prefetch/call
 * (background-queue.ts) -- same reasoning as npc.ts's
 * npcChatResponse/rephraseQuizQuestion.
 */
async function _tryExpandEntropyLive(prompt: string): Promise<string | null> {
  if (!isLikelyToFitBudget(LLM_CONFIG.maxTokens.entropy) || !tryAcquire()) return null;
  try {
    return await llmComplete(prompt, LLM_CONFIG.maxTokens.entropy, 25000);
  } finally {
    release();
  }
}

