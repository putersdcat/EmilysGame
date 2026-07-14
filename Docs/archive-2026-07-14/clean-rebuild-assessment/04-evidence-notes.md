# 04 — Evidence Notes

## Audit date and branch

- Date: 2026-07-07
- Branch: `experiment/isometric-2.0`
- Default branch: `main`
- Active PR context: PR #276, `feat(iso2): complete Phase D texture transitions`

## Local validation caveat

`node_modules` was not installed in the checkout during the audit. `npm ls --depth=0` reported unmet dev dependencies. Therefore, this assessment did not claim a fresh local typecheck/build/test run.

The audit is based on file inspection, git history, docs, metrics, and existing test artifacts.

## Repo metrics observed

| Metric | Value |
|---|---:|
| `src/` TS files | 165 |
| `src/` TS LOC | ~36,295 |
| `tests/` TS files | 101 |
| `tests/` TS LOC | ~17,765 |
| `experiment/isometric-2.0/src` TS files | 31 |
| `experiment/isometric-2.0/src` TS LOC | ~8,761 |
| Branch delta vs `main` | 846 files |
| Branch insertions vs `main` | ~52,980 |
| Branch deletions vs `main` | ~9,194 |

## Top large files in `src/`

| File | LOC |
|---|---:|
| `src/config/tiles.config.ts` | 2381 |
| `src/asset-pipeline/asset-sprites.ts` | 1092 |
| `src/rendering/nano-tile.ts` | 1089 |
| `src/main.ts` | 997 |
| `src/engine/world/WorldUnitSolver.ts` | 954 |
| `src/asset-pipeline/sprites.ts` | 837 |
| `src/rendering/render.ts` | 813 |
| `src/rendering/terrain-cache.ts` | 767 |
| `src/rendering/tiles.ts` | 661 |
| `src/game/audio/sfx.ts` | 621 |
| `src/engine/world/ObstacleSolver.ts` | 601 |
| `src/game/wildlife.ts` | 579 |
| `src/game/input.ts` | 522 |

## Current `engine/world` module sizes

| File | LOC |
|---|---:|
| `WorldUnitSolver.ts` | 954 |
| `ObstacleSolver.ts` | 601 |
| `Populator.ts` | 453 |
| `ChunkGenerator.ts` | 288 |
| `BiomeSelector.ts` | 200 |
| `CollectibleScatterer.ts` | 175 |
| `Validation.ts` | 173 |
| `Passability.ts` | 136 |
| `TerrainBuilder.ts` | 130 |
| `index.ts` | 110 |
| `EntropyCellFlags.ts` | 83 |
| `Entropy.ts` | 77 |
| `GridUtils.ts` | 47 |
| `WorldGrid.ts` | 40 |

## Current content-pack counts

Actual manifest/shard counts observed under `public/content/packs/default-v1`:

- quizzes:
  - `quizzes-001.json`: 100
  - `quizzes-002.json`: 100
  - `quizzes-003.json`: 100
  - `quizzes-004.json`: 81
  - total: **381**
- articles:
  - `articles-001.json`: 30
  - total: **30**

This differs from `public/content/README.md`, which claims 420 quizzes and 31 articles.

## Documentation drift observed

| Location | Drift |
|---|---|
| `README.md` | Links root `AGENTS.md`, but no root `AGENTS.md` exists in this branch. |
| `ARCHITECTURE.md` | Some line-count/current-state claims still describe earlier refactor state. |
| `public/content/README.md` | Content counts differ from actual manifest/shards. |
| Iso2 tooling docs | Some older docs reference rebuild/restart behavior that differs from newer hot-reload relay instructions. |

## Existing architecture strengths

- Layered `src/` folders now exist.
- `src/engine/gen.ts` is a re-export facade.
- Shared game/chunk/camera types live in `src/types/game.types.ts`.
- Rendering has been partially decomposed into projection, terrain cache, nano tiles, shadow cache, tile variants, mouth animation, etc.
- UI has been partially decomposed into HUD/sidebar/overlays/status/audio modules.
- The test suite is broad and domain-organized.
- Determinism is explicitly tested.

## Existing architecture concerns

- Canvas 2D renderer is still very complex.
- `main.ts` still owns several orchestration concerns.
- Large config/render/asset files remain.
- Visual baseline artifacts are numerous and need strict promotion policy.
- Save state is versioned but broad; future migration would benefit from formal delta/event model.
- LLM can still shape startup flow more than ideal for deployability.

## Important current tests noted

- `tests/world-gen/gen-determinism.spec.ts`
- `tests/rendering/iso2-main-game-visual-smoke.spec.ts`
- `tests/rendering/iso2-*.spec.ts`
- domain suites under `tests/core`, `tests/gameplay`, `tests/education`, `tests/ui`, `tests/sprites`, `tests/audio`, `tests/perf`

## Main conclusion supported by evidence

The current codebase has valuable systems and should be mined for content, tests, schemas, and behavior. But the repeated Iso2 rendering history and current renderer complexity strongly support relaxing the no-library constraint and proving a Three.js orthographic renderer before investing more months in hand-rolled Canvas isometric geometry.
