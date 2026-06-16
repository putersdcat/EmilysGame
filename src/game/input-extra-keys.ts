/**
 * input-extra-keys.ts — Quiz accessibility key capture (numeric + R, #94).
 *
 * B5 micro-slice 11.1 (#268): extracted from main.ts. The extra key queue
 * captures 1-9 and R/r keypresses for quiz accessibility (players who
 * prefer keyboard over click/tap to answer quiz questions). Keys are
 * captured in a frame-level queue, consumed by the quiz input block, and
 * cleared at the end of each frame.
 *
 * Public API:
 *   - setupExtraKeyCapture() — register the keydown listener (call once at init)
 *   - consumeExtraKey(key) — check + remove a key from the queue
 *   - clearExtraKeys() — clear the entire queue (call at end of each frame)
 */

// ─── Extra Key Queue (numeric + R for quiz accessibility, #94) ───

/** Keys pressed this frame — consumed by quiz input block, cleared each frame */
const _extraKeyQueue: Set<string> = new Set();

/** Register the keydown listener for numeric + R quiz keys. Call once at init. */
export function setupExtraKeyCapture(): void {
  window.addEventListener('keydown', (e) => {
    // Capture 1-9 and R/r for quiz accessibility
    if (/^[1-9r]$/i.test(e.key)) {
      _extraKeyQueue.add(e.key.toLowerCase());
    }
  });
}

/** Check + remove a key from the queue. Returns true if the key was pressed this frame. */
export function consumeExtraKey(key: string): boolean {
  if (_extraKeyQueue.has(key)) {
    _extraKeyQueue.delete(key);
    return true;
  }
  return false;
}

/** Clear the entire queue. Call at end of each frame. */
export function clearExtraKeys(): void {
  _extraKeyQueue.clear();
}
