// filepath: src/game/wordlist-bootstrap.ts
// B5 micro-slice 11.36 (#268): wordlist + biome seed init extracted from
// main.ts init(). Handles the test-mode vs production branch for entropy
// wordlist bootstrapping. In production mode, the scrambled bundled
// wordlist is set immediately (non-blocking fallback) and the LLM wordlist
// is swapped in asynchronously once generated.
//
// In test mode the LLM is never called — the scrambled list + a fixed
// biome seed give deterministic variance. (#26)
import { isTestMode } from '../engine/llm';
import { generateWordlist } from '../engine/llm';
import { getScrambledWordlist } from '../config/wordlists.asset';
import { setWordlist, setBiomeNoiseSeed } from '../engine/gen';

// ─── Test mode constants ───────────────────────────────────
/** Fixed biome map seed for deterministic test runs. */
const TEST_BIOME_SEED = 12345;

/**
 * Initialize the entropy wordlist + biome noise seed.
 *
 * - **Test mode:** Uses scrambled bundled wordlist + fixed seed. LLM is
 *   never called. Word variance is still non-trivial because the scrambled
 *   list is non-deterministic on its own (see #26).
 *
 * - **Production mode:** Sets scrambled wordlist immediately (so the rest
 *   of init() can proceed without blocking on LLM). Kicks off
 *   `generateWordlist()` (which checks sessionStorage cache first) and
 *   swaps in the LLM result when it arrives. Biome seed uses `Date.now()`
 *   so each session has a unique biome region layout.
 *
 * Non-blocking — does not await the LLM call.
 */
export function bootstrapWordlist(): void {
  if (isTestMode()) {
    setWordlist(getScrambledWordlist());
    setBiomeNoiseSeed(TEST_BIOME_SEED);
    console.log('[INIT] Test mode: using scrambled bundled wordlist (no LLM)');
    return;
  }
  setWordlist(getScrambledWordlist()); // Immediate non-blocking fallback
  setBiomeNoiseSeed(Date.now()); // Session-unique biome regions
  generateWordlist().then((wl) => {
    setWordlist(wl);
    console.log('[INIT] LLM wordlist ready');
  });
}
