# Next Steps: Engine Robustness + Gated Playable Sections + Gameplay Pace

**Date:** 2026-07-13  
**Context:** Review of WorldEngine docs, ARCHITECTURE.md, VisionAlignmentAudit.md, current source (post many refactors on `experiment/isometric-2.0`), git staged changes, and interactive browser testing via Playwright MCP against `npm run dev` (http://localhost:5173).  
**Goal:** Address "engine is a complete mess + full of bugs", "gameplay still slow", and "not really rendering the world chunks in playable sections where movement is gated in a way that forces the player to play to advance".

---

## 1. Documentation Synthesis (What "Should" Be)

### Core Vision (WorldEngine series + ARCHITECTURE)
- **Four-tier hierarchy** (WorldEngine-01):
  - Micro (cell)
  - Nano (3×3 subgrid for precise features, Z, walkability)
  - World Unit (5×5 micro = 25 cells; local structure via templates + edge contracts)
  - **Macro** (5×5 world units = 25×25 cells). This is the "playable section" unit: biome + difficulty + paced progression + playability proof.

- **Solver Pipeline** (WorldEngine-03, implemented partially in ChunkGenerator + world/ modules):
  1. Entropy + biome/mood/difficulty
  2-3. Macro assembly via AC-3 on world-unit grid (WorldUnitSolver: solve + stamp)
  4. Passability
  5. Population (Populator: anchors/NPCs/decor, CollectibleScatterer)
  5.x Obstacles/gates (ObstacleSolver: quiz gates, fence-run gates, door promotion, bonfires, extra obstacles)
  6. Balance/lock-key DAG (no softlocks)
  6.5 Dead-end rewards
  7-8. Re-pass + validate (Validation)

- **Population & Progression** (WorldEngine-05 — the key "force play to advance" doc):
  - **Progression entities (Solver D)**: locks (quiz_gate, door_locked, toll, barricade), keys, chests as end-of-sequence markers.
  - **Lock-and-key dependency graph + reachability regions**: every lock must have its key (item or knowledge) reachable *before* encountering the lock. Forward placement or critical-path + nested locks.
  - **5 Guarantees**:
    1. No softlocks (DAG validated + repairs).
    2. No dead-ends without reward.
    3. Macro traversable.
    4. Paced difficulty (distance + biome + streak).
    5. Learnable (quizzes tied to Book of Knowledge).
  - NPC placement at junctions/anchors (1 per WU cap, biome personas, merchants spaced).
  - Quiz gates special: knowledge as key; difficulty scales with distance.
  - Chokepoints for standalone quiz gates (2-3 walkable neighbors).

- **Rendering + Nano** (WorldEngine-04 + Iso docs): layered caches, Z-pinned nano (extrude/carve/billboard/flat), precise footprints for walk + render. Chunk terrain baked.

- **Composite Assembly pattern** (ARCHITECTURE §6, clarified 2026-07-10): LLM entropy picks *what scene* + *where*; a sub-solver stamps a pre-authored, tuned composite (homestead, gatehouse, bounded section, coherent pond) atomically instead of per-cell emergence. Nascent in `iso2-assemblies.ts` + `stampStarterHomestead` + `maybePlaceCastleLandmark`.

- **Current impl status notes** (docs + VisionAlignmentAudit): Many "current status" paras go stale. Audit (2026-07) found macro absent (pre-25-size change), merchant spacing missing, etc. Several ✅ fixes landed since.

**Intended feel**: World is divided into coherent macro "playable sections". You explore, hit natural chokepoints (gated by quiz or key you earned in prior area), solve/engage to advance, get rewarded (chest, coins, cosmetics), difficulty ramps. Side paths always reward. Not free-roam infinite flatland.

---

## 2. Current Reality (Code + Interactive Probes)

### Positive / Recent Progress (staged changes + splits)
- Chunk size = 25, WU_SIZE=5, GRID_DIM=5 → **macro-sized chunks now match vision** (audit predates some of this).
- `src/engine/gen.ts` is thin facade (81 lines). Real logic in `src/engine/world/`:
  - `ChunkGenerator.ts` (306 lines): orchestrates phases, LLM entropy path, difficulty, mood.
  - `WorldUnitSolver.ts` (1258 lines): full AC-3 + MRV + border constraints + chain integrity + stamping + terminator reuse.
  - `ObstacleSolver.ts` (655): placeQuizGates (convert + chokepoint standalone), fence-run gates (#223), promote door_locked, balanceObstacles (inline DAG + layered reachability), rewardDeadEnds.
  - `Populator.ts` (533): anchor NPCs (biome pools + merchant spacing improvements), cluster decorations.
  - Passability, Validation, BiomeSelector (mood, coherent), CollectibleScatterer, etc.
- Main.ts down to **1157 lines** (was >3k). Many slices extracted (chunk-lifecycle, interaction-handler, etc.).
- Nano deeply integrated (iso2-solver, nano-tile*, mechanics uses `isPointWalkableInTile` + variantFromConnections for gates/fences/walls/rivers).
- Gates populate: probes found **15 quiz_gates + 14 door_locked** across 9 chunks. Varying structure (non-grass 100-276, walls 0-68 per chunk).
- Playability healthy in live state (`getPlayabilityStats`): ~81.5% walkable, very low dead-end ratio (~0.006), 0 repairs, good densities.
- Biome merchants, streak/diff scaling, dead-end rewards, NPC history, save parity fixes etc. landed (per VisionAudit).
- Compile clean (`tsc --noEmit`).
- Debug API powerful for exploration (`setPlayerPosition`, state, getPlayabilityStats, etc.).

### Remaining Gaps vs. Vision (the user's complaints)
- **Playable sections / forcing play-to-advance is weak**:
  - Gates exist and are often at chokepoints (2-3 walk nbrs) + complemented by fences/walls/water.
  - DAG + reachability exists and removes unsolvable locks.
  - **But**: world is still largely open continuous space. Many routes bypass gates. No strong "macro critical path" or "section entry gate" that you *must* engage to unlock further exploration. Quizzes are present but feel optional/local rather than the pacing mechanism for advancement. No visible "completed this playable pocket → next opens".
  - Interaction targeting (in `mechanics.interact` + handler): requires being adjacent + facing the cell. Teleport+Space at gate didn't trigger quiz in probe (positioning/facing friction).
  - Chunk loading (buffer=1 around player) is continuous roaming, not "enter gated macro".

- **Engine still messy + bug-prone**:
  - Largest modules still large (WorldUnitSolver 1.2k is the AC-3 heart; complex priority/MRV/corner governance/chain integrity).
  - Dual representation tension: cell-level `walkable` + `assetKey` **and** nano footprint resolution (in multiple places: mechanics, nano-tile-svgs, iso2-solver, render).
  - Live mutation of `chunk.cells` for resolved state (chests, opened gates) + later regen from seed + applyResolved. Works but fragile (esp. with nano variants and cross-chunk).
  - Border/edge contracts: `applyBorderConstraints` exists but "partial" in comments; full Phase 3 neighbor hard constraints not complete.
  - Condition state scattered (activeConditions map for some gates? cell.resolved, quiz state elsewhere).
  - Huge debug surface (good for now, but indicates surface area).
  - Audit-noted items: EDGE_COMPAT asymmetry (deliberately deferred high blast radius), remaining water continuity/depth (Bug 1 partial), composite assemblies still nascent (only a couple scene types).

- **Gameplay slow / not snappy**:
  - `PLAYER_CONFIG.speed = 0.05` (3 cells/sec). Crossing a 25-cell chunk feels leisurely; exploration can feel grindy before hitting content.
  - Content engagement loop (find gate → position precisely → quiz) has friction.
  - Chunk gen is sync on boundary cross (in viewport buffer); with LLM path or heavy population can hitch.
  - World feels sparse or avoidable in places despite gate counts (player can choose low-resistance directions).
  - No strong "you must play here to go there" feedback loop.

- **Rendering chunks in sections**: 25-cell WU stamping + nano works and produces varied chunks. But without macro-level "bounded section" visuals + forced routes, it doesn't read as discrete playable areas.

Interactive confirmation (Playwright + direct debug + keyboard):
- Server boots cleanly, canvas + full debug surface live.
- Real chunks with real gates + structures + NPCs in some.
- Playability numbers healthy.
- Teleport works; gates block (walkable:false); but end-to-end "hit gate → quiz → advance" flow needs precise setup and wasn't auto-triggered in one probe.
- Menu flow + HUD overlays present even when debug state is "world active".

---

## 3. Recommended Plan

Prioritize **"forces the player to play to advance"** first — that's the core experience gap. Use the existing WU/macro + solver foundation rather than big rewrites.

### Phase 1: Immediate Stabilization + Stronger Local Gating (1-3 focused sessions)
- **Gate placement & unavoidability**:
  - In ObstacleSolver / new light "PathAnalyzer": after WU stamping, detect main corridors (high-traffic BFS from entries), bias quiz/fence/locked gates onto them. Penalize or repair bypass routes around a placed gate.
  - Increase effective quiz_gate frequency on non-spawn chunks (leverage existing difficulty.quizGateFrequency + mood).
  - Make fence-run + standalone gates create longer "walls" that are harder to skirt (coordinate with WorldUnitSolver chain features).
- **Interaction robustness**:
  - Improve targeting (wider cone or auto-face nearest interactable; or "bump to interact").
  - When adjacent to quiz_gate/locked, auto-hint + make Space reliable.
  - Expose `resolveQuizGate` + conditions more cleanly for debug/tests.
- **Tuning for "not slow"**:
  - Raise base speed to 0.07-0.09 after play feel test (or add temp speed buffs early).
  - Ensure gates are visually obvious (sparkle, sign, "mystic barrier" flavor) and player is guided toward them via coin trails / dead-end rewards.
- **Tests**:
  - Add/expand Playwright scenarios: "teleport near gate, face+interact, complete quiz, cell becomes walkable, player can proceed".
  - Add unit test for "chokepoint gate has no trivial 3-cell bypass in same WU".
- **Quick wins**: Fix any remaining easy bypasses or interaction bugs found in probes. Run full test suite + visual checks.

**Deliverable**: Player cannot trivially ignore a gate on a primary route inside a chunk; solving 1-2 quizzes visibly opens a section.

### Phase 2: Macro / Sectioned Playable Areas (the architecture win)
- **Critical path + nested gating** (WorldEngine-05 §3.4):
  - Add (or surface) a "critical path" pass after basic stamping: pick entry→major feature/exit route through the 5×5 WU grid. Place 1-3 progression gates along it (escalating: simple quiz → key behind side branch → harder quiz).
  - Use "nested lock" pattern inside one macro: solve gate A opens area containing key for gate B.
- **Composite "Gated Section" assemblies**:
  - Generalize `iso2-assemblies` pattern.
  - Author 2-4 reusable bounded scenes: "quiz compound", "toll gatehouse", "fenced clearing with guardian", "bridge with barricade".
  - WorldUnitSolver (or a post-solve assembler) decides footprint + params (orientation, biome style, difficulty); sub-solver stamps atomically (honors nano + walk contracts).
  - This directly addresses "coherent playable sections" + water/pond complaints (composite vs emergent).
- **Cross-chunk / regional pacing**:
  - Strengthen border constraints so a gate near chunk edge can influence neighbor.
  - Track "sections completed" at macro level (persist in state like visited + resolved); use to bias future chunk moods or gate density.
- **Player feedback**:
  - Simple progress: "Section 2/5 complete" or minimap annotations for gated routes.
  - On resolving a major gate: chest reward + entropy feed + cosmetic chance.

**Docs update**: Note how composites fit the "entropy scopes to high-level recipes" directive.

### Phase 3: Engine Hygiene & Bug Debt (parallel or after Phase 1)
- Split or document WorldUnitSolver further (core AC-3 propagation vs. macro policy vs. stamping).
- Centralize "conditional state":
  - One source for gate/lock status (beyond cell mutation).
  - Make resolved cells + nano footprint re-application deterministic and robust.
- Address deferred high-value items from VisionAlignmentAudit:
  - EDGE_COMPAT symmetry (if safe after full regression + determinism hash check).
  - Remaining water/render depth/continuity (use isoSvgRenderer MCP + pixel tests).
- Layering enforcement: push more nano logic behind clear contracts; reduce stringly `assetKey` tests.
- Main.ts / game/ : continue extraction if any god functions remain (tickSubsystems, update still coordinate a lot).
- Add targeted metrics: "gating effectiveness" (fraction of forward movement that hits a lock) + feed into Validation.

### Phase 4: Feel, Polish, Measurement
- Perf: profile chunk gen on cross (TerrainBuilder + stamp + population hot paths). Consider light web worker for async gen if hitches felt.
- Content density + rewards: ensure every major gate area has satisfying payoff (Book entry, rare item, NPC lore).
- Difficulty/streak loop tighter: poor performance → easier nearby gates + hints; good streak → harder next section.
- Full end-to-end: "start → cross 2-3 gated macros → new biome feeling" validated in automated + manual play.
- Visual: more composite scenes make chunks read as distinct "places".

---

## 4. Suggested Next Actions (Concrete)
1. **Today/next**: Implement Phase 1 gate unavoidability + interaction polish. Add 1-2 Playwright gate tests. Teleport + quiz-resolve + advance scenario.
2. Spike 1-2 composite gated assemblies + wire one into ChunkGenerator (small footprint first).
3. Run full `npm test`, existing iso2 rendering specs, and a manual roam + "force a quiz gate solve" session. Capture before/after feel.
4. Draft or update a GitHub issue (or sub-issue under relevant epic) for "Macro Gating & Playable Sections".
5. If friction remains high, schedule a short "feel pass" (speed, hints, auto-interact near gates).
6. Re-audit against WorldEngine-05 guarantees after Phase 1+2.

---

## 5. Risks / Tradeoffs
- Adding more mandatory gates can feel "punishing" if not balanced with clear rewards + fair difficulty (use existing streak modulation).
- Composite assemblies give coherence but require authoring good templates (use isoSvgRenderer MCP heavily for iteration).
- Mutation model is load-bearing for saves; change carefully with determinism tests.
- WorldUnitSolver is high-risk; changes there need heavy regression (gen-determinism.spec + playability + chain integrity tests).

This plan builds directly on the excellent foundation of the recent splits, 25-cell macro alignment, and existing gate/DAG/populator code. It targets exactly the gap between "lots of local content and gates" and "the world feels like gated playable sections that force engagement to advance."

Ready to implement slices, write detailed sub-specs, or run verification subagents on any piece.