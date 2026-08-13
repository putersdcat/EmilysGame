> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# Iso 2.0 Main Engine Integration Guide

Tracking issue: [#245](https://github.com/putersdcat/EmilysGame/issues/245)

This guide captures the current contract for moving the standalone `experiment/isometric-2.0` nano-tile work back into the main Emily's Game engine without losing visual fidelity or breaking the experiment source.

## Current State

- Pending work before this session was committed as `13ade67` (`chore: snapshot iso2 texture factory and integration work`).
- The experiment now type-checks cleanly with `npx tsc --noEmit` from `experiment/isometric-2.0`.
- `FenceFamily.fenceStyleForTile(...)` is the expected fence style resolver for canvas/procedural rendering.
- `WaterFamily.svgWater(...)` is the preferred river/pond material source for solved river nanos.
- `solver.ts` exports the geometry/runtime helpers that downstream code already imports:
  - `wallBounds(...)`
  - `gateSvg(...)`
  - `pointHitsWallFootprint(...)`
  - `isPointWalkableInTile(...)`

## Port Order

1. **Constants and coordinate contracts**
   - Port only after comparing `MICRO_TILE_SIZE`, `ISO_TILE_WIDTH`, `ISO_TILE_HEIGHT`, `NANO_GRID`, and world/chunk terminology.
   - The experiment currently uses 144 px micro tiles so the 3×3 nano grid resolves to clean 48 px cells.

2. **Material factories**
   - Move or adapt `experiment/isometric-2.0/src/textures/**` before porting renderer behavior that consumes those factories.
   - Keep barrel exports aligned; missing barrel exports caused prior context failures.

3. **Solver metadata and exact walkability**
   - Port connection solving and exact point-in-footprint logic together.
   - Coarse tile walkability alone is insufficient for walls/fences because players need to slide along partial-tile footprints.

4. **Canvas nano rendering**
   - Port `drawNegativeNano`, procedural fence rendering, and extruded wall face-slice rendering as a single reviewed slice.
   - Avoid reimplementing the same geometry in multiple places without an explicit adapter.

5. **Assemblies**
   - Port `homestead`, roof, fence, bridge, and cathedral assemblies after the nano renderer supports their material slices.

6. **Tests and checkpoints**
   - Update focused rendering tests first, then run wider Playwright coverage.
   - Keep checkpoint PNGs in `experiment/isometric-2.0/ProgressEvaluations/` for experiment visuals and main-game screenshots in the existing main test screenshot locations.

## Current Visual Review

Saved in this session:

- `experiment/isometric-2.0/ProgressEvaluations/water-factory-river-crossing-review-iter01.png`
- `experiment/isometric-2.0/ProgressEvaluations/fence-style-rings-factory-review-iter02.png`
- `experiment/isometric-2.0/ProgressEvaluations/factory-canvas-review-fence-water-iter01.png`

Observations:

- Fence material families are visibly distinct in the canvas path after routing procedural fence drawing through `FenceStyle` palettes and dimensions.
- The water factory is active and readable, but hard seams at some tile joins and corner/bank continuity need a dedicated water geometry pass.
- The connected MCP server may need a rebuild/restart to expose newly added scene registry entries; the local hot-reload worker already sees `fence-style-rings`.

## Minimum Validation Before Continuing Main Port

- Experiment: `npx tsc --noEmit` from `experiment/isometric-2.0`.
- Renderer smoke: `node test-relay.mjs` from `experiment/isometric-2.0/AiTools`.
- Main engine: run focused `tests/rendering/iso2-*.spec.ts` after any port change, then main `npx tsc --noEmit`.
