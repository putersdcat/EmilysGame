# 01 — Current State and Evolution

## Scope of this audit

This assessment was produced from a read-only review of the repository on 2026-07-07. It covered:

- root docs: `README.md`, `ARCHITECTURE.md`, `package.json`;
- WorldEngine docs under `Docs/WorldEngine-*`;
- Iso 2.0 docs and experiment files;
- archived planning docs for the game bible, LLM entropy, and Book of Knowledge;
- current `src/` module structure and major high-risk files;
- content pack manifest and shards;
- tests and visual baselines;
- git history samples across `main` and `experiment/isometric-2.0`;
- branch delta versus `main`.

No files were modified during the audit. At the time of audit, `node_modules` was absent, so typecheck/build/test status was not re-run locally.

## Product vision recovered from docs

The intended game is consistent across the original planning and newer architecture docs:

- browser-based isometric procedural adventure;
- educational exploration for a child-friendly audience;
- 5-15 minute play sessions with persistence;
- local/offline-first LLM entropy;
- deterministic chunk generation;
- quiz-gated progression;
- Book of Knowledge and subject-biased learning paths;
- biome progression and replayable procedural worlds;
- lightweight web delivery.

The strongest design sentence is effectively:

> A procedurally generated educational isometric adventure where LLM output biases deterministic generation, quizzes and knowledge unlock progression, and the world feels discoverable.

That concept remains strong.

## Current repository footprint

Observed metrics from the current branch:

| Area | Count |
|---|---:|
| `src/` TypeScript files | 165 |
| `src/` TypeScript LOC | ~36,295 |
| `tests/` TypeScript files | 101 |
| `tests/` TypeScript LOC | ~17,765 |
| `experiment/isometric-2.0/src` TypeScript files | 31 |
| `experiment/isometric-2.0/src` TypeScript LOC | ~8,761 |
| Runtime dependencies in root `package.json` | 0 |
| Dev dependencies | Vite, TypeScript, Playwright, tsx, AssemblyScript |
| Active branch delta versus `main` | 846 files changed |
| Active branch delta | ~52,980 insertions / ~9,194 deletions |

The codebase is not small anymore. It is an alpha-scale game plus rendering experiment, content pipeline, audio system, agent tooling, and visual regression corpus.

## How the code evolved

### 1. Original prototype / game bible phase

The original game bible targeted a lightweight TypeScript/Canvas adventure:

- no external game engine;
- localStorage saves;
- Canvas 2D renderer;
- Web Audio API;
- LLM as entropy source;
- quizzes verified by deterministic TypeScript logic, not by LLM judgment.

This was a sensible constraint set for a fast proof-of-concept.

### 2. Gameplay/content expansion phase

The history on `main` shows a broad feature push around February 2026. Delivered or partially delivered systems include:

- SVG sprites for plants, structures, collectibles, animals;
- character customization, outfits, accessories, hair, eye colors;
- NPC trading, barter mini-game, themed shops;
- wildlife and cat behavior systems;
- survival/status systems, injuries, hygiene, stream drinking, food safety, diarrhea chain;
- touch/gamepad input, Tesla browser mode;
- fog-of-war, lighting, weather, particles;
- MIDI music, sampled SFX, positional audio;
- Book of Knowledge and content packs;
- automated content ingestion/QA scripts;
- Playwright tests reorganized by domain.

This built a feature-rich alpha but also created a large orchestration surface.

### 3. Iso 2.0 experiment phase

The Iso 2.0 experiment started as a clean-sheet rendering attempt to fix visual artifacts in the original renderer. Its goals included:

- direct isometric projection, not square-to-diamond stretching;
- 144px source micro tiles mapping cleanly to 3×48px nano patches;
- 3×3 nano overlay grid;
- positive-Z billboards for fences/gates/tall grass;
- positive-Z extruded walls;
- negative-Z rivers;
- continuous feature solver for connected walls/fences/rivers;
- dirty-frame chunk baking;
- MCP visual tooling.

This experiment produced the strongest visual ideas in the repo, but it also exposed the hardest failure mode: agents repeatedly misjudged composed isometric geometry by validating isolated single-tile previews instead of full scenes.

### 4. Engine decomposition phase

The June 2026 refactor improved structure dramatically. Current `src/` layout is layered:

- `src/engine/` — pure-ish logic and world generation;
- `src/rendering/` — Canvas rendering and projection;
- `src/asset-pipeline/` — procedural sprites/textures/content loading;
- `src/game/` — game systems and orchestration;
- `src/ui/` — DOM HUD/menus/overlays;
- `src/config/` — immutable/tunable game data;
- `src/types/` — shared types.

Important progress:

- `src/engine/gen.ts` is now a facade over `src/engine/world/*`.
- `src/main.ts` shrank from the documented ~3,300 LOC to ~997 LOC.
- Camera and chunk types have been centralized in `src/types/game.types.ts`.
- Rendering submodules now exist for projection, shadows, terrain cache, nano tiles, mouth animation, debug grid, tile variants, etc.

### 5. Current branch: Iso2 main-engine port and visual stabilization

