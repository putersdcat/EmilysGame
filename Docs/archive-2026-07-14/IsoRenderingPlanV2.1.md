# Isometric Rendering 2.0 Experiment – Comprehensive Spec

## Project Goal
Build a new isometric tile rendering system from scratch that addresses all limitations of the 1.0 renderer, including low detail, stretching artifacts, lack of true height, and poor support for continuous features. The system must maintain the exact TypeScript style, naming conventions, and folder patterns as the main codebase for seamless merging. The experiment is isolated with zero code from current `src/`, focusing on a split architecture: base biome tiles (flat textures) and nano tile augmentation layers (overlays for continuous/height features).

## Success Criteria
The system must deliver:
- High-detail base biome tiles (128×128 logical, projected to 256×128 diamond without stretch)
- True height simulation via Z-pinned skew transformations for overlays, supporting positive Z (upright barriers like fences) and negative Z (carve-outs like rivers)
- Modular nano tile overlays that chain across micro tiles for continuous features (e.g., fences, walls, rivers) with variants (straight, diagonal-left, diagonal-right, vertex/corner, T-junction, end-cap)
- Seamless edge blending between base tiles and overlays using alpha gradients or noise
- Dynamic path-based shadows projected from SVG outlines, with rim lighting on sun-facing edges
- Parallax background layers at varying speeds for depth illusion
- Full integration with MCP SVG rendering tool for LLM vision loops, including multi-tile assemblies, player test renders, and Z-offset previews
- Occlusion and draw order handling: Player partially visible through alpha (e.g., behind fence); fully occluded behind solid walls
- Walkable/non-walkable logic: Overlays flag barriers (e.g., fence blocks path); gates/bridges create passable gaps (quiz/key unlocked)
- Player "sink" effect for negative Z (e.g., feet offset into mud/river)
- Support for layered nanos (e.g., river base + bridge overlay + grass tuft)
- Unlimited positive Z for tall structures (e.g., cathedral spires, castles) with overhangs bleeding over tiles
- 60+ FPS performance

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
   └── src/
       ├── main.ts
       ├── types.ts
       ├── base-tile.ts
       ├── nano-tile.ts
       ├── chunk.ts
       ├── solver.ts
       ├── renderer.ts
       ├── asset-loader.ts
       ├── lib/              (utils renamed to match repo)
       └── assets/           (SVGs + JSON metadata)
   ```

## Core Architecture

### Base Tiles (Biome Layer)
- Flat, biome-focused textures (e.g., grass, mud, gravel, sand, dry grass, green grass mixes)
- 128×128 logical → 256×128 diamond via affine transform (scaleY 0.5, shear 45°)
- Minimal Z-floor hack: Tiny positive/negative offset (2-3 px) for effects like lush grass (+2, player feet visible above) or sunk mud (-2, feet dip in)
- Metadata: Walkable boolean, biome type (enum), edge masks (alpha gradients for blending)
- LLM Generation: Easy for flat squares—prompt "vivid green grass texture, 128x128, seamless edges"

### Nano Tiles (Augmentation Layer)
- Overlays for continuous features and structures, placed on base tiles
- Start as square SVG (e.g., 128x32 for thin fence; 128x128 for tall spire)
- Z-pinned skew transformation: Pin to vertical axis (shear only, no rotation)—keeps "upright" in isometric
- Positive Z (barriers like fences/walls): Thin alpha-heavy (see-through gaps); overhangs for height illusion
- Negative Z (carve-outs like rivers): Top blends into base (e.g., grass-to-water gradient); bottom is flat texture (water plane)
- Extrusions for thickness: Top texture (horizontal cap) + side filler (vertical face)—same/different SVG; no alpha on sides
- Size Limit: X/Y within micro tile bounds (chain for continuity); positive Z unlimited for tall structures (e.g., cathedral walls spanning 3x5 micros)
- Layering: Stack 2-3 nanos per micro (e.g., river negative → bridge positive → grass tuft positive)
- Metadata: Type (enum: FENCE, WALL, RIVER, etc.), Z-offset (positive/negative int), walkable (boolean or conditional: quiz/key), blend_edges (boolean), top_texture (optional SVG for cap)
- Chaining: Solver handles variants based on neighbors (straight, diagonal, corner, T, end); ensures continuity (e.g., rivers max 3-5 chunks before terminator like pond)

### Rendering Pipeline
- Base Layer: Biome squares → diamond transform
- Augmentation Layer: Nano SVGs → Z-pinned skew + layering (sorted by Y+Z)
- Draw Order: Base → nanos (by Z) → player → shadows/rims
- Shadows: Project SVG paths from sun angle (time/weather dynamic: long sunset, short noon, faint fog)
- Rim Lighting: Gradient glow on sun-side edges
- Parallax: Backgrounds at 0.3x speed
- Player Sink: Feet offset by tile Z (e.g., -2 into mud/river)
- Occlusion: Alpha/draw order—player visible through fence gaps when behind, blocked by solid walls

### Asset Generation (LLM + Vision Loop)
LLM agent:
1. Writes square SVG (e.g., flat fence with alpha gaps)
2. Calls MCP with `mode: "isometric_z_pinned"` + params (positive/negative, Z-offset)
3. Receives diamond preview + base64 thumb + metadata (e.g., "Overhang 8px top, alpha gaps visible")
4. Iterates ("add vertical posts, adjust skew for corner variant")
5. Saves: SVG + JSON (type, Z, masks, variants)

### MCP Tool Enhancements
- Add `mode: "isometric_z_pinned"` for nano skew (positive/negative handling)
- Support assembly: Multi-SVG input for chains (e.g., fence straight + corner)
- Test with player: Param `include_player: {position: 'front'|'behind'}` — renders dummy player sprite for occlusion/sink check

## Implementation Phases (in exact order)

### Phase 1: Project Setup & Core Types
- Set up minimal Vite + TS project in `/experiment/isometric-2.0/`
- `types.ts`: BaseTile (biome, Z-floor), NanoTile (SVG, Z-offset, type, blend), Chunk, MacroAssembly, etc.
- `main.ts`: Canvas + loop skeleton with camera

### Phase 2: Base Tile System
- `base-tile.ts`: Render 128×128 flat biome to 256×128 diamond (affine: scaleY 0.5, shear 45°)
- Add tiny Z-floor hack (2-3 px offset for lush/sunk effects)

### Phase 3: Nano Tile Augmentation
- `nano-tile.ts`: Z-pinned skew transform (shear only, vertical pin)
- Support positive (barriers with alpha/overhang) + negative (carve-outs with blends)
- Extrusion mode: Top + side textures for thickness
- Layer stacking (2-3 nanos per base tile, sorted by Z)

### Phase 4: Asset Loading & MCP Integration
- `asset-loader.ts`: Load SVG + JSON for base/nanos
- Enhance MCP: New modes for Z-pinned, assemblies, player tests

### Phase 5: Rendering Features
- Renderer draw order: Base → nanos → player → shadows/rims
- Path-based shadows (outline projection from sun)
- Rim lighting (sun-side gradients)
- Parallax backgrounds
- Player feet offset for sink

### Phase 6: Solver for Continuous Features
- `solver.ts`: Chain nanos across tiles (variants from neighbors: straight, diagonal, corner, T, end)
- Ensure continuity (e.g., rivers terminate in pond)
- Walkable logic: Nano flags override base (bridge gaps river barrier)

### Phase 7: Polish & Validation
- Time/weather sun angle for shadows
- Camera movement + parallax test
- 60+ FPS
- Test scenes: Rock wall chain, fence corner, sunken river + bridge, tall grass overhang
- Player occlusion/sink in scenes (front/behind fence, feet in mud/river)

## Code Style for Merge
- Match main: camelCase, exports, ESLint
- `// 2.0 Experiment` prefix on functions
- Modular—no globals
- No heavy deps

