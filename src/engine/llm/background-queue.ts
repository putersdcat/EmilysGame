/**
 * background-queue.ts — Single-slot LLM request serialization +
 * fire-and-forget prefetch/cache, so interactive call sites never wait
 * on live LLM latency.
 *
 * 2026-07-10 -- built after live-measuring that this project's local
 * CPU-only BitNet server appears to process one request at a time
 * (single-threaded llama.cpp): an abandoned client request (e.g. after
 * an AbortController timeout) keeps running server-side and delays or
 * starves every subsequent call, even ones a fresh client has no idea
 * are queued behind a ghost. Reproduced live: a second npcChatResponse
 * call exceeded a 60s test timeout, queued behind a first call's
 * already-timed-out-client-side-but-still-running-server-side request.
 *
 * The fix is architectural, not a bigger timeout:
 *   1. At most one real HTTP request in flight at a time, enforced by
 *      `tryAcquire()` / `release()` (a simple non-blocking mutex --
 *      callers that can't get the slot immediately give up and fall
 *      back, they never wait for it to free).
 *   2. Speculative background work goes through `prefetch(key, job)`:
 *      fire-and-forget, does not block the caller, serializes with
 *      the same slot (polling is fine here -- nothing is waiting on
 *      it), and stores its result in a cache keyed by `key`.
 *   3. Interactive call sites check `getPrefetchedResult(key)` first
 *      (instant, zero latency) and only fall through to a direct,
 *      timeout-bound live attempt (itself gated by `tryAcquire()`) if
 *      nothing was prefetched in time. Direct attempts NEVER wait for
 *      the slot either -- if it's busy, they skip straight to whatever
 *      deterministic fallback the caller already has.
 *
 * This means "the user is never waiting on any latency in an NPC or
 * other LLM-enabled natural language thing" (2026-07-10 product
 * direction): real-time gameplay moments either get an already-ready
 * prefetched answer, or immediately use the existing curated fallback
 * -- they never sit through LLM generation time.
 */

type Job<T> = () => Promise<T>;

let queueBusy = false;
const resultCache = new Map<string, unknown>();
const pendingKeys = new Set<string>();

/** Whether the single LLM request slot is currently claimed. */
export function isQueueBusy(): boolean {
  return queueBusy;
}

/**
 * Atomically claim the single LLM request slot. Returns false (and
 * claims nothing) if already busy -- callers must NOT wait/retry on
 * failure, that would reintroduce the latency this module exists to
 * avoid. Always release() in a finally block after a successful claim.
 */
export function tryAcquire(): boolean {
  if (queueBusy) return false;
  queueBusy = true;
  return true;
}

/** Release the slot claimed by a successful tryAcquire(). */
export function release(): void {
  queueBusy = false;
}

/**
 * Instant, non-blocking lookup of a previously prefetched result.
 * Returns undefined if never requested, still pending, or the job's
 * own logic decided not to cache a value -- callers should treat
 * "undefined" the same as "no prefetch happened", not as an error.
 */
export function getPrefetchedResult<T>(key: string): T | undefined {
  return resultCache.get(key) as T | undefined;
}

/** Whether `key` currently has a background job in flight (not yet resolved). */
export function isPrefetchPending(key: string): boolean {
  return pendingKeys.has(key);
}

/**
 * Schedule background work for `key` if it isn't already pending or
 * cached. Fire-and-forget: never blocks the caller. The job runs once
 * the shared slot is free (polling internally -- safe, since nothing
 * is waiting on a prefetch to start) and its result becomes available
 * via getPrefetchedResult(key) once resolved. A job that returns
 * null/undefined is treated as "nothing worth caching" (not retried
 * automatically -- callers needing a retry should call prefetch again).
 */
export function prefetch<T>(key: string, job: Job<T>): void {
  if (pendingKeys.has(key) || resultCache.has(key)) return;
  pendingKeys.add(key);
  void runWhenFree(job).then((result) => {
    pendingKeys.delete(key);
    if (result !== null && result !== undefined) resultCache.set(key, result);
  });
}

/** Poll for the shared slot, then run `job` while holding it. */
async function runWhenFree<T>(job: Job<T>): Promise<T | undefined> {
  while (!tryAcquire()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  try {
    return await job();
  } catch (err) {
    console.warn('[LLM] Background prefetch job failed:', err);
    return undefined;
  } finally {
    release();
  }
}

/** Test seam: reset all queue/cache state (e.g., between unit tests). */
export function _resetQueueForTests(): void {
  queueBusy = false;
  resultCache.clear();
  pendingKeys.clear();
}
