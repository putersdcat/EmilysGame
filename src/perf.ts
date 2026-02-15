/**
 * perf.ts - Per-subsystem frame timing instrumentation (#79).
 * Exposes smoothed EMA timings for debug overlay without circular deps.
 * TODO: DOC - perf stats exported from here, read by ui.ts, written by main.ts
 */

/** Smoothed per-subsystem timings in ms (exponential moving average) */
export const perfStats = {
  render: 0,
  particles: 0,
  wildlife: 0,
  lighting: 0,
  weather: 0,
  total: 0,
};

const PERF_ALPHA = 0.1; // EMA smoothing factor

/** Smooth a metric using exponential moving average */
export function perfSmooth(old: number, sample: number): number {
  return old + PERF_ALPHA * (sample - old);
}
