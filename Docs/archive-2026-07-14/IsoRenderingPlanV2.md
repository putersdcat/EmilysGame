# Isometric Rendering 2.0 Experiment – Clean-Sheet Development Directive

## Project Goal
Build a completely new, clean-sheet isometric tile rendering system for Emily's Game that overcomes all the current limitations of the 1.0 renderer while maintaining exactly the same TypeScript style, naming conventions, and folder patterns as the main codebase so that successful pieces can be merged back with minimal friction.

The experiment must live in its own isolated folder and contain **zero code** from the current `src/` directory.

## Success Criteria
The new system must deliver:
- Significantly higher visual quality and detail (no more 32×32 low-res base textures)
- No stretching artifacts (render directly to the final isometric diamond shape)
- True height / Z-depth on base tiles themselves (not just overlaid sprites)
- Support for continuous multi-tile features:
  - Long rock walls
  - Continuous wooden fences (straight, diagonal-left, diagonal-right, vertex/corner pieces)
  - Sunken rivers with proper banks
  - Tall grass with height variation
- Seamless edge blending between adjacent tiles
- Dynamic, path-based shadows using actual SVG path data (no more egg-shaped blobs)
- Rim lighting on sun-facing edges
- Parallax background layers
- Full compatibility with the existing MCP SVG rendering tool + vision loop for asset iteration
- Clean, mergeable, production-ready code that follows the exact style of the main codebase

## Branch & Folder Structure
1. Create a new branch:
   ```
   git checkout -b experiment/isometric-2.0
   ```

2. Inside the repository root, create this isolated structure:
   ```
   /experiment/isometric-2.0/
   ├── index.html
   ├── vite.config.ts
   ├── tsconfig.json
   ├── package.json          (minimal, only what's needed)
   ├── AiTools/              (new: LLM-facing tooling)
   │   ├── README.md         (tool schemas, usage for agents)
   │   ├── svg-renderer-tool.ts  (core render logic)
   │   ├── server.ts         (HTTP endpoint)
   │   ├── cli.ts            (CLI entry)
   │   ├── package.json      (express, sharp, xml2js)
   │   └── test-assets/      (sample SVGs/JSON)
   └── src/
       ├── main.ts
       ├── types.ts
       ├── tile.ts
       ├── chunk.ts
       ├── solver.ts
       ├── renderer.ts
       ├── asset-loader.ts
       ├── lib/              (utils renamed to match repo)
       └── assets/           (SVGs + JSON metadata)
   ```

## Core Architecture

### Tile System
- **MicroTile**: 128×128 logical resolution
  - Base SVG texture
  - Z-height value (0-12)
  - Height map (optional 8×8 grid for slopes)
  - Edge blend masks (left/right/top/bottom)

- **WorldUnitChunk**: 5×5 micro tiles (640×640 logical)

- **MacroAssembly**: Solver stitches chunks with continuous-feature logic

### Rendering Pipeline
- Direct isometric projection: 128×128 logical → 256×128 diamond shape (no stretch step)
- Draw order: `y + (z * 0.5)`
- Shadows: Path-based projection from current sun angle
- Rim lighting: Gradient stroke on top-right edges
- Parallax: Background layers at different speeds

### Asset Generation Pipeline (LLM + Vision Loop)
The LLM agent will:
1. Write SVG code (128×128 logical)
2. Call the new AiTools/svg-renderer-tool (with `mode: "isometric"`)
3. Receive rendered 256×128 diamond preview + base64 thumb
4. Iterate ("add jagged edges, adjust height shadow, blend left/right")
5. Final output saved as `assets/rock-wall-straight.svg` + `rock-wall-straight.json` (Z, masks, edges)

## Implementation Phases (in exact order)

### Phase 1: Project Setup & Core Types
- Set up the minimal Vite + TypeScript project in `/experiment/isometric-2.0/`
- Define clean TypeScript interfaces in `types.ts` (MicroTile, Chunk, EdgeMask, etc.)
- Create basic `main.ts` that sets up Canvas and a simple game loop

### Phase 2: Tile & Chunk System
- Implement `tile.ts` that renders a 128×128 logical tile directly to 256×128 isometric diamond
- Build `chunk.ts` for 5×5 World Unit Chunks with height support
- Add support for edge blend masks

### Phase 3: Asset Loading
- Create `asset-loader.ts` that loads SVG + metadata JSON pairs from `assets/`

### Phase 4: Advanced Rendering Features
- Add parallax background layer system
- Implement path-based dynamic shadows using actual SVG path data
- Add rim lighting on sun-facing edges

### Phase 5: Continuous Feature Solver
- Build `solver.ts` with logic for:
  - Continuous walls/fences (straight, diagonal-left, diagonal-right, vertex pieces)
  - River systems with banks and flow
  - Tall grass with height variation

### Phase 6: AiTools Component Integration
- Build the AiTools sub-folder as a separate Node.js mini-project
- Implement `svg-renderer-tool.ts`: core function to render SVG to image with isometric mode
- Add `server.ts`: Express POST /render-svg endpoint (JSON in/out)
- Add `cli.ts`: CLI for manual testing (e.g., node cli.ts --svg "<svg>...</svg>" --mode isometric)
- Ensure full compatibility with MCP-like LLM calls: accept SVG, return base64 thumb + metadata
- Support animated SVGs: extract frames, return horizontal strip + timing notes

### Phase 7: Polish & Validation
- Add time-of-day sun angle support for shadows
- Implement basic camera movement with parallax testing
- Ensure the renderer runs at 60+ FPS
- Create visual test scenes demonstrating:
  - Long continuous rock wall
  - Long continuous fence with corners
  - Sunken river section
  - Tall grass with height variation

## Code Style Requirements for Merge Compatibility
- Use identical naming conventions, formatting, and TypeScript patterns as the main codebase
- Comment every major function with `// 2.0 Experiment` prefix
- Keep everything modular and exportable
- No new heavy dependencies unless absolutely necessary

## Final Deliverables
When the experiment is complete, the folder must contain:
1. A fully working standalone isometric renderer
2. 8–10 high-quality test assets with height and edge data
3. Working examples of continuous features (fence wall, river)
4. A README.md inside `/experiment/isometric-2.0/` explaining:
   - How to run the experiment
   - Which files are ready to be merged back to main
   - Any notes on how to integrate
5. AiTools README.md with tool schemas and LLM call examples
