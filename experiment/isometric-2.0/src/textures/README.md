# Textures

Source-of-truth procedural SVG material modules for Iso 2.0 structural Nano tiles.

## Current direction: material families

Do not add one-off wall texture primitives when a palette or render-time overlay can express the variation. Prefer reusable material factories:

- `brick-family.ts`
  - 48×48 modular running-bond brick geometry
  - palettes: `red-clinker`, `stone-brick`, `mud-brick`, `sandstone-brick`
- `ancient-stone-family.ts`
  - periodic 3D Voronoi/rubble-stone volume
  - palettes: `ancient-stone`, `limestone`, `dark-cathedral-stone`
- `homestead-family.ts`
  - rural dwelling wall-material family for huts / cottages / homesteads
  - palettes: `timber-frame-wall`, `plaster-whitewash-wall`, `rough-wood-plank-wall`
  - companion foundation palette: `cottage-stone-foundation` (via `ancient-stone-family.ts`)
- `roof-family.ts`
  - clipped roof nano primitive textures for sloped cottage roofs
  - primitives: `roof-slope-left`, `roof-slope-right`, `roof-ridge`
  - first palette: `thatch-roof`

## Face-slice contract

Extruded wall materials should expose the face slices that the Canvas renderer understands:

- `svg(): string` — legacy/default entry point, usually same as top
- `svgTop(): string` — top / XY face
- `svgSouth(edgeCoord?): string` — south/front XZ face when the family needs plane-specific slices
- `svgEast(edgeCoord?): string` — east/right YZ face when the family needs plane-specific slices
- `svgTopV?(): string` — optional V-axis top slice for directional brick materials
- `svgEnd?(edgeCoord?): string` — optional authored end-cap slice for brick/header ends

The renderer consumes these through `render-worker.ts` texture shorthands and forwards them to `nano-tile.ts` as `topFaceTextureSvg`, `southFaceTextureSvg`, `eastFaceTextureSvg`, etc.

## Tiling and backgrounds

Base material slices must remain self-contained and repeatable:

- use solid backgrounds; no transparency through mortar/gaps
- preserve 48×48 modular alignment for brick-family materials
- avoid baking contextual weathering into base repeating textures

## Weathering overlays

Weathering is render-time context, not a baked texture primitive.

Examples:

- muddy lower vertical faces only where a wall touches ground
- moss on damp lower vertical faces or shaded tops
- snow on top faces only
- cracks/edge wear on selected elements

Render-time weathering uses `NanoWeatheringOverlay` via `NanoTile.weatheringOverlays`, so a lower grime band is computed against the actual rendered face height and does **not** repeat every 48px up a tall pillar.

## Roof primitives

Roofs are not wall-face textures. `roof-family.ts` provides SVG source textures
that `nano-tile.ts` clips into custom sloped roof geometry for the roof nano
kinds. This keeps the cottage roof shape engine-backed while allowing material
palettes like thatch/shingle/slate to evolve separately.

## Removed legacy fallback

`stone-stub.ts` was removed. Demo/fallback stone-wall paths now use the factory-backed `StoneBrick` material instead of a separate stub texture path.
