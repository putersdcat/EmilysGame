---
description: "Use when optimizing performance, profiling, or editing hot-path code. Covers allocation avoidance, throttling, and chunk management."
---
# Performance Guidelines

## Hot-Path Rules (render loop, update loop)
1. **Zero allocations** — no `new`, no spreads, no `.map()/.filter()/.reduce()`, no closures.
2. **Pre-allocate pools** — see `DrawCmd` pool pattern in render.ts (8192 entries).
3. **Insertion sort** for small arrays (<500) — avoids sort() allocation overhead.
4. **Numeric cache keys** — no string concatenation for hash keys in tight loops.

## Throttling
| System | Throttle | Location |
|---|---|---|
| DOM UI sync | Not every frame | `ui.ts` (throttled via frame counter) |
| Animation frames | `animFrame` counter, not every rAF | `main.ts` |
| Weather updates | Every N frames | `weather.ts` |
| Thought bubble checks | Periodic scan | `main.ts` |
| Positional audio scan | On chunk change | `main.ts` |

## Chunk Management
- Load chunks only when player crosses chunk boundaries.
- Evict distant chunks to prevent memory growth.
- Terrain cache (`terrain-cache.ts`) composites chunk terrain to offscreen canvas — invalidate on biome/tile change.

## WASM Bridge
`wasm-bridge.ts` provides optional WASM acceleration for coordinate transforms and sorting. Falls back to JS if WASM unavailable. The WASM path is partial — most drawing still happens in JS.

## Profiling
- `perf.ts` tracks frame times and reports via `__gameDebug`.
- F3 key toggles debug overlay with FPS and render stats.
- `tests/perf/frame-time-triage.spec.ts` validates frame budget.
