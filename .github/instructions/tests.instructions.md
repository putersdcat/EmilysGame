---
description: "Use when writing or editing Playwright tests. Covers test organization, test mode, sharded categories, and coverage gaps."
applyTo: "tests/**"
---

# Testing Standards

## Framework
Playwright E2E tests. The game runs in a real browser — tests interact with the actual canvas and DOM.

## Test Mode
- `?test=1` URL param bypasses all LLM calls (uses deterministic fallbacks)
- `navigator.webdriver` auto-detected by Playwright — test mode auto-activates
- `?test=0` force-disables test mode
- GitHub Pages path (`/EmilysGame/`) also triggers test mode

See `src/engine/llm/test-mode.ts` and `.github/instructions/llm-integration.instructions.md`
for the implementation.

## Running Tests
```sh
npx playwright test --reporter=line          # all tests
npx playwright test tests/core/             # by category
npm run test:core                            # via npm script sharding
```

## Test Categories (sharded in package.json)

| Category | Directory | Specs | Focus |
|---|---|---|---|
| audio | `tests/audio/` | 6 | cassette, MIDI, music, NPC voice, positional, SFX |
| core | `tests/core/` | 6 | game loop, NPC, resolved cells, status, trading |
| education | `tests/education/` | 11 | age profile, book, math, quiz, taxonomy |
| gameplay | `tests/gameplay/` | 13 | barter, cats, debuffs, injury, structures, wildlife |
| perf | `tests/perf/` | 1 | frame time |
| rendering | `tests/rendering/` | 16 | shadows, emoji, fire, menu, night, terrain, SVG, iso2 |
| sprites | `tests/sprites/` | 13 | accessories, cosmetics, customizer, hair, eyes, NPC |
| ui | `tests/ui/` | 11 | alpha QoL, fog, HUD, screenshot, thought bubbles, touch |
| world-gen | `tests/world-gen/` | 12 | edges, lock-key, metadata, mood, playability |

## Known Coverage Gaps (Still Open)

These modules have NO direct test coverage — prioritize when adding tests:

- `src/game/wildlife.ts` (579 lines, 🔴 god-file) — high-value extraction AND test target
- `src/game/knowledge.ts` (479 lines)
- `src/game/trading.ts` (470 lines)
- `src/game/input.ts` (522 lines, 🔴 god-file)
- `src/game/debug-api.ts` (406 lines)
- `src/rendering/wasm-bridge.ts` (WASM integration)
- `src/rendering/weather.ts` (weather system)
- `src/game/save.ts` (save/load serialization)

## Known Coverage Gaps (Recently Closed)

These were gaps but are now covered or partially covered:

- ✅ `src/engine/llm/` sub-modules — exercised by all tests via the test-mode gate
- ✅ `src/engine/iso2/` solver — covered by `tests/world-gen/playability-validation.spec.ts` (6 tests)
- ✅ `src/engine/world/*` modules — covered by `tests/world-gen/` (12 tests)
- ✅ `src/game/illness.ts`, `src/game/expression.ts`, `src/game/input-extra-keys.ts` — covered by gameplay tests

## Writing Tests

1. Always use `page.goto()` with `?test=1` to avoid LLM dependency.
2. Wait for game initialization: `page.waitForFunction(() => (window as any).__gameDebug)`.
3. Use `__gameDebug` API for state inspection — 80+ exposed functions.
4. Take screenshots for visual regression with `page.screenshot()`.
5. **Prefer category-targeted runs during development:** `npx playwright test tests/<category>/`.
   Run the full suite before opening a PR.

## Test Seams (Added in B8)

When testing LLM-adjacent code, use the underscore-prefixed test seams:
- `import { _setTestModeForTests } from 'src/engine/llm/test-mode'`
- `import { _resetTpsForTests } from 'src/engine/llm/tps'`
- `import { _clearWordlistCacheForTests } from 'src/engine/llm/wordlist-cache'`

## Pre-Commit Checks

```bash
# Targeted tests during development
npx playwright test tests/<category>/ --reporter=line

# Full suite before PR
npx playwright test --reporter=line

# Typecheck
npx tsc --noEmit
```

## Cross-References

- `.github/instructions/llm-integration.instructions.md` — test-mode mechanics
- `.github/instructions/architecture.instructions.md` — god-file prevention (test large files)
- `src/main.ts` test seam: `window.__gameDebug` API