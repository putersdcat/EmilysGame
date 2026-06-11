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

## Camera Type Duplication 🔴
`Camera` is defined in BOTH `render.ts` AND `local-lights.ts` — these are identical duplicates.
**Fix:** Move to `src/types/game.types.ts` and import from there.

## State Mutation Warnings
- `_headBobPhase += 0.05` in `getHeadBob()` — mutates state inside a getter. Not frame-rate deterministic.
- `_renderFrameCount++` — fire animation timing depends on frame count, not elapsed time.
- **Prefer `deltaTime`-based animation** over frame-count-based.

## WASM Path
`renderAuto()` selects JS or WASM path. The WASM path still does most drawing in JS (only transforms + sort in WASM). When editing, maintain both paths or document that WASM path is deprecated.
