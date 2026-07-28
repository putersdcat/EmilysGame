/**
 * llm.ts — Barrel re-export for the LLM client.
 *
 * Decomposed in B8.1–B8.6 (issue #271) into focused sub-modules:
 *   - test-mode.ts     — isTestMode()
 *   - tps.ts           — getLlmTps / getLlmAvgTps / isTpsCutoverActive / recordTps /
 *                         isLikelyToFitBudget / estimateEtaMs (2026-07-10, per-call
 *                         interactive-budget gating, see tps.ts header)
 *   - background-queue.ts — isQueueBusy / tryAcquire / release / prefetch /
 *                         getPrefetchedResult / isPrefetchPending (2026-07-10,
 *                         single-slot serialization + fire-and-forget prefetch
 *                         cache so interactive callers never wait on live LLM
 *                         latency -- see background-queue.ts header)
 *   - wordlist-cache.ts — getCachedWordlist / setCachedWordlist
 *   - client.ts        — isLlmAvailable / checkLlmHealth / llmComplete / llmChat
 *   - entropy.ts       — generateWordlist / expandEntropy
 *   - npc.ts           — npcChatResponse / rephraseQuizQuestion / prefetchQuizRephrase /
 *                         cleanupLlmSessions
 *
 * All public API is preserved here for backward compat with existing
 * consumers (main.ts, game/quiz.ts, game/tutorial.ts, game/audio/*,
 * ui/debug-overlay.ts, ui/hud.ts).
 */
export { isTestMode } from './llm/test-mode';
export { getLlmTps, getLlmAvgTps, isTpsCutoverActive, isLikelyToFitBudget, estimateEtaMs } from './llm/tps';
export { isQueueBusy, getPrefetchedResult, isPrefetchPending } from './llm/background-queue';
export { getCachedWordlist, setCachedWordlist } from './llm/wordlist-cache';
export { isLlmAvailable, checkLlmHealth, llmComplete, llmChat } from './llm/client';
export { generateWordlist, expandEntropy } from './llm/entropy';
export { npcChatResponse, rephraseQuizQuestion, prefetchQuizRephrase, cleanupLlmSessions, _cleanRephraseForTests } from './llm/npc';
