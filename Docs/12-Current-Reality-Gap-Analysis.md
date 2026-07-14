# 12 — Current Reality: Gap Analysis

**Status:** Living document, source-verified. Supersedes the role of
`archive-2026-07-14/VisionAlignmentAudit.md` (that document remains
available in the archive and its individual findings are still accurate —
this document folds its conclusions in, adds this session's new
isometric/logic-entanglement findings, and becomes the ongoing home for
this kind of audit going forward).

**Methodology**: every claim below is either a direct source read
(file/function named) or an explicit reference to a prior, source-verified
audit pass recorded in repo memory. Per this project's own standing rule
(`archive-2026-07-14/VisionAlignmentAudit.md` §2): never trust a "current
status" paragraph — including this one, over time — without re-verifying
against real source when a decision hinges on it.

---

## 1. Where reality already matches the target model well

- **Folder-level layering already agrees with `02`'s principle.**
  `ARCHITECTURE.md` §3's layering rules ("`engine/` must not import from
  `rendering/`... Data ≠ rendering") are exactly this document set's core
  principle, already stated — this rewrite makes it central rather than
  one bullet among many, and extends it explicitly to the Nano-tile
  concepts that had been treated as an exception (§3 below).
- **Chunk size already matches "Region" size.** Per repo memory
  (`next-batch-plan.md` era work, reconfirmed in
  `Docs/archive-2026-07-14/Next-Engine-And-Gameplay-Plan.md`): chunk size
  is 25×25 cells, `WU_SIZE=5`, `GRID_DIM=5` — i.e. the streaming/loading
  unit is already exactly one Region (`03` §6) in size. This is a genuine,
  already-landed alignment with the model in this document set, not
  something that needs to change.
- **`gen.ts` is already a thin barrel** (~71-81 lines depending on when
  measured) delegating to focused modules under `src/engine/world/`
  (`ChunkGenerator.ts`, `WorldUnitSolver.ts`, `ObstacleSolver.ts`,
  `Populator.ts`, `Passability.ts`, `Validation.ts`, `BiomeSelector.ts`,
  `CollectibleScatterer.ts`) — this modular shape maps cleanly onto `04`'s
  pipeline stages.
