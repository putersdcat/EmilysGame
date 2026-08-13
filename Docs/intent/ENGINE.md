# The intended engine

The engine exists to keep a child’s short session **solvable, paced, and
the same when she comes back**. It is not a pile of files. It is the
spatial grammar, the walk fact, the generator that cannot softlock, the
entropy tap, and the save of mutations.

Do not copy old modules, class names, or solver pseudocode forward.
Recovered intent is below. Failed names are listed only so a rewrite does
not resurrect them as sacred.

---

## 1. What the engine must guarantee

From WorldEngine-05 §7, promoted to whole-game pillars in `Docs/01`:

1. **No softlocks.** Every lock has a reachable key (item, coins, or a
   learnable answer). Quizzes retry forever.
2. **Movement is blocked only by things play can open.** A painted gate
   that is not a gate is worse than no gate.
3. **No dead end is empty.** A cul-de-sac has a coin, a person, or a
   scenic beat.
4. **Every region is traversable.** Entrance to notable content / exit is
   proved, not hoped.
5. **Progression is paced.** Distance from spawn plus streak (correct
   raises ceiling; wrong *softens*).
6. **The world is learnable.** Every quiz has a Book article and a
   factually correct answer.

Add the owner’s 2026-07-20 refinements:

7. **Home is not an exam.**
8. **A teaching gate has a speaker.**
9. **Opening is real.** Correct answer / used key / paid toll changes
   the walk fact. The child can pass.

These are engine responsibilities. Rendering cannot paper over them.

---

## 2. Spatial hierarchy (the grammar)

The world is a **tile grammar**: a small library of well-tested pieces
composed under contracts, not a field of independently random cells.

