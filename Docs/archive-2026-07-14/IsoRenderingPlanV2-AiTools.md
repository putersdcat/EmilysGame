# Development Plan for AI-First Tooling in Emily's Game

## Project Goal
Build a simple, purpose-built tool that allows LLMs (e.g., GitHub Copilot Chat agents) to render SVG code into a visual format digestible by multimodal model heads. The tool acts as a lightweight endpoint, accepting SVG strings via tool calls and returning annotated visual responses (e.g., base64-encoded images with metadata). It is dead simple (minimal code, no UI), super fast (sub-second responses), and supports the full range of SVG features, including animations (transformed into sprite sheets or frame strips with timing annotations). The focus is on enabling rapid iteration loops for LLMs during asset creation, where the model can "see" its output without bloating context windows. 

The tool will be a standalone Node.js server (deployable locally or on a service like Vercel), integrated as a tool call in LLM agents. MVP scope: Handle static/animated SVGs, return compact visuals + notes. 

## Requirements
- **Core Functionality**: Accept SVG code; render to image (PNG/JPEG); return base64 + annotations (e.g., dimensions, frame count, timing).
- **Speed**: <500ms response time; optimize for tiny payloads (SVG strings <10KB).
- **Simplicity**: No auth/UI; single endpoint (POST /render-svg); JSON in/out.
- **Full SVG Support**: Handle paths, gradients, filters, animations (<animate>, <animateTransform>).
  - Static: Single image.
  - Animated: Extract frames (e.g., 4-8 snapshots over duration); return horizontal strip + notes (e.g., "Frames: 0-3 up, 4-7 down; peak at 250ms").
- **Output Format**: Base64 image (64x64 default; configurable); metadata JSON (frame_count, total_duration_ms, timing_notes—natural language summary for LLM ingestion).
- **Edge Cases**: Invalid SVG (error response); large SVGs (timeout/crop); complex animations (sample at fixed intervals).
- **Security/Constraints**: No external deps beyond rendering lib; validate input to prevent crashes.

## Architecture
- **Type**: Node.js Express server (minimal, 50-100 LOC).
- **Endpoint**: POST /render-svg (JSON body: { svg: string, size: int=64, frames: int=1, duration: int=1000 }).
- **Rendering Engine**: Use 'canvas' npm lib (for browser-like SVG rasterization) or 'sharp' (faster, WASM-based for perf).
  - Static: Load SVG → draw to canvas → export PNG base64.
  - Animated: Parse <animate> tags (simple regex/time-step simulation); loop over duration/frames → snapshot each → stitch horizontal strip.
  - Annotations: Compute notes (e.g., analyze attribute changes: "Opacity fades 1→0.5 over 500ms").
- **Deployment**: Local (npm start on localhost:3000); optional Vercel for remote testing.
- **LLM Tool Call Schema** (for agent integration):
  ```json
  {
    "name": "render_svg_preview",
    "description": "Render SVG code to image. Use for visual feedback on generated assets. Returns base64 PNG and metadata.",
    "parameters": {
      "svg": { "type": "string", "description": "Full SVG code" },
      "size": { "type": "integer", "description": "Square size in px (default 64)" },
      "frames": { "type": "integer", "description": "Frames to capture for animations (default 1)" },
      "duration": { "type": "integer", "description": "Animation cycle ms (default 1000)" }
    }
  }
  ```
- **Response Example**:
  ```json
  {
    "thumb": "data:image/png;base64,iVBORw0KGgo...",
    "frame_count": 4,
    "total_duration_ms": 1000,
    "timing_notes": "Frames 0-1: scale up 1→1.2; 2-3: opacity fade. Linear easing.",
    "dimensions": { "width": 64, "height": 64 },
    "status": "ok"
  }
  ```

## Implementation Steps
1. **Setup**: Create Node project (`npm init`); install express, @napi-rs/canvas (fast Canvas port) or sharp.
2. **Core Renderer**: Implement render function—parse body, validate SVG, render static (canvas.drawSvg).
3. **Animation Handling**: Add frame stepping for <animate>; stitch strip; generate timing summary.
4. **Endpoint Build**: Express POST handler; return JSON.
5. **Optimization**: Limit frames (max 16); resize thumbs; error handling (e.g., "Invalid SVG—missing closing tag").
6. **Testing**: Local calls with curl/Postman; sample SVGs (static tree, animated flame).

## Tools/Tech Stack
- **Core**: Node.js v20+ (fast startup); Express (minimal routing).
- **Rendering**: @napi-rs/canvas (Rust-based, super fast SVG-to-PNG; handles animations via time-seeking) or sharp (if static-only MVP).
- **Parser**: xml2js (lightweight for <animate> extraction—no heavy DOM).
- **No Extras**: No DB/UI/auth—pure endpoint.

## Testing and Validation
- **Unit Tests**: Static render (match expected base64 hash); animated (frame count/timing accurate).
- **LLM Loop Test**: Simulate 100 calls with varying SVGs—measure avg <200ms; context stays lean.
- **Edge Cases**: Malformed SVG (graceful error); long animations (cap frames); large sizes (reject >256px).
- **Definition of Done**: Tool returns accurate visuals/annotations; LLM can iterate ("Make branches fuller") without errors.

## Deployment and Integration
- **Local Run**: `npm start`—expose on localhost:3000 for agent calls.
- **LLM Agent Setup**: Add tool to prompt/instructions; e.g., Claude calls via JSON POST.
- **Future**: Vercel deploy for remote; add auth if public (but keep local for now).
- **Risks/Mitigations**: SVG exploits (sanitize input); perf drops (limit concurrent calls).

This tool unlocks AI asset mastery—LLM sees true game visuals, iterates fast. Build it, and your fences won't look like railroads anymore.
