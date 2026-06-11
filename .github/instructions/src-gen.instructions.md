---
description: "Use when editing gen.ts — the world generation monolith. Covers extraction strategy and type-sharing rules."
applyTo: "src/engine/gen.ts"
---
# gen.ts — World Generation

## ⚠️ Monolith Warning
`gen.ts` is ~2,480 lines containing: Perlin noise, biome assignment, border constraints, water/bridge systems, lock-key DAGs, mood profiles, playability validation, and chunk generation.

## Extraction Candidates
| Subsystem | Target Module |
|---|---|
| Perlin noise + math helpers | `src/noise.ts` |
| Border contracts / edge constraints | `src/edge-contracts.ts` |
| Lock-key DAG solver | `src/dag-solver.ts` |
| Water body / bridge generation | `src/water-gen.ts` |
| Mood profile application | `src/mood-solver.ts` |
| Playability validation | `src/playability.ts` |

## Type-Sharing Rule
**Do not define shared types here.** The following types are imported by 8+ files and should live in `src/types/game.types.ts`:
- `ChunkData`, `CellData`, `MoodProfile`, `BorderConstraints`

## Rules
1. Pure functions preferred — world gen should be deterministic given a seed.
2. New generation features go in dedicated modules, not inline.
3. Avoid module-level mutable `let` — pass state through function parameters.
