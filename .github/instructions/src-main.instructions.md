---
description: "Use when editing main.ts — the game loop orchestration file. Covers god-file mitigation, extraction patterns, and state-threading rules."
applyTo: "src/main.ts"
---
# main.ts — Game Loop Orchestration

## Status: Partially Decomposed (B5 series complete)
`main.ts` is **~2,800 lines** (down from ~3,317). The B5 series (#268) extracted
6 focused modules. Further extraction is straightforward — follow the B3–B6 pattern.

## Extraction Status (B5 series, #268)

| Responsibility | Target Module | Status | Commit |
|---|---|---|---|
| Extra key queue (quiz accessibility) | `src/game/input-extra-keys.ts` | ✅ Extracted (38 lines) | 7a94108 |
| Diarrhea illness subsystem | `src/game/illness.ts` | ✅ Extracted (89 lines) | bdba658 |
| Transient expression override | `src/game/expression.ts` | ✅ Extracted (56 lines) | dbd8b9d |
| `GameState` interface + factory | `src/game/game-state.ts` | ✅ Extracted (226 lines) | 8bcb7ee |
| `__gameDebug` surface | `src/game/debug-api.ts` | ✅ Extracted (406 lines) | 71d32a7 |
| HUD DOM event wiring | `src/game/dom-wiring.ts` | ✅ Extracted (166 lines) | 838f180 |

## Remaining Extraction Targets (future work)

| Responsibility | Target Module | Status |
|---|---|---|
| Wound-care / hygiene / insect quizzes | `src/game/quiz-specials.ts` | 🔲 Inline in main.ts |
| Main menu / pause / options / welcome | `src/game/menu-flow.ts` | 🔲 ~400 lines inline |
| handleInteraction dispatch | `src/game/interaction-handler.ts` | 🔲 ~200 lines inline |
| buildSaveData / applySaveData | `src/game/save-manager.ts` | 🔲 ~150 lines inline |
| checkBubbleTriggers | `src/game/bubble-triggers.ts` | 🔲 ~150 lines inline |
| renderFrame orchestration | `src/render-frame.ts` | 🔲 ~200 lines inline |
| update() loop (596 lines) | `src/game/game-loop.ts` | 🔲 Largest remaining function |

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

## Architecture Notes

- `GameState` is the central state object — defined in `src/game/game-state.ts`
- All subsystem states (status, injury, trade, music, sfx, voice, illness) are
  composed into GameState via dedicated interfaces
- The debug API surface (`window.__gameDebug`) is built by `createGameDebug(deps)`
  in `src/game/debug-api.ts` — module-level variables are passed as accessors
- HUD events are registered by `wireHudEvents(deps)` in `src/game/dom-wiring.ts`
- The game loop (update/render) still lives in main.ts and is the next big extraction target
