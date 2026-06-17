---
description: "Use when optimizing performance, profiling, or editing hot-path code. Covers allocation avoidance, throttling, chunk management, and god-file prevention."
applyTo: "src/**"
---

# Performance Guidelines

## Hot-Path Rules (render loop, update loop)
1. **Zero allocations** — no `new`, no spreads, no `.map()/.filter()/.reduce()`, no closures.
2. **Pre-allocate pools** — see `DrawCmd` pool pattern in `src/rendering/render.ts` (8192 entries).
3. **Insertion sort** for small arrays (<500) — avoids sort() allocation overhead.
4. **Numeric cache keys** — no string concatenation for hash keys in tight loops.

## Throttling
| System | Throttle | Location |
|---|---|---|
| Bottom HUD bar sync | Every frame (cheap, just textContent) | `src/ui/hud.ts` |
| Sidebar stats | Every 8th frame (~8fps) | `src/ui/sidebar.ts` |
| Status bars | Every 12th frame (~5fps) | `src/ui/status-bars.ts` |
| Audio UI sync | Every 10th frame (~6fps) | `src/ui/audio-ui.ts` |
| Inventory tray | Every frame (only when expanded) | `src/ui/inventory-tray.ts` |
| Debug overlay | Every frame (only when F3 visible) | `src/ui/debug-overlay.ts` |
| Animation frames | `animFrame` counter, not every rAF | `src/main.ts` |
| Weather updates | Every N frames | `src/rendering/weather.ts` |
| Thought bubble checks | Periodic scan | `src/main.ts` |
| Positional audio scan | On chunk change | `src/main.ts` |
| Chat log auto-scroll | Every 2nd frame | `src/ui/chat-log.ts` (if exists) |

## Chunk Management
- Load chunks only when player crosses chunk boundaries.
- Evict distant chunks to prevent memory growth.
- Terrain cache (`src/rendering/terrain-cache.ts`) composites chunk terrain to
  offscreen canvas — invalidate on biome/tile change.

## WASM Bridge
`src/rendering/wasm-bridge.ts` provides optional WASM acceleration for
coordinate transforms and sorting. Falls back to JS if WASM unavailable.
The WASM path is partial — most drawing still happens in JS.

## Profiling
- `src/engine/perf.ts` tracks frame times and reports via `__gameDebug`.
- F3 key toggles debug overlay with FPS and render stats.
- `tests/perf/frame-time-triage.spec.ts` validates frame budget.

## Performance Bug Patterns to Avoid

1. **String concatenation in tight loops** — `const key = \`${x},${y}\`` in a per-frame
   loop allocates. Use numeric encoding: `(x << 16) | y`.
2. **`Array.from()` + `.map()` in hot path** — pre-allocate once and reuse.
3. **`document.createElement()` per frame** — cache DOM nodes, mutate `.textContent` / `.style`.
4. **`getElementById()` per frame** — cache the reference at module scope.
5. **JSON.parse / JSON.stringify** in hot path — use structured data or pre-parse.
6. **`await` inside synchronous-looking code** — splits execution, can cause GC pauses.

## God-File Prevention (Performance Angle)

Large files often hide performance issues because the overhead is amortized
across unrelated code paths. Watch for:

1. A single function doing many things — split so you can profile each piece.
2. **Mixed hot + cold code in the same file** — e.g., `render.ts` having both
   per-frame drawing AND LLM/save logic. The B-series decomposition (B6) split
   these so profiling is clearer.

See `.github/instructions/architecture.instructions.md` for module size discipline.

## Pre-Commit Checks

```bash
# Typecheck
npx tsc --noEmit

# Performance regression tests
npx playwright test tests/perf/ --reporter=line

# Manual: profile with browser devtools or F3 debug overlay
npm run dev  # localhost:5173, press F3 for FPS/perf panel
```

## Cross-References

- `.github/instructions/architecture.instructions.md` — god-file prevention
- `.github/instructions/rendering.instructions.md` — render zero-alloc rules
- `src/engine/perf.ts` — perf tracking