# Gameplan for Transitioning to a Performant WASM Core in Emily's Game

## Overview
This document outlines a structured gameplan for transitioning the game's rendering core to WASM (WebAssembly) to address performance issues observed in the PoC (e.g., jerky movement, inefficient sprite handling). The approach is hybrid: Retain high-level logic, UI, event handling, and game mechanics in TypeScript/JavaScript, while offloading compute-intensive rendering tasks (e.g., sprite transformations, primitive drawing, batching) to WASM compiled from C++, Rust, or C. This leverages WASM's near-native speed for Canvas updates, potentially doubling FPS on target hardware (8th Gen i7, GTX 1050).

The plan is MVP-focused: Start small, measure gains, iterate. It's practical and common in web game dev (e.g., Unity WebGL exports, custom Rust engines). Estimated timeline: 1-2 weeks for initial integration, assuming familiarity with TS/Canvas.

Key Benefits:
- **Performance**: WASM handles pixel ops/batching faster than JS (no GC pauses, optimized loops).
- **Maintainability**: JS stays for app flow; WASM isolated to rendering.
- **Compatibility**: 98% browser support in 2026; fallback to pure JS if needed.

Potential Risks:
- Data transfer overhead (mitigate with shared memory like ArrayBuffers).
- Build complexity (mitigate with tooling like Emscripten/wasm-pack).
- Debugging (mitigate with console logs and simple functions).

## Prerequisites
- **Profile Current App**: Use Chrome DevTools (Performance tab) to confirm bottlenecks (e.g., render loop, sprite math). Target areas: Primitive drawing, isometric transforms, occlusion sorting.
- **Repo Setup**: Ensure Vite/TS build works; add a `wasm/` folder for source code.
- **Tools Installation**:
  - Rust: Install rustup, wasm-pack (for Rust targets).
  - C/C++: Install Emscripten SDK (emcc compiler).
  - Node: Add scripts to package.json (e.g., "build-wasm": "wasm-pack build").
- **Dependencies**: None new for JS; web-sys crate for Rust (Canvas bindings).

## Step-by-Step Transition Plan
Follow this phased MVP approach to minimize disruption. Each step includes tests and rollback options.

### Phase 1: Research and Setup (1-2 Days)
- **Choose Language**: 
  - Rust: Recommended for safety/modernity (use wasm-bindgen for JS calls).
  - C++: If preferring familiarity (Emscripten generates JS glue).
  - Avoid ANSI C (outdated; use C++ for structs).
- **Prototype a Simple WASM Module**: 
  - Write a test function (e.g., `add_primitives(buffer, primitives_array)`—takes ArrayBuffer, draws to it).
  - Compile: `wasm-pack build --target web` (Rust) or `emcc primitive.c -s EXPORTED_FUNCTIONS="['_draw']" -o primitive.wasm` (C++).
- **Integrate Test in TS**: 
  - Load: `const module = await WebAssembly.instantiateStreaming(fetch('primitive.wasm'));`.
  - Call: `module.instance.exports.draw(myBuffer);` then `ctx.putImageData(new ImageData(myBuffer, width, height), 0, 0);`.
- **Test**: Render a single primitive (e.g., grass tile) via WASM; compare FPS to JS version.
- **Rollback**: If issues, keep pure JS renderer as toggle in options.

### Phase 2: Isolate and Migrate Rendering Bottlenecks (3-5 Days)
- **Target Functions**:
  - Primitive Drawing: Move SVG/path rendering to WASM (e.g., compute pixel data for microtiled chunks).
  - Isometric Transforms: Offload coordinate math/batching (e.g., skew/offset calculations for 5x5 chunks).
  - Occlusion/Sorting: WASM sorts height arrays, returns draw order.
  - Animation Cycles: Handle frame interpolation (e.g., water ripples) in WASM for smoother loops.
- **Data Flow**:
  - JS passes typed arrays (e.g., Uint8ClampedArray for pixels) to WASM.
  - WASM processes (e.g., fills buffer with RGBA data) and returns modified buffer.
  - Use SharedArrayBuffer for zero-copy if multi-threaded (experimental in browsers).
- **Best Practices**:
  - Batch Calls: One WASM call per frame for all primitives (avoid per-tile overhead).
  - Memory Management: Free WASM allocs manually (e.g., `_free(ptr)` in C++).
  - Error Handling: JS catches WASM exceptions; fallback to JS renderer.
- **Test**: Benchmark full chunk render (5x5 with overlays); aim for <5ms per frame. Verify occlusion/movement in isometric view.

### Phase 3: Full Integration and Optimization (3-5 Days)
- **Hybrid Architecture**:
  - JS/TS: Game loop, input, UI, entropy hashing, solver logic (gen.ts calls WASM for visual prep).
  - WASM: Pure rendering engine—takes chunk metadata, outputs framebuffer for Canvas.
- **Pipeline**:
  - Solver generates chunk data (JSON-like structs).
  - JS passes to WASM: `renderChunk(chunkData, buffer)`.
  - Canvas: `ctx.putImageData(bufferData, x, y)`.
- **Optimizations**:
  - Precompile WASM with -O3 flags.
  - Use WebGPU if available (for GPU-accelerated WASM rendering).
  - OffscreenCanvas: Render in worker thread, postMessage buffer to main.
- **Configurability**: Options menu toggle: "Use WASM Renderer" (detect support; fallback JS).
- **Test**: Full PoC run—movement behind trees, river animation, no arm quirks. Profile on target hardware; compare to pure JS.

### Phase 4: Deployment and Iteration (1-2 Days)
- **Build Pipeline**: Add to package.json: "build-wasm": "wasm-pack build", then Vite bundles WASM file.
- **GitHub Actions**: Extend deploy.yml to run WASM build before Pages push.
- **Monitoring**: Add console FPS counter; log WASM errors.
- **Iteration**: If gains insufficient, profile again—add multi-threading (WASM workers) or SIMD.
- **Rollback**: Pure JS mode always available.

## Resources and Examples
- Rust: wasm-game-of-life demo (Mozilla); rust-wasm-book for bindings.
- C++: Emscripten Canvas examples (emscripten.org/docs/porting/multimedia_and_graphics.html).
- Real Projects: "Rust WASM Canvas Renderer" on GitHub (e.g., rust-canvas-draw); "WASM Sprite Engine" searches show 2D game demos.

This plan gets you performant rendering without overhauling everything. If you need a skeleton code file (e.g., Rust primitive renderer), let me know!