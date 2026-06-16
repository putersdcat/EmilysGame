/**
 * client.ts — Low-level LLM HTTP client.
 *
 * Owns:
 *   - Connection state (active endpoint, available flag, last health check)
 *   - `llmFetch()` — POST with timeout (AbortController) + auth header
 *   - `checkLlmHealth()` — try primary + fallback endpoints, cache result
 *   - `llmComplete()` — text completion API + TPS recording
 *   - `llmChat()` — chat-completion API + TPS recording
 *
 * All five are skipped (return null / false) when `isTestMode()` is true.
 *
 * B8.4 — extracted from `llm.ts` (#271).
 */
import { LLM_CONFIG } from '../../config/game.config';
import { isTestMode } from './test-mode';
import { recordTps } from './tps';

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

function getAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (LLM_CONFIG.apiKey) {
    headers.Authorization = `Bearer ${LLM_CONFIG.apiKey}`;
  }
  return headers;
}

/** Whether the most recent health check succeeded. */
export function isLlmAvailable(): boolean { return llmAvailable; }

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

// ─── Health Check ────────────────────────────────────────────

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

// ─── Completion + Chat ───────────────────────────────────────

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
    if (err instanceof Error && err.name !== 'AbortError')    {
      llmAvailable = false;
    }
    return null;
  }
}
