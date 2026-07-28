---
description: "Use when editing rendering code — src/rendering/*, src/types/game.types.ts (Camera), and the new B6 sub-modules. Covers zero-allocation hot-path rules and god-file prevention."
applyTo: "{src/rendering/**,src/types/game.types.ts}"
---

# Rendering Pipeline Rules

## Zero-Allocation Hot Path
The render loop runs at 60fps. **Never allocate in the hot path:**
- ✅ Use pre-allocated DrawCmd pool (8192 entries in `render.ts`)
- ✅ Use insertion sort for small arrays (<500 items)
- ✅ Cache shadow ellipses; invalidate only on angle/stretch change
- ❌ No `new Object()`, `Array.map()`, `Array.filter()`, spread operators, or closures
- ❌ No string concatenation for cache keys — use numeric hashing

## B6 Decomposition (issue #269)

`src/rendering/render.ts` was decomposed in B6.1–B6.5 into 5 focused modules.
The orchestrator (704 lines, hard ceiling **800 lines**) plus:

| Module | Lines | Responsibility |
|---|---|---|
| `src/rendering/projection.ts` | 25 | Pure `gridToScreen()` / `isVisible()` — zero-alloc |
| `src/rendering/shadow-cache.ts` | 76 | `ShadowSpriteCache` class (#83 dynamic shadows) |
| `src/rendering/mouth-animation.ts` | 52 | NPC mouth-flap + head-bob (#113) |
| `src/rendering/debug-grid.ts` | 130 | `drawDebugGrid()` (F3 toggle, pure function) |

**Camera type** consolidated in `src/types/game.types.ts` (B6.1). Re-exported from
`render.ts` for backward compat; `local-lights.ts` now imports from `types/`.

## `src/rendering/` Sub-Directory Inventory

```
src/rendering/
  ├── render.ts              ← 704 lines — IsometricRenderer class (orchestrator)
  ├── terrain-cache.ts       ← chunk terrain composite cache
  ├── local-lights.ts        ← bonfires, flashlight, point/cone lights
  ├── shadows.ts             ← dynamic shadow params (#83)
  ├── fog.ts                 ← atmospheric fog
  ├── lighting.ts            ← day/night cycle + ambient overlay
  ├── weather.ts             ← weather particles + state
  ├── particles.ts           ← butterfly/sparkle/leaf/bird
  ├── wasm-bridge.ts         ← optional WASM acceleration
  ├── nano-tile.ts           ← drawNanoStack / drawExtrudedNano
  ├── nano-tile-defs.ts      ← tile type → stack dispatch
  ├── nano-tile-svgs.ts      ← SVG painters for nano tiles
  ├── tiles.ts               ← getIsoTile + TileType
  ├── emoji-cache.ts         ← emoji sprite cache
  ├── projection.ts          ← B6.2 — pure projection math
  ├── shadow-cache.ts        ← B6.3 — ShadowSpriteCache
  ├── mouth-animation.ts     ← B6.4 — NPC mouth + head-bob
  └── debug-grid.ts          ← B6.5 — F3 debug grid overlay
```

## State Mutation Warnings

- `_headBobPhase += 0.05` in `getHeadBob()` (now in `mouth-animation.ts`) —
  mutates state inside a getter. Not frame-rate deterministic.
- `_renderFrameCount++` in render.ts — fire animation timing depends on frame
  count, not elapsed time.
- **Prefer `deltaTime`-based animation** over frame-count-based.

## WASM Path

`renderAuto()` selects JS or WASM path. The WASM path still does most drawing
in JS (only transforms + sort in WASM). When editing, maintain both paths or
document that WASM path is deprecated.

## Adding New Rendering Code

1. **Pure functions first.** Projection, viewport-culling, footprint tests, and
   overlay drawing go in dedicated modules (the B6 pattern).
2. **Stateful caches** (sprite caches, lightmaps) get their own class file
   (e.g., `ShadowSpriteCache`). The renderer holds an instance and delegates.
3. **Per-frame DOM sync** (debug overlay, status bars) goes in `src/ui/` —
   not here. Rendering layer only touches the canvas.
4. **Module-level state** (caches, animation phases) is allowed only when
   it's truly per-renderer-instance. Prefix with `_` and document it.

## Pre-Commit Checks

```bash
# Typecheck
npx tsc --noEmit

# Targeted: rendering tests
npx playwright test tests/rendering/ --reporter=line

# Module size scan — catch any new god-file growth
python tools/refactor/find-large-functions.py src/rendering/ --min-lines 70
```

## Cross-References

- `.github/instructions/architecture.instructions.md` — god-file prevention
- `.github/instructions/performance.instructions.md` — hot-path + throttling
- `.github/instructions/iso2-main-port.instructions.md` — experiment port contract
- `Docs/RefactoringPlan_11-06-26.md` — B6 series plan