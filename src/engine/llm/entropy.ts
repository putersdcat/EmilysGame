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
import { isTpsCutoverActive } from './tps';
import { getCachedWordlist, setCachedWordlist } from './wordlist-cache';
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
  // Tuned: lower token count, stop sequence, simpler prompt for speed
  const text = await llmComplete(
    ENTROPY_PROMPTS.wordlistInit,
    LLM_CONFIG.maxTokens.wordlist,
    60000, // 60s timeout (was 120s — optimized prompt needs fewer tokens)
    { temperature: 0.9, stop: ['\n\n', '51.', '51 '] },
  );

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
 * Expand a verb-noun pair into a nonsense sentence for entropy hacking.
 * @param pair - e.g. "obliterate quasar"
 * @param previousOutput - prior sentence for chaining (optional)
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

  const text = await llmComplete(prompt, LLM_CONFIG.maxTokens.entropy);

  if (text) {
    return text;
  }

  // Deterministic fallback (e.g., test mode, LLM offline)
  return `${pair[0]?.toUpperCase() ?? ''}${pair.slice(1)} spirals into ${previousOutput ?? 'the void'}.`;
}
