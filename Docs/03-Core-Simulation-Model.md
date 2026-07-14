# 03 — Core Simulation Model

**Status:** Canonical. Assumes `02-Architecture-Core-Principle.md`.

This document describes the game's authoritative state and world model —
what the game actually *is*, under the hood — using only flat 2D
vocabulary. If a term in this document ever needs the word "isometric,"
"billboard," "extrude," "carve," or "Z-height render family," that's a bug
in this document: everything here should be describable, testable, and
fully meaningful with the game rendered as a plain top-down grid, a
text log, or not rendered at all.

---

## 1. Coordinate system

The world is an unbounded 2D grid addressed by ordinary `(x, y)` real
numbers. One integer step in `x` or `y` is one **cell**. Entities (the
player, NPCs, wildlife) can occupy fractional positions within a cell —
movement is continuous, not turn-based or grid-snapped — but every piece
of world *content* (terrain, features, items) is addressed at whole-cell
resolution, with one exception described in §3 (sub-cell gating precision).

There is no notion of camera angle, viewport rotation, or projection at
this layer. `(x, y)` is simply "how far east and how far south," full
stop — the same pair of numbers a plain top-down map would use.

## 2. Cell — the atomic unit (Level 0)

A cell is one `(x, y)` grid position. Every cell has:

| Field | Meaning |
|---|---|
| **Kind** | What this cell fundamentally is — a categorical tag: `grass`, `dirt`, `stone`, `water`, `wall`, `fence`, `gate`, `bridge`, etc. This is the single source of truth for what a cell *is*; a presentation layer maps this tag to a drawing technique (`05`), never the other way around. |
| **Walkable** | One of **Open** (freely enterable), **Blocked** (never enterable), or **Conditional** (enterable once some condition is satisfied — see §4). |
| **Surface** | A coarse material category (grass / dirt / stone / water / wood / sand / snow) used for biome coherence, decoration eligibility, and (eventually) footstep sound selection. Independent of *kind* — a bridge's surface is wood even though its kind is "bridge." |
| **Item** | An optional collectible occupying this cell (a coin, a key, a potion) — present or absent, with an item-type tag. |
| **NPC** | An optional reference to an NPC entity standing here (see §5). |
| **Decoration-eligible** | A small set of flags saying what can be scattered onto this cell during population (flowers, ambient effects) — purely there to stop the population step from putting a flower in the middle of a river or an NPC inside a wall. |

Nothing above mentions height, Z-mode, or a drawing technique. A cell's
*kind* is the only thing a presentation layer needs to decide how to draw
it — see `05` §2.

### 2.1 Why "kind" carries the weight, not a bag of booleans

Earlier design iterations (see `archive-2026-07-14/WorldEngine-01-
SpatialHierarchy.md` §3.1) proposed a fairly large fixed metadata contract
per cell (edge-connector tags per side, variation-family references,
height profile, etc.). Those remain reasonable *implementation* choices
for the generation solver (`04`) to use internally, but they are not
promoted to "the model" here — the model only needs to guarantee that
*kind* + *walkable* + *surface* are enough for any gameplay system
(collision, quiz-gating, population) to make a correct decision without
ever asking "how tall does this look" or "which render family is this."

## 3. Sub-cell gating precision (Level 0.5)

Some features need finer-than-one-cell precision to gate correctly — the
canonical example is a gate embedded partway along a fence line, or a
narrow bridge crossing only part of a river cell. The flat model handles
this with a small, purely-logical sub-division: each cell may optionally
declare a **3×3 occupancy grid** — nine named sub-positions (`NW N NE / W
C E / SW S SE`) — describing *which parts of the cell* are Open, Blocked,
or Conditional, when "the whole cell is one uniform state" isn't precise
enough.

This is the *only* surviving idea from the old "Nano tile" concept — and
notice what's missing from it, deliberately, compared to
`archive-2026-07-14/WorldEngine-01-SpatialHierarchy.md` §3.2.3's version:
**no Z Mode, no Render Family, no Z Offset, no Blend Policy, no Visual
Asset Contract, no Stack Ordering Policy.** A sub-cell occupancy grid is
pure gameplay data — "which ninth of this cell can a player's foot be in
right now" — and it is exactly as meaningful in a plain top-down
presentation as an isometric one. How a presentation layer chooses to
*draw* a feature that happens to use sub-cell precision (e.g. drawing a
fence as an upright Z-pinned billboard) is entirely `05`'s business, keyed
off the cell's *kind*, never stored here.

A cell that doesn't need sub-cell precision simply omits this grid and
uses its single whole-cell **Walkable** value; most cells do.

## 4. Conditional walkability — the progression-gating primitive

