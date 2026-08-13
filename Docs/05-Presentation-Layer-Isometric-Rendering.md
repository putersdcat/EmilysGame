> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# 05 — Presentation Layer: Isometric Rendering

**Status:** Historical (was labeled canonical). Assumes `02` and `03`. Adapts and supersedes
`archive-2026-07-14/WorldEngine-04-RenderingPipeline.md` and the rendering-
relevant portions of `WorldEngine-01-SpatialHierarchy.md` §3.2 (the Nano
tile's render-family concepts, which belong here, not in `03`).

---

## 1. Role of this layer

The presentation layer's job is exactly one thing: **take the flat 2D
simulation state (`03`) and produce pixels that read as a coherent
isometric world.** It is downstream of everything else in this document
set. It reads simulation state; it never writes gameplay-affecting state
back. If this layer disappeared entirely and were replaced by, say, a
plain top-down 2D renderer, or a debug ASCII dump, every other system in
this game (`03`, `04`, `06`, `07`, `08`, `11`) would keep working
unmodified — that is the practical test of whether this layer is doing its
job correctly (`02` §4.3, point 4).

## 2. The projection: a coordinate transform, nothing more

The historical, original formula still applies:

```
screenX = (worldX - worldY) * (tileWidth  / 2)
screenY = (worldX + worldY) * (tileHeight / 2)
```

This maps a flat `(x, y)` grid position to a screen position that reads as
a diamond-grid isometric view. It is applied once, at draw time, per
visible cell/entity. Nothing about world generation, collision, or
progression logic ever needs to run this formula or know it exists.

A **camera** (position, viewport size) determines which region of the flat
world is currently visible; only cells and entities within the camera's
viewport (plus a small buffer margin) are drawn each frame — see §6 on
performance.

## 3. Draw order and occlusion: one derived number, not stored gameplay data

An isometric view needs to draw things in the right order so nearer/taller
things correctly overlap farther/shorter things. The presentation layer
computes a **sort key** per visible cell/entity — conceptually
`sortKey = y + (visualHeight / 2)` — and draws back-to-front by that key.

`visualHeight` here is **derived** by this layer from a cell's `kind`
(`03` §2) via a small lookup table (grass is short, a stone wall is tall, a
tree canopy is very tall) — it is never itself stored as required core
simulation data. This is the one place a "height" number belongs in this
whole system, and it belongs here, not in `03`, precisely because its only
job is deciding what draws in front of what.

## 4. The kind → drawing-technique resolver

This is where the render-family concepts that used to live in the core
world-engine schema (`02` §3) correctly belong. Given a cell's flat `kind`
tag, this layer's resolver table decides **how** to draw it:

| Drawing technique | Used for | What it means |
|---|---|---|
| **Billboard** | fence, gate, bridge rail, tall grass | An upright, camera-facing (Z-pinned) flat image, skewed to sit correctly in the isometric plane. |
| **Extruded box** | stone wall, cathedral wall, homestead wall | A solid three-face volume (front face, top cap, end cap) giving real visual thickness. |
| **Carve-out** | river, river-bank | Rendered as a depression below the surrounding ground plane, with edge blending into the bank. |
| **Flat overlay** | decals, trims, path wear | A ground-hugging image with no meaningful height, drawn flush with the terrain. |

A feature that uses sub-cell gating precision (`03` §3) is resolved
visually the same way: this layer reads which of the nine sub-cell
positions are occupied and by what `kind`, and picks a matching visual
variant — e.g. a fence's neighbor-connectivity pattern resolves to
`straight-h`, `corner-*`, `tee-*`, `cross`, or `isolated` sprite variants.
**This connectivity/variant resolution is legitimate, useful presentation
logic** — the only rule from `02` that matters here is that it consumes
flat gameplay data (which sub-cells are occupied, by what kind) and
produces a visual choice, rather than the visual choice ever being
predetermined and stored in the simulation's own data.

Stack order for cells with multiple co-located features (e.g. a river with
a bridge over it) follows a fixed presentation-layer policy: carve-outs
first, flat overlays second, billboards/extrusions last — again, a purely
visual composition rule, never simulation state.

## 5. Asset pipeline

Visual assets (tile art, structural pieces, sprites) are generated as SVG,
decoded once into cached bitmap images, and reused across every cell that
shares the same visual variant. Per-Region terrain is baked to an offscreen
canvas once and reused until something in that Region's *simulation* state
changes in a way that affects appearance (a gate resolving, an item being
collected) — at which point only the affected cache scope is invalidated,
never the whole Region.

## 6. Performance discipline

Because this layer runs every frame, it follows a strict set of hot-path
rules, all purely about *how fast pixels get produced*, with zero bearing
on gameplay correctness:

- **Viewport culling** — only cells/entities within the camera's view (plus
  a small margin) are ever considered for drawing.
- **Pre-allocated draw-command pools** — the render loop reuses a fixed
  buffer of draw commands and a matching sort index rather than allocating
  new objects every frame.
- **Layered caching** — per-cell visual atlas, per-Block/Region terrain
  bakes, and shadow/lighting caches are each invalidated at the narrowest
  scope that changed.
- **Optional WASM acceleration** for bulk, deterministic per-frame work
  (batch transforms, visibility culling, draw-command sorting) — an
  implementation detail of *this layer only*; the simulation layer has no
  awareness that WASM exists at all.

## 7. The contract, restated

```
Simulation (03/04)  →  read-only flat state  →  Presentation (this doc)
                                                        │
                                                        ▼
                                                     pixels
```

Never the other direction. If a rendering decision (e.g. "this billboard
should sway") ever seems to need its own persistent state, that state
belongs to this layer (an ephemeral animation/visual-effects concern), not
to `03`'s game-state model — see `03` §7 for the line between what's
authoritative and what's presentation-owned.

## 8. Where to go next

- `12-Current-Reality-Gap-Analysis.md` — how closely today's
  `src/rendering/` and `src/asset-pipeline/` code matches this description,
  and where the resolver-table idea in §4 is (or isn't yet) cleanly
  separated from generation code in practice.
- `13-Development-Roadmap.md` — how any needed adjustments get made
  incrementally.
