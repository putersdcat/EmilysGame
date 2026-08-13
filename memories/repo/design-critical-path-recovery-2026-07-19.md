> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# Design: Critical-Path Playable Session Recovery

| Field | Value |
|-------|--------|
| **Author** | design-doc-writer (repo-grounded) |
| **Date** | 2026-07-19 (rev 2026-07-20: review fixes + R1–R3) |
| **Status** | **Landed** (PR1–PR7, 2026-07-20) — do **not** re-run this plan; reopen only if human playtest still fails |
| **Branch** | `experiment/isometric-2.0` **only** |
| **Baseline tip** | `117f627` (Place Coherence PR1–6 landed) — **historical anchor only**; verify current branch tip at execute start (do not hard-reset to this SHA) |
| **Epic theme** | **Critical-path bug + perf recovery** — not ontology, not FOV, not new nano kinds |
| **Does not reopen** | Place Coherence campaign plan; scene-first PR1–7; FOV thrash; WorldUnitSolver redesign; dual trunk |
| **Related** | `design-place-coherence-epic-2026-07-19.md` (landed; **over-sealing called out below**), `design-playable-session-recovery.md`, `design-play-kernel-2026-07-19.md`, `docs/02`, `AGENTS.md` |
| **Proof bar** | Automated net: `tests/perf/critical-path-boot`, `bulk-load-hang-fix`, `boundary-hitch-amortize`, `gate-policy-no-mid-fence-spam`, `walk-barriers-passability`, place-coherence + homestead + scene-invariants + gen-determinism. Cut-point hard floor **0.35** (measured 0.474; aspirational 0.7 residual). Human checklist in PR7 summary. |

---

## Overview

Place Coherence + prior play-kernel work left tests greener than the product feels. Live playtest still fails the child session bar:

1. **Paint nonsense** — drawn world disagrees with “place” readability (salt, orphan posts, cottage/gate weak).
2. **Homestead too small** — 7×7 yard + single-cell `starter_cottage` does not read as a home.
3. **Meaningless mid-fence quiz_gates** — Place Coherence / scene-invariants **over-applied** “no barrier without function” by sealing **every** linear fence gap with `quiz_gate`, while `placeGatesInFenceRuns` punches gates into **every** ≥3 fence run. Gates appear mid-line with free roam on both sides.
4. **Free roam almost everywhere** — barriers and gates do not gate progression; passability carves + non-cut-point gates.
5. **Framerate drops / movement stalls** when heavy compute runs on the main thread.
6. **Fresh load → Continue stalls ~30s** / browser “wait or kill” if the user clicks during solid main-thread work.

**This epic goes end-to-end through the critical code path**, instruments it, fixes hang/hitch first, then gate policy, walk barriers, homestead scale (without FOV), spawn-viewport draw cleanup, and a playtest proof bar.

**Success metric is one clean re-test:** load without hang → homestead reads as home → closed fences block → only real gates teach quiz → walk to gate → fail gently → open → leave → no mid-play freeze. Automated tests are the regression net, not the product claim.

### Scene-law clarification (functional openings vs structural seal)

**Functional openings** (`quiz_gate` / `door_*` / declared recipe `openings[]`) apply to **recipe/enclosure exits** — intentional teaching cut-points. **Illegal single-cell holes** in continuous barrier runs are **structural defects**, sealed with a matching barrier asset (`fence` / neighbor barrier), **not** teaching content. Do not reintroduce `quiz_gate` “to satisfy scene law” for linear gaps — that is the product bug this epic fixes (see **I5**, **I11**).

---

## User frustration (verbatim themes)

| # | Theme | Product translation |
|---|--------|---------------------|
| 1 | Things drawn don't make sense | Draw/sim + gen residue in spawn viewport |
| 2 | Homestead model too small | Multi-cell cottage/yard; **not** FOV zoom |
| 3 | Gates mid-fence with no reason | Over-sealing + fence-run gate spam |
| 4 | Free roam almost everywhere | Walk SSOT / passability / non-cut-point gates |
| 5 | Framerate drops; movement slows | Sync gen + bake on rAF |
| 6 | Continue stalls ~30s; wait-or-kill | Solid main-thread chunk gen / first-frame thrash |

---

## Product laws (hard)

| Law | Implication for this epic |
|-----|---------------------------|
| Branch `experiment/isometric-2.0` only | No trunk switch, no greenfield |
| Flat sim owns walkability (`docs/02`) | Fix `cell.walkable` stamps; paint never decides walk |
| Scene-first gen | Expand via recipes / stamps; no free structure-atom campaign |
| Iso2 paint only | **No FOV change**, no new nano kinds, no material-factory, no WorldUnitSolver redesign |
| FOV locked 128×64; `entityDisplayScale` ~1.0 | Homestead size = multi-cell footprint / taller paint / structure scale |
| Prefer scene-invariants + place-coherence **reuse** | **Fix over-sealing**; do not delete the pass |
| Homestead closed south | Regression-locked (`place-coherence-homestead.spec.ts`, proof PNGs) |
| Proof = playtest feel for UX; tests as net | Human acceptance criteria explicit per PR |
| Functional openings ≠ structural seal | Recipe exits teach; illegal linear gaps seal with barrier (not quiz) |

---

## Critical path map (must audit)

```mermaid
sequenceDiagram
  participant Main as main.ts init
  participant LLM as waitForLlm
  participant Assets as bootstrapAssets
  participant Init as createInitialState
  participant Yield as ensureChunksAroundYielding
  participant Gen as generateChunkSync
  participant PC as runPlaceCoherencePass
  participant Menu as runMenuFlow
  participant Loop as gameLoop rAF
  participant Bound as loadChunksOnBoundaryCross
  participant Sync as ensureChunksAroundBudgeted
  participant Walk as walkability-query
  participant Motor as play-kernel motor
  participant Draw as render-frame / terrain-cache

  Main->>LLM: await (can stall if no skip — out of epic scope)
  Main->>Assets: await preload
  Main->>Init: withWorldLoading spinner
  Note over Init: show spinner + double-rAF paint<br/>before first ensureOneChunk
  Init->>Yield: boot bulk gen (3×3 chunks)
  loop each missing chunk
    Yield->>Gen: SYNC full pipeline
    Gen->>PC: LAST seal / reassert (PC remains last cell writer)
    Note over Gen: residual multi-100ms–multi-s solid<br/>per chunk — no mid-mutation yield
    Yield->>Yield: yield after each chunk + N/M status
  end
  Main->>Menu: Continue = no-op if auto-save already applied
  Note over Menu: Perceived hang = pre-menu bulk gen<br/>OR post-menu first-frame bake thrash<br/>NOT Continue click regenerating world
  Menu->>Loop: rAF starts
  Loop->>Walk: isFootprintWalkable cell.walkable
  Loop->>Motor: integrate move
  Loop->>Draw: terrain bake + nano objects
  Loop->>Bound: on chunk boundary + every frame drain
  Bound->>Sync: budgeted ensure (player chunk hard; max 1/tick else)
  Note over Sync: queue priority; non-infinite depth
```

