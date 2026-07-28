/**
 * test-mode.ts — Detect test/CI mode and skip LLM entirely.
 *
 * Returns true if:
 *   - URL has ?test=1
 *   - Running on GitHub Pages (pathname starts with /EmilysGame/)
 *   - navigator.webdriver is true (Playwright, Puppeteer, etc.)
 *
 * ?test=0 forces non-test mode (for menu testing in Playwright).
 *
 * B8.1 — extracted from `llm.ts` (#271) so test-mode detection can
 * be swapped out (e.g., for unit tests that need to force one or
 * the other) without touching the rest of the LLM client.
 */
let _testMode: boolean | null = null;

/** Returns true if the LLM should be skipped (test mode, CI, etc). */
export function isTestMode(): boolean {
  if (_testMode !== null) return _testMode;
  try {
    const url = new URL(window.location.href);
    // ?test=0 forces non-test mode (overrides webdriver detection for menu testing)
    if (url.searchParams.get('test') === '0') { _testMode = false; return false; }
    if (url.searchParams.get('test') === '1') { _testMode = true; return true; }
    // Detect GitHub Pages deployment by pathname prefix
    if (url.pathname.startsWith('/EmilysGame/')) { _testMode = true; return true; }
    // Detect Playwright: navigator.webdriver is true in automated browsers
    if (navigator.webdriver) { _testMode = true; return true; }
  } catch { /* SSR or no window */ }
  _testMode = false;
  return false;
}

/** Test seam: override test mode (e.g., from a unit test). */
export function _setTestModeForTests(value: boolean | null): void {
  _testMode = value;
}