## Final Deliverables
- Standalone renderer
- 8–10 test assets (base + nanos)
- Continuous feature examples (fence chain, river + bridge)
- README.md: Run guide, merge notes, MCP enhancements





# Addendum: Nano Tile Augmentation Layer

## Introduction
This addendum details the nano tile augmentation layer as a core component of the 2.0 isometric rendering experiment. Nano tiles serve as modular overlays on base biome tiles, enabling continuous features, height simulation, and dynamic elements without altering the base layer. They support positive Z (upright barriers like fences) and negative Z (carve-outs like rivers), with layering for stacking (e.g., river + bridge + grass). This layer abstracts complex structures (e.g., cathedrals, homesteads) as chained nanos, ensuring visual pop and gameplay logic (walkable/non-walkable, occlusion).

The layer is designed for procedural generation via LLM + MCP vision loops, with metadata driving solver placement and rendering rules. It addresses v1 limitations (flat canvas, no true height, poor continuity) while keeping 2D efficiency.

## Key Details

### Nano Tile Definition
- **Base Structure**: Square SVG (e.g., 128x32 for thin fence; 128x128 for tall spire) with alpha for transparency/occlusion.
- **Size Limits**: X/Y within micro tile bounds (chain for continuity across tiles); positive Z unlimited for tall structures (e.g., spire overhanging multiple micros).
- **Z-Pinned Orientation**: Always "upright" in isometric—pinned to virtual Z-axis for vertical feel (e.g., fence stands tall, not flat on ground).
- **Metadata**:
  - Type: Enum (FENCE, WALL, RIVER, BRIDGE, GRASS_TALL, etc.)
  - Z-Offset: Int (positive for barriers; negative for sinks; 0 for flat overlays)
  - Walkable: Boolean or conditional (e.g., false for wall; true for bridge; quiz/key for gate)
  - Blend_Edges: Boolean (alpha gradient for transitions, e.g., grass-to-water)
  - Top_Texture: Optional SVG (for extrusions, e.g., rock cap on wall)
  - Side_Texture: Optional SVG (for thickness in extrusions)
  - Variants: Array (straight, diagonal-left, diagonal-right, corner, T-junction, end-cap)

