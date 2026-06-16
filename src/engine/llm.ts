/**
 * llm.ts — Barrel re-export for the LLM client.
 *
 * Decomposed in B8.1–B8.6 (issue #271) into focused sub-modules:
 *   - test-mode.ts     — isTestMode()
 *   - tps.ts           — getLlmTps / getLlmAvgTps / isTpsCutoverActive / recordTps
 *   - wordlist-cache.ts — getCachedWordlist / setCachedWordlist
 *   - client.ts        — isLlmAvailable / checkLlmHealth / llmComplete / llmChat
 *   - entropy.ts       — generateWordlist / expandEntropy
 *   - npc.ts           — npcChatResponse / rephraseQuizQuestion / cleanupLlmSessions
 *
 * All public API is preserved here for backward compat with existing
 * consumers (main.ts, game/quiz.ts, game/tutorial.ts, game/audio/*,
 * ui/debug-overlay.ts, ui/hud.ts).
 */
export { isTestMode } from './llm/test-mode';
export { getLlmTps, getLlmAvgTps, isTpsCutoverActive } from './llm/tps';
export { getCachedWordlist, setCachedWordlist } from './llm/wordlist-cache';
export { isLlmAvailable, checkLlmHealth, llmComplete, llmChat } from './llm/client';
export { generateWordlist, expandEntropy } from './llm/entropy';
export { npcChatResponse, rephraseQuizQuestion, cleanupLlmSessions } from './llm/npc';
