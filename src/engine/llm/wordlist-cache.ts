/**
 * wordlist-cache.ts — sessionStorage cache for the generated wordlist.
 *
 * The LLM only needs to generate a wordlist ONCE per session. Subsequent
 * startups (including rapid test re-runs) read from sessionStorage and
 * skip the LLM call entirely.
 *
 * B8.3 — extracted from `llm.ts` (#271).
 */

const WORDLIST_CACHE_KEY = 'emilys_game_wordlist_cache';

/** Minimum length to consider a cached list valid. */
const MIN_VALID_PAIRS = 10;

/** Get the cached wordlist, or null if absent / corrupt / too small. */
export function getCachedWordlist(): string[] | null {
  try {
    const raw = sessionStorage.getItem(WORDLIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as string[];
    if (Array.isArray(parsed) && parsed.length >= MIN_VALID_PAIRS) return parsed;
  } catch { /* corrupt cache */ }
  return null;
}

/** Persist a wordlist to sessionStorage. Silently no-ops on storage failure. */
export function setCachedWordlist(list: string[]): void {
  try {
    sessionStorage.setItem(WORDLIST_CACHE_KEY, JSON.stringify(list));
  } catch { /* storage full / unavailable */ }
}

/** Test seam: clear the cache (e.g., between unit tests). */
export function _clearWordlistCacheForTests(): void {
  try { sessionStorage.removeItem(WORDLIST_CACHE_KEY); } catch { /* ignore */ }
}
