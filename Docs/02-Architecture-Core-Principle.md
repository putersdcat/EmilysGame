# 02 — Architecture Core Principle: Flat 2D Simulation, Isometric Presentation

**Status:** Canonical, keystone document. Every other document in this set
assumes this one. If you only read one document before touching code, read
this one.

---

## 1. The principle, stated plainly

> **Emily's Game's authoritative simulation is a flat, top-down 2D grid.
> The isometric view is a rendering trick applied on top of that flat
> model at draw time. It is not a different kind of world — it is a
> different way of drawing the same world.**

Concretely:

- The game's real state — where the player is, what's in each cell, what's
  blocked, what's been unlocked, what's in the player's inventory — is all
  expressed in ordinary 2D coordinates (`x`, `y`, integers or simple
  fractions of a grid unit) and ordinary 2D grid data (a cell has a kind, a
  walkability state, maybe an item or an NPC in it).
- Nothing about world generation, collision, progression gating, quizzes,
  NPC placement, or save/load needs to know that the game is ever going to
  be *drawn* isometrically. All of that logic would work completely
  unchanged if the game were instead rendered as a plain top-down grid, or
  as a text adventure, or not rendered at all (e.g. run headless in a test).
- The isometric look — the diamond grid, the way tall things overlap
  things behind them, the way a wall looks like a 3D box and a fence looks
  like an upright picket line, the way a river looks sunken — is entirely
  the responsibility of a presentation/rendering layer that consumes the
  flat model and decides how to draw it. That layer can change completely
  (different projection, different tile art style, even a different view
  angle entirely) without the simulation caring.

This is not a new idea for this project. It is the *original* idea. §2
below shows exactly where it came from, in the project's own words.

## 2. This was the original design — the evidence

This project's very first proof-of-concept plan describes isometric
rendering explicitly as a coordinate transform applied to a flat model,
*after* the flat model already has its data:

> "View Pivot: Top-Down to Isometric: Shifted from flat top-down to
> faux-3D isometric for depth feel... **Not true 3D—use 2D skews/offsets**
> (diamond grid) and layering for occlusion. **Assets remain flat**;
> projection faked via math (e.g., offset rows by 0.5 tile width, scale
> Y-axis slightly)."
>
> — `archived-planning/NewGame_Isometric_PoC.md`

The same document gives the actual projection formula, applied to ordinary
cartesian coordinates:

> "screenX = (x - y) * (tileWidth / 2)
> screenY = (x + y) * (tileHeight / 2)"

And it's explicit that the one piece of data that looks isometric-adjacent
— an object's "height" — exists purely to decide **draw order**, not
gameplay behavior:

