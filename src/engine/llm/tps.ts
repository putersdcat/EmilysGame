/**
 * tps.ts — Tokens-per-second tracking for LLM auto-cutover.
 *
 * Keeps a rolling window of the last 5 TPS readings. If the average
 * drops below `TPS_CUTOVER_THRESHOLD` (3 TPS for local BitNet), the
 * `tpsCutoverTriggered` flag flips to true and the entropy wordlist
 * generator stops calling the LLM and falls back to a bundled list.
 *
 * B8.2 — extracted from `llm.ts` (#271).
 *
 * 2026-07-10 addition — per-call interactive-budget gating: the 3 TPS
 * wordlist cutover threshold above was tuned for the wordlist's own
 * generous 60s/300-token patience budget (see entropy.ts). It does NOT
 * fire for hardware that measures faster than 3 TPS but is still too
 * slow to feel responsive for a live NPC chat reply -- live-measured on
 * a real local CPU-only BitNet server at ~5.2 TPS, a 100-token NPC
 * response needs ~19s, which is not an acceptable wait for an
 * interactive game conversation even though it's well above 3 TPS.
 * `isLikelyToFitBudget()` answers a different, per-call question: given
 * the CURRENT measured average TPS and a specific call's own token
 * budget, will it plausibly finish inside an "interactive" time budget?
 * Callers (npc.ts, entropy.ts's expandEntropy) use this to skip
 * attempting the live call entirely (going straight to the deterministic
 * fallback) instead of paying a long timeout wait for a response that
 * was never going to arrive in time to feel responsive.
 */

let lastTps = 0;
let tpsSamples: number[] = [];       // Rolling window of last 5 TPS readings
const TPS_WINDOW = 5;
const TPS_CUTOVER_THRESHOLD = 3;     // Below this = switch to cached wordlist
let tpsCutoverTriggered = false;

/** Default wall-clock budget (ms) for a call to still feel "interactive"
 *  (NPC chat, quiz rephrase, entropy flavor text) -- distinct from the
 *  wordlist's own much larger 60s patience budget. */
export const INTERACTIVE_BUDGET_MS = 8000;

/** Get last measured tokens/second (0 if never measured). */
export function getLlmTps(): number { return lastTps; }

/** Get rolling average TPS. */
export function getLlmAvgTps(): number {
  if (tpsSamples.length === 0) return 0;
  return tpsSamples.reduce((a, b) => a + b, 0) / tpsSamples.length;
}

/** Whether auto-cutover to cached wordlist was triggered due to low TPS. */
export function isTpsCutoverActive(): boolean { return tpsCutoverTriggered; }

/**
 * Record a TPS sample and re-evaluate the cutover threshold.
 * @param tokens - completion tokens from the response
 * @param elapsedMs - wall-clock time for the request
 */
export function recordTps(tokens: number, elapsedMs: number): void {
  if (elapsedMs <= 0 || tokens <= 0) return;
  const tps = (tokens / elapsedMs) * 1000;
  lastTps = Math.round(tps * 10) / 10;
  tpsSamples.push(lastTps);
  if (tpsSamples.length > TPS_WINDOW) tpsSamples.shift();

  // Auto-cutover check (need 3 samples before judging)
  if (!tpsCutoverTriggered && tpsSamples.length >= 3) {
    const avg = getLlmAvgTps();
    if (avg > 0 && avg < TPS_CUTOVER_THRESHOLD) {
      tpsCutoverTriggered = true;
      console.warn(`[LLM] TPS cutover triggered: avg ${avg.toFixed(1)} < ${TPS_CUTOVER_THRESHOLD}. Switching to cached wordlists.`);
    }
  }
}

/**
 * Estimate wall-clock time (ms) to generate `tokens` more tokens, based
 * on the current rolling-average TPS. Returns `null` if TPS hasn't been
 * measured yet (no successful completion recorded this session) -- there
 * is no data to estimate from, so callers should treat this as "unknown,
 * proceed optimistically" rather than "definitely too slow".
 */
export function estimateEtaMs(tokens: number): number | null {
  const avg = getLlmAvgTps();
  if (avg <= 0) return null;
  return (tokens / avg) * 1000;
}

/**
 * Whether a call needing `tokens` more tokens is likely to finish inside
 * `budgetMs` of wall-clock time (default `INTERACTIVE_BUDGET_MS`), given
 * the currently measured average TPS. Used to skip attempting a live LLM
 * call entirely (going straight to a deterministic fallback) when the
 * measured hardware is demonstrably too slow for that call to feel
 * responsive -- instead of paying a long timeout wait for a response
 * that was never going to arrive in time. Returns `true` (attempt the
 * call) when no TPS has been measured yet, since there's no basis to
 * refuse on a cold start -- the first real call becomes the measurement
 * that later calls can be gated on.
 */
export function isLikelyToFitBudget(tokens: number, budgetMs: number = INTERACTIVE_BUDGET_MS): boolean {
  const eta = estimateEtaMs(tokens);
  if (eta === null) return true;
  return eta <= budgetMs;
}

/** Test seam: reset TPS state (e.g., between unit tests). */
export function _resetTpsForTests(): void {
  lastTps = 0;
  tpsSamples = [];
  tpsCutoverTriggered = false;
}
