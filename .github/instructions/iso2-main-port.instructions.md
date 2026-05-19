---
description: "Use when porting experiment/isometric-2.0 nano tiles, materials, assemblies, or renderer behavior into the main Emily's Game engine."
applyTo: "{src/iso2-*.ts,src/nano-tile*.ts,src/render.ts,src/terrain-cache.ts,src/tiles.ts,src/config/tiles.config.ts,src/config/assets.config.ts,tests/rendering/iso2-*.spec.ts}"
---

# Iso 2.0 Main Engine Port Instructions

## Integration Discipline

- Treat `experiment/isometric-2.0/src/` as the source of truth until the main game has feature parity.
- Port in vertical slices, not random helpers:
  1. shared constants/types
  2. material factories
  3. nano definitions and solver metadata
  4. terrain/cache bake path
  5. runtime render path
  6. collision/walkability
  7. tests and screenshots
- Keep the experiment compiling while porting. If a behavior differs in the main engine, document the adapter boundary in code comments near the adapter.

## Files to Compare First

- Experiment source:
  - `experiment/isometric-2.0/src/types.ts`
  - `experiment/isometric-2.0/src/solver.ts`
  - `experiment/isometric-2.0/src/nano-tile.ts`
  - `experiment/isometric-2.0/src/textures/**`
  - `experiment/isometric-2.0/src/assemblies.ts`
- Main engine port targets:
  - `src/iso2-materials.ts`
  - `src/iso2-assemblies.ts`
  - `src/nano-tile-defs.ts`
  - `src/nano-tile-svgs.ts`
  - `src/nano-tile.ts`
  - `src/terrain-cache.ts`
  - `src/render.ts`
  - `src/tiles.ts`

## Validation Requirements

- Before port changes: run the Iso 2.0 experiment type-check to verify the source branch is healthy.
- After main-engine changes: run main TypeScript and the focused Iso 2.0 rendering tests before wider Playwright runs.
- Keep visual checkpoints paired with tests when possible; screenshot tests without a source-of-truth checkpoint are easy to misread.

## Current Breadcrumb

- Tracking issue: `#245`.
- Snapshot commit containing the broad pending port/factory state: `13ade67`.
- Do not continue the main-engine port until the texture-factory contracts and exact walkability APIs are understood; previous context was too narrow and caused fragile partial wiring.