### Anchor table (verified at tip `117f627`)

| Stage | File(s) | Notes |
|-------|---------|--------|
| Boot entry | `src/main.ts` `init()` | LLM → canvas → wordlist → assets → `withWorldLoading(createInitialState)` |
| Spinner | `src/game/boot-loading.ts` | Reuses `#llmSplash`; needs **`updateWorldLoading(message)`** for N/M progress |
| State + save | `src/game/state-init.ts` | `loadGame()` then `await ensureChunksAroundYielding` |
| Menu Continue | `src/game/menu-flow.ts` | **`'continue'` is no-op** — chunks already generated in init |
| New game | `src/game/new-game-flow.ts` + `game-reset.ts` | `withWorldLoading` + yielding gen |
| Slot load | `src/game/slot-actions.ts` + `save-apply.ts` | Async yielding; **error path** must not fall back to sync multi-chunk |
| Yield bulk | `src/game/chunk-lifecycle.ts` | `yieldToMain` = `setTimeout(0)` **only after each chunk** today |
| Sync / budgeted hot path | same | Today: full buffer sync; target: budgeted + queue drain |
| Chunk gen | `src/engine/world/ChunkGenerator.ts` | Full phase list; ends with `runPlaceCoherencePass` (**last cell writer**) |
| Place coherence | `src/engine/world/PlaceCoherence.ts` | Reassert openings + homestead south + seal gaps (**today quiz_gate; target barrier**) |
| Gap seal SSOT | `src/engine/iso2-assemblies/scene-invariants.ts` `scanAndRepairFenceGaps` | Today always `quiz_gate` |
| Fence-run gates | `src/engine/world/ObstacleSolver.ts` `placeGatesInFenceRuns` | Gate in **every** fence run len ≥ 3 |
| Min gates | `ensureMinimumQuizGates` | Called **3×** on non-origin (5.44 / 5.48 / 7.8) |
| Bypass seal | `sealTrivialQuizGateBypasses` | Best-effort cut-points; incomplete |
| Passability | `src/engine/world/Passability.ts` | Carves grass to hit `passabilityTarget: 0.5`; forces mid-edge walkable |
| Walk SSOT | `src/engine/walkability-query.ts` | `cell.walkable` only; **unloaded chunk → true** |
| Policy (tests) | `src/engine/walkability-policy.ts` | Not runtime authority |
| Motor | `src/game/play-kernel/motor.ts` | Axis-slide + embed ladder |
| Boundary | `src/main.ts` `maybeLoadChunks` | Calls `loadChunksOnBoundaryCross` |
| Terrain draw | `src/rendering/terrain-cache.ts` | Provisional incomplete entries; SVG re-bake |
| Object draw | `src/rendering/render.ts` + `draw-priority.ts` | `maxDrawCmds: 400`; gate priority landed (PC P5) |
| Boot marks | `src/game/boot-marks.ts` | Partial ladder already exists |
| Frame perf | `src/engine/perf.ts` | EMA + ring buffer; no chunk-gen phase marks |
| Homestead | `src/engine/iso2-assemblies/starter-homestead.ts` | 7×7 @ (9,8); sole gate (12,14); single-cell cottage |
| Config | `src/config/game.config.ts` | `chunkSize: 25`, `viewportBuffer: 1` → **9 chunks** cold load |

---

## Root-cause analysis (honest)

### A. Continue / load hang — not “Continue generates world”

**Fact:** After `init()`, Continue is a **no-op** (`menu-flow.ts`). Cost centers:

| Path | When | Yield? |
|------|------|--------|
| Cold page load → `createInitialState` | Before menu interactive | Between chunks only |
| New Game / Load slot | After menu choice | Between chunks only |
| Mid-session slot load error recovery | Catch path | **Sync** `ensureChunksAround` today (bug) |
| Post-menu first frames | After Continue | Terrain/object bake thrash (no gen if chunks ready) |
| `waitForLlm` pre-spinner | Before world spinner | **Out of this epic** (separate splash) |

**Why it still feels like ~30s / wait-or-kill:**

1. Each `generateChunkSync` runs the **entire** pipeline solid (WU, stamps, triple min-gates, validation BFS, PC) — **uninterruptible**. Inter-chunk yield **cannot** cap per-chunk solid work at 100ms.
2. `yieldToMain` is only `setTimeout(0)`. Nine chunks × multi-second gen still multi-second wall clock with long solid slices.
3. Spinner may not paint before the **first** multi-second chunk (no status updates; message set once).
4. Post-menu: first-frame WU bake thrash can hitch even when gen is done.

**Honest hang bar (this epic):** spinner + N/M progress + yield after every chunk + **no** sync multi-chunk on UI click/error paths. Residual **per-chunk** solid cost drops when PR4 cheapens phases; mid-phase split is a **later epic**, not PR2.

### B. Meaningless mid-fence quiz_gates — Place Coherence **worsened** product feel

Place Coherence correctly re-asserted homestead south and preferred gates under draw budget. It also **institutionalized** a bad seal policy: illegal linear fence gaps always become `quiz_gate`.

**Stacked generators of meaningless gates (non-origin):**

| Phase | Function | Behavior | Epic action |
|-------|----------|----------|-------------|
| 5.4 | `placeQuizGates` | Random/difficulty gates | Prefer cut-points in PR4; residual → PR5 ratio test |
| 5.42 | `placeGatesInFenceRuns` | **Every** run ≥ 3 gets a gate | **PR4 ranked throttle** |
| 5.43 | `sealTrivialQuizGateBypasses` | Tries cut-points; incomplete | Leave; benefits from fewer spam gates |
| 5.44 / 5.48 / 7.8 | `ensureMinimumQuizGates` ×3 | Forces ≥1; last resort punches anything | **PR4 single ordered call; ban last-resort** |
| 5.475 + 9.5 | `scanAndRepairFenceGaps` | Dirt hole → **always quiz_gate** | **PR4 seal → matching barrier** |

**Origin note:** early fence-gap scans and obstacle quiz phases are origin-exempt; PC seal still runs on origin but declared openings + south reassert protect the yard. Spam is primarily **non-origin**.

