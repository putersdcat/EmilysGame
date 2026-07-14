# Emily's Game — Design & Architecture Documentation

**Status:** Living document set · **Rewrite started:** 2026-07-14
**Supersedes:** everything previously in `Docs/`, now preserved verbatim at
[`Docs/archive-2026-07-14/`](archive-2026-07-14/).

---

## Why this rewrite happened

Over the course of development, the isometric view — which was always meant
to be a *rendering trick* applied on top of a simple, flat, top-down 2D
simulation — gradually grew entangled with the core simulation and world
generation logic. Concepts that only mean something to a renderer (Z-height
render families, billboard vs. extrusion vs. carve-out geometry, stacking
order) ended up documented as **required core gameplay data**, alongside
genuinely load-bearing concepts like walkability and progression gating.

This document set starts over from the original intent, verified directly
against the project's own historical design documents (see
[`02-Architecture-Core-Principle.md`](02-Architecture-Core-Principle.md) for
the full evidence trail), and rebuilds a complete, coherent design
specification with that principle restored and made explicit throughout.

**This is a documentation correction, not a mandate to rewrite the engine.**
See the note in §4 below — existing code is not being torn up on the back of
this doc set. New work should follow the model described here; existing
entanglement is healed opportunistically, the same way every other solidity
gap in this codebase has been fixed (see
[`12-Current-Reality-Gap-Analysis.md`](12-Current-Reality-Gap-Analysis.md)).

---

## 1. Reading order

If you read nothing else, read **02**. Everything else assumes it.

| # | Document | What it's for |
|---|----------|----------------|
| 00 | `00-INDEX.md` | This file — map of the whole set |
| 01 | [`01-Game-Vision-and-Design-Pillars.md`](01-Game-Vision-and-Design-Pillars.md) | What the game is, who it's for, the core loop, and the non-negotiable design pillars |
| 02 | [`02-Architecture-Core-Principle.md`](02-Architecture-Core-Principle.md) | **The keystone.** Flat 2D simulation vs. isometric presentation — the principle, the evidence it was the original intent, where it eroded, and the corrected model |
| 03 | [`03-Core-Simulation-Model.md`](03-Core-Simulation-Model.md) | The authoritative flat-2D game model: grid, cells, features, entities, regions — described with **zero isometric vocabulary** |
| 04 | [`04-World-Generation-Design.md`](04-World-Generation-Design.md) | Procedural generation and progression gating as a flat 2D / graph problem: entropy → biome, region assembly, local structure motifs, edge-adjacency rules, lock-key progression, the Five Guarantees |
| 05 | [`05-Presentation-Layer-Isometric-Rendering.md`](05-Presentation-Layer-Isometric-Rendering.md) | The isometric view as a downstream, swappable layer: projection math, camera, depth-sort, asset/visual resolution |
| 06 | [`06-LLM-Entropy-and-Procedural-Seeding.md`](06-LLM-Entropy-and-Procedural-Seeding.md) | The "creative RNG" LLM mechanic: wordlist seeding, hashing, the player-action feedback loop, fallback rules |
| 07 | [`07-Education-and-Knowledge-System.md`](07-Education-and-Knowledge-System.md) | Quizzes, the Book of Knowledge, word-bag, educational content pipeline |
| 08 | [`08-Characters-NPCs-and-Wildlife.md`](08-Characters-NPCs-and-Wildlife.md) | Player sprite & customization, NPC personas & dialogue, wildlife & discovery |
| 09 | [`09-Audio-Design.md`](09-Audio-Design.md) | Music, sound effects, positional audio |
| 10 | [`10-UI-UX-and-Accessibility.md`](10-UI-UX-and-Accessibility.md) | HUD, menus, dialog, accessibility, touch/gamepad input |
| 11 | [`11-Save-State-and-Persistence.md`](11-Save-State-and-Persistence.md) | What must persist, the save/load contract, determinism guarantees |
| 12 | [`12-Current-Reality-Gap-Analysis.md`](12-Current-Reality-Gap-Analysis.md) | Honest, source-verified mapping of the current `src/` code against this model — what already matches, what's entangled, what's a known gap |
| 13 | [`13-Development-Roadmap.md`](13-Development-Roadmap.md) | How to move forward incrementally — explicitly aligned with this repo's standing "no speculative rewrites" rule |

## 2. Status of this rewrite

This is a large, explicitly multi-session effort. Status is tracked here and
kept current; also mirrored in repo agent memory
(`/memories/repo/docs-rewrite-master-plan.md`) for continuity across
sessions.

| Doc | Status |
|-----|--------|
| 00 — Index | ✅ done |
| 01 — Vision & Pillars | ✅ done |
| 02 — Architecture Core Principle | ✅ done |
| 03 — Core Simulation Model | ✅ done |
| 04 — World Generation Design | ✅ done |
| 05 — Presentation Layer | ✅ done |
| 06 — LLM Entropy | ✅ done |
| 07 — Education & Knowledge | ✅ done |
| 08 — Characters, NPCs, Wildlife | ✅ done |
| 09 — Audio | ✅ done |
| 10 — UI/UX & Accessibility | ✅ done |
| 11 — Save/State & Persistence | ✅ done |
| 12 — Gap Analysis | ✅ done |
| 13 — Development Roadmap | ✅ done |

**First full pass complete 2026-07-14.** This is a living set — see `12`/`13`
for how it stays current. A few natural follow-ups this pass surfaced but
deliberately left for a separate, explicit decision rather than folded in
silently:
- `ARCHITECTURE.md` (repo root, outside `Docs/`) still links to several
  now-archived files (`EngineDecompositionMap.md`, `RefactoringPlan_
  11-06-26.md`, the `WorldEngine-0X` series) and describes the engine
  architecture from before this rewrite. It was intentionally **not**
  rewritten as part of this pass — the user's request was scoped to
  `Docs/`. It should be revisited to point at this new set instead, but
  that's a separate, explicit follow-up, not assumed here.

## 3. What happened to the old docs

Everything that was in `Docs/` before this rewrite (WorldEngine-00 through
05, the Iso 2.0 research/planning docs, VisionAlignmentAudit.md, the
refactoring plans, screenshots, etc.) is preserved exactly as it was in
[`archive-2026-07-14/`](archive-2026-07-14/). Nothing was deleted. Where a
new document supersedes an old one, the new document says so explicitly and
explains what changed and why — the old material remains available as
historical record and, in places, as a source of real design detail that
was carried forward (most of the content in `04` and `07` in particular is
adapted directly from the old WorldEngine series and the archived
game-design docs, not invented fresh).

`archived-planning/` (one level up, outside `Docs/`) is a separate,
pre-existing archive of the *very original* concept documents (the
Development Bible, the LLM Entropy Addendum, the original isometric PoC
plan) and was **not** moved — those are exactly the primary sources this
rewrite is grounded in, and they stay where the rest of the project already
expects to find them.

## 4. A note on scope

This document set describes the *target* design model. It does **not**
direct an immediate wholesale refactor of `src/`. This repository has an
explicit, standing directive against reorganizing code for its own sake —
see `13-Development-Roadmap.md` §1 for how this doc set's principles get
applied in practice: opportunistically, in the course of real feature work
and bug fixes, the same way every other solidity gap in this codebase has
been closed.
