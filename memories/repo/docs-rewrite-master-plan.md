# Docs/ full rewrite — master plan (started 2026-07-14)

## User's request (verbatim intent)

User had a "big revelation": the ORIGINAL dev-lifecycle concept was to build
the game as a simple, flat, top-down 2D X-Y grid game — ALL core logic
(world-section building, movement gating, forced interaction/quiz/knowledge
progression) implemented against this flat model — and apply the isometric
view as a runtime rendering trick ONLY, so an agentic developer adding
gameplay systems never needs to reason about isometric projection at the
logic layer. Believes this separation "got lost in translation" over the
course of development. Wants a FULL FRESH START in `Docs/`:
1. Archive everything currently in `Docs/` into a subfolder.
2. Read ALL historical gameplay/design docs carefully.
3. Build an end-to-end NEW full set of design documents outlining the whole
   game's development pathway, clean and coherent.
4. This is explicitly a long task — map it out, use memory files, "chain
   sessions automatically until completed." Start immediately (not just plan).

## VERIFIED: the hypothesis is correct, with strong primary-source evidence

Read directly (not secondhand) this session:
- `archived-planning/NewGame_Isometric_PoC.md` — the ORIGINAL isometric PoC
  plan. Explicit: "Shifted from flat top-down to faux-3D isometric for depth
  feel... Not true 3D—use 2D skews/offsets... Assets remain flat; projection
  faked via math." Isometric projection formula given as pure screen-coord
  math (`screenX=(x-y)*tileWidth/2`, `screenY=(x+y)*tileHeight/2`) applied
  to cartesian (x,y) AFTER world data exists. "height" field exists ONLY for
  draw-order/occlusion sorting, never gameplay logic.
- `archived-planning/NewGame_GameBible_StartHere.md` — original dev bible.
  World gen described entirely in flat-grid/hash/BFS terms (1024x1024 cells,
  32x32 chunks). "Isometric Projection: Faux-3D via diamond grid... post-
  mapping." Same pattern: isometric is a rendering-section bullet point,
  fully separate from the "World Generation" section's tile-builder rules.
- `archived-planning/NewGame_LlmEntropyAddendum.md` — entropy→world mapping
  is 100% flat 2D (density maps, hash→grid, BFS). "Isometric: Apply
  projection... post-mapping" — again explicitly a POST-PROCESS step after
  the flat simulation data exists.
