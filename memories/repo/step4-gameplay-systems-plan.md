# Step 4 — next gameplay-systems audit plan (DRAFT, awaiting user review)

Created 2026-07-09, same session as the Phase 3b/6 chain-integrity fix and
Phase 7 audit (see `iso2-portback-plan.md`). This is item 4 of the
user-approved 4-step roadmap in `next-batch-plan.md`: "run ANOTHER
planning/mapping pass... that identifies SPECIFIC NAMED GAMEPLAY SYSTEMS
worth the same Slice A-E audit treatment next... and present THAT plan for
approval before executing any of it."

**STATUS: proposal only. Do not start executing any of these audits until
the user has reviewed and confirmed the list/order below** — this is an
explicit requirement of the plan text the user approved, distinct from the
"no need to stop and involve me" instruction that covered steps 1-3's
execution (which was about not pausing mid-task for permission, not about
skipping this specific planning deliverable).

## Methodology (same as Slices A-E / Phase 3b-7)

For each candidate: deep-read the real source, form a hypothesis about a
plausible "looks built but doesn't fully connect" gap (grounded in the
game's own design docs' stated guarantees, not speculation), verify against
real config/generation/game-state data, and — only once approved — implement
a narrow safe fix with a live-engine test proof. Some audits will
legitimately come back clean (Phase 7 and Slices B/D already did) — that's
a valid, expected outcome, not a failure of the methodology.

## Candidates, in suggested priority order

1. **`src/game/trading.ts` (470 lines) — HIGH PRIORITY, concrete evidence
   already found this session (not speculation).**
   - `WorldEngine-05-PopulationAndProgression.md` §4.1 explicitly promises:
     "The merchant's inventory is determined by biome (biome-specific item
     weights) and difficulty level" and gives concrete examples ("forest
     merchant sells mushrooms and potions; castle merchant sells keys and
     shields").
   - `grep -i biome src/game/trading.ts` returns **zero matches**.
   - `Populator.ts`'s `NPC_ID_MAP` maps `npc_merchant` to the single
     persona id `'merchant_default'` **regardless of which biome placed
     the NPC** (meadow/forest/cave/castle merchants all get the same
     persona id) — the one piece of context that WOULD let a downstream
     trading lookup vary by biome doesn't appear to be threaded through.
   - This is the SAME class of bug as this session's own Slice E finding
     (wall/fence rendering "looked" biome-parameterized in the docs/config
     but wasn't actually wired) and the castle-landmark Step 2 work (a
     capability existing in isolation with no real call site) — a strong,
     well-precedented pattern match, not a guess.
   - First investigation steps: read `trading.ts`'s actual inventory
     selection function; check `config/npc.config.ts` for whether
     merchant personas/goods tables are keyed by biome at all; check
     whether `main.ts`/`mechanics.ts`'s interaction dispatch passes biome
     context into whatever `trading.ts` exposes. Confirm whether this is a
     real gap or whether biome-filtering happens at a layer not yet read
     (e.g. `npc.config.ts` itself could have per-biome goods tables that
     `trading.ts` reads by NPC id even though `trading.ts`'s own source
     has no literal "biome" string).
   - Existing test coverage: `tests/gameplay/barter-minigame.spec.ts`
     covers the barter quiz mechanic itself, not biome-inventory variation
     — a real coverage gap matching the source gap.