### C. Free roam

| Mechanism | Effect |
|-----------|--------|
| `passabilityTarget: 0.5` + carve any non-water solid → grass | Opens holes through fence/wall/gates |
| Mid-edge forced walkable grass | Overwrites barrier mid-edge cells |
| `validatePlayability` carves | Can punch fence diagonals |
| Non-cut-point quiz_gates | Interactable paint, walk around |
| Unloaded chunk → `isWalkable` true | Soft open until gen; couples with boundary hitch |

### D. Homestead too small

- Footprint: `HOMESTEAD_SIZE = 7` at `STARTER_HOMESTEAD_ORIGIN = {x:9,y:8}`.
- Cottage: **one** cell `starter_cottage` at relative (4,3) → absolute (13,11).
- **Locked plan:** **9×9** yard; **cottage + surrounding structure cells** (OQ2/OQ4 locked in Key Decisions). Concrete stamp in §6.

### E. Draw chaos (spawn viewport)

Residual salt, orphans, incomplete SVG re-bake, single-cell cottage mass. Spawn salt/orphan cleanup **ships with homestead PR6**; bake thrash only if PR1 marks demand (optional follow).

### F. Mid-play hitch

Full-buffer sync `ensureChunksAround` on boundary. Target: budgeted ensure + every-frame queue drain + hard player-chunk force (see §3).

---

## Goals

1. **Bulk load never runs as an unpainted multi-second solid block without progress.**
   - All bulk paths (init / New Game / Load / slot apply) under spinner with **N/M chunk progress**.
   - Yield after **every** generated chunk (stronger than bare `setTimeout(0)` where available).
   - **No** click/menu/error handler runs **sync multi-chunk** gen.
   - **Honest residual:** a single `generateChunkSync` may still solid-block multi-100ms–multi-s until phase cost drops (PR4) or a later mid-phase-split epic. PR2 does **not** claim ~100ms solid cap.
2. **Boundary chunk gen never freezes movement for multi-seconds** — budgeted queue (player chunk hard; max 1/tick else); drain every frame; non-infinite depth.
3. **Gates only where they gate** — recipe/enclosure openings OR proven local cut-points; linear illegal gaps seal with **matching barrier**, not quiz_gate; stop min-gate spam and blanket fence-run punches.
4. **Homestead reads as a home** — **9×9** multi-cell cottage mass; closed south + sole teaching gate locked.
5. **Barriers block walk** where painted closed; free-roam through fence rings is a bug.
6. **Draw/sim agreement** for spawn viewport (cottage/gate/yard; no salt soup) — **with homestead PR6**, not a free-floating art PR.
7. **Instrumented critical path** — boot marks + chunk/queue counters so execute-plan proves before/after.

## Non-goals

| Non-goal | Why |
|----------|-----|
| FOV / tileWidth / entityDisplayScale change | AGENTS law; needs explicit RFC |
| New nano kinds / material-factory campaigns | Iso2 freeze |
| WorldUnitSolver redesign / EDGE_COMPAT rewrite | Out of scope |
| Dual trunk / greenfield | Branch law |
| Content-pack authorship binge | Recovery first |
| Full movement redesign | Use play-kernel; fix stalls first |
| Re-running Place Coherence epic PR1–6 plan | Landed; this epic **fixes over-sealing** only |
| Mid-phase async split of `generateChunkSync` | Later epic if still needed after PR4 cheapening |
| LLM gate timeout / BitNet retune | Separate splash path; out of PR1–7 |
| Soft-block at unloaded chunk edge | **No** this epic (KD9); revisit only if void is playtested |
| Web Worker chunk gen | Determinism + entropy complexity |
| Unbounded background gen beyond viewport buffer | Queue depth capped to buffer ring |
| Graphite-required process | Not required |
| Enclosure-geometry heuristic for fence-run gates | Scope creep; use ranked rules in §4.2 |

---

## Design: fixes by critical-path stage

### 1. Instrumentation (prove hang)

**Extend** existing `boot-marks.ts` + `perf.ts`; do not invent a parallel system.

| Mark / counter | Where to emit | Purpose |
|----------------|---------------|---------|
| `boot.ensureChunks` | yielding path | Keep; add `maxChunkMs`, `p95ChunkMs`, `count` |
| `gen.chunk` per call | `ensureOneChunk` / `generateChunkSync` | `{cx,cy,ms}` — **documents residual solid cost** |
| `gen.phase.*` (optional light) | 3–5 heaviest phases only | Identify WU / PC / validation cost |
| `chunk.boundary.syncBurst` | budgeted ensure | `{count, totalMs}` when count>0 |
| `chunk.queue.depth` / `chunk.queue.lagMs` | queue drain (PR3) | Prove non-infinite drain |
| Expose on `__gameDebug` | `debug-api.ts` | Playwright + DevTools |

**Acceptance for harness:** Playwright can read marks after cold load; structure exists; baseline numbers in PR body. **No hard “chunk < 100ms” gate** in PR1.

### 2. Continue / bulk load hang fix

| Change | Detail |
|--------|--------|
| Spinner on all bulk paths | init, new game, save-apply, slot load |
| **`updateWorldLoading(message)`** | New helper in `boot-loading.ts` (statusEl already exists). Call each chunk: `Loading world… 3/9` |
| Paint-before-first-chunk | After `showWorldLoading`, **double-rAF** (or one `await yieldToMain()`) **before** first `ensureOneChunk` so splash paints |
| Stronger yield | Prefer `scheduler.yield?.()` else double-rAF / `setTimeout(0)` after each chunk |
| Cap multi-chunk solid | **Never** batch multi-chunk sync on click/error. **Do not** mid-mutation async `generateChunkSync` |
| Residual per-chunk cost | Document via `gen.chunk` marks; **reduced** by PR4 phase cheapening — not claimed fixed in PR2 |
| Error path | `slot-actions.ts` catch → **yielding** ensure under spinner, not sync |
| First-frame (optional) | Pre-warm origin WU bakes under spinner before menu resolve **only if** PR1 bake marks spike |

**Split human AC:**

| Scenario | Expectation |
|----------|-------------|
| Cold load / New Game / Load slot | Spinner visible with N/M; no wait-or-kill from 9-chunk **unpainted** solid; UI can paint between chunks |
| Continue click | **No gen work** (no-op); no multi-second freeze **from Continue handler**; residual = first-frame bake only |
| Single chunk gen | May still solid-block; not a PR2 failure if progress + inter-chunk yield work |

**Invariant:** Click handlers never call sync multi-chunk gen. Only rAF budgeted ensure or boot spinner yielding paths.

