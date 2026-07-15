# Post-Slice-E "next batch" survey (2026-07-09)

Context: Slices A-E (Iso2 experiment port-back: bitmask topology, water/bridge/
wall/fence pixel audits + bug fixes, gate-connectivity fix, material parity,
biome material wiring) are all CLOSED — see `iso2-portback-plan.md`. User asked
to map out the next batch(es) of work. This file records the survey used to
form that recommendation, since two pre-existing planning docs turned out to
be meaningfully STALE against actual current line counts.

## IMPORTANT: several repo docs are stale — always re-measure, don't trust cached line counts

- `Docs/EngineDecompositionMap.md` (dated 2026-06-11) says `main.ts` is 3316
  lines and `gen.ts` is 2558 lines. **Both wildly out of date.**
- `.github/instructions/src-main.instructions.md` says main.ts is "~2,807
  lines (down from ~3,317)" and still has a big "Remaining Extraction
  Targets" table. **Also stale** — see real number below.
- `.github/instructions/src-gen.instructions.md` correctly says gen.ts is now
  a 71-line barrel (this one IS current/accurate).
- `.github/instructions/rendering.instructions.md` says `render.ts` is "704
  lines, hard ceiling 800 lines" — **also now stale**, see below; render.ts
  is CURRENTLY OVER its own documented ceiling.

**Verified current line counts (PowerShell `Get-ChildItem -Recurse -Filter
*.ts | Measure-Object -Line`, run 2026-07-09), top of list:**

| File | Lines | Notes |
|---|---:|---|
| `src/config/tiles.config.ts` | 2381 | Data-heavy config, likely lower priority (see below) |
| `src/rendering/nano-tile.ts` | 1109 | **Largest rendering-logic file. No documented ceiling.** |
| `src/asset-pipeline/asset-sprites.ts` | 1092 | |
| `src/main.ts` | **997** | Actual current count — NOT 2,807/3,317 as docs claim. Far more decomposed than documented. |
| `src/engine/world/WorldUnitSolver.ts` | 954 | |
| `src/asset-pipeline/sprites.ts` | 837 | |
| `src/rendering/render.ts` | **825** | **Over its own documented 800-line hard ceiling** (was 704 when rendering.instructions.md was written; my own Slice E edit added a few lines on top of other accumulated growth). |
| `src/rendering/terrain-cache.ts` | 777 | Heavily touched by Slices A-E (water/bridge dispatch lives here) |
| `src/rendering/tiles.ts` | 666 | |
| `src/game/audio/sfx.ts` | 621 | |
| `src/engine/world/ObstacleSolver.ts` | 601 | Read carefully this session (Slice E bare-assetKey investigation) |
| `src/game/wildlife.ts` | 579 | Matches src-main.instructions.md's god-file watch list |
| `src/config/assets.config.ts` | 542 | |
| `src/game/input.ts` | 522 | Matches watch list |
| `src/rendering/nano-tile-defs.ts` | 521 | Was 254 in the old EngineDecompositionMap; grew via Slice B.5 + Slice E additions this session |
| `src/game/knowledge.ts` | 479 | Matches watch list |
| `src/game/trading.ts` | 470 | Matches watch list |
| `src/engine/world/Populator.ts` | 453 | |
| `src/game/debug-api.ts` | 414 | Matches watch list (`__gameDebug` surface) |

## Recommended Batch 2 priority order — REVISED 2026-07-09 after user correction — **APPROVED 2026-07-09, this is the locked-in roadmap**

**The original version of this section (proposing render.ts/nano-tile.ts/
terrain-cache.ts/`src/game/*` decomposition) was explicitly rejected by the
user.** See `code-organization-philosophy.md` for the full directive: line
count is not a meaningful trigger, cohesion is. None of those files are
catchall god-files — they're each one cohesive subsystem that happens to be
long. Do not re-propose splitting them without a genuine functional reason.

