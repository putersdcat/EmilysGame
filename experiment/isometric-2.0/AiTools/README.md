# AiTools — isoSvgRenderer MCP Server for Iso 2.0

MCP stdio server used for **all visual validation** in `experiment/isometric-2.0`.

Current server capabilities: **8 tool calls** for static previews, nano z-pinned checks, assemblies, scene rendering, geometric proof overlays, variation sweeps, sprite strips, and game-engine–generated tile renders.

## Design Contract: Wrapper, Not Renderer

> **This tool is a thin wrapper over the actual Iso 2.0 game engine code. It does not implement its own rendering logic.**

The pipeline is:
```
MCP tool call
  → index.ts          (parse args, call resolveScene / getVariantSvg)
  → scene-registry.ts (imports getVariantSvg from src/solver.ts — real game SVGs)
  → svg-renderer-tool.ts (applies transforms mirrored from src/nano-tile.ts)
  → @resvg/resvg-js   (headless rasteriser, no browser, no Canvas API)
  → PNG buffer → MCP image response
```

### Game source dependencies

| File | What AiTools imports | How |
|---|---|---|
| `src/types.ts` | `ISO_TILE_WIDTH`, `ISO_TILE_HEIGHT`, `MICRO_TILE_SIZE`, `worldToIso()` | Direct import (pure, no Canvas) |
| `src/solver.ts` | `getVariantSvg()`, `woodenFenceSvg()`, `stoneWallSvg()`, `gateSvg()`, etc. | Direct import via `scene-registry.ts` |
| `src/types.ts` | `FeatureVariant`, `FeatureConnections` | Type imports |
| `src/nano-tile.ts` | **Cannot import** (Canvas deps) | Constants and transforms mirrored in `iso-geometry.ts` with explicit sync comments |

### What this means in practice

- SVG textures come from `src/solver.ts` — every tile rendered here uses the same generator the browser uses.
- Tile positions use `ISO_TILE_WIDTH=256`, `ISO_TILE_HEIGHT=128` from `src/types.ts` — same constants, same grid.
- Nano transforms (`matrix(1,0.5,0,1,...)` etc.) are exact SVG equivalents of the Canvas calls in `src/nano-tile.ts`.
- If you change a generator in `src/solver.ts`, rebuild AiTools and restart the MCP server — the tool immediately reflects the new generator.
- **Never add a rendering shortcut here that doesn’t exist in the game engine.** The tool must be a faithful mirror, not a approximation.

## Quick Start

```bash
cd experiment/isometric-2.0/AiTools
npm install
npm run build
npm run dev
npm test
```

The server runs over **stdio** (MCP), not HTTP.

> **Design decision:** The spec originally described an Express HTTP server (`POST /render-svg`). The stdio MCP approach was chosen instead — it integrates directly with VS Code / Copilot Chat with no port management, is more secure, and streams responses natively.

## When You Actually Need to Rebuild

Thanks to the hot-reload relay, **the vast majority of game engine changes require zero rebuild or restart**.

A **rebuild** (`npm run build`) is only required when `index.ts` changes (tool schema additions, relay logic edits). This is rare.

A **restart** (VS Code → MCP panel → restart `isoSvgRenderer`) is only required after a rebuild.

```
Engine source changes (solver.ts, nano-tile.ts, canvas-renderer.ts…)
  → NO action needed → change is live on next MCP call

index.ts schema changes
  → npm run build → MCP server restart → verify with render_game_tile
```

After a rebuild + restart, verify with:
```bash
render_game_tile  kind: stone-wall  variant: straight-h
```

Agents: see full restart protocol in `.github/instructions/isosvgrenderer.instructions.md`.

## Tool Index (8 calls)

### 1) `render_svg_isometric`
General-purpose static renderer.

- Modes: `flat`, `isometric`, `isometric_z_pinned`
- Best for quick single-asset checks
- Supports lightweight loop via `response: "metadata"`

Core params:
- `svg` (required)
- `mode?`
- `width?`, `height?`
- `background?`
- `response?` = `image | metadata | both`

### 2) `render_nano_isometric`
Z-pinned nano validator (standing/sunken/flat behavior).

Core params:
- `svg` (required)
- `zMode?` = `positive | negative | flat`
- `zOffset?`
- `walkable?`, `blendEdges?`, `debug?`
- `includePlayer?` = `[front|behind|left|right]` for occlusion checks

### 3) `render_nano_assembly`
Composes multiple tiles/nanos into one isometric image for overlap/connectivity validation.