### Positive Z (Barriers/Structures)
- Upright elements like fences/walls—thin, alpha-heavy for see-through gaps.
- Extrusions: Combine top (horizontal cap) + side (vertical face) textures for thickness (e.g., rock wall: side = repeating stones, top = flat cap).
- Overhangs: Allow bleeding over tile bounds for height illusion (e.g., tall tree branches extend).
- Examples: Cathedral spire (high Z, pointy top); homestead fence (chained around yard).

### Negative Z (Carve-Outs/Sinks)
- Inverted for sinks like rivers—top blends into base (e.g., grass-to-water gradient via blend_edges); bottom is flat texture (water plane).
- Player "Sink" Effect: Feet offset by negative Z (e.g., dip into mud/river—draw player sprite shifted down).
- Examples: Stream (narrow, passable with sink); wide river (non-walkable barrier unless bridged).

### Layering and Stacking
- Max 2-3 nanos per micro tile, sorted by Z-offset (negative first, then positive).
- Draw Order: Base biome → negative nanos (carves) → positive nanos (barriers) → player/sprites → shadows/rims.
- Occlusion: Alpha + draw order—player visible through fence gaps when behind; blocked by solid walls.

### Integration with Base Tiles
- Nanos overlay on biome bases (e.g., grass + fence nano = fenced meadow).
- Solver Flags: Nanos override base walkable (e.g., bridge gaps river barrier).
- Visual Blending: Use nano masks to composite seamlessly (no hard lines).

### Solver Handling for Chains
- Chains span micros via variants (selected by neighbor analysis).
- Continuity: Max length (e.g., 5 chunks before terminator like pond/rock pile).
- Examples: Fence around 5x5 homestead (outer nanos as barrier; inner yard walkable with animals).

### LLM Generation
- Prompt for diamond-view SVGs directly (e.g., "Draw isometric fence segment, upright, alpha gaps, Z=8").
- MCP Returns: Thumb + notes (e.g., "Overhang 12px top, alpha visible").

## Implementation Notes
- Keep 2D—illusions via skew, alpha, order (no 3D sim).
- Test: Player behind/in front of fence (partial occlusion); sink in river; tall spire overhang.
- Future: Expand to large structures (e.g., cathedral as multi-nano assembly).

This addendum ensures the nano layer is flexible, modular, and gameplay-integrated.

# Addendum: Z-Pinned Skew Transformation and Extrusions

## Introduction
This addendum details the Z-pinned skew transformation for nano tile overlays, enabling vertical orientation and height simulation in the isometric view. It covers positive/negative Z offsets, extrusions (top + side textures for thickness), and layering rules. The transformation is a simple Canvas shear (no rotation), pinning overlays to a virtual Z-axis for "upright" feel. This solves v1 flatness, allowing barriers (positive) and sinks (negative) without full 3D.

## Key Details

