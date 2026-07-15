# Vision working-model + delivered-work gap audit (started 2026-07-09)

User's explicit request (verbatim): "take a bunch of time to read over the documents
defining how the game is invisioned to work, and check also over all the old and
currently open issues and epics and things in github and even the closed stuff and
use this to formulate a solid working model of all the core things and then maybe
you can do some more re-assesment of the things already delivered and determine
they are not exactly working as they were invisioned". Requested BEFORE resuming
Step 4 #1 (trading.ts) -- see `next-batch-plan.md` / `step4-gameplay-systems-plan.md`
for that queued work, which stays paused until this document's synthesis is done
and reviewed with the user.

This file is the durable record of that research pass. Read this FIRST in any
future session before re-reading the source docs -- it's the distilled synthesis.

## Docs read so far (this pass)

- `archived-planning/NewGame_GameBible_StartHere.md` -- original dev bible (full read)
- `archived-planning/NewGame_LlmEntropyAddendum.md` -- LLM entropy mechanic detail (full read)
- `archived-planning/NewGame_Isometric_PoC.md` -- original isometric PoC plan (full read, mostly superseded/historical)
- `archived-planning/Grokipedia_Book_of_Knowledge.md` -- Book of Knowledge spec (full read)
- `archived-planning/Knowledge_Capture_Automation.md` -- content-pipeline spec (full read)
- `archived-planning/Character_Sprite_System.md` -- sprite system reference (partial, first ~120 lines; mostly a current-state API reference, not vision)
- `Docs/WorldEngine-00-Index.md` (full)
- `Docs/WorldEngine-01-SpatialHierarchy.md` (full) -- 4-tier hierarchy: Micro/Nano/World-Unit/Macro
- `Docs/WorldEngine-02-EdgeContracts.md` (full) -- compatibility tables, corner governance, AC-3 propagation, streaming-world universal adapters
- `Docs/WorldEngine-03-SolverPipeline.md` (full) -- 10-phase pipeline, each phase's "Current Implementation Status" is likely STALE now (written before this session's Slice A-E / Step 2/3 work)
- `Docs/WorldEngine-04-RenderingPipeline.md` (partial, through WASM section) -- cache hierarchy L1-L5, draw-command pool, viewport culling, WASM acceleration targets (currently disabled, JS path wins)
- `Docs/WorldEngine-05-PopulationAndProgression.md` (full) -- entity taxonomy, lock-key DAG, NPC placement rules, Five Guarantees, distance-based difficulty curve

