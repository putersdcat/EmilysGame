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

// ─── Core API Call ───────────────────────────────────────────

/**
 * Make a raw fetch call to the LLM API with timeout.
 */
async function llmFetch(
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_CONFIG.timeoutMs);

  try {
    const response = await fetch(`${LLM_CONFIG.endpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${LLM_CONFIG.endpoint}${LLM_CONFIG.healthPath}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    llmAvailable = response.ok;
  } catch {
    llmAvailable = false;
  }

  console.log(`[LLM] Health check: ${llmAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}`);
  return llmAvailable;
}

/**
 * Send a simple completion prompt to the LLM.
 * Returns raw text response or null on failure.
 */
export async function llmComplete(
  prompt: string,
  maxTokens: number = LLM_CONFIG.maxTokens.entropy,
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
    });

    if (!response.ok) return null;

    const data = (await response.json()) as LlmCompletionResponse;
    return data.choices?.[0]?.text?.trim() || null;
  } catch (err) {
    console.warn('[LLM] Completion failed:', err);
    llmAvailable = false;
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
    llmAvailable = false;
    return null;
  }
}

// ─── High-Level Entropy Functions ────────────────────────────

/**
 * Generate the initial 50 verb-noun pair wordlist from LLM.
 * Falls back to FALLBACK_WORDLIST if unavailable.
 */
export async function generateWordlist(): Promise<string[]> {
  const text = await llmComplete(
    ENTROPY_PROMPTS.wordlistInit,
    LLM_CONFIG.maxTokens.wordlist,
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
