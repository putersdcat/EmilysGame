> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# Emily's Game — Research Library (2026-07-28)

> **HISTORICAL 2026-08-13.** Residual-recovery index for incremental repair.
> Current law: root `AGENTS.md`. Do not treat “branch law” or “keep closed
> campaigns closed” as living rules. Scavenge the work-package lists.

| Field | Value |
|-------|--------|
| **Status** | Historical agent note |
| **Branch law** | Repealed — was `src/` on `experiment/isometric-2.0` |
| **Synthesis of** | deep-research 1–3 (2026-07-28); residual plan active for **this** repo |
| **Playtest tip** | Residuals parked @ `784c3bf` (2026-07-20); no product fix commits through tip `0a30f0a` (inferred) |
| **AmysGame** | **Independent** product spawned from this repo; may mine ideas/data. **Not** a replacement for EmilysGame and **not** this repo’s recovery plan or product trunk. Do not gate Emily residual work on AmysGame. |

---

## 1. Product bar (success definition)

A child completes **one satisfying 5–15 min session**:

`spawn → reliable move → real quiz that opens on correct answer → policy-correct homestead leave → walkable house approach → leave into another intentional place`

without main-thread hang, softlock, false quiz exit, or unreadable “closed” places.

**Expansion model (after bar is met):** scene recipes + content packs + NPC personas — not new world ontology, nano systems, FOV thrash, or WorldUnitSolver campaigns.

---

## 2. Standing laws (do not violate)

| Law | Source of truth |
|-----|-----------------|
| Flat 2D sim owns walk/progression; iso is paint only | Docs/02, AGENTS |
| Walk SSOT = stamped `cell.walkable` | walkability-query / play-kernel walk |
| Openings = `quiz_gate` \| `door_locked` \| explicit open path | scene-first / expandability-rails |
| Illegal fence/wall gaps seal as **matching barrier**, not quiz_gate | place-coherence |
| FOV locked: on-screen diamonds 128×64; entityDisplayScale ~1.0 unless RFC | AGENTS |
| Product entry = `src/`; nested `experiment/isometric-2.0` = legacy/MCP, not live collision authority | AGENTS |
| Softlocks forbidden; wrong answers never cost progress | Docs/01, Docs/07 |

---

## 3. Closed campaigns (do not re-run)

| Campaign | Status | Do not |
|----------|--------|--------|
| Scene-first productization (PR1–7) | Landed | Re-execute that PR plan |
| Place Coherence (gen ↔ walk ↔ draw) | Landed | Re-execute epic plan |
| Critical-Path Recovery (hang/yield, boundary, gate policy, homestead 9×9) | Landed @ ~`784c3bf` | Re-execute PR1–7 plan |
| Playable-session recovery | Landed | Reopen only if playtest still fails hang class |

**Next open work is a new small residual epic**, not those plans.

---

## 4. Core residual defects (parked human playtest)

Evidence: `playtest-findings-after-critical-path-2026-07-20.md` @ tip `784c3bf`.  
Tip-fill (deep-research-2): no post-`784c3bf` product commits land fixes for these through `0a30f0a`. **Human re-play on current tip still required before treating as tip-green.**

| ID | Defect | Evidence / ownership | Fix intent |
|----|--------|----------------------|------------|
| **R1** | Correct quiz answer does not open gate | Human playtest; production path `pendingGateQuiz` → `resolveQuizGate` → cell → `door_open`; GH #223 / #256 still open on unlock AC | E2E live path: answer → walkable open pass |
| **R2** | Homestead exit is `quiz_gate` | Stamp + regression: sole opening rel `(4,8)` / abs `(13,16)` is `quiz_gate` | Starter leave = non-quiz functional open |
| **R3** | House S/W approach blocked; cottage reads as tiny house + rubble | 9×9 `starter_*` mass non-walkable; no apron redesign post-playtest | Walkable apron + readable multi-cell paint |
| **R4** | Bare fence quiz without NPC | Narrative law from playtest | Quiz only when NPC (or tutor prop) owns interact |
| **R5** | Walk feel at spawn still wrong | Stamps/clearance, not FOV | Stamp/clearance under cell SSOT |

**Contradiction to remember:** agent scripted core-loop (2026-07-18) reported gate open after correct answer; human playtest two days later found it broken. **Human play overrides green automation** for residual status.