Recent commits show the active branch is focused on:

- Iso2 material families;
- main-engine visual stabilization;
- starter homestead placement;
- seamless world-anchored terrain textures;
- water/bridge/fence/wall parity tests;
- zero-allocation render hot path work;
- visual smoke baselines.

This branch is not a small experiment. It is a major integration effort.

## Delivered strengths

### The concept is coherent

The project has a strong product identity: educational adventure plus procedural generation plus LLM-flavored entropy. That identity is worth preserving.

### The world-generation architecture has real substance

The current `engine/world` split includes:

- biome selection and mood;
- entropy pool;
- Perlin base terrain;
- AC-3-ish world unit solver;
- border constraints;
- passability enforcement;
- population;
- collectible scatter;
- obstacle/quiz-gate solving;
- playability validation.

The implementation is not yet the full documented 10-phase solver, but it is not just random tile noise either.

### Tests are broad and useful

The repo has Playwright coverage for:

- core mechanics;
- world generation;
- rendering/Iso2;
- sprites;
- education;
- UI;
- gameplay;
- audio;
- performance.

The determinism test for `generateChunkSync` is especially important because the save model depends on regenerating chunks rather than storing every chunk.

### The education system exists

The content pack system is real. It includes:

- manifest;
- quiz shards;
- article shards;
- schema types;
- loader;
- in-code fallback content.

Actual shipped content from the current manifest/shards:

- **381 quizzes**;
- **30 knowledge articles**.

### The repo has learned visual-validation lessons

Docs like `Iso2.0-HonestResearchAndPlan.md` are unusually useful because they document actual failure modes:

- single-tile renders are insufficient;
- composed scenes are required;
- corner/seam bugs require pixel-level review;
- visual proof must be linked to issues/commits.

This should directly shape any rebuild.

## Technical debt and risk

### Canvas 2D is fighting the desired game

The renderer currently hand-rolls:

- isometric projection;
- depth sorting;
- terrain chunk caching;
- sparse object lists;
- draw command pools;
- occluder pools;
- positive/negative nano geometry;
- wall/fence/bridge/ridge variants;
- partial player occlusion;
- weather, lighting, fog overlays;
- optional WASM bridge.

This is impressive, but it is also the source of recurring complexity. The strongest evidence is the long Iso2 history around wall corners, seams, face slices, and composed-scene visual correctness.

### Large files remain

Largest current files include:

| File | LOC |
|---|---:|
| `src/config/tiles.config.ts` | 2381 |
| `src/asset-pipeline/asset-sprites.ts` | 1092 |
| `src/rendering/nano-tile.ts` | 1089 |
| `src/main.ts` | 997 |
| `src/engine/world/WorldUnitSolver.ts` | 954 |
| `src/rendering/render.ts` | 813 |
| `src/rendering/terrain-cache.ts` | 767 |
| `src/game/audio/sfx.ts` | 621 |
| `src/engine/world/ObstacleSolver.ts` | 601 |
| `src/game/wildlife.ts` | 579 |
| `src/game/input.ts` | 522 |

The old monoliths have been improved, but the system is still hard for future agents to reason about.

### `main.ts` is transitional

`main.ts` is no longer a pure god-file, but it still owns:

- init sequence;
- quiz input;
- dialog input;
- trade input;
- subsystem ticks;
- movement;
- interaction dispatch;
- game loop.

It contains many extraction-history comments and compatibility notes. That is useful history, not a clean final architecture.

### State is too centralized

`GameState` is understandable but broad. It includes player, camera, chunks, inventory, quiz, UI, knowledge, trade, status, injury, music, SFX, voice, streak, age profile, illness, and transient flags. A clean engine should split this into subsystem stores and typed events/commands.

### Config is too code-heavy

`tiles.config.ts` at 2381 LOC is a sign that authoring data and engine code are too close. A rebuild should move toward schema-validated data plus generated TypeScript indexes.

### Documentation drift exists

Concrete examples:

- `README.md` links root `AGENTS.md`, but root `AGENTS.md` does not exist in this branch.
- `ARCHITECTURE.md` still describes `main.ts` and `gen.ts` line counts from before later refactors.
- `public/content/README.md` claims 420 quizzes / 31 articles, while actual manifest/shards show 381 quizzes / 30 articles.
- Some Iso2 docs imply AiTools rebuild/restart behavior that differs from the newer hot-reload relay instructions.

This is normal in a fast branch, but a clean rebuild should make machine-readable manifests and tests the source of truth.

## Current gap against full documented vision

The live game has a broad alpha, but the docs envision more:

- full macro/world-unit/micro/nano grammar;
- robust cross-chunk boundary contracts;
- chain integrity for rivers/walls/fences/paths;
- full lock-key progression DAG guarantees;
- richer settlements, cathedrals, castles, caves, civic structures;
- complete nano-aware population rules;
- visual-material families for all structural kits;
- complete Book/word-bag learning loop;
- production-grade visual CI.

The current implementation is partway there. It should be treated as a valuable prototype and reference implementation, not as the final architecture.
