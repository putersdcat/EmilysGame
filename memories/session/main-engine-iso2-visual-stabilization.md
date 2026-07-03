# Main Engine Iso 2.0 Visual Stabilization Handoff

Date: 2026-07-03
Branch: `experiment/isometric-2.0`
PR: https://github.com/putersdcat/EmilysGame/pull/276
Tracking issue: https://github.com/putersdcat/EmilysGame/issues/277
Previous tracking: #275 Phase D texture/seam work

## Goal

Make normal generated gameplay look coherent again after Iso 2.0 backports.

Target phrase: **Main engine Iso 2.0 visual stabilization pass: make normal generated gameplay look coherent.**

## Current state

Phase D feature backports are implemented and pushed:

- D.6 WaterFamily port
- D.7 seamless terrain tiles
- D.8 biome transition overlays
- D.9 weathering overlays
- D.10 sloped roof geometry

Validated before this handoff:

- `npx tsc --noEmit` clean
- `cd experiment/isometric-2.0; npx tsc --noEmit` clean
- Phase D focused proofs: 9/9 passed
- explicit `tests/rendering/iso2-*.spec.ts`: 26/26 passed
- D.7 seam delta: `3.3` (< 4 target)

However, normal gameplay can look odd because the main generator still emits old v1-style cells while the renderer now draws larger/richer Iso 2.0 structures.

## Core diagnosis

This is no longer mainly a material-port problem. It is an integration/composition problem:

1. Old generator places single-cell `house`/`hut`/`wall`/`roof`/`fence` concepts.
2. Iso 2.0 visuals expect structured assemblies: foundation + walls + roofs + gates.
3. New visual overlays are proof-correct but may be too strong for normal play.
4. Proof scenes are curated; startup chunk is generated and exposes composition mismatch.

## Rules for next agent

- Do **not** add new visual feature families first.
- Stabilize the normal generated game view.
- Prefer small tuning/assembly/wiring changes with screenshots after each slice.
- Keep Phase D proof tests green.
- Do not touch unrelated dirty files already in the working tree.
- Use GitHub issues for task tracking; this file is only a handoff breadcrumb.

## Priority work slices

### S1 — Startup visual smoke proof

Create a focused rendering test/screenshot for the real startup chunk.

Suggested file:

- `tests/rendering/iso2-main-game-visual-smoke.spec.ts`
- screenshot `tests/screenshots/iso2-main-game-visual-smoke.png`

Acceptance:

- loads `/?test=1`
- waits for `window.__gameDebug.state`
- captures normal generated view without manually replacing the whole chunk
- asserts basic canvas/nonblank state only
- human-view screenshot decides visual sanity

Purpose: one canonical “does gameplay look coherent?” screenshot.

### S2 — Turn roofs into assembly-only visuals

Problem: standalone roof cells look like random shards/ramps.

Likely files:

- `src/config/assets.config.ts`
- `src/engine/iso2-assemblies.ts`
- `src/engine/world/ObstacleSolver.ts`
- `src/engine/world/Populator.ts`
- `src/rendering/nano-tile-defs.ts`

Approach:

- Do not let random terrain/obstacle placement emit roof tile types directly.
- Roof nanos should appear only when stamping hut/house/cottage assemblies.
- If a roof asset key exists only for tests, keep it test-only via runtime test defs.

Acceptance:

- startup visual smoke has no isolated roof shards
- D.4/D.10 tests still pass because they inject roof test defs

### S3 — Reduce overlay aggressiveness for normal gameplay

Problem: D.8/D.9 may be visually too noisy in real gameplay.

Likely files:

- `src/config/biomes.config.ts`
- `src/rendering/biome-transition-overlays.ts`
- `src/rendering/nano-weathering.ts`
- `src/rendering/nano-tile-defs.ts`

Initial tuning suggestions:

- Lower `BIOME_TRANSITION_RULES[*].maxAlpha` by ~30-50% for normal play.
- Lower default wall `WALL_WEATHERING_OVERLAYS` opacity/intensity.
- Keep proof tests adjusted to assert contract, not exact heavy visibility.

Acceptance:

- startup visual smoke looks less dirty/noisy
- D.8/D.9 proofs still show feature presence

### S4 — Prefer Iso 2.0 assemblies for houses/huts/shops

Problem: `house`, `hut`, and `shop` currently map to single wall-ish tile visuals.

Likely files:

- `src/engine/iso2-assemblies.ts`
- `src/engine/world/ObstacleSolver.ts`
- `src/engine/world/Populator.ts`
- `src/config/assets.config.ts`
- `src/rendering/nano-tile-defs.ts`

Approach:

- Find where `house`/`hut`/`shop` are placed.
- Replace single-cell placement with small assembly stamp where space allows.
- Use fallback single-cell only if assembly cannot fit.
- Assemblies should include base/foundation/walls/roof as a coherent unit.

Acceptance:

- startup smoke shows intentional cottages/structures, not isolated walls/roofs
- playability validation remains green

### S5 — Density/scale pass

Problem: Iso 2.0 objects are bigger and visually denser than v1 emoji/tile assumptions.

Likely files:

- `src/config/biomes.config.ts`
- `src/config/assets.config.ts`
- `src/engine/world/TerrainBuilder.ts`
- `src/engine/world/Populator.ts`
- `src/engine/world/ObstacleSolver.ts`

Approach:

- Reduce structure/wall/fence density in early biomes.
- Keep meadow start readable and open.
- Push heavy structures to castle/cave biomes.

Acceptance:

- player has readable paths in startup view
- no wall clutter around spawn
- world-gen/playability tests remain green

## Validation after each slice

Minimum:

```powershell
npx tsc --noEmit
npx playwright test tests/rendering/iso2-main-game-visual-smoke.spec.ts --reporter=line
```

After renderer/tile changes:

```powershell
npx playwright test tests/rendering/iso2-*.spec.ts --reporter=line
```

Before final PR update:

```powershell
cd experiment/isometric-2.0
npx tsc --noEmit
cd ..\..
npx tsc --noEmit
npx playwright test tests/rendering/iso2-*.spec.ts --reporter=line
npx playwright test tests/world-gen/ --reporter=line
```

## Known unrelated dirty state

At handoff time, working tree still contains unrelated pre-existing dirty/deleted files including agent config docs, many non-Iso screenshots, tools/refactor edits, local menu screenshots, and terminal/memory files. Do not commit those unless explicitly asked.

## First concrete next action

Create S1 visual smoke test and screenshot, then inspect it. Do not tune anything until that baseline exists.
