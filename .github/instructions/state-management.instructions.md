---
description: "Use when working with game state, save/load, or module-level mutable variables. Covers state architecture, factory patterns, and serialization rules."
---
# State Management Guidelines

## Current Architecture (Mixed Paradigm)
The game uses three state patterns — this inconsistency is a known tech debt item:

| Pattern | Used By | Assessment |
|---|---|---|
| Central `GameState` object | player, camera, inventory, quiz, trade, status, injury | ✅ Preferred |
| Factory-pattern state objects | `createMusicState()`, `createSfxState()`, `createVoiceState()` | ✅ Good |
| Module-level `let` globals | weather, lighting, fog, terrain cache, debuff visuals | ⚠️ Hidden state |

## Rules for New Features
1. **Add state to `GameState`** — don't create module-level globals.
2. **Use factory functions** for complex subsystem state: `createFooState(): FooState`.
3. **Pass state explicitly** through function parameters — avoid importing mutable module globals.
4. **134 module-level `let` declarations exist** — do not add more. Migrate existing ones when touching those modules.

## Save/Load
`buildSaveData()` and `applySaveData()` in main.ts manually serialize 20+ fields. This is brittle.

### Rules
1. Each subsystem should define its own `serialize()` / `deserialize()` methods.
2. Save format should be versioned — add a `version` field and migration logic.
3. **Always test save/load** after adding new state fields.

## GameState Size
The `GameState` interface has 50+ fields. Consider grouping into sub-objects:
```ts
interface GameState {
  player: PlayerState;
  camera: CameraState;
  audio: AudioState;    // music + sfx + voice
  education: EducationState; // quiz + knowledge + streak
  world: WorldState;    // chunks, resolved cells
  ui: UIState;          // menus, overlays, notifications
}
```
