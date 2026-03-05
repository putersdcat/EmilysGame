---
description: "Use when doing visual work in Iso 2.0 experiment. Defines required validation flow with isoSvgRenderer MCP tools."
applyTo: "experiment/isometric-2.0/{src/**,tests/**,AiTools/**}"
---
# isoSvgRenderer Validation Rules (Iso 2.0)

## Core Design Contract — Read This First

The AiTools MCP server is **not** a standalone renderer. It is a thin wrapper that drives the
**actual game engine code** in `experiment/isometric-2.0/src/`. This is intentional and critical:

> If a tile looks correct in this tool, it will look correct in the browser game.  
> If it looks wrong here, it is wrong in the game.

### What the tool imports from the game engine

| Game source file | What is imported | How |
|---|---|---|
| `src/types.ts` | `ISO_TILE_WIDTH=256`, `ISO_TILE_HEIGHT=128`, `MICRO_TILE_SIZE=128`, `worldToIso()` | Direct import — pure constants, no Canvas dep |
| `src/solver.ts` | `getVariantSvg()`, `woodenFenceSvg()`, `stoneWallSvg()`, `gateSvg()`, … | Direct import via `scene-registry.ts` — real game SVG generators |
| `src/types.ts` | `FeatureVariant`, `FeatureConnections` | Type imports |

### What cannot be imported (Canvas API dependencies)

`src/nano-tile.ts`, `src/tile.ts`, `src/chunk.ts`, `src/renderer.ts` all require `CanvasRenderingContext2D`.
These **cannot** run in Node/resvg context. Instead `AiTools/iso-geometry.ts` mirrors their constants
with explicit sync comments, and transforms in `svg-renderer-tool.ts` are transcribed from Canvas calls
to equivalent SVG `matrix(a,b,c,d,e,f)` attributes, each pointing back to the source function.

### Rules for contributors

- **Never invent a rendering constant** in AiTools that has no corresponding value in `src/`.
- **Never duplicate an SVG generator** — if the game uses `getVariantSvg()`, the tool must too.
- New nano kind in `src/solver.ts`? Wire it in `scene-registry.ts` — do not reimplement the SVG.
- Constant changes in `src/nano-tile.ts`? Update the MIRROR value + comment in `iso-geometry.ts`.
- Transform matrix changes in `src/nano-tile.ts`? Update the matching `matrix(…)` in `wrapIsometricAssembly()`.

---

## Scope
These rules apply to all **visual** work in `experiment/isometric-2.0`:
- tile SVG authoring
- nano tile layering/z-offset behavior
- isometric transforms
- scene composition and assembly connectivity
- visual regression checks for asset changes

## Mandatory Validation Policy
For Iso 2.0 branch work, **isoSvgRenderer is the required validation path**.

Do this before marking visual work complete:
1. Validate the changed asset/scene with one or more isoSvgRenderer MCP tools.
2. Verify both **geometry correctness** and **in-context appearance**.
3. Include a concise note in PR/issue comment indicating which tool(s) were used.

Do **not** skip renderer validation for visual changes.

## Current MCP Tool Surface (8 calls)

1. **`render_game_tile`** — fastest post-restart sanity check. Renders a single kind+variant using the actual game engine generators (calls `getVariantSvg` from `src/solver.ts`). Always call this first after a bundle restart.

2. **`render_svg_isometric`** — primary static preview (`flat`, `isometric`, `isometric_z_pinned`). Use `response: "metadata"` during fast iteration.

3. **`render_nano_isometric`** — z-pinned nano validation with `zMode`, `zOffset`, walkability/debug overlays. Use `includePlayer` for occlusion checks.

4. **`render_nano_assembly`** — multi-tile chain/assembly composition and overlap checks.

5. **`render_svg_isometric_strip`** — multi-frame/animated strip preview. Keep `frameCount` low (2–4) during iteration.

6. **`render_geo_proof`** — face-orientation proof overlay (TOP/FRONT/CAP colour coding + axis arrows). Use to verify camera direction and z-height.

7. **`render_variation_sweep`** — one-shot parameter sweeps (`textureRotation`, `textureScale`, `zOffset`, `opacity`). Use instead of repeated manual reruns.

8. **`render_iso_scene`** — named/custom multi-tile scene rendering. Supports `entries[]`, `players[]`, `outputPath`, `variant`, `debug`. Use `listScenes: true` to discover built-in scenes.

## MCP Server Restart Protocol

After **any** `npm run build` in `AiTools/`, the MCP server process must be restarted for VS Code to pick up the new bundle. **Never stop or pause the session waiting for this.**

Correct procedure:
1. Finish the build (`npm run build` exits 0).
2. Post a message to the user: *"Build done — please restart the isoSvgRenderer MCP server (VS Code → MCP panel → restart, or reload window). I'll wait."*
3. `run_in_terminal` a `Start-Sleep -Seconds 15` (or longer if the user needs more time).
4. After the sleep, fire a cheap validation call (e.g. `render_game_tile stone-wall straight-h`) to confirm the new bundle is live.
5. If the call fails or returns stale output, post *"Still not seeing new bundle — please confirm restart and I'll retry."* then sleep again.
6. Continue the session once validated.

Do **not** ask permission to continue after the sleep — just ping with the validation result and keep going.

## Fast Iteration Defaults
- Prefer `response: "metadata"` where supported to reduce payload size.
- Keep `frameCount` low (2–4) during early animation iteration.
- Use `render_variation_sweep` for single-parameter tuning.
- **`render_game_tile` is the fastest post-restart confirmation** — always start here.

## Suggested Validation Sequence
1. **Post-restart check**: `render_game_tile stone-wall straight-h`
2. **Single asset sanity**: `render_game_tile` or `render_nano_isometric`
3. **Geometry/orientation proof**: `render_geo_proof`
4. **Context check**: `render_iso_scene` or `render_nano_assembly`
5. **Animation check (if applicable)**: `render_svg_isometric_strip`

## Completion Checklist (Visual Tasks)
- [ ] Asset renders without tool errors.
- [ ] Iso orientation and Z behaviour verified.
- [ ] Assembly/scene context validated.
- [ ] Any animation frames validated (if relevant).
- [ ] Issue/PR note includes renderer tool(s) used.