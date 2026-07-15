# B→A Plan: Live feel baseline → Gate unavoidability

**Date:** 2026-07-15  
**Branch:** `experiment/isometric-2.0`  
**Goal:** Confirm tooling works *before* any generation changes, establish a
play-feel baseline, then implement quiz-gate unavoidability (Docs `13` §2 #1)
with measurable before/after proof.

**Source docs:** `Docs/12`, `Docs/13`, `Docs/archive-2026-07-14/Next-Engine-And-Gameplay-Plan.md`,
`memories/repo/gameplay-feel-audit-2026-07-13.md`, `ObstacleSolver.placeQuizGates`.

---

## Tooling verification (DONE this session — GO for B)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ clean (exit 0) |
| Vite `http://127.0.0.1:5173/` | ✅ ready (~2.6s) |
| Playwright + `?test=1` + `__gameDebug` | ✅ works |
| `quiz-gate-retry-loop.spec.ts` (2 tests) | ✅ **2/2 passed** (~25s) |
| `gate-interaction-after-natural-collision.spec.ts` | ⚠️ **1/2** — see baseline finding below |

**Conclusion:** The stack needed for B and A works end-to-end on this machine.
We will not start generation code until Phase B metrics are recorded.

### Baseline finding already (reproducible today)

Natural single-arrow approach to a gate on the diagonal path **failed Space
trigger** in one smoke run:

- Test: `gate-interaction-after-natural-collision` natural-movement case
- Controlled diagonal-facing teleport case: **passed**
- Failure: player rested at ~`(11.26, 9.74)`, gate at cell `(13, 8)`, facing
  `dx=1/dy=-1`; Space ×3 → no dialog
- Interpretation: interaction may still have a **distance/footprint edge
  case**, or collision stopped the player short of adjacency. **Phase B must
  diagnose this before trusting “gate works once placed” for A.**

Do not bury this — it is the exact class of friction that made prior
“teleport+Space” probes unreliable.

---

## Phase B — Live feel / playability audit (no generation rewrites)

**Duration:** 1 focused session slice  
**Rule:** measure and document; only **tiny interaction fixes** if they block
measurement (e.g. Space never opens a gate under natural approach). No
`placeQuizGates` / corridor-bias work yet.

### Testing method (user directive 2026-07-15)

**Primary feel/playtesting = Microsoft Playwright MCP live browser**, not
headless `npx playwright test` scripts:

- Navigate to the running Vite app, use real keyboard (arrows/WASD/Space)
  via MCP `browser_press_key` / click, take snapshots/screenshots, and
  only use `browser_evaluate` lightly for `__gameDebug` state when needed.
- Do **not** burn context writing long headless gameplay scenarios to
  "simulate" play. Headless Playwright specs stay for **narrow regression**
  (retry loop, determinism golden, cut-point unit checks) after a change —
  not as the main Phase B feel instrument.

### B.1 Live MCP roam + light `__gameDebug` peek

- Boot: `http://127.0.0.1:5173/` (or `?test=1` if menus block)
- MCP: navigate → snapshot → arrow keys → Space at obstacles
- Optional evaluate: gate counts, player pos, playability stats

**Metrics to capture** (from live roam + light debug peeks):

| Metric | How | Why |
|--------|-----|-----|
| Gate density | Count `quiz_gate` / `door_locked` / `toll_gate` per loaded chunk | Confirm content exists |
| Bypass rate | For each quiz_gate, BFS around it in-chunk: is there a walkable path connecting its two “sides” without resolving the gate? | Direct Pillar-2 gap measure |
| Force-hit rate (roam) | Simulate short A* or random-walk from spawn toward chunk edges; fraction of paths that *must* hit a lock | “Optional quiz” feel |
| Interaction reliability | Natural single-key approach + Space (reuse/fix natural-collision test) | Trust gate loop |
| Speed feel | Time to cross one 25-cell chunk at `PLAYER_CONFIG.speed` (0.05 ≈ 3 cells/s → ~8s theoretical) | Leisurely vs snappy |
| Playability health | `getPlayabilityStats` | Sanity that we aren’t measuring a broken world |

**Deliverable of B:** a short “baseline snapshot” section appended to this
file (numbers + 1–2 screenshots if useful) + pass/fail on interaction
reliability.

### B.2 Manual / semi-manual roam checklist (optional if auto probes clear)

- Start game, leave spawn, walk 1–2 chunks without using debug teleports
- Note first forced engagement (quiz / locked door / none)
- Try Space at first gate with natural facing only
- Record: did quizzes feel optional?

### B.3 Phase B stop/go gates

| Gate | GO if | STOP / fix-first if |
|------|-------|---------------------|
| Tooling | Vite + Playwright + debug API work | Server/tests won’t boot |
| Interaction | Natural gate Space works ≥2/3 consecutive runs (or root-caused) | Natural approach consistently fails |
| Metrics | Bypass rate + gate density written down | Cannot scan chunks/gates |
| Scope | No gen changes yet | Temptation to “just fix placement” before numbers |

**Exit criteria for B:** written baseline + decision:

- If interaction is broken → **B-fix** (narrow `handleSpaceInteraction` /
  adjacency), re-measure, then A  
- If interaction is OK but bypass rate high → **proceed to A**  
- If gates already largely unavoidable (unlikely per docs) → reassess A scope

---

## Phase A — Quiz-gate unavoidability (after B GO)

**Priority:** Docs `13` §2 item 1; Phase 1 of `Next-Engine-And-Gameplay-Plan.md`  
**Primary file:** `src/engine/world/ObstacleSolver.ts` → `placeQuizGates`  
**Orchestration:** `ChunkGenerator.ts` already calls `placeQuizGates` after
population; keep that call site unless a tiny post-pass helper is cleaner.

### A.1 Current behavior (verified source)

`placeQuizGates` today:

1. Converts some `door_gate` / `door_locked` / `toll_gate` → `quiz_gate`
2. Places standalone gates on cells with **2–3 walkable neighbors**
   (local chokepoint heuristic)
3. Spacing: min 4 cells between quiz gates  
4. **Does not** BFS main corridors from entries  
5. **Does not** detect or repair trivial bypass routes around a placed gate

That matches the documented gap: solvable ≠ unavoidable.

### A.2 Implementation approach (narrow — no new solver product)

Prefer additive helpers in/near `ObstacleSolver.ts`:

1. **Corridor bias (placement)**  
   - From chunk mid-edge entries (or existing passability entry points),
     BFS high-traffic walkable cells  
   - Prefer candidates that sit on those paths when placing remaining
     standalone quiz gates  
   - Keep existing convert-existing-gates strategy

2. **Bypass repair (post-place)**  
   - After each placed quiz_gate (or once after all), check whether the
     two sides of the corridor remain connected via a short walkable detour
     *without* stepping on the gate  
   - If trivial bypass exists (e.g. open path length ≤ N or same local
     neighborhood): extend blocking with a short fence/wall wing **or**
     relocate gate one cell toward a tighter chokepoint  
   - Prefer **local** repair (same WU / few cells), not global re-solve

3. **Out of scope for A (explicit)**  
   - Macro critical-path multi-gate campaigns (Phase 2 of Next-Engine plan)  
   - Composite pond/lake templates (roadmap #2 — separate)  
   - `EDGE_COMPAT` symmetry  
   - Speculative file splits  
   - Speed tune unless B shows extreme slog (then one-line `PLAYER_CONFIG`
     change with a feel note)

### A.3 Tests for A

| Test | Intent |
|------|--------|
| New: `tests/world-gen/quiz-gate-unavoidability.spec.ts` (name TBD) | Fixed seed: for placed quiz_gates on non-meadow or sampled forest/cave chunks, measure bypass rate drops vs baseline threshold |
| Existing: `gen-determinism.spec.ts` | Expect golden hash change if placement changes meadow-range content; **re-capture only after intentional verify** (process documented in that file’s header) |
| Existing: `quiz-gate-retry-loop` | Still green (no softlock regression) |
| Existing: gate interaction specs | Still green / fixed if B-fix landed |
| Optional: gameplay “must solve to reach far side of chunk” | Live-engine: spawn → target cell only reachable after resolve |

### A.4 Validation loop (Slice methodology)

1. Deep-read placement + passability entry helpers already used by
   `balanceObstacles` / Validation  
2. Hypothesis: corridor-biased placement + local bypass seal reduces
   bypass rate without softlocks  
3. Implement narrow change  
4. Prove: new unavoidability test + retry-loop + determinism re-capture if
   needed + `tsc --noEmit`  
5. Re-run Phase B metrics → **before/after table** in this memory file  
6. Update `Docs/12` gap line if closed

### A.5 Risks

- More mandatory gates can feel punishing → rely on unlimited retry +
  existing difficulty/streak scaling; do not remove retry  
- Determinism golden will likely move → document why  
- Over-sealing can create softlocks → run existing lock-key / playability
  checks; never block last path without a quiz_gate on it  
- Touching `WorldUnitSolver` is higher risk — **avoid** unless bypass
  repair truly needs chain features; start in ObstacleSolver only

---

## Session order (execution checklist)

1. ✅ Tooling smoke (this session start)  
2. ⬜ **B.1** Write + run baseline probe script/spec (gate density, bypass rate)  
3. ⬜ **B.1b** Triage natural-collision Space failure (repro 3×)  
4. ⬜ **B.3** Record baseline numbers + GO/NO-GO for A  
5. ⬜ **A.2** Implement corridor bias + bypass repair (narrow)  
6. ⬜ **A.3–A.4** Tests + golden re-capture if needed  
7. ⬜ Re-measure B metrics; update `Docs/12` / this file  
8. ⬜ Commit only after green validation (repo habit: commit working slices promptly)

---

## What we will *not* do in this campaign

- Docs-only busywork (ARCHITECTURE.md rewrite) unless asked  
- Big-bang “flat 2D purification” of nano schema  
- Pond/lake composite (next campaign after A, if still desired)  
- Full `tests/gameplay` + `tests/core` 10+ minute sweeps mid-slice —
  use targeted suites; full sweep once before commit

---

## Status

- **Planning:** complete  
- **Tooling:** verified GO  
- **Phase B:** next action  
- **Phase A:** blocked on B exit criteria  
- **Dev server:** may be left running on `127.0.0.1:5173` from this session
)
