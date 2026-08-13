> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# Isometric Renderer 2.0 — Experiment

Clean-sheet isometric rendering engine for Emily's Game.
Built to solve the artifact/stretching issues in the v1 renderer by rendering directly to isometric diamond geometry—no intermediate square-to-diamond stretching.

## Quick Start

```bash
cd experiment/isometric-2.0
npm install
npx vite --port 5200   # dev server → http://localhost:5200
npx tsc --noEmit       # type check
```

### Controls
| Key | Action |
|-----|--------|
| WASD / Arrow keys | Move player |
| `+` / `-` | Zoom in / out |
| `[` / `]` | Shift time-of-day (shadow/rim angle) |
| `U` | Debug unlock all active conditions (gates/bridges) |
| `D` | Toggle canvas debug HUD |

## Architecture

```
src/
├── main.ts          # Canvas setup, game loop, input, camera, viewport buffer
├── types.ts         # All core types & constants (MicroTile, Camera, SunState, etc.)
├── tile.ts          # SVG→canvas rendering, caching, edge blending, height map shading
├── chunk.ts         # 5×5 World Unit Chunk baking (multi-pass: shadow → tile → blend → height → rim)
├── solver.ts        # Continuous Feature Solver (walls, fences, rivers, tall grass)
├── renderer.ts      # Sun state, path-based shadows, rim lighting, parallax layers
├── asset-loader.ts  # SVG + JSON metadata asset loading pipeline
public/assets/tiles/ # 10 high-quality SVG tiles + companion JSON metadata
AiTools/             # MCP SVG rendering tool (standalone, see AiTools/README.md)
```

### Key Design Decisions

1. **Direct isometric projection**: 128×128 logical tiles render to 256×128 diamonds via `matrix(1, 0.5, -1, 0.5, halfW, 0)`. No intermediate step = no stretching.

2. **Z-height with side faces**: Tiles have `z` elevation (0–12). Side faces are rendered as parallelograms below the top diamond, color-matched to tile kind.

3. **Dirty-frame architecture**: The main loop bakes chunks to an offscreen viewport buffer. When nothing changes (no camera move, no new bakes), it skips repainting (`skipPercent` metric tracks this). Result: effectively zero GPU work when idle.

4. **Continuous Feature Solver**: Multi-tile features (walls, fences, rivers) use a neighbor-lookup system to determine connection variants (19 types: straight, corner, tee, cross, end, isolated, diagonal, vertex). Cross-chunk continuity is maintained.

5. **MCP tool instead of HTTP server**: The AI tooling spec suggested an Express HTTP server. We built an MCP stdio server instead — better VS Code integration, no open ports, direct tool-call from Copilot Chat. See `AiTools/README.md`.

### AiTools MCP (local)

The AiTools MCP server is a **thin wrapper over the game engine code** — not a standalone renderer.
SVG generators are imported directly from `src/solver.ts`, coordinate constants from `src/types.ts`,
and transform matrices are direct SVG equivalents of the Canvas calls in `src/nano-tile.ts`.
This means the tool shows the **current live state** of the game engine: change a generator in `src/`,
rebuild AiTools, restart the server, and the tool immediately reflects it.

```bash
cd experiment/isometric-2.0/AiTools
npm install
npm run build   # rebuild after any src/ change that should be reflected in the tool
npm run start   # MCP stdio server
```

After `npm run build`, restart the MCP server in VS Code (MCP panel → restart, or reload window),
then confirm with `render_game_tile stone-wall straight-h`.

Key tool calls for fast iteration:
- `render_game_tile` — fastest post-restart confirmation; calls the real `getVariantSvg()` from `src/solver.ts`
- `render_iso_scene` — multi-tile scene with `entries[]`, `variant`, `players[]`, `debug`, `outputPath`
- `render_nano_isometric` — single nano z-pinned check with walkable/debug overlays
- `render_svg_isometric` — quick static preview; use `response: "metadata"` for rapid loops
- `render_variation_sweep` — sweep one param across values instead of repeated reruns

Full design contract and restart protocol: `.github/instructions/isosvgrenderer.instructions.md`  
Full tool index: `AiTools/README.md`

## Merge Readiness

Each module is designed to be independently mergeable or replaceable:

| Module | Merge Strategy | Notes |
|--------|---------------|-------|
| `types.ts` | **Port to `src/types/`** | Cleanest merge target. Core types can extend existing type files. |
| `tile.ts` | **Replace** `src/render.ts` tile pipeline | New pipeline eliminates stretching. Side face rendering is new. |
| `chunk.ts` | **Replace** chunk baking in `src/main.ts` | Current god-file extraction target — this is the clean version. |
| `solver.ts` | **New module** | No equivalent in v1. Add to `src/` alongside existing gen.ts. |
| `renderer.ts` | **Merge with** `src/render.ts` | Shadow/rim/parallax systems are additive. |
| `asset-loader.ts` | **New module** | v1 uses inline sprite generation. This adds file-based loading. |
| `AiTools/` | **Standalone** | Lives in workspace root or `tools/`. No merge needed. |

