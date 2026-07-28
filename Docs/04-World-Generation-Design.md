# 04 — World Generation Design

**Status:** Canonical. Assumes `02` and `03`. Adapts and supersedes
`archive-2026-07-14/WorldEngine-02-EdgeContracts.md`,
`WorldEngine-03-SolverPipeline.md`, and
`WorldEngine-05-PopulationAndProgression.md` — most of the underlying
design detail in those documents was sound and is carried forward here;
what changes is that everything below is described purely in terms of the
flat 2D model from `03`, with no isometric vocabulary.

---

## 1. What generation has to produce

Every time the player crosses into a new Region (`03` §6), the game must
deterministically produce, from a seed:

1. A coherent, biome-appropriate layout of Cells and Blocks.
2. A guarantee that the Region is traversable from its entry point(s) to
   its notable content (`01` Pillar 4).
3. A guarantee that every obstacle it places is solvable, and solvable in
   the right order relative to whatever unlocks it (`01` Pillars 1 & 2).
4. A guarantee that no dead end is empty-handed (`01` Pillar 3).
5. A difficulty and content density appropriate to how far this Region is
   from the player's start and how the player has been doing recently
   (`01` Pillar 5).
6. Population — NPCs, decorations, collectibles — placed sensibly, never
   blocking a required route.

This is a generate-and-validate pipeline: build a candidate Region, then
prove the guarantees above hold, repairing locally where they don't.

## 2. Pipeline overview

```
Entropy harvest (06)
        │
        ▼
Biome + mood selection  ──── coherent with neighboring Regions
        │
        ▼
Block assembly  ──── constraint-solve a 5×5 grid of Blocks so that every
        │            shared edge between adjacent Blocks is compatible
        ▼
Chain integrity  ──── rivers/walls/fences that cross Block boundaries
        │             terminate or continue correctly, never dangling
        ▼
Passability enforcement  ──── no cell ends up uncrossable by accident
        │
        ▼
Population  ──── NPCs, decorations, collectibles placed on eligible cells
        │
        ▼
Progression / obstacle placement  ──── locks, keys, quiz gates, chokepoints
        │
        ▼
Validation + repair  ──── prove the guarantees in §1, patch what fails
```

Every stage above operates purely on the flat Cell/Block/Region model from
`03`. None of them import, reference, or reason about anything from the
presentation layer (`05`) — a generation stage that needed to know how a
Block would be *drawn* to decide whether it's *valid* would be a direct
violation of `02`'s principle, and a strong signal something has gone
wrong.

## 3. Biome and mood selection

Each Region is assigned a **biome** (meadow, forest, cave, castle, ...) and
a **mood** (a lighter-weight modifier — river-heavy, fortified, sparse,
...) derived from the entropy pool (`06`) plus a bias toward coherence with
already-generated neighboring Regions (a meadow Region is more likely to
border another meadow Region than an abrupt jump straight to castle). Mood
adjusts *weights* — how likely water-family, wall-family, or open-family
Blocks are to be picked during assembly — it does not hard-force outcomes;
see §9 for a known tension this creates.

Difficulty is derived primarily from **distance from the player's starting
Region**, blended with the player's recent quiz performance (a streak of
correct answers raises the ceiling a little; a streak of wrong answers
softens the next stretch — `01` Pillar 5).

## 4. Block assembly — a 2D adjacency constraint problem

A Region is a 5×5 grid of Block slots. Filling them is a classic
constraint-satisfaction problem, entirely 2D:

- Each Block **archetype** (open clearing, river-straight, river-bend,
  wall-with-gate, fence-enclosure, ...) declares what it presents at each
  of its four sides — a small vocabulary of edge tags (`open`, `wall`,
  `water`, `fence`, `shore`, `gate`, ...).
- Two Blocks may sit next to each other only if their facing edges are
  *compatible* under a fixed compatibility table (e.g. `wall` only ever
  borders `wall` or a wall terminator; `water` only ever borders `water`
  or `shore`).
- The solver picks, for each of the 25 slots, an archetype (and, where
  legal, a rotation/flip of it) such that every shared edge in the grid is
  compatible, using constraint propagation with most-constrained-slot
  ordering, and falls back through a small tier of increasingly drastic
  recovery strategies (targeted local replace → regional restart → full
  Region restart → degrade to open terrain) if it gets stuck.
- A small set of **universal adapter** Blocks (plain open clearings, which
  are edge-compatible with almost everything) exist specifically to
  guarantee the solver can never truly deadlock, which matters even more
  for a chunk-streamed world where a Region's neighbor may already be
  fixed by the time this Region generates.

This is precisely the "edge contract" system from the archived
WorldEngine-02 document — it was already correctly flat/2D in nature (an
edge tag is a purely logical adjacency fact, never a rendering fact), and
is carried forward essentially unchanged. The one thing to be careful of
going forward: an edge tag must never be allowed to smuggle in a rendering
concept (e.g. "this edge presents a *billboard-family* fence" would be
wrong — "this edge presents a *fence*" is the correct level of information;
`05` decides how a fence gets drawn).

### 4.1 Chain integrity