---

## 5. Work packages (ranked)

Execute in order. Packages 1–3 are the residual epic; later packages are supporting/hygiene.

### WP1 — Quiz resolve open (P0)

| | |
|--|--|
| **Goal** | Correct answer rewrites gate cell to open walkable pass on **live** play path |
| **Touch** | `resolveQuizGate` / mechanics / `pendingGateQuiz` / interact-handler / motor re-query of `cell.walkable` |
| **Do not** | Debug-only unlocks; global `activeConditions` quiz unlock as walk authority |
| **Proof** | Human: answer → walk through. Spec: live-path regression (not only synthetic `door_open` stamp) |
| **Risks** | Modal clears `pendingGateQuiz` without rewrite; motor caches old walk; save/load loses open state (#256) |

### WP2 — Non-quiz homestead exit (P0)

| | |
|--|--|
| **Goal** | Starter yard leave is free open or light non-quiz open — not exam booth |
| **Touch** | `starter-homestead` stamp / openings / place-coherence expectations / homestead regression specs |
| **Do not** | Convert all quiz_gates to open; keep teaching gates elsewhere valid |
| **Proof** | Spawn → walk out south opening without quiz. Update tests that currently lock sole opening as `quiz_gate` |
| **Risks** | Regression suite asserts quiz_gate at abs `(13,16)`; place-coherence re-seals as quiz |

### WP3 — House apron + cottage readability (P0)

| | |
|--|--|
| **Goal** | South/west approach walkable; multi-cell mass reads as one cottage, not rubble |
| **Touch** | Starter cottage stamp, walk flags on apron cells, paint mass / zOffset under locked FOV |
| **Do not** | FOV change; nano thrash; WorldUnitSolver expansion |
| **Proof** | Human: approach S/W faces; screenshot bar if useful; no non-walkable apron neighbors |
| **Risks** | Footprint/half-extent vs stamp; later pipeline overwrites walk; paint-only “fix” that still blocks |

### WP4 — NPC-owned gate narrative (P1)

| | |
|--|--|
| **Goal** | Quizzes are asked by an NPC (or explicit tutor), not silent fence gaps |
| **Touch** | Interact ownership, NPC placement near teaching gates, optional talking-head UI (parked design seed) |
| **Proof** | No bare mid-fence quiz without person; interact path NPC-linked |

### WP5 — Walk SSOT hygiene (P1)

| | |
|--|--|
| **Goal** | One walk authority on product play paths: stamped `cell.walkable` |
| **Touch** | Audit residual `iso2/walkability`, `activeConditions`, `ensureChunkWalkableMap` consumers |
| **Do not** | Let presentation write gameplay walk state |
| **Proof** | Existing `walkability-ssot` tests; no product path that opens quiz_gate via global conditions |

### WP6 — Softlock / play-mode safety (P1)

| | |
|--|--|
| **Goal** | Single typed play-mode owner; no pause-before-quiz-UI; recoverable mid-play snag |
| **Note** | Ownership code exists (`paused` from modal stack/`controlLock`; `startQuiz` sync-activates) — re-measure severity at tip; not top of 2026-07-20 critical list |
| **Proof** | No orphan pause; illness locks bounded; mid-play unstick path |

### WP7 — Dual-tree ownership cleanup (P2)

| | |
|--|--|
| **Goal** | Product consumers do not treat experiment tree as live source of truth |
| **Touch** | `iso2-solver` port comments/re-exports; merge-prototype types; material-parity as regression net only |
| **Do not** | Speculative full-tree delete; second live app on product path |
| **Proof** | Import audit: product runtime has no experiment imports (tests/MCP may) |

### WP8 — Content / recipes under locked FOV (P2 after bar)

| | |
|--|--|
| **Goal** | Expand places via `AssemblyRecipe` + `openings[]` + biome weight; quizzes/articles via packs; NPCs via config |
| **Do not** | WorldUnitSolver/nano/FOV campaigns for expansion |
| **How-to** | `expandability-rails.md` |

### WP9 — Session-start stability (standing)

| | |
|--|--|
| **Goal** | Keep bulk load yielded + boundary budgeted; no reintroduction of cold-load/Continue hangs |
| **Note** | Critical-path landed hang fixes; protect under residual work |

---

## 6. Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| K1 | Residual R1–R3 **do not** reproduce at tip (docs lag) | Med | Wasted fix / wrong design | **Human re-play** spawn→quiz→leave before coding |
| K2 | Scripted green ≠ human critical path | High (already happened) | False “done” | Mandatory human AC for residual epic |
| K3 | Regression tests lock wrong product law (home = quiz_gate) | High | Blocks correct WP2 | Update homestead scene invariants with design |
| K4 | Dual walk APIs re-enter product collision | Med | Snags / walk-past / law break | WP5 audit; keep SSOT tests |
| K5 | Re-run closed campaigns under new names | Med | Thrash, no bar progress | AGENTS campaign table + this library §3 |
| K6 | Treating AmysGame as this repo’s default trunk / recovery gate | Med | Blocks Emily residual work wrongly | AmysGame is independent; Emily recovery stays active on this branch |
| K7 | GH #223/#256 scope creep (troll-bridge + historical AC) | Med | Epic bloat | Fix live residual epic; close/narrow issues when AC met |
| K8 | CI does not cover experiment branch (main-only; Actions disabled) | High | Silent tip break | Local tsc + targeted Playwright + human play |
| K9 | Multi-phase gen last-writer undoes residual stamps | Med | R2/R3 regress | Place-coherence + homestead tests after stamp changes |
| K10 | Save/load loses gate open (#256) | Med | Soft progression loss | Persist open state with unlock rewrite |

---

## 7. Acceptance matrix

### 7.1 Residual epic (must pass)

| AC | Check | Method | Status baseline |
|----|-------|--------|-----------------|
| AC1 | Correct quiz → gate walkable open → player passes | **Human** play + live-path test | Fail @ 784c3bf playtest |
| AC2 | Homestead leave without quiz | **Human** + stamp/invariant update | Fail (sole open is quiz_gate) |
| AC3 | Approach cottage south face | **Human** | Fail playtest |
| AC4 | Approach cottage west face | **Human** | Fail playtest |
| AC5 | No main-thread hang on cold load / Continue | Human / prior critical-path bar | Landed; protect |
| AC6 | No softlock on quiz open/close | Human | Ownership landed; re-measure |
| AC7 | Closed south fence still closed (no free walk-around) | Screenshot + place-coherence tests | Landed (keep) |

### 7.2 Automated proof net (regression; not substitute for AC1–4)

| Artifact / suite | Role |
|------------------|------|
| `tests/screenshots/proof-place-coherence-*.png` | Place seal / homestead composition |
| `tests/screenshots/proof-critical-path-spawn.png` | Spawn composition |
| `tests/world-gen/place-coherence-homestead.spec.ts` | Homestead structure (will need WP2/WP3 updates) |
| `tests/gameplay/quiz-gate-retry-loop.spec.ts` | Retry + synthetic open (extend for live path) |
| `tests/core/walkability-ssot.spec.ts` | cell.walkable authority |
| scene-invariants / ban-free-structure-atoms / gen-determinism | Scene-first law |

### 7.3 Out of acceptance for residual epic

- FOV / diamond size change  
- New nano kinds / EDGE_COMPAT rewrite  
- WASM renderer enablement  
- Docs/12–13 older backlog (pond template, content automation, visual re-attachment) as **priority override**  
- Re-port of entire experiment tree  

---

## 8. Structure map (failure drivers)

| Driver | What it is | Residual relevance |
|--------|------------|-------------------|
| Three pipelines | Gen stamp ↔ walk SSOT ↔ draw | Place/open mismatches after multi-phase gen |
| Dual walk | cell.walkable vs nano/`activeConditions` / terrain-cache maps | Snags if residual APIs re-enter play |
| Dual tree | `src/` product vs nested experiment Iso2 app | Port debt; not live collision if imports clean |
| Gate stack | Multi-phase gates + seal policy that over-used quiz_gate | R2, bare gates |
| Modal ownership | Shared paused / async quiz race | Softlock class (ownership improved) |
| Chunk gen | Phases 1–9.5 + WorldUnitSolver AC-3 + place-coherence last | Freeze expansion thrash; residual stamps last-writer aware |
| WASM | Optional, default off | Not current play failure driver |
| CI | main-only; screenshot dispatch; workflow disabled | Local proof discipline required |

---

## 9. Living backlog vs residual priority

| Source | Use as |
|--------|--------|
| This library + playtest 2026-07-20 | **Active priority for this repo** (residual epic WP1–WP3) |
| AGENTS campaign table | Closed vs next default (content + residual feel) |
| Docs/12–13 | Historical functional backlog — **stale relative to residual epic**; re-verify before ranking |
| Agent work tracker 2026-07-18 green | Not ground truth for R1 without human re-play |
| AmysGame handoff 2026-07-27 | Independent sibling product notes only — **not** a gate on Emily work |

---

## 10. GitHub / external trackers (tip-fill)

| Ref | State (as of deep-research-2/3) | Role |
|-----|--------------------------------|------|
| [#223](https://github.com/putersdcat/EmilysGame/issues/223) | Open; heavy discussion; live-demo AC unchecked | Gate/troll-bridge walk + quiz unlock |
| [#256](https://github.com/putersdcat/EmilysGame/issues/256) | Open; advances #223; quiz open + save/load | Main-game unlock integration |
| PR #276 | experiment → main textures | Not residual play path |

**Acceptance patterns from #223 / #256 (reinforce WP1 + WP5 — do not re-open closed Critical-Path PR plans):**

- Fence/wall never walkable; gate walkability conditional on lock state; bridge always walkable  
- Live demo: blocked when locked; pass after correct quiz  
- Pathfind null when locked; valid when unlocked; re-resolve after unlock  
- Persist open via save/load; rebuild walkable map on chunk-load / state-change only (not per-frame)  
- Playwright: assert blocked, then cross after quiz  

**Production unlock rail (WP1):** per-cell rewrite via `resolveQuizGate` → `door_open` (walkable) + deferred save after open — **not** shared global `activeConditions` quiz unlock as sole open authority.

**External concepts only (not drop-in):** cartesian-design/iso-paint (Infinite-Tile-Engine-2D); chunk load/unload (Phaser chunks_tutorial); collision≠paint (melonJS); JSON+maps+NPC dialog expansion (Tuxemon). Do not transplant AmysGame architecture into this repo.

---

## 11. Source index (canonical)

| Tag | Document / path |
|-----|-----------------|
| Law | `AGENTS.md`, `Docs/01`, `Docs/02`, `Docs/07` |
| Rails | `memories/repo/expandability-rails.md`, `definitive-path-forward-2026-07-16.md` |
| Closed designs | `design-scene-first-productization.md`, `design-place-coherence-epic-2026-07-19.md`, `design-critical-path-recovery-2026-07-19.md` |
| Softlock | `play-input-softlock-ownership-2026-07-19.md`, `design-play-stack-first-principles-2026-07-19.md` |
| Residuals | `playtest-findings-after-critical-path-2026-07-20.md` |
| Research | `deep-research-emilysgame-2026-07-28.md` + this file |
| Sibling product | `amys-game-greenfield-handoff-2026-07-27.md` (independent; not trunk for this repo) |
| Code SSOT | `src/engine/walkability-query.ts`, `src/engine/mechanics.ts`, `src/engine/iso2-assemblies/starter-homestead.ts` |
| Gen freeze | `src/engine/world/ChunkGenerator.ts`, `WorldUnitSolver.ts` |

---

## 12. How to use this library

1. **This repo’s product work stays on `experiment/isometric-2.0`.** Residual recovery (R1–R5 / WP1–WP9) is active — AmysGame does not replace or gate it.  
2. Before coding residuals: re-play **AC1–4** at tip first (K1).  
3. Implement **WP1 → WP2 → WP3** as one small design; then WP4–WP6 as needed.  
4. Update homestead regressions when WP2/WP3 change product law.  
5. Proof = **human play** + existing screenshot/spec net; never scripted green alone.  
6. Keep closed campaigns closed.  

---

## 13. Open uncertainties (carry forward)

- R1–R3 reproduction on tip after `0a30f0a` not re-playtested in research.  
- Why scripted open worked (07-18) vs human fail (07-20) not fully reconciled.  
- Whether blocked house approach is stamp, half-extent, pipeline overwrite, or paint-only.  
- Softlock residual severity at tip not re-measured.  
- Full experiment vs src material byte-diff not run (sampled parity only).  

---

*Author: synthesis of deep-research 1–3 (2026-07-28). AmysGame independence clarified in pass 3. Update when residual epic lands.*
