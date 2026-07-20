/**
 * boot-loading.ts — "Loading world…" spinner for bulk chunk load paths.
 *
 * Reuses the existing #llmSplash overlay so we do not invent a second full-
 * screen stack. Safe in test mode (DOM may be missing — no-ops).
 *
 * Critical-path hang fix (PR2): `updateWorldLoading` drives N/M progress
 * during multi-chunk bulk gen so the spinner is not a frozen static label.
 */

const SKIP_BTN_ID = 'btnSkipLlm';

/**
 * Show a full-screen loading overlay with the given message.
 * Defaults to "Loading world…".
 */
export function showWorldLoading(message = 'Loading world…'): void {
  const splash = document.getElementById('llmSplash');
  const statusEl = document.getElementById('llmStatus');
  const skipBtn = document.getElementById(SKIP_BTN_ID);
  if (statusEl) statusEl.textContent = message;
  if (skipBtn) skipBtn.style.display = 'none';
  if (splash) splash.style.display = 'flex';
}

/**
 * Update the spinner status text without toggling visibility.
 * Used by bulk chunk gen for N/M progress (`Loading world… 3/9`).
 * No-op when DOM is missing (test mode).
 */
export function updateWorldLoading(message: string): void {
  const statusEl = document.getElementById('llmStatus');
  if (statusEl) statusEl.textContent = message;
}

/** Hide the loading overlay (and restore skip button visibility for next LLM gate). */
export function hideWorldLoading(): void {
  const splash = document.getElementById('llmSplash');
  const skipBtn = document.getElementById(SKIP_BTN_ID);
  if (splash) splash.style.display = 'none';
  if (skipBtn) skipBtn.style.display = '';
}

/**
 * Run an async bulk-load task under the world-loading spinner.
 * Always hides the spinner in `finally`.
 */
export async function withWorldLoading<T>(
  task: () => Promise<T>,
  message = 'Loading world…',
): Promise<T> {
  showWorldLoading(message);
  try {
    return await task();
  } finally {
    hideWorldLoading();
  }
}