Continuous features (rivers, walls, fences, paths) span multiple Blocks.
After the base grid is solved, a chain-integrity pass verifies every such
feature either continues correctly into its neighbor or properly
terminates (a river ends in a pond, a wall ends in a terminator pillar) —
a chain that just stops mid-Block with no terminator, or a multi-way
junction (a bend, a T, a crossroads) that gets flattened into a single
dead-end stub, is a bug this pass exists to catch and repair by
substituting in a same-family template that matches the cell's real
remaining connections.

## 5. Passability enforcement

After assembly, a reachability pass (breadth-first search from the
Region's entry point(s)) measures how much of the Region is actually
walkable and confirms no unintentional total blockage exists. If openness
falls under a minimum threshold, the pass injects additional walkable
paths rather than rerolling the whole Region.

## 6. Progression and obstacle placement — the lock-key guarantee

This is where Pillars 1 and 2 (`01` §4) get their teeth.

- Obstacles are drawn from a small vocabulary: **quiz gates** (knowledge is
  the key — always resolvable by answering correctly, with unlimited
  retries on a wrong answer), **key-item locks** (a physical key must be
  reachable before the lock), and **tolls** (an amount of a resource, e.g.
  coins, must be reachable before the toll).
- Placement builds an explicit **lock → key dependency graph**: every lock
  placed must have its key (item or knowledge) reachable via some path
  that does **not** itself require passing that same lock. Nested locks
  (a key for lock B sits behind lock A) are allowed as long as the
  dependency order is a genuine DAG with no cycles.
- Quiz gates are deliberately **excluded** from the reachability-ordering
  graph for a different reason: they don't have a "key" to place upstream
  at all — they're always solvable directly, by answering correctly, with
  literally unlimited retries. That's precisely why quiz gates are the
  *preferred* obstacle type for this game (`01` §3) — they turn the
  generic "movement is restricted" mechanic into the specific "answer a
  question to advance" mechanic that is the whole educational point of the
  game, without ever risking a softlock the way a misplaced key-item lock
  could.
- Standalone quiz gates are preferentially placed at genuine chokepoints
  (cells with few walkable neighbors) so they can't be trivially walked
  around — this is an ongoing area of tuning (see `12`/`13`) since a gate
  that's easy to route around defeats Pillar 2 even though it isn't a
  softlock.
- A dead-end reward scan runs after obstacle placement specifically to
  satisfy Pillar 3: any cell that's a genuine dead end (only one walkable
  neighbor, not already rewarded) gets a collectible or NPC.

## 7. Composite assemblies — pre-authored scenes, not emergent chance

Some content is a *recipe*, not an emergent combination of individually
solved Blocks: a homestead with a fence and a gate in a specific,
good-looking arrangement; a general store; a bounded "you must solve this
to proceed" section; a coherent pond (rather than the accidental lattice
of water Blocks a purely per-slot solver can produce when every
water-adjacent slot independently, correctly, picks more water).

The right way to build this kind of content is a **Composite Assembly**
step: the Region/Block-level solver decides *that* a footprint needs a
named scene (e.g. "homestead, 7×7, gate facing south") and *where*, then
hands that recipe to a dedicated sub-solver that selects a matching
pre-authored, hand-tuned template and stamps its entire footprint of Cells
(and any sub-cell gating precision it needs, `03` §3) atomically — the
same way a single Block template is "just placed" today. This keeps
composite scenes visually and functionally coherent by construction,
instead of hoping a generic per-cell solver accidentally produces
something that reads well. See `12` for which composite scenes exist today
versus which are still emergent-and-occasionally-wrong (the pond case in
particular).

## 8. Population

NPCs, decorations, and collectibles are placed after structure is settled,
respecting:

- **Decoration eligibility** (`03` §2) — nothing gets scattered onto water,
  wall faces, or already-occupied cells.
- **Biome-appropriate NPC pools** — which NPC types (and, for merchants,
  which persona/trade goods) are eligible varies by biome, and spacing
  rules prevent, e.g., two wandering merchants from spawning too close
  together.
- **Clearance** — NPCs and decorations avoid narrow corridors where they'd
  visually and functionally block the one path through.

## 9. Known tensions worth naming here (see `12` for full status)

- **Mood bias vs. hard edge constraints**: a "river-heavy" mood only
  *weights* water Blocks more heavily; it cannot override a hard edge
  compatibility rule. In practice this means a strong water mood can
  produce a much higher fraction of water-touching Blocks than intuition
  suggests, because any Block bordering water is *hard*-constrained (not
  just weight-nudged) to also present water on that edge. The fix
  identified for this is the Composite Assembly pattern (§7) — an
  authored, coherent pond/lake template placed atomically — rather than a
  smarter per-slot solver.
- **Standalone quiz-gate "unavoidability"**: gates are correctly guaranteed
  *solvable*, but not always guaranteed *unavoidable* — a player can
  sometimes route around a gate entirely through a different part of the
  Region. This doesn't break Pillar 1 (nothing is a softlock) but it does
  soften Pillar 2 (the world doesn't always successfully make you engage).
  This is a live tuning target, not a guarantee violation — see `13`.

## 10. Where to go next

- `05-Presentation-Layer-Isometric-Rendering.md` — how a generated Region
  of Cells/Blocks becomes the isometric view the player sees.
- `06-LLM-Entropy-and-Procedural-Seeding.md` — where the entropy driving
  biome/mood selection actually comes from.
- `12-Current-Reality-Gap-Analysis.md` — exactly how much of this pipeline
  is implemented today, and where the known tensions in §9 stand.
