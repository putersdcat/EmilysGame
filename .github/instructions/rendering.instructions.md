---
description: "Use when editing rendering code — render.ts, terrain-cache.ts, local-lights.ts, shadows.ts, fog.ts, lighting.ts. Covers zero-allocation hot-path rules and Camera type consolidation."
applyTo: "src/rendering/{render,terrain-cache,local-lights,shadows,fog,lighting}.ts"
---
# Rendering Pipeline Rules

## Zero-Allocation Hot Path
The render loop runs at 60fps. **Never allocate in the hot path:**
- ✅ Use pre-allocated DrawCmd pool (8192 entries in render.ts)
- ✅ Use insertion sort for small arrays (<500 items)
- ✅ Cache shadow ellipses; invalidate only on angle/stretch change
- ❌ No `new Object()`, `Array.map()`, `Array.filter()`, spread operators, or closures
- ❌ No string concatenation for cache keys — use numeric hashing

## Camera Type Duplication ✅
`Camera` was duplicated in `render.ts` and `local-lights.ts`. **Resolved in B6.1 (#269)** —
moved to `src/types/game.game.types.ts` and re-exported from `render.ts` for backward
compat. `local-lights.ts` now imports from there.

## B6 Sub-Modules (Decomposed from render.ts)
After B6.1–B6.5, `src/rendering/` has these focused modules:
- `projection.ts` — `gridToScreen()`, `isVisible()` (pure, zero-alloc)
- `shadow-cache.ts` — `ShadowSpriteCache` class (#83 dynamic shadows)
- `mouth-animation.ts` — NPC mouth-flap + head-bob (#113)
- `debug-grid.ts` — `drawDebugGrid()` (F3 toggle, pure function)
- `render.ts` — orchestrator class with main `render()`/`renderWasm()`/`renderAuto()`

## State Mutation Warnings
- `_headBobPhase += 0.05` in `getHeadBob()` — mutates state inside a getter. Not frame-rate deterministic.
- `_renderFrameCount++` — fire animation timing depends on frame count, not elapsed time.
- **Prefer `deltaTime`-based animation** over frame-count-based.

## WASM Path
`renderAuto()` selects JS or WASM path. The WASM path still does most drawing in JS (only transforms + sort in WASM). When editing, maintain both paths or document that WASM path is deprecated.