**User approved this exact 4-step roadmap verbatim ("I love your plan as is
1, 2, 3") plus one addition (item 4, the user's own words: "make the next
plan, again applying the actual methodology that made Slices A-E valuable,
but against a list of specific named gameplay systems that you would then
map out for the next planning scope").** This is now the standing plan, not
just a proposal — start step 1 next session/turn unless told otherwise.

1. **Bug-fix: player-spawns-inside-wall** — **DONE 2026-07-09**, see the
   full writeup in `iso2-portback-plan.md`'s Slice E section. Root cause
   confirmed (unstamped gap cells in `stampStarterHomestead`'s hand-authored
   layout retain whatever Phase 3's WU-template stamping left there), fixed
   with `ensureSpawnClearance`, 3 live-engine tests including a 40-iteration
   real-pipeline sweep, full validation clean (60 rendering + 85 world-gen
   tests, determinism preserved). **COMMITTED as `9c8d571`** (recovered
   after a chat-app crash on 2026-07-09 left this + the two Slice E
   findings below sitting uncommitted in the working tree — see
   "Crash recovery" note below. Re-verified clean: `npx tsc --noEmit` +
   full `tests/rendering/iso2-.*\.spec\.ts` + gen-determinism, 61/61 green,
   before committing).

   **Crash recovery note (2026-07-09, same day):** the chat session doing
   this work crashed after finishing Slice E (see `iso2-portback-plan.md`'s
   "Slice E — CLOSED" section for the other two findings — wall/fence bare-
   assetKey collision precision + biome material wiring, also part of the
   same `9c8d571` commit) and after writing this plan doc + getting user
   approval of the 4-step roadmap (including item 4), but before committing
   the code or starting step 2. On resume, this memory doc + `iso2-portback-
   plan.md` fully reconstructed the situation (the user's post-crash message
   was just re-approving the same plan verbatim, unaware it was already
   captured) — session_store_sql / debug-logs had NO recoverable turn text
   (they only log lightweight span telemetry, not conversation content), so
   memory files are the ONLY durable record across a crash. Re-validated
   everything was intact (tsc clean, 61/61 tests green, diffs read
   end-to-end, no half-written edits) before committing as `9c8d571`. Take-
   away for future sessions: **commit real working code promptly once a
   slice's validation loop passes**, rather than leaving it uncommitted
   across a plan-approval round-trip — the memory docs saved this session,
   but committing sooner would have made recovery trivial instead of
   requiring a fresh verification pass.
2. **Then: return to the deferred Slice E question** (authored structures —
   starter_cottage/castle_keep/cathedral_chapel — into procedural
   generation) — explicitly unblocked once the spawn bug is fixed.
   **DONE 2026-07-09, committed as `15672ab`.** New `maybePlaceCastleLandmark`
   wires the previously-100%-dead `stampIso2Assembly`/`ruined-cathedral`
   assembly + the never-placed `castle_keep` single-cell asset into real
   generation for the castle biome only (rare, chunkDist>2 gated, ~12.5%
   chance). `cathedral_chapel` deliberately left unwired (thematically
   overlaps the ruin; picking a canonical design is a product decision, not
   mine to make unilaterally). Full writeup + a real discovery made along
   the way (castle biome is empirically ~0.6% of eligible chunks, not the
   documented "~25%" — Perlin noise clustering, not a bug I introduced) is
   in `iso2-portback-plan.md`'s new "Step 2" section. 3 live-engine tests,
   64/64 full suite green, `tsc --noEmit` clean.
3. **Then**: continue the Slice A-E audit methodology (deep read ->
   hypothesis -> verify against real config/generation data -> narrow safe
   fix -> live-engine test proof) applied to the generation pipeline phases
   ARCHITECTURE.md's own table (§6) marks as **partial or not-yet-done**,
   not fully-shipped:
   - Phase 3b "Boundary collection (cross-chunk)" — marked ⚠️ partial
     (`applyBorderConstraints`, "not fully enforced").
   - Phase 6 "Chain integrity (edge contracts)" — marked ❌ planned, not
     implemented at all.

   **Phase 3b/6 — DONE 2026-07-09** (found ARCHITECTURE.md's "❌ planned"
   framing partially STALE: `enforceChainIntegrity` already existed and was
   already wired into every `solveWorldUnitGrid` call — real bugs were
   found and fixed in it instead of building it from scratch). Full
   writeup in `iso2-portback-plan.md`'s new "Phase 3b/6" section. 3
   live-engine tests (`tests/world-gen/gen-chain-integrity-boundary-audit.spec.ts`),
   determinism golden hash deliberately re-captured (`061b4390` ->
   `839e4437`, documented as an intentional, verified change per the
   test's own recapture process — meadow biome's candidate pool includes
   decorative river/shore features, so the fix's cell-content changes
   reach even the meadow-only determinism test coordinates).
   - Phase 7 "Progression placement (lock-key DAG)" — marked ⚠️ partial
     ("balance/repair + getLockKeyDebugInfo").
   - Phases 9-10 "full edge contracts, macro assembly" — marked ❌ planned.
4. **Then (NEW, user-added 2026-07-09)**: once step 3 is closed out, run
   ANOTHER planning/mapping pass (mirroring exactly what this document
   itself is) that identifies SPECIFIC NAMED GAMEPLAY SYSTEMS worth the same
   Slice A-E audit treatment next -- e.g. wildlife.ts, trading.ts, quiz.ts +
   math-solver.ts, save.ts, NPC dialogue/interaction -- and present THAT
   plan for approval before executing any of it. Do not skip the
   present-for-approval step even though the overall 4-step shape is
   pre-approved -- step 4's CONTENT (which systems, what order) still needs
   its own review, same as this document did.

   **Step 3 CLOSED 2026-07-09** (Phase 3b/6 fixed + committed `05a1df7`;
   Phase 7 audited, clean bill of health, no code change — see
   `iso2-portback-plan.md`'s "Phase 7" and "Phase 9-10 scoping" sections
   for the full writeup). **Step 4's plan is drafted and awaiting user
   review** — see the new "Step 4 candidate systems" section at the
   bottom of `iso2-portback-plan.md`. Per this item's own text (which the
   user explicitly approved, including the present-for-approval clause),
   do NOT start executing any of those system audits until the user has
   actually seen and confirmed the list/order.

Rationale for steps 3-4 unchanged from the prior revision: this is about
COMPLETING/hardening the game's actual progression-gating correctness and
(step 4) auditing real gameplay systems for hidden solidity gaps -- the same
kind of work that already found 3 real bugs (Slice A.5 water, Slice C gates,
Slice E wall/fence collision), not speculative reorganization.

## Stashed feature ideas (not scheduled — revisit when picking future work)

User explicitly asked to "bury this in the docs" rather than interrupt
current work, same pattern as the river/water rendering bug reports stashed
in `iso2-portback-plan.md`'s "KNOWN BUGS" section. Not part of any approved
step-4 batch; just a durable parking spot so the idea isn't lost.

- **Compass overlay (2026-07-10):** Add a compass HUD element to the main
  isometric view — faux-3D styled, upper-left corner, aligned to the game's
  horizon/isometric viewport angle (i.e. NOT a flat top-down compass; it
  should visually respect the iso projection the way the world does). ALSO
  add a second, smaller, static (non-tilted) compass on the minimap in the
  lower-right, so the child player builds an intuitive cartography sense
  (minimap = simple top-down N/S/E/W reference, main view = fancier
  "in-world" version of the same info). Explicit future-gameplay hook the
  user floated: NPCs could eventually react to / remark on which cardinal
  direction the player has been traveling from for an extended time (e.g.
  "you look like you've come from the south") — purely speculative, no
  design committed, just noted so the compass isn't built in a way that
  precludes it later (e.g. keep a simple heading/facing-direction signal
  computable from player state, don't bake in anything that would make a
  future "recent travel direction" tracker awkward to add).
  Likely landing spots when this gets picked up: `src/rendering/` for the
  in-world faux-3D compass draw (near `local-lights.ts`/`minimap.ts`
  siblings), `src/rendering/minimap.ts` for the small static one, `src/ui/`
  only if it ends up DOM-drawn instead of canvas-drawn (probably canvas,
  per the project's "Canvas 2D for rendering, HTML DOM only for UI chrome"
  convention — a compass tied to camera/world heading reads as world
  rendering, not HUD chrome). No investigation done yet on camera/heading
  data already available to compute a "north" reference correctly against
  the isometric projection's rotation.

## Old (REJECTED) decomposition-focused version of this section, kept for
## record only -- do not act on this

~~1. render.ts ceiling fix (825 vs 800-line ceiling)~~
~~2. nano-tile.ts decomposition (1109 lines)~~
~~3. terrain-cache.ts (777) + nano-tile-defs.ts (521) lighter decomposition~~
~~4. src/game/* god-file watch list (wildlife/input/knowledge/trading/debug-api)~~
~~5. tiles.config.ts (2381) assessment~~
All of the above rejected 2026-07-09 -- see `code-organization-philosophy.md`.
