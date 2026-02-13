# Emily's Game — World Engine: Rendering Pipeline, Caching, and WASM Delivery

## 1. Overview

The rendering pipeline transforms the world engine's generated cell data into the pixels the player sees. It is architecturally distinct from the generation pipeline — generation produces data, rendering consumes it. The two systems communicate through well-defined data structures (cell grids, asset keys, cache entries) and never share internal state.

The rendering pipeline must be fast enough to sustain 60 FPS on target hardware (8th Gen Intel i7, GTX 1050, 16GB RAM) while drawing a viewport of isometric terrain, obstacles, NPCs, collectibles, decorative sprites, the player character, shadows, and UI overlays. This means the renderer must be aggressive about skipping unnecessary work: pre-rendering stable content, caching at multiple levels, culling off-screen elements, and optionally accelerating batch operations through WASM.

This document describes the complete rendering pipeline from world data to screen pixels: the layer architecture, the cache hierarchy, the invalidation rules, the WASM acceleration targets, and the performance contracts that each subsystem must honor.

---

## 2. Layer Architecture

The renderer draws the world in distinct layers, from bottom to top. Each layer has different update frequencies, different caching strategies, and different rendering costs.

### 2.1 Layer 0: Ground Fill

A single solid color rectangle covering the entire canvas. The color is determined by the biome of the chunk at the camera center. This is the cheapest layer — one `fillRect` call per frame. It provides a visual baseline so that any gaps between tile draws (rounding errors, sub-pixel gaps) show biome-appropriate color rather than black or canvas default.

Update frequency: Changes only when the player crosses a biome boundary (rare). Could be cached as a biome-to-color lookup.

### 2.2 Layer 1: Pre-Rendered Base Terrain

The core terrain layer: grass, dirt, water, stone floor, and all terrain auto-tiling transitions. This layer is drawn from **pre-rendered chunk canvases** — one offscreen canvas per chunk, blitted to the main canvas with a single `drawImage` call per visible chunk.

This is where the terrain cache system does its heavy lifting. Instead of drawing hundreds of individual 64×32 isometric tile diamonds per chunk per frame, the system draws 3–9 chunk canvases (depending on viewport buffer size) per frame. The per-chunk cost drops from hundreds of draw calls to one.

Update frequency: Never changes after initial generation. The terrain cache is generated once when the chunk is first created and reused for the lifetime of the chunk in memory. Invalidation occurs only if the chunk's terrain is structurally modified (which does not happen during normal gameplay — obstacles are resolved by changing cell properties, not terrain).

### 2.3 Layer 2: Non-Base Objects (Depth-Sorted)

Obstacles (rocks, walls, fences, doors), NPCs, collectible items, decorative sprites on elevated layers, and the player character. These elements are drawn individually, sorted by depth (Y-coordinate + height fraction), so that southern and taller objects draw on top of northern and shorter ones, producing correct occlusion.

This layer uses a **sparse object cell list** per chunk. Instead of iterating all cells in visible chunks (potentially thousands), the renderer iterates only those cells that have non-base content — typically 50–200 per chunk. This list is pre-computed when the chunk is generated and cached alongside the chunk data.

Each object is drawn as either:
- A pre-rendered isometric SVG tile (for tile-type objects like elevated walls, bridges, door gates)
- A cached emoji sprite (for emoji-based objects like trees, bushes, NPCs, items)
- A cached SVG character sprite (for the player character)

Shadows are drawn immediately before their parent object, using pre-rendered shadow ellipse sprites from a scale-quantized shadow cache.

Update frequency: Most object content is static (obstacles don't move, decorations don't change). The object cell list is invalidated only when a cell's content changes — item collection removes an item sprite, obstacle resolution changes a door to an open door, NPC departure removes an NPC. These events affect individual cells, not entire chunks.

### 2.4 Layer 3: Effects and Overlays (Future)

Particle effects (sparkles, fireflies, weather), status indicators, and ambient animations. Not yet implemented. When added, these will be lightweight per-frame draws (simple shapes or pre-rendered small sprites) that do not require caching.

