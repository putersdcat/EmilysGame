---
description: "Use when editing LLM integration — the barrel re-export src/engine/llm.ts OR any of the 6 decomposed modules under src/engine/llm/. Covers test-mode bypass, health checks, fallback patterns, and god-file prevention."
applyTo: "{src/engine/llm.ts,src/engine/llm/**}"
---

# LLM Integration Rules

## Status: Decomposed (B8 series complete, issue #271)
`src/engine/llm.ts` is a **barrel re-export** of the 7 focused modules
under `src/engine/llm/`. The hard ceiling for the barrel itself is **50 lines**.

See `.github/instructions/architecture.instructions.md` for god-file prevention
rules.

## Module Map

Line counts verified 2026-07-13 (previous counts in this table had drifted
significantly, especially `npc.ts` almost tripling and a whole new module
being added without a doc update -- re-verify with `Get-ChildItem src/engine/llm.ts, src/engine/llm/*.ts | ForEach-Object { (Get-Content $_.FullName | Measure-Object -Line).Lines }` rather than trusting this table blindly next time too):

```
src/engine/llm.ts                    ← 30-line barrel re-export
src/engine/llm/
  ├── test-mode.ts         (35)  ← isTestMode() + ?test=1/?test=0/navigator.webdriver
  ├── tps.ts               (99)  ← TPS rolling window + auto-cutover threshold
  ├── wordlist-cache.ts    (32)  ← sessionStorage cache for generated wordlist
  ├── client.ts            (211) ← HTTP client: checkLlmHealth, llmComplete, llmChat, llmFetch
  ├── entropy.ts           (157) ← generateWordlist (5-tier fallback) + expandEntropy
  ├── npc.ts               (205) ← npcChatResponse, rephraseQuizQuestion, cleanupLlmSessions
  └── background-queue.ts  (109) ← fire-and-forget prefetch queue (2026-07-10, TPS-gating work)
```

## Endpoint
- Local BitNet server, reached via `vite.config.ts`'s dev proxy (`/api/llm` -> `http://127.0.0.1:<port>`). **Port is machine/session-dependent** -- has been 8000/8001/8002/8005 across different setups. Always verify with `GET http://127.0.0.1:<port>/health` rather than trusting a hardcoded number in any doc; update `vite.config.ts`'s proxy `target` if it's stale. Currently `8005` (verified 2026-07-10).
- Health: `GET /health`
- Chat: `POST /v1/chat/completions`
- See `Docs/LLM-API-README.md` for full API reference

## Test Mode Bypass
`isTestMode()` (in `src/engine/llm/test-mode.ts`) returns true when ANY of:
1. `?test=1` URL parameter
2. `navigator.webdriver` (Playwright)
3. Pathname starts with `/EmilysGame/` (GitHub Pages)

Force disable: `?test=0`

**Never make LLM calls when `isTestMode()` is true** — use deterministic fallbacks.

## Fallback Strategy
1. **Wordlist generation** (in `entropy.ts`) — 5-tier priority:
   test mode → sessionStorage cache → TPS cutover → LLM → bundled fallback.
2. **NPC chat / quiz rephrase** (in `npc.ts`) — hardcoded flavor strings on failure.
3. If LLM inference takes >1-2 seconds, the TPS tracker flips `tpsCutoverTriggered`
   and the wordlist generator stops calling the LLM.
4. If LLM health check fails at startup, show retry UI (not crash).
5. In test mode, return pre-seeded deterministic values.

## Adding New LLM Features

1. Always check `isTestMode()` first.
2. Provide a TypeScript fallback that produces valid output.
3. Add timeout handling (AbortController with signal).
4. Do not block the game loop on LLM responses — use async with state flags.
5. Record TPS via `recordTps(tokens, elapsedMs)` from `tps.ts` if measuring perf.
6. **Place new code in the right sub-module:**
   - New endpoint / fetch wrapper → `client.ts`
   - New fallback cache → `wordlist-cache.ts` (or new sibling)
   - New entropy helper → `entropy.ts`
   - New chat / quiz prompt → `npc.ts`
   - New detection rule → `test-mode.ts`
7. **Re-export from `src/engine/llm.ts`** so existing consumers don't need changes.

## Test Seams (For Unit Tests)

The module-level state is reset via underscore-prefixed helpers (added in B8):
- `_setTestModeForTests(value: boolean | null)` — override test-mode detection
- `_resetTpsForTests()` — clear TPS rolling window + cutover flag
- `_clearWordlistCacheForTests()` — wipe sessionStorage cache

Use these in tests instead of monkey-patching module globals.

## Pre-Commit Checks

```bash
# Typecheck
npx tsc --noEmit

# Targeted: any tests that exercise LLM paths (usually all of them — LLM gates startup)
npx playwright test --reporter=line

# Module size scan — catch any new god-file growth
python tools/refactor/find-large-functions.py src/engine/llm/ --min-lines 70
```

## Cross-References

- `.github/instructions/architecture.instructions.md` — god-file prevention
- `.github/instructions/tests.instructions.md` — test-mode setup for Playwright
- `Docs/LLM-API-README.md` — endpoint + payload reference