- `archived-planning/GPT-53-Codex_Core World Engine.md` (superseded doc,
  already known stale per WorldEngine-00's own text) — this is where
  entanglement starts creeping in: section 9 ("Physics and Player Navigation
  Alignment," framed as gameplay logic) includes "Avoidance of visual-
  collision mismatch in isometric projection" — an isometric-rendering
  concern bleeding into a section about core movement physics.
- `Docs/WorldEngine-01-SpatialHierarchy.md` (the CURRENT, "official," still-
  authoritative world-engine spec) — **this is the smoking gun**. The Nano
  Tile (L0.5) tier's "Required Metadata" lists, as CO-EQUAL REQUIRED FIELDS
  in the same schema as `Walkability Rule` (a real gameplay concern):
  `Z Mode` (positive/negative/flat — explicitly "determines render ordering,
  occlusion behavior, and the class of geometry used by the renderer"),
  `Render Family` (billboard/extruded-box/carve-out/flat-overlay — a pure
  rendering-geometry concept), `Z Offset` (drives "draw order, occlusion,
  shadow behavior"), `Blend Policy`, `Visual Asset Contract`, `Stack Ordering
  Policy` — all rendering/presentation concerns baked into the CORE spatial-
  hierarchy/world-generation document as if they were load-bearing gameplay
  data. A flat top-down 2D sim only needs "blocked/open/conditional" +
  "feature kind" (fence/wall/river/gate) at this layer — HOW that feature
  gets drawn isometrically (billboard vs extrude vs carve) is 100% a
  rendering-layer decision, not core data.

**Conclusion: the user's revelation is correct and well-evidenced, not just
a feeling.** The original design cleanly separated flat-2D simulation from
isometric presentation; the separation eroded specifically through the
"Nano tile" concept introduced during the Iso 2.0 port-back effort (see
`/memories/repo/iso2-portback-plan.md` for the full code-level history of
that effort), which now treats render-family/Z-mode as first-class required
metadata alongside real gameplay data (walkability) in the same schema.

## CRITICAL constraint from existing repo memory — do not violate

`/memories/repo/code-organization-philosophy.md`: user has an explicit,
strong standing directive AGAINST speculative code reorganization for its
own sake ("does not move the needle... token heavy busy work"). Split/
refactor only for genuine functional reasons discovered while doing real
work, never as a goal in itself. **This means**: the new docs must frame
"flat-2D-core + isometric-presentation" as a DESIGN PRINCIPLE FOR FUTURE
WORK and a lens for understanding the system, NOT a mandate to go refactor
`src/engine/world/*` or the nano-tile system right now. The gap-analysis /
roadmap docs must explicitly say this and avoid proposing a big-bang
"separate everything" rewrite project. Frame it as: new work should default
to this cleaner model; existing entanglement is known, documented, healed
opportunistically when touching related code for a real reason (bug fix,
new feature) — matching the established Slice-A-E audit methodology
already used successfully in this repo (deep read → hypothesis → verify →
narrow safe fix → live-engine test proof).

## New Docs/ structure (planned, status tracked here — update as work lands)

Archive target: `Docs/archive-2026-07-14/` (all pre-existing Docs/ contents
moved there verbatim, including images/ScreenshotUpscales/etc.)

New files directly in `Docs/`:

| # | File | Purpose | Status |
|---|------|---------|--------|
| 00 | `00-INDEX.md` | Roadmap, reading order, doc-set status tracker | not started |
| 01 | `01-Game-Vision-and-Design-Pillars.md` | What/why/who — game bible reborn: audience, tone, session shape, educational mission, core loop | not started |
| 02 | `02-Architecture-Core-Principle.md` | THE keystone doc: flat-2D-sim + isometric-presentation separation, historical grounding, layering rules, why it matters for agentic dev | not started |
| 03 | `03-Core-Simulation-Model.md` | The flat grid model in pure 2D vocabulary: cells, features, entities, chunks/macro-regions, game state shape — ZERO isometric terms | not started |
| 04 | `04-World-Generation-Design.md` | Procedural generation + progression as a flat-2D/graph problem: entropy→biome, macro-region assembly, local structure motifs (2D shape language only), edge-adjacency constraints, population/progression solvers, lock-key DAG, five guarantees, difficulty pacing | not started |
| 05 | `05-Presentation-Layer-Isometric-Rendering.md` | The isometric transform as a downstream, swappable layer: projection math, camera, depth-sort/occlusion, sprite/tile asset resolution, the nano-visual-family concept REFRAMED as a pure rendering resolver | not started |
| 06 | `06-LLM-Entropy-and-Procedural-Seeding.md` | The "creative RNG" mechanic, wordlist, hashing, NPC-chat feedback loop, fallback rules | not started |
| 07 | `07-Education-and-Knowledge-System.md` | Quizzes, Book of Knowledge, word-bag, content pipeline | not started |
| 08 | `08-Characters-NPCs-and-Wildlife.md` | Player sprite/customization, NPC personas/dialogue, wildlife/discovery | not started |
| 09 | `09-Audio-Design.md` | Music, SFX, positional audio | not started |
| 10 | `10-UI-UX-and-Accessibility.md` | HUD, menus, dialog, accessibility, touch/gamepad | not started |
| 11 | `11-Save-State-and-Persistence.md` | Save/load model, what must persist, determinism contract | not started |
| 12 | `12-Current-Reality-Gap-Analysis.md` | Honest current-code-vs-target-model mapping, concrete file references, supersedes/absorbs old VisionAlignmentAudit.md's role | not started |
| 13 | `13-Development-Roadmap.md` | Phased, INCREMENTAL plan — explicitly respects code-organization-philosophy.md (no big-bang rewrite) | not started |

## Session log (append as work happens)

- **2026-07-14, session 1**: research phase done (see above). Master plan
  created. Archive complete: all 47 pre-existing `Docs/` entries moved to
  `Docs/archive-2026-07-14/` verbatim (confirmed via directory listing,
  `Docs/` now contains only the archive subfolder). **FULL FIRST PASS
  COMPLETE — all 14 documents (00-13) written and cross-referenced:**
  `00-INDEX.md`, `01-Game-Vision-and-Design-Pillars.md`,
  `02-Architecture-Core-Principle.md` (keystone — full evidence trail),
  `03-Core-Simulation-Model.md` (flat 2D model, zero isometric vocabulary),
  `04-World-Generation-Design.md` (generation/progression as flat-2D/graph
  problem), `05-Presentation-Layer-Isometric-Rendering.md` (isometric
  rendering as downstream layer, kind→drawing-technique resolver table),
  `06-LLM-Entropy-and-Procedural-Seeding.md`,
  `07-Education-and-Knowledge-System.md`,
  `08-Characters-NPCs-and-Wildlife.md`, `09-Audio-Design.md`,
  `10-UI-UX-and-Accessibility.md`, `11-Save-State-and-Persistence.md`,
  `12-Current-Reality-Gap-Analysis.md` (source-verified, folds in
  VisionAlignmentAudit.md's findings + this session's own isometric-
  entanglement discovery, explicitly cites the 2026-07-13 gate-interaction
  fix as a real-world example), `13-Development-Roadmap.md` (explicitly
  bounded by code-organization-philosophy.md's no-speculative-rewrite
  rule, priority-ordered real gaps, references the proven Slice-audit
  methodology).
  INDEX status table fully accurate (00-13 all ✅ done). Flagged clearly
  (in INDEX §2 and to the user) that `ARCHITECTURE.md` (repo root, outside
  `Docs/`) still links to now-archived files and describes pre-rewrite
  architecture — deliberately NOT touched this pass since the user's
  request was scoped to `Docs/`; needs an explicit follow-up decision.
  **NOT YET committed to git** — check `git status`/diff before next
  session assumes this is committed. Total new content: ~14 substantial
  markdown files replacing 47 archived files; nothing deleted, everything
  preserved in `archive-2026-07-14/`.
- **COMMITTED**: `3e3529f` (the full rewrite: archive move + all 14 new
  docs, 85 files changed/1957 insertions) + `7ce1c3e` (small follow-up
  fixing a pre-existing `docs/`-vs-`Docs/` git case-tracking artifact
  uncovered while verifying the first commit — 4 files, a Windows-
  filesystem-case-insensitivity + `.gitignore` interaction, not a content
  issue). Final verified state: 85 files tracked under `Docs/` total (14
  new + 71 recursively-counted archive files, reconciled exactly against
  the original 47 top-level archive entries including 3 subfolders).
  Working tree clean. **This first pass is fully done and committed.**
- **Remaining candidate follow-ups (not started, lower priority than the
  core rewrite which is now DONE)**: (a) decide whether to update
  `ARCHITECTURE.md` to point at the new set; (b) `.github/copilot-
  instructions.md` and per-path `.github/instructions/*.md` files were NOT
  audited for stale Docs/ references this pass — worth a scan if this
  continues; (c) the actual priority-1 functional gap from `13` §2 (quiz-
  gate unavoidability) is real follow-on ENGINEERING work, not a docs task
  — do not start it unprompted, it's a separate deliverable from this
  documentation rewrite.
