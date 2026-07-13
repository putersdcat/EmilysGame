# Vision Alignment Audit — sources & findings index

**Status:** Living reference document · **Started:** 2026-07-09
**Purpose:** Durable, checkable-back-to record of a research pass that read the
game's design/vision documents end-to-end and cross-referenced them against
real source code and the full GitHub issue history (48 open + ~224 closed
items), to build a grounded "does delivered work match the documented vision"
picture. This doc favors **references over restated detail** — follow the
links/paths for the full text; the point is to know *where to look next*,
not to duplicate it here.

> Full narrative detail, reasoning, and the two subagent research transcripts
> this doc summarizes live in repo memory (`/memories/repo/vision-model-and-
> gap-audit.md`) for the agent's own future reference. This file is the
> human-/repo-facing index of the same pass.

---

## 1. Sources consulted

### Vision / design documents (read in full or near-full this pass)
- `archived-planning/NewGame_GameBible_StartHere.md` — original dev bible (core loop, tech stack, world-gen rules, code structure)
- `archived-planning/NewGame_LlmEntropyAddendum.md` — LLM-as-entropy mechanic detail (wordlist, hashing, feedback loop)
- `archived-planning/NewGame_Isometric_PoC.md` — original isometric PoC plan (historical; superseded by the main engine)
- `archived-planning/Grokipedia_Book_of_Knowledge.md` — Book of Knowledge / word-bag spec
- `archived-planning/Knowledge_Capture_Automation.md` — educational-content pipeline spec (Python + API fetch + LLM rephrase vision)
- `archived-planning/Character_Sprite_System.md` — sprite system reference (current-state API doc, not pure vision)
- `Docs/WorldEngine-00-Index.md` through `Docs/WorldEngine-05-PopulationAndProgression.md` — the current authoritative world-engine design (spatial hierarchy, edge contracts, solver pipeline, rendering pipeline, population/progression + the "Five Guarantees")
- `ARCHITECTURE.md` — current engine architecture (cross-checked against WorldEngine docs' own "Current Implementation Status" sections, which are frequently stale — see §2)

### Not yet read this pass (candidates for a future continuation)
- `archived-planning/GPT-53-Codex_Core World Engine.md`, `Visual Mapping and Tile Asset Generation.md`, `Additional Technical Details, PoC Quirks, and UI Discussions Addendum.md` — all explicitly superseded by the WorldEngine-0X docs per `WorldEngine-00-Index.md`'s own text.
- `Docs/Iso2.0-HonestResearchAndPlan.md` — title strongly suggests a prior, narrower self-assessment already exists for the Iso 2.0 experiment specifically; worth reading before re-deriving similar ground.
- `Docs/Iso2.0-MainEngineIntegrationGuide.md`, `Nano-3D-Structural-Asset-Inventory.md`, `WallCornerGeometryReference.md`, `Iso2.0-PlayerAnchorConvention.md`.

### GitHub issue history (surveyed via two dispatched research subagents, both using the GitHub REST API directly for completeness)
- **All 48 open issues** — complete, single-call survey (`state=open&per_page=100`), cross-referenced against local source via `grep`/`read_file`.
- **All ~224 closed items** (~177 pure issues + ~47 merged/closed PRs, #1–#272) — complete, paginated survey.
- Repo memory: `/memories/repo/next-batch-plan.md`, `/memories/repo/step4-gameplay-systems-plan.md`, `/memories/repo/iso2-portback-plan.md` (this session's own prior audit work, same methodology applied at code-module scale).

---

## 2. Meta-finding: don't trust "current status" prose at face value

Every layer of documentation in this repo — `WorldEngine-03-SolverPipeline.md`'s
"Current Implementation Status" paragraphs, `ARCHITECTURE.md`'s own tables,
`.github/copilot-instructions.md`'s issue table, and even individual GitHub
issue bodies — goes stale faster than the code changes. Concrete proof points
from this pass alone:

- `.github/copilot-instructions.md`'s 10-issue table lists #1/#5/#7/#8/#9/#10
  as if current — **all six are already closed** (confirmed via API).
- `WorldEngine-03-SolverPipeline.md` Phase 6 says "no explicit chain integrity
  checking exists" — **false as of this session**; `enforceChainIntegrity`
  existed already and this session fixed real orientation bugs in it
  (commit `05a1df7`, see `/memories/repo/iso2-portback-plan.md` "Phase 3b/6").
- Issues **#3, #4, #6** are epics sitting at **100% sub-issue completion**
  while still marked open — functionally done, never formally closed.

**Rule going forward: treat any "current status" prose (docs or issues) as a
hypothesis to verify against real source (`grep`/`read_file`), never as
ground truth.**

---

## 3. Findings — vision vs. reality, with references

Legend: 🔴 confirmed real gap · 🟢 verified already implemented (false alarm) · ⚪ historical/cosmetic only · ✅ resolved this session (see commit)

| # | Topic | Verdict | Reference(s) |
|---|---|---|---|
| 1 | ✅ **RESOLVED (`235d474`).** Was: merchant/shop inventory had zero biome logic despite `WorldEngine-05-PopulationAndProgression.md` §4.1 promising biome-specific goods, **and** issue **#112** explicitly listing biome-weighted shop spawning as an acceptance criterion. Root cause was narrower than it first looked: flavor NPCs (farmer/ranger/miner/knight etc.) were already correctly biome-varied — only the wandering `npc_merchant` persona was flat. Fixed with 4 new biome personas (`merchant_meadow/_forest/_cave/_castle`) + a per-chunk merchant spacing cap (also resolves Finding #8). | `src/config/npc.config.ts` (`getMerchantPersonaIdForBiome`) · `src/engine/world/Populator.ts` · `tests/gameplay/merchant-biome-inventory.spec.ts` · issue #112 |
| 2 | 🟢 Quiz distance-based difficulty scaling — **already implemented**, not a gap. | `src/game/quiz.ts` (`getDifficultyForDistance`, `blendDifficulty`) · `src/game/interaction-handler.ts` · `WorldEngine-05` §9.1 |
| 3 | 🔴 **No "macro tile" (5×5 world-unit / 25×25 cell) spatial abstraction exists in the main engine.** Chunks (32×32) remain the only unit above micro cells. Confirmed absent, and confirmed **never falsely claimed as delivered** by any closed issue (checked out clean). **Assessed further 2026-07-10** with measured evidence from a user-reported live-playtest screenshot (a "pond" rendering as a lattice of interlocking water channels): reproduced directly via `solveWorldUnitGrid` with the real river-heavy mood — average 74% (18.4/25) of a chunk's World-Units become water-touching under that mood, some samples hitting 100%. Root cause confirmed structural, not weight-based: `EDGE_COMPAT.water` only accepts water/shore, so a slot bordering water is hard-constrained (not just weight-preferred) into also placing water content — tested and rejected the obvious mitigation (re-weighting mood modifiers only dropped the average to 65%). **Reframed 2026-07-10 by user architectural directive** (see `ARCHITECTURE.md` §6 "Entropy scope & the Composite Assembly pattern"): the correct fix is NOT a smarter AC-3 macro-tier or a neighbor-density weighting filter — it's a coherent pond/lake **composite template** placed atomically via a generalized Composite Assembly Sub-Solver (the same pattern already used in nascent form by `stampIso2Assembly`/`stampStarterHomestead`/`maybePlaceCastleLandmark`), not smarter per-slot solving. NOT implemented (correctly out of scope for a narrow slice) — full write-up + validation method in `/memories/repo/iso2-portback-plan.md`'s "Bug 3" entry and "Phases 9-10" entry. | `WorldEngine-01-SpatialHierarchy.md` §3.4 · `grep -ri "macro-tile\|macroTile\|MacroTile" src/**` (0 hits outside `experiment/isometric-2.0/`) · issue #6 (100% subs done, still open — origin of the unmet promise) · issue #46 body (own task list literally labels "Phase 4: Macro Assembly / Solver C" as "(gap)") · `src/engine/world/BiomeSelector.ts` (`MOOD_MODIFIERS['river-heavy']`) · `src/config/tiles.config.ts` (`EDGE_COMPAT`) · `src/engine/iso2-assemblies.ts` |
| 4 | ✅ **RESOLVED (`5fb481c`).** Was believed to need new authored "junction terminator" content -- investigation found that's NOT true: the bend/T-junction/crossroads templates already exist and are used as ordinary AC-3 candidates; `enforceChainIntegrity` just never reused them for termination, always collapsing to a 1-connector piece and discarding a cell's other real connections. Fixed via `findMultiWayTerminatorCandidates` (reduces a dangling bend/T-junction/crossroads to a same-family template matching its still-connected sides) + a chainType-based family-resolution fix (previously missed themed templates like `beach_cove`/`treasure_alcove`/`castle_corridor`). Real measured improvement: multi-way dangling count 255 -> 116 across the same 180-solve sweep. Residual traced to a separate, deliberately-deferred finding: `EDGE_COMPAT` (tiles.config.ts) is asymmetric despite its own "Symmetric table" comment. | `tests/world-gen/gen-chain-integrity-boundary-audit.spec.ts` · `src/engine/world/WorldUnitSolver.ts` (`findMultiWayTerminatorCandidates`, `resolveChainFamily`) · issues #42, #24, #49, #219 · `/memories/repo/iso2-portback-plan.md` "#4 extension" |
| 5 | 🟢 NPC greeting text feeding back into the LLM entropy pool ("closing the loop") — **already implemented**. | `src/game/interaction-handler.ts:131` (`feedEntropy(result.greeting)`) · `src/game/chunk-lifecycle.ts:152` (movement) · `src/main.ts:447` (quiz answers) · `NewGame_LlmEntropyAddendum.md` step 2 |
| 6 | 🟢 "Every dead-end has a reward" guarantee — **already implemented**, with its own repair pass. | `src/engine/world/ObstacleSolver.ts` ("Phase 6.5: Dead-End Reward Scanner") · `src/engine/world/Validation.ts` (`deadEndRatio`) · `WorldEngine-05` §7.1 Guarantee 2 |
| 7 | ✅ **RESOLVED (`5c3534e`), plus a much bigger bonus discovery.** Was: no data-integrity cross-reference between the quiz bank and Book-of-Knowledge articles. Investigating this surfaced that `quiz.ts` only ever drew from the 35-question STATIC bank — the 420 content-pack questions (PR #106, including geography/technology categories) were loaded at bootstrap but never actually reachable in real gameplay, only counted for age-profile stats. Fixed: `getMergedQuestions()` merges both pools (416 total now); also fixed `main.ts`'s idk-routing, which used a fragile text search instead of subject-based lookup (missed a real, correctly-tagged `technology` article). | `src/game/quiz.ts` (`getMergedQuestions`) · `src/main.ts` (idk-routing) · `tests/education/quiz-content-pack-integration.spec.ts` |
| 8 | 🔴 **No merchant NPC spacing/de-duplication rule** ("≥1 macro tile between merchants," "max 1 NPC per world unit"). Only generic decoration-cluster spacing exists, nothing merchant-specific. | `WorldEngine-05` §4.1 · `src/engine/world/Populator.ts` (`MIN_CLUSTER_SPACING`, decoration-only) |
| 9 | � **REFUTED on closer inspection — already implemented.** `cosmetic-unlocks.ts`'s `checkCosmeticUnlocks()` correctly reads `getWildlifeStats().discovered` and unlocks 2 real cosmetics at thresholds 5/8 species, called from real game-loop sites in `main.ts`. Not just a stats readout — a fully wired reward loop. | `src/game/cosmetic-unlocks.ts` · `src/config/cosmetics.config.ts` (`wildlife_discovered` condition) |
| 10 | ✅ **RESOLVED (`82c803a`), plus a much bigger bonus discovery.** Was: no field tracked NPC interaction history. Fixed with `state.talkedToNpcs`. Investigating this surfaced a SECOND, more severe bug: `state-init.ts`'s auto-resume-on-page-load path had its own inline restore-from-save block, diverged from `save-apply.ts`'s manual-slot-load path — silently missing discovered wildlife, survival status, injury state, quiz streak history, playtime, and touch mode on every normal browser close/reopen. Fixed: brought the auto-resume path to full parity. | `src/game/state-init.ts` · `src/game/game-state.ts` · `tests/gameplay/npc-interaction-history.spec.ts` · `tests/gameplay/save-resume-parity.spec.ts` |
| 11 | ✅ **CONFIRMED (2026-07-10) — #130's claim fully substantiated, no gap.** `music.config.ts`'s own header comment states "All music playback uses MIDI files through SoundFont piano samples. Legacy oscillator tracks have been purged." Verified directly: real `Midiocre` player + real `MidiocrePack.sf2` SoundFont2 file, 51-track real classical library (Bach/Beethoven/Mozart/Chopin/Debussy/and more) each with a real `.mid` file, `MusicInstrument` voicings (piano/harpsichord/pipe_organ/nylon_guitar/electric_guitar). Existing test coverage (`tests/audio/music.spec.ts` + `midi-tracks.spec.ts`, 26 tests) all pass. | issues #73, #74, #107, #130 · `src/game/audio/music.ts` · `src/config/music.config.ts` · `public/audio/music/` |
| 12 | ⚪ **Knowledge Capture Pipeline (#8) closed at only 2/4 (50%) sub-issues** per its own tracker. Delivered = one-time manual content drop (420 Q / 31 articles), not the automation pipeline `Knowledge_Capture_Automation.md` describes. Explicitly sanctioned as a fallback in the issue's own text — a known, not silent, shortfall. Automation core (#91 rephrasing/quality-gate, #95 CI refresh) confirmed **still open** (present in the open-issues table, milestone "Content & Polish"). | issue #8 · `Knowledge_Capture_Automation.md` · issues #91, #95, #96, #93 (open) |
| 13 | ✅ **RESOLVED (`82c803a`).** Was: `README_CI_CD.md`/`Docs/CI-CD-Workflow.md` both described push-triggered auto-deploy as one combined workflow. Confirmed the real architecture is two separate workflows (`ci-cd.yml` test+build only; `pages-deploy.yml` manual `workflow_dispatch` only) per closed issues #27/#123. Fixed both docs to describe reality + why (local LLM health-gate incompatible with static hosting). | issues #9, #27, #123 · `.github/workflows/ci-cd.yml` · `.github/workflows/pages-deploy.yml` |
| 14 | 🟡 **ASSESSED (2026-07-10), narrowed further (2026-07-13).** Fetched #116's exact body text: its own strict acceptance criteria (braids+spiky hair, eye color affecting the sprite, ≥1 new hat type) are fully met and exceeded (3 new hat/accessory types delivered: cowboy_hat, wizard_hat, flower_crown; outfit patterns match spec exactly: plain/floral/striped/starry). From #116's own broader Phase 2/3 task list (not part of its acceptance criteria): coin-count + streak-based unlock condition types **now delivered (`coin_count`/`streak_length` in `UnlockConditionType`, wired to real `state.inventory.countItem('coin')` / `state.streak.consecutiveCorrect`, 2 new cosmetics — `outfit_treasure_hunter` at 50 coins, `hair_streak_flame` at an 8-streak — proving both types end-to-end; 4 new Playwright tests, 16/16 `tests/sprites/cosmetics.spec.ts` passing)**. Still NOT delivered: eye **shape** selector (only eye color exists), **backpack** accessory, **scarf** accessory — these require new SVG rendering geometry (not just config/data wiring) and are left for a dedicated future slice. | issues #5, #102, #116 · `src/ui/customizer.ts` · `src/asset-pipeline/sprites.ts` · `src/config/cosmetics.config.ts` · `src/game/cosmetic-unlocks.ts` · `tests/sprites/cosmetics.spec.ts` |

---

## 4. GitHub housekeeping candidates surfaced (low-risk, not vision gaps per se)

- Epics at 100% sub-completion but never closed: **#3, #4, #6** (plus master epic **#2** at 88%).
- **#254** (B3: decompose gen.ts) — very likely already done (`gen.ts` is now a 71-line barrel per `/memories/repo/next-batch-plan.md`); verify-and-close candidate.
- **#246** (Iso2 structural port) — has a full delivery-report comment (commit `d7917d6`), reads complete, likely just never closed.
- **#273**'s own body has an internal numbering inconsistency (claims "B6=#269=render.ts" but #269 is titled "B9: iso2-solver.ts").
- **#184** (rendering depth/parallax research spike, ~5mo dormant) likely superseded by #214/#247.
- **#242/#243** (Iso2 brick/weathering texture issues) likely superseded by #275's broader texture-factory work.
- **#212** ("this issue never closes, it evolves") is itself marked closed — cosmetic self-contradiction.
- **#140** closed with `merged_at: null` (closed without merging) — confirm the fix landed elsewhere or is still outstanding.
- **#266** is the *only* `bug`-labeled open issue (pre-existing water-cell collision leak after raw cell mutation) — good top-of-queue bug candidate whenever bug-fixing time comes up.
- **#223** has 253 comments (by far the most-discussed open issue, gate/troll-bridge walkable logic + quiz/key unlock) — mine this thread before doing any new audit work on gate/bridge walkability, to avoid re-litigating already-discussed ground.
- **#260** [EPIC] Visual Quality & World Coherence — 0/4 sub-issues started (biome scatter coherence, visible diamond-grid seams, water/stream cross-tile seams, bridge bank-to-bank placement).

---

## 5. Suggested next actions (updated as work has landed — see ✅ markers in §3)

1. ~~File a new GitHub issue for finding **#4**~~ — still needed (no `gh` write
   access this session; `gh repo view` confirms `viewerPermission: READ`
   only). Draft-ready issue text should be prepared for the user to file.
2. ~~Consider a follow-up issue or direct fix for finding **#1**~~ — **DONE**,
   see §3 row 1 (`235d474`).
3. ~~Cheap, mechanical test to add: quiz-bank ↔ Book-of-Knowledge
   cross-reference~~ — **DONE**, see §3 row 7 (`5c3534e`); this investigation
   also surfaced and fixed a much larger bug (content-pack quiz questions
   were entirely unreachable in real gameplay).
4. Spot-checks — **DONE**: audio quality vs #130's claim (#11, see §3 row
   11 — fully confirmed, no gap), sprite customizer against #116's
   specific claimed deliverables (#14, see §3 row 14 — acceptance criteria
   met; coin-count/streak-length unlock condition types now delivered
   2026-07-13; residual narrowed to eye shape, backpack, scarf, which need
   new SVG rendering work).
5. Epic-housekeeping pass (close #3/#4/#6/#254/#246 if verification confirms
   them done) — near-zero risk, cleans up the board. **Not yet done** —
   drafted as ready-to-file notes for the user, since this session's `gh`
   access is read-only.
6. Finding **#10** (NPC interaction history) — **DONE**, see §3 row 10
   (`82c803a`); this investigation also surfaced and fixed a second,
   independent save-fidelity bug affecting the auto-resume-on-page-load path.
7. Finding **#13** (CI/CD doc drift) — **DONE**, see §3 row 13 (`82c803a`).
8. Finding **#3** (macro-tile gap) — **ASSESSED**, see §3 row 3. Root cause
   confirmed structural (edge-compatibility "stickiness"), measured across
   32 samples, obvious weight-based mitigation tested and rejected. No
   code changed — correctly a scoping deliverable, not a fix, per this
   repo's own anti-speculative-reorganization convention. Full write-up +
   validation method in repo memory `iso2-portback-plan.md`'s "Bug 3"
   entry.
9. Finding **#4** (multi-way junction terminators) — **DONE**, see §3 row 4
   (`5fb481c`). Turned out to be a tractable CODE fix, not new authored
   content — the bend/T-junction/crossroads templates already existed as
   ordinary AC-3 candidates; termination just never reused them. A separate,
   more foundational finding was surfaced and deliberately deferred:
   `EDGE_COMPAT` (tiles.config.ts) is asymmetric despite its own "Symmetric
   table" comment (`EDGE_COMPAT.wall` includes `'open'`, but
   `EDGE_COMPAT.open` is missing `'wall'`) — too high-blast-radius (touches
   the whole AC-3 solver, would likely shift the determinism hash and real
   template-adjacency frequency broadly) to bundle into a narrow fix. Worth
   its own dedicated session with full regression validation if picked up.
10. **NEW (2026-07-10, not a Vision Alignment Audit finding, but recorded
    here for visibility)**: user-reported live-playtest rendering bugs —
    river bank/water-surface negative-Z depth wrong, multi-tile water flow
    continuity wrong, and water-under-bridge wrong (both visually and
    possibly for walkability, though this may be entirely explained by the
    rendering issue rather than a real collision regression — Slice B
    already proved bridge walkability correct via live engine queries for
    the cases it tested). Fully written up with suggested triage entry
    points in repo memory `iso2-portback-plan.md`'s "KNOWN BUGS" section.
    **Bug 2 (water-under-bridge) — RESOLVED 2026-07-13.** Root cause
    precisely measured: the bridge deck's rendered width (`widthHalf=28`,
    56px) was narrower than the water channel it must fully cover
    (`RIVER_CHANNEL_WIDTH=64`, half-width 32) — an 8px total shortfall
    that let water visibly peek out past the deck's edges. Confirmed via
    live `isFootprintWalkable()` checks that collision was already
    correct both before and after (a pure rendering fix, not a collision
    change). Fixed in `src/rendering/nano-tile.ts`: new shared
    `RIVER_CHANNEL_WIDTH` constant + widened deck (`widthHalf =
    RIVER_CHANNEL_WIDTH/2 + 3` = 35). Full regression: `tsc --noEmit`
    clean, all 63 existing `tests/rendering/iso2-*.spec.ts` tests +
    `gen-determinism.spec.ts` green, zero regressions. See repo memory
    `iso2-portback-plan.md`'s "Bug 1 / Bug 2 triage" entry for the full
    writeup, including several pixel-test approaches that were tried and
    didn't yield a reliable automated regression guard (the arched bridge
    geometry made this genuinely difficult) — the fix itself remains
    mathematically certain and low-risk regardless.
    **Bug 1 (depth + continuity) — partially investigated, not resolved.**
    A precise contributing factor was found for the continuity complaint
    (`waterStyleForTile`'s per-tile procedural color seed includes
    worldCol/worldRow, so adjacent tiles in a connected river get
    uncorrelated random shade variation even though the color FAMILY
    stays correctly consistent) but a direct visual test of a long,
    clean river run didn't show dramatic breakage, so no code change was
    made without clearer before/after evidence. The depth complaints are
    assessed as subjective art-direction (no clear "should be X, is Y"
    code defect the way Bug 2 was) — not changed. Not yet triaged
    further; no GitHub issue filed (same read-only `gh` access limitation
    as this document's own open items).

This document should be updated in place (not replaced) as further research or fixes land — append new rows to §3/§4 rather than starting a new file.
