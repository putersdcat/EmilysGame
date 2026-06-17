---
description: "Use when working with TypeScript types, interfaces, or type definitions. Covers type centralization strategy and duplicate prevention."
applyTo: "src/types/**"
---

# Type System Strategy

## Status: Centralized (B4 series complete, issue #253)

`src/types/game.types.ts` exists and holds the core shared types. **Do not
re-declare these types elsewhere** — always import from `src/types/game.types.ts`.

## `src/types/` Directory

```
src/types/
  ├── game.types.ts          ← core game data types (B4 series)
  ├── content-pack.types.ts  ← content pack schema
  └── iso-renderer.types.ts  ← Iso 2.0 renderer types (FeatureVariant, NanoTile, etc.)
```

## Types in `src/types/game.types.ts` (current inventory)

| Type | Source / Origin | Imported by |
|---|---|---|
| `Camera` | B6.1 (#269) — consolidated from `render.ts` + `local-lights.ts` | 7+ modules |
| `ChunkData` | B4 (#253) — moved from `gen.ts` | 8+ modules |
| `CellData` | B4 (#253) — moved from `gen.ts` | 8+ modules |
| `MoodProfile` | B4 (#253) — moved from `gen.ts` | 3+ modules |
| `BorderConstraints` | B4 (#253) — moved from `gen.ts` | 3+ modules |
| `ChunkBorderEdges` | B4 (#253) — moved from `gen.ts` | 3+ modules |
| `GridChunkResult` | B4 (#253) — moved from `gen.ts` | 3+ modules |

## Types NOT in `src/types/game.types.ts` (correctly co-located)

| Type | Lives In | Why |
|---|---|---|
| `GameState` | `src/game/game-state.ts` | B5 extraction — composed of subsystem state, used only by main.ts |
| `DialogState`, `UIState`, `ToastMessage` | `src/ui/ui.ts` | UI-specific, used only by UI layer |
| `IsoFeatureVariant`, `IsoNanoTile`, `IsoFeatureConnections` | `src/types/iso-renderer.types.ts` | Iso 2.0 specific, separate concern |
| `BiomeDef`, `RENDER_CONFIG` interface | `src/config/biomes.config.ts` | Config-co-located type |
| `MusicState`, `SfxState`, `VoiceState` | `src/game/audio/*.ts` | Audio-specific factory state |
| `QuizState` | `src/game/quiz.ts` | Quiz-flow specific |
| `PlayerStatus` | `src/game/status.ts` | Status subsystem specific |
| `InjuryState` | `src/game/injury.ts` | Injury subsystem specific |

## Centralization Rule

**A type should live in `src/types/game.types.ts` only if it is shared across
2+ architectural layers** (engine + rendering + game, etc.) OR imported by
3+ modules within the same layer.

A type that is used by exactly one subsystem (e.g., `QuizState` only used by
quiz + main + ui) stays co-located with that subsystem.

## Rules

1. **No duplicate type definitions** — if you find one, consolidate to `src/types/`.
2. **Config-specific types stay co-located** with their config files
   (e.g., `BiomeDef` in `biomes.config.ts`).
3. **Use `type` for unions/aliases, `interface` for object shapes** (allows
   declaration merging).
4. **Export types with `export type`** when only used as type imports (enables
   proper tree-shaking).
5. **When adding a new shared type:** create the type in `game.types.ts` and
   import from there. Do not add new fields to `game.types.ts` types unless
   truly shared — subsystem-specific fields go in the subsystem's own types.

## Detection: When to Centralize

Ask these questions before adding a type to `src/types/game.types.ts`:

1. Is the type imported by modules in 2+ different layers?
2. Is the type imported by 3+ modules in the same layer?
3. Is the type's definition currently duplicated anywhere?

If any answer is yes, centralize. If no, leave co-located.

## Pre-Commit Checks

```bash
# Typecheck
npx tsc --noEmit

# Find duplicate type declarations across the codebase (manual grep)
# Pick a type that's defined in src/types/game.types.ts and grep for it elsewhere
```

## Cross-References

- `.github/instructions/architecture.instructions.md` — layer boundaries
- `.github/instructions/src-gen.instructions.md` — gen.ts type-sharing rules
- `.github/instructions/rendering.instructions.md` — Camera type rules