### 2.5 Layer 4: UI and HUD

HTML DOM elements overlaid on the canvas. Health bar, coin counter, inventory slots, minimap, interaction prompts, quiz panels, NPC chat windows, menu screens. These are not drawn on the canvas — they are separate HTML elements positioned over it.

This is architecturally important: UI rendering uses the browser's native layout engine (which is highly optimized for text, buttons, and panels) rather than canvas draw calls. This avoids the performance cost of text rendering on canvas and provides accessibility benefits (screen readers can access DOM elements).

Update frequency: UI elements are throttled to update every N frames (currently every 5th frame) to avoid unnecessary DOM sync overhead. Most UI data (coin count, inventory, health) changes only on player interaction, not every frame.

---

## 3. Cache Hierarchy

Caching exists at four levels, forming a pyramid from small/numerous (micro tile atlas) to large/few (viewport projection). Each level eliminates a category of redundant computation.

### 3.1 Level 1: Micro Tile Visual Atlas

The bottom of the cache pyramid. Every micro tile SVG source is pre-rendered to a 64×32 isometric diamond offscreen canvas during game initialization. These canvases are stored in a tile type-keyed cache map.

When terrain or object layers need to draw a micro tile, they look up the pre-rendered canvas by tile type and blit it with `drawImage`. The SVG parsing and isometric transform math happens once at startup, never during gameplay.

**Size budget:** 8 tile types × 1 variant each × (64×32×4 bytes) = ~64KB. With auto-tiling variants (13 per type), this grows to ~830KB. With visual variation families (4 variants × 8 types × 13 transitions = 416 sprites), approximately 3.3MB. Well within memory budget.

**Invalidation:** Never. Micro tile visuals are immutable for the lifetime of the game session.

**Current status:** Implemented in `src/tiles.ts`. Pre-renders all tile types at startup via `preloadTiles()`. Cached in `isoTileCache` Map. No auto-tiling variants or visual variation families yet.

### 3.2 Level 2: Emoji Sprite Cache

Parallel to the micro tile atlas but for emoji-based sprites. Each emoji character is rendered to an offscreen canvas at a standard size with optional biome hue-shift tinting. Cached by a key combining the emoji character and tint value.

**Size budget:** ~30 unique emoji characters × ~5 tint variants = ~150 cache entries. At 32×32×4 bytes each, approximately 600KB. Negligible.

**Invalidation:** Never. Emoji renders are deterministic and immutable.

**Current status:** Implemented in `src/emoji-cache.ts`. Caches on first use (`getEmojiSprite`).

### 3.3 Level 3: Chunk Terrain Cache

The workhorse cache. Each generated chunk's base terrain layer (all base-layer tile draws for a 32×32 cell chunk) is rendered once to a large offscreen canvas. This canvas is then blitted to the main canvas with a single `drawImage` call per frame.

**Size per chunk:** The current chunk canvas dimensions are 2112×1056 pixels at full resolution. At 4 bytes per pixel, this is approximately 8.9MB per chunk. This is significant — with a viewport buffer of 1 (9 visible chunks in a 3×3 grid), the terrain cache consumes approximately 80MB of memory.

**Size reduction strategies:**
- Reduce chunk canvas resolution by a scale factor (e.g., 0.75× or 0.5×). Base terrain detail is less critical than object detail since terrain repeats visually.
- Use smaller chunk sizes (25×25 instead of 32×32 for macro-tile-aligned generation, which produces smaller chunk canvases).
- Evict distant chunks aggressively — only chunks within the viewport buffer need cached terrain. Farther chunks are regenerated on demand.

**Invalidation:** Chunk terrain caches are invalidated when the chunk's cell data changes structurally (which is rare during gameplay). The existing invalidation function (`invalidateChunkTerrain`) deletes the cache entry; the cache is rebuilt on next render.

