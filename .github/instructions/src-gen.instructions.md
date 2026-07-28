---
description: "Use when editing gen.ts (now a barrel re-export) or any src/engine/world/* module. Covers the B3-series decomposition and type-sharing rules."
applyTo: "{src/engine/gen.ts,src/engine/world/**}"
---

# gen.ts — World Generation Barrel

## Status: Decomposed (B3 + B4 series complete, EPIC #247)
`gen.ts` is now a **71-line barrel re-export** of the 13 focused modules in
`src/engine/world/`. This file should not grow back.

See `.github/instructions/architecture.instructions.md` for the god-file
prevention rules and hard ceiling (currently **150 lines**, never exceed).

## Module Map

```
src/engine/gen.ts          ← 71-line barrel re-export (backward compat)
src/engine/world/
  ├── BiomeSelector.ts     ← mood profiles, biome selection
  ├── ChunkGenerator.ts    ← top-level chunk generation orchestration
  ├── CollectibleScatterer.ts ← coins/keys/potions placement
  ├── Entropy.ts           ← entropy flags, feed simulation
  ├── EntropyCellFlags.ts  ← per-cell entropy helpers
  ├── GridUtils.ts         ← coordinate helpers (chunk ↔ world units)
  ├── ObstacleSolver.ts    ← DAG-based obstacle/lock-key solver
  ├── Passability.ts       ← playability validation + dead-end detection
  ├── Populator.ts         ← post-bake population (NPCs, items, structures)
  ├── TemplateStamper.ts   ← template-driven terrain stamping
  ├── TerrainBuilder.ts    ← Perlin noise + terrain materialization
  ├── Validation.ts        ← chunk validation (DAG, water, etc.)
  ├── WorldGrid.ts         ← sparse chunk grid storage
  ├── WorldUnitSolver.ts   ← world-unit (5×5) solver metadata
  └── index.ts             ← barrel re-export for the world/ directory
```

## Adding New Generation Logic

**Do not add new logic to `gen.ts`.** Add it to `src/engine/world/<YourSystem>.ts`
and re-export from both `world/index.ts` (preferred for new consumers) and
`gen.ts` (for backward compat with existing consumers).

## Type-Sharing Rule

**Do not define shared types in `gen.ts` or any `world/*` module.** The
following types live in `src/types/game.types.ts` and are imported:

- `ChunkData`, `CellData`, `MoodProfile`, `BorderConstraints`,
  `ChunkBorderEdges`, `GridChunkResult`

See `.github/instructions/types.instructions.md` for the full centralization
policy.

## Rules

1. **Pure functions preferred** — world gen is deterministic given a seed.
   No module-level mutable state in `world/*` modules.
2. **New generation features go in dedicated `world/*` modules**, not inline
   in existing ones. If a feature touches 3+ existing modules, that's a
   signal it deserves its own file.
3. **State flows through function parameters**, not module globals.
4. **`gen.ts` is a barrel — edits should be re-exports only.** If you find
   yourself adding new logic to it, that's a refactoring task.
5. **Coordinate contract:** `world-units` (5×5 per chunk) ↔ `cells` (25×25
   per chunk) ↔ `screen pixels`. See `WorldUnitSolver.ts` for the canonical
   conversions.

## Pre-Commit Checks

```bash
# Typecheck
npx tsc --noEmit

# Targeted: world-gen tests (determinism, edge contracts, playability)
npx playwright test tests/world-gen/ --reporter=line

# Module size scan — catch any new god-file growth
python tools/refactor/find-large-functions.py src/engine/world/ --min-lines 70
```

## Cross-References

- `ARCHITECTURE.md` — world generation pipeline
- `Docs/WorldEngine-*.md` — full design docs
- `.github/instructions/architecture.instructions.md` — god-file prevention
- `.github/instructions/types.instructions.md` — type centralization