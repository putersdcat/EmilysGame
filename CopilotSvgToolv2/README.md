# Copilot SVG Tool

A lightweight local MCP server that adds one focused tool for GitHub Copilot Chat in VS Code:

- `render_svg_preview`: render SVG markup to a PNG preview and return compact metadata.
- `render_svg_animation_preview`: sample animated SVG timelines and return a storyboard and/or frames.

This project is purpose-built for speed and minimal surface area.

## Prerequisites

- Node.js 20+
- VS Code 1.106+
- GitHub Copilot access in VS Code

## Install

From `CopilotSvgToolv2`:

```powershell
npm install
npm run build
```

## Configure VS Code MCP

This repo includes `.vscode/mcp.json` configured for workspace use.

If your VS Code workspace root is the game repo (`EmilysGame`), use the root-level `.vscode/mcp.json` so the server path resolves to `CopilotSvgToolv2/dist/index.js`.

```json
{
  "servers": {
    "svgRenderer": {
      "type": "stdio",
      "command": "node",
      "args": [
        "${workspaceFolder}/CopilotSvgToolv2/dist/index.js"
      ]
    }
  }
}
```

After build:
1. Open Command Palette.
2. Run **MCP: List Servers**.
3. Start `svgRenderer` if not already started.
4. In Copilot Chat Agent mode, enable the tool from the Tools picker.

### Troubleshooting: "svgRenderer keeps crashing"

Most often this is a path mismatch, not an idle-time runtime failure.

- If workspace root is `EmilysGame`, the MCP server path **must** include `CopilotSvgToolv2/dist/index.js`.
- If workspace root is `CopilotSvgToolv2`, use `dist/index.js`.

A wrong path causes the process to exit immediately and VS Code repeatedly reports server crashes/restarts.

## Optional custom agent integration

This repo includes `.github/agents/svg-renderer.agent.md`.

Select **SVG Renderer** from the agent dropdown in Copilot Chat to auto-scope tool access to `svgRenderer/*`.

## Tool contract

### Input

- `svg` (string, required): full SVG markup.
- `size` (int, optional, 16-1024): target width in px (default 128).
- `background` (string, optional): background color.

Optional (v2):

- `response` (string enum): `image` | `metadata` | `both` | `json`
  - `image` (default): returns an MCP `image` content block plus a small JSON metadata text block.
  - `metadata`: returns only metadata (no image payload).
  - `both`: same as `image` (explicit).
  - `json`: legacy JSON output including base64/dataUri.
- `includePngBase64` (boolean): include `pngBase64` in structuredContent (large).
- `includeDataUri` (boolean): include `dataUri` in structuredContent (large).
- `writePngToDisk` (boolean): writes PNG to a temp file and returns `pngFilePath`.

### Output

Default output (`response=image`):

- An MCP `image` content block with the PNG payload.
- A small JSON metadata text block.
- `structuredContent` contains only compact metadata unless base64/dataUri is explicitly requested.

Legacy output (`response=json`) returns the original JSON object with:

- `mediaType`: `image/png`
- `pngBase64`: raw base64 PNG
- `dataUri`: `data:image/png;base64,...`
- `width`, `height`
- `bytes`
- `warnings` (array)

## Run locally

Development mode:

```powershell
npm run dev
```

Production mode:

```powershell
npm run build
npm run start
```

## Test

Run smoke test:

```powershell
npm test
```

## Security and limits

- SVG input length capped at 100,000 chars.
- Width (`size`) clamped between 16 and 1024.
- No network fetches are performed by this server.
- Animated SVG elements are detected and flagged in `render_svg_preview`; preview output is static.

## Animated SVG previews

Use `render_svg_animation_preview` when you need to validate moving/animated SVG.

### Requirements

- This tool uses Playwright + headless Chromium.
- After installing dependencies, you may need:

```powershell
npx playwright install chromium
```

### What you get

- **Storyboard** PNG (contact sheet) for quick glance comparison across time.
- Optional **per-frame** PNGs.
- Compact timeline metadata: `timesMs`, `durationMs`, `frameCount`, and warnings.