- **The Five (now Seven, `01` §4) Guarantees are mostly implemented and
  verified**, not just aspirational: no-softlock quiz retry is
  source-confirmed unlimited (`quiz-gate-retry-loop.spec.ts`); dead-end
  reward scanning exists as an explicit "Phase 6.5" pass in
  `ObstacleSolver.ts`; lock-key DAG ordering is implemented and audited
  clean; distance/streak-based difficulty scaling is implemented
  (`quiz.ts`'s `getDifficultyForDistance`/`blendDifficulty`).
- **Biome-aware merchant inventory** (Pillar-adjacent, `08` §2) is
  implemented — 4 biome-specific merchant personas plus a per-chunk
  spacing cap (`Populator.ts`, `npc.config.ts`), fixing a previously
  real, previously-closed-but-not-actually-fixed gap.
- **NPC entropy feedback loop** (`06` §2.2) is real and wired — NPC
  greetings, movement, and quiz answers all feed the entropy pool
  (`interaction-handler.ts`, `chunk-lifecycle.ts`, `main.ts`).
- **Music is real sample-based audio** (`09` §2), not synthesized
  placeholders — confirmed directly (`music.config.ts`'s own header,
  a real 51-track classical library with SoundFont playback).
- **Gate/obstacle interaction targeting** was audited and a real bug fixed
  this project (2026-07-13, see `/memories/repo/gameplay-feel-audit-
  2026-07-13.md`): the isometric-input 45°-rotation meant a single arrow
  key produces diagonal grid facing, which the interaction code didn't
  originally decompose correctly — fixed and verified with 191/192 tests
  passing (the one unrelated failure is a probabilistic animal-behavior
  timing flake). This is a concrete example of exactly the kind of
  "isometric-adjacent concern leaking into core interaction logic" this
  whole document set is about, independently discovered and fixed before
  this rewrite began.

## 2. Confirmed real gaps (functional, not architectural)

Carried forward from `archive-2026-07-14/VisionAlignmentAudit.md` (full
detail and references there); still open as of this writing:

- **No merchant-independent macro-tile lattice-pond fix.** River-heavy
  mood can over-saturate a Region with water-touching Blocks (measured:
  up to 100% of a Region's Blocks in extreme samples, average ~74% under
  a strong river-heavy mood) because `EDGE_COMPAT.water` is a hard
  constraint, not a soft weight. The correct fix (per `04` §7/§9 and the
  original audit) is a Composite Assembly pond/lake template, not a
  smarter per-slot solver — not yet built.
- **Standalone quiz-gate "unavoidability."** Gates are guaranteed
  *solvable* but not always guaranteed *unavoidable* (a player can
  sometimes route around one entirely). Doesn't violate Pillar 1, does
  soften Pillar 2. Identified, not yet fixed — see `13` §2.
- **Multi-way junction terminators** — partially fixed (2026-07-10,
  `findMultiWayTerminatorCandidates`), residual traced to a separate,
  deliberately-deferred `EDGE_COMPAT` asymmetry (the compatibility table
  isn't actually symmetric despite its own comment claiming it is) —
  correctly deferred due to its blast radius (touches the whole
  constraint solver).
- **Content-pack automation pipeline** (`07` §5) is only 2 of its planned
  4 sub-parts delivered — the shipped content (416 merged quiz questions,
  31 Book articles) was a one-time manual drop, not the repeatable
  fetch→rephrase→validate→ship pipeline `07` §5 describes. Explicitly
  sanctioned as a known, non-silent shortfall in its own tracking issue.
- **Knowledge Capture automation core** (rephrasing quality-gate, CI
  refresh) — still open, not yet built.

## 3. The isometric/logic entanglement — where it concretely lives today

This is the finding specific to this rewrite (`02` §3), stated here in
terms of exactly which files carry it, for anyone doing future work:

- **`archive-2026-07-14/WorldEngine-01-SpatialHierarchy.md`** is the
  clearest textual example — its Nano Tile "Required Metadata" (§3.2.3)
  lists Z Mode, Render Family, Z Offset, Blend Policy, Visual Asset
  Contract, and Stack Ordering Policy as co-equal required fields
  alongside Walkability Rule. This document is now superseded by `03` §3
  (which keeps only the gameplay-relevant sub-cell-occupancy idea) and
  `05` §4 (which is where the render-family concepts correctly belong).
- **`experiment/isometric-2.0/src/types.ts`** defines `NanoTileKind`,
  `NanoZMode`, `WalkableRule`, and `NanoTile` as a single combined type —
  this is the origin point of the schema described above, and the main
  engine's nano-adjacent code (`src/rendering/nano-tile*.ts`,
  `src/engine/iso2-solver.ts`) inherited the same combined shape when it
  was ported back into the main engine (`ARCHITECTURE.md` §6's Iso2
  integration notes, `/memories/repo/iso2-portback-plan.md`'s full
  history).
- **In practice, walkability and render-family data for a nano-precision
  feature currently travel together** through `getNanoStack()` /
  `isPointWalkableInTile()` (`src/engine/mechanics.ts`,
  `src/rendering/nano-tile-defs.ts`) — a single lookup keyed by asset kind
  returns both the walkability-relevant stack *and* the render geometry.
  This is not necessarily wrong as an *implementation shortcut* (one table
  keyed by kind, serving two different callers, is a reasonable thing for
  actual code to do) — the entanglement this document set cares about is
  at the **conceptual/schema level** (whether Z-mode/render-family is
  *required, load-bearing metadata for the world's spatial grammar*, per
  the old WorldEngine-01 framing, vs. correctly scoped as *presentation-
  layer-owned data that a rendering call site happens to look up from the
  same convenient table*). See `13` §1 for why this distinction matters in
  practice and why it does **not**, by itself, justify a code split today.

## 4. What this means going forward

Nothing in §3 is an emergency, and nothing in §3 requires an immediate
code change. It is now documented precisely enough that:

- New gameplay systems can be built against `03`/`04`'s pure-flat
  vocabulary without needing to touch or understand the nano-tile render
  schema at all.
- The next time someone is genuinely working inside the nano-tile system
  for a real reason (a bug, a new feature), `05` §4's resolver-table
  framing is the target shape to move that specific piece toward — see
  `13` for how that kind of opportunistic alignment is meant to happen.

## 5. Where to go next

- `13-Development-Roadmap.md` — how any of the above gets addressed, in
  what order, and under what constraint (no speculative rewrites).
