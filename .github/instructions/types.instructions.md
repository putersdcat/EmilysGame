---
description: "Use when working with TypeScript types, interfaces, or type definitions. Covers type centralization strategy and duplicate prevention."
applyTo: "src/types/**"
---
# Type System Strategy

## Centralized Types
Shared types used by 3+ modules should live in `src/types/`:
- `content-pack.types.ts` — content pack schema (✅ exists)
- `game.types.ts` — core game types (🔲 needs creation)

## Types That Should Move to `src/types/game.types.ts`
| Type | Currently In | Imported By |
|---|---|---|
| `Camera` | `render.ts`, `local-lights.ts` (DUPLICATED) | 7+ modules |
| `ChunkData` | `gen.ts` | 8+ modules |
| `CellData` | `gen.ts` | 8+ modules |
| `MoodProfile` | `gen.ts` | 3+ modules |
| `BorderConstraints` | `gen.ts` | 3+ modules |
| `GameState` | `main.ts` | Would unlock extraction |

## Rules
1. **No duplicate type definitions** — if you find one, consolidate to `src/types/`.
2. **Config-specific types stay co-located** with their config files (e.g., `BiomeDef` in `biomes.config.ts`).
3. **Use `type` for unions/aliases, `interface` for object shapes** (allows declaration merging).
4. **Export types with `export type`** when only used as type imports (enables proper tree-shaking).
