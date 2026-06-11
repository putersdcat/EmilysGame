/**
 * llm.ts - LLM client for local BitNet loopback API.
 * Handles all communication with the local LLM server for:
 *   - Entropy wordlist generation (cached, not every startup)
 *   - Nonsense sentence expansion
 *   - NPC chat responses
 *   - Quiz question rephrasing
 *
 * Optimized for local CPU BitNet (4-core i7, ~15 TPS peak):
 *   - Wordlist cached in sessionStorage; only regenerated on explicit request
 *   - Test mode skips LLM entirely (URL ?test=1 or Playwright detection)
 *   - TPS tracked per-response; auto-cutover to cached list when TPS < threshold
 *   - Stateless calls (no context/session) for entropy; sessions only for NPC chat
 *   - Tuned prompts: fewer instructions, stop sequences, lower token counts
 *
 * TODO: DOC - LLM integration architecture, TPS monitoring, cache flow
 */

import { LLM_CONFIG } from '../config/game.config';
import { ENTROPY_PROMPTS, FALLBACK_WORDLIST } from '../config/entropy.config';
import { getScrambledWordlist } from '../config/wordlists.asset';

// ─── Types ───────────────────────────────────────────────────

interface LlmCompletionResponse {
  choices: Array<{ text: string }>;
  usage?: { completion_tokens?: number };
}

interface LlmChatResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { completion_tokens?: number };
}

// ─── Connection State ────────────────────────────────────────

let llmAvailable = false;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30000; // Re-check every 30s
let activeEndpoint = LLM_CONFIG.endpoint;

// ─── TPS Tracking ────────────────────────────────────────────
// Tokens per second from last LLM response (for F3 debug + auto-cutover)

let lastTps = 0;
let tpsSamples: number[] = [];       // Rolling window of last 5 TPS readings
const TPS_WINDOW = 5;
const TPS_CUTOVER_THRESHOLD = 3;     // Below this = switch to cached wordlist
let tpsCutoverTriggered = false;

/** Get last measured tokens/second (0 if never measured) */
export function getLlmTps(): number { return lastTps; }

/** Get rolling average TPS */
export function getLlmAvgTps(): number {
  if (tpsSamples.length === 0) return 0;
  return tpsSamples.reduce((a, b) => a + b, 0) / tpsSamples.length;
}

/** Whether auto-cutover to cached wordlist was triggered due to low TPS */
export function isTpsCutoverActive(): boolean { return tpsCutoverTriggered; }

function recordTps(tokens: number, elapsedMs: number): void {
  if (elapsedMs <= 0 || tokens <= 0) return;
  const tps = (tokens / elapsedMs) * 1000;
  lastTps = Math.round(tps * 10) / 10;
  tpsSamples.push(lastTps);
  if (tpsSamples.length > TPS_WINDOW) tpsSamples.shift();

  // Auto-cutover check
  if (!tpsCutoverTriggered && tpsSamples.length >= 3) {
    const avg = getLlmAvgTps();
    if (avg > 0 && avg < TPS_CUTOVER_THRESHOLD) {
      tpsCutoverTriggered = true;
      console.warn(`[LLM] TPS cutover triggered: avg ${avg.toFixed(1)} < ${TPS_CUTOVER_THRESHOLD}. Switching to cached wordlists.`);
    }
  }
}

// ─── Test Mode Detection ─────────────────────────────────────
// Skip LLM entirely when running in test/CI mode

let _testMode: boolean | null = null;

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

// ─── Wordlist Cache ──────────────────────────────────────────
// Cache generated wordlist to avoid hammering LLM on every startup

const WORDLIST_CACHE_KEY = 'emilys_game_wordlist_cache';

export function getCachedWordlist(): string[] | null {
  try {
    const raw = sessionStorage.getItem(WORDLIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as string[];
    if (Array.isArray(parsed) && parsed.length >= 10) return parsed;
  } catch { /* corrupt cache */ }
  return null;
}

export function setCachedWordlist(list: string[]): void {
  try {
    sessionStorage.setItem(WORDLIST_CACHE_KEY, JSON.stringify(list));
  } catch { /* storage full / unavailable */ }
}

function getAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (LLM_CONFIG.apiKey) {
    headers.Authorization = `Bearer ${LLM_CONFIG.apiKey}`;
  }

  return headers;
}

// ─── Core API Call ───────────────────────────────────────────

/**
 * Make a raw fetch call to the LLM API with timeout.
 * @param timeoutMs - Override default timeout (e.g., longer for wordlist gen)
 */