### 3. Boundary hitch amortize — queue contract

**Problem:** `ensureChunksAround` generates all missing buffer chunks in one sync call.

**Surgical contract (required — not optional):**

| Rule | Spec |
|------|------|
| API | `ensureChunksAroundBudgeted(state, opts?)` replaces hot-path full-buffer sync |
| `maxPerTick` | **Default 1** (after player-chunk hard force) |
| Player chunk hard | If player’s `(pcx,pcy)` missing, **always** generate it this tick **before** yield/budget (1 solid chunk max for that force) |
| Priority order | (1) player chunk → (2) travel direction neighbor → (3) rest of `viewportBuffer` ring, stable dy/dx scan |
| Queue ownership | Module-level in `chunk-lifecycle.ts` (same pattern as `_pendingResolved`); not on `GameState` |
| Enqueue | On boundary cross: enqueue all missing buffer coords not already loaded/queued |
| Drain | **Every frame** while queue non-empty (from `maybeLoadChunks` / game loop), not only on boundary cross |
| Max depth | Cap at buffer ring size: `(2*viewportBuffer+1)²` (9 when buffer=1). Drop oldest **non-player** entries that fall **outside** current buffer when over cap |
| Unbounded gen | **Forbidden** — no gen outside buffer ring |
| Marks | `chunk.queue.depth`, `chunk.queue.lagMs`, `chunk.boundary.syncBurst` |
| Unloaded walk | Keep walkable-true short-term; player chunk force prevents long void (KD9) |
| Worker | **No** |

**Path-dependent gen (I9 note):** Budgeted order (player → travel → rest) can differ from today’s full nested dy/dx fill on boundary. Accept path-dependent inter-chunk stitch (already true for cold yield order). **Do not** require gen-determinism golden for boundary visit order — only fixed `(cx,cy)+borderConstraints` unit determinism. Update any test that assumes full 3×3 sync on first move.

Wire: `loadChunksOnBoundaryCross` enqueues + forces player chunk; every-frame drain from `maybeLoadChunks`.

### 4. Gate policy fix (meaningless mid-fence gates)

#### 4.1 Seal material policy (breaking intentional change)

| Situation | Today | Target |
|-----------|--------|--------|
| Illegal dirt gap in fence/wall run, not declared opening | `quiz_gate` | **Matching barrier** (see seal asset rule) |
| Declared recipe opening (`openings[]`) | functional kind | unchanged |
| Homestead south sole exit | `quiz_gate` | unchanged |
| Enclosure missing declared opening | quiz_gate spam | Prefer recipe repair; if must seal structural hole → **barrier**, never random quiz |

**Seal asset rule (required):**

```text
sealAssetKey =
  majority of barrier neighbors on the gap axis among
  {fence, wooden_fence, barricade, wall, stone_wall*, homestead_wall*}
  else fallback 'fence'
cell = { assetKey: sealAssetKey, walkable: false, interactable: false }
```

Copy **dominant neighbor barrier `assetKey`** along the run; preserve `walkable: false`. Update `scanAndRepairFenceGaps` (default seal mode barrier) and PlaceCoherence comments that claim “seal with quiz_gate.”

#### 4.2 `placeGatesInFenceRuns` — phase move + ranked default

**Phase move (required):** run `placeGatesInFenceRuns` **after** modular scenes (5.47) + light fence-gap scan (5.475), and **before** the single `ensureMinimumQuizGates`. Today it runs too early (pre-modular); rank-1 skip on modular openings is a no-op unless the phase sees post-modular stamps.

| Rank | Rule (evaluate only at the post-modular call site) |
|------|------|
| **1** | **Skip entire phase** if this chunk **already** has any functional opening cell (`quiz_gate` / `door_*` / `toll_gate`) **or** any declared opening from stamps already applied this gen (`getSceneStampRegistry()` entries with `openings[]`, or cells listed in declared opening sets). Do **not** depend on a future modular pass. |
| **2** | Else: consider fence runs ≥ 3; pick the **longest** run; place **at most one** `quiz_gate` in the run interior **only if** `wouldBeLocalCutPoint` is true **after** tentative placement; else revert and skip |
| **3** | Else **skip** (zero gates from this phase) |

**Do not** implement “enclosure-like geometry” detection in this epic.

#### 4.3 `ensureMinimumQuizGates` — single ordered phase (no “or”)

**Locked ordering (non-origin only) — §4.3 is normative; Appendix A must match:**

```text
… placeQuizGates (5.4, cut-prefer) …
… modular scenes (5.47)
→ light scanAndRepairFenceGaps (5.475)   // barrier seal after PR4
→ placeGatesInFenceRuns (moved here)     // ranked §4.2; sees modular openings
→ sealTrivialQuizGateBypasses (optional stay adjacent)
→ ONE ensureMinimumQuizGates (5.48 sole) // single call HERE
→ promoteDoorGates / coin trails / …     // if still needed post-gates
→ balance / passability / orphans / surface
→ validatePlayability
→ ensureSpawnClearance (origin only)
→ runPlaceCoherencePass (9.5 LAST cell writer)
     // reassert openings + homestead south
     // seal residual illegal gaps with BARRIER only
     // MUST NOT call ensureMinimumQuizGates
     // MUST NOT reintroduce quiz spam
```

| Rule | Spec |
|------|------|
| Call count | **Exactly one** `ensureMinimumQuizGates` per non-origin chunk gen |
| Position | After modular stamps + light fence-gap scan + **post-modular** `placeGatesInFenceRuns`; **before** validation; **before** PC |
| Remove | Calls at old 5.44, 5.48 (if duplicate), and 7.8; remove **pre-modular** `placeGatesInFenceRuns` call site |
| Last-resort random punch | **Banned** — if no cut-point candidate, leave count=0 (OQ1 locked **Yes**) |
| After PC rewrite | **Forbidden** — would break “PC is last writer” unless PC-last invariant is revised in the same PR (not this epic’s default) |
| Origin | Keep origin exempt from min-gates / fence-run punches |

#### 4.4 `placeQuizGates` (5.4)

**In PR4:** score-prefer / require local cut-point for candidates; drop last-resort non-cut placements.  
**Residual:** any remaining free-roam field gates measured in PR5 cut-point ratio test (soft), hardened in PR7 (proof). Written residual: *mid-fence from fence-run/PC seal fixed first; random field quality second.*

#### 4.5 Tests to rewrite (**required**, not optional)