**Current status:** Implemented in `src/terrain-cache.ts`. Creates full-resolution chunk canvases on first access. Cache is a Map keyed by chunk coordinate string.

### 3.4 Level 4: Shadow Sprite Cache

Pre-rendered shadow ellipses at quantized scales. Instead of computing shadow geometry (beginPath, ellipse, fill) on every frame for every shadowed object, the renderer pre-renders a shadow sprite at each used scale and blits it.

**Size budget:** ~20 quantized scale values × (small canvas ~50×30 pixels) × 4 bytes ≈ ~120KB total. Negligible.

**Invalidation:** Never. Shadows are deterministic geometry.

**Current status:** Implemented in `src/render.ts` (`getShadowSprite` method). Quantizes to 0.1 scale increments.

### 3.5 Level 5: Character Sprite Cache

Cached SVG character sprites for each animation frame × variation × walking/idle state. Generated from SVG markup via Blob URL → Image load on first request, then cached by a composite key.

**Size budget:** 3 variations × 6 walking frames + 3 idle poses × (48×48×4 bytes each) ≈ ~200KB total. Negligible.

**Invalidation:** Never within a session. Could be regenerated if the player changes their character customization.

**Current status:** Implemented in `src/sprites.ts`. Cache keyed by `"variation_name_f{frame}_{walking|idle}"`.

### 3.6 Future Cache Level: World Unit Composite Cache

A potential intermediate cache between the micro tile atlas and the chunk terrain cache. Instead of rendering individual micro tiles into the chunk canvas, pre-render each 5×5 world unit tile to a ~320×160 offscreen canvas. The chunk terrain cache then composites 25 world unit canvases (for a 25×25 macro-tile-aligned chunk) or stamps them as needed.

Benefits: world unit composites can be reused across multiple chunks that share the same world unit template. If the library has 80 world unit variants and 40 are used in the visible 3×3 chunk area, that's 40 cached composites vs. re-rendering hundreds of individual tiles.

This cache level does not yet exist but would be a natural addition as the world unit template library grows.

---

## 4. Draw Command System

### 4.1 The Problem with Closures

In early versions of the renderer, each object draw was represented as a closure (anonymous function) pushed onto an array, sorted, and executed. This created thousands of closure objects per frame — each containing captured variables for position, scale, emoji, tint — that became garbage at the end of each frame. The garbage collector overhead was measurable and contributed to frame time spikes.

### 4.2 The Pool-Based Solution

The current renderer uses a **pre-allocated pool of draw command structs** (plain objects with typed fields) instead of closures. The pool is allocated once at startup (8192 entries). Each frame, a counter resets to zero, and commands are written into pool entries sequentially. At frame end, only the populated portion of the pool is sorted and executed. No objects are created or garbage collected per frame.

The draw command struct carries:
- Sort key (for depth ordering)
- Command type (tile, emoji, shadow+emoji, item, player)
- Screen position (pixel X, Y)
- Visual parameters (emoji character, scale, tint hue, tile type)
- Flags (shadow, flipX, specific to player rendering)

The sort uses an **index array** (also pre-allocated) and an in-place insertion sort. For the typical 100–500 active draw commands per frame, insertion sort is faster than quicksort due to lower constant overhead and better cache locality.

### 4.3 Draw Command Budget

