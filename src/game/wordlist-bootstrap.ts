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
 * Gate LLM wordlist swap until after the first boot bulk chunk gen finishes.
 * Yielding ensureChunks opens macrotask gaps; a mid-batch setWordlist would
 * make later chunks in the same boot batch see different entropy than earlier
 * ones. Hold the swap until releaseBootWordlistGate() (end of createInitialState).
 */
let _bootBulkDone = false;
let _pendingWordlist: string[] | null = null;

/**
 * Allow deferred LLM wordlist swap after boot bulk ensure completes.
 * Safe to call more than once; only the first release applies a held list.
 */
export function releaseBootWordlistGate(): void {
  if (_bootBulkDone) return;
  _bootBulkDone = true;
  if (_pendingWordlist) {
    setWordlist(_pendingWordlist);
    _pendingWordlist = null;
    console.log('[INIT] LLM wordlist ready (applied after boot bulk gen)');
  }
}

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
 *   swaps in the LLM result when it arrives — but only after boot bulk
 *   chunk gen finishes (see releaseBootWordlistGate). Biome seed uses
 *   `Date.now()` so each session has a unique biome region layout.
 *
 * Non-blocking — does not await the LLM call.
 */
export function bootstrapWordlist(): void {
  if (isTestMode()) {
    setWordlist(getScrambledWordlist());
    setBiomeNoiseSeed(TEST_BIOME_SEED);
    _bootBulkDone = true; // no async swap to gate
    console.log('[INIT] Test mode: using scrambled bundled wordlist (no LLM)');
    return;
  }
  setWordlist(getScrambledWordlist()); // Immediate non-blocking fallback
  setBiomeNoiseSeed(Date.now()); // Session-unique biome regions
  generateWordlist().then((wl) => {
    if (!_bootBulkDone) {
      _pendingWordlist = wl;
      console.log('[INIT] LLM wordlist ready (held until boot bulk gen finishes)');
      return;
    }
    setWordlist(wl);
    console.log('[INIT] LLM wordlist ready');
  });
}