**Conditional** is the one walkability state that does real work for the
game's core loop (`01` §3, Pillar 2). A conditional cell (or conditional
sub-cell region) carries:

- A **condition kind** — `quiz`, `key-item`, `toll`, or similar.
- A **condition payload** — e.g. which item id unlocks a `key-item` gate,
  how many coins a `toll` needs.
- A **resolved flag** — once satisfied, the cell (or sub-cell region)
  becomes Open permanently for the remainder of the session (and this
  persists in the save — see `11`).

World generation (`04`) is responsible for guaranteeing that every
condition it places is satisfiable by the time the player reaches it (the
lock-key dependency ordering — see `04` §6) — this document only defines
the *shape* of the primitive, not the guarantee, which lives in `04`.

## 5. Entities

Entities are things with a position that can move or be interacted with,
distinct from static cell content:

- **Player** — position (`x, y`, continuous), inventory, status (energy,
  hydration, etc. — see `08`), quiz/streak state, cosmetic customization.
- **NPC** — position, a persona (a small bundle of dialogue, quiz bias,
  and — for merchants — a trade list), and simple behavior state (idle,
  wandering, fleeing).
- **Wildlife** — position, species, and a lightweight behavior state
  machine (wander/flee/idle) — see `08`.

Entities are never part of a cell's own data; a cell's optional **NPC**
field (§2) is a reference, not ownership — the entity's real state lives
in the entity list, keyed by id, so it survives independently of which
cell it's currently standing in.

## 6. Spatial scale hierarchy — Cell → Block → Region

World generation and population reasoning operate at a few different
zoom levels. These are **pure area sizes**, not rendering concepts:

| Tier | Size | Purpose |
|---|---|---|
| **Cell** | 1×1 | The atomic unit (§2). |
| **Block** | 5×5 cells | The smallest unit of *designed local structure* — a river bend, a wall-with-gate, a fenced clearing. Small enough to author and test by hand; large enough to contain a real internal shape. (Called "World Unit" in the archived docs — same size, same role, renamed here to avoid any lingering association with the old schema's rendering baggage.) |
| **Region** | 5×5 blocks = 25×25 cells | The unit of regional coherence and progression pacing — a "chapter" of world: one biome/mood, one difficulty band, one guaranteed-traversable playable area. (Called "Macro Tile" in the archived docs.) |

A **chunk**, in the current engine, is the streaming/loading unit — the
piece of world generated and cached together when the player crosses its
boundary. As of the current code, a chunk is sized to exactly one Region
(25×25 cells) — see `12` for confirmation this alignment has already
landed in practice, which is a genuinely good sign for how naturally this
model fits the existing engine.

None of Cell, Block, or Region carries any notion of camera projection,
draw order, or visual composition — see `04` for how they're built
(entropy → biome → structure → progression → population) and `05` for how
a Region's worth of cells eventually becomes pixels.

## 7. Authoritative game state — shape, not implementation

The single source of truth for a running session is one state object,
covering (at the level of detail this document cares about — see `11` for
the exact save-file contract):

- **Player**: position, inventory, status/injury, customization, quiz
  streak history, played time.
- **World**: which Regions are currently loaded, their cell/entity data,
  which conditional cells have been resolved, discovered wildlife, visited
  cells (fog of war), NPC interaction history.
- **Progression/knowledge**: Book of Knowledge read/saved-word state,
  cosmetic unlocks earned.
- **Entropy**: the current LLM-derived seed/wordlist buffer (`06`).
- **Ephemeral UI/interaction state**: active dialog, active quiz, active
  trade — deliberately *not* part of the save (see `11`).

This is a description of *shape*, deliberately not a field-by-field
mirror of `GameState` in `src/game/game-state.ts` — the real type
definition is the implementation, and will drift in exact field names over
time; this document should stay true as long as the *categories* above
remain accurate. See `12` for how closely the current implementation
matches this shape today.

## 8. Determinism

A Region regenerates identically from its seed every time the player
re-enters it after it's been unloaded — Regions are **not** stored
wholesale in the save; only their *resolved* deltas are (which conditional
cells were unlocked, which items were collected — see `11`). This is
load-bearing: it's what keeps save files small and what keeps "the same
seed always produces the same world" true, which in turn is what makes the
whole entropy-driven generation system (`06`) trustworthy rather than
chaotic. Determinism is a property of the flat simulation model
exclusively — nothing about the presentation layer participates in or
affects it.

## 9. Where to go next

- `04-World-Generation-Design.md` — how Cells, Blocks, and Regions actually
  get built from entropy, and how progression gating is guaranteed solvable.
- `05-Presentation-Layer-Isometric-Rendering.md` — how this flat model
  becomes the isometric view the player actually sees.
- `11-Save-State-and-Persistence.md` — the exact save-file contract.
