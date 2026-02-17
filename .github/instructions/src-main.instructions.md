---
description: "Use when editing main.ts — the game loop orchestration file. Covers god-file mitigation, extraction patterns, and state-threading rules."
applyTo: "src/main.ts"
---
# main.ts — Game Loop Orchestration

## ⚠️ God-File Warning
`main.ts` is ~3,150 lines with 18+ responsibilities. **Every new feature should NOT add code here.**

## Extraction Targets (prefer extracting to these modules)
| Responsibility | Target Module | Status |
|---|---|---|
| `GameState` interface + factory | `src/game-state.ts` | 🔲 Not yet extracted |
| Wound-care / hygiene / insect quizzes | `src/quiz-specials.ts` | 🔲 Inline in main.ts |
| Diarrhea illness subsystem | `src/illness.ts` | 🔲 ~100 lines inline |
| Main menu / pause / options / welcome | `src/menu.ts` | 🔲 ~400 lines inline |
| handleInteraction dispatch | `src/interaction-handler.ts` | 🔲 ~200 lines inline |
| buildSaveData / applySaveData | `src/save-manager.ts` | 🔲 ~150 lines inline |
| checkBubbleTriggers | `src/bubble-triggers.ts` | 🔲 ~150 lines inline |
| renderFrame orchestration | `src/render-frame.ts` | 🔲 ~200 lines inline |
| `__gameDebug` surface | `src/debug-api.ts` | 🔲 ~200 lines inline |
| DOM event listeners (main()) | `src/dom-wiring.ts` | 🔲 ~200 lines inline |

## Rules for Editing This File
1. **Do not add new systems here.** Create a new module and import it.
2. **Thread `GameState` explicitly** — avoid reaching for module-level globals.
3. **No hardcoded quiz questions** — move to `src/config/quiz.config.ts`.
4. **Avoid `(x as any)`** — the `_fireCache` monkey-patch pattern should use typed WeakMap or extend ChunkData.
5. Keep the update/render loop thin: call into subsystem modules, don't inline logic.
