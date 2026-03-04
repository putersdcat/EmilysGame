# AiTools — isoSvgRenderer MCP Server for Iso 2.0

MCP stdio server used for **all visual validation** in `experiment/isometric-2.0`.

Current server capabilities: **7 tool calls** for static previews, nano z-pinned checks, assemblies, scene rendering, geometric proof overlays, variation sweeps, and sprite strips.

## Quick Start

```bash
cd experiment/isometric-2.0/AiTools
npm install
npm run build
npm run dev
npm test
```

The server runs over **stdio** (MCP), not HTTP.

## VS Code MCP wiring

Configured in `.vscode/mcp.json`:

```jsonc
"isoSvgRenderer": {
  "type": "stdio",
  "command": "node",
  "args": ["${workspaceFolder}/experiment/isometric-2.0/AiTools/dist/index.js"]
}
```

## Validation Policy (Iso 2.0)

For visual work in the Iso 2.0 branch, this toolchain is required before marking work complete:
- verify changed asset geometry
- verify in-context scene appearance
- verify z/orientation correctness for nanos

Use the new repo instruction file:  
`.github/instructions/isosvgrenderer.instructions.md`

## Tool Index (7 calls)

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
├── index.ts              # MCP server + tool registration (7 tools)
├── svg-renderer-tool.ts  # core render modes (flat/iso/z-pinned/assembly)
├── proof-renderer.ts     # geo-proof + variation sweep renderers
├── scene-registry.ts     # named scene descriptors and kind resolution
├── cli.ts                # local CLI helper
├── renderer.test.ts      # unit tests
├── package.json
├── tsconfig.json
├── dist/
├── test-assets/
└── README.md
```

<!-- TODO: DOC - add copy/paste MCP payload snippets for each tool -->