Core params:
- `svgChain` (required array of `{ svg, col, row, zMode?, zOffset?, walkable? }`)
- `width?`, `height?`, `background?`, `debug?`

### 4) `render_svg_isometric_strip`
Builds a horizontal strip preview for frame-based/animated asset iteration.

Core params:
- `svg` (required)
- `frameCount?` (1..32)
- `frameDurationMs?` (16..5000)
- `mode?`
- `response?` = `image | metadata | both`

### 5) `render_geo_proof`
Annotated geometric proof renderer for orientation/camera sanity checks.

- Variants: `reference` (canonical labeled proof box), `overlay` (annotate your SVG)
- Useful for TOP/FRONT/CAP face verification and Z-edge interpretation

Core params:
- `variant?`, `svg?`, `title?`
- `width?`, `height?`, `background?`
- `compassRose?`, `axisArrows?`, `faceLabels?`, `coordLabels?`, `boundOutline?`
- `col?`, `row?`

### 6) `render_variation_sweep`
Renders parameter sweeps in a single labeled strip for faster tuning.

Supported `param`:
- `textureRotation`
- `textureScale`
- `zOffset`
- `opacity`

Core params:
- `svg` (required)
- `param` (required)
- `values` (required, 1..8)
- `background?`, `frameSize?`

### 7) `render_iso_scene`

<!-- (existing content unchanged) -->

<!-- Section below added when render_game_tile was introduced -->

### 8) `render_game_tile`
Renders any NanoTileKind using the **actual game engine SVG generators** from `solver.ts`.
Produces isometric 3-face extruded box (walls), Z-pinned billboard (gates/bridges/fences), sunken flat (rivers), or flat overlay (tall-grass).

Core params:
- `kind` (required) — `stone-wall | fence | river | river-bank | tall-grass | gate | troll-bridge | bridge | cathedral-wall | homestead-wall`
- `variant?` — feature variant (straight-h, end-r, cross, etc.)
- `connections?` — overrides connectivity inference
- `zOffset?` — height (positive kinds) or depth (negative)
- `width?`, `height?`, `background?`, `worldCol?`, `worldRow?`

**Key difference from render_svg_isometric:** uses the same geometry and SVG generators as the browser game, so rendering always matches what the player sees.
Renders built-in or custom isometric scenes using game-aligned kind resolution.

Built-in scenes include:
- `wall-h-run`
- `wall-v-run`
- `fence-perimeter`
- `river-crossing`
- `tall-grass-patch`
- `homestead`
- `mixed-biomes`
- `all-nanos`

Core params:
- `sceneName?`
- `entries?` (custom scene)
- `listScenes?` (returns scene list only)
- `width?`, `height?`, `background?`, `debug?`

## Recommended Usage Flow

1. **Single asset pass**: `render_svg_isometric` or `render_nano_isometric`
2. **Orientation pass**: `render_geo_proof`
3. **Context pass**: `render_iso_scene` or `render_nano_assembly`
4. **Animation pass** (if needed): `render_svg_isometric_strip`
5. **Parameter tuning** (if needed): `render_variation_sweep`

## Testing

```bash
npm test
```

Unit coverage is in `renderer.test.ts`; additional visual verification is done through MCP calls during asset iteration.

## Architecture

```
AiTools/
├── index.ts              # MCP schema relay only (15 kb) — spawns render-worker per call
├── render-worker.ts      # ★ Hot-reload worker — all render dispatch, imports game TS via tsx
├── canvas-renderer.ts    # Canvas2D render pipeline — imports src/nano-tile.ts directly
├── game-tile-renderer.ts # SVG game-engine bridge — imports src/solver.ts directly
├── svg-renderer-tool.ts  # SVG-only render modes (flat/iso/z-pinned) via resvg
├── proof-renderer.ts     # geo-proof + variation sweep renderers via resvg
├── scene-registry.ts     # named scene descriptors and kind resolution
├── iso-geometry.ts       # mirrored constants for SVG-path tools (resvg, no Canvas)
├── cli.ts                # local CLI helper
├── test-relay.mjs        # ★ quick smoke-test: node test-relay.mjs (no MCP needed)
├── renderer.test.ts      # unit tests
├── package.json
├── tsconfig.json
├── dist/                 # compiled index.js (relay only)
├── test-assets/
└── README.md
```

★ = new in hot-reload architecture (commit 64a1536)

<!-- TODO: DOC - add copy/paste MCP payload snippets for each tool -->