The renderer enforces a maximum draw command count per frame (currently 400). If the world has more non-base objects in the visible area than this budget allows, the renderer degrades gracefully: base terrain is always drawn (it's cached, not budget-limited), but distant or low-priority objects beyond the budget are simply not drawn. The player and nearby objects always fit within budget. In practice, the 400-command budget is rarely reached with the sparse object cell cache limiting commands to actual non-base content.

---

## 5. Viewport Culling

### 5.1 Chunk-Level Culling

The renderer only processes chunks within the viewport buffer radius (currently 1 chunk in each direction from the camera center chunk). For a 3×3 chunk grid, this means at most 9 chunks are processed per frame. Chunks outside this radius are completely ignored — no terrain blit, no object iteration, no draw commands.

### 5.2 Cell-Level Culling

Within the processed chunks, the sparse object cell list restricts iteration to non-base cells only (typically 50–200 per chunk vs. 1024 total cells). For each non-base cell, a screen-space visibility check (`isVisible`, comparing screen coordinates against canvas bounds with a 64-pixel margin) skips cells that fall outside the visible area. This handles the diamond shape of isometric grids, where a rectangular chunk's corners may extend off-screen.

### 5.3 Terrain Cache Culling

Before blitting a chunk's terrain canvas, a bounds check verifies that the canvas's screen-space rectangle overlaps the visible area. If the entire chunk is off-screen (can happen for diagonal corners of the viewport buffer), the blit is skipped. This is a single rectangle intersection test per chunk — extremely cheap.

---

## 6. WASM Acceleration Targets

### 6.1 WASM's Role in the Architecture

WASM serves as an optional accelerator for compute-intensive, deterministic, batch operations. It does not replace the TypeScript renderer's orchestration logic, canvas API calls, or game mechanics. The relationship is:

- **TypeScript owns:** Game loop, camera tracking, game state management, canvas API calls (`drawImage`, `fillRect`, `fillText`), DOM UI, input handling, LLM communication
- **WASM owns (when active):** Coordinate transforms (grid→screen math batched over hundreds of cells), visibility culling (batch bounds checks), depth sort key computation, and sort execution

The WASM module receives flat arrays of cell data (positions, asset indices, flags) and produces flat arrays of draw commands (screen positions, sort keys, command types). TypeScript reads the draw command output and executes the corresponding canvas API calls.

### 6.2 Current WASM Bridge Status

The WASM bridge exists (`src/wasm-bridge.ts`) with an AssemblyScript module (`wasm/assembly/index.ts`). It implements grid-to-screen coordinate transforms, visibility culling, and depth sorting via shared memory buffers. However, the JS rendering path with the pre-allocated pool and sparse object cell cache currently outperforms the WASM path due to data marshalling overhead (copying cell data into WASM memory and reading draw commands back out). The WASM renderer is currently disabled by default (`RENDER_CONFIG.useWasmRenderer = false`).

### 6.3 When WASM Becomes Advantageous

The WASM path's overhead is fixed per frame (buffer setup, pointer management, result reading), while its benefit scales with the number of operations batched. For the current object counts (100–500 draw commands per frame), the fixed overhead dominates. WASM becomes advantageous when:

- **Object counts grow significantly** — More complex world unit templates with more non-base cells per chunk would increase draw command counts into the 1000–5000 range, where WASM's batch processing advantage overcomes marshalling costs.
- **Auto-tiling computation** — Computing bitmasks for 625 cells per macro tile (or thousands of cells across visible chunks) is a good WASM target. It's a deterministic, batch, array-to-array transform with no canvas API dependency.
- **Constraint propagation** — The AC-3 propagation algorithm for macro assembly (Document 03, Phase 4) involves iterating over possibility sets (bitset operations) in tight loops. WASM's native integer operations and absence of GC overhead would significantly accelerate this solver.
- **Pre-render compositing** — Compositing world unit canvases from micro tile atlases (if the world unit composite cache is implemented) involves hundreds of pixel-copy operations that WASM could batch more efficiently.

### 6.4 WASM Integration Principles

- **WASM should be optional.** Every WASM-accelerated path must have a functionally identical TypeScript fallback. The game must run without WASM (on older browsers, during development, if the WASM module fails to load).
- **Minimize data crossing.** The cost of moving data between JavaScript and WASM memory is the primary bottleneck. Design interfaces to pass large flat buffers (typed arrays) rather than many small values. Use SharedArrayBuffer where available.
- **Keep WASM pure.** The WASM module should have no side effects, no DOM access, no async operations. It takes input arrays, produces output arrays, and returns. TypeScript handles everything else.
- **Measure before optimizing.** Profile with Chrome DevTools. Only move operations to WASM where measured bottlenecks exist. Premature WASMification adds complexity without benefit.

---

## 7. Pre-Render Policy

### 7.1 What Gets Pre-Rendered

- All micro tile SVGs → isometric diamond canvases (at startup)
- All emoji characters → cached sprite canvases (on first use)
- All character sprite frames → cached Image elements (on first use)
- All shadow ellipses → cached canvases (on first use, by quantized scale)
- All chunk base terrain layers → cached chunk canvases (on chunk generation)
- Future: all world unit tile composites → cached composite canvases (on chunk generation or on first use)

### 7.2 What Gets Drawn Live

- Non-base objects (obstacles, NPCs, items, decorations) — drawn from cached sprites/emoji caches but positioned and depth-sorted live each frame
- Player character — drawn from cached sprite frames but positioned, flipped, and animated live
- Shadows — drawn from cached shadow sprites but positioned live
- UI/HUD — DOM elements, updated on throttled schedule

### 7.3 The Pre-Render/Live Boundary

The boundary between pre-rendered and live-drawn content follows one principle: **If it does not move or change between frames, pre-render it. If it might change position, visibility, or appearance between frames, draw it live from cached components.**

Base terrain never moves (the camera moves, but the terrain is blitted with coordinate offsets, not re-rendered). Objects theoretically never move either (NPCs are stationary, items are stationary), but their visibility changes as the camera moves, and items can be collected (removed from the scene). The overhead of responding to these changes by invalidating and re-rendering a full chunk canvas is worse than drawing objects live from cached sprites.

The optimal strategy is to pre-render the maximum possible base content and draw the minimum possible dynamic content. The sparse object cell cache (typically 50–200 entries per chunk instead of 1024 total cells) keeps the live-drawn workload small.

---

## 8. Invalidation Rules

### 8.1 Micro Tile Atlas Invalidation

Never. The micro tile SVGs are immutable game assets. If the game adds or modifies tile types, the atlas is rebuilt at startup.

### 8.2 Chunk Terrain Cache Invalidation

Only when the chunk's base-layer cell data changes. In practice, this never happens during gameplay — the generation pipeline produces chunks' base terrain once, and gameplay interactions (collecting items, unlocking doors) modify cell properties (itemId, resolved flag) without changing the base terrain.

If a future feature allows terrain modification (digging, building, environmental destruction), it would trigger invalidation of the affected chunk's terrain cache. The cache would be rebuilt on the next render frame.

### 8.3 Object Cell List Invalidation

When a cell's non-base content changes:
- Item collected → itemId cleared → cell no longer in object list (or its draw command changes)
- Obstacle resolved → assetKey changes from locked door to open door → draw command changes
- NPC departs → npcId cleared (future feature)

The invalidation function (`invalidateObjectCache`) deletes the affected chunk's cached object list. It is rebuilt from the chunk's cell data on the next render frame. This is cheap (one scan of 1024 cells, building a list of ~50–200 non-base entries) and happens rarely (only on player interaction events, not every frame).

### 8.4 Cascade Invalidation

When a world unit tile within a macro tile changes (which should be very rare, as this would be a generation-time event rather than gameplay-time), the invalidation cascades:
- The affected micro cells' data changes
- The parent chunk's terrain cache is invalidated (if base cells changed)
- The parent chunk's object cell list is invalidated (if non-base cells changed)
- Adjacent chunks' auto-tiling bitmasks along the shared border may need recomputation (if the changed cells are on a chunk boundary)

Cascade invalidation is a generation-time concern, not a runtime concern. During gameplay, the world is static at the structural level.

---

## 9. Performance Contracts

### 9.1 Frame Time Budget

Target: 60 FPS = 16.67ms per frame. The renderer should not consume more than 10ms of this budget, leaving ~6ms for game logic, input processing, and browser overhead.

Target breakdown:
- Ground fill: <0.1ms (one `fillRect`)
- Terrain blits: <2ms (3–9 `drawImage` calls for cached chunk canvases)
- Object draw commands: <5ms (100–500 draw commands from cached sprites)
- Sort: <0.5ms (insertion sort on 100–500 indices)
- UI sync: <0.5ms (throttled to every 5th frame, minimal DOM updates)
- Overhead: <2ms (camera math, pool reset, visibility checks)

### 9.2 Memory Budget

Target: <200MB total for all rendering caches.
- Micro tile atlas: ~4MB (with auto-tiling variants)
- Emoji sprite cache: ~1MB
- Character sprites: <1MB
- Shadow sprites: <1MB
- Chunk terrain caches: ~80MB (9 chunks × ~9MB each at full resolution; reduce with resolution scaling)
- Draw command pool: <1MB (8192 structs)
- Object cell lists: <1MB (sparse lists for visible chunks)

The largest consumer is chunk terrain caches. Resolution scaling, smaller chunk sizes, or aggressive eviction can reduce this if memory pressure is observed on target hardware.

### 9.3 Initialization Budget

Target: <3 seconds from page load to first interactive frame.
- Micro tile atlas pre-rendering: <500ms (8 tile types, each requiring SVG parse + isometric transform)
- LLM health check: <5000ms (with timeout; game gates on this but shows splash screen)
- Initial chunk generation: <200ms (spawn chunk + immediate neighbors)
- Initial terrain cache build: <500ms (3–9 chunk canvases)

The LLM health check is the longest initialization step. The game shows a splash screen with loading progress during this wait. If the check times out, the game continues with RNG-only entropy.

---

## 10. Isometric Projection Details

### 10.1 Coordinate Transform

The world exists on a flat 2D grid in "world space." The isometric projection is a visual transform applied at render time. The transform maps grid coordinates (gx, gy) to screen pixel coordinates (sx, sy):

- The X component: screen X = (gx - gy) × (tileWidth / 2) relative to camera center
- The Y component: screen Y = (gx + gy) × (tileHeight / 2) relative to camera center
- Canvas centering: screenX += canvasWidth / 2; screenY += canvasHeight / 3

This produces a diamond grid where moving right in world space goes to the "southeast" on screen, and moving down goes to the "southwest."

### 10.2 Depth Sorting

Objects are drawn in Y-ascending order (north to south in world space). Objects with higher Y-coordinates draw later, covering previously drawn objects. For objects at the same Y, taller objects (higher height value) draw later. The sort key formula: `sortKey = worldY + (height × 0.1)`.

The 0.1 height multiplier ensures that tall objects at the same Y position occlude shorter ones (a tree covers a mushroom at the same Y), but a short object one Y-unit further south still draws on top of a tall object further north (matching visual expectation in isometric view).

### 10.3 Camera Tracking

The camera follows the player with the player centered on screen (with Y offset to account for player character height). Camera coordinates are in world space. The renderer computes all screen positions relative to the camera center, which is subtracted from world positions before the isometric transform.

---

## 11. Summary

The rendering pipeline is a performance-critical system that consumes world data and produces 60 FPS screen output. Its architecture relies on:

1. **Layered drawing** — Ground fill → cached terrain → depth-sorted objects → UI
2. **Aggressive caching** — Pre-rendered tile atlases, chunk terrain canvases, emoji sprites, shadow sprites, character sprites
3. **Sparse iteration** — Object cell lists avoid processing thousands of base terrain cells
4. **Pool-based draw commands** — Pre-allocated structs with insertion sort avoid per-frame GC pressure
5. **Viewport culling** — At chunk level, cell level, and terrain cache level
6. **Optional WASM acceleration** — For batch transforms, auto-tiling computation, and solver operations when scale justifies the marshalling overhead
7. **Throttled UI updates** — DOM sync every Nth frame, not every frame

The rendering pipeline does not generate content — it only visualizes content produced by the generation pipeline (Document 03). The interface between them is the chunk data structure containing cell grids, asset keys, and cache metadata.

Refer to Document 05 for the population and progression logic that determines what objects appear in the world for the renderer to draw.
