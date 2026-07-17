---
description: "Use when doing visual work with isoSvgRenderer MCP (experiment AiTools and product paint)."
applyTo: "{experiment/isometric-2.0/{src/**,tests/**,AiTools/**},src/rendering/nano-tile*.ts,src/rendering/terrain-cache.ts}"
---
# isoSvgRenderer Validation Rules

**Product law:** Iso2 is **paint only** ([AGENTS.md](../../AGENTS.md)). Do not invent nano kinds or FOV thrash here.

## Core Design Contract — Read This First

The AiTools MCP server is **not** a standalone renderer. It is a thin wrapper that drives
**game engine TypeScript** (historically under `experiment/isometric-2.0/src/`; product paint
also lives under `src/rendering/`). Intent:

> If a tile looks correct in this tool, it will look correct in the browser game.  
> If it looks wrong here, it is wrong in the game.

### Hot-Reload Relay Architecture

`index.ts` is a **15 kb relay** — tool schemas only. Every MCP call spawns `render-worker.ts` via
`execFileSync` through **tsx** (TypeScript runner, no compilation). `render-worker.ts` imports the
game engine source files directly.

```
MCP call → index.ts (relay) → execFileSync(node tsx render-worker.ts <tool>)
    render-worker.ts imports (live, via tsx):
      canvas-renderer.ts → src/nano-tile.ts ← actual draw functions
      game-tile-renderer.ts → src/solver.ts  ← actual SVG generators
      scene-registry.ts   → src/types.ts    ← same constants as browser
```

### What the tool imports from the game engine

| Game source file | What is imported | Path |
|---|---|---|
| `src/types.ts` | `ISO_TILE_WIDTH=256`, `ISO_TILE_HEIGHT=128`, `MICRO_TILE_SIZE=128`, `worldToIso()` | Direct import (pure, no Canvas) |
| `src/solver.ts` | `getVariantSvg()`, `woodenFenceSvg()`, `stoneWallSvg()`, `gateSvg()`, … | Via `game-tile-renderer.ts` + `scene-registry.ts` |
| `src/nano-tile.ts` | `drawNanoStack()`, `drawExtrudedNano()`, `isVerticalWall()`, etc. | Via `canvas-renderer.ts` — tsx resolves Canvas deps at runtime via `@napi-rs/canvas` |
| `src/types.ts` | `FeatureVariant`, `FeatureConnections`, `NanoTile`, `NanoTileKind` | Type imports |

> **SVG-only tools** (`render_svg_isometric`, `render_geo_proof`, `render_variation_sweep`,
> `render_svg_isometric_strip`) still use `svg-renderer-tool.ts` → `@resvg/resvg-js`. They do
> **not** use Canvas. `iso-geometry.ts` mirrors exist for these SVG paths only.

### Rules for contributors

- **Never invent a rendering constant** in AiTools that has no corresponding value in `src/`.
- **Never duplicate an SVG generator** — if the game uses `getVariantSvg()`, the tool must too.
- New nano kind in `src/solver.ts`? Wire it in `scene-registry.ts` — do not reimplement the SVG.
- Constant changes in `src/nano-tile.ts`? Update BOTH: the MIRROR in `iso-geometry.ts` (SVG tools) AND the live import path in `canvas-renderer.ts` (Canvas tools).
- Transform matrix changes in `src/nano-tile.ts`? Update the matching `matrix(…)` in `wrapIsometricAssembly()` (SVG path) AND verify Canvas path still renders correctly.

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

## When Rebuild / Restart Is Actually Needed

**Hot-reload means most game engine changes require zero action.** Use this decision tree:

| What changed | Action needed |
|---|---|
| `src/solver.ts`, `src/nano-tile.ts`, `src/types.ts` | **Nothing** — live on next MCP call |
| `canvas-renderer.ts`, `game-tile-renderer.ts`, `scene-registry.ts`, `svg-renderer-tool.ts`, `proof-renderer.ts` | **Nothing** — live on next MCP call |
| `index.ts` (schema/relay logic) | `npm run build` + MCP restart |
| New `npm install` dependency | `npm install` + `npm run build` + MCP restart |

### Quick local verification (no MCP needed)

Before asking for a restart, verify your change with the smoke-test relay:
```powershell
cd experiment/isometric-2.0/AiTools
node test-relay.mjs
# Renders stone-wall straight-h — prints bytes + ms. If it works, MCP will work.
```

For a custom tile check:
```powershell
cd experiment/isometric-2.0/AiTools
echo '{"kind":"stone-wall","variant":"corner-br","width":320,"height":320}' |
  node node_modules/tsx/dist/cli.mjs render-worker.ts render_nano_tile
# Output: {"ok":true,"content":[{"type":"image","data":"...","mimeType":"image/png"}],...}
```

### MCP Restart Protocol (needed only after `index.ts` rebuild)

**Never stop or pause the session waiting for restart.**

1. Finish the build (`npm run build` exits 0).
2. Alert user: play the beep tune **and** post *“Build done — please restart the isoSvgRenderer MCP server (VS Code → MCP panel → restart). I’ll wait.”*
3. `run_in_terminal` a `Start-Sleep -Seconds 15` (or more if needed).
4. After sleep, fire `render_game_tile stone-wall straight-h` to confirm new bundle.
5. If stale, post *“Still not seeing new bundle — please confirm restart.”* then sleep again.
6. Continue once validated — do not ask permission.

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

## Cross-References

- `.github/instructions/architecture.instructions.md` — god-file prevention (applies here too — keep AiTools files focused)
- `.github/instructions/iso2-texture-factories.instructions.md` — material factory source-of-truth
- `.github/instructions/iso2-main-port.instructions.md` — porting contract to main engine