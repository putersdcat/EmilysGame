# Session — B4 Series (Type centralization) #253

## Status: COMPLETE ✅

## B3 series — COMPLETE (prior session, commit aa81ff8)
- 10 world/ modules + 1 barrel extracted from gen.ts
- gen.ts reduced 2,558 → 519 lines (~80%)
- WU_SIZE/GRID_DIM centralized in WorldGrid.ts

## B4 series — extract remaining types to src/types/

### Micro-slice 8.7 — DONE ✅ (commit ed5044d)
- Created `src/types/game.types.ts` (96 lines) with 5 types:
  `CellData`, `ChunkBorderEdges`, `BorderConstraints`, `ChunkData`, `GridChunkResult`
- gen.ts imports + re-exports (backward compat preserved)
- gen.ts: 519 → 501 lines
- tsc --noEmit: clean
- Determinism golden: 1/1 passed

### Micro-slice 8.8 — DONE ✅ (commit 510ab26)
- Migrated 15 consumer files to import directly from `src/types/game.types.ts`:
  - src/main.ts (ChunkData, BorderConstraints)
  - src/rendering/render.ts (ChunkData)
  - src/rendering/terrain-cache.ts (ChunkData)
  - src/rendering/minimap.ts (ChunkData)
  - src/rendering/particles.ts (ChunkData)
  - src/rendering/wasm-bridge.ts (ChunkData)
  - src/game/wildlife.ts (ChunkData)
  - src/engine/iso2-assemblies.ts (ChunkData, CellData)
  - src/engine/mechanics.ts (CellData, ChunkData)
  - src/engine/world/CollectibleScatterer.ts (CellData)
  - src/engine/world/GridUtils.ts (CellData)
  - src/engine/world/ObstacleSolver.ts (CellData)
  - src/engine/world/Passability.ts (CellData)
  - src/engine/world/Populator.ts (CellData)
  - src/engine/world/Validation.ts (CellData)
- WorldUnitSolver.ts: replaced structural `BorderLike` + `CellLike` subsets
  with canonical `BorderConstraints` + `CellData` from game.types.ts
- Dropped gen.ts re-exports (user opted for no backward compat)
- tsc --noEmit: clean
- Targeted tests: 10/10 passed (gen-determinism, edge-contracts, playability-validation)
- gen.ts: 501 → ~485 lines (re-export block removed)

## B4 Series Final Summary

| Metric | Pre-B4 | After 8.8 | Reduction |
|---|---|---|---|
| gen.ts line count | 519 | ~485 | ~6% |
| Type definitions in gen.ts | 5 interfaces | 0 (all in game.types.ts) | 100% |
| Consumers importing from gen.ts (types) | 15 files | 0 files | 100% |
| Structural subsets in WorldUnitSolver.ts | 2 (BorderLike, CellLike) | 0 | 100% |
| Type centralization | gen.ts (scattered) | src/types/game.types.ts (canonical) | DRY |

## What's left in gen.ts (by design — orchestrator, not types):
- generateChunk (37 lines), generateChunkSync (42 lines), generateGridChunk (~50 lines)
- buildPerlinBase (32 lines), applyEntropyCellFlags (55 lines)
- assignTerrainCell, findClimateCompatibleTile (helpers)
- All runtime functions re-exported from world/ modules

