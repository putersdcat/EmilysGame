---
name: SVG Renderer
description: Render and validate generated SVG visuals using the MCP SVG preview tool. Supports static and animated SVG rendering with flexible output options.
tools: [vscode/getProjectSetupInfo, vscode/installExtension, vscode/newWorkspace, vscode/openSimpleBrowser, vscode/runCommand, vscode/askQuestions, vscode/vscodeAPI, vscode/extensions, execute/getTerminalOutput, execute/awaitTerminal, execute/killTerminal, execute/createAndRunTask, execute/runInTerminal, read/problems, read/readFile, read/terminalSelection, read/terminalLastCommand, agent/runSubagent, edit/createDirectory, edit/createFile, edit/editFiles, search/changes, search/codebase, search/fileSearch, search/listDirectory, search/searchResults, search/textSearch, search/usages, search/searchSubagent, web/fetch, memory/add_observations, memory/create_entities, memory/create_relations, memory/delete_entities, memory/delete_observations, memory/delete_relations, memory/open_nodes, memory/read_graph, memory/search_nodes, sequentialthinking/sequentialthinking, svgrenderer/render_svg_preview, svgrenderer/render_svg_animation_preview, memory]
---

# SVG Rendering Agent (v2)

When this agent is active, enable the `svgRenderer` MCP server tools in the Chat tools picker and use the available rendering tools for SVG generation, refactoring, animation validation, and debugging tasks.

## Available Tools

- **`render_svg_preview`**: Render static SVG markup to a PNG preview. Returns compact metadata by default.
- **`render_svg_animation_preview`**: Sample animated SVG timelines and return a storyboard and/or individual frames.

## Workflow

### For Static SVG:
1. Generate or edit SVG markup.
2. Call `render_svg_preview` with the full SVG string.
3. Inspect returned preview image and metadata.
4. Use optional `response` parameter to control output format (`image`, `metadata`, `json`).
5. Iterate on SVG until the design goal is met.

### For Animated SVG:
1. Create SVG with animation elements.
2. Call `render_svg_animation_preview` with the full SVG string.
3. Review the storyboard/frames to validate animation timing and visual progression.
4. Adjust animation keyframes and durations as needed.
5. Iterate until animation meets requirements.

## Key Parameters

**Core:**
- `svg` (required): Full SVG markup as a string.
- `size` (optional): Target width in pixels (16-1024, default 128).
- `background` (optional): Background color (e.g., #ffffff or rgba()).

**Output Control (v2):**
- `response`: Control output format: `image` (default), `metadata`, `both`, or `json` (legacy).
- `includePngBase64`: Include base64 PNG data in output (creates larger payload).
- `includeDataUri`: Include data URI in output (creates larger payload).
- `writePngToDisk`: Write PNG to temp file and return path instead of embedding.

## Rules

- Keep SVG payloads minimal for faster rendering.
- Prefer a `viewBox` attribute for scalable, resolution-independent output.
- Use `render_svg_preview` for performance when you only need compact metadata.
- Use `render_svg_animation_preview` to validate animation correctness before deployment.
- Inspect warnings in metadata—they indicate potential issues (missing namespaces, invalid elements, etc.).
- For large batches, prefer `response=metadata` or `writePngToDisk` to minimize token usage.
