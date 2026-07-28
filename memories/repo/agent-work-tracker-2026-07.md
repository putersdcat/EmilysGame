# Agent Work Tracker — Playability & Feel Recovery (2026-07)

**Owner:** autonomous agent session(s) · **Branch:** `experiment/isometric-2.0`
**Purpose:** long-horizon log of diagnosis-driven fixes to make the documented
vision actually playable/fun. Read this + `design-playable-session-recovery.md`
before starting new work. Update at each landed slice.

---

## North-star (from Docs 01/02 + AGENTS.md)

- 5–15 min satisfying session: spawn → move reliably → real quiz gate → fail
  gently → open → leave → see another intentional place.
- Flat sim owns walkability/progression; iso2 is paint only.
- Success = **playtest feel**, not only green tests.

## Method (what works here)

1. Boot the real game (`npx vite` → `http://localhost:5173/?test=1`), drive with
   Playwright MCP, measure with `__gameDebug.getFrameBenchmark()` + canvas-call
   instrumentation. Do NOT guess from code alone.
2. Fix the measured hotspot; verify with `npx tsc --noEmit` (only pre-existing
   `iso2-assemblies.ts` errors are acceptable) + targeted Playwright.
3. For "feel" bugs, suspect **frame-count-based timers** — see recurring bug below.

---

## Landed slices (committed)

### Slice 1 — Render perf (the big one) · commit `c6da6e1`
- **Bug:** every wall/fence/gate nano tile re-ran full procedural pipeline
  (extrusion + per-pixel weathering scatter) every frame, uncached.
  ~11,900 fillRect/frame; render 27–33ms; ~14–34 FPS. This was the root of
  "too slow to be playable."
- **Fix:** `src/rendering/nano-object-cache.ts` bakes each nano tile once to
  offscreen canvas, blits thereafter. Integer-pixel blits for terrain/water/nano.
- **Result:** render ~5ms, FPS ~500. All 23 rendering tests pass.

### Slice 2 — Frame-rate-independent movement · commit `c6da6e1`
- **Bug:** movement was fixed `0.08` grid/frame, no dt; camera lerp per-frame.
  Speed varied 2× between 60Hz/120Hz, stuttered on hitches.
- **Fix:** dt-scaled movement + camera in `main.ts` (clamped vs stalls).

### Slice 3 — De-blur textures · commit `c6da6e1`
- Removed fractional-resample blur (integer blits). Added crisp high-freq detail:
  water glint/ripples, dirt grain, grass speckle.
- **NOTE:** remaining tile-edge softness is the *intended* #84 terrain-blend art
  direction. The user's reported "blur" turned out to be the **dehydration
  health overlay** (`updateBlurOverlay`) firing because status hit zero — see Slice 4.

### Slice 4 — Status drain too fast (frame-count timer) · (uncommitted → commit next)
- **Bug:** `tickStatus` throttled by frame count (every 300 frames, "~5s @60fps").
  After Slice 1 raised FPS to ~500, it ticked every ~0.6s → status drained ~8×
  too fast → energy/hydration/cleanliness hit 0 in under a minute → dehydration
  blur overlay + speed debuffs. **This is what the user actually saw as "blur."**
- **Fix:** `status.ts` now time-based (`TICK_INTERVAL_MS = 5000`, dtMs param);
  `resetTickCounter` → resets ms accumulator. Threaded dtMs through
  `tickSubsystems`. **Verified live:** 12s → 2 ticks, hydration 100→98.5 ✓.

---

## RECURRING BUG PATTERN — frame-count timers (audit before more feel work)

The game loop used to run ~60fps, so several systems tuned "every N frames."
After Slice 1 the loop is much faster, so **any frame-count timer now fires too
often.** Audit + convert to dtMs/time-based:

| System | File | Mechanism | Status |
|--------|------|-----------|--------|
| Status drain | `game/status.ts` | was 300 frames → time-based | ✅ FIXED (957142d) |
| Footsteps | `game/audio/sfx.ts` | was 12 frames → ~5/sec time-based | ✅ FIXED (387de3a) |
| Player walk anim | `game/player-visuals.ts` | was 6 frames → ~10fps time-based | ✅ FIXED (387de3a) |
| Water anim | `rendering/terrain-cache.ts` `tickWaterAnimation` | was 15 frames → ~250ms | ✅ FIXED (77fd017) |
| Fire/shadow/frame-cycle | `render.ts` `_renderFrameCount` | was +1/frame → real-time scale | ✅ FIXED (206546e) |
| Wildlife ticks | `game/wildlife.ts` | audited — no frame-count cadence | ✅ clean |
| Light flicker / minimap | `local-lights.ts`, `minimap.ts` | continuous-phase / cost-throttle only | ✅ not cadence bugs |

**Audit complete.** All periodic-cadence timers are now real-time. Remaining
frame counters are continuous phases (fire/light flicker via `sin(t)`) or pure
cost-throttles (minimap redraw) — neither is a "machine-gun" cadence bug.

