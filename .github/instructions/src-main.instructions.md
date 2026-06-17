---
description: "Use when editing main.ts — the game-loop orchestrator. Covers god-file prevention, B5-series extraction history, and the rules for new subsystems."
applyTo: "src/main.ts"
---

# main.ts — Game-Loop Orchestrator

## Status: Partially Decomposed (B5 series complete)
`main.ts` is **~2,807 lines** (down from ~3,317). The B5 series (#268) extracted
6 focused modules. Further extraction is the next priority — see "Remaining
Extraction Targets" below.

See `.github/instructions/architecture.instructions.md` for the **hard ceiling
of 2,800 lines**. New commits that push main.ts over this limit must include
extractions, not just additions.

## B5 Extraction History (issue #268)

| Responsibility | Target Module | Status | Lines | Commit |
|---|---|---|---|---|
| Extra key queue (quiz accessibility) | `src/game/input-extra-keys.ts` | ✅ Extracted | 38 | 7a94108 |
| Diarrhea illness subsystem | `src/game/illness.ts` | ✅ Extracted | 89 | bdba658 |
| Transient expression override | `src/game/expression.ts` | ✅ Extracted | 56 | dbd8b9d |
| `GameState` interface + factory | `src/game/game-state.ts` | ✅ Extracted | 226 | 8bcb7ee |
| `__gameDebug` surface | `src/game/debug-api.ts` | ✅ Extracted | 406 | 71d32a7 |
| HUD DOM event wiring | `src/game/dom-wiring.ts` | ✅ Extracted | 166 | 838f180 |

## `src/game/` Sub-Directory Inventory

```
src/game/
  ├── age-profile.ts          ← 85   lines — age tier profiles (kids, teens, adults)
  ├── debug-api.ts            ← 406  lines — __gameDebug surface (under review, see below)
  ├── dom-wiring.ts           ← 166  lines — wireHudEvents() + DOM event registration
  ├── expression.ts           ← 56   lines — transient expression override
  ├── game-state.ts           ← 226  lines — GameState interface + createGameState()
  ├── illness.ts              ← 89   lines — diarrhea illness subsystem
  ├── injury.ts               ← 150  lines — wound/injury state
  ├── input-extra-keys.ts     ← 38   lines — quiz accessibility key queue
  ├── input.ts                ← 522  lines — keyboard/mouse input (largest)
  ├── inventory.ts            ← 87   lines — item stack management
  ├── knowledge.ts            ← 479  lines — Book of Knowledge content
  ├── math-solver.ts          ← 328  lines — quiz math validation
  ├── platform.ts             ← 79   lines — platform detection helpers
  ├── quiz.ts                 ← 327  lines — quiz flow + state machine
  ├── save.ts                 ← 136  lines — localStorage save/load
  ├── status.ts               ← 192  lines — PlayerStatus (energy/hydration/cleanliness)
  ├── trading.ts              ← 470  lines — barter system
  ├── tutorial.ts             ← 267  lines — first-run tutorial
  ├── wildlife.ts             ← 579  lines — wildlife AI (largest)
  └── audio/
      ├── music.ts            ← cassette player music
      ├── sfx.ts              ← sound effects
      ├── sampled-sfx.ts      ← sample-based SFX
      ├── midi-loader.ts      ← MIDI file parsing
      └── npc-voice.ts        ← NPC TTS
```

## ⚠️ God-File Watch List

These `src/game/*` files exceed the soft 250-line target. Plan extraction
in the next B5.x or B10 micro-slice:

| File | Lines | Verdict | Suggested extraction |
|---|---|---|---|
| `wildlife.ts` | 579 | 🔴 God-file | Split into `wildlife-ai.ts`, `wildlife-spawn.ts`, `wildlife-render.ts` |
| `input.ts` | 522 | 🔴 God-file | Split into `input-keyboard.ts`, `input-mouse.ts`, `input-gestures.ts` |
| `knowledge.ts` | 479 | 🟠 Should split | Split into `knowledge-content.ts`, `knowledge-search.ts`, `knowledge-ui.ts` |
| `trading.ts` | 470 | 🟠 Should split | Split into `trading-economy.ts`, `trading-offers.ts`, `trading-ui.ts` |
| `debug-api.ts` | 406 | 🟠 Should split | Split into `debug-game-state.ts`, `debug-world.ts`, `debug-rendering.ts` |

## Remaining Extraction Targets (future B5.x / B10 micro-slices)

| Responsibility | Target Module | Approx Size |
|---|---|---|
| Wound-care / hygiene / insect quizzes | `src/game/quiz-specials.ts` | ~150 lines |
| Main menu / pause / options / welcome | `src/game/menu-flow.ts` | ~400 lines |
| handleInteraction dispatch | `src/game/interaction-handler.ts` | ~200 lines |
| buildSaveData / applySaveData | `src/game/save-manager.ts` | ~150 lines |
| checkBubbleTriggers | `src/game/bubble-triggers.ts` | ~150 lines |
| renderFrame orchestration | `src/rendering/render-frame.ts` | ~200 lines |
| update() loop (596 lines) | `src/game/game-loop.ts` | Largest remaining function |

## Remaining in main.ts (by design — orchestrator)

- `async function init()` (~220 lines) — bootstrap: LLM gate, canvas setup, asset preloading, state init, save restore
- `function update()` (~596 lines) — per-frame game loop: input, movement, collision, interaction, rendering trigger
- `function handleInteraction()` (~195 lines) — interaction dispatch
- `function renderFrame()` (~200 lines) — render orchestration
- `function showMainMenu()`, `showOptionsOverlay()`, `showPauseMenu()`, `showAgeSelection()`, `showWelcomeSplash()` — menu/UI flows
- `function resetGameState()` — game state reset
- Module-level state: `_lastDialogNpcId`, `_revealedCreatures`, `_pendingPoopBurst`, helper functions
- `__gameState` / `__wildlife` / `__lighting` / `__bubbles` / `__trade` debug exposures

## Rules for Editing This File

1. **Do not add new systems here.** Create a new module and import it.
2. **Thread `GameState` explicitly** — avoid reaching for module-level globals.
3. **No hardcoded quiz questions** — move to `src/config/quiz.config.ts`.
4. **Avoid `(x as any)`** — the `_fireCache` monkey-patch pattern should use typed WeakMap or extend ChunkData.
5. Keep the update/render loop thin: call into subsystem modules, don't inline logic.
6. **Use the extracted modules** — when adding features, import from the existing
   `src/game/*` modules (input-extra-keys, illness, expression, game-state, debug-api,
   dom-wiring) rather than duplicating logic in main.ts.
7. **Pass state explicitly** — subsystems receive `GameState` as a parameter, not
   through module-level globals. The `DebugApiDeps` and `WireHudDeps` interfaces
   show the pattern for dependency injection.
8. **Watch the ceiling.** If your change pushes main.ts above 2,800 lines, your PR
   must include a corresponding extraction commit (or be split across two PRs).

## Architecture Notes

- `GameState` is the central state object — defined in `src/game/game-state.ts`
- All subsystem states (status, injury, trade, music, sfx, voice, illness) are
  composed into GameState via dedicated interfaces
- The debug API surface (`window.__gameDebug`) is built by `createGameDebug(deps)`
  in `src/game/debug-api.ts` — module-level variables are passed as accessors
- HUD events are registered by `wireHudEvents(deps)` in `src/game/dom-wiring.ts`
- The game loop (update/render) still lives in main.ts and is the next big extraction target

## Cross-References

- `.github/instructions/architecture.instructions.md` — god-file prevention + module size discipline
- `.github/instructions/state-management.instructions.md` — GameState patterns
- `.github/instructions/llm-integration.instructions.md` — LLM gate at startup
- `Docs/RefactoringPlan_11-06-26.md` — EPIC #273 B-series plan