### Z-Pinned Skew Transformation
- **Process**: Start with square SVG → apply shear (scaleY 0.5 + skewX 45°) to diamond, but pin vertical edges—keeps "standing" look (e.g., fence posts upright, not tilted).
- **Positive Z (Barriers)**: Skew emphasizes height; overhangs bleed over tiles (e.g., tall fence casts shadow).
- **Negative Z (Carve-Outs)**: Inverted skew for "drop"—top edge blends base texture (e.g., grass-to-river gradient).
- **Parameters**: Z-Offset (int, positive/negative); Blend_Edges (boolean for alpha fade).
- **Canvas Implementation**: Use ctx.transform() for shear; offset by Z for depth illusion.

### Extrusions for Thickness
- **Structure**: Top texture (horizontal cap, e.g., rock flat) + Side texture (vertical face, e.g., stone repeat)—same/different SVG.
- **Rendering**: Draw side first (Z-pinned skew, no alpha), then top (slight offset for bevel).
- **Examples**: Rock wall (side stones, top cap); Tall grass (side stalks, top tufts).
- **Layering**: Stacks with other nanos (e.g., negative river + positive bridge extrusion).

### Occlusion and Player Interactions
- **Draw Order**: Base → negative nanos → positive nanos → player (sorted by Y + Z-offset).
- **Player Sink/Offset**: For negative Z, shift player sprite down (feet dip); for positive, occlude if behind (alpha gaps visible).
- **Walkable Rules**: Nano metadata overrides (e.g., bridge over river = walkable gap).

## Implementation Notes
- Tie to solver: Variants auto-selected for chains (e.g., fence corner skews differently).
- MCP Enhancements: Preview with Z-pinned mode + player test (front/behind).
- Test: Fence occlusion (partial see-through); river sink (feet offset); tall extrusion overhang.

This addendum enables modular depth without 3D overhead.

# Addendum: Solver Enhancements for Continuous Features and Gameplay

## Introduction
This addendum details enhancements to the solver for handling continuous features as nano tile chains, ensuring procedural coherence, walkable/non-walkable logic, and gameplay integration (e.g., barriers with gates/bridges, riddles for trolls). The solver abstracts feature types (enum) for modularity, allowing future additions (e.g., wires, pipelines) without re-coding. It focuses on MVP examples (fences, walls, rivers) but generalizes for "chained" overlays.

## Key Details

### Continuous Feature Abstraction
- **Feature Type Enum**: FENCE, WALL, RIVER, PIPE, WIRE (expandable).
- **Variants**: Straight, diagonal-left, diagonal-right, corner (90°), T-junction, end-cap, bridge (for gaps).
- **Chaining Logic**: Solver analyzes neighbors → selects variant (e.g., fence to wall = corner; river end = pond terminator).
- **Max Length**: 3-5 chunks before forced terminator (e.g., rock pile for walls, pond for rivers)—prevents infinite lines.
- **Gameplay Flags**: Override base walkable (e.g., fence = false; bridge = true after quiz/key).

### Solver Flow
- Input: Entropy hash (theme bias, e.g., "fence-heavy")
- Process:
  1. Pick feature type from hash
  2. Place starting nano
  3. Chain to neighbors (match edges, rotate if supported)
  4. Add gates/bridges for passable gaps (quiz/key/riddle tied)
  5. BFS validate paths (no traps; reroll if blocked)
  6. Apply Z-offsets + extrusions (top/side textures)
- Output: Updated chunk with nanos layered on base

### Gameplay Integration
- **Barriers**: Fences/walls block path; player can't cross without gate (occlusion when behind/front).
- **Gates/Bridges**: Passable after solve (e.g., troll riddle at bridge—quiz pop-up).
- **Rivers**: Negative Z carve; non-walkable unless bridged (player sink effect on shallow streams).
- **Large Structures**: Multi-chunk nanos (e.g., 5x5 homestead: outer fence chain, inner hut as tall extrusion).

## Implementation Notes
- Generalize for future (e.g., wires = thin overlay with Z=0)
- MCP Test: Render chains with player (front/behind, sink/occlusion)
- Test: Continuous fence around yard (player outside/inside); river + bridge cross (quiz unlock)

This addendum makes the solver robust and modular for endless features.


# Addendum: Enhanced MCP Tooling Capabilities for Asset Rendering and Testing

