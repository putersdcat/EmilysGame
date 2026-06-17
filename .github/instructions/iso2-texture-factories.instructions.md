---
description: "Use when editing Iso 2.0 procedural texture/material factories. Keeps factories canonical, renderer-safe, and portable to the main game."
applyTo: "experiment/isometric-2.0/src/textures/**"
---

# Iso 2.0 Texture Factory Instructions

## Source-of-Truth Rules

- Texture factory modules in `experiment/isometric-2.0/src/textures/` are
  canonical material sources for Iso 2.0 visuals.
- Export new factory families through
  `experiment/isometric-2.0/src/textures/index.ts` immediately.
- Keep generated SVGs deterministic from explicit inputs: style id, world
  coordinate, variant, frame, and seed.
- Do not hide renderer behavior in tool-only code. If a material must render
  in-game, expose it from the experiment's `src/` and consume it from the
  main game's `src/asset-pipeline/iso2-materials.ts` (renamed from
  `src/iso2-materials.ts` during the B-series decomposition).

## Material Contracts

- Wall/roof material families should expose face-aware slices when used by
  extruded nanos:
  - `svg()` fallback/base slice
  - `svgTop()` for XY/top face
  - `svgTopV()` when top texture orientation must differ for V-axis wall runs
  - `svgSouth()` for XZ/south face
  - `svgEast()` for YZ/east face
  - `svgEnd()` when exposed end caps need a distinct material
- Water materials should keep stable connected-run colors across tiles.
  Variation belongs in banks, wetness, ripples, pebbles, reeds, and glints —
  not random per-tile base water hue.
- Fence materials should resolve via
  `FenceFamily.fenceStyleForTile(style, col, row, variant)` so canvas and
  SVG/tool paths can share the same construction palette.

## Visual Validation

- Validate material changes with Iso 2.0 renderer checkpoints before claiming completion.
- Prefer:
  - water: `render_iso_scene` / local `render-worker.ts render_nano_scene` with
    river corners, straight runs, and bridges
  - fence: `fence-style-rings` and a small canvas scene with mixed `fenceStyle`
    values
  - wall/roof: canvas `render_nano_scene` because face slices are consumed by
    `drawExtrudedNano()`
- Save accepted checkpoints in
  `experiment/isometric-2.0/ProgressEvaluations/` using a descriptive
  versioned name.

## Known Current Context

- Tracking issue: `#245`.
- Recent stable checkpoints:
  - `water-factory-river-crossing-review-iter01.png`
  - `fence-style-rings-factory-review-iter02.png`
  - `factory-canvas-review-fence-water-iter01.png`
- Current visual status: fence style families are distinct in canvas; water
  is readable but corner/bank seams still need a dedicated geometry pass.

## Cross-References

- `.github/instructions/isosvgrenderer.instructions.md` — visual validation protocol
- `.github/instructions/iso2-main-port.instructions.md` — porting contract to main engine
- `experiment/isometric-2.0/AiTools/` — isoSvgRenderer MCP server