async function llmFetch(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number = LLM_CONFIG.timeoutMs,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${activeEndpoint}${path}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Check if the LLM server is healthy.
 * Caches result for HEALTH_CHECK_INTERVAL ms.
 * In test mode, always returns false without network calls.
 */
export async function checkLlmHealth(): Promise<boolean> {
  if (isTestMode()) { llmAvailable = false; return false; }

  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return llmAvailable;
  }
  lastHealthCheck = now;

  const endpointsToTry = [
    activeEndpoint,
    LLM_CONFIG.endpoint,
    ...LLM_CONFIG.fallbackEndpoints,
  ].filter((value, index, arr) => arr.indexOf(value) === index);

  try {
    llmAvailable = false;

    for (const endpoint of endpointsToTry) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      try {
        const response = await fetch(`${endpoint}${LLM_CONFIG.healthPath}`, {
          headers: LLM_CONFIG.apiKey ? { Authorization: `Bearer ${LLM_CONFIG.apiKey}` } : undefined,
          signal: controller.signal,
        });

        if (response.ok) {
          activeEndpoint = endpoint;
          llmAvailable = true;
          clearTimeout(timeoutId);
          break;
        }
      } catch {
        // Endpoint unreachable (CORS, network, timeout) - try next
      } finally {
        clearTimeout(timeoutId);
      }
    }
  } catch {
    llmAvailable = false;
  }

  console.log(
    `[LLM] Health check: ${llmAvailable ? `AVAILABLE @ ${activeEndpoint}` : 'UNAVAILABLE'}`,
  );
  return llmAvailable;
}

/**
 * Send a simple completion prompt to the LLM.
 * Returns raw text response or null on failure.
 * Tracks TPS from response usage metadata.
 */
export async function llmComplete(
  prompt: string,
  maxTokens: number = LLM_CONFIG.maxTokens.entropy,
  timeoutMs?: number,
  opts?: { temperature?: number; stop?: string[] },
): Promise<string | null> {
  if (isTestMode()) return null; // Skip LLM in test mode

  if (!llmAvailable) {
    await checkLlmHealth();
    if (!llmAvailable) return null;
  }

  const startTime = performance.now();
  try {
    const body: Record<string, unknown> = {
      model: LLM_CONFIG.model,
      prompt,
      max_tokens: maxTokens,
      temperature: opts?.temperature ?? LLM_CONFIG.temperature,
      stream: false,
    };
    if (opts?.stop) body.stop = opts.stop;

    const response = await llmFetch(LLM_CONFIG.completionsPath, body, timeoutMs);

    if (!response.ok) return null;

    const data = (await response.json()) as LlmCompletionResponse;
    const text = data.choices?.[0]?.text?.trim() || null;

    // Track TPS from response metadata or estimate from text length
    const elapsed = performance.now() - startTime;
    const tokens = data.usage?.completion_tokens || (text ? Math.ceil(text.length / 4) : 0);
    if (tokens > 0) recordTps(tokens, elapsed);

    return text;
  } catch (err) {
    console.warn('[LLM] Completion failed:', err);
    if (err instanceof Error && err.name !== 'AbortError') {
      llmAvailable = false;
    }
    return null;
  }
}

/**
 * Send a chat-style prompt to the LLM.
 * Returns assistant message text or null on failure.
 * Uses context/session only for NPC conversations.
 */
export async function llmChat(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = LLM_CONFIG.maxTokens.npcChat,
): Promise<string | null> {
  if (isTestMode()) return null;

  if (!llmAvailable) {
    await checkLlmHealth();
    if (!llmAvailable) return null;
  }

  const startTime = performance.now();
  try {
    const response = await llmFetch(LLM_CONFIG.chatPath, {
      model: LLM_CONFIG.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: LLM_CONFIG.temperature,
      stream: false,
    });

    if (!response.ok) return null;

    const data = (await response.json()) as LlmChatResponse;
    const text = data.choices?.[0]?.message?.content?.trim() || null;

    const elapsed = performance.now() - startTime;
    const tokens = data.usage?.completion_tokens || (text ? Math.ceil(text.length / 4) : 0);
    if (tokens > 0) recordTps(tokens, elapsed);

    return text;
  } catch (err) {
    console.warn('[LLM] Chat failed:', err);
    if (err instanceof Error && err.name !== 'AbortError') {
      llmAvailable = false;
    }
    return null;
  }
}

// ─── High-Level Entropy Functions ────────────────────────────

/**
 * Get a wordlist for entropy. Priority order:
 * 1. Test mode → scrambled bundled wordlist (no LLM call)
 * 2. sessionStorage cache → reuse from previous generation
 * 3. TPS cutover active → scrambled bundled wordlist
 * 4. LLM generation → generate fresh, cache result
 * 5. Fallback → scrambled bundled wordlist
 *
 * This is called ONCE at startup. The result is cached in sessionStorage
 * so subsequent startups (including rapid test re-runs) never hit the LLM.
 */
