# B3 Slice 8 Scoping — AC-3 World Unit Grid Solver / TemplateStamper (Highest Risk)

**Status (this session):** Slice 7 (ObstacleSolver) COMPLETE + **committed** in `e593c30`. Micro-slice 8.1 (WorldUnitSolver pure helpers) also COMPLETE + **committed** in the same commit. See `b3-slice8-progress.md` for the next-step sequence (8.2 → 8.6).

**Validation at handoff:**  
- Determinism golden 78172eec locked (multiple runs).  
- Targeted: gen-determinism + lock-key-dag + edge-contracts = 12/12 clean.  
- Full world-gen suite: 85/85 (no flake hit this run; water-bridge #266 intermittent).  
- `npx tsc --noEmit`: clean.  
- gen.ts: **~1,535 lines** post-slice-8.1 (down from ~2,558 pre-B3, ~40% reduction).

---

## Current Location & Size (post-slice 7)

- `src/engine/gen.ts` is now ~1,595 lines (down from ~2,558 pre-B3).  
- The remaining "god" core is **Phase 2: AC-3 World Unit Grid Solver** (comment header at L501).  
- Approximate span of the solver + stamper block: L501 → ~L1130 (stampWorldUnitGrid + supporting fns).  
- This is the **TemplateStamper / AC-3 solver** surface (explicitly called out as "biggest, highest risk" in prior planning).

Key functions / pieces still in gen.ts (solver surface):

**Public / pipeline entry (called from generateGridChunk):**
- `solveWorldUnitGrid(...)` → returns `{ grid: (RotatedTemplate | null)[][], borderEdges }`
- `stampWorldUnitGrid(cells, grid)` — Phase 3, writes the solved 5x5 templates into the CellData grid.

**Solver internals (all currently file-private):**
- `buildBiomeCandidatePool`
- `findFallbackTemplate`
- `applyBorderConstraints`
- `buildAllArcs`
- `propagateAC3`
- `getArcsAffectedBy`
- `slotPriority`
- `collapseAllMRV`
- `propagateAC3Partial`
- `weightedSelectTemplate`
- `extractGridBorderEdges`
- `enforceChainIntegrity`
- `findTerminator`

**Governance / helpers tightly coupled to AC-3:**
- `traversalCompatible`
- `getCornerSurface`
- `validateCornerGovernance`

**Types defined locally in gen.ts (solver-specific):**
- `interface WeightedCandidate`
- `interface SlotState`
- `interface Arc`
- `interface SolveResult`
- `interface GridChunkResult` (thin wrapper around cells + borderEdges)

**Constants local to gen.ts (duplicated elsewhere):**
- `const WU_SIZE = WORLD_CONFIG.worldUnitSize;`
- `const GRID_DIM = WORLD_CONFIG.chunkSize / WU_SIZE;`
  - Duplicated in `src/engine/world/Populator.ts` (L37-38).
  - Rendering side also uses WU_SIZE (terrain-cache.ts etc.).

**Downstream consumers of the grid type:**
- `populateAnchors(cells, grid, ...)` in Populator.ts — signature: `grid: (RotatedTemplate | null)[][]`
- `stampWorldUnitGrid` (in gen.ts today)
- `solveWorldUnitGrid` result feeds both.

**Core dependencies (must stay stable):**
- `src/config/tiles.config.ts`:
  - `RotatedTemplate` (the big one)
  - `getAllRotations()`
  - `edgesCompatible`
  - `EdgeTag`, `Cardinal`, `BIOME_TEMPLATE_WEIGHTS`, `MICRO_TILE_DEFS`
- `src/config/game.config.ts` → `WORLD_CONFIG` (for WU_SIZE / chunkSize)
- `src/config/biomes.config.ts` → `BiomeDef`
- `seededRandom` + `weightedPick` from `./utils`
- `getChunkClimate`, mood, biomeTransitions (already extracted to BiomeSelector)

**Invariants this code protects (non-negotiable):**
- #17 Edge contracts / inter-chunk stitching
- #42 Chain integrity + traversal continuity + corner governance (≤2 surfaces at corners)
- Determinism (#265) — every weighted pick, MRV order, propagation must be seeded
- Border constraints from neighboring chunks
- Fallback degradation on contradiction

---

## Extraction Strategy Considerations (for later slices)

**Risk profile:** Highest of the B3 series. The AC-3 solver + chain integrity + corner rules are the "heart" of the world unit grid. Small behavioral drift here breaks determinism, edge contracts, and playability.

**Coupling notes:**
- The solver functions are **highly cohesive** — MRV collapse, propagation, arc management, and governance checks cross-call each other.
- `stampWorldUnitGrid` is the "stamper" half; it is the bridge from abstract RotatedTemplate grid → concrete CellData. It is called immediately after solve in the pipeline.
- `populateAnchors` (already extracted) consumes the same grid shape. Any type move must not break that import (it currently does `import type { CellData } from '../gen'` and takes the grid by value).

**Possible slicing approaches (to be decided in a future bounded step):**
1. **Big-bang module** (TemplateStamper.ts or WorldUnitSolver.ts) — move the entire Phase 2 block + stamp in one go. Highest short-term risk, but keeps the algorithm together.
2. **Layered extraction** (safer, more steps):
   - First: move pure helpers (traversalCompatible, validateCornerGovernance, getCornerSurface, weightedSelectTemplate, findTerminator) + the small types.
   - Then: arc construction + propagation (buildAllArcs, propagateAC3, propagateAC3Partial, getArcsAffectedBy).
   - Then: priority + collapse (slotPriority, collapseAllMRV).
   - Then: border + candidate pool + top-level solveWorldUnitGrid + stamp.
   - Finally: constants + re-exports + barrel.
3. **Keep stamp with the solver** (they are sequential in generateGridChunk and share the grid shape).

**Shared constants / duplication:**
- WU_SIZE + GRID_DIM should have a single source of truth. Options:
  - Re-export from WORLD_CONFIG (or add `worldUnitGridDim` computed value).
  - Create a tiny `src/engine/world/WorldGrid.ts` (or constants) that both gen.ts (during transition) and Populator can import.
  - For B3 we can accept a temporary re-export from the new solver module.

**Types that may need promotion (B4 alignment):**
- `CellData`, `ChunkData`, `BorderConstraints`, `ChunkBorderEdges`, `MoodProfile` were already noted in src-gen.instructions.md as eventual `src/types/game.types.ts` targets.
- The solver types (SlotState, Arc, etc.) are probably **module-private** to the new solver and do not need to be public API.

**Re-export contract (must be preserved):**
- `generateChunk` / `generateChunkSync` remain the public entry points.
- `solveWorldUnitGrid` and `stampWorldUnitGrid` are **not** currently exported from gen.ts (they are internal). Callers go through generate* only.
- Existing re-exports for entropy/biome/validation/collectibles/populator/passability/obstacles must continue to work.

**Test surface that exercises this code:**
- `tests/world-gen/edge-contracts.spec.ts` (AC-3 + border constraints + chunk transitions)
- `tests/world-gen/gen-determinism.spec.ts` (golden hash depends on the entire seeded pipeline including solver choices)
- `tests/world-gen/lock-key-dag.spec.ts` (indirectly, via full generation)
- Population / structures / water-bridge specs also transitively depend on correct grid stamping.

---

## Precise Next-Step Guidance (for the *next* bounded session)

1. Re-confirm gates on entry: `npx tsc --noEmit` + determinism spec + (optionally) the three core targeted specs (determinism + lock-key + edge-contracts).
2. Decide extraction granularity for Slice 8 (big-bang vs. layered). Document the decision in this file or a follow-up note.
3. If doing a first minimal slice:
   - Prefer moving the smallest, least-coupled pure functions first (e.g., `traversalCompatible`, `validateCornerGovernance`, `weightedSelectTemplate`, `findTerminator` + their tiny helpers) into a new `src/engine/world/TemplateStamper.ts` (or `WorldUnitSolver.ts`).
   - Add the module, wire imports in gen.ts, keep behavior identical, run determinism + targeted tests immediately.
4. After any code move: full typecheck + determinism golden + the three targeted specs before considering the micro-slice "done".
5. Update #253 with a short comment (what was scoped, what the plan for the first micro-extraction is).
6. Only after the solver is fully extracted would we introduce `src/engine/world/index.ts` barrel (low risk, mostly re-exports).

**Do not claim any part of Slice 8 done until the determinism golden is re-verified after the change and the targeted edge-contract + lock-key tests pass.**

---

## Open Questions (to resolve before first edit)

- Module name: `TemplateStamper.ts` (emphasizes the stamp step) vs. `WorldUnitSolver.ts` (emphasizes AC-3) vs. `GridSolver.ts`?
- Should `stampWorldUnitGrid` live in the same file as the solver, or be a tiny sibling (e.g., `GridStamper.ts`)?
- Single source for WU_SIZE/GRID_DIM — do we touch WORLD_CONFIG now, or introduce a local world-grid constants module as part of this slice?
- Any new public exports from the solver module, or keep everything internal and only re-export through gen.ts during the transition?

---

**Handoff note:** This file is the scoping artifact. The next implementation step should be small, verifiable, and immediately followed by the determinism + solver-specific test gates. No standalone planning docs outside GitHub issues.
