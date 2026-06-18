/**
 * llm-gate.ts — LLM connection gate that blocks game startup until ready.
 *
 * B5 micro-slice 11.26 (#268): extracted from src/main.ts.
 * Shows the LLM splash overlay with a polling status indicator. Polls
 * checkLlmHealth() every 2 seconds. Allows the dev "Skip LLM" button to
 * bypass the gate. Skips entirely in test mode.
 *
 * @see issue #26 (LLM connection gate)
 */

import { checkLlmHealth, isTestMode } from '../engine/llm';

/**
 * Show splash and poll LLM until connected. Skips in test mode.
 * Returns only when healthy, skipped, or test mode active.
 */
export async function waitForLlm(): Promise<void> {
  const splash = document.getElementById('llmSplash');

  // In test mode, skip LLM gate entirely (#26)
  if (isTestMode()) {
    console.log('[LLM] Test mode: skipping LLM health gate');
    if (splash) splash.style.display = 'none';
    return;
  }

  const statusEl = document.getElementById('llmStatus');
  const skipBtn = document.getElementById('btnSkipLlm');
  if (!splash || !statusEl) return; // Fallback: skip if no splash DOM

  splash.style.display = 'flex';

  // Allow dev skip
  let skipped = false;
  if (skipBtn) {
    skipBtn.onclick = () => { skipped = true; };
  }

  let attempt = 0;
  while (true) {
    attempt++;
    statusEl.textContent = `Connecting to LLM... (attempt ${attempt})`;
    const ok = await checkLlmHealth();
    if (ok || skipped) {
      statusEl.textContent = ok ? 'LLM connected! Starting game...' : 'Skipping LLM (dev mode)...';
      await new Promise((r) => setTimeout(r, 400));
      splash.style.display = 'none';
      return;
    }
    // Wait 2s before retry
    await new Promise((r) => setTimeout(r, 2000));
  }
}