**NOT yet read this pass** (candidates for later, lower priority -- WorldEngine docs
explicitly supersede the first three):
- `archived-planning/GPT-53-Codex_Core World Engine.md` (superseded per WorldEngine-00's own text)
- `archived-planning/Visual Mapping and Tile Asset Generation.md` (superseded)
- `archived-planning/Additional Technical Details, PoC Quirks, and UI Discussions Addendum.md` (superseded)
- `archived-planning/GitHub_Actions_Pipeline_to_WebApp.md`
- `Docs/Iso2.0-HonestResearchAndPlan.md`, `Iso2.0-MainEngineIntegrationGuide.md`, `Nano-3D-Structural-Asset-Inventory.md`, `WallCornerGeometryReference.md`, `Iso2.0-PlayerAnchorConvention.md` (already well internalized via ARCHITECTURE.md + this session's own iso2 work)
- GitHub issues: NOT yet surveyed (48 open + 176 closed) -- next step, likely via subagent dispatch to avoid context burn.

## CRITICAL META-FINDING: vision docs' "Current Implementation Status" sections are unreliable

Same lesson as `next-batch-plan.md`'s "several repo docs are stale" finding, but now
confirmed for the WorldEngine docs too. `WorldEngine-03-SolverPipeline.md` Phase 4
(Macro Assembly) says "No macro assembly solver exists" and Phase 3 (Boundary
Collection) says "No boundary collection exists" -- but this session's OWN work
(and `iso2-portback-plan.md`'s full history) proves `engine/world/WorldUnitSolver.ts`
(954 lines), `applyBorderConstraints`, and AC-3 constraint solving DO exist in the
current engine, just not necessarily exactly as these docs describe. **Rule: treat
every "Current Implementation Status" paragraph in these docs as a HYPOTHESIS to
verify against real source, never as ground truth.** ARCHITECTURE.md §6's table is
the more actively-maintained cross-reference (dated 2026-06-11) but even THAT is
one version behind this session's Step 2/3 work (castle landmarks, chain-integrity
fixes) -- always re-verify against actual `src/engine/world/*.ts` source.

## Core vision synthesis (distilled)

### What the game fundamentally is
Browser isometric procedural adventure, TypeScript+Canvas2D, no engine, built for
one child, LLM-driven entropy (BitNet local model) as a "creative RNG" (nonsense
verb/noun text -> hashed -> numeric seeds), 5-15 min sessions, quizzes gate/reward
progression, Zelda-like exploration loop (explore -> collect -> obstacle -> NPC ->
treasure room -> new seed). See `NewGame_GameBible_StartHere.md`.

### The LLM entropy mechanic (`NewGame_LlmEntropyAddendum.md`)
- NOT semantic/narrative-driven -- deliberately NONSENSE text, mathematically
  hacked (SHA-256 hash -> hex chunks -> seeds; ASCII sums modulo -> params).
  Thematic clustering is an accepted EMERGENT bonus ("LLM fixating on 'space'
  yields starry biomes"), not a designed feature to build logic around.
  **Reassessment angle: is any code today accidentally treating LLM output as
  semantically meaningful rather than pure entropy? Worth a targeted grep.**
- Wordlist init (50 verb-noun pairs) at game start; player movement direction
  maps to verb/noun table entries; NPC chat keywords feed back into the pool
  ("closing the loop" -- entropy evolves from player's own actions/words).
  **Reassessment angle: does the current llm.ts/gen.ts actually feed NPC chat
  keywords back into the entropy pool, or was this never wired?** (This is
  exactly the shape of gap this session's methodology keeps finding elsewhere
  -- a documented feedback loop that "sounds" implemented but may not connect.)
- Fallback to TS RNG if LLM >1-2s -- confirmed already a hard rule elsewhere
  (llm-integration.instructions.md), consistent with vision.

### Spatial hierarchy target (`WorldEngine-01`) -- Micro / Nano / World-Unit / Macro
- **Micro (L0)**: 1 cell, traversal class (walkable/blocked/CONDITIONAL/HAZARDOUS
  -- note HAZARDOUS is "reserved for future," not yet used anywhere: lava/thorns/
  poison swamp do not exist yet, confirm this is still true), height 0-10,
  4-sided edge connector signature, surface type, decoration eligibility tags,
  variation family. Doc's own gap list (as of writing): no blocked/conditional
  distinction (both walkable:false), no decoration eligibility tags (population
  "currently ignores tile suitability" per the doc) -- **worth re-verifying
  against current Populator.ts/ObstacleSolver.ts, may be stale.**
- **Nano (L0.5)**: the 3x3 sub-grid overlay -- THIS is the concept the whole
  `experiment/isometric-2.0` port-back (this session's Slices A-E) has been
  making real. Four render families: positive-Z billboard (fence/gate/bridge/
  tall-grass), positive-Z extruded (stone-wall/cathedral-wall/homestead-wall),
  negative-Z carve-out (river/river-bank), flat overlay (decals, not yet built).
  Stack ordering policy: negative first, flat second, positive last.
- **World Unit (L1)**: 5x5 micros + nano overlay plan. Rich metadata target:
  nano overlay plan, full 5x5 traversal mask, MOVEMENT CHANNELS (not just raw
  walkability -- explicit logical pathways), 5-element border edge signature
  vectors (current impl collapses to 1 dominant tag/side per doc), transform
  permissions (rotate/flip validity), connectivity class (river/wall/fence/
  path chain, enclosure, terminal, standalone), internal anchor points (spawn/
  gate/NPC/scenic), minimum internal openness (declared not computed), biome
  affinity tags. **11 world unit templates exist in tiles.config.ts per the
  doc's own gap note -- re-verify current count, likely grown.**
- **Macro (L2)**: 5x5 world units = 25x25 micros. Macro edge contracts,
  mandatory entrance/exit per side, ROUTE CORRIDORS (full/gated/none),
  progression landmarks (gate corridor, key region, NPC checkpoint, safe
  pocket, reward cluster), difficulty/biome profile, solver confidence +
  repair history (debug metadata). **No macro tile abstraction exists at all
  per the doc -- chunks (32x32) are the only spatial unit above micro. This
  is a real, large, acknowledged architecture gap** -- the doc proposes 4
  resolution options (A: replace chunks with 25-size; B: macro as generation
  overlay only; C: rename; D: padding). No evidence yet that this was ever
  decided/started -- **worth confirming in gen.ts/engine/world/ whether ANY
  macro-tile-equivalent concept exists, or whether chunks are still doing
  double duty with template stamps placed with no inter-chunk edge checking.**
  This session's own Phase 3b/6 chain-integrity fix (`iso2-portback-plan.md`)
  is directly relevant prior art here -- it touched `applyBorderConstraints`.

### Edge contracts (`WorldEngine-02`)
- Compatibility table (open/water/wall/fence/shore/wall-cap/fence-post/path/
  gate) -- multi-dimensional: surface continuity, traversal continuity, height
  continuity, semantic/chain continuity, nano overlay continuity.
- Corner governance: at most 2 surface types per corner, no "pinch" corners
  (diagonal-only connections), chain corners must be traceably continuous.
  Doc admits full corner governance is NOT implemented for MVP -- relies on
  auto-tiling + well-authored templates statistically producing OK corners.
  **Reassessment angle: has this session's wall-corner work (WallCornerGeometryReference.md exists!) actually implemented explicit corner governance, or still relying on the statistical fallback?** Worth reading that doc.
- AC-3 constraint propagation, "boundary -> chains -> most-constrained ->
  unconstrained fill" ordering strategy, 3-tier backtracking recovery
  (targeted replace -> local region restart -> full macro restart -> degrade
  to Perlin fill), universal adapter tiles (open/grass clearing compatible
  with everything) to prevent streaming-world deadlock.

### Solver pipeline (`WorldEngine-03`) -- 10 phases, target vs current (AS OF DOC WRITING, likely stale -- see meta-finding above)
1. Entropy Harvest -- doc says implemented (`expandEntropy`/`fastHash`)
2. Theme Selection -- doc says biome selection basic-implemented; mood/
   difficulty modulation, biome spatial coherence (Perlin-based biome map or
   neighbor bias), biome transition handling all NOT implemented per doc.
   **HIGH VALUE re-check**: does `selectBiomeCoherent` (referenced in
   ARCHITECTURE.md §6 as already done) satisfy this, or is it a different/
   partial thing? Name suggests coherence was addressed.
3. Boundary Collection -- doc says NOT implemented at all (doc predates
   `applyBorderConstraints`, which DOES exist per ARCHITECTURE.md/this
   session -- confirmed stale).
4. Macro Assembly (Solver C, AC-3 on 5x5 world-unit grid) -- doc says NOT
   implemented, current approach is Perlin + 0-3 random template stamps, no
   edge checking. **This is the single biggest doc-vs-reality question left
   open** -- does `WorldUnitSolver.ts` (954 lines, exists per next-batch-
   plan.md's line-count survey) actually implement this AC-3 macro assembly,
   or is it a differently-scoped solver? Its size suggests real substance.
   Needs a dedicated read, not guessing from the name.
5. Micro Fill/Nano Resolution/Auto-tiling -- doc says Perlin cell-fill +
   template stamping exist; variation families, auto-tiling bitmasks, and
   the DEDICATED nano-overlay resolution phase mostly live in
   `experiment/isometric-2.0/`, not main pipeline (doc's own words) --
   **this session's whole Slice A-E arc is precisely the port-back of this
   gap, so real progress has been made here since the doc was written.**
6. Chain Integrity Check (Solver A/B) -- doc says NOT implemented ("no
   explicit chain integrity checking exists... enforcePassability... does
   not verify chain continuity"). **CONFIRMED STALE**: this session's own
   Phase 3b/6 work (`05a1df7`) found `enforceChainIntegrity` ALREADY existed
   and wired into `solveWorldUnitGrid`, and fixed real bugs in it. Good
   concrete proof of the meta-finding above.
7. Progression Placement (Solver D, lock-key ordering) -- doc says basic
   `balanceObstacles` exists but "does not verify that the key is reachable
   before the door (no ordering guarantee)." **Also likely stale** -- this
   session's Phase 7 audit (see `iso2-portback-plan.md`) gave this a "clean
   bill of health" already, implying real DAG-ordering logic exists now
   (`getLockKeyDebugInfo` referenced in ARCHITECTURE.md). Reconcile the
   doc's pessimism against the actual Phase 7 audit notes on next read.
8. Population (Solver E) -- doc says `placeFeatures` is random/no anchors/
   no spacing/no clearance/no NPC role-by-position. **Directly matches this
   session's live trading.ts finding** (merchants always `merchant_default`
   regardless of biome) -- strong corroboration, not just a guess.
9. Playability Validation (Solver F) -- doc says basic BFS + border-midpoint
   entry forcing exists; lock-key ordering, dead-end ratio, density targets,
   traversal fairness NOT validated. Partially superseded: Phase 7 audit
   (this session) says lock-key ordering IS checked now. Dead-end ratio/
   density/fairness checks status unconfirmed -- worth a targeted grep for
   "deadEnd" / "traversalFairness" / density-tolerance style checks.
10. Cache Preparation -- doc says terrain cache + object cell cache exist,
    auto-tiling sprite selection does not. Matches ARCHITECTURE.md current
    state fairly well (terrain-cache.ts, render.ts object cache both real).

### Rendering pipeline (`WorldEngine-04`)
- 5-layer architecture (ground fill -> pre-rendered terrain -> depth-sorted
  objects -> effects/overlays [NOT YET IMPLEMENTED, particles.ts may now
  cover some of this -- check] -> DOM UI).
- Cache hierarchy L1 micro-tile atlas, L2 emoji sprite cache, L3 chunk
  terrain cache (~8.9MB/chunk at full res -- doc flags this as a real memory
  concern, suggests resolution reduction or smaller macro-aligned chunks;
  **worth checking current chunk canvas memory footprint vs this 80MB/9-chunk
  estimate, could be a legit unaddressed perf risk**), L4 shadow sprite
  cache, L5 character sprite cache. L6 (world-unit composite cache) proposed
  but not built -- reasonable, no urgency.
- Draw command pool (8192 entries, pre-allocated, no per-frame GC) -- matches
  ARCHITECTURE.md's `jsPool` description, consistent.
  Draw budget: 400 commands/frame ceiling mentioned in this doc; confirm
  against actual constant in render.ts (may have changed).
- WASM: doc confirms current JS path outperforms WASM due to marshalling
  overhead, WASM disabled by default -- consistent with ARCHITECTURE.md.

### Population & progression (`WorldEngine-05`) -- most gameplay-critical doc for reassessment
- Entity taxonomy: Progression (locks/keys/toll/quiz-gates/NPC-gatekeepers),
  Knowledge (quiz NPCs, word-bag triggers, knowledge-gated discoveries),
  Economic (coins/potions/trade-goods), Social (merchants/villagers/
  guardians), Decorative.
- **CONFIRMED VISION TEXT for the trading.ts gap already found this session**:
  "The merchant's inventory is determined by biome (biome-specific item
  weights) and difficulty level" + "forest merchant sells mushrooms and
  potions; castle merchant sells keys and shields" -- this is the EXACT
  passage `step4-gameplay-systems-plan.md` already cited. Now doubly
  confirmed as real, explicit, unambiguous vision text, not a stretch
  interpretation. Also: "No more than one NPC per world unit tile", "at
  least one full macro tile between merchants" spacing rule -- worth
  checking whether ANY spacing/de-duplication logic exists for merchant
  placement at all (a second, smaller potential gap alongside the
  inventory-by-biome one).
- **Five Guarantees (7.1)** -- the cleanest possible reassessment checklist:
  1. No Softlocks (lock-key DAG + quiz-always-solvable-via-retry)
  2. No Dead Ends Without Reward (every dead-end has >=1 collectible/NPC)
  3. Every Macro Tile Traversable (BFS entry->exit)
  4. Progression Is Paced (difficulty correlates with distance-from-spawn)
  5. The World Is Learnable (every quiz has a Book of Knowledge article;
     every answer factually correct) -- **this is a literal data-integrity
     claim that can be MECHANICALLY tested** (cross-reference quiz bank
     against Book of Knowledge article keys) -- flagged already in
     `step4-gameplay-systems-plan.md` item 5 as a good candidate.
  Guarantee 2 (dead-end reward) has NOT been separately investigated by any
  prior session work I've seen in memory -- **new candidate, not yet in the
  step4 plan's list. Consider adding.**
- Difficulty table (9.1): distance 0=90% meadow/tutorial-quiz/no-locks/high
  collectibles; 1-2=70/30 meadow-forest/easy; 3-5=mixed/medium/1-2 locks;
  6-9=forest-cave/hard/2-3 locks; 10+=cave-castle/expert/3-4 locks. This is
  a concrete, testable table -- `step4-gameplay-systems-plan.md` already
  flagged quiz.ts's own `TODO: DOC` marker at line 190 about this exact
  thing as suspicious/under-verified.
- Streak awareness: correct streak -> harder quizzes + rarer rewards; wrong
  streak -> easier quizzes + hint NPCs + more generous collectibles. **Not
  yet flagged in any prior audit -- new candidate**: does ANY code read
  quiz streak state to modulate population/spawn density, or does streak
  ONLY affect quiz selection (a narrower, more likely-implemented subset)?

### Book of Knowledge / educational content (`Grokipedia_Book_of_Knowledge.md`, `Knowledge_Capture_Automation.md`)
- Subject selection menu at new-game start (Math/Language/History/Science/
  Technology, max 3-5), biases quiz sourcing 70/30 toward selected/random.
- Word bag: click-to-save unfamiliar terms during quiz/chat, lookup in Book,
  small XP/coin reward for using a saved word correctly later.
- Book content: pre-cached simplified articles (Simple English Wikipedia /
  Grokipedia-style), searchable, highlights saved words, "read" progress
  tracking / badges.
- Content pipeline: offline Python script, fetch from free APIs (Khan,
  NASA, Simple Wikipedia, CK-12, etc.), LLM-rephrase for kid-friendliness,
  organize into `content/<subject>/{quizzes,book}.json`, target 100-500
  items/subject, <10MB total bundle, periodic re-run via GitHub Actions.
  **Issue #8 "Knowledge Capture Pipeline" (task, open per copilot-instructions.md
  issue table) is presumably tracking this exact spec -- confirm its
  current status/scope when the GitHub issue survey runs.**

## GitHub open-issues survey results (subagent, 2026-07-09) — CORRECTS several hypotheses above

Full 48-open-issue survey done via GitHub REST API (complete, single call, all
bodies fetched). Full report cached in session transcript; key corrections to
this file's earlier hypotheses, ALL independently source-verified by the
subagent (grep/read_file), not just issue-text-trusting:

- **copilot-instructions.md's issue table is STALE**: 6 of the 10 listed
  issues (#1,#5,#7,#8,#9,#10) are already CLOSED (Feb 2026). Only #2,#3,#4,#6
  remain open -- and #3/#4/#6 are each at 100% sub-issue completion yet never
  closed (housekeeping candidate, near-zero risk).
- **Hypothesis 2 (quiz distance-difficulty) -- REFUTED, already implemented.**
  `quiz.ts`'s `getDifficultyForDistance()` + `blendDifficulty()` fully wired
  into `interaction-handler.ts`. The `TODO: DOC` marker is doc-debt only, not
  missing logic. Close this question, no further audit needed.
- **Hypothesis 5 (NPC chat -> entropy feedback) -- REFUTED, already implemented.**
  `feedEntropy(result.greeting)` in `interaction-handler.ts:131` (explicit
  `// Feed NPC greeting into entropy pool (#4)` comment), plus movement
  (`chunk-lifecycle.ts:152`) and quiz answers (`main.ts:447`). Issue #4's own
  prose checklist is just stale (unchecked box, but code is done).
- **Hypothesis 6 (dead-end reward guarantee) -- REFUTED, already implemented.**
  `ObstacleSolver.ts` has an explicit "Phase 6.5: Dead-End Reward Scanner
  (WorldEngine-05 §7.1, Guarantee 2)" + `Validation.ts` tracks
  deadEndRatio/deadEndCount with repair. Fully done.
- **Hypothesis 1 (trading.ts biome inventory) -- CONFIRMED real gap.** Also:
  `Populator.ts` DOES vary which NPCs spawn per biome, but the NPC->persona
  mapping still collapses `npc_merchant` to `'merchant_default'` always, and
  `config/npc.config.ts`'s `SHOP_MERCHANT_PERSONA.trades` is one hardcoded
  list with zero biome branching. Matches `step4-gameplay-systems-plan.md`
  exactly (still paused, no GitHub issue exists for it yet).
- **Hypothesis 3 (macro-tile abstraction) -- CONFIRMED real, acknowledged gap.**
  `grep macro-tile|macroTile|MacroTile` across `src/**` = zero hits in main
  engine (only in `experiment/isometric-2.0/src/types.ts` comments). Issue #6
  (100% subs done, still open) is literally the origin of the "Macro Tile
  (5x5 chunks)" promise -- descoped somewhere with NO comment-trail
  explanation. World Unit tier (one level below) IS fully real
  (`WorldUnitSolver.ts`, 954 lines, AC-3 solving). No GitHub issue tracks the
  missing macro tier specifically.
- **Hypothesis 4 (corner/multi-way-junction governance) -- CONFIRMED real,
  and it's literally THIS SESSION's own Phase 3b/6 work (commit `05a1df7`,
  today).** `findTerminator` bug (only correctly capped south-dangling
  chains) is fixed; single-connector dangling went from 726 -> low single
  digits. Multi-way junction shapes (bends/crossroads/T/islands/shore
  corners/cave forks) have NO dedicated terminator content at all --
  `gen-chain-integrity-boundary-audit.spec.ts` explicitly defers this as a
  "known gap" via console.log, doesn't assert to zero. **No GitHub issue
  exists for this residual** (closed #42 covered the ORIGINAL edge-contract
  system, not this newly-discovered residual from today's fix) --
  **candidate for a new issue.**
- **Hypothesis 7 (Book of Knowledge <-> quiz cross-reference) -- CONFIRMED
  real gap, no issue.** Matches `step4-gameplay-systems-plan.md` item 5
  exactly.
- **Hypothesis 8 (merchant spacing/de-dup) -- CONFIRMED real gap, no issue.**
  Only generic decoration-cluster spacing exists (`MIN_CLUSTER_SPACING = 5`),
  nothing merchant/NPC-specific.
- **Hypothesis 9 (wildlife discovery payoff) -- CONFIRMED real gap (matches
  step4 plan item 4).** `discoveredSpecies` tracking IS real and durable
  (save/load round-trips correctly), but zero reward/badge/Book-of-Knowledge
  tie-in exists (`grep -i achievement src/game/wildlife.ts` = zero hits).
- **Hypothesis 10 (save/load fidelity) -- Mostly comprehensive, ONE real gap.**
  `SaveData` covers nearly everything in WorldEngine-05 §8.5's checklist
  (items, resolvedCells, visitedChunks, quiz stats, entropy buffer, Book of
  Knowledge state, wildlife discovery, status/injury, cosmetics, fog of war,
  age band, playtime) EXCEPT **NPC interaction history** -- no field tracks
  which NPCs have been talked to / any repeat-visit state. Matches
  step4-gameplay-systems-plan.md item 3's risk flag exactly.

### Other high-value findings from the open-issue survey (not in my original hypothesis list)

- **#266** is the ONLY `bug`-labeled open issue: pre-existing player-walks-
  through-manually-injected-water-cell (collision doesn't consult cached
  walkable map after a raw cell mutation). Reopened, 2 comments.
- **#223** has 253 comments (by far the most-discussed open issue) --
  gate/troll-bridge walkable logic + quiz/key unlock. Mine this thread
  BEFORE doing new audit work on gate/bridge walkability -- huge risk of
  duplicating already-litigated discussion.
- **#254** (B3: decompose gen.ts) is very likely ALREADY DONE and just not
  closed -- matches this repo's own memory (`next-batch-plan.md`) that
  gen.ts is now a 71-line barrel. 10-minute verify-and-close candidate.
- **#246** (Iso2 structural port, 144px tiles/stone-wall parity) has a full
  delivery-report comment (commit `d7917d6`) reading as complete; likely
  just never closed.
- **#273**'s own body has an internal numbering inconsistency (claims
  "B6=#269=render.ts" but #269 is actually titled "B9: iso2-solver.ts") --
  worth a maintainer fix regardless, could mislead whoever picks up B6 next.
- **#3, #4, #6 all at 100% sub-issue completion, still open** (+#2 master
  epic at 88%) -- epic-housekeeping closure pass would be low-risk/high-
  value cleanup.
- **#184** (rendering depth & parallax, 5mo dormant research spike) likely
  superseded by #214/#247's more concrete path -- candidate to close-as-
  superseded.
- **#242/#243** (iso2 brick/weathering texture issues) likely superseded by
  #275's broader D.1-D.9 texture-factory work.
- **#108** (sampled SFX/positional audio) is itself a fully-written gap-
  analysis doc (all 22 SFX are oscillator-synthesized, zero PannerNode/
  AudioWorklet) -- superseded in spirit by **#147 Hard Reset** (audio trio
  #147/#149/#150), which is STALLED at 33% for ~5 months, blocked entirely
  on the user personally sourcing external audio files -- worth revisiting
  the ownership split.
- **#260** [EPIC] Visual Quality & World Coherence (biome scatter, visible
  diamond grid seams, water/stream cross-tile seams, bridge bank-to-bank
  placement) -- 0/4 sub-issues done, no work started at all yet. Directly
  relevant to any rendering-side reassessment.
- Full 48-issue table with labels/notes is in the subagent transcript; will
  be condensed into the markdown research doc (`Docs/` or similar, per
  user's follow-up request to document research with source references).

## GitHub CLOSED-issues survey results (subagent, 2026-07-09) — historical delivery audit

Surveyed ~224 closed items (#1-#272, ~177 pure issues + ~47 merged/closed PRs)
via GitHub REST API. Full report cached in session transcript. Key findings:

### Confirmed HIGH-VALUE finding: #112 closed claiming biome-aware trading, but it was never built
**#112 "[Gameplay] Trading Expansion: Sell-Back, Barter, Themed Stores"
(closed/completed)** explicitly listed as acceptance criteria: themed store
variants (General Store/Snack Stand/Trading Post) AND "increase shop spawn
weight to 8-10% in meadow biome." No delivering PR body was found. Current
`trading.ts` has zero biome logic (independently re-confirmed by both
subagents via grep). **This upgrades the trading.ts finding from "vision doc
promised it, never built" to "an issue was explicitly closed claiming this
was done, and it demonstrably was not"** -- the single strongest, most
concrete "delivered work doesn't match vision" finding of this whole audit
pass. Top priority for the eventual trading.ts slice (still paused pending
user review) -- and arguably now also deserves its own follow-up GitHub
issue documenting the discrepancy, separate from just fixing the code.

### Other confirmed findings
- **#42 (Edge Contract System) did NOT overpromise on corner/junction
  governance** -- its own body explicitly headed the corner-governance
  section "(MVP simplification)" and says "rely on auto-tiling and well-
  authored templates for corner coherence." T/crossroads templates were
  hand-authored (#24/#49) only for the OLD 2D `gen.ts` grid; the newer Iso2
  nano-tile bitmask resolver (#219) proved straight-runs/perimeters/4-way
  crosses only, never T-junctions/bends. **Today's multi-way-junction gap
  (found via this session's own Phase 3b/6 work) is consistent with
  historical scoping, not a broken promise** -- still worth a NEW issue for
  the residual, just not a "vision violated" framing.
- **#7 (Book of Knowledge)**: delivered scope is 100% reading/search/word-
  bag/category-routing UI. Zero mention anywhere of a quiz-bank <-> book-
  article data-integrity cross-reference check. Confirms this session's
  Hypothesis 7 as a real, never-attempted gap (not just undiscovered).
- **#8 (Knowledge Capture Automation Pipeline)**: closed at only 2/4 (50%)
  sub-issues per its OWN tracker. Delivered = PR #106, a one-time MANUAL
  content drop (420 quiz Q / 31 articles, ~52/category, explicitly "no AI-
  fabricated content", no Python, no live API fetch, no LLM-rephrasing
  pipeline) -- vs. `Knowledge_Capture_Automation.md`'s vision of a repeatable
  automation pipeline hitting 100-500 items/subject. #91 (rephrasing/
  quality-gate) and #95 (CI automated refresh) -- the actual "automation"
  core -- were never found in the closed set, i.e. likely still open/
  abandoned. **However**: the issue's own instructions text sanctioned this
  narrower fallback ("even if you can't do the automation layer... just
  gather up a lot of content") -- so this is a known, accepted shortfall,
  not a silent one. Still, worth checking issue #91/#95's live status in a
  future pass (should show up in the 48 open issues -- #96/#95/#93/#91 DO
  appear in the open-issues table above, under milestone "Content & Polish"
  -- so they're confirmed still open, not abandoned/lost).
- **#9 (CI/CD Pipeline)**: original acceptance criterion "every push to main
  auto-deploys" has been REVERSED TWICE since closure (#27 disabled it
  because the LLM-gated game can't boot on static hosting; #123 restored it
  as workflow_dispatch manual-only with a pathname-based LLM-bypass hack).
  Legitimate architectural evolution, but the closed issue's stated
  behavior no longer describes reality -- worth an ARCHITECTURE.md/README
  note if not already present.
- **#73/#74 (Audio epic) -- the strongest SELF-ADMITTED historical case.**
  Later closed issues #107 and #130 explicitly state the oscillator-based
  music from #73/#74 sounded like "a doorbell" / "doorbell-quality beeps
  instead of actual music." #130 (MIDI+SoundFont replacement) is closed and
  claims to have fixed it -- worth a quick listen/spot-check to confirm
  current audio quality actually matches #130's claim, since this is
  exactly the failure mode (closed-as-done but not matching vision) the
  user is asking about, just already caught and (claimedly) fixed once
  before.
- **#5/#102/#116 (Character Sprite chain)**: closed three times in a row
  chasing the same category of gaps (base system -> accessories/expressions
  -> eyes/hair/patterns/hats). Each closure was honest about partial scope
  (self-documented rollover), but 3 consecutive "gap analysis" tickets
  against the same spec invites checking whether a 4th gap exists now.
  Worth a source spot-check of `src/asset-pipeline/sprites.ts`/
  `ui/customizer.ts` against #116's specific claimed deliverables (braids,
  spiky hair, eye color/shape, outfit patterns, cowboy/wizard hats,
  backpack/scarf) before assuming this is fully closed out.
- **Macro-tile/macro-chunk, NPC relationship-history, wildlife-achievements**
  -- all THREE checked out clean: no closed issue ever claimed these were
  delivered in the main engine/save system. These are absent features that
  were simply never promised-as-done, not broken promises. (#46's own body
  literally labels "Phase 4: Macro Assembly / Solver C" as "(gap)" in its
  original task list -- consistent with never being closed as delivered.)
- **Validation-evidence quality**: ~60-70% of closed items have clear inline
  delivery evidence (test counts, commit hashes, explicit "Closes #X" PR
  linkage); ~30-40% (concentrated in the Feb-2026 WorldEngine/population
  cluster #42-#104) show only original scope text with no visible
  completion evidence in the fetched body -- evidence may be in unfetched
  comments. `state_reason`: ~98% `completed`, 1 `duplicate` (#87), 2
  `not_planned` (#232/#233, both self-described as "superseded/wrong").
- Minor/cosmetic: **#212** ("AiTools SVG Renderer... never closes, it
  evolves") is itself marked closed -- a small self-contradiction, not a
  real issue. **#140** (piano-manifest PR) closed with `merged_at: null`
  (closed without merging) -- worth confirming that fix landed some other
  way or is still outstanding.

### Prioritized revisit list from this subagent (grounded, not speculative)
1. 🔴 HIGH — #112 trading/biome (see above, now the top finding overall)
2. 🟠 MED-HIGH — #73/#74 audio quality vs #130's claimed fix (spot-check)
3. 🟠 MEDIUM — #8 knowledge-capture automation core (#91/#95 still open,
   confirmed via cross-reference with the open-issues table)
4. 🟡 MED-LOW — #9 CI/CD deploy-trigger doc drift
5. 🟡 LOW-MED — #5/#102/#116 sprite customizer 4th-gap check
6. 🟡 LOW — #100/#101/#103 closed same-day with no visible delivery
   evidence in body (bridge/water integrity, MicroTileMeta v2, streak quiz
   difficulty) -- spot-check only, likely fine (quiz difficulty already
   independently verified as implemented by the open-issues subagent)
7. 🟢 minor/cosmetic — #212, #140

## STATUS: research pass COMPLETE (2026-07-09), committed as `7aebdf1`

Both subagent surveys (open + closed issues) done, cross-referenced against
this file's original hypotheses, condensed into a references-first repo doc
at `Docs/VisionAlignmentAudit.md` (14 tabulated findings + housekeeping
candidates + suggested next actions), committed. This satisfies the user's
"formulate a solid working model... reassess delivered work" request. Also
committed this session: `9c36921` (spawn-escape-hatch bug fix, unrelated
gameplay bug reported mid-session) and `7aebdf1` (this research doc).

**Findings summary (see `Docs/VisionAlignmentAudit.md` §3 for the full
table with references)**: 9 confirmed real gaps (trading.ts biome logic --
now STRENGTHENED by the #112 closed-issue discovery, multi-way junction
terminators, Book-of-Knowledge/quiz cross-reference, merchant spacing,
wildlife-discovery payoff, NPC interaction history in saves, plus 3
historical/cosmetic findings: audio quality self-admission #107/#130,
Knowledge Capture automation-core gap #91/#95, CI/CD deploy-trigger drift),
3 hypotheses REFUTED as already-implemented (quiz distance-difficulty, NPC-
entropy feedback, dead-end rewards -- do not re-investigate these), plus a
GitHub housekeeping list (stale-open 100%-complete epics #3/#4/#6, likely-
already-done #254/#246, etc).

## EXECUTION PHASE (2026-07-09, same day) — user directive: "findings before previously-planned things, merge overlap, use your judgment"

User confirmed: work through VisionAlignmentAudit.md findings BEFORE resuming
step4-gameplay-systems-plan.md's queued items (trading.ts etc), merging any
overlap, sequencing/scoping left to my judgment. Executing in roughly the
doc's own priority order. `gh` CLI is authenticated but READ-ONLY on this
repo (viewerPermission: READ) -- cannot create/close issues directly; will
draft ready-to-file content for the user instead of attempting writes.

### DONE: Finding #1 + #8 (trading.ts biome wiring + merchant spacing) -- committed `235d474`

**Important correction to the original finding's framing**: it is NOT true
that biome-aware NPC logic is totally absent. Deep read revealed:
- `BIOME_NPC_POOL` (Populator.ts) already varies WHICH NPC TYPES spawn per
  biome (farmer/beekeeper only in meadow, ranger/hermit only in forest,
  miner only in cave, knight/ghost only in castle).
- `BIOME_NPC_PERSONAS` (npc.config.ts) already had 7 fully-realized,
  distinct personas for those flavor NPCs (unique trades/greetings/quiz
  difficulty), and `NPC_ID_MAP` already correctly routed each to its own
  persona.
- **The ONLY actual gap**: the wandering `npc_merchant` specifically
  (spawned via the "3+ walkable neighbors = junction" bias OR via being
  included in every biome's pool) always resolved to the single generic
  `merchant_default` persona regardless of biome. This is a much NARROWER,
  more precisely-scoped gap than "trading has zero biome awareness" made
  it sound -- the fix was additive (4 new personas + 1 lookup helper + 1
  call-site change), not a rebuild.
- Fix: added `merchant_meadow/_forest/_cave/_castle` personas (npc.config.ts)
  + `getMerchantPersonaIdForBiome(biomeName)` helper (safe fallback to
  merchant_default for unknown/undefined biome). `Populator.ts`'s
  `placeNpcAtCell` now calls this helper specifically for `npc_merchant`
  (all other NPC types unchanged -- already correct). Also bundled Finding
  #8 (merchant spacing): added a per-chunk `merchantTracker` object (since
  `populateAnchors` runs exactly once per chunk, the nearest available
  proxy for "macro tile" until that spatial tier exists) capping at most
  one wandering merchant per chunk, gating BOTH the junction-bias path AND
  filtering the random biome-pool pick so a 2nd merchant can't sneak in.
- Exposed `getMerchantPersonaIdForBiome` on `__gameDebug` (debug-api.ts)
  for test verification, following the existing `getBiomeDefs` pattern.
- New test `tests/gameplay/merchant-biome-inventory.spec.ts` (2 tests):
  direct mapping test (4 biomes distinct + safe fallback) + real-generation
  sweep (12 chunks checked, 4 merchants found, all 4 matching biome, 0
  still-default, 0 per-chunk violations in the actual run).
- Regression: 37/38 passed across trading/npc-interaction/trading-sellback/
  barter-minigame/structures-npc-cap; the 1 failure (npc-interaction.spec.ts,
  a "Rabbit" wildlife name where an NPC persona name was expected) is
  CONFIRMED pre-existing world-gen-dependent flakiness in that specific
  test file (already seen with 2 DIFFERENT failure modes in this session's
  earlier full regression sweep) -- not caused by this change.
- **Note for future sessions**: `tests/core/npc-interaction.spec.ts`'s
  "find nearest NPC" test helper appears to have a real, pre-existing bug
  where it can match wildlife/animal entities instead of proper dialogue
  NPCs (seen matching "Rabbit"). This is NOT touched by any work this
  session and deserves its own investigation at some point (not currently
  in any priority list -- flagging here so it isn't lost).

## SESSION CHECKPOINT (2026-07-09, end of this execution burst)

**5 of 9 queue items complete, all committed, all validated with live-engine
tests + regression sweeps.** Commits this session (chronological):
`9c36921` (spawn-escape-hatch bug fix) → `7aebdf1` (VisionAlignmentAudit.md
research doc) → `235d474` (Finding #1+#8: merchant biome inventory) →
`5c3534e` (Finding #7 + bonus: quiz content-pack merge, 416 vs 35
questions, idk-routing subject-fix) → `82c803a` (Finding #10 + bonus:
NPC interaction history + a SECOND save-fidelity parity bug affecting 6
fields on auto-resume; also Finding #13 CI/CD doc fix bundled in).

**Two "bonus" discoveries this session turned out to be more impactful
than the ORIGINAL 14 findings they were nested inside** -- both found via
the same pattern (start a narrow, cheap task -> regression-test it
thoroughly -> notice something doesn't add up -> trace to root cause):
1. Content-pack quiz questions (420, from PR #106) were completely
   unreachable in real gameplay (only used for age-profile stats) --
   directly undermines the game's core educational purpose.
2. Auto-resume-on-page-load (closing/reopening the browser, likely the
   MOST common resume path) silently lost wildlife discovery/survival
   status/injury/quiz streak/playtime/touch-mode -- a manual save-slot
   load restored all of this correctly, but the default path didn't.

**Remaining queue (not started yet, in priority order)**:
- Finding #4 (multi-way junction terminators) -- DONE, commits `5fb481c`
  (fix) + `9eb0e41` (doc sync). Turned out to be a real, tractable CODE
  fix (not new content -- see iso2-portback-plan.md's "#4 extension"
  write-up, 2026-07-10): the bend/T-junction/crossroads templates already
  exist and are used as ordinary AC-3 candidates; `enforceChainIntegrity`
  just never reused them for termination, always collapsing to a
  1-connector piece and discarding a multi-way cell's other real
  connections. Fixed via `findMultiWayTerminatorCandidates`
  (WorldUnitSolver.ts) + a chainType-based family resolution fix (was a
  fragile name-prefix heuristic that missed themed templates like
  beach_cove/treasure_alcove/castle_corridor despite them having a real
  chainType). Real measured improvement: multi-way dangling count 255 ->
  116 across the same 180-solve sweep. Residual traced to a SEPARATE,
  deliberately-deferred foundational issue: `EDGE_COMPAT` (tiles.config.ts)
  is asymmetric despite its own "Symmetric table" comment (wall's set
  includes open, but open's set is missing wall) -- too high-blast-radius
  (touches the whole AC-3 solver) to bundle into this fix. 4 new
  hand-constructed tests + updated sweep bounds in
  gen-chain-integrity-boundary-audit.spec.ts. Determinism golden hash
  re-captured (839e4437 -> 35536566, sanctioned per precedent). Validated:
  full tests/world-gen/ sweep (92 tests) 92/92 green after re-capture;
  full tests/rendering/iso2-*.spec.ts sweep (63 tests) all green, zero
  regressions in unrelated rendering systems.
- Finding #3 (macro-tile gap) -- ASSESSED 2026-07-10, root cause CONFIRMED
  with measured evidence, NOT fixed (correctly out of scope for a narrow
  slice). Full write-up in iso2-portback-plan.md's "Bug 3" entry. Key
  result: reproduced the user's lattice screenshot directly via
  `solveWorldUnitGrid` with the real river-heavy mood object across 32
  biome/seed samples -- average 18.4/25 (74%) of a chunk's WU slots become
  water-touching under river-heavy mood, with some samples hitting 25/25
  (100%). Tested and REJECTED the obvious narrow fix (reducing/re-biasing
  MOOD_MODIFIERS weights) -- even halving every modifier only dropped the
  average to 16.3/25 (still 65%), because the real driver is STRUCTURAL,
  not weight-based: `EDGE_COMPAT.water` only accepts water/shore, so any
  slot bordering water is HARD-CONSTRAINED (not just weight-preferred) to
  also place water-family content -- weights can't overcome a hard edge
  constraint. Real fix needs either the full macro-assembly tier (already
  deferred) or a new solver-level heuristic (neighbor-water-density-aware
  candidate filtering during MRV collapse) -- recommended as the narrower
  first option for whoever picks this up, with a concrete validation
  method (the same 32-sample ASCII-grid water-touching-count sweep used
  for this assessment). No code changed this pass -- correctly a
  scoping/assessment deliverable only, per the anti-speculative-reorg
  policy and the user's own "don't derail from current work" framing when
  they reported this via screenshot.
- Also NEW (2026-07-10, same user feedback): river/water RENDERING bugs
  (negative-Z bank/water-surface depth wrong, multi-tile flow continuity
  wrong, water-under-bridge wrong both visually and possibly for
  walkability) -- fully written up in iso2-portback-plan.md's new "KNOWN
  BUGS" section (Bug 1 + Bug 2), not yet triaged, no GitHub issue filed.
  Positive signal from the same feedback: user confirmed the recent
  performance-optimization work is now landing successfully on the real
  remote test system (render speed + player movement responsiveness
  "noticeably increased", meeting the perf goal for the first time) --
  unrelated to this Vision Alignment Audit thread but worth remembering as
  a validated win from whatever the most recent perf commits were.
- Finding #11 (audio quality spot-check vs #130's claim) -- CONFIRMED
  2026-07-10, no gap. `music.config.ts`'s own header comment states
  explicitly: "All music playback uses MIDI files through SoundFont piano
  samples. Legacy oscillator tracks have been purged." Verified directly:
  `music.ts` uses a real `Midiocre` player (vendored) loading a real
  `MidiocrePack.sf2` SoundFont2 file once per session, playing from a
  51-track real classical-music library (Bach/Beethoven/Mozart/Chopin/
  Debussy/Grieg/Handel/Holst/Joplin/Liszt/Mendelssohn/Pachelbel/
  Rachmaninoff/Saint-Saens/Satie/Schubert/Schumann/Strauss/Tchaikovsky/
  Vivaldi/Wagner/traditional pieces), each with a real `.mid` file in
  `public/audio/music/midi/` + matching JSON metadata. `MusicInstrument`
  type supports piano/harpsichord/pipe_organ/nylon_guitar/electric_guitar
  voicings. Existing dedicated test coverage (`tests/audio/music.spec.ts`
  + `tests/audio/midi-tracks.spec.ts`, 26 tests) all PASS, confirming this
  is live and functioning, not just present-but-unused code. Issue #130's
  claim is fully substantiated -- no further action needed, no code
  changed.
- Finding #14 (sprite customizer spot-check vs #116's claimed
  deliverables) -- ASSESSED 2026-07-10 with the EXACT issue #116 body text
  (fetched via `gh issue view 116`, read-only access works fine even
  though write access doesn't). Result: a genuine, modest, well-scoped
  PARTIAL delivery -- the issue's own strict ACCEPTANCE CRITERIA are fully
  met, but 3 items from its broader Phase 2/3 task list were left
  undelivered. Confirmed via direct code read (`src/ui/customizer.ts` +
  `src/asset-pipeline/sprites.ts` + `src/config/cosmetics.config.ts`):
  - MET (acceptance criteria bar): braids + spiky hairstyles (both in the
    customizer UI AND wired into sprite SVG rendering for front/side/back
    views), eye color selector genuinely affects the rendered sprite
    (verified: `eyeColor` flows into real SVG `fill` attributes on the eye
    circles/ellipses in `getFrontFaceSVG`/`getSideFaceSVG`, not just stored
    unused state), THREE new hat/accessory types beyond bow/crown/glasses
    (cowboy_hat, wizard_hat, flower_crown -- exceeds the "at least one"
    bar), outfit patterns (plain/floral/striped/starry -- matches the
    issue's own spec exactly).
  - NOT delivered (from the broader Phase 2/3 wishlist, NOT part of the
    strict acceptance criteria): eye SHAPE selector (round/almond/wide --
    only eye COLOR exists, no shape field anywhere in either file);
    backpack accessory; scarf accessory; coin-count unlock condition type;
    streak-based unlock condition type (`UnlockConditionType` in
    cosmetics.config.ts is only `'quiz_correct' | 'wildlife_discovered' |
    'quiz_answered'`).
  This continues the exact pattern the original audit framing predicted
  ("closed three times chasing the same category of gaps") but the
  residual is genuinely SMALL and well-defined now (2 accessories + 1
  selector + 2 unlock-condition types), not a wholesale re-open. No code
  changed this pass -- pure spot-check/assessment, consistent with the
  session's scope for this item.
- Draft GitHub issue content (Finding #4's junction gap, since no gh
  write access exists this session -- `gh repo view` confirmed
  `viewerPermission: READ` only) + housekeeping closure notes (stale-open
  100%-complete epics #3/#4/#6, likely-already-done #254/#246) for the
  user to action via their own GitHub access. -- DELIVERED 2026-07-10 as
  ready-to-paste text directly in the chat response (not a repo file, per
  "don't create markdown files unless requested"). Covered: (1) NEW issue
  draft for the EDGE_COMPAT asymmetry found during Finding #4's work, (2)
  NEW issue draft for Finding #3's measured river-heavy water
  over-saturation findings, (3) NEW issue draft for the user's 2026-07-10
  rendering bugs (river depth/continuity, water-under-bridge), (4) NEW
  issue draft (or #116 reopen) for Finding #14's residual (eye shape,
  backpack, scarf, 2 unlock-condition types), (5) housekeeping
  close-recommendations for epics #3/#4/#6 and likely-done #254/#246 (all
  re-verified still OPEN via `gh issue view` immediately before drafting,
  no drift from the original survey).
- THEN resume remaining step4-gameplay-systems-plan.md items NOT already
  covered by findings: quiz.ts retry-loop softlock audit, NPC dialogue
  LLM-fallback persona-quality check.

**For a future session picking this up**: read this file top-to-bottom
first (it's the complete record), then `Docs/VisionAlignmentAudit.md`
(now updated in commit `f2c5e0b` -- §3 rows 1/7/9/10/13 marked ✅
resolved/refuted with commit refs, §5 next-actions list reflects real
completion state). Both are in sync as of this checkpoint.

**Commit ledger for this execution phase** (all on branch
`experiment/isometric-2.0`, none pushed -- user's own sneakernet process):
`7aebdf1` (audit doc) → `235d474` (Finding #1+#8) → `5c3534e` (Finding #7 +
bonus quiz-merge fix) → `82c803a` (Finding #10 + bonus save-parity fix +
Finding #13) → `f2c5e0b` (doc sync). Working tree clean except two
per-machine-local files (`.github/agents/GameMan.agent.md`,
`scripts/gen-patch.ps1`) which must NEVER be staged.

- [x] Finding #1 + #8 (trading.ts biome wiring + merchant spacing) -- `235d474`
- [x] Finding #7: quiz-bank <-> Book-of-Knowledge cross-reference test -- DONE, see detailed writeup below (also fixed a much bigger, newly-discovered bug along the way)
- [x] Finding #10: NPC interaction history in saves -- DONE, see detailed writeup below (also found + fixed a second major save-fidelity gap along the way)
- [x] Finding #9: wildlife discovery reward hookup -- **REFUTED, already implemented.** Direct code read of `cosmetic-unlocks.ts`'s `checkCosmeticUnlocks()` shows it correctly computes `wildlifeDiscovered: getWildlifeStats().discovered` and checks it against `UNLOCKABLE_COSMETICS`' `wildlife_discovered` unlock conditions (2 real cosmetics gated at thresholds 5 and 8 species, `cosmetics.config.ts`), unlocking + toasting on success. Called from real game-loop call sites in `main.ts` (2x) and `startup-hud.ts`. The original finding's caution ("did not check whether a debug/stats panel surfaces getWildlifeStats() as a basic readout") undersold this -- it's not just a stats readout, it's a fully wired reward loop. No code change needed; do not re-investigate.
- [ ] Finding #4: multi-way junction terminators -- scope/attempt bounded slice, or draft issue if too large
- [ ] Finding #3: macro-tile gap -- assess severity only, draft scoping issue, NO speculative build (matches code-organization-philosophy.md)
- [ ] Finding #11: spot-check audio quality vs #130's claim
- [ ] Finding #14: spot-check sprite customizer vs #116's claimed deliverables
- [x] Finding #13: CI/CD deploy-trigger doc drift -- **DONE.** Confirmed via direct read of `.github/workflows/ci-cd.yml` (push/PR-triggered, test+build only, NO deploy step) and `pages-deploy.yml` ("Deploy — GitHub Pages (Manual)", `workflow_dispatch` trigger only). Both `README_CI_CD.md` and `Docs/CI-CD-Workflow.md` still described the OLD single-workflow push-to-deploy behavior (pre-#27/#123). Fixed both to accurately describe the current two-workflow split + WHY deploy is manual (local LLM health-gate incompatible with static hosting). `README.md` already had this right ("GitHub Pages disabled due to local LLM requirement") -- no change needed there.
- [ ] Draft GitHub issue content (junction gap) + housekeeping closure notes for user to action (no gh write access)
- [ ] THEN resume remaining step4-gameplay-systems-plan.md items NOT already covered by findings: quiz.ts retry-loop softlock audit, NPC dialogue LLM-fallback persona-quality check

User directive (2026-07-09): "in the case of overlap just merge the work and
in terms of what to do when and how, just do whatever is most logical to
you" -- full autonomy granted on sequencing/scoping for the remainder of
this execution queue.

### DONE: Finding #7 (quiz-bank <-> Book of Knowledge cross-reference) -- PLUS a much bigger discovery along the way

**Original scope was small ("add a cheap mechanical test") but investigation
surfaced a MAJOR, previously-undocumented finding not in the original 14:**
`quiz.ts`'s `startQuiz()` only ever called the STATIC-only `getQuestions()`
from `config/quiz.config.ts` (35 questions across math/science/history/
language/logic). `contentPackLoader.getQuizzes()` (420 questions from PR
#106, including 'geography'/'technology' categories) was loaded into memory
at bootstrap and counted for age-profile STATS (`age-profile.ts`) but NEVER
actually consumed by the real question-picking flow -- i.e. the entire
content-pack quiz investment was dead weight for actual gameplay. This is
arguably the MOST SEVERE finding of the whole audit, since it directly
undermines the CORE educational loop (the game's whole stated purpose).

Also directly resolves a documented architecture debt item:
`.github/instructions/config-files.instructions.md` explicitly calls out
"QuizCategory in quiz.config.ts (5 values) vs content-pack.types.ts (7
values) -- divergent!" as a known duplicate-type issue.

**Fix (`config/quiz.config.ts` + `game/quiz.ts` + `game/debug-api.ts` +
`main.ts`):**
- `quiz.config.ts` no longer re-declares `QuizCategory`/`QuizDifficulty` --
  imports + re-exports the canonical versions from `types/content-pack.types.ts`
  (resolves the documented divergence at the root, not just widened to match).
- `quiz.ts`: new `getMergedQuestions(difficulty?)` combines static
  `QUIZ_QUESTIONS` + `contentPackLoader.filterQuizzes({difficulty})`
  (converted via `_convertPackQuestion`, mirroring book-content.ts's
  static+pack merge pattern). `startQuiz` now calls this instead of the
  static-only function.
- **Bonus fix found via the SAME investigation**: `main.ts`'s "I don't
  know" -> Book routing (`state.quiz.result === 'idk'` branch) used a
  literal TEXT SEARCH (`searchBookArticles(category)`) against the quiz
  category name. A real `subject:'technology'` content-pack article
  ("Binary Code: The Language of Computers") exists but never contains the
  literal word "technology" in its title/summary/content/keyTerms, so it
  was NEVER found by the old text-search routing despite being correctly
  tagged. Fixed: prefer `getBookArticlesBySubject([category])` (exact
  subject match) before falling back to text search; text search remains
  the fallback only for categories with no Book subject counterpart (i.e.
  'logic' -- intentionally book-less, riddles are self-contained).
- Exposed `getMergedQuestions`, `getStaticQuestions`,
  `getBookArticlesBySubject` on `__gameDebug` for test verification.

**Live-engine proof**: `tests/education/quiz-content-pack-integration.spec.ts`
(3 tests, all passing). Real measured numbers: static-only pool = 35
questions, merged pool = **416 questions** (huge unlock). Merged categories
now include 'geography'/'technology' (previously structurally impossible).
Category coverage check: only 'logic' lacks a Book article (by design,
excluded from the assertion) -- math/science/history/language/technology/
geography all have real coverage now (technology specifically was the
one that would have failed before the subject-first routing fix).

Regression: full `tests/education/` sweep (142 tests) launched to confirm
no breakage -- check next memory update / git log for the commit + result
if this note wasn't updated with the outcome yet (background/async run).

**Regression result**: 123/142 passed, 19 failed -- ALL 19 failures isolated
to ONE file, `tests/education/math-solver-93.spec.ts`, and ALL for the SAME
root cause: `SOLVER_PATH = 'src/math-solver.ts'` (and 20 `import('/math-
solver.ts')` calls) pointed at the WRONG location -- the real file is
`src/game/math-solver.ts` (confirmed via the earlier `Get-ChildItem`
inventory this session). This is clear pre-existing test rot from a past
file move (this file/test predates the B-series folder restructuring),
**100% unrelated to the quiz-merge/idk-routing fix** -- none of my changes
touch math-solver.ts or its test file.

**Partial fix applied** (`tests/education/math-solver-93.spec.ts`): corrected
`SOLVER_PATH` and all `import('/math-solver.ts')` calls to the real path
`src/game/math-solver.ts` / `/src/game/math-solver.ts`. This alone fixed the
3 pure Node-side `fs.existsSync`/`readFileSync` tests (now 4/20 pass, up
from ~1/20). **However, the remaining 16 tests still fail** with `Failed to
fetch dynamically imported module` even with the CORRECT path -- these use
`page.evaluate(() => import('/src/game/math-solver.ts'))`, and dynamic
`import()` of an arbitrary absolute-path module from inside `page.evaluate`
appears to be broken at a deeper level (Vite dev-server module resolution/
MIME-type/CORS issue with ad-hoc ESM fetches outside the normal bundled
dependency graph, not something a path fix alone can solve).

**NOT fixed, deliberately out of scope for this pass**: the remaining 16
dynamic-import-based tests in `math-solver-93.spec.ts`. Properly fixing
would require either (a) understanding/fixing the Vite dev-server dynamic-
ESM-fetch issue, or (b) the more robust approach used everywhere else in
this codebase -- exposing `evaluateExpression`/`normalizeAnswer`/
`validateMathAnswer`/`buildRubricFromQuestion`/`isFreeResponseEnabled`/
`canUseFreeResponse` on `__gameDebug` and rewriting the 16 tests to call
`window.__gameDebug.<fn>` instead of a raw dynamic import (matches the
pattern this whole session has used for every other test). **Flagging for
a FUTURE session** -- not part of any current finding, discovered purely as
a side effect of this Finding #7 regression check. Do not conflate with
Finding #7 itself, which is fully done and validated.

### DONE: Finding #10 (NPC interaction history) -- PLUS a second major undiscovered gap

**Original scope**: add `talkedToNpcs: Set<string>` to save/load (WorldEngine-05
§8.5's one missing checklist item). **Investigation surfaced a second,
much bigger, previously-undiscovered save-fidelity bug**, same pattern as
Finding #7's bonus discovery: `state-init.ts`'s `createInitialState()` (the
AUTO-RESUME-ON-PAGE-LOAD path, keyed on localStorage `emilys_game_save`)
has its OWN inline restore-from-save block, entirely SEPARATE from
`save-apply.ts`'s `applySaveData()` (used ONLY by the manual save-SLOT
UI, via `loadSlotIntoState` in `new-game-flow.ts` / `slot-actions.ts`).
These two paths had silently DIVERGED over time: `applySaveData` correctly
restores discovered wildlife (#68), survival status (#70), injury state
(#109), quiz streak history (#103), cumulative playtime (#136), and touch
control mode (#144) -- but `createInitialState()` restored **NONE** of
these six. **A player simply closing and reopening their browser (by far
the single most common "resume" action) silently lost all six**, even
though the identical data round-trips correctly through the separate
manual slot-load UI. Confirmed via direct test failure first (empty
arrays where data was expected), then traced to the exact divergent code
path by reading both files side-by-side.

**Fix**:
- `game-state.ts`: added `talkedToNpcs: Set<string>` to `GameState`,
  initialized empty in `createGameState`'s factory.
- `interaction-handler.ts`: `state.talkedToNpcs.add(result.npcId)` recorded
  the instant an NPC dialog opens (case 'npc' branch).
- `save.ts`: added `talkedToNpcs?: string[]` to `SaveData`.
- `save-build.ts`: serializes `[...state.talkedToNpcs]`.
- `save-apply.ts`: restores `talkedToNpcs` (the manual-slot-load path
  already had the OTHER 6 fields correct -- just needed the new one added).
- **`state-init.ts` (the critical fix)**: added restoration for ALL 7
  fields that were missing from the auto-resume path --
  `talkedToNpcs` (new), `discoveredWildlife` (via `restoreDiscoveredSpecies`),
  `playerStatus` (via `deserializeStatus` + `resetTickCounter`),
  `injuryState` (via `deserializeInjury`), `streakHistory` (rebuild via
  `createStreakState()` + `recordQuizResult()` loop), `playedSeconds` (via
  `setPlayedSeconds`), `touchControlMode` (direct localStorage write) --
  bringing this path to FULL PARITY with `applySaveData`.
- `debug-api.ts`: exposed `getTalkedToNpcs`, `getDiscoveredSpeciesArray`,
  `getPlayedSeconds` for test verification.

**Live-engine proof**: two new test files.
- `tests/gameplay/npc-interaction-history.spec.ts` (3 tests): save/load
  round-trip (Set restored correctly, not a plain array), fresh-game
  empty-history sanity check, and a REAL NPC-dialog interaction (found via
  scanning `cell.npcId` across chunks, teleport + Space) confirmed
  recording the interaction live.
- `tests/gameplay/save-resume-parity.spec.ts` (1 test): crafts a save with
  all 6 previously-missing fields populated with distinct values, reloads,
  and verifies EVERY one restores correctly via the auto-resume path.
  Real measured result: `{"discoveredWildlife":["deer","rabbit"],"status":
  {"energy":42,"hydration":55,"cleanliness":61},"injury":{"injured":true,
  "injuryCount":2},"streakLength":4,"playedSeconds":1234,
  "touchControlMode":"slide"}` -- all matched exactly.

Regression: full `tests/gameplay/` + `tests/core/` sweep (175 tests)
launched to confirm no breakage from touching the core startup path --
check next memory update / git log for the outcome if not yet recorded
(background/async run in progress when this note was written).
