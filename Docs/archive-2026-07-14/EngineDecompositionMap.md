# Engine Decomposition Map — Files > 400 Lines

**Issue:** #249 (A3) · **Parent EPIC:** #247 · **Date:** 2026-06-11
**Branch:** `refactor/engine-phase1`

This document inventories every `src/` file over 400 lines, records its primary
responsibility and the distinct concerns mixed inside it, and proposes a target
module + destination folder for the Phase B (#251–#254) restructure. Line counts
were measured directly (`Get-Content | Measure-Object -Line`) on 2026-06-11 — not
estimated.

> **Target layered layout** (per [RefactoringPlan §4](RefactoringPlan_11-06-26.md)):
> `src/engine/` (pure logic, no DOM/Canvas) · `src/rendering/` (Canvas + projection) ·
> `src/asset-pipeline/` (sprite/texture generation) · `src/game/` (systems/orchestration) ·
> `src/ui/` (HUD/menus/DOM) · `src/config/` (unchanged) · `src/types/` (shared types).

---

## 1. Full file inventory (measured 2026-06-11)

### Files > 400 lines (Phase B targets)

| # | File | Lines | Target folder | Decompose? | Risk |
|---|------|------:|---------------|-----------|------|
| 1 | `src/main.ts` | 3316 | `src/` (thin) + `src/game/` | **Yes — #252** | High |
| 2 | `src/gen.ts` | 2558 | `src/engine/world/` | **Yes — #253** | High |
| 3 | `src/config/tiles.config.ts` | 2381 | `src/config/` | Optional split | Low |
| 4 | `src/asset-sprites.ts` | 1092 | `src/asset-pipeline/` | Move; optional split | Med |
| 5 | `src/nano-tile.ts` | 1030 | `src/rendering/` | Move; optional split | Med |
| 6 | `src/render.ts` | 870 | `src/rendering/` | Move; light split | Med |
| 7 | `src/sprites.ts` | 837 | `src/asset-pipeline/` | Move | Med |
| 8 | `src/terrain-cache.ts` | 749 | `src/rendering/` | Move | Med |
| 9 | `src/ui.ts` | 734 | `src/ui/` | Move; optional split | Med |
| 10 | `src/tiles.ts` | 661 | `src/rendering/` or `engine/` | Move | Med |
| 11 | `src/sfx.ts` | 621 | `src/game/audio/` | Move | Low |
| 12 | `src/wildlife.ts` | 579 | `src/game/` | Move | Low |
| 13 | `src/input.ts` | 522 | `src/game/` | Move | Low |
| 14 | `src/config/assets.config.ts` | 493 | `src/config/` | No | Low |
| 15 | `src/knowledge.ts` | 479 | `src/game/` | Move | Low |
| 16 | `src/trading.ts` | 470 | `src/game/` | Move | Low |
| 17 | `src/npc-sprites.ts` | 445 | `src/asset-pipeline/` | Move | Low |
| 18 | `src/nano-tile-svgs.ts` | 439 | `src/rendering/` | Move | Med |
| 19 | `src/local-lights.ts` | 430 | `src/rendering/` | Move | Med |
| 20 | `src/config/npc.config.ts` | 418 | `src/config/` | No | Low |
| 21 | `src/config/sfx.config.ts` | 411 | `src/config/` | No | Low |
| 22 | `src/customizer.ts` | 406 | `src/ui/` | Move | Low |
| 23 | `src/llm.ts` | 401 | `src/engine/` or `src/game/` | Move | Low |

### Notable files just under 400 (move with their subsystem, no split)

`music.ts` (366), `weather.ts` (359, rendering), `mechanics.ts` (338, engine),
`thought-bubbles.ts` (332, ui), `math-solver.ts` (328, game), `quiz.ts` (327, game),
`particles.ts` (318, rendering), `wasm-bridge.ts` (294, rendering),
`debuff-visuals.ts` (291, rendering), `iso2-solver.ts` (278, engine),
`nano-tile-defs.ts` (254, rendering), `utils.ts` (263, engine),
`fog.ts` (214, rendering), `iso2-materials.ts` (203, asset-pipeline),
`shadows.ts` (132, rendering), `lighting.ts` (135, rendering).

### Already-centralized types

`src/types/iso-renderer.types.ts` (194), `src/types/content-pack.types.ts` (142).

---

## 2. Confirmed duplicate / shared types (B4 — #254)

| Type | Defined in | Also defined / imported | Action |
|------|-----------|-------------------------|--------|
| `Camera` | `src/render.ts:30` (`export interface Camera`) | **duplicated** at `src/local-lights.ts:47` (`export interface Camera`); imported by `main.ts:12` from `./render` | Promote single canonical `Camera` to `src/types/`; both renderers import it |
| `ChunkData`, `BorderConstraints` | `src/gen.ts` (exported) | imported by `main.ts` | Move to `src/types/world.types.ts` when `gen.ts` splits |
| `InteractionResult` | `src/mechanics.ts` (exported) | imported by `main.ts` | Move to `src/types/` (cross-boundary) |
| `CharacterVariation` | `src/sprites.ts` | imported by `main.ts` | Keep with sprites (asset-pipeline) — module-internal-ish |
| `QuizState`, `StreakState` | `src/quiz.ts` | imported by `main.ts` | Keep with quiz unless reused widely |

> The experiment also defines `Camera` at `experiment/isometric-2.0/src/types.ts:410`.
> That copy is independent of the main game and is **not** part of this dedup.

---

## 3. `main.ts` (3316 lines) → decomposition (#252)

**Primary responsibility:** entry point + per-frame orchestration. Currently mixes
~20 concerns. **No direct module exports**; instead exposes ~80–90 accessors via
`window.__gameDebug` (≈ lines 2750–3150).

### Internal section map (measured)

| Section | Lines | Concern |
|---------|------:|---------|
| Imports & globals | 1–112 | 40+ imports across all subsystems |
| Extra key queue | 115–145 | quiz-accessibility key capture (#94) |
| Game state interface | 148–290 | the monolithic `GameState` shape |
| Diarrhea config | 292–303 | illness-chain thresholds (#133) |
| Transient expression system | 305–330 | temporary expression override (#102) |
| Wound-care / hygiene / insect quizzes | 332–499 | inline mini-quiz builders (#109, #110) |
| Chunk management | 501–750 | load on boundary cross, resolved-cell persistence |
| LLM connection gate | 752–850 | splash + health polling |
| Initialization | 852–1150 | canvas, preload, restore save, expose debug hooks |
| Quiz-accessibility helpers | 1152–1180 | auto-read for age bands (#94) |
| Update function | 1182–1750 | per-frame: input, movement, collision, status, wildlife, UI sync |
| Interaction handling | 1752–2050 | NPC/chest/sign/quest/outhouse dispatch |
| Save/Load | 2052–2350 | `buildSaveData`, `applySaveData`, persistence |
| Menu system | 2352–2650 | age select, options, main/pause menus, Tesla badge (#185) |
| Cosmetic unlocks | 2652–2700 | progression → grant cosmetics (#66) |
| Thought-bubble triggers | 2702–2900 | context-aware hints |
| Wildlife rendering | 2902–3150 | night eyes (#114), sprites/emoji (#80, #142) |
| Render function | 3152–3250 | UI, minimap, lighting, weather, book sync |
| Game loop | 3252–3270 | `requestAnimationFrame` orchestrator |
| Extended input handlers | 3272–3316 | F3, I, B, Esc, Shift+T/W, F, E, Tab |

### Proposed extraction (per `.github/instructions/src-main.instructions.md`)

| New module | Folder | Pulls from main.ts sections |
|-----------|--------|------------------------------|
| `bootstrap.ts` | `src/game/` | init (852–1150), LLM gate (752–850) |
| `game-loop.ts` | `src/game/` | update (1182–1750), render (3152–3250), loop (3252–3270) |
| `input-wiring.ts` | `src/game/` | extra-key queue (115–145), extended handlers (3272–3316), input parts of update |
| `interactions.ts` | `src/game/` | interaction handling (1752–2050) |
| `save-wiring.ts` | `src/game/` | save/load (2052–2350) glue over `save.ts` |
| `menus.ts` | `src/ui/` | menu system (2352–2650) |
| `inline-quizzes.ts` | `src/game/` | wound-care/hygiene/insect quizzes (332–499) |
| `systems-orchestrator.ts` | `src/game/` | per-frame status/injury/diarrhea/expression/cosmetics/bubbles ticks |
| `debug-hooks.ts` | `src/game/` | `window.__gameDebug` surface (2750–3150) |
| `game-state.ts` | `src/types/` + `src/game/` | `GameState` interface (148–290) + factory |
| `main.ts` (kept) | `src/` | thin: construct state, call bootstrap, start loop (target < 400 lines) |

**Risk:** High — `update()` and the `GameState` object thread through everything.
Extract incrementally; keep `npx tsc --noEmit` + Playwright green between each move.
Preserve zero-allocation render hot path (`performance.instructions.md`).

---

## 4. `gen.ts` (2558 lines) → decomposition (#253)

**Primary responsibility:** synchronous world generation. Implements a partial
version of the [WorldEngine 10-phase solver](WorldEngine-03-SolverPipeline.md).

### Phases present (measured / inferred)

| Phase | Lines (approx) | Key functions |
|-------|---------------|---------------|
| Entropy / biome selection | 1100–1200 + scattered | `selectBiomeCoherent`, `deriveMood`, `detectBiomeTransitions`, `getChunkClimate`, `feedEntropy`, `getEntropyBuffer`, `restoreEntropyBuffer`, `setWordlist` |
| 1 Perlin base | 1000–1100 | `buildPerlinBase` |
| 2 AC-3 world-unit grid solver | 1200–1600 | `solveWorldUnitGrid`, `applyBorderConstraints`, `buildBiomeCandidatePool`, `collapseAllMRV`, `propagateAC3` |
| 3 Stamp grid | 1600–1650 | `stampWorldUnitGrid` |
| 4 Passability | 1650–1800 | `enforcePassability`, `validateWaterIntegrity`, `getWaterDebugInfo` |
| 5a Anchor population | 1800–2000 | `populateAnchors`, `placeNpcAtCell`, `countWalkableNeighbors` |
| 5b Decorations | 2000–2150 | `clusterDecorations`, `scatterDecorations` |
| 5c Collectibles | 2150–2300 | `scatterCollectibles`, `layCoinTrails` |
| 5.4 Quiz gates | 2300–2400 | `placeQuizGates`, `placeGatesInFenceRuns` (#223) |
| 5.45 Bonfires | 2400–2450 | `placeBonfires` (#67) |
| 5.5 Entropy cell flags | 1100–1200 | `applyEntropyCellFlags` |
| 8 Playability validation | 800–1000 | `validatePlayability`, `getPlayabilityStats` (Solver F) |
| Lock-key DAG | scattered | `getLockKeyDebugInfo`, balance/repair helpers |

### Proposed extraction (per `.github/instructions/src-gen.instructions.md`) → `src/engine/world/`

| New module | Responsibility |
|-----------|----------------|
| `BiomeSelector.ts` | entropy bias, climate noise, biome coherence + transitions, mood |
| `TemplateStamper.ts` | AC-3 solver, MRV collapse, border constraints, stamp grid |
| `Passability.ts` | path carving, water integrity, connectivity |
| `Populator.ts` | NPC/anchor placement, decoration clusters + scatter |
| `CollectibleScatterer.ts` | coins (scatter + trails), items, keys, dead-end rewards |
| `ObstacleSolver.ts` | quiz gates, fence-run gates, bonfires, lock-key DAG balance |
| `Validation.ts` | `validatePlayability`, playability stats (Solver F) |
| `Entropy.ts` | wordlist, entropy buffer, `feedEntropy`, cell flags |
| `index.ts` | orchestrates phases in order; **preserves seed determinism** |

**Consumed by `main.ts`:** `generateChunkSync` (every boundary cross), `feedEntropy`,
`setWordlist`/`getEntropyBuffer`/`restoreEntropyBuffer` (init + save/load), and several
debug diagnostics via `__gameDebug`. The public surface must be preserved through a
barrel so `main.ts` imports don't churn.

**Risk:** High — determinism is load-bearing: chunks are **regenerated** from seed on
re-entry rather than stored, so save/load correctness depends on identical output.
Add/extend a determinism test (same seed → identical chunk) before/after the split.

---

## 5. `render.ts` (870 lines) → light split (#252/B-phase rendering move)

**Primary responsibility:** isometric renderer. Owns `Camera`, `IsometricRenderer`,
the zero-allocation draw-command pool, NPC mouth animation, occluders, depth sort,
WASM-vs-JS dispatch, and shadow cache.

### Exported symbols

`Camera` (interface, line 30), `IsometricRenderer` (class), `setDialogNpc`,
`invalidateObjectCache`, `clearObjectCache`.

### Module-level mutable state (B4 — #254)

| Var | Purpose |
|-----|---------|
| `_dialogNpcId`, `_mouthCycleIdx`, `_mouthLastTick`, `_headBobPhase` (~78–84) | NPC mouth/head-bob animation (#113) |
| `jsPool` (8192), `jsSortIdx`, `jsPoolIdx` (~167–175) | pre-allocated draw-command pool (hot path) |
| `occluderPool` (64), `occluderCount` (~197–203) | occluder refs |
| `objectCellCache` (Map), `_renderFrameCount` (~206–207) | sparse object cells per chunk |
| class members `shadowCache`, `_shadowAngle`, `_shadowStretch` (~534–536) | dynamic shadow sprites |

### Proposal

- Move whole file to `src/rendering/render.ts`.
- Optional light split: extract NPC mouth/head-bob animation (`_dialogNpcId` … +
  `getNpcMouthState`/`getHeadBob` + `setDialogNpc`) into
  `src/rendering/npc-dialog-anim.ts`.
- Keep the draw pool / hot-path state inside the renderer module (it is an
  **owned cache**, not serialized state — classify as such in B4). Do **not** move
  pool allocations into `GameState`.
- `Camera` → `src/types/camera.types.ts`; re-export from rendering barrel for
  backwards-compatible imports during migration.

---

## 6. Ordering & risk summary

1. **Low-risk moves first** (Phase B1): audio, config, leaf game/ui modules — no
   internal split, just relocation + import fixups + instruction `applyTo` updates.
2. **Rendering cluster** (B1): `render.ts`, `terrain-cache.ts`, `nano-tile*.ts`,
   `local-lights.ts`, `shadows.ts`, `fog.ts`, `lighting.ts`, `weather.ts`,
   `particles.ts`, `debuff-visuals.ts` — move together, they are tightly coupled.
3. **`gen.ts` split** (B3) — independent of rendering; preserve determinism.
4. **`main.ts` split** (B2) — last and most invasive; depends on the new folders
   existing so extracted modules have a home.
5. **Type centralization** (B4) — interleave the `Camera` dedup early (it unblocks
   the rendering move) and finish the rest after B2/B3.

**Global invariant:** after every move, `npx tsc --noEmit` passes, the full
Playwright suite passes, and `npm run dev` launches the game. The path-scoped
`.github/instructions/*.instructions.md` `applyTo` globs and the
`.github/copilot-instructions.md` Key Files table must be updated in the same
commit as each move.
