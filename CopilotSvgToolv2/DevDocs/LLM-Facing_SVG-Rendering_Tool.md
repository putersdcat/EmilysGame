# LLM-Facing Instructions: SVG Preview Tool

Use this tool when you need to validate generated or edited SVG visually.

## Tool Name

`render_svg_preview`

`render_svg_animation_preview`

## When To Use

- After generating SVG from scratch.
- After modifying path geometry, colors, gradients, text, or layout.
- When debugging malformed or unexpected SVG output.
- When validating **animated** SVG (SMIL or CSS-based).

## Input Contract

- `svg` (required, string): complete SVG markup.
- `size` (optional, int 16-1024): target output width in pixels. Default: `128`.
- `background` (optional, string): PNG background color, e.g. `#ffffff` or `rgba(0,0,0,0)`.

Optional (v2):

- `response` (optional): `image` | `metadata` | `both` | `json`
	- Use `image` (default) to get an MCP image block (best for Copilot).
	- Use `metadata` when you only need size/warnings.
	- Use `json` only when you truly need base64/dataUri.
- `writePngToDisk` (optional, boolean): write the PNG to a temp file and return `pngFilePath`.

## Output Contract

Default (`response=image`):

- An MCP `image` content block (PNG)
- A small JSON metadata text block
- `structuredContent` contains compact metadata only (no base64 unless requested)

Legacy (`response=json`) returns JSON with:

- `mediaType`: `image/png`
- `pngBase64`: raw PNG bytes as base64
- `dataUri`: `data:image/png;base64,...`
- `width`, `height`: rendered dimensions
- `bytes`: PNG byte size
- `warnings`: non-fatal warnings

## Interpretation Rules

- Prefer the MCP `image` content block as the preview payload (avoids base64 in context).
- Only request `dataUri`/`pngBase64` when you need to copy/paste the bytes.
- If `warnings` includes animation-related text, interpret the result as a static snapshot only.
- If the tool returns an `error`, revise SVG and retry.

## Usage Pattern

1. Produce candidate SVG.
2. Call `render_svg_preview`.
3. Evaluate output dimensions/warnings.
4. Iterate until visual objective is met.

For animated SVG:

1. Produce candidate animated SVG.
2. Call `render_svg_animation_preview` with a small `frameCount` (e.g. 6) and `output: 'storyboard'`.
3. If timing looks wrong, set `durationMs` or explicit `timesMs`.
4. Iterate until the storyboard shows the intended motion.

## Prompting Tips

- Prefer explicit `viewBox` values in SVG.
- Keep SVG minimal and deterministic.
- For quick comparisons, keep `size` constant across iterations.