2. **`src/game/quiz.ts` + `src/game/math-solver.ts` + `src/game/quiz-specials.ts`
   (327 + 328 + 185 = 840 lines) — HIGH PRIORITY, direct continuation of
   the Phase 7 lock-key DAG audit just completed.**
   - The DAG audit (see `iso2-portback-plan.md`'s "Phase 7" section)
     confirmed quiz gates are deliberately excluded from the lock-key DAG
     because they're "always solvable via quiz retry" — that assumption is
     load-bearing for the whole no-softlock guarantee, but this session
     did NOT verify the retry loop itself. Worth confirming: can a wrong
     answer ever soft-lock a gate (rate limit, cooldown, streak penalty
     interacting badly with a gate's own state)? Does `math-solver.ts`'s
     expression grammar actually accept every answer FORMAT `quiz.ts`
     actually generates (a mismatch here would silently mark correct
     answers wrong — a severe, player-facing bug class)?
   - `WorldEngine-05` §9.1's difficulty table claims quiz difficulty scales
     with distance-from-spawn (Tutorial at 0, Expert at 10+) — worth
     confirming this is real, not just documented intent (`quiz.ts` line
     190 has a `TODO: DOC - distance-based difficulty thresholds` marker,
     suggesting this area was flagged for documentation, which sometimes
     correlates with "the logic exists but is under-verified").
   - Existing coverage: `tests/education/age-profile.spec.ts` (quiz
     filtering by age), `tests/sprites/cosmetics.spec.ts` (quiz-based
     unlock), `tests/gameplay/barter-minigame.spec.ts` — none appear to
     specifically test the retry-after-wrong-answer softlock question or
     the distance-based difficulty curve end-to-end.

3. **`src/game/save.ts` + `save-apply.ts` + `save-build.ts` (136+145+91 =
   372 lines) — HIGH PRIORITY on RISK (data loss is the worst bug class),
   MEDIUM on evidence (no concrete gap found yet, this is a "worth
   checking because the cost of a miss is severe" nomination, not a
   pattern-matched one like #1).**
   - `WorldEngine-05` §8.5 lists an explicit checklist of what must
     persist: collected items, resolved obstacles, NPC interaction
     history, discovered areas (fog of war), word bag contents.
   - This session alone added new mutable generation-time state (the
     castle landmark cells from Step 2) — worth confirming save/load
     round-trips it correctly (a landmark that vanishes/duplicates on
     reload would be a real, if minor, bug). More importantly: audit the
     FULL checklist above against the actual save file shape for
     completeness, the same way the chain-integrity audit checked "does
     the thing that looks wired actually work."
   - Existing coverage: `tests/sprites/accessories-expressions.spec.ts` and
     `cosmetics.spec.ts` cover cosmetic save/load round-trips; no obviously
     dedicated "full save/load fidelity" test file was found in this
     session's survey (worth confirming before assuming a gap).

4. **`src/game/wildlife.ts` + `wildlife-render.ts` (579+190 = 769 lines) —
   MEDIUM priority.**
   - ARCHITECTURE.md's file index describes this as "animal spawning/
     behavior/discovery" — the "discovery" word implies a Pokédex-style
     tracking/reward system. Worth confirming it's actually connected to
     anything (a reward, a Book of Knowledge entry, a UI indicator) rather
     than just a spawn/despawn simulation with no player-facing payoff.
   - Existing coverage: `tests/gameplay/cat-behaviors.spec.ts` and
     `tests/perf/frame-time-triage.spec.ts` already exercise wildlife
     fairly directly — this one may turn out closer to "already well
     covered" than #1-3.

5. **`src/game/knowledge.ts` (479 lines, Book of Knowledge) — MEDIUM
   priority, cross-reference integrity angle.**
   - `WorldEngine-05` Guarantee 5: "every quiz question in the library has
     a corresponding Book of Knowledge article, and every answer is
     factually correct." Worth a data-integrity pass cross-referencing the
     actual quiz question bank against actual Book of Knowledge article
     keys, similar in spirit to Slice D's cross-import parity test (a
     mechanical, automatable check rather than a deep behavioral one).
   - Existing coverage is comparatively strong already:
     `tests/education/book-of-knowledge.spec.ts`,
     `book-content-packs.spec.ts` — this may be more "add one precise
     cross-reference test" than "find a hidden bug."

6. **NPC dialogue/interaction (LLM-driven) — DONE 2026-07-10 (well beyond
   the original scope of this item; see `llm-npc-quiz-latency-2026-07-
   10.md` for the full writeup).**
   - Original quality question answered: `npcChatResponse`'s fallback now
     picks from the NPC's own persona-appropriate `fallbackResponses`
     pool instead of one generic line (commit `6074aff`).
   - Confirmed (Step 4 audit) that `npcChatResponse` has ZERO live
     callers — dead code since first commit, not a regression.
   - Follow-on port-fix session (8000→8005) uncovered a REAL, live-
     confirmed bug: the flat 15s `LLM_CONFIG.timeoutMs` was too short for
     the measured real hardware throughput (~5.2 TPS / ~0.19s per token)
     given `maxTokens.npcChat=100` (~19s needed) — fixed with per-call
     timeouts + a new TPS-based `isLikelyToFitBudget()` interactive-
     budget gate (`tps.ts`).
   - Live testing ALSO reproduced real server-side request queueing
     (an abandoned client request keeps running server-side and delays/
     starves subsequent calls) — led to a genuine architecture addition:
     `src/engine/llm/background-queue.ts` (single-slot mutex +
     fire-and-forget prefetch/cache) plus wiring `quiz.ts`'s question-pick
     to happen EARLY (at `pendingQuiz`-set time, in `interaction-
     handler.ts`/`main.ts`) so `rephraseQuizQuestion`'s answer can often
     already be cached by the time `startQuiz()` needs it — the ONE
     confirmed-live LLM integration point (unlike `npcChatResponse` and
     the also-newly-confirmed-dead `expandEntropy`/async `generateChunk`
     path).
   - **Not fully closed**: the prefetch mechanism's real-world latency-
     hiding behavior against a genuinely live server was mid-verification
     when the user's local BitNet server stack went down (likely from
     this session's own heavy test load) — needs one careful live
     re-check next session per that file's Part 8.

## What this plan deliberately does NOT include

- Anything already covered by this session's work (chain integrity, lock-
  key DAG, castle landmark wiring).
- A repeat of the render.ts/nano-tile.ts/god-file decomposition idea —
  explicitly rejected per `code-organization-philosophy.md`.
- Full-rewrite proposals for anything (per the same philosophy: audit for
  real functional gaps, fix narrowly, don't reorganize for its own sake).

## Recommended next action

Present this list to the user. If approved, suggested starting point is
**#1 (trading.ts biome-inventory wiring)** since it already has concrete
supporting evidence (not just a hypothesis) and directly continues this
session's proven pattern (biome-parameterization that looks designed-for
but isn't actually wired) — same shape of fix as the Slice E wall/fence
biome wiring and the Step 2 castle landmark wiring, both of which were
successful, well-scoped, low-risk slices this session already validated
the approach for.