> "Sort Function: Before draw, sort scene objects by `sortKey = y +
> (height / 2)` (southernmost/tallest last)."

The original Development Bible describes world generation entirely in flat
terms — a grid, chunks, hashing, Perlin noise, BFS reachability checks —
with the isometric view called out as its own, separate, later concern:

> "Isometric Projection: Faux-3D via diamond grid (offset rows by 0.5 tile
> width, squash Y-axis). Height-based sorting for occlusion (draw low-to-
> high; player dynamically layered)."
>
> — `archived-planning/NewGame_GameBible_StartHere.md`, in the *Rendering*
> section — notably **not** in the *World Generation* section, which
> describes tile-builder rules, meshing, and playability fixes in purely
> flat-grid terms with no mention of Z-height, billboards, or projection.

The LLM entropy design — how procedurally generated content is produced —
is the same story: density maps, hash-driven type assignment, auto-tiling
by neighbor bitmask, all 2D. Isometric only enters as the very last step:

> "Isometric: Apply projection (diamond grid offsets, Y-squash)
> **post-mapping**; height-sorting for occlusion."
>
> — `archived-planning/NewGame_LlmEntropyAddendum.md`

**The pattern across all three founding documents is identical**: build
the flat 2D world and its rules first, apply an isometric draw-time trick
last, and let a single scalar "height" number do the one job an isometric
view actually needs from game data — deciding what draws in front of what.

## 3. Where the separation eroded

The erosion is traceable to a specific concept: the **Nano tile**,
introduced during the "Iso 2.0" rendering-quality effort and later folded
into the main world-engine specification as a core, required part of the
spatial hierarchy.

An intermediate planning document already shows the seam starting to blur —
notice how an isometric-rendering concern gets stated as a *physics*
requirement:

> "Physics and Player Navigation Alignment... Avoidance of visual-collision
> mismatch **in isometric projection**."
>
> — `archived-planning/GPT-53-Codex_Core World Engine.md` §9 (superseded,
> but preserved in `archived-planning/` as the historical record)

By the time this became the *current, authoritative* world-engine
specification, the blur had become baked-in schema. The Nano Tile's
"Required Metadata" — presented as equally load-bearing alongside genuine
gameplay data like walkability — includes:

> - **Z Mode**: "The z-mode determines render ordering, occlusion
>   behavior, and **the class of geometry used by the renderer**."
> - **Render Family**: "Billboard... Extruded box... Carve-out... Flat
>   overlay" — an explicit enumeration of *drawing techniques*.
> - **Z Offset**: "drives draw order, occlusion, shadow behavior."
> - Plus Blend Policy, Visual Asset Contract, and Stack Ordering Policy —
>   all, by their own description, rendering concerns.
>
> — `archive-2026-07-14/WorldEngine-01-SpatialHierarchy.md` §3.2.3

None of this is wrong as *rendering* design — a real isometric renderer
genuinely does need to know whether a fence is a billboard and a wall is an
extruded box. **The problem is where this information was made to live**:
declared as required core metadata for the world's spatial grammar, in the
same document and the same schema as walkability — the one thing about a
Nano tile that a flat 2D simulation actually needs.

This is exactly the kind of drift Pillar 7 (`01` §4) exists to name and
reverse.

## 4. The corrected model

### 4.1 Two layers, one narrow contract

```
┌─────────────────────────────────────────────────────────────┐
│  CORE SIMULATION LAYER  (03, 04)                             │
│  Flat 2D grid. Cells, features, entities, regions.           │
│  Owns: walkability, progression state, inventory, NPCs,      │
│        world generation, saves.                              │
│  Knows nothing about: pixels, canvas, projection, Z-height    │
│  render families, billboards, extrusion, carve-outs.          │
└───────────────────────────┬───────────────────────────────────┘
                            │  read-only flat data
                            │  (positions, cell kinds, entity list)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER  (05)                                    │