Four tiers, from
`Docs/archive-2026-07-14/WorldEngine-01-SpatialHierarchy.md`
(which refined `archived-planning/Visual Mapping and Tile Asset Generation.md`
and GitHub #6):

| Tier | Footprint | Answers |
|------|-----------|---------|
| **Micro** | 1×1 cell | What is the ground here? |
| **Nano** | 3×3 patches *inside* one micro | What feature sits on, through, or under this ground, and exactly where? |
| **World unit** | 5×5 micros + nano plan | What local motif is this (river stretch, gated wall, yard)? |
| **Macro** | 5×5 world units (25×25 micros) | What chapter is this (enter, cross, gate, reward)? |

### 2.1 Micro

The atomic terrain and the bottom of collision. Every micro carries:

- **Traversal class:** walkable / blocked / conditional / hazardous
  (hazard reserved, schema must allow it).
- **Height profile** (0–10): draw order, shadows, enclosure feel. Not a
  second physics.
- **Per-side edge connectors:** open, wall, water, fence, shore, gate, …
- **Surface type:** grass, dirt, sand, stone, water, wood, snow, …
- **Decoration eligibility:** can host flowers / NPC / item / effect, or
  cannot decorate.
- **Variation family:** many looks, one logic.

A boolean `walkable: false` that conflates “rock” with “locked door” is
a failed schema. Conditional must be first-class.

### 2.2 Nano

Nano does **not** grow the XY cell. It subdivides it so a fence can hug
the west edge, a wall can occupy a center strip, a river can carve the
whole cell, and a bridge can stack over that river.

Families (Iso2 + WorldEngine-01 §3.2):

- Positive-Z billboard: fence, gate, tall grass, thin uprights.
- Positive-Z extruded box: stone / cathedral / homestead walls.
- Negative-Z carve-out: river, river-bank.
- Flat: decals, worn path, crop rows.

Each nano declares: kind, which of the 9 patches it occupies, anchor
patch, Z mode and offset, **walkability rule** (always / never /
conditional), connectivity variant (straight / corner / tee / end / …),
blend policy, legal stacks.

Legal stack example: river (negative) + bridge (positive).
Illegal default: wall + river in the same patches with no adapter.

**This is world data.** It is not a renderer-only trick. Population,
pathfinding, and “can I stand at this door” all read it.

Current law (`AGENTS.md`) agrees: Z-height structures are real venues,
not paint. The 2026-07 `Docs/02` “iso is only a draw trick” restatement
is recorded as a contradiction, not as the rewrite spec.

### 2.3 World unit (the word)

5×5 was chosen so a wall-with-gate has approach room on both sides, a
human can author it, and it composes into a 25×25 chapter.

A world unit is **designed intent**: meadow clearing, river bend, fence
enclosure with one opening, bridge over river, treasure pocket, NPC
station.

It declares:

- Base micros + **nano overlay plan** (which patches, which kinds).
- Traversal mask (authoritative, includes nano overrides).
- **Movement channels** (N–S bridge over E–W water is a channel, not
  “some cells happen to be true”).
- Border edge signatures (MVP: one dominant tag per side; target: 5-tag
  vector).
- Transform permissions (rotate / flip / constrained).
- Connectivity class: river chain, wall chain, fence chain, path,
  enclosure, terminal, standalone.
- Named anchors: spawn, gate, NPC, scenic.
- Minimum openness (a promise, not a computed surprise).
- Biome affinity.

MVP vocabulary from Visual Mapping + WorldEngine-01: meadow, rock wall,
river straight/bend/end, gate wall, bridge. No diagonals in the first
cut. Chains terminate (pond, rock pile) — no infinite walls.

**Named places are recipes, not improvisation.** Homestead, inn, cart
yard, pond, gated wall, treasure pocket are stamped **whole**. The
macro says “homestead here, gate south.” An assembly lays the
footprint. Generic fill does not nibble the interior after. Entropy
picks *which* recipe, never the nanos of a cottage. That is also how
you get a pond instead of a water lattice.

— WorldEngine-03 §6.7; `ARCHITECTURE.md` §6

**No barrier without function.** An enclosure declares its openings.
A one-cell hole in a fence is sealed with fence, not turned into a
quiz. Spawn distance 0 has **no locks** (WorldEngine-05 §9.1).

### 2.4 Macro (the paragraph)

A macro is a playable chapter. It assembles world units so that:

- Neighbor contracts hold.
- Declared route corridors exist (full / gated / none).
- Chains continue or terminate; they do not vanish at a border.
- Difficulty and density match biome × distance.
- Variety: not a 5×5 of identical meadow.

It records entrances/exits, progression landmarks (gate corridor, key
region, NPC checkpoint, safe pocket, reward cluster), and solver
confidence (debug only).

### 2.5 Streaming and the chunk question

The Bible: 1024×1024 cells, 32×32 lazy chunks, wrap optional.
WorldEngine: macros are 25×25. Those sizes do not align.

Intent, not a sacred number:

- Generate **forward only**. Already-generated neighbors are hard
  constraints. Never rewrite a place the child has already walked.
- Cache and save assume that one-way rule.
- Chunk size for loading/painting may differ from macro size for
  *thinking*. WorldEngine Option B: macros are a generation overlay;
  the runtime may still page in whatever paint chunks it wants.

See `CONTRADICTIONS.md` for 32 vs 25 vs 1024.

---

## 3. Walk is a world fact

Walkability is the same fact for generation, movement, NPCs, and the
child’s eyes.

Rules recovered from the addendum, #151, #223, WorldEngine-01/02:

- The logical map is 2D (cell + nano patches). Orthogonal first.
- **Owner, Copilot Chat 2026-04-30 (this is the contact law):** every
  ninth of a micro that is *not* occupied by a nano with Z-height is
  walkable. A wall down the center third leaves the inner and outer
  thirds free. The child hugs the wall in the **adjacent** nano, not
  the next whole micro. Collision bounds to that leftover space. That
  is how a wall *becomes* a wall.
- A cell’s walk answer is: parent micro traversal **overridden by**
  nano rules on the patches the body occupies.
- Fence / solid wall: never.
- Deep river without a crossing: never.
- Bridge deck: always (the *gap* is the river; the *deck* is the path).
- Gate: conditional. Locked is never; unlocked is always. The unlock is
  a mutation in world state, not a HUD flag the mover forgets to read.
- “Near” a solid is allowed. Hitboxes are tighter than the painted
  silhouette so the child can stand at a door or along a fence without
  a wide berth.
- Approach from every cardinal must agree with the visible edge. A
  water line that can be entered from the north only is a broken fact.
- Decorations do not block. If a flower would look like a boulder, the
  art is wrong — do not silently make it a wall.

Pathfinding (BFS for generation and for any helper) reads this **same**
map. A second “paint walk” and a third “inspect walk” is how the old
tree lied.

What walk is *not*:

- A FOV constant.
- A sort key.
- A screenshot oracle.
- Dual stacks that almost agree.

---

## 4. Edge contracts

Two pieces sit together only if their shared border is compatible on
every dimension that matters:

1. **Surface** — water meets water or shore; wall meets wall or cap;
   open meets open / shore / path / gate face.
2. **Traversal** — a through-channel on this side is met by a
   through-channel (or a declared closed side with a route around).
3. **Height** — MVP loose; no 0-to-cliff jumps without a cap.
4. **Chain semantics** — a river that enters must leave or terminate.
5. **Nano continuity** — fence runs, wall corners, river beds, and
   stacks stay continuous across the cell border. A corner gap in a
   stone wall is a contract failure, not a shader bug.

Corners: at most two surface types; no diagonal-only “pinch”; chains
do not jump diagonally.

Streaming: existing tile wins. New tile adapts. Universal adapters
(open clearing, shore) exist so generation cannot stall.

Constraint propagation (possibility sets shrinking as neighbors lock)
is the *idea*. The AC-3 writeup in WorldEngine-02 is a method, not a
required class. A rewrite may use any solver that honors the contracts
and the budgets (do not hang the frame).

— `Docs/archive-2026-07-14/WorldEngine-02-EdgeContracts.md`; GitHub #42

---

## 5. Generation pipeline (intent)

When the child approaches unknown land, the engine produces one chapter.

Phases from WorldEngine-03, stated as jobs not modules:

1. **Entropy harvest** — a string for this macro coordinate, from the
   session wordlist ± LLM elaboration, or a hash fallback.
2. **Theme** — biome, mood, difficulty. Adjacent macros prefer the same
   biome (contiguous regions, not a checkerboard). #260 restates this
   from a live screenshot: per-cell grass/dirt/sand scatter is a
   failure. Regions are large and transition gradually.
3. **Boundary collection** — hard edges from neighbors already born.
4. **Assemble the 5×5 of world units** — bias from entropy, then
   boundaries, then chains, then fill. Prefer most-constrained first.
5. **Fill micros, resolve nanos, auto-tile looks.**
6. **Check chains** at cell scale (no floating wall, no vanishing river).
7. **Place progression** — locks that the templates asked for; keys in
   already-reachable regions; quiz difficulty from distance + streak.
8. **Populate** — NPCs, coins, decorations, shop inventories. Respect
   nano occupancy (do not put a chest on a fence strip).
9. **Prove playability** — BFS entries→exits treating unsolved locks as
   walls; DAG of keys before locks; dead-ends have a treat. Repair by
   swapping a unit or carving a path. If repair fails, degrade to a
   still-walkable open fill — never ship a trap.
10. **Hand the immutable chapter to paint and to save.**

Bible playability numbers that still make sense as *budgets*, not
magic: roughly 40–60% open at local scale; door implies a nearby key;
river implies a bridge or a way around.

A bridge is a **bank-to-bank span** (land → water → land). A deck that
starts or ends in the river is a generation bug, still open as #264 /
#260. Walk and paint agree: deck always, water never.

#100 (closed, still the law): water is impassable in every biome;
every river barrier has at least one valid crossing; carving / BFS
repair must **not** punch walkable holes in water to “fix” openness.

Walk-rule priority when several nanos stack (#208): **locked
conditional beats always beats never** — a locked troll-toll cannot
be walked because a river under it said `always`. See
`CONTRADICTIONS.md` for troll-bridge locked vs always-walkable.

Failure recovery order (WorldEngine-02 §7): replace the last bad piece →
restart a small neighborhood → reroll the macro with a salted seed →
degrade to open terrain. Time-box so the child never stares at a freeze.

---

## 6. LLM entropy (not a chatbot)

The novel mechanic: a local LLM is a **creative RNG**. It emits
nonsense. Code hacks that text into seeds. The child never sees the
raw nonsense as authored story.

— `archived-planning/NewGame_LlmEntropyAddendum.md`; GitHub #4; Bible

### 6.1 Session wordlist

At new game, one prompt: 50 absurd verb–noun pairs, each longer than
10 letters (“obliterate quasar”). Stored as the world seed. Shareable.

### 6.2 Play authors the next place

Movement at a chunk edge picks a direction pair (up ≈ ascend/flux,
down ≈ descend/abyss, …). Chat words the child typed can join the
table. The pair is elaborated into 1–2 surreal sentences (or hashed
if the model is slow). That text is the entropy for the new macro.

Correct quizzes / collectibles may append pairs (“triumph glory”).
NPC chat keywords flow back into the pool. The world *evolves* with
play and still replays identically from the saved wordlist + action
log / coordinates.

### 6.3 Hacking (intent)

Turn text into numbers without NLP:

- Hash the text. Chunks of hex become noise seed, densities, types.
- ASCII sums pick biome-ish parameters.
- A growing session buffer can be read as flags.

Then **rules win**. Hash never places an unsolvable lock. Hash never
opens a gate. Hash never scores a quiz.

### 6.3a Call the model once (owner #26)

The 50-pair wordlist is **one startup call**, then hashed. Tests and
dev loops must not re-hammer BitNet (queue → ~1.5 tok/s on the 4-core
i7). Bundle ~10 saved wordlists as assets. If tokens/sec drop (show
on F3), cut over to a bundled list. Playwright / `?test=1` never
touches the live model.

NPC chat may use a **short context session**, then close it so the
local server can drop the KV cache. Entropy prompts stay context-free.

### 6.4 When there is no model

Bible and entropy addendum: if inference takes more than ~1–2 seconds,
fall back to a typed RNG / hash of the pair so generation never blocks.

PoC addendum later said “always require an LLM; no static fallback.”
That contradicts the playable-offline, child-on-a-laptop goal. Recorded
in `CONTRADICTIONS.md`. Recovered intent: **fallback exists**; the LLM
is preferred for flavor clustering, not required to walk.

Endpoint is configurable (local BitNet / OpenAI-compatible / remote).
WASM-in-browser model was an idea, then deferred (#45, epic #247).
A rewrite may pick any local-or-remote client. It may not make the
LLM the rules engine.

Two LLM jobs must stay separate (#8):

- **Entropy / flavor** (play).
- **Content authoring / rephrase** (offline packs, human-reviewed).

---

## 7. Progression as a DAG

Locks and keys are a directed acyclic graph rooted at spawn.

- Build the free region: BFS from entries, stop at unsolved locks.
- Every lock on that frontier must have its key inside the free region
  (or be a quiz / toll whose *opportunity* already existed: enough
  coins in reachable space, a Book article in the library).
- Opening a lock expands the region. Repeat.
- Cycles fail generation.

Strategies the design allows (WorldEngine-05 §3.4):

- **Forward:** templates place locks; solver drops keys behind her.
- **Critical path:** locks on the way to the exit; keys in side branches.
- **Nested:** 2–3 layers max per chapter (key1 opens area of key2).

Quiz “keys” are knowledge. Early = recall; later = Book use.
Biome character (WorldEngine-05 §9.2):

- Meadow: open, kind people, visible coins, few locks, mostly tolls.
- Forest: denser, key/door begins, some hiding off-path.
- Cave: corridors, guardians, nested locks, richer loot.
- Castle: rooms, multi-gate sequences, best rewards.

Bible biome ladder: Forest → Cave → Castle, with 10–20% wildcards
(impassable reroutes, unguarded hoards, mystery shops). Meadow as the
spawn welcome is a later, better reading of the same ladder.

---

## 8. Population

After structure exists, the engine places lives and loot.

- **Keys / crowbars:** exactly one per matching lock, in the free region,
  not pixel-hunted.
- **Coins:** density by biome; trails along channels; dead-end treat.
- **Merchants / villagers / guardians:** anchors + clearance + spacing.
  An NPC occupying a cell makes that cell non-walkable at runtime, so
  they must not plug the only corridor.
- **Decorations:** clusters of 3–7, biome palette, never on interactables,
  never blocking a required route.

Nano occupancy is a second filter: a grass micro with a fence strip
down the middle is not a legal chest cell.

Streak feeds the next chapter’s quiz difficulty and generosity.

---

## 9. Save

Serialize:

- Wordlist / session seed (and enough to rebuild entropy chaining).
- Player position, inventory, status (survival-lite), word bag,
  subjects, age band, customizer.
- Mutations: collected ids, opened gates, spent keys, NPC talk /
  quiz history, read articles, fog / visited (FoW **defaults off**
  in play — #131).
- Slot metadata (timestamp).

Do **not** require dumping the whole grid. Terrain is a pure function
of seed + coordinates; load = regenerate + apply mutations.

localStorage first; IndexedDB if chunks get large. Auto-save on chapter
exit. Manual slots 3–5.

---

## 10. Runtime loop (jobs, not files)

The Bible’s module list is a job list:

- Tick input (keyboard / touch), move against the walk fact, interact.
- If the child nears unknown land, generate asynchronously (worker)
  without freezing the frame.
- Resolve interact: pick up, talk, trade, quiz, open, rest, drink.
- Apply survival-lite drains slowly; never lethal.
- Persist mutations.
- Ask the presentation layer to draw the current facts.

Target hardware in the Bible: 8th-gen i7, 16 GB, GTX 1050, browser.
60 FPS, frame work small enough that generation is off the hot path.
`<10 ms` paint was the PoC budget (#3). Iso2 asked 60 FPS with chunk
bake (#214). Those are feel budgets, not a WASM mandate. WASM as a
sorter/accelerator was deferred (#45, #247).

---

## 11. Names the rewrite should not treat as sacred

These existed. They are not the spec.

- `WorldUnitSolver`, `FOV 128×64`, dual walk stacks, `barrier-geometry`
  as a second SSOT, inspect stubs as proof, `sortKey = y + height/2`
  as gameplay, “iso2 is paint only,” god-file line-count campaigns,
  closed-campaign “landed” tables, Playwright `?test=1` as playtest.

A rewrite may use a spatial hierarchy, a walk fact, contracts, a
pipeline, entropy, and a save. It may not port the old functions that
claimed to be those things.

---

## 12. Smallest engine that is still this game

Enough to support `GAME.md` §13:

- Micros with real traversal classes.
- Nanos that can be a fence run + a gate + a cottage apron.
- One homestead world unit and one other place unit.
- Contracts good enough that the gate sits in the fence.
- BFS + one lock/key or quiz unlock that mutates walk.
- Seed + mutation save.
- Entropy can be a hash for the first playable; LLM tap next.

That is an engine. The rest of the library grows when those facts stay
true in a child’s hands.
