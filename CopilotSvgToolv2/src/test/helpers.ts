/**
 * Test helpers — timing, assertions, and test harness.
 */

export interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  memoryMb?: number;
}

export interface SuiteResult {
  suiteName: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  results: TestResult[];
}

/**
 * Simple test runner with timing, memory tracking, and error capture.
 */
export async function runSuite(suiteName: string, tests: Array<{ name: string; fn: () => Promise<void>; skip?: boolean }>): Promise<SuiteResult> {
  const results: TestResult[] = [];
  const suiteStart = performance.now();
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const test of tests) {
    if (test.skip) {
      skipped++;
      results.push({ name: test.name, passed: true, durationMs: 0 });
      process.stdout.write(`  ⏭ SKIP: ${test.name}\n`);
      continue;
    }

    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    try {
      await test.fn();
      const elapsed = performance.now() - start;
      const memDelta = (process.memoryUsage().heapUsed - memBefore) / 1024 / 1024;
      passed++;
      results.push({ name: test.name, passed: true, durationMs: Math.round(elapsed), memoryMb: Math.round(memDelta * 10) / 10 });
      process.stdout.write(`  ✅ PASS (${Math.round(elapsed)}ms, Δ${memDelta.toFixed(1)}MB): ${test.name}\n`);
    } catch (err) {
      const elapsed = performance.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      failed++;
      results.push({ name: test.name, passed: false, durationMs: Math.round(elapsed), error: message });
      process.stderr.write(`  ❌ FAIL (${Math.round(elapsed)}ms): ${test.name}\n     ${message}\n`);
    }
  }

  const suiteDuration = performance.now() - suiteStart;

  process.stdout.write(`\n📊 ${suiteName}: ${passed}/${tests.length} passed, ${failed} failed, ${skipped} skipped (${Math.round(suiteDuration)}ms)\n\n`);

  return {
    suiteName,
    total: tests.length,
    passed,
    failed,
    skipped,
    durationMs: Math.round(suiteDuration),
    results
  };
}

/** Assert condition or throw */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

/** Assert a function throws */
export async function assertThrows(fn: () => unknown | Promise<unknown>, messageContains?: string): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    if (messageContains) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes(messageContains.toLowerCase())) {
        throw new Error(`Expected error containing "${messageContains}", got: "${msg}"`);
      }
    }
  }
  if (!threw) {
    throw new Error(`Expected function to throw${messageContains ? ` with "${messageContains}"` : ''}, but it did not.`);
  }
}

/** Assert a promise resolves within a time limit */
export async function assertCompletesWithin<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timed out after ${timeoutMs}ms`)), timeoutMs);
    fn()
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** Run a function N times concurrently and return results */
export async function concurrentRun<T>(fn: () => Promise<T>, count: number): Promise<{ results: T[]; errors: Error[]; durationMs: number }> {
  const start = performance.now();
  const outcomes = await Promise.allSettled(Array.from({ length: count }, () => fn()));
  const elapsed = performance.now() - start;
  const results: T[] = [];
  const errors: Error[] = [];
  for (const o of outcomes) {
    if (o.status === 'fulfilled') results.push(o.value);
    else errors.push(o.reason instanceof Error ? o.reason : new Error(String(o.reason)));
  }
  return { results, errors, durationMs: Math.round(elapsed) };
}

/** Measure memory usage */
export function getMemoryMb(): number {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 10) / 10;
}
