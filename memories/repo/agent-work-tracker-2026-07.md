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
| Status drain | `game/status.ts` | was 300 frames → now time-based | ✅ FIXED |
| Water anim | `rendering/terrain-cache.ts` `tickWaterAnimation` | every 15 frames (~4fps@60) | ⬜ faster now — cosmetic, low pri |
| Player walk anim | `game/player-visuals.ts` `ANIM_FRAME_THROTTLE` | every N frames | ⬜ cosmetic, check |
| Footsteps | `game/audio/sfx.ts` `_footstepCounter` | counter | ⬜ check cadence |
| Fire anim | `render.ts` `getFireAnimation(frameCount)` | `_renderFrameCount` | ⬜ cosmetic |
| Wildlife/ambient ticks | `game/wildlife.ts`, thought-bubbles | various | ⬜ audit |
| Minimap | `rendering/minimap.ts` every 10th frame | throttle | ⬜ fine (just cheaper) |

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
