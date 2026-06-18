/**
 * perf.ts - Per-subsystem frame timing instrumentation (#79, #183).
 * Exposes smoothed EMA timings for debug overlay without circular deps.
 * Also provides ring-buffer frame history for percentile benchmarks.
 * TODO: DOC - perf stats exported from here, read by ui.ts, written by main.ts
 */

/** Smoothed per-subsystem timings in ms (exponential moving average) */
export interface PerfStats {
  render: number;
  particles: number;
  wildlife: number;
  lighting: number;
  weather: number;
  update: number;
  total: number;
}

export const perfStats: PerfStats = {
  render: 0,
  particles: 0,
  wildlife: 0,
  lighting: 0,
  weather: 0,
  update: 0,
  total: 0,
};

const PERF_ALPHA = 0.1; // EMA smoothing factor

/** Smooth a metric using exponential moving average */
export function perfSmooth(old: number, sample: number): number {
  return old + PERF_ALPHA * (sample - old);
}

// --- #183: Frame history ring buffer for benchmark percentiles ---
const HISTORY_SIZE = 300; // ~5s at 60fps
const _frameHistory: number[] = new Array(HISTORY_SIZE).fill(0);
let _historyIdx = 0;
let _historyCount = 0;

/** Record a total frame time sample into the ring buffer */
export function recordFrameTime(ms: number): void {
  _frameHistory[_historyIdx] = ms;
  _historyIdx = (_historyIdx + 1) % HISTORY_SIZE;
  if (_historyCount < HISTORY_SIZE) _historyCount++;
}

/** Reset frame history (for benchmark isolation) */
export function resetFrameHistory(): void {
  _frameHistory.fill(0);
  _historyIdx = 0;
  _historyCount = 0;
}

/** Get benchmark results from frame history */
export function getFrameBenchmark(): {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  fps: number;
  subsystems: typeof perfStats;
} {
  if (_historyCount === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0, fps: 0, subsystems: { ...perfStats } };
  }
  const samples = _frameHistory.slice(0, _historyCount);
  samples.sort((a, b) => a - b);
  const n = samples.length;
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    count: n,
    min: samples[0],
    max: samples[n - 1],
    mean: sum / n,
    median: samples[Math.floor(n * 0.5)],
    p95: samples[Math.floor(n * 0.95)],
    p99: samples[Math.floor(n * 0.99)],
    fps: 1000 / (sum / n),
    subsystems: { ...perfStats },
  };
}