| Test | Change |
|------|--------|
| `scene-invariants.spec.ts` | Linear gap → **barrier** seal; separate test declared opening → quiz_gate |
| `path-skeleton.spec.ts` | **Required rewrite:** drop hard `≥1 quiz_gate` on every path chunk; path cells OK without min-gate spam |
| Place-coherence audit | Illegal gaps seal as barrier; residual illegal gaps = 0 |
| Homestead specs | Closed south + sole quiz_gate still green (coords update in PR6) |

### 5. Walk barriers / free-roam — passability algorithm

#### 5.1 Carve allowlist (PR5)

`enforcePassability` may only grass-carve cells whose `assetKey` is in **soft obstacle allowlist**:

| Carve **allowed** (soft) | Carve **forbidden** (barriers / functional) |
|--------------------------|-----------------------------------------------|
| `tree`, `tree_pine`, `tree_palm`, `bush`, `rock` | `fence`, `wooden_fence*`, `barricade`, `wall`, `stone_wall*`, `homestead_wall*`, `starter_*` structure, `quiz_gate`, `door_locked`, `door_gate`, `toll_gate`, `water`, `bridge` |

If passability target not met after soft-only carves, **raise attempt budget** / try more soft cells — **never** punch barriers.

#### 5.2 Mid-edge force algorithm

Today overwrites mid-edge cell with grass. Target:

```text
for each mid-edge point E:
  if E is water or bridge: leave (existing #100)
  if E is barrier or functional gate: DO NOT overwrite E
    search adjacent cells along that edge (±1) for:
      already walkable soft/open terrain → done
      soft obstacle → carve that neighbor only
    if none found: skip force (accept slightly lower edge openness)
  else: may force E walkable as today (grass)
```

#### 5.3 Validation carves

Same barrier protect list as passability. PC fence-seal only for **single-cell illegal gaps** (I5) — does not invent multi-cell corridors.

#### 5.4 Tests

| Test | Spec |
|------|------|
| Enclosure BFS | Homestead + ≥1 modular fenced recipe: interior cannot reach exterior without functional opening |
| Mid-chunk fence ring | Fixed-seed: fence ring not grass-carved after both passability passes |
| Cut-point ratio | N=10 fixed non-origin seeds; `cutPoint / quizGateCount ≥ 0.7` **soft** after PR4 (warn/log); **hard** in PR7 proof if baseline allows |
| Walk SSOT matrix | Keep place-coherence walk matrix green |

### 6. Homestead scale / paint (no FOV) — concrete sketch

**Locked:** footprint **9×9**; cottage = **`starter_cottage` centerpiece + surrounding structure cells** (KD11, KD12).

#### 6.1 Coordinates (worked example)

**Spawn vs cottage mass (hard invariant I13):**  
`PLAYER_CONFIG.startPosition = { x: 12.5, y: 12.5 }` → grid **`(12, 12)`** → relative to origin `(9, 8)` = **`(3, 4)`**.  
Cottage mass must sit **north of spawn** so neither the spawn cell nor its cardinal plus-shape overlaps non-walkable `starter_*` structure.  
`ensureSpawnClearance` must **not** grass-carve `starter_*` / cottage-mass keys (only clear soft blockages if any); plus-shape stays on yard grass/dirt.

| Constant | Value |
|----------|--------|
| `HOMESTEAD_SIZE` | **9** |
| `STARTER_HOMESTEAD_ORIGIN` | Keep **`{ x: 9, y: 8 }`** (fits in 25×25 chunk; south row still in-chunk) |
| Yard cells | relative `[0..8]×[0..8]` absolute `[9..17]×[8..16]` |
| Sole south gate | relative **`(4, 8)`** → absolute **`(13, 16)`** (unchanged by north cottage mass) |
| South fence row | relative `y=8`, `x=0..8` all `fence` except gate |
| Cottage mass (2×2) **north of spawn** | relative **`(3,2),(4,2),(3,3),(4,3)`** — e.g. `(4,3)=starter_cottage`, others `starter_wall_plaster` / foundation / roof from existing assets. **Not** on spawn `(3,4)`. |
| Spawn | Keep **`{ x: 12.5, y: 12.5 }`** → rel **`(3, 4)`** walkable grass/dirt; plus-shape N/S/E/W stays yard (N is south edge of cottage at `(3,3)` — **do not** place non-walkable on `(3,4)` itself; cottage south edge is `(3,3)/(4,3)`, spawn is one cell south of west cottage column at `(3,4)` which is walkable yard adjacent to cottage — OK for adjacency; plus-shape north of spawn samples `(3,3)` which is cottage — **collision half-extents stay sub-cell so footprint center on grass is legal**; stamp must leave `(3,4)` walkable). |
| Dirt approach | relative `(3–4, 5–7)` dirt toward south gate (not under cottage) |
| `STARTER_HOMESTEAD_OPENINGS` | `[{ x: 4, y: 8, kind: 'quiz_gate' }]` only |

```text
Relative 9×9 (S = fence, G = quiz_gate, C = cottage mass, P = spawn cell, d = dirt):

  0 1 2 3 4 5 6 7 8
0 S S S S S S S S S
1 S . . . . . . . S
2 S . . C C . . . S     cottage mass y=2..3 (north of spawn)
3 S . . C C . . . S     (4,3) = starter_cottage preferred
4 S . . P . . . . S     P = spawn rel (3,4) abs (12,12) — WALKABLE
5 S . . d d . . . S
6 S . . d d . . . S
7 S . . d d . . . S
8 S S S S G S S S S     G = sole quiz_gate abs (13,16)
```

**Absolute cottage cells:** `(12,10),(13,10),(12,11),(13,11)` — all non-walkable structure.  
**Absolute spawn:** `(12,12)` walkable. Gate remains `(13,16)`.

#### 6.2 Files that must update together

| File | Why |
|------|-----|
| `src/engine/iso2-assemblies/starter-homestead.ts` | Size, placements, openings, stamp; spawn-safe cottage mass |
| `src/engine/world/PlaceCoherence.ts` | `HOMESTEAD_SOUTH_OPENING` / absolute south gate + reassert row length 9 |
| `src/config/game.config.ts` | Spawn **unchanged** at 12.5,12.5 (prefer); only edit if playtest forces |
| `ensureSpawnClearance` (starter-homestead.ts) | **Never** grass-carve `starter_*` cottage mass; only clear soft/unintended blocks on plus-shape |
| `src/rendering/nano-tile-defs.ts` | Optional `starterCottageNano` zOffset only |
| `tests/world-gen/place-coherence-homestead.spec.ts` | Coords + sole gate + spawn walkable / not cottage |
| `tests/world-gen/proof-place-coherence-capture.spec.ts` | PNGs |
| `tests/world-gen/gen-determinism.spec.ts` | Golden recapture |
| `tests/gameplay/playability-m1-core-loop.spec.ts` | Gate absolute if hard-coded |
| `tests/gameplay/spawn-escape-hatch.spec.ts` | Cottage cells north of spawn |
| `tests/screenshots/proof-critical-path-spawn.png` | **Required in PR6** |