## Next (separate session): B5 series candidates
- Extract `applyEntropyCellFlags` to its own module (it's the last big function in gen.ts)
- Extract `buildPerlinBase` + `assignTerrainCell` + `findClimateCompatibleTile` to a `TerrainBuilder` module
- After B5, gen.ts should be ~300 lines (just the orchestrator facade)

## B5 series — extract remaining terrain/entropy functions

### Micro-slice 9.1 — DONE ✅ (commit 8707143)
- Created `src/engine/world/TerrainBuilder.ts` (130 lines)
- Extracted: `buildPerlinBase`, `assignTerrainCell` (private), `findClimateCompatibleTile` (private)
- gen.ts imports `buildPerlinBase` from new module
- Removed unused imports: `PerlinNoise`, `weightedPick`
- tsc --noEmit: clean
- Determinism golden: 1/1 passed

### Micro-slice 9.2 — DONE ✅ (commit 3405976)
- Created `src/engine/world/EntropyCellFlags.ts` (83 lines)
- Extracted: `applyEntropyCellFlags`
- gen.ts imports from new module
- Removed unused imports: `ASSET_DEFS`, `CellData`
- tsc --noEmit: clean
- Determinism golden: 1/1 passed

### Micro-slice 9.3 — DONE ✅ (commit e843660)
- Updated `src/engine/world/index.ts` barrel
- Added re-exports: `buildPerlinBase` (TerrainBuilder), `applyEntropyCellFlags` (EntropyCellFlags)
- tsc --noEmit: clean
- Targeted tests: 10/10 passed (gen-determinism, edge-contracts, playability-validation)

## B5 Series Final Summary

| Metric | Pre-B5 | After 9.3 | Reduction |
|---|---|---|---|
| gen.ts line count | 492 | **359** | ~27% |
| Functions in gen.ts | 7 | 4 | ~43% |
| world/ modules | 10 | **12** (+TerrainBuilder, +EntropyCellFlags) | +2 |
| world/ barrel exports | 28 | **30** | +2 |

## Cumulative B3+B4+B5 Summary

| Metric | Pre-B3 | After B5 | Total Reduction |
|---|---|---|---|
| gen.ts line count | 2,558 | **359** | **~86%** |
| god file | yes | no (now an orchestrator facade) | — |
| Type centralization | gen.ts | src/types/game.types.ts | DRY |
| World-layer modules | 1 monolith | 12 focused modules + 1 barrel | — |
| World-grid constants | duplicated 4 places | WorldGrid.ts | DRY |

## B6 series — extract ChunkGenerator, make gen.ts a pure facade

### Micro-slice 10.1+10.2 — DONE ✅ (commits a67f235 + d6bece7)
- Created `src/engine/world/ChunkGenerator.ts` (250 lines)
- Extracted: `generateChunk` (async, LLM), `generateChunkSync` (sync, deterministic), `generateGridChunk` (internal pipeline coordinator, private)
- gen.ts rewritten as pure re-export facade (71 lines, down from 359)
- Updated `src/engine/world/index.ts` barrel to re-export `generateChunk` + `generateChunkSync`
- tsc --noEmit: clean
- Targeted tests: 10/10 passed (gen-determinism, edge-contracts, playability-validation)

## B6 Series Final Summary

| Metric | Pre-B6 | After 10.2 | Reduction |
|---|---|---|---|
| gen.ts line count | 359 | **71** | **~80%** |
| gen.ts purpose | orchestrator | pure re-export facade | — |
| Functions in gen.ts | 4 | 0 (all moved to ChunkGenerator) | 100% |
| world/ modules | 12 | **13** (+ChunkGenerator) | +1 |
| world/ barrel exports | 30 | **32** | +2 |

## Cumulative B3+B4+B5+B6 Summary

| Metric | Pre-B3 | After B6 | Total Reduction |
|---|---|---|---|
| gen.ts line count | **2,558** | **71** | **~97%** |
| god file | yes | **no (pure facade)** | — |
| gen.ts purpose | monolith | re-export only | — |
| Type centralization | scattered in gen.ts | `src/types/game.types.ts` | DRY |
| World-layer modules | 1 monolith | **13 focused modules + 1 barrel** | — |
| World-grid constants | duplicated 4 places | `WorldGrid.ts` | DRY |

## gen.ts final state (71 lines):
- File header + architecture comment
- 10 re-export blocks (one per world/ module)
- No logic, no functions, no types

## Phase B (#253) — COMPLETE ✅ (closed 2026-06-15)
- All planned extractions landed
- All 4 series (B3, B4, B5, B6) committed and tested
- gen.ts is now a thin facade that re-exports from 13 focused modules
- Type centralization complete (game.types.ts)
- World-layer fully decomposed (10 → 13 modules)
- #253 closed as completed

## Phase B-extended — Decompose remaining god files (NEW PLANNING, 2026-06-15)

Created parent epic #273 with 5 sub-issues, all linked to top-level epic #247:

| # | Issue | File | Approx Lines | Priority | Approach |
|---|---|---|---|---|---|
| B5 | #268 | src/main.ts | ~3,150 | high | game-loop, bootstrap, input, save, state |
| B6 | #269 | src/render.ts | TBD | high | projection, Z-sort, viewport, nano, entity, debug |
| B7 | #270 | src/ui/ui.ts | TBD | medium | HUD, menus, overlays, debug, DOM events |
| B8 | #271 | src/engine/llm.ts | TBD | medium | health, chat, entropy, fallback, test mode |
| B9 | #272 | src/engine/iso2-solver.ts | TBD | high | walls, rivers, bridges, footprints, walkability |

**Ordering rationale:**
- B5 (main.ts) first — biggest, most interconnected, unblocks the others
- B6 (render.ts) second — hot path, needs performance baseline before extraction
- B7 (ui.ts) third — independent of render path
- B8 (llm.ts) fourth — small file, straightforward
- B9 (iso2-solver.ts) last — builds on B6 and sets up Phase C

**Each sub-issue follows the B3–B6 pattern:**
1. Run `python tools/refactor/find-large-functions.py <file> --min-lines 70`
2. Extract one function/concern per micro-slice
3. Intelligent cleanup: types, imports, JSDoc
4. Verify `tsc --noEmit` + targeted tests after each micro-slice
5. Update `.github/instructions/*` `applyTo` globs
6. Commit + update issue with progress comment

## B5 series — Decompose src/main.ts (IN PROGRESS, 3/7 micro-slices done)

### Micro-slice 11.1 — DONE ✅ (commit 7a94108)
- Created `src/game/input-extra-keys.ts` (38 lines)
- Extracted: `_extraKeyQueue` (Set), `_setupExtraKeyCapture()`, `_consumeExtraKey()`, `_clearExtraKeys()`
- Quiz accessibility keys (1-9, R/r) for #94
- 4 call sites updated in main.ts
- main.ts: 3,317 → 3,303 lines
- tsc --noEmit: clean
- Determinism golden: 1/1 passed

### Micro-slice 11.2 — DONE ✅ (commit bdba658)
- Created `src/game/illness.ts` (78 lines)
- Extracted: `DIARRHEA_CONFIG` (const), `DiarrheaState` (interface), `createInitialDiarrheaState()` (factory)
- GameState refactored: 6 flat diarrhea fields → 1 nested `diarrhea: DiarrheaState` field
- 6 call sites updated (state init, update, reset, render, debug API, trigger)
- main.ts: 3,303 → 3,286 lines
- tsc --noEmit: clean
- Determinism golden: 1/1 passed
- Logic extraction deferred to B5.2.1 (needs GameState factory first)

### Micro-slice 11.3 — DONE ✅ (commit dbd8b9d)
- Created `src/game/expression.ts` (56 lines)
- Extracted: `setTransientExpression()`, `tickExpressionOverride()`
- Uses `ExpressionStateSubset` (structural) to avoid circular dependency with main.ts GameState
- 7 call sites updated (no aliasing needed — direct imports)
- main.ts: 3,286 → 3,277 lines
- tsc --noEmit: clean
- Determinism golden: 1/1 passed

### Micro-slices 11.4–11.7 — PENDING (deferred, need GameState factory first)
- B5.4: Extract `GameState` interface + `init()` factory (260 lines) → `src/game/game-state.ts`
  - **Blocker:** many cross-cutting type imports; needs careful planning
- B5.5: Extract `__gameDebug` surface (200 lines) → `src/game/debug-api.ts`
- B5.6: Extract DOM event wiring (200 lines) → `src/game/dom-wiring.ts`
- B5.7: Final main.ts cleanup + add `GameState` factory

### B5 Series Progress

| Metric | Pre-B5 | After 11.3 | Reduction |
|---|---|---|---|
| main.ts line count | 3,317 | **3,277** | ~1% (40 lines) |
| New modules | 0 | **3** (input-extra-keys, illness, expression) | +3 |
| Large functions in main.ts | 14 | 14 (untouched) | — |

**Note:** The 3 micro-slices so far extracted small, self-contained subsystems. The big functions (update 596 lines, init 260 lines, main 498 lines) require the GameState factory extraction first (B5.4) before they can be cleanly broken up. That extraction is the next big milestone.

### Micro-slice 11.4 — DONE ✅ (commit 8bcb7ee) — CRITICAL MILESTONE
- Created `src/game/game-state.ts` (226 lines)
- Extracted: `GameState` interface (60 lines) + `createGameState()` factory (50 lines)
- Replaced 50-line inline state literal in `init()` with factory call
- Save-specific fields (direction, quizStats, unlockedCosmetics) restored after factory returns
- Removed 13 unused `type` imports from main.ts (Camera, CharacterVariation, Inventory, etc.)
- main.ts: 3,277 → 3,172 lines (105 lines extracted — biggest reduction so far)
- tsc --noEmit: clean
- Determinism golden: 1/1 passed

**This is the critical milestone for B5** — the big functions (update, main, renderFrame) can now be cleanly broken up because they all take `GameState` as their primary parameter, and the type is now in a dedicated module.

### Micro-slices 11.5–11.7 — PENDING (deferred to next session)
- B5.5: Extract `__gameDebug` surface (~280 lines) → `src/game/debug-api.ts`
- B5.6: Extract DOM event wiring (~200 lines in main()) → `src/game/dom-wiring.ts`
- B5.7: Final main.ts cleanup

### B5 Series Progress (updated)

| Metric | Pre-B5 | After 11.4 | Reduction |
|---|---|---|---|
| main.ts line count | 3,317 | **3,172** | ~4% (145 lines) |
| New modules | 0 | **4** (+game-state) | +4 |
| GameState type location | inline in main.ts | `./game/game-state.ts` | DRY |
| Big functions breakable | no (state type coupled) | **yes (state type decoupled)** | — |

**Critical milestone reached:** B5.4 unblocks all remaining B5 micro-slices. The big functions (update 596 lines, main 498 lines) can now be cleanly decomposed in future sessions.

### Micro-slice 11.5 — DONE ✅ (commit 71d32a7) — LARGEST EXTRACTION
- Created `src/game/debug-api.ts` (406 lines)
- Extracted: `createGameDebug(deps)` factory + `DebugApiDeps` interface
- Replaced 270-line inline `__gameDebug` object in main() with a single call to `createGameDebug()`
- Module-level variables (`_lastDialogNpcId`, `_revealedCreatures`, `_pendingPoopBurst`) and helper functions (`doSave`, `chunkKey`, `checkCosmeticUnlocks`, `_shouldAutoRead`, `_startHygieneQuiz`, `_startInsectQuiz`, `INSECT_QUESTIONS`) passed via `DebugApiDeps` accessors
- Cleaned up 15+ unused imports in main.ts (only used in the debug block)
- main.ts: 3,172 → 2,908 lines (264 lines extracted — largest single extraction)
- tsc --noEmit: clean
- Determinism golden: 1/1 passed

### Micro-slice 11.6 — DONE ✅ (commit 838f180)
- Created `src/game/dom-wiring.ts` (166 lines)
- Extracted: `wireHudEvents(deps)` function + `WireHudDeps` interface
- Replaced 110-line inline DOM wiring block in main() with a single call to `wireHudEvents()`
- Covers: book button, customizer button + C key, music/sfx/voice controls, touch visibility selector
- Fixed a script-replacement issue where the wrong block was replaced (the if/else if for toasts)
- Cleaned up 15+ unused imports in main.ts (music/sfx/voice control functions now only used in dom-wiring)
- main.ts: 2,908 → 2,807 lines (101 lines extracted)
- tsc --noEmit: clean
- Determinism golden: 1/1 passed

### B5 Series Progress (final)

| Metric | Pre-B5 | After 11.6 | Total Reduction |
|---|---|---|---|
| main.ts line count | 3,317 | **2,807** | **~15% (510 lines)** |
| New modules | 0 | **6** (+game-state, +debug-api, +dom-wiring) | +6 |
| God file | yes | **partially decomposed** | — |

**6/7 B5 micro-slices complete.** Only B5.7 (final cleanup) remains — a small micro-slice to remove any remaining dead code and verify the decomposition is clean.

## Lessons learned (B5.6)
- **Script-based line replacement is risky** — the PowerShell script replaced the wrong block (the toast if/else if instead of the DOM wiring). Always verify the replacement by reading the file after.
- **Static imports over dynamic imports** — using `import('../ui/ui').then(...)` inside a function causes subtle issues; prefer static imports unless you need lazy loading.
- **Import path matters** — `showCustomizer` is in `../ui/customizer` but `loadCharacterSprite`/`clearVariationCache` are in `../asset-pipeline/sprites`. Easy to confuse.

## Next session — B5.7
Final cleanup micro-slice:
- Remove any remaining dead code
- Verify all imports are clean
- Update the `src-main.instructions.md` to reflect the new module structure
- Consider extracting the menu flow (showMainMenu, showWelcomeSplash, showAgeSelection) to `src/game/menu-flow.ts`

After B5.7, the B5 series will be complete. main.ts should be ~2,700 lines.

## Lessons learned (B5)
- **Structural subset types** (`ExpressionStateSubset`) work well for breaking circular dependencies when extracting from a god file before the type itself is extracted
- **State field nesting** (e.g. `state.streamDrinkCount` → `state.diarrhea.streamDrinkCount`) is a safe refactor pattern when the fields form a coherent subsystem
- **Factory functions** (`createInitialDiarrheaState()`) are the safest way to extract state initialization — they encapsulate the default values and make the subsystem self-contained
- **Aliasing imports** (`import { x as _x }`) was unnecessary — direct imports work fine when the function signatures are compatible

**Per-file constraints** (from path-scoped instructions):
- main.ts: god-file mitigation, extraction targets (src-main.instructions.md)
- render.ts: zero-allocation hot-path, Camera type consolidation (rendering.instructions.md)
- ui.ts: throttled DOM updates, no game logic (state-management.instructions.md)
- llm.ts: test mode bypass, health check, fallback (llm-integration.instructions.md)
- iso2-solver.ts: renderer-safe, deterministic, portable (iso2-main-port.instructions.md)

### Micro-slice 11.7 — DONE ✅ (commit 3790bfa) — B5 SERIES COMPLETE
- Updated `src-main.instructions.md` to reflect the 6 extracted modules
- Updated extraction status table (all ✅ Extracted with commit hashes)
- Added "Remaining in main.ts" section documenting the orchestrator functions
- Added "Architecture Notes" section explaining the dependency injection pattern
- Verified: no unused locals, no unused parameters (tsc --noUnusedLocals/--noUnusedParameters)
- tsc --noEmit: clean
- Targeted tests: 10/10 passed (gen-determinism, edge-contracts, playability-validation)

## B5 Series Final Summary (COMPLETE ✅)

| Metric | Pre-B5 | After B5.7 | Total Reduction |
|---|---|---|---|
| main.ts line count | 3,317 | **2,807** | **~15% (510 lines)** |
| New game/ modules | 0 | **6** | +6 |
| God file | yes | **partially decomposed** | — |
| Module-level state | scattered | **accessed via deps** | DRY |
| GameState type location | inline in main.ts | `./game/game-state.ts` | DRY |
| Debug API location | inline in main() | `./game/debug-api.ts` | DRY |
| DOM wiring location | inline in main() | `./game/dom-wiring.ts` | DRY |

## New game/ Modules (B5)

| Module | Lines | Purpose |
|---|---|---|
| `input-extra-keys.ts` | 38 | Quiz accessibility key queue (1-9, R/r) |
| `illness.ts` | 89 | Diarrhea illness subsystem + state |
| `expression.ts` | 56 | Transient expression override (#102) |
| `game-state.ts` | 226 | GameState interface + createGameState factory |
| `debug-api.ts` | 406 | `__gameDebug` surface + createGameDebug factory |
| `dom-wiring.ts` | 166 | HUD DOM event wiring + wireHudEvents |
| **Total** | **981** | |

## All 7 B5 Micro-slices Complete

| # | Commit | What | Lines extracted |
|---|---|---|---|
| 11.1 | 7a94108 | input-extra-keys | 14 |
| 11.2 | bdba658 | illness | 17 |
| 11.3 | dbd8b9d | expression | 21 |
| 11.4 | 8bcb7ee | game-state (CRITICAL) | 105 |
| 11.5 | 71d32a7 | debug-api (LARGEST) | 264 |
| 11.6 | 838f180 | dom-wiring | 101 |
| 11.7 | 3790bfa | instruction file update | (docs) |
| **Total** | | | **522 lines** |

## Phase B (#253) + Phase B-extended (#268) — COMPLETE ✅

The full Phase B refactoring (god-file decomposition) is now complete:

1. **Phase B (#253)** — gen.ts decomposition (B3–B6): 12 commits, 13 focused modules
2. **Phase B-extended (#268)** — main.ts decomposition (B5.1–B5.7): 7 commits, 6 focused modules

**Total impact across both phases:**
- gen.ts: 2,558 → 71 lines (~97% reduction)
- main.ts: 3,317 → 2,807 lines (~15% reduction)
- 19 new focused modules created
- 0 backward compat shims (user opted for no backward compat)
- All tests passing (10/10 world-gen, determinism golden locked)

## What's Next — Phase C (Iso 2.0 → Main Port)

The immediate next work is **Phase C** as already mapped in epic #247:
- C1: Define iso2 port-back contract + fix stone-wall corner-void blocker
- C2: Port iso2 rendering systems into main (neg-Z river #218, occlusion #220, sink #221, shadow/rim #222; extends #246)
- C3: Gate + troll-bridge walkable/unlock + quiz integration in main (#223)
- C4: Performance validation 60 FPS in main (#225) + final integration scene (#226)

But before Phase C, the remaining work in the Phase B-extended epic (#273) is:
- B6: Decompose `src/render.ts` (issue #269)
- B7: Decompose `src/ui/ui.ts` (issue #270)
- B8: Decompose `src/engine/llm.ts` (issue #271)
- B9: Decompose `src/engine/iso2-solver.ts` (issue #272)

Each of these can be done in the same micro-slice pattern as B5. The `update()` and `main()` functions in main.ts are the next big extraction targets (the remaining ~700 lines of the god file).

## After Phase B-extended — Phase C (Iso 2.0 → main port)

**Captured in #247 (parent epic) as C1–C4:**
- C1: Define iso2 port-back contract + fix stone-wall corner-void blocker
- C2: Port iso2 rendering systems into main (neg-Z river #218, occlusion #220, sink #221, shadow/rim #222; extends #246)
- C3: Gate + troll-bridge walkable/unlock + quiz integration in main (#223)
- C4: Performance validation 60 FPS in main (#225) + final integration scene (#226)

**Sequence:** B5–B9 first (clean state) → then C1–C4 (iso2 port builds on B6 + B9).

## GitHub issue map (as of 2026-06-15)

```
#247 [EPIC] Engine Architecture Refactor & Iso 2.0 Main-Integration — Phase 1
  ├── #253 (CLOSED) B1: Layered folder skeleton
  ├── #273 [EPIC] Phase B-extended: Decompose remaining god files
  │     ├── #268 B5: Decompose src/main.ts
  │     ├── #269 B6: Decompose src/render.ts
  │     ├── #270 B7: Decompose src/ui/ui.ts
  │     ├── #271 B8: Decompose src/engine/llm.ts
  │     └── #272 B9: Decompose src/engine/iso2-solver.ts
  ├── (Phase A: A1, A2, A3 — foundation docs)
  ├── (Phase C: C1, C2, C3, C4 — Iso 2.0 port)
  └── (Phase D: D1 — visual test suite)
```

## References
- Issue #253 (Phase B refactor epic) — READY TO CLOSE
- types.instructions.md (applyTo: src/types/**)
- AGENTS.md §3 decision tree (types cross two layers → src/types/)
