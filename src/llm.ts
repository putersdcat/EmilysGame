/**
 * llm.ts - LLM client for local BitNet loopback API.
 * Handles all communication with the local LLM server for:
 *   - Entropy wordlist generation
 *   - Nonsense sentence expansion
 *   - NPC chat responses
 *   - Quiz question rephrasing
 *
 * Falls back to RNG/static data if LLM unavailable or times out.
 */

import { LLM_CONFIG } from './config/game.config';
import { ENTROPY_PROMPTS, FALLBACK_WORDLIST } from './config/entropy.config';

// ─── Types ───────────────────────────────────────────────────

interface LlmCompletionResponse {
  choices: Array<{ text: string }>;
}

interface LlmChatResponse {
  choices: Array<{ message: { content: string } }>;
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
 */
export async function checkLlmHealth(): Promise<boolean> {
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
 */
export async function llmComplete(
  prompt: string,
  maxTokens: number = LLM_CONFIG.maxTokens.entropy,
  timeoutMs?: number,
): Promise<string | null> {
  if (!llmAvailable) {
    await checkLlmHealth();
    if (!llmAvailable) return null;
  }

  try {
    const response = await llmFetch(LLM_CONFIG.completionsPath, {
      model: LLM_CONFIG.model,
      prompt,
      max_tokens: maxTokens,
      temperature: LLM_CONFIG.temperature,
      stream: false,
    }, timeoutMs);

    if (!response.ok) return null;

    const data = (await response.json()) as LlmCompletionResponse;
    return data.choices?.[0]?.text?.trim() || null;
  } catch (err) {
    console.warn('[LLM] Completion failed:', err);
    // Only mark unavailable on connection errors, not timeouts
    if (err instanceof Error && err.name !== 'AbortError') {
      llmAvailable = false;
    }
    return null;
  }
}

/**
 * Send a chat-style prompt to the LLM.
 * Returns assistant message text or null on failure.
 */
export async function llmChat(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = LLM_CONFIG.maxTokens.npcChat,
): Promise<string | null> {
  if (!llmAvailable) {
    await checkLlmHealth();
    if (!llmAvailable) return null;
  }

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
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn('[LLM] Chat failed:', err);
    // Only mark unavailable on connection errors, not timeouts
    if (err instanceof Error && err.name !== 'AbortError') {
      llmAvailable = false;
    }
    return null;
  }
}

// ─── High-Level Entropy Functions ────────────────────────────

/**
 * Generate the initial 50 verb-noun pair wordlist from LLM.
 * Falls back to FALLBACK_WORDLIST if unavailable or too slow.
 * Uses a longer timeout since wordlist generation needs many tokens.
 */
export async function generateWordlist(): Promise<string[]> {
  // Local LLM is slow (CPU); give it 120s for 300 tokens
  const text = await llmComplete(
    ENTROPY_PROMPTS.wordlistInit,
    LLM_CONFIG.maxTokens.wordlist,
    120000, // 2 min timeout for initial wordlist
  );

  if (text) {
    // Parse numbered list: "1. obliterate quasar\n2. fabricate nebula..."
    const pairs = text
      .split('\n')
      .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      .filter((line) => line.length >= LLM_CONFIG.minPairLetters);

    if (pairs.length >= 10) {
      console.log(`[LLM] Generated ${pairs.length} wordlist pairs`);
      // Pad to 50 if needed
      while (pairs.length < LLM_CONFIG.wordlistSize) {
        pairs.push(FALLBACK_WORDLIST[pairs.length % FALLBACK_WORDLIST.length]);
      }
      return pairs.slice(0, LLM_CONFIG.wordlistSize);
    }
  }

  console.log('[LLM] Using fallback wordlist');
  return [...FALLBACK_WORDLIST];
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