#### 6.3 Paint

- Multi-cell stamp provides mass **north of spawn**; optional slight `zOffset` on cottage nano.
- **No** FOV / `entityDisplayScale` / `tileWidth` change.
- Spawn salt/orphan cleanup after stamp order: yard fill dense grass; ensure orphan strip does not strip cottage mass; surface cohere after homestead reassert — **in PR6**, not a separate art campaign.

### 7. Proof bar

| Artifact | Spec / path |
|----------|-------------|
| Perf | `tests/perf/critical-path-boot.spec.ts` — marks present; soft budgets; **no hard 100ms chunk** |
| Gates | `tests/world-gen/gate-policy-no-mid-fence-spam.spec.ts` |
| Homestead | Updated homestead specs + proof PNG (PR6) |
| Walk | Enclosure BFS + fence ring carve protect |
| Cut-point | Soft PR5 → hard PR7 if baseline OK |
| Human | 5–15 min checklist below |

---

## Architecture notes

### Layering (unchanged)

```text
src/engine/     pure gen, walk query, assemblies
src/game/       chunk lifecycle, boot, play-kernel, save
src/rendering/  paint only
src/config/     as const knobs
```

### Invariants

| ID | Invariant |
|----|-----------|
| I1 | Runtime walk = stamped `cell.walkable` only (`walkability-query.ts`) |
| I2 | Presentation never sets walk |
| I3 | Homestead south closed except sole quiz_gate |
| I4 | Declared recipe openings remain functional kinds after PC pass |
| I5 | Illegal single-cell gaps in continuous barrier runs seal with **matching barrier**, not random quiz (structural defect ≠ functional opening) |
| I6 | Boot/menu bulk gen never uses sync multi-chunk without spinner + yield + N/M progress |
| I7 | Boundary: player chunk hard; else ≤ `maxPerTick` (default 1); queue depth ≤ buffer ring; drain every frame |
| I8 | FOV 128×64; no entityDisplayScale campaign |
| I9 | `generateChunkSync(cx,cy,bc)` deterministic for fixed seed/entropy + given borderConstraints; visit order may be path-dependent |
| I10 | No new nano kinds in this epic |
| I11 | Functional openings are recipe/enclosure exits only; PC last writer does not call min-gates |
| I12 | Exactly one `ensureMinimumQuizGates` per non-origin gen, after modular+gap+post-modular fence-run, before validation, before PC |
| I13 | Homestead spawn cell + legal footprint must not sit on non-walkable cottage mass; cottage mass north of spawn; `ensureSpawnClearance` never destroys `starter_*` mass |

---

## Kill list (reject if proposed during execute)

| Proposal | Reject because |
|----------|----------------|
| Change `tileWidth` / FOV / zoom “so house looks bigger” | AGENTS; use multi-cell |
| New nano primitive for cottage | Iso2 freeze; use existing structure keys |
| Rewrite WorldUnitSolver | Non-goal |
| Web Worker chunk gen | Complexity |
| Delete place-coherence pass | Keep; fix seal policy |
| Make every fence gap a quiz_gate “for education density” | User hates this; violates I5 |
| Dual-trunk / nest product under experiment/ | App entry is `src/` |
| Full movement redesign / soft-motor | Fix stalls first |
| Graphite-only process gate | Not required |
| Speculative folder reorg | AGENTS |
| Enclosure-geometry detection for fence runs | Use §4.2 ranked rules only |
| `ensureMinimumQuizGates` after PC as separate phase | Breaks PC-last unless invariant rewritten same PR |
| Hard “every chunk < 100ms solid” acceptance without phase split | Dishonest given architecture |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Gen-determinism golden churn | One intentional recapture per behavior PR |
| Tests assert “≥1 quiz_gate every chunk” | **Required** rewrite `path-skeleton.spec.ts` in PR4 |
| Queue backlog / void | Player chunk hard force; depth cap; walkable-true short-term |
| Boundary order changes stitch | Accept path-dependent gen; unit determinism only (I9) |
| Larger homestead overlaps | Stamp sketch + spawn clearance; closed south tests |
| Fence seal “barrier without function” optics | I5 / law clarification: structural seal ≠ missing recipe exit |
| Passability soft-only misses target | More soft carve attempts; never barrier |
| First-chunk spinner unpainted | Double-rAF before first gen |
| Single-chunk multi-second residual | Document marks; PR4 cheapens; no fake 100ms claim |
| PR6 still “too small” feel | Playtest; optional later 11×11 **out of this epic default** |

---

## Acceptance criteria

### Human playtest (epic done)

1. **Cold load / New Game / Load:** spinner with N/M; no wait-or-kill from unpainted multi-chunk solid; can interact with OS/tab between chunks.
2. **Continue click:** no regeneration work; no multi-second freeze **caused by Continue handler** (first-frame bake only residual).
3. Homestead reads as a home (9×9 + cottage mass); south closed; one teaching gate.
4. No random mid-line quiz_gates on linear fences with free roam both sides.
5. Leaving homestead requires the gate; closed fence ring blocks.
6. Crossing chunk boundary does not freeze WASD for multi-seconds (queue drains).
7. Spawn viewport: cottage + gate + yard coherent.

### Automated (net)

| Suite | When |
|-------|------|
| `npx tsc --noEmit` | Every PR |
| Targeted Playwright per PR | Every PR |
| `place-coherence-homestead` + proof capture | PR6 |
| `gen-determinism` | Any gen behavior change |
| `path-skeleton` (rewritten) | PR4 |
| Full suite | Final proof PR or cross-cutting |

---

## PR Plan

Ordered for dependency. **Seven PRs** (spawn draw folded into PR6; bake thrash optional follow only).

### PR 1: Critical-path instrumentation harness

| | |
|--|--|
| **Depends** | — |
| **Files** | `src/game/boot-marks.ts`, `src/game/chunk-lifecycle.ts`, `src/engine/world/ChunkGenerator.ts` (light wrap), `src/game/debug-api.ts`, `tests/perf/critical-path-boot.spec.ts` (new) |
| **Description** | Emit `gen.chunk` ms; extend `boot.ensureChunks` with max/p95; emit `chunk.boundary.syncBurst`; expose via `__gameDebug`. No behavior change. Capture baseline (incl. **honest** per-chunk solid ms) in PR body. |
| **Acceptance** | `tsc` clean; Playwright reads marks; ≥1 `gen.chunk` or `boot.ensureChunks` with `ms`; zero gameplay change. **No hard 100ms threshold.** |

