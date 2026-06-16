/**
 * tps.ts — Tokens-per-second tracking for LLM auto-cutover.
 *
 * Keeps a rolling window of the last 5 TPS readings. If the average
 * drops below `TPS_CUTOVER_THRESHOLD` (3 TPS for local BitNet), the
 * `tpsCutoverTriggered` flag flips to true and the entropy wordlist
 * generator stops calling the LLM and falls back to a bundled list.
 *
 * B8.2 — extracted from `llm.ts` (#271).
 */

let lastTps = 0;
let tpsSamples: number[] = [];       // Rolling window of last 5 TPS readings
const TPS_WINDOW = 5;
const TPS_CUTOVER_THRESHOLD = 3;     // Below this = switch to cached wordlist
let tpsCutoverTriggered = false;

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

/** Test seam: reset TPS state (e.g., between unit tests). */
export function _resetTpsForTests(): void {
  lastTps = 0;
  tpsSamples = [];
  tpsCutoverTriggered = false;
}
