# AiTools — MCP SVG Renderer for Iso 2.0

MCP server providing `render_svg_isometric` and `render_svg_isometric_strip` tools for rendering SVG markup to PNG with optional isometric diamond transform.

## Quick Start

```bash
cd experiment/isometric-2.0/AiTools
npm install
npm run build           # Compile to dist/
npm run dev             # Run via tsx (dev mode)
```

The server runs via **stdio** (MCP protocol), not HTTP. VS Code discovers it automatically through `.vscode/mcp.json`.

## VS Code Integration

Already configured in `.vscode/mcp.json`:
```jsonc
"isoSvgRenderer": {
  "type": "stdio",
  "command": "node",
  "args": ["${workspaceFolder}/experiment/isometric-2.0/AiTools/dist/index.js"]
}
```

Tools appear in the GameMan agent as:
- `isoSvgRenderer/render_svg_isometric`
- `isoSvgRenderer/render_svg_isometric_strip`

## Tools

### `render_svg_isometric`

Render SVG markup to a PNG preview image.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `svg` | string | ✅ | Full SVG markup (128×128 viewBox recommended) |
| `mode` | `"flat"` \| `"isometric"` | | `flat` = 128×128, `isometric` = 256×128 diamond. Default: `flat` |
| `width` | number | | Override output width |
| `height` | number | | Override output height |
| `background` | string | | CSS background color |
| `writePngBase64` | boolean | | Include raw base64 in metadata |

**Returns:** MCP image content block (visual preview) + JSON metadata `{width, height, mode, renderTimeMs, bytes}`.

### `render_svg_isometric_strip`

Render animated/multi-frame SVG to a horizontal sprite strip.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `svg` | string | ✅ | Full SVG markup |
| `frameCount` | number | | Frames to extract (1–32). Default: 4 |
| `frameDurationMs` | number | | Duration per frame in ms. Default: 250 |
| `mode` | `"flat"` \| `"isometric"` | | Render mode. Default: `flat` |

**Returns:** MCP image content block (strip) + JSON metadata `{frameCount, frameWidth, frameHeight, frameDurationMs, mode}`.

## Isometric Transform

In `isometric` mode, the SVG content is:
1. Placed inside a 128×128 inner viewport
2. Transformed with `matrix(1, 0.5, -1, 0.5, 128, 0)` — the same isometric projection as the game engine
3. Diamond-clipped to a 256×128 isometric tile shape

This matches exactly how the Iso 2.0 renderer displays tiles in-game.

## CLI (Manual Testing)

```bash
# Flat render
npx tsx cli.ts --svg '<svg>...</svg>' --output tile.png

# Isometric diamond render
npx tsx cli.ts --file test-assets/grass-sample.svg --mode isometric --output grass-iso.png

# Animated strip
npx tsx cli.ts --file input.svg --animated --frames 8 --duration 100 --output strip.png
```

## Test Assets

| File | Description |
|------|-------------|
| `grass-sample.svg` | Simple grass tile with dots and line detail |
| `wall-straight-h.svg` | Horizontal wall section with mortar lines |
| `river-straight-v.svg` | Vertical river with bank tiles and flow |

## Architecture

```
AiTools/
├── index.ts              ← MCP stdio server (entry point)
├── svg-renderer-tool.ts  ← Core render logic (resvg-js)
├── cli.ts                ← CLI for manual testing
├── package.json
├── tsconfig.json
├── dist/                 ← Compiled JS (npm run build)
├── test-assets/          ← Sample SVG tiles
└── README.md
```
