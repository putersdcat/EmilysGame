---
description: "Use when editing LLM integration, entropy system, or NPC chat. Covers test mode bypass, health checks, and fallback patterns."
applyTo: "src/llm.ts"
---
# LLM Integration Rules

## Endpoint
- Local BitNet server: `http://127.0.0.1:8002`
- Health: `GET /health`
- Chat: `POST /v1/chat/completions`
- See `Docs/LLM-API-README.md` for full API reference

## Test Mode Bypass
`isTestMode()` returns true when ANY of:
1. `?test=1` URL parameter
2. `navigator.webdriver` (Playwright)
3. Pathname starts with `/EmilysGame/` (GitHub Pages)
Force disable: `?test=0`

**Never make LLM calls when `isTestMode()` is true** — use deterministic fallbacks.

## Fallback Strategy
1. If LLM inference takes >1-2 seconds, fall back to TypeScript RNG.
2. If LLM health check fails at startup, show retry UI (not crash).
3. In test mode, return pre-seeded deterministic values.

## Adding New LLM Features
1. Always check `isTestMode()` first.
2. Provide a TypeScript fallback that produces valid output.
3. Add timeout handling (AbortController with signal).
4. Do not block the game loop on LLM responses — use async with state flags.