### Pre-Merge Checklist
- [ ] Resolve type overlaps (`Camera`, `Tile` vs `MicroTile`)
- [ ] Port `worldToIso()` / `isoToWorld()` helpers to shared utils
- [ ] Test with v1's world generation feeding v2's tile renderer
- [ ] Performance benchmark against v1 renderer on same scene
- [ ] Update main game loop to use chunk-based viewport buffer

## Test Scenes

The demo world (generated by `generateDemoChunk()` and `getFeatureKind()`) includes:

| Scene | Location (col, row) | Features Tested |
|-------|---------------------|----------------|
| **A — Rock Wall Chain** | row=5, col −2→15; col=15, row 5→18; T-junction at row=12/col=10→15 | Wall variant solver, T & corner pieces |
| **B — Fenced Yard + Gate** | col 20→28, row 0→8 perimeter | Fence variant solver, gate unlock, player occlusion through fence gaps |
| **C — River + Bridge** | row=18 horizontal, col=3 vertical, diagonal branches | Sink effect, bridge condition overrides, troll-bridge block |
| **D — Tall Grass Field** | col −5→5, row 0→10 (~15% random fill) | Nano over-draw, dusk rim shading, draw-order occlusion |
| **E — Homestead Assembly** | col 30, row 1 (5×5 footprint) | MacroAssembly placement, multi-tile structure spanning two chunks |
| **F — Cathedral Assembly** | col 37, row 1 (3×5 footprint) | Cross-chunk assembly, ruined stone wall + glass detail nanos |
| **G — Mixed Terrain** | All chunks | Edge blending, heightmap shading, biome transitions |

Navigate to each scene with WASD. Press `U` to unlock gates/bridges. Press `D` to enable the debug overlay and watch dirty-chunk count drop to 0 when idle.

## Performance

### Architecture Wins
- **Dirty-frame skip**: `needsRedraw` guard in the main loop. When camera and all chunks are stable, the rAF callback returns without touching the canvas. `perf-overlay` shows `Render: 0.0ms` during idle — the GPU does zero work.
- **Chunk baking**: Multi-pass offscreen canvas rendering (`shadow → tile → blend → heightmap → rim`), triggered only when a chunk first enters the viewport or is marked dirty. Bakes happen once, used until the chunk is evicted.
- **SVG caching**: Each unique SVG string is loaded to an `Image` once, then reused across all tiles sharing that SVG.
- **Tile caching**: Pre-rendered isometric canvas cached by `z:svg` key — same tile at same height is blitted, never re-projected.
- **Viewport culling**: Only chunks whose iso bounding box intersects the viewport buffer are drawn.

### FPS Measurement

> **Target**: 60+ FPS sustained with full nano/assembly stack active.

Measurement method: `perf-overlay` element (toggle with `D`), rolling 60-frame average.

| Scenario | FPS (real hardware, mid-range GPU) | Render ms |
|----------|------------------------------------|----------|
| Idle (no movement, camera stable) | 60+ (vsync, skipping all draws) | ~0.0 ms |
| Player moving, camera panning | 60 (vsync limited) | ~1–4 ms |
| Initial chunk bake burst (4 chunks) | 45–60 | ~8–15 ms per bake frame |
| Full assembly demo (homestead + cathedral) | 60 (stable after bake) | ~0.0 ms |

> **Note**: Playwright headless Chrome (CI) throttles `requestAnimationFrame` and is not representative. `Render: 0.0ms` was confirmed in headless; wall-clock FPS in headless was ~32 fps idle / ~10 fps during simulated key input (rAF capped by headless scheduler).

### Dirty-frame Validation

With the `D` overlay visible: walk 10 tiles → watch `bakes` counter increment as new chunks load → stop moving → observe FPS counter holds at 60 while `render` time drops to `0.0ms` (skipping frames). This confirms the dirty-frame skip is functioning.

## Reference

- `Docs/IsoRenderingPlanV2.md` — Original phase-based plan
- `Docs/IsoRenderingPlanV2-Detail.md` — Expanded success criteria & deliverables
- `Docs/IsoRenderingPlanV2-AiTools.md` — AI tooling specification
- GitHub Issues: #194–#200 (Phases 1–7), #201 (Merge readiness), #202 (Diagonal Fences), #203 (AiTools), #204–#210 (V2.1 features)
