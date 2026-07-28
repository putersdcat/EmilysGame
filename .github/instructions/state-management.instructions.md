---
description: "Use when working with game state, save/load, or module-level mutable variables. Covers state architecture, factory patterns, and serialization rules."
applyTo: "{src/game/game-state.ts,src/game/save.ts,src/**/*.ts}"
---

# State Management Guidelines

## Current Architecture (Mixed Paradigm — Tech Debt)

The game uses three state patterns. The inconsistency is a known refactoring
target:

| Pattern | Used By | Assessment |
|---|---|---|
| Central `GameState` object | player, camera, inventory, quiz, trade, status, injury, illness, expression | ✅ Preferred |
| Factory-pattern state objects | `createMusicState()`, `createSfxState()`, `createVoiceState()`, `createInitialDiarrheaState()` | ✅ Good |
| Module-level `let` globals | weather, lighting, fog, terrain cache, debuff visuals, animation phases | ⚠️ Hidden state |

**Current count: ~137 module-level `let`/`var` declarations across `src/`.**
The B5 + B6 + B7 + B8 + B9 series reduced this number, but the pattern persists.
Do not add new module-level globals.

## Rules for New Features

1. **Add state to `GameState`** — don't create module-level globals.
2. **Use factory functions** for complex subsystem state: `createFooState(): FooState`.
3. **Pass state explicitly** through function parameters — avoid importing mutable module globals.
4. **Use the `_` prefix** for intentional module-level state (caches, animation phases)
   AND document it in `ARCHITECTURE.md` §7. Examples:
   - `_nanoStackCache` in nano-tile
   - `_terrainCache` in terrain-cache
   - `_dialogNpcId`, `_mouthCycleIdx` in mouth-animation
   - `_shadowAngle`, `_shadowStretch` in shadow-cache
   - `_headBobPhase` in mouth-animation
5. **State-as-accessor pattern**: When subsystem state must live module-level
   (e.g., LLM connection), expose it via accessor functions rather than direct
   `import` of the variable. See `src/game/debug-api.ts` for the pattern.

## GameState (`src/game/game-state.ts`)

The `GameState` interface lives in `src/game/game-state.ts` (B5.4 extraction).
It is composed of subsystem state objects:

```ts
interface GameState {
  player: PlayerState;
  camera: CameraState;
  inventory: Inventory;
  quiz: QuizState;
  trade: TradeState;
  status: PlayerStatus;
  injury: InjuryState;
  illness: { ... };   // DiarrheaState
  expression: { ... }; // transient expression override
  audio: AudioState;    // composed music + sfx + voice
  ui: UIState;
  // ...
}
```

**Rules:**
1. New top-level state fields go through the `createGameState()` factory.
2. Subsystem-specific state lives in its own module — compose into GameState.
3. **Do not reach for module-level globals** when the state belongs in GameState.

## Save/Load (`src/game/save.ts`)

`buildSaveData()` and `applySaveData()` (currently in main.ts — see src-main.instructions.md
"Remaining Extraction Targets" for the planned extraction to `src/game/save-manager.ts`)
manually serialize 20+ fields. This is brittle.

### Rules
1. Each subsystem should define its own `serialize()` / `deserialize()` methods.
2. Save format should be versioned — add a `version` field and migration logic.
3. **Always test save/load** after adding new state fields.

## State Architecture Plan (Future Work)

The `GameState` interface could be further grouped:

```ts
interface GameState {
  player: PlayerState;
  camera: CameraState;
  audio: AudioState;    // music + sfx + voice (already grouped)
  education: EducationState; // quiz + knowledge + streak
  world: WorldState;    // chunks, resolved cells
  ui: UIState;          // menus, overlays, notifications
}
```

This is a future refactor — track in a follow-up issue when GameState hits ~60 fields.

## Layer Boundary Rules

- **`engine/*` modules** must NOT touch the DOM or have hidden mutable state
  beyond cache invalidation. Pure functions + factories.
- **`rendering/*` modules** can have module-level caches (sprite caches, lightmaps)
  but must be deterministic given identical input + state.
- **`game/*` modules** own subsystem state. Factory-pattern preferred.
- **`ui/*` modules** can read GameState but should never mutate it (mutations
  happen through game logic in `game/*` or main.ts).

## Pre-Commit Checks

```bash
# Typecheck
npx tsc --noEmit

# Module size scan — catch any new god-file growth
python tools/refactor/find-large-functions.py src/game/ --min-lines 70

# Manual: count module-level let/var declarations
grep -r "^(let|var) " src/ --include="*.ts" | wc -l
# Target: trend downward over time, never increase
```

## Cross-References

- `.github/instructions/architecture.instructions.md` — layer boundaries + god-file prevention
- `.github/instructions/src-main.instructions.md` — main.ts state threading
- `.github/instructions/types.instructions.md` — when to centralize a type
- `ARCHITECTURE.md` §7 — intentional module-level globals inventory