export async function generateWordlist(): Promise<string[]> {
  // 1) Test mode: never call LLM
  if (isTestMode()) {
    console.log('[LLM] Test mode: using scrambled bundled wordlist');
    return getScrambledWordlist();
  }

  // 2) Check sessionStorage cache first
  const cached = getCachedWordlist();
  if (cached) {
    console.log(`[LLM] Using cached wordlist (${cached.length} pairs)`);
    return cached;
  }

  // 3) TPS cutover: don't call LLM if it was too slow recently
  if (tpsCutoverTriggered) {
    console.log('[LLM] TPS cutover active: using bundled wordlist');
    const list = getScrambledWordlist();
    setCachedWordlist(list);
    return list;
  }

  // 4) Try LLM generation with optimized prompt
  // Tuned: lower token count, stop sequence, simpler prompt for speed
  const text = await llmComplete(
    ENTROPY_PROMPTS.wordlistInit,
    LLM_CONFIG.maxTokens.wordlist,
    60000, // 60s timeout (was 120s — optimized prompt needs fewer tokens)
    { temperature: 0.9, stop: ['\n\n', '51.', '51 '] },
  );

  if (text) {
    const pairs = text
      .split('\n')
      .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      .filter((line) => line.length >= LLM_CONFIG.minPairLetters);

    if (pairs.length >= 10) {
      console.log(`[LLM] Generated ${pairs.length} wordlist pairs`);
      // Pad to target size from bundled lists if LLM returned fewer
      while (pairs.length < LLM_CONFIG.wordlistSize) {
        pairs.push(FALLBACK_WORDLIST[pairs.length % FALLBACK_WORDLIST.length]);
      }
      const result = pairs.slice(0, LLM_CONFIG.wordlistSize);
      setCachedWordlist(result); // Cache for future startups
      return result;
    }
  }

  // 5) Fallback: scrambled bundled wordlist
  console.log('[LLM] LLM unavailable, using scrambled bundled wordlist');
  const fallback = getScrambledWordlist();
  setCachedWordlist(fallback);
  return fallback;
}

/**
 * Expand a verb-noun pair into a nonsense sentence for entropy hacking.
 * @param pair - e.g. "obliterate quasar"
 * @param previousOutput - prior sentence for chaining (optional)
 */
export async function expandEntropy(
  pair: string,
  previousOutput?: string,
): Promise<string> {
  const prompt = previousOutput
    ? ENTROPY_PROMPTS.entropyChained
        .replace('{previous}', previousOutput)
        .replace('{pair}', pair)
    : ENTROPY_PROMPTS.entropyExpand.replace('{pair}', pair);

  const text = await llmComplete(prompt, LLM_CONFIG.maxTokens.entropy);

  if (text) {
    return text;
  }

  // Fallback: deterministic pseudo-sentence from pair
  return `The ${pair.split(' ')[1] || 'void'} ${pair.split(' ')[0] || 'pulsates'} through crystalline dimensions of absurdity.`;
}

/**
 * Get NPC chat response.
 * @param persona - LLM system prompt for NPC personality
 * @param playerInput - What the player typed
 */
export async function npcChatResponse(
  persona: string,
  playerInput: string,
): Promise<string> {
  const result = await llmChat(persona, playerInput, LLM_CONFIG.maxTokens.npcChat);
  return result || 'Hmm, I seem to have lost my train of thought...';
}

/**
 * Rephrase a quiz question through the LLM for flavor.
 * Falls back to the original question if unavailable.
 */
export async function rephraseQuizQuestion(
  originalQuestion: string,
): Promise<string> {
  const prompt = ENTROPY_PROMPTS.quizRephrase.replace('{question}', originalQuestion);
  const result = await llmComplete(prompt, LLM_CONFIG.maxTokens.quizWrap);
  return result || originalQuestion;
}

/** Expose availability for UI status indicators */
export function isLlmAvailable(): boolean {
  return llmAvailable;
}

// ─── Session Cleanup ─────────────────────────────────────────
// Utility to close orphaned LLM sessions from crashed test runs.
// Call on page unload or when resetting state.

export async function cleanupLlmSessions(): Promise<void> {
  if (!llmAvailable || isTestMode()) return;

  try {
    const response = await fetch(`${activeEndpoint}${LLM_CONFIG.sessionsPath}`, {
      headers: LLM_CONFIG.apiKey ? { Authorization: `Bearer ${LLM_CONFIG.apiKey}` } : undefined,
    });
    if (!response.ok) return;

    const sessions = await response.json() as Array<{ id: string }>;
    if (!Array.isArray(sessions) || sessions.length === 0) return;

    console.log(`[LLM] Cleaning up ${sessions.length} orphaned session(s)`);
    for (const sess of sessions) {
      try {
        await fetch(`${activeEndpoint}${LLM_CONFIG.sessionsPath}/${sess.id}`, {
          method: 'DELETE',
          headers: LLM_CONFIG.apiKey ? { Authorization: `Bearer ${LLM_CONFIG.apiKey}` } : undefined,
        });
      } catch { /* best-effort */ }
    }
  } catch {
    // Sessions endpoint may not exist — that's fine
  }
}