## Asset inventory finding (2026-07-18) — placeholder concern is mostly a non-gap

User asked to replace emoji placeholders with procedural assets. Measured via
`__gameDebug.getAssetDefs()` + `hasAssetSprite()` + live teleports:

- **Structures** (starter_cottage/wall_plaster/roof×3, castle_keep,
  cathedral_chapel/wall): have `tileType` → render as **procedural nano
  geometry** (stone walls, fences, roofs). Emoji is only an unused fallback.
  Verified live — homestead renders as real stone+fence+roof, no emoji.
- **NPCs** (merchant, villager, guardian, farmer, beekeeper, ranger, hermit,
  miner, knight): render via the **parametric paper-cut sprite system**
  (`npc-sprites.ts` NPC_APPEARANCES) — recombinant parts/colors/hats, not emoji.
  Only ghost + cats intentionally stay emoji (non-human).
- **Covered by SVG asset sprites:** trees, plants, collectibles, fire (animated),
  gates, signs, chest, house/shop/hut/outhouse, bridge, animals (chicken…horse).

**Conclusion:** the world is already procedural/parametric, not emoji-placeholder.
The visual "soft/blurry" impression was (a) the resample bug (fixed) and (b) the
dehydration health overlay (fixed), not missing assets. Remaining asset work is
*polish/variety*, not replacing missing coverage.

## Core-loop playtest verification (2026-07-18) — WORKS end-to-end

Drove the live game (`?test=1`) through the full Doc-01 loop with synthetic input:
spawn → move (dt-consistent) → quiz_gate → dialog → quiz open → wrong answer
(retriable, no softlock) → correct answer → reward (coins 12→17, +5) → gate
opens (sparkle gate removed) → game unpauses. Status stayed healthy throughout
(99/99/100 — no instant-zero drain). Player/camera/movement/anim all coherent.

This confirms the 5–15 min core-loop promise is functionally intact after the
perf + status + timer fixes. Remaining work is *content/polish*, not core function.

## Test-verification notes (2026-07-18)
- **Rendering batch (23 tests): PASS** with all changes (terrain-blend, visual,
  weathering, pipeline, wall/fence).
- **Fire primitives (6): PASS.**
- **Full render suite (176 tests): 171 pass, 4 fail — ALL 4 pre-existing on clean
  HEAD** (verified via stash baseline):
  - `iso2-nano-main-port` — `ISO_DIAMOND_WIDTH` expects 256, config is 128
    (config drift; nothing to do with perf/timer changes).
  - `iso2-v3-water-basin-r2` — `centerRatio` 0.274 vs 0.28 threshold (pre-existing
    threshold drift; my basin tweak kept bright-only flecks to not worsen it).
  - `perf-benchmark` fps floor + `svg-asset-sprites` frame-count — env flakes under
    the 56-min full-suite load (game runs ~345fps solo).
- **Pre-existing flaky gameplay (NOT regressions, verified via stash):**
  `injury-system.spec.ts` (~8 fail on HEAD too), `debuff-visuals.spec.ts`
  (6 fail on HEAD, only 3 with my fix — my status fix made it *more* stable),
  `quiz-gate-retry-loop.spec.ts:158` (fails on HEAD too). Test-isolation hygiene
  task — separate from playability work.

**Rule going forward:** anything that must happen "every T seconds of real time"
must accumulate `dtMs`, never count frames. Cosmetic-only frame ties (anim frame
index, wave phase) are acceptable but should be re-tuned if they look frantic.

---

## Backlog / next candidates (pick by playtest impact)

1. **Audio SFX/ambience "hiss"** — oscillator SFX+ambience are DISABLED in code
   (awaiting OGG samples per #147/#149). Hiss is likely sampled `rain_loop`/
   `wind_loop` or MIDI/soundfont layer. Needs a *live listen* (can't headless) —
   ask user to confirm which sound, then trace `sampled-sfx.ts` / music.
2. **Verify remaining frame-count timers** (table above) — quick wins.
3. **Playtest the core loop end-to-end** (spawn→coin→gate→quiz→reward) and fix
   the first thing that breaks the 5–15 min promise. Ref `design-playable-session-recovery.md`.
4. **Boot cost** — boot.assets ~3.7s (SVG preload) + ensureChunks ~0.44s. Acceptable
   but watch on cold load.
5. **Pre-existing flaky tests** — `tests/gameplay/injury-system.spec.ts` fails
   identically on clean HEAD (test-isolation). Not a regression; fix separately.

## Known pre-existing issues (do NOT attribute to this work)
- `tsc`: 2 errors in `src/engine/iso2-assemblies.ts` (TS6133 unused, TS7053 index).
- `tests/gameplay/injury-system.spec.ts`: ~8–10 fail on clean HEAD (flaky/isolation).
