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

## Running Tests
```sh
npx playwright test --reporter=line          # all tests
npx playwright test tests/core/             # by category
npm run test:core                            # via npm script sharding
```

## Test Categories (sharded in package.json)
| Category | Directory | Tests |
|---|---|---|
| core | `tests/core/` | game loop, NPC, resolved cells, status, trading |
| audio | `tests/audio/` | cassette, MIDI, music, NPC voice, positional, SFX |
| education | `tests/education/` | age profile, book, math, quiz, taxonomy |
| gameplay | `tests/gameplay/` | barter, cats, debuffs, injury, structures, wildlife |
| rendering | `tests/rendering/` | shadows, emoji, fire, menu, night, terrain, SVG |
| sprites | `tests/sprites/` | accessories, cosmetics, customizer, hair, eyes, NPC |
| ui | `tests/ui/` | alpha QoL, fog, HUD, screenshot, thought bubbles, touch |
| world-gen | `tests/world-gen/` | edges, lock-key, metadata, mood, playability |
| perf | `tests/perf/` | frame time |

## Known Coverage Gaps
These modules have NO direct test coverage — prioritize when adding tests:
- `wasm-bridge.ts` (WASM integration)
- `minimap.ts` (minimap rendering)
- `local-lights.ts` (local light sources)
- `weather.ts` (weather system)
- `save.ts` (save/load serialization)

## Writing Tests
1. Always use `page.goto()` with `?test=1` to avoid LLM dependency.
2. Wait for game initialization: `page.waitForFunction(() => (window as any).__gameDebug)`.
3. Use `__gameDebug` API for state inspection — 80+ exposed functions.
4. Take screenshots for visual regression with `page.screenshot()`.
