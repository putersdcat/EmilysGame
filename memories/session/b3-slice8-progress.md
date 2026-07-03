# B3 Slice 8 Progress + Next-Step Guidance

**Status (this session + prior):** B3 Slice 7 (ObstacleSolver) + Micro-slices 8.1 (pure helpers) + 8.2 (corner governance) + 8.3 (AC-3 arc construction + propagation) + 8.4 (MRV collapse + slot priority) + 8.5 (top-level solver orchestration) + **8.6 (constants + barrel)** all **committed and pushed**.

**Commits in this branch's history (B3 series):**
- `2cbd028` slice 6 — Passability
- `e593c30` slice 7 + 8.1 — ObstacleSolver + pure solver helpers
- `cec6476` slice 8.2 — Corner governance
- `21d855e` slice 8.3 — AC-3 arc construction + propagation
- `2bf0f3b` tool fixes + slice 8.4 — refactoring toolkit bugfixes (refs #267) + MRV collapse + slot priority extraction
- `59cf5db` slice 8.5 — top-level solver orchestration (solveWorldUnitGrid, stampWorldUnitGrid, extractGridBorderEdges, enforceChainIntegrity, buildBiomeCandidatePool, findFallbackTemplate, applyBorderConstraints + types WeightedCandidate, SlotState)
- `aa81ff8` **slice 8.6** — WorldGrid.ts (single source of truth for WU_SIZE/GRID_DIM) + world/index.ts barrel. B3 series complete.

**Validation at handoff (after 8.6):**
- `npx tsc --noEmit`: clean (full project).
- Determinism golden `78172eec` locked (multiple runs, no regression).
- Targeted: gen-determinism + lock-key-dag + edge-contracts = **12/12** (15/15 keys reachable, 0 violations).
- gen.ts: **2,558 → 519 lines** (~80% reduction from pre-B3 baseline).
- world/ layer: 1 monolith → 10 focused modules + 1 barrel.

---

## B3 Series Summary (8.1-8.6)

The B3 series decomposed `gen.ts` from a 2,558-line monolith into a layered architecture:

- **10 focused modules** in `src/engine/world/`:
  - `BiomeSelector.ts` (slice 1) — biome coherence, climate, mood, transitions
  - `Validation.ts` (slice 3) — chunk playability checks
  - `CollectibleScatterer.ts` (slice 4) — coins, trails
  - `Populator.ts` (slice 5) — anchors, decoration clusters
  - `GridUtils.ts` (slice 5) — `countWalkableNeighbors` helper
  - `Passability.ts` (slice 6) — passability enforcement, water integrity
  - `ObstacleSolver.ts` (slice 7) — quiz gates, bonfires, fence gates, door promotion, obstacles
  - `Entropy.ts` (slice 0) — entropy pool, wordlist, direction pair, raw append
  - `WorldUnitSolver.ts` (slice 8: 8.1-8.5) — AC-3 solver + propagation + MRV + chain integrity + border extraction
  - `WorldGrid.ts` (slice 8.6) — `WU_SIZE` + `GRID_DIM` single source of truth
- **1 barrel** at `src/engine/world/index.ts` re-exporting the public surface
- **`gen.ts`** reduced to the Phases 1/4/5/6 orchestrator (build base terrain, call solver, stamp, enforce passability, populate, place obstacles/collectibles/bonfires, apply entropy flags)
- **`gen.ts` retains re-exports** of every moved function/type for backward compat (consumers that still `import { ... } from '../engine/gen'` keep working)

**Functions REMAINING in gen.ts (no longer solver-related; these are pipeline phases 1/4/5/6 by design):**
- `generateChunk` (37 lines) — async chunk generation
- `generateChunkSync` (42 lines) — sync chunk generation
- `buildPerlinBase` (32 lines) — Phase 1 base terrain
- `applyEntropyCellFlags` (55 lines) — Phase 5.5 LLM entropy
- `getChunkDebugInfo` + `_lastWaterDebug` accessors (gen.ts is the orchestrator's facade)

**Types REMAINING in gen.ts (used by external consumers; will move in B4):**
- `CellData`, `ChunkBorderEdges`, `BorderConstraints`, `ChunkData`, `GridChunkResult`

---

## Follow-up (B4 / future series)

Per `RefactoringPlan_11-06-26.md`, the B4 series addresses **types centralization**:
- Move `CellData`, `ChunkBorderEdges`, `BorderConstraints`, `ChunkData`, `GridChunkResult` from `gen.ts` to `src/types/`
- The world/ modules already use structural subsets (`BiomeLike`, `MoodLike`, `BorderLike`, `CellLike`, `EdgeProbe`) so the type move won't break them
- Re-export the types from `gen.ts` for backward compat (same pattern as the function moves)

The B3 series is **structurally complete** — all extraction targets from the original scoping have been moved.

---

## Pre-Any-Follow-up Invariant Gates (re-run before any edit)

1. `npx tsc --noEmit` → must be clean.
2. `npx playwright test tests/world-gen/gen-determinism.spec.ts --reporter=line` → must pass with golden `78172eec`.
3. (Recommended) `npx playwright test tests/world-gen/lock-key-dag.spec.ts tests/world-gen/edge-contracts.spec.ts --reporter=line` → confirms solver surface still healthy.

---

## Tool Observations (from RefactorMan mode, 2026-06-12 session)

Three limitations of the refactoring toolkit (`tools/refactor/`) encountered during the B3 series — all reported in issue #267 per mode instructions:

1. `find-large-functions.py` (pre-tool-fix): reported 0 items in `gen.ts` even at `--min-lines 30` because the line-count logic stopped at the next top-level declaration. Fixed in `2bf0f3b` (brace counting + single-file path support + name group lookup).

2. `extract-function.py` (pre-tool-fix): regex compile error from double-escaped `\\b` / `\\(` in raw strings. Fixed in `2bf0f3b` (switched to `f'...'` prefix).

3. `extract-function.py` (unfixed as of 8.5): functions whose opening `{` is on a new line (the B3 style in gen.ts: `function name(\n  ...args...\n) {\n`) are not extracted properly — the tool only extracts the signature and breaks the source file. **Workaround**: for B3-style multi-line signatures, use the manual pattern (read function, append to module with structural types, remove from source, fix call sites). For simple single-line signatures the tool works fine. New issue comment posted to #267.

For the B3 work, the established manual pattern (precise targeted `replace_string_in_file` calls + type gate + determinism lock) is the lower-friction path. The toolkit is fully usable for simpler single-function extractions and was used end-to-end for 8.4 (collapseAllMRV extraction + cleanup).

---

**Do not start 8.6 without re-reading `b3-slice8-scoping.md` (the original solver plan).**