### PR 2: Bulk-load hang fix (spinner + yield + no sync on click)

| | |
|--|--|
| **Depends** | PR1 |
| **Files** | `src/game/boot-loading.ts` (`updateWorldLoading`), `src/game/chunk-lifecycle.ts`, `src/game/slot-actions.ts`, `src/game/state-init.ts`, `save-apply.ts`, `game-reset.ts` |
| **Description** | N/M progress; double-rAF before first chunk; stronger yield between chunks; slot catch → yielding ensure under spinner; **never** sync multi-chunk on UI paths. Document residual single-chunk solid via marks (not a failure). Optional bake pre-warm only if PR1 marks demand. |
| **Acceptance** | Automated: multi-chunk bulk shows inter-chunk yields + progress marks; slot catch not sync ensure. Human: cold load / New Game / Load — spinner paints, no wait-or-kill from unpainted 9-chunk solid. Continue click is no-op (no gen). **Does not claim per-chunk < 100ms.** |

### PR 3: Boundary chunk hitch amortize

| | |
|--|--|
| **Depends** | PR1; can parallel PR2 after PR1 |
| **Files** | `src/game/chunk-lifecycle.ts`, `src/main.ts` (`maybeLoadChunks`), tests hitch/queue |
| **Description** | Implement §3 queue contract: player hard force, `maxPerTick=1`, depth cap = buffer ring, drain **every frame**, marks depth/lag. Document path-dependent stitch acceptance. |
| **Acceptance** | No multi-second solid `syncBurst` with count=9 on boundary; player chunk always present before roam far; queue depth ≤ 9; movement continues on loaded cells. |

### PR 4: Gate policy — barrier seal; ranked fence-run; single min-gate

| | |
|--|--|
| **Depends** | PR1 preferred for before/after marks (gen-only; can parallel PR2/3) |
| **Files** | `scene-invariants.ts`, `PlaceCoherence.ts`, `ObstacleSolver.ts` (`placeGatesInFenceRuns`, `ensureMinimumQuizGates`, `placeQuizGates` cut-prefer), `ChunkGenerator.ts` (single min-gate site; remove 5.44/5.48/7.8 extras), **required** `tests/world-gen/scene-invariants.spec.ts`, **required** `tests/world-gen/path-skeleton.spec.ts`, new `gate-policy-no-mid-fence-spam.spec.ts` |
| **Description** | PC over-sealing is a product bug. Illegal linear gaps → dominant-neighbor barrier seal. **Move** `placeGatesInFenceRuns` to post-modular (after 5.475 gap scan); ranked §4.2. **Exactly one** `ensureMinimumQuizGates` after that, before validation; **no** min-gate after/inside PC; ban last-resort field punch. `placeQuizGates` prefer cut-points. Appendix A must match §4.3. |
| **Acceptance** | Linear gap fixture → barrier not quiz_gate. Declared openings still functional. path-skeleton no longer requires ≥1 quiz_gate everywhere. Quiz spam marks drop vs PR1 baseline. Phase order: modular → gap seal → fence-run → single min-gate → … → PC. |

### PR 5: Walk barriers — passability allowlist + enclosure

| | |
|--|--|
| **Depends** | PR4 |
| **Files** | `Passability.ts`, `Validation.ts` (same protect list), enclosure + fence-ring tests, soft cut-point ratio N=10 |
| **Description** | Soft-only carve allowlist; mid-edge algorithm §5.2; validation same protect; enclosure BFS; fence ring mid-chunk not grass-carved. |
| **Acceptance** | Automated enclosure BFS; fence-ring regression; walk SSOT matrix green; cut-point ratio soft ≥0.7 or documented baseline. Human: fence rings feel real. |

### PR 6: Homestead 9×9 multi-cell + spawn-viewport cleanup

| | |
|--|--|
| **Depends** | PR4 (gate/opening policy stable); PR5 recommended |
| **Files** | §6.2 file list + stamp order / surface / orphan interactions for spawn FOV; proof PNG capture |
| **Description** | Implement §6 sketch: 9×9, sole gate abs **(13,16)**, 2×2 cottage mass **north of spawn** at abs `(12–13,10–11)`, spawn stays **(12,12)** walkable; existing assets only. `ensureSpawnClearance` must not destroy `starter_*`. Fold spawn salt/orphan cleanup. Optional zOffset only. **No FOV.** |
| **Acceptance** | Human: reads as home. Automated: closed south + sole gate (13,16); spawn (12,12) walkable and **not** cottage mass; plus-shape does not leave player embedded; **proof-critical-path-spawn.png** + homestead proof PNG updated. |

### PR 7: Proof bar + regression lock — **LANDED**

| | |
|--|--|
| **Depends** | PR2–PR6 |
| **Files** | Soften/harden perf + gate-policy tests; cut-point hard floor 0.35 (0.7 not supported by baseline); AGENTS + design status Landed; human checklist in PR body |
| **Description** | End-to-end net; before/after marks vs PR1; one human re-test. Optional bake thrash if still profiled. |
| **Acceptance** | Targeted suite green; human checklist pass once; epic → Landed. |
| **Notes** | Cut-point ratio hard floor **0.35** (measured 0.474 on fixed N=10 seeds); aspirational ≥0.7 remains soft-annotate. Mid-fence full-gen bound hardened to `≤ sampled`. Soft perf budgets: maxChunkMs &lt; 5s, ensure wall &lt; 30s (catastrophic hang only). |

### Concurrency sketch

```text
PR1 ──┬── PR2 ──────────┐
      ├── PR3 ──────────┼── PR7 (proof)
      └── PR4 ── PR5 ── PR6 ──┘
```