## Introduction
This addendum details the expected enhancements to the MCP (Model Context Protocol) tooling for the isometric rendering 2.0 experiment. The MCP must be purpose-built to support fast, headless rendering of game elements, using the experiment's core rendering code (e.g., renderer.ts, draw order logic) to ensure fidelity. It acts as an LLM-facing endpoint for iterative asset development, but with advanced capabilities for unit-like testing (e.g., permutations, metadata-driven renders). The tool avoids full game engine spin-up or large screenshots (e.g., 1920x1080 Playwright captures), focusing on compact, targeted outputs (e.g., 256x128 thumbs) to keep LLM context lean and loops fast (<500ms). It supports single SVGs, nano tile extrusions, continuous chains, and full assemblies with existing assets/player for visual integration checks.

The MCP is dual-mode (CLI for manual, endpoint for LLM calls), deployed locally (localhost:3000). It pulls from experiment assets/ for "alongside" renders, ensuring the LLM sees how new elements fit with current game visuals.

## Key Capabilities

### 1. Core Rendering Engine Integration
- **Mandatory Use of Experiment Code**: The tool must import and use the experiment's rendering pipeline (e.g., affine transforms, Z-sorting, draw order, shadows, rim lighting) for all outputs—no approximations or separate logic.
- **Headless Mode**: Run without browser/Canvas UI—use offscreen Canvas or sharp for PNG export; output base64 thumbs + metadata JSON.

### 2. Input Support for Various Scenarios
- **Single SVG Render**: Accept SVG code; apply isometric projection (direct diamond); return thumb.
- **Nano Tile Rendering**: Support Z-pinned textures with metadata (e.g., positive/negative offset, top/side for extrusions, alpha blending).
  - Example: Input new fence SVG + metadata {z_offset: 8, type: 'positive', top_texture: 'existing-rock-cap.svg'} → render skewed, layered extrusion.
- **Continuous Chains**: Accept array of SVGs/positions (e.g., fence straight + corner); solver-like assembly with edge matching; return composite thumb.
- **Assemblies with Existing Assets**: Pull from assets/ (e.g., "render new river nano alongside existing grass base"); support multi-layer stacks (river negative + bridge positive).
- **Metadata-Driven Params**: Inputs include z_offset (positive/negative int), walkable (boolean), blend_edges (boolean), top_texture (string ref), side_texture (string ref).

### 3. Unit Test-Like Automation
- **Player Permutations**: Param `include_player: array` (e.g., ['front', 'behind', 'left', 'right'])—render dummy player sprite in positions; test occlusion (alpha gaps), sink (feet offset for negative Z), alignment (e.g., behind fence visible through gaps).
- **Full Scene Simulations**: Combine inputs with base tiles/overlays (e.g., "river + bridge + player front"); return thumb with annotations (e.g., "Player occluded 50% behind fence").
- **Debug Overlays Optional**: Param `debug: boolean`—add wireframes for Z-edges, walkable flags (green/red tint).

### 4. Output Format
- Compact JSON for LLM ingestion: base64 thumb (128x128 default), frame_count (for animations), total_duration_ms, timing_notes (e.g., "Frames 0-2: ripple up; alpha fade"), dimensions, occlusion_notes (e.g., "Player visible through 40% alpha"), status.
- Animated: Horizontal strip of frames + notes on motion.

### 5. Edge Cases and Perf
- Invalid Inputs: Graceful errors (e.g., "Missing top_texture for extrusion").
- Large/Complex: Cap frames (max 8); reject >512px size.
- Speed: <200ms for single; <500ms for assemblies (batch Canvas draws).

## Implementation Notes
- **Dual Mode**: CLI (node mcp.ts --svg "<svg>" --z_offset 8 --include_player "front,behind") for testing; Express endpoint for LLM POST.
- **Engine Reuse**: Import experiment's renderer.ts functions—ensure compatibility (e.g., dummy chunk for tests).
- **Metadata Handling**: Parse input JSON for Z/walkable/blend; apply in render (e.g., feet offset = -z_negative).
- **Test**: Single fence (alpha occlusion), river + bridge (player cross), cathedral spire (tall overhang).
- **Future**: Add solver sim mode (input chain params → full macro thumb).

This addendum makes the MCP a powerful, game-aligned LLM partner for asset dev.