│  Isometric projection, camera, depth-sort, asset resolution. │
│  Owns: how a cell's "kind" tag maps to a drawing technique     │
│        (billboard / extrusion / carve-out / flat decal),      │
│        the coordinate transform, draw order, visual caching.  │
│  Never writes back gameplay-affecting state.                  │
└─────────────────────────────────────────────────────────────┘
```

The contract between them is deliberately narrow and one-directional: the
presentation layer *reads* the simulation's flat state and *produces
pixels*. It never decides whether the player can walk somewhere, never
resolves a quiz, never mutates progression state. If a rendering-only
concern (say, "should this billboard sway in the wind") needs its own
transient state, that state lives in the presentation layer, not in the
simulation's data model — the same "engine owns data, rendering owns
draw-caches" split already stated as a rule in `ARCHITECTURE.md` §3, now
made central rather than one bullet among many.

### 4.2 What "flat 2D" means precisely

The simulation's world model is a grid of cells addressed by ordinary
`(x, y)` coordinates. A cell's core data answers exactly the questions the
*game rules* need answered:

- **Is this cell walkable, blocked, or conditionally walkable** (and if
  conditional, what unlocks it)?
- **What is here** — a piece of terrain, a structural feature (wall,
  fence, gate, river, bridge), an item, an NPC?
- **What sub-cell precision does gating need** — see `03` §3 for how
  "nano"-style sub-cell precision is kept as a pure *gameplay* concept
  (precisely which part of a cell blocks movement, for gates embedded in a
  fence run) with no rendering vocabulary attached at all.

A cell's data does **not** need, at the simulation layer: a Z-mode, a
render family, a blend policy, a stack-ordering policy, or a visual asset
reference. Those questions are all a rendering layer's to answer, driven
by the cell's *kind* tag (e.g. `"fence"`, `"river"`, `"wall"`) — the
simulation only needs to know a fence is a fence; how a fence gets drawn in
an isometric view (a Z-pinned billboard) is the presentation layer's
decision, made by looking up `"fence"` in its own resolver table.

A **height** value may still exist, purely as the historical PoC used it:
a scalar used only for draw-order/occlusion sorting. It is presentation
data that happens to be convenient to precompute from the simulation's
"kind" tag — it is never gameplay-authoritative, and nothing in the
simulation layer should ever branch on it.

### 4.3 What this means for agentic development, concretely

This is the practical checklist this whole rewrite exists to produce.
Apply it whenever adding or reviewing a gameplay system:

1. **If you're adding a field like `zMode`, `renderFamily`, `billboard`,
   `extrudeHeight`, or similar to a *core* gameplay data structure (a
   cell, a feature template, a world-generation solver's schema) — stop.**
   That belongs in the presentation layer's resolver table, keyed off the
   feature's `kind`, not in the simulation schema.
2. **If a piece of gameplay logic (collision, gating, pathing) needs to
   read something about *how a thing is drawn* to decide something about
   *whether a player can walk there* — that's a sign the flat model is
   missing a piece of real gameplay data it should have instead.** (E.g.
   "the west half of this cell is blocked" is a real, flat, 2D fact — model
   it as sub-cell walkability data, not by asking the renderer's billboard
   geometry.)
3. **World generation should be describable, verifiable, and testable
   without ever importing anything from the rendering layer.** If a
   generation/solver module needs to import from `rendering/` to make a
   decision, that's the erosion pattern recurring.
4. **The presentation layer may be swapped or radically changed (new art
   style, different projection, a debug top-down mode) without touching
   world generation, collision, or progression code at all.** This is the
   practical test of whether the separation is holding.

### 4.4 This repo's existing layering rules already agree

`ARCHITECTURE.md` §3's layering rules already state "`engine/` must not
import from `rendering/`..." and "Data ≠ rendering. A tile's logical data
... lives in `engine/`; how it is drawn lives in `rendering/`." This
document doesn't contradict that — it makes it the *central* organizing
principle instead of one rule among many, and extends it explicitly to
cover the Nano-tile/Z-height/render-family concepts that had, in practice,
been treated as an exception to it.

## 5. This is a design correction, not a refactor mandate

This document describes the *target* model that new work should follow and
the lens future design docs in this set use. **It does not, by itself,
direct anyone to go rewrite `src/engine/world/` or the nano-tile rendering
system.** This repository has an explicit, standing rule (see
`/memories/repo/code-organization-philosophy.md`, reflected in
`13-Development-Roadmap.md` §1) against reorganizing working code for its
own sake. Where existing code doesn't yet match this model, that gap is
tracked honestly in `12-Current-Reality-Gap-Analysis.md` and addressed the
same way every other real gap in this codebase has been addressed:
opportunistically, in the course of genuine feature work or bug fixes,
verified with a live test each time — never as a big-bang rewrite.

## 6. Where to go next

- `03-Core-Simulation-Model.md` — the flat model in full detail.
- `04-World-Generation-Design.md` — generation and progression built on
  top of that flat model.
- `05-Presentation-Layer-Isometric-Rendering.md` — the isometric rendering
  layer that consumes it.
