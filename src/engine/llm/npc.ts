/**
 * npc.ts — High-level NPC chat + quiz question rephrasing + session cleanup.
 *
 * `npcChatResponse()` — send a player utterance to the LLM using a
 *   persona system prompt. Returns a flavor fallback if the LLM is
 *   offline or in test mode.
 *
 * `rephraseQuizQuestion()` — send a quiz question through the LLM for
 *   flavor rephrasing. Falls back to the original question.
 *
 * `cleanupLlmSessions()` — best-effort cleanup of orphaned LLM
 *   sessions left behind by crashed test runs. Called on page unload
 *   or when resetting state.
 *
 * B8.6 — extracted from `llm.ts` (#271).
 */
import { LLM_CONFIG } from '../../config/game.config';
import { ENTROPY_PROMPTS } from '../../config/entropy.config';
import { isTestMode } from './test-mode';
import { llmChat, llmComplete, isLlmAvailable } from './client';

/**
 * Send a player utterance to the LLM using a persona system prompt.
 * Returns a flavor fallback if the LLM is offline or in test mode.
 * @param persona - system prompt (NPC voice + lore)
 * @param playerInput - what the player typed
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

/**
 * Best-effort cleanup of orphaned LLM sessions from crashed test runs.
 * Call on page unload or when resetting state. No-op in test mode.
 */
export async function cleanupLlmSessions(): Promise<void> {
  if (!isLlmAvailable() || isTestMode()) return;

  try {
    const response = await fetch(`${LLM_CONFIG.endpoint}${LLM_CONFIG.sessionsPath}`, {
      headers: LLM_CONFIG.apiKey ? { Authorization: `Bearer ${LLM_CONFIG.apiKey}` } : undefined,
    });
    if (!response.ok) return;

    const sessions = await response.json() as Array<{ id: string }>;
    if (!Array.isArray(sessions) || sessions.length === 0) return;

    console.log(`[LLM] Cleaning up ${sessions.length} orphaned session(s)`);
    for (const sess of sessions) {
      try {
        await fetch(`${LLM_CONFIG.endpoint}${LLM_CONFIG.sessionsPath}/${sess.id}`, {
          method: 'DELETE',
          headers: LLM_CONFIG.apiKey ? { Authorization: `Bearer ${LLM_CONFIG.apiKey}` } : undefined,
        });
      } catch { /* best-effort */ }
    }
  } catch {
    // Sessions endpoint may not exist — that's fine
  }
}