---

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| KD1 | Epic is **critical-path recovery**, not new world ontology | User asked end-to-end bug+perf |
| KD2 | Place Coherence **kept**; seal policy **changed** (matching barrier ≠ quiz_gate for linear gaps) | Over-sealing caused meaningless gates |
| KD3 | Continue hang = **bulk gen solid slices + perception**, not Continue click gens world | Code: continue is no-op |
| KD4 | Hang AC: spinner + N/M + inter-chunk yield + no sync multi-chunk on UI; **not** 100ms solid cap | Single chunk uninterruptible by design |
| KD5 | Homestead size via multi-cell footprint / existing structure paint, **never FOV** | AGENTS |
| KD6 | Exactly one `ensureMinimumQuizGates` after modular+gap+**post-modular fence-run**, before validation; PC last writer; no min-gate after PC | Avoids erased-then-re-spam; preserves PC-last |
| KD7 | Passability soft-only carve + mid-edge skip barriers | Free-roam root cause |
| KD8 | Origin free of random quiz density phases | Teaching gate = homestead sole exit |
| KD9 | Unloaded cells stay walkable; player chunk hard force; no soft-block this epic | Avoid fog softlock |
| KD10 | Proof = one human re-test; tests = net | Product law |
| KD11 | Homestead footprint **9×9** locked (OQ2 closed) | Implementable default; 11×11 later only if playtest fails |
| KD12 | Cottage = **starter_cottage + surrounding structure cells north of spawn** locked (OQ4 closed); spawn stays (12.5,12.5) | Mass without FOV/new nano; no softlock |
| KD18 | `placeGatesInFenceRuns` moved post-modular so rank-1 skip is real | Rank-1 was a no-op pre-modular |
| KD13 | Zero quiz_gate on some non-origin chunks **OK** (OQ1 closed) | Origin taught loop; no spam |
| KD14 | `placeGatesInFenceRuns` ranked: skip if openings → else ≤1 cut-point gate → else skip | No enclosure heuristic |
| KD15 | Boundary queue: player hard, maxPerTick 1, depth ≤ buffer ring, drain every frame | Non-infinite defer |
| KD16 | Spawn draw must-dos fold into PR6; bake thrash optional | Avoid soft no-op PR |
| KD17 | Functional openings ≠ structural seal (I5/I11) | Scene law clarification |

---

## Open Questions

**None blocking.** Former OQs locked:

| # | Locked answer |
|---|---------------|
| OQ1 | **Yes** — zero quiz_gate on some non-origin chunks OK → **KD13** |
| OQ2 | **9×9** → **KD11** |
| OQ3 | **No** soft-block this epic → **KD9** |
| OQ4 | Cottage + surrounding cells → **KD12** |

Reopen only if playtest forces 11×11 or soft-block at void edge.

---

## Execute-plan invocation (copy-paste)

```text
/execute-plan memories/repo/design-critical-path-recovery-2026-07-19.md

Branch: experiment/isometric-2.0 only.
Verify current tip at start; baseline tip 117f627 is a historical anchor (do not hard-reset).
Follow PR Plan: PR1 instrument → PR2 hang (spinner/N-M/yield; no 100ms solid claim) → PR3 boundary queue → PR4 gate policy → PR5 walk/passability → PR6 homestead 9×9 + spawn cleanup → PR7 proof.
Laws: no FOV/entityDisplayScale thrash; no new nano kinds; no WorldUnitSolver redesign; flat sim owns walkability; keep place-coherence pass but fix over-sealing (linear gaps → matching barrier, not quiz_gate).
Min-gates: exactly one call after modular+gap, before validation; PC remains last writer (no min-gate after PC).
Homestead closed south + sole quiz_gate stays regression-locked (new absolute gate after 9×9).
After each PR: npx tsc --noEmit + targeted Playwright; full suite only when warranted.
Proof = human playtest feel for UX; tests are regression net.
Do not re-run Place Coherence epic PR1–6 plan; do not re-run closed scene-first campaign.
```

---

## Appendix A — ChunkGenerator phase order (touch map)

**Normative note:** If this table and prose disagree, **§4.3 wins** — and they **must not** disagree. Order below matches §4.3.

| Phase (order) | Owner | Touch in this epic? |
|---------------|-------|---------------------|
| 1 Perlin | TerrainBase | No |
| 2 WU solve | WorldUnitSolver | **No redesign** |
| 3 Stamp + starter homestead | stamp + starter-homestead | **PR6** (spawn-safe cottage mass) |
| 3 early light gap scan (non-origin) | scene-invariants | **PR4 barrier seal** (if kept) |
| 4 / 7 Passability | Passability | **PR5 soft allowlist** |
| 4.5 Path skeleton | PathSkeleton | Tests only (PR4 rewrite path-skeleton.spec) |
| 5.4 placeQuizGates | ObstacleSolver | **PR4 cut-prefer** |
| ~~pre-modular placeGatesInFenceRuns / min-gates~~ | — | **Removed** (old 5.42–5.44 / 5.48 / 7.8 spam sites) |
| 5.47 Modular scenes | assemblies | No new recipes required |
| 5.475 light scanAndRepairFenceGaps | scene-invariants | **PR4 barrier seal** |
| 5.476 placeGatesInFenceRuns (**post-modular**) | ObstacleSolver | **PR4 ranked §4.2** |
| 5.477 sealTrivialQuizGateBypasses | ObstacleSolver | Leave (benefits from less spam) |
| **5.48 sole ensureMinimumQuizGates** | ObstacleSolver | **PR4 — only call site** |
| 6 Balance | ObstacleSolver | Minimal |
| 7.6–7.7 Orphans | helpers | PR6 spawn if needed |
| 8 Validation | Validation | **PR5** barrier protect |
| 9 Spawn clearance | starter-homestead | **PR6** — never destroy `starter_*` mass |
| 9.5 Place coherence | PlaceCoherence | **PR4 barrier seal; last writer; no min-gates** |

## Appendix B — Existing tests to keep green / update

| Test | Keep / update |
|------|----------------|
| `tests/world-gen/place-coherence-homestead.spec.ts` | Keep closed south; update coords PR6 |
| `tests/world-gen/proof-place-coherence-capture.spec.ts` | Refresh PNGs PR6 |
| `tests/world-gen/scene-invariants.spec.ts` | **Required** barrier seal expectation PR4 |
| `tests/world-gen/path-skeleton.spec.ts` | **Required** drop ≥1 quiz_gate everywhere PR4 |
| `tests/world-gen/gen-determinism.spec.ts` | Recapture golden when gen changes |
| `tests/gameplay/playability-m1-core-loop.spec.ts` | Keep gate loop; update abs coords PR6 |
| `tests/rendering/draw-gate-priority.spec.ts` | Keep |
| `tests/perf/frame-time-triage.spec.ts` | Keep; add critical-path boot suite |

## Appendix C — Relation to prior designs

| Doc | Relation |
|-----|----------|
| Place Coherence epic | **Landed**; this epic fixes **product regression** from over-sealing |
| Playable-session recovery | Overlaps hang/first-frame; this plan is the ordered path at tip |
| Play-kernel | Motor stays; stalls fixed first so motor can be judged |

---

*End of design — Critical-Path Playable Session Recovery (rev review-fixes R1–R3)*
