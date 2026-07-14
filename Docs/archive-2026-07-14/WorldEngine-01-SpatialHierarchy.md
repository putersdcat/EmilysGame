# Emily's Game — World Engine: Spatial Hierarchy and Tile Grammar

## 1. Overview

The world of Emily's Game is built from a four-tier spatial hierarchy. Each tier serves a distinct purpose in the generation pipeline, and together they form a **tile grammar** — a formal system of composable, rule-governed pieces that can produce vast, varied, and coherent worlds from a small set of primitives.

The four tiers are:

- **Micro Tiles (L0)** — The atomic terrain and logic unit. One grid cell. The thing that answers "what is the ground here?"
- **Nano Tiles (L0.5)** — A 3×3 sub-grid overlay tier attached to one micro tile. The thing that answers "what feature lives on, through, or above this ground, and exactly where inside the tile does it sit?"
- **World Unit Tiles (L1)** — A 5×5 composite of micro tiles and their attached nano overlays. The building block of local structure. The thing that creates recognizable shapes.
- **Macro Tiles (L2)** — A 5×5 composite of world unit tiles (25×25 micro tiles total, plus their nano plans). The unit of regional coherence. The thing that creates a playable area.

The important nuance is that the nano tier is a true tier in the grammar even though it does **not** increase the outer XY footprint of the parent cell. Instead, it subdivides each micro tile into a **3×3 nano grid** — nine addressable 1/9 patches — so the engine can place sub-micro features with intent. That is the whole point of the tier: preserve the simplicity of the micro grid while giving the solver and renderer a finer placement lattice for local feature composition, precise anchors, and visually convincing structures in the Z axis.

This document defines each tier exhaustively: what it is, what metadata it carries, what rules govern its construction, how it relates to the tiers above and below it, and how it participates in the generation and rendering pipelines.

---

## 2. Design Philosophy

### 2.1 Composability Over Uniqueness

The system does not attempt to generate every cell from scratch. Instead, it composes large structures from a library of small, well-defined, well-tested pieces. A river is not "a bunch of water cells that happened to line up" — it is a chain of pre-authored world unit tiles that guarantee visual and logical continuity. This is the difference between accidental coherence and designed coherence.

### 2.2 Metadata Is the Real Product

The visual appearance of a tile is almost an afterthought compared to its metadata. A micro tile's traversal class, height profile, edge connector signature, surface type, and decoration eligibility tags are what make the world engine work. A nano tile's z-mode, z-offset, variant, 3×3 patch occupancy, anchor patch, walkability rule, and connection signature are equally important. The SVG is just the final cosmetic expression of a rich data contract. Every generation decision, every solver constraint, every rendering optimization operates on metadata, not pixels.

### 2.3 Constrained Variation

Variation must be controlled. An unconstrained random generator produces noise. A fully constrained template produces monotony. The art is in the space between: define hard rules that prevent nonsense (water next to wall with no transition), soft biases that encourage character (meadow biome favors grass and flowers), and just enough randomness to prevent recognition of patterns.

### 2.4 Scale-Appropriate Reasoning

Each tier of the hierarchy is the right level of abstraction for certain kinds of reasoning:

- **Micro** is the right level for: base terrain, collision substrate, surface identity, auto-tiling transitions
- **Nano** is the right level for: continuous feature expression, 3×3 sub-tile occupancy, precise placement of sub-micro elements, local height simulation, gates/bridges/barriers, and overlay-specific walkability
- **World Unit** is the right level for: local structure (corridors, clearings, barriers, crossings), edge matching, feature anchoring
- **Macro** is the right level for: route planning, progression pacing, biome coherence, difficulty distribution

Trying to reason about routes at the micro level or about pixel rendering at the macro level creates unnecessary complexity. Each tier should own its concerns.

---

## 3. Tier Definitions

### 3.1 Micro Tile (L0)

#### 3.1.1 What It Is

A micro tile is a single cell in the world grid. In the current engine, this is a 32×32 pixel source SVG that gets projected to a 64×32 pixel isometric diamond on screen. A micro tile represents the smallest unit of terrain, obstacle, or structural element that a player can stand on, be blocked by, or walk past.

Micro tiles never exist in isolation in the finished world — they are always part of a world unit tile. However, they are independently defined, independently rendered, and independently queryable. The player's collision check ultimately bottoms out at the micro tile level. The renderer's smallest cacheable visual unit is the micro tile.

#### 3.1.2 Required Metadata

Every micro tile definition must carry the following metadata. This is not optional — omitting any field breaks some part of the generation, solving, or rendering pipeline.

**Traversal Class**
Describes how a player (or NPC, or pathfinding algorithm) interacts with this cell.

- *Walkable* — The player can freely move through this cell. Grass, dirt, flowers, open floor.
- *Blocked* — The player cannot enter this cell under any circumstances. Rock, deep water, solid wall.
- *Conditional* — The player can enter this cell only if a condition is met. A locked door (requires key), a toll gate (requires coins), a barricade (requires crowbar). The condition is stored separately in the cell's interaction metadata. The micro tile definition only declares "I am conditional."
- *Hazardous* — The player can enter but takes a penalty. This is reserved for future expansion (lava, thorns, poisonous swamp) but the traversal class must support it from the start to avoid schema changes later.

**Height Profile**
A numerical value (0–10 scale) describing the visual and logical elevation of this tile above the ground plane.

- 0: Flat ground (grass, dirt, water surface, floor)
- 1–2: Low obstacle (mushroom, small rock, flower pot, bridge deck)
- 3–4: Medium obstacle (bush, fence, chest, small NPC)
- 5–7: Tall obstacle (wall, door, tree trunk, large NPC)
- 8–10: Very tall (full tree with canopy, tower, tall cliff face)

Height governs draw order (south-and-tall objects draw last to occlude north-and-short objects), shadow casting (taller objects cast longer shadows), and visual density perception (a room full of height-8 objects feels enclosed; a field of height-0 tiles feels open).

**Edge Connector Signature**
Four values (north, south, east, west) describing what this micro tile "presents" at each of its four borders. This is the foundation of the edge contract system described in Document 02.

Each edge connector is a typed tag drawn from a controlled vocabulary:

- *Open* — This edge presents nothing special. Compatible with other open edges, grass, dirt, floor.
- *Wall* — This edge presents a wall face. Must connect to another wall or a wall terminator.
- *Water* — This edge presents a water surface. Must connect to another water tile or a water terminator (shore, bridge).
- *Fence* — This edge presents a fence segment. Must connect to another fence or a fence terminator (post).
- *Shore* — This edge presents a water-to-land transition. Compatible with water on the water side and open on the land side.
- *Gate* — This edge presents a gate or door face. Compatible with wall on adjacent sides and open/conditional in the passage direction.

The vocabulary will expand as new terrain types are added, but the system must support an arbitrary number of edge types without schema changes.

**Surface Type**
A categorical label describing the "material" of this cell's ground surface. This governs:

- Which biome this tile belongs to naturally (grass = meadow, stone = cave/castle)
- Which decoration sprites can be placed on top of it (flowers on grass, crystals on stone, lilypads on water)
- Which sound effect plays when the player walks on it (future feature)
- Which auto-tiling transition set is used when this surface meets a different surface

Surface types include: grass, dirt, sand, stone, water, wood (bridge deck, floor boards), snow, lava (future).

**Decoration Eligibility Tags**
A set of boolean flags or tag strings indicating what kinds of overlay elements can be placed on this micro tile during the population phase:

- *Can host flowers* — Small decorative sprites (🌼, 🌸, 🌺)
- *Can host NPC* — A non-player character can stand here
- *Can host item* — A collectible or interactive object can be placed here
- *Can host effect* — Particle effects or ambient animations can play here (fireflies, sparkles)
- *Cannot decorate* — Nothing should be placed on top of this tile (water surface, wall face, already-full structural elements)

These tags prevent the population solver from placing a treasure chest in the middle of a river or an NPC inside a wall.

**Variation Family Reference**
A string identifier linking this micro tile to its family of visual variants. Multiple micro tiles can share identical metadata but have different SVG appearances. For example, "grass_variant_a" through "grass_variant_d" all have the same traversal class, height, edge connectors, surface type, and decoration eligibility — but they look different. The renderer picks among variants for visual diversity without affecting game logic.

The variation family also governs auto-tiling: when computing terrain transitions, the engine needs to know that `grass_variant_a` and `grass_variant_c` are "the same thing" for edge-matching purposes even though they have different asset keys.

#### 3.1.3 Current State vs. Target State

The current engine defines 8 micro tile types in `src/tiles.ts` (grass, dirt, rock, water, stone_wall, bridge, door_gate, wooden_fence) with basic metadata in `src/config/tiles.config.ts`. The metadata includes walkable, edgeTag, height, and connectable fields.

Gaps to close:
- No traversal class distinction between blocked and conditional (both are `walkable: false`)
- No separate surface type field (inferred from tile type name)
- No decoration eligibility tags (population currently ignores tile suitability)
- No variation family system (each tile type has exactly one visual)
- Edge connector is a single tag per tile, not per-side (all four sides present the same tag)
- No shore or gate-specific edge types
- No hazardous traversal class

---

### 3.2 Nano Tile (L0.5)

#### 3.2.1 What It Is

A nano tile is a modular **3×3 overlay grid** attached to exactly one parent micro tile. Each micro tile is subdivided into nine addressable nano patches:

```text
NW | N  | NE
---+----+---
W  | C  | E
---+----+---
SW | S  | SE
```

Each patch is a 1/9 sub-cell of the parent micro tile. Nano features may occupy one patch, several patches, or all nine patches depending on their geometry. This does not increase the outer XY footprint of the micro tile, but it gives the engine a finer lattice for placing features with intent.

That finer lattice is the reason the nano tier exists. Without it, every fence, wall strip, bridge deck, wall-hugging player anchor, gate opening, tall-grass tuft, and river carve-out must either be baked into a whole-tile terrain asset or approximated crudely at cell granularity. With the nano grid, the engine can target sub-micro placement precisely, compose multiple features on the same parent cell, and build visually coherent structures in the Z axis while keeping the base biome terrain stable.

In practical terms, the micro tier answers "what is the underlying ground?" while the nano tier answers "what feature occupies or modifies this ground, which of the nine nano patches does it occupy, and how does it rise above or sink below the ground plane?" A meadow cell can remain a grass micro tile while also carrying a river carve-out, a bridge crossing, a fence run, or a wall segment precisely aligned within its 3×3 overlay.

A micro tile may host zero nano content, or one or more nano elements when composition requires it. The canonical example is a negative-Z river carve-out with a positive-Z bridge crossing over it. Stacking is part of the authored/generated world data, not a renderer-only trick.

#### 3.2.2 Render Families and Spatial Behavior

The formal issue definitions from the Iso 2.0 work establish four practical nano families:

- **Positive-Z billboard nanos** — Z-pinned upright billboards aligned to the left isometric axis. Used for thin upright features such as fences, gates, bridges, troll-bridges, and tall grass.
- **Positive-Z extruded nanos** — Three-face isometric boxes with an end cap, front face, and top cap. Used for solid structural features such as stone walls, cathedral walls, and homestead walls.
- **Negative-Z carve-out nanos** — Sunken features rendered below the surrounding ground plane. Used for rivers and river-bank transitions.
- **Flat nanos** — Ground-hugging overlays that alter appearance or semantics without introducing meaningful height. Reserved for decals, trims, and future surface-detail constructs.

These families all resolve over the same parent-cell 3×3 nano lattice, but they behave very differently in rendering, collision, walkability, and edge contracts. That difference is exactly why nano tiles must be a first-class construct in the world grammar.

#### 3.2.3 Required Metadata

Every nano tile definition must carry the following metadata.

**Kind**
The semantic identity of the feature. The initial vocabulary should include at minimum: `stone-wall`, `cathedral-wall`, `homestead-wall`, `fence`, `gate`, `bridge`, `troll-bridge`, `river`, `river-bank`, and `tall-grass`.

**Nano Grid Footprint**
The nano tile must declare which of the nine nano patches it occupies within its parent micro tile. This is how the engine distinguishes a wall strip through the center of a cell from a fence along the west edge, a bridge crossing through the middle, a full-cell river depression, or a sparse tall-grass tuft in one corner.

**Anchor Patch**
The nano tile should declare its primary anchor patch (or anchor line between patches) for placement, snapping, and interaction logic. This is the stable local coordinate the renderer, solver, and future mechanics can all agree on.

**Z Mode**
The vertical relationship to the ground plane:

- *Positive* — rises above the ground
- *Negative* — sinks below the ground
- *Flat* — lies on the ground plane

The z-mode determines render ordering, occlusion behavior, and the class of geometry used by the renderer.

**Render Family**
The geometric interpretation of the nano:

- *Billboard* — upright Z-pinned feature
- *Extruded box* — solid 3-face volume
- *Carve-out* — depressed/sunken geometry
- *Flat overlay* — ground decal-like geometry

Render family is derived from kind in simple implementations, but the design should treat it as an explicit concept because it governs composition rules.

**Z Offset**
A signed height/depth value describing how far the nano rises above or sinks below the parent micro tile. Positive values produce height; negative values produce depth. This value drives draw order, occlusion, shadow behavior, and, where appropriate, player sink/bridge height alignment.

**Walkability Rule**
Nano tiles can change how the player interacts with a cell independently of the parent terrain:

- *Always* — the player may always occupy/pass through the nano-bearing cell
- *Never* — the nano blocks occupancy (wall, fence post cluster, deep river without crossing)
- *Conditional* — passage depends on a key, quiz, toll, or other progression condition

This is essential for gate nanos, troll-bridges, barricades, and similar features that are not adequately modeled by terrain alone.

**Footprint Occupancy and Edge Presence**
The nano must declare which nano patches and patch-to-patch spans of the parent micro tile it occupies and which borders of the cell it presents to its neighbors. A straight wall occupies a narrow strip through aligned patches; a corner wall occupies two orthogonal arms; a river cross occupies all four directions across multiple patches. This occupancy data is the authoritative geometry contract for composition, not the SVG alone.

**Connectivity Signature and Variant Family**
For connectable features, the nano must declare its cardinal neighbor connections and resolve to a variant family such as `straight-h`, `straight-v`, `corner-*`, `tee-*`, `cross`, `end-*`, or `isolated`. Variant selection is solver work, not artist guesswork.

**Blend Policy**
Some nanos require edge blending into the parent terrain or neighboring cells. River-bank nanos blend between water and land. Tall-grass fades into the underlying meadow. Flat overlays may alpha-blend. Blend behavior must be data-driven.

**Visual Asset Contract**
The nano must specify its primary SVG plus any auxiliary visual assets it needs — for example side textures, top textures, or shadow silhouettes. Extruded walls need separate side and top treatments; carve-outs may need edge gradients; some nanos need explicit shadow paths.

**Stack Ordering Policy**
If a cell can host multiple nanos, the definition must be clear about legal stack order and whether those nanos share or partition the 3×3 patch set. The target policy is:

- negative nanos first
- flat nanos second
- positive nanos last

This keeps rivers below bridges, decals below fences, and base terrain below all of them.

#### 3.2.4 Nano Library: Archetypes

The nano library should contain at least the following archetype families for the MVP.

**Barrier Nanos**
- Stone wall
- Cathedral wall
- Homestead wall
- Fence
- Gate

**Watercourse Nanos**
- River
- River-bank

**Crossing Nanos**
- Bridge
- Troll-bridge

**Vegetation / Detail Nanos**
- Tall-grass
- Future flat decals (mud strip, crop rows, worn path trim)

These archetypes are not a separate world scale from micro tiles; they are the expressiveness layer that lets one terrain cell participate in a continuous feature network while still offering 3×3-addressable placement inside the cell.

#### 3.2.5 Current State vs. Target State

The main engine still largely folds structural features into base tile types or ad-hoc object rendering. However, the Iso 2.0 experiment already proves the nano construct is real rather than speculative: `experiment/isometric-2.0/src/types.ts` defines `NanoTileKind`, `NanoZMode`, `WalkableRule`, `NanoTile`, and `nanos` stacks attached to `MicroTile`.

Gaps to close:
- The world-engine docs did not formally describe the nano tier
- The main `src/` pipeline does not yet expose a shared nano schema
- Edge contracts are not yet nano-aware
- Solver phases do not yet explicitly resolve nano variant families and stacks
- Population rules do not yet reason about nano occupancy separately from terrain occupancy
- Rendering policy for negative / flat / positive nano composition is not yet documented in the main architecture

---

### 3.3 World Unit Tile (L1)

#### 3.3.1 What It Is

A world unit tile is a 5×5 grid of micro tiles **plus the nano overlay plan attached to those tiles**. Together they form a recognizable local structure: a stretch of river, a wall with a gate, a bridge crossing, a fenced enclosure, a clearing, a corridor turn. It is the smallest unit of **designed intent** — while micro tiles are terrain substrate and collision primitives, and nano tiles are 3×3 sub-cell feature lattices, world unit tiles are architectural motifs.

The 5×5 size was chosen deliberately:
- It is large enough to contain a meaningful internal structure (a wall across one row with a gate in the center leaves room for approach from either side)
- It is small enough to be easily authored, inspected, and tested by a human designer
- It supports clean symmetry (center cell at position 2,2; symmetric about both axes if desired)
- It can express both a base terrain pattern and a coherent nano overlay plan (river plus bridge, fence perimeter with gate, wall corner with open interior)
- It composes cleanly into the next tier (5×5 world units = 25×25 micros per macro tile, which is large enough for a gameplay "chapter")

World unit tiles are the primary "vocabulary" of the world grammar. A biome's character comes from which world unit tiles appear in it and how frequently. A meadow biome is 80% "open clearing" world units with occasional "river segment" or "fence enclosure" world units scattered through. A castle biome is 60% "wall corridor" and "gated room" world units.

#### 3.3.2 Required Metadata

**Nano Overlay Plan**
A 5×5 map declaring which micro cells carry nano overlays, what kinds they carry, whether the overlays are singletons or legal stacks, and whether the exact variant is authored or resolved later by connectivity rules. For each participating micro cell, the plan should be able to specify **which of the nine nano patches are occupied**. This is how a world unit says "these five meadow cells are also a fence enclosure" or "this grass clearing carries a river carve-out crossed by a bridge." The nano overlay plan is part of the template, not a post-process garnish.

**Full 5×5 Traversal Mask**
A 5×5 boolean (or traversal-class) grid indicating which cells within this world unit are walkable, blocked, conditional, or hazardous. This is not just copied from the constituent micro tiles — it is the authoritative statement of "how can a player move through this piece?" The traversal mask is what the macro-level solver uses to reason about route flow without needing to inspect individual micro tiles. It must reflect both base terrain and any nano overlay walkability overrides.

**Movement Channels**
Beyond the raw traversal mask, world unit tiles should declare their internal movement channels — logical pathways through the unit that a player can follow. A "river with bridge" world unit has a north-south movement channel (the bridge) even though the east-west direction is blocked by water. A "wall with gate" has an east-west movement channel through the gate but no north-south channel through the wall itself. A "clearing" world unit has movement channels in all four directions.

Movement channels are critical for the macro solver. When assembling a macro tile, the solver must guarantee that a player can traverse from one side to the other, and it reasons about this at the world-unit level using movement channels, not at the micro level using individual cell walkability.

**Border Edge Signatures**
Four edge signatures (north, south, east, west), each consisting of a vector of 5 micro-tile edge connector tags (one per micro tile along that border), augmented by any border-facing nano features. This is the world unit's "handshake" with its neighbors.

For the current simplified system, each border is collapsed to a single dominant edge tag (the most frequent tag along that border). This is sufficient for the MVP. The full 5-tag vector supports future refinements where partial edge matching is needed (for example, a river that runs along the eastern half of the south border, with grass on the western half).

**Transform Permissions**
Rules governing how this world unit may be spatially transformed when placed:

- *Rotatable* — Can this unit be rotated in 90-degree increments? Only valid if the resulting edge signatures and movement channels remain coherent after rotation. A symmetric clearing can be rotated freely. An asymmetric river bend can be rotated to produce four directional variants. A structure with internal text or directional features (a sign pointing right) should not be rotated.
- *Flippable* — Can this unit be mirrored along an axis? Similar constraints as rotation. Enabled where the internal structure is symmetric or where the flip produces a valid variant.
- *Constrained Orientation* — Some units may only be placed in specific orientations relative to the world. A river flowing "downhill" (toward increasing Y) should not be flipped to flow uphill if the biome enforces gravity drainage. This is a rare constraint but must be expressible.

When a world unit is rotatable, the engine should pre-compute all valid rotated variants at startup, each with pre-rotated edge signatures and movement channels. This avoids runtime rotation math during the solving phase.

**Connectivity Class**
A categorical label describing what kind of larger-scale feature this world unit participates in:

- *River chain* — Part of a flowing water feature. Must connect to other river chain units or a river terminator via water edges.
- *Wall chain* — Part of a barrier structure. Must connect to other wall chain units or a wall terminator via wall edges.
- *Fence chain* — Part of a lighter barrier structure. Similar to wall chain but with different visual and gameplay properties.
- *Path chain* — Part of a designated walkable route (dirt or stone path). Ensures path continuity across world units.
- *Enclosure* — A self-contained structural feature (a fenced yard, a walled room). Does not need to connect to neighbors.
- *Terminal* — Ends a chain feature. A pond terminates a river chain. A rock pile terminates a wall chain. Terminals must have the chain's edge type on the incoming side and open edges on the remaining sides.
- *Standalone* — An independent unit with no chain obligations. Open clearings, random decorative patches.

Connectivity class is the primary input to the macro solver's chain-continuation logic. In most practical cases, that chain is physically realized by nano overlays riding on top of the world unit's base terrain. When the solver starts a river, wall, or fence, it must continue the chain with compatible units until it reaches a terminal.

**Internal Anchor Points**
Named positions within the 5×5 grid that have special significance for the population solver:

- *Spawn anchors* — Where collectible items may appear. Typically on walkable cells near the center or along movement channels.
- *Gate anchors* — Where conditional-traversal elements (doors, toll gates) are placed. The center cell (2,2) is the canonical gate position for symmetric units.
- *NPC anchors* — Where non-player characters can be stationed. Should be on walkable cells with adequate clearance (not in narrow corridors where they'd block movement).
- *Scenic anchors* — Where decorative elements can be placed for visual interest without gameplay impact. Corners or edges of open spaces.

Anchor points allow the population solver to place entities appropriately without needing to inspect individual micro tile metadata.

**Minimum Internal Openness**
A fraction (0.0–1.0) specifying the minimum ratio of walkable cells within this world unit. This value is declared by the template author, not computed, because it represents a design constraint: "this template promises at least this much traversable space." The playability validator can compare the declared openness against measured openness to detect template errors.

**Biome Affinity Tags**
A set of biome names (or a weight vector across all biomes) indicating which biomes this world unit is appropriate for. A "river bend" world unit might be appropriate for meadow and forest but not for cave or castle. A "stone corridor" world unit might be appropriate for cave and castle but not for meadow. The biome acts as a filter during the macro solver's world unit selection phase.

#### 3.3.3 World Unit Library: Archetypes

The world unit library should contain at least the following archetype families for the MVP. Each family has multiple specific variants. Some are authored directly as micro patterns; others are authored as base terrain plus a nano overlay plan.

**Open Space Family**
- Meadow base (all grass, fully walkable, all edges open)
- Dirt clearing (mixed grass and dirt, fully walkable)
- Stone plaza (stone floor, appropriate for indoor/cave areas)
- Sand patch (for transition biomes)

**River Family**
- Straight north-south (river nano column through center, grass flanks)
- Straight east-west (river nano row through center, grass flanks)
- Bend northeast (river nano turns from north to east)
- Bend northwest (river nano turns from north to west)
- Bend southeast (river nano turns from south to east)
- Bend southwest (river nano turns from south to west)
- T-junction (water from three directions)
- Cross junction (water from all four directions)
- End/pond (expands into a pool and terminates)
- Narrow stream (thinner water feature, single-cell width)
- Waterfall origin/end (for elevation change features, future)

**Barrier Family (Walls)**
- Wall segment east-west (stone-wall nano across center row)
- Wall segment north-south (stone-wall nano down center column)
- Wall corner (L-shaped wall nano)
- Wall with gate east-west (wall row with conditional opening in center)
- Wall with gate north-south (rotated variant)
- Wall with window (non-traversable but with visibility properties, future)
- Wall terminator (wall ending in a pillar or rock pile)

**Barrier Family (Fences)**
- Fence segment (fence nano, lighter version of wall, same edge mechanics)
- Fence enclosure (rectangular fence with one opening)
- Fence corner (L-shaped fence)
- Fence terminator (fence post)

**Crossing Family**
- Bridge over river north-south (bridge nano crosses river nano column)
- Bridge over river east-west (bridge nano crosses river nano row)
- Stepping stones (multiple walkable cells within a water field, future)
- Gate in wall (conditional crossing of a barrier)

**Specialized Family**
- Treasure room (enclosed space with chest anchor, accessible from one direction)
- NPC station (open area with central NPC anchor, approach from multiple directions)
- Waymark (open area with sign or marker, scenic anchors for decoration)

**Transition Family (Future)**
- Biome edge transition units (grass fading to sand, stone to dirt)
- Elevation transition units (representing a step up or down)

#### 3.3.4 Transform-Safe Variant Generation

For each rotatable world unit archetype, the engine should pre-generate all valid rotated and flipped variants at startup. A single "river bend northeast" template produces:
- 0° rotation: bend from north to east
- 90° rotation: bend from east to south
- 180° rotation: bend from south to west
- 270° rotation: bend from west to north

Each rotated variant gets its own pre-computed edge signatures, movement channels, and anchor positions. The rotation is a metadata operation, not a visual operation — the visual rendering of the rotated unit is handled by rotating the micro tile grid.

Transforms that would produce invalid results (broken edge contracts, movement channels that lead to walls) must be filtered out. The template library should only contain valid variants.

#### 3.3.5 Current State vs. Target State

The current engine defines 11 world unit templates in `src/config/tiles.config.ts` with basic edge tags, rotatable flags, chain types, and passability values.

Gaps to close:
- No explicit nano overlay plan separate from base micro terrain
- No movement channel declarations
- Edge signatures are single tags per side, not 5-element vectors
- No internal anchor point definitions
- No biome affinity tags (selection is weighted but not filtered by suitability)
- No pre-computed rotation variants (rotation is a flag but not pre-generated)
- No T-junction, cross-junction, corner, or transition templates
- No traversal mask separate from constituent micro tile walkability

---

### 3.4 Macro Tile (L2)

#### 3.4.1 What It Is

A macro tile is a 5×5 grid of world unit tiles, making it 25×25 micro tiles in total plus whatever nano overlays those world units carry. In other words, a macro tile owns both the coarse terrain layout and the fine 3×3-per-cell placement plan for sub-micro features. It is the unit of **regional gameplay** — large enough to contain a meaningful sequence of obstacles, resources, and pathways, but small enough to be generated, validated, and cached as a single operation.

If world unit tiles are the words of the tile grammar, macro tiles are the paragraphs. A macro tile tells a local story: "The player enters from the west through a meadow, encounters a river running north-south, crosses it at a bridge, passes through a gate in a stone wall, and reaches a clearing with a treasure chest." That entire sequence is one macro tile.

The macro tile is the principal unit that the procedural solver reasons about. The solver's job is to assemble a macro tile from world unit tiles such that:
- All edge contracts between adjacent world units are satisfied
- At least one traversable route exists from every entry point to every exit point
- Feature chains (rivers, walls) either continue to the macro tile's border (for stitching with the neighboring macro tile) or terminate properly
- The gameplay difficulty and resource density match the biome's profile
- The visual variety is sufficient (no 5×5 grid of identical meadow clearings)

#### 3.4.2 Required Metadata

**Macro Edge Contracts**
Each side of the macro tile (north, south, east, west) presents an edge contract that is the composition of the 5 world unit edge signatures along that side, including any border-facing nano chains. This is what the inter-macro stitching solver uses.

For the simplified MVP, each macro edge contract can be collapsed to a dominant type or a small signature vector (for example, "3 open, 1 water, 1 open" along the north edge, summarized as "mostly open with one river exit").

**Mandatory Entrance and Exit Points**
Every macro tile must declare at least one traversable entry and exit point on each of its four sides (or explicitly mark a side as closed, meaning the neighboring macro tile is responsible for providing an alternative route around this one). Entry/exit points correspond to walkable world unit cells along the macro tile's border.

These entry/exit declarations are what the inter-macro solver uses to guarantee global traversability. If macro tile A declares a river exit on its east side, macro tile B (the eastern neighbor) must declare a compatible river entry on its west side, and that entry must connect to a traversable route through tile B.

**Route Corridors**
A route corridor is a guarantee that a walkable path exists from one side of the macro tile to another. A macro tile might guarantee east-west traversal (the primary path) but not north-south (there's a wall blocking that direction, forcing the player to go around). The solver uses route corridors to plan the player's overall journey at the map level.

Route corridors can be:
- *Full corridor* — unobstructed path
- *Gated corridor* — path exists but requires solving an obstacle (door, quiz, toll)
- *No corridor* — no traversable path in this direction

**Progression Landmarks**
Named positions within the macro tile that the progression solver cares about:
- *Gate corridor* — A bottleneck where the player must solve an obstacle to continue
- *Key region* — An area where a required item (key, crowbar, coin cache) is accessible
- *NPC checkpoint* — A position where an NPC provides guidance, trades, or quiz challenges
- *Safe pocket* — A low-threat open area where the player can regroup or explore freely
- *Reward cluster* — An area with higher-than-normal collectible density

These landmarks guide the progression solver's placement of keys-before-locks, NPCs at decision points, and difficulty ramp.

**Difficulty and Biome Profile**
Metadata describing the intended challenge level and thematic identity of this macro tile:
- Biome identity (meadow, forest, cave, castle)
- Obstacle density (what fraction of the area is blocked)
- Feature density (how many interactive elements per unit area)
- Collectible density (how much loot is available)
- NPC count target (how many NPCs should be placed here)

The macro assembler uses these profiles to select world unit tiles that match the intended character of the macro tile.

**Solver Confidence and Repair History**
Debug metadata recorded during generation:
- How many solver iterations were needed to assemble this macro tile
- Whether any backtracking occurred and at which positions
- Whether any repair passes modified the originally assembled content
- The entropy seed that produced this macro tile

This metadata is invisible to the player but invaluable for debugging, tuning, and quality monitoring. If certain macro tile configurations consistently require many solver iterations or repairs, that indicates a gap in the world unit library or an overly constraining edge contract system.

#### 3.4.3 Macro Tile Assembly Logic

The assembly of a macro tile is the most computationally interesting part of the world engine. It is a constrained search problem: fill a 5×5 grid of world unit slots such that all edge contracts, route corridors, chain continuations, and playability guarantees are satisfied.

The assembly follows this general flow:

1. **Intent seeding** — The LLM entropy system provides a hash that biases the assembly toward a particular "mood" (river-heavy, wall-heavy, open, dense). This is not a hard constraint — it influences world unit selection weights.

2. **Boundary constraint anchoring** — If this macro tile is adjacent to already-generated macro tiles, the touching edges are hard constraints. The world unit tiles along those borders must have compatible edge signatures.

3. **Feature chain continuation** — If a river enters from the north border, the solver must place river-chain world units to continue it and eventually terminate it (or carry it to another border for the neighboring macro tile to handle). Chains are the strongest internal constraint after boundaries.

4. **Progressive filling** — The solver fills the 5×5 grid position by position, selecting world unit tiles that satisfy edge contracts with already-placed neighbors and chain obligations. The filling order matters — the solver should fill constrained positions (boundaries, chain continuations) first and unconstrained positions (interior fill) last.

5. **Route validation** — After filling (or during, as an incremental check), the solver verifies that declared route corridors are actually traversable at the micro level with nano overlay walkability applied. It runs a BFS through the composite 25×25 micro grid from each entry point.

6. **Repair if needed** — If route validation fails, the solver identifies the blocking position and replaces the world unit there with one that restores connectivity (often an open clearing or a bridge). This is targeted repair, not full reroll.

This assembly logic is described in detail in Document 03 (Solver Pipeline).

#### 3.4.4 Inter-Macro Stitching

Macro tiles themselves must stitch together coherently at the map level. This is the outermost layer of the edge contract system.

When the player moves near the edge of the current macro tile's territory, the engine generates the neighboring macro tile. The new tile's border on the touching side is constrained by the existing tile's corresponding border. This is a boundary condition, not a negotiation — the existing tile wins because it was generated first and may already be cached, rendered, or relied upon by gameplay state.

This means generation order matters. The first macro tile generated (at the player's spawn) has no constraints. Each subsequent tile has at least one constrained border. A tile at a corner between three already-generated tiles has three constrained borders. The solver must handle all these cases.

For infinite/streaming worlds, this asymmetry (existing tiles constrain new tiles, never the reverse) is essential. It means the solver never needs to modify already-generated content, which allows aggressive caching and prevents retroactive state corruption.

#### 3.4.5 Current State vs. Target State

The current engine does not have an explicit macro tile concept. Chunks (32×32 cells) serve as the undifferentiated generation and caching unit. Template stamps (5×5 world units) are placed within chunks without regard for inter-chunk edge compatibility.

Gaps to close:
- No macro tile abstraction (chunks are the only spatial unit above micro tiles)
- No inter-chunk edge contract enforcement
- No route corridor declarations or guarantees
- No progression landmark system
- No solver confidence tracking
- No explicit macro-level handling of nano chain continuation across chunk boundaries
- No chain continuation across chunk boundaries (a river ends at the chunk border even if the neighboring chunk starts a new river that doesn't align)

The evolution path is to introduce macro tiles as a generation-time concept that decomposes into the existing chunk/cell data structures. The renderer and mechanics systems don't need to know about macro tiles — they continue to work with chunks and cells. The macro tile is a generation-time scaffolding that produces better chunks.

---

## 4. Scale Relationships

### 4.1 Dimensional Summary

| Property | Micro Tile (L0) | Nano Tile (L0.5) | World Unit (L1) | Macro Tile (L2) |
|----------|------------------|------------------|-----------------|-----------------|
| Grid footprint | 1×1 cell | 3×3 nano patches inside one parent micro tile | 5×5 cells | 25×25 cells (5×5 world units) |
| Source pixel size | 32×32 (current main engine) | Same parent footprint; source art often 128×32 to 128×128 depending on family, but logically addressed as 9 patches | 160×160 logical composition | 800×800 logical composition |
| Isometric projected size | 64×32 | Same parent diamond, but features are anchored to one or more of 9 patches and may rise above or sink below via z-offset | ~320×160 | ~1600×800 |
| Count per parent | 25 per world unit | 9 addressable nano patches per micro tile; features may occupy 1–9 patches and may stack when legal | 25 per macro tile | N/A (top spatial level) |
| Primary concern | Base terrain, substrate collision | Feature overlays, local height, chain expression | Local structure, edge matching | Regional routes, progression |
| Metadata weight | Terrain + physics | Feature + z + walkability | Structural + connectivity | Strategic + gameplay |

### 4.2 Upward Aggregation

Each tier's metadata is an aggregation of the tier below:

- A nano tile augments its parent micro tile with 3×3 patch occupancy, z behavior, walkability, and feature connectivity
- A world unit tile's edge signature is composed from the edge connectors of the 5 micro tiles along each border plus any border-facing nano contracts
- A world unit tile's traversal mask is composed from the traversal classes of its 25 constituent micro tiles with nano walkability overrides applied
- A macro tile's edge contract is composed from the edge signatures of the 5 world unit tiles along each border
- A macro tile's route corridors are validated against the composed traversal mask of all 625 constituent micro tiles and their resolved nanos

This aggregation is computed once when a template is authored or when a variant is generated. It is not recomputed at runtime.

### 4.3 Downward Constraint

Each tier's decisions constrain the tier below:

- The macro solver decides "this position gets a river-chain world unit" → the world unit selector picks from the river library → the base micro terrain and the nano overlay plan are determined by the world unit template
- The macro solver decides "this macro tile's east border must be water" → the world unit tiles along the east column must present water on their east edges → the relevant micro tiles and/or river nanos in the rightmost border-facing nano patches of those world units must satisfy that contract
- The world unit solver decides "this crossing uses a bridge over a river" → the underlying micro tiles remain biome terrain → the nano stack carries the river carve-out and the bridge crossing as separate, composable constructs

This downward constraint means that higher-level decisions reduce lower-level freedom, which is the desired behavior. The macro solver makes broad strategic decisions; the micro level fills in cosmetic detail within those constraints.

### 4.4 The Chunk Question

The current engine uses 32×32 chunks as its primary spatial unit for generation and caching. The macro tile concept introduces a 25×25 unit that doesn't align cleanly with 32×32.

There are several ways to resolve this:

**Option A: Macro tiles replace chunks.** Change the chunk size to 25. This is the cleanest conceptual alignment but touches a lot of existing code and changes rendering, caching, and mechanics.

**Option B: Macro tiles are a generation overlay.** Keep 32×32 chunks for rendering and caching. Generate content using 25×25 macro tile logic, then write the results into the appropriate chunk cells. The macro tile boundaries don't need to align with chunk boundaries — they're a generation-time concept that produces cell data, not a runtime concept.

**Option C: Macro tiles are chunks renamed.** Change the chunk size to 25 and treat each chunk as a macro tile. The remaining 7 cells per row/column in the current 32-wide chunk are eliminated. This is Option A with a concrete migration path.

**Option D: Quarter-macro generation.** Keep 32×32 chunks. A macro tile (25×25) fits inside a chunk with 7 cells of border padding. Use the padding for inter-macro transitions and auto-tiling blending zones.

The right choice depends on practical concerns (how much existing code breaks, rendering performance implications, cache memory impact) that should be evaluated during implementation. The design documents describe the hierarchical logic without committing to a specific chunk-alignment strategy.

---

## 5. Variation and Permutation System

### 5.1 The Variation Problem

If every world unit tile were placed exactly as authored, the world would feel repetitive. Players would quickly recognize the same "river bend" or "wall gate" pattern appearing again and again. The variation system ensures that even structurally identical placements look and feel different.

### 5.2 Visual Variation (Cosmetic)

At the micro tile level, each tile type has multiple SVG variants that share identical metadata but differ visually. The renderer selects among variants using a deterministic hash of the cell's world coordinates, ensuring that the same cell always gets the same variant (for cache stability) but neighboring cells get different variants (for visual diversity).

Visual variation does not affect solver logic, edge contracts, or gameplay. It is purely a rendering concern.

Nano overlays have an additional kind of variation: **connectivity-driven variation**. A fence, wall, or river nano is not just cosmetically varied — it resolves to a structurally meaningful piece (`straight`, `corner`, `tee`, `cross`, `end`, `isolated`) based on its neighbors. This is partly visual and partly logical. The chosen variant determines 3×3 patch occupancy, walkability, occlusion, and edge contracts.

### 5.3 Structural Variation (Transform-Based)

At the world unit level, rotation and reflection produce structurally distinct variants from a single template. A "river bend northeast" rotated 90° becomes a "river bend southeast" — structurally different (different edge signatures, different movement channels) but derived from the same authoring effort.

Transform-based variation does affect solver logic. Each rotated variant is treated as a distinct world unit tile in the solver's vocabulary, with its own edge signatures and connectivity class.

### 5.4 Compositional Variation (Emergent)

At the macro level, variation is emergent. Even a small world unit library produces an enormous number of distinct macro tile compositions. With 20 world unit archetypes, each with 4 rotation variants (80 effective vocabulary entries), the number of possible 5×5 macro tile arrangements is astronomically large. The solver explores only a tiny fraction of this space for each macro tile, guided by entropy seeds and boundary constraints, producing unique regional layouts each time.

### 5.5 Permutation Budget

Not all permutations produce good results. The permutation budget is a design constraint that limits variation to avoid pathological outcomes:

- **Minimum open space** — No macro tile may have less than a specified fraction of walkable area
- **Maximum chain length** — No feature chain (river, wall) may extend for more than a specified number of world units without terminating
- **Maximum obstacle density** — No macro tile may have more than a specified number of non-walkable world units
- **Variety minimum** — A macro tile should contain at least 3 distinct world unit types (prevent all-grass or all-wall monotony)

These budgets are enforced by the macro solver and documented in Detail in Document 03.

---

## 6. Template Authoring Guidelines

### 6.1 General Principles for Designing World Unit Templates

When creating a new world unit template (5×5 micro tile grid), the author should follow these guidelines:

- **Declare honest metadata.** If the template has a wall across it, don't declare it as `minPassability: 1.0`. If only 12 of 25 cells are walkable, the passability is 0.48.
- **Author base terrain separately from nano intent.** First decide what the 25 underlying micro tiles are. Then declare which of those cells carry rivers, walls, fences, bridges, gates, or other nanos, and which of the nine nano patches each feature occupies. Do not bake every structural feature into bespoke terrain tiles.
- **Use center cell (2,2) for special features.** Gates, doors, bridge centers, NPC stations go in the center for symmetric access. This is a convention, not a hard rule, but it simplifies rotation handling.
- **Keep borders clean.** The outer ring of the 5×5 grid (top row, bottom row, left column, right column) should consist of "buffer" cells that match the declared edge tags. If the east edge is 'water', all 5 cells in the right column should be water (or appropriately transitioning). This prevents visual seams between adjacent world units.
- **Declare nulls for overlay templates.** If a template is meant to add structure on top of existing terrain (like a wall that spans one row but leaves everything else untouched), use null cells for the unmodified positions. The generation pipeline will preserve whatever the Perlin noise or previous stamp placed there.
- **Declare legal nano stacks explicitly.** A bridge-over-river composition is legal because the bridge and river occupy different z modes. A wall-and-river conflict in the same cell is illegal unless a dedicated adapter template exists. The template author should never leave stack legality implicit.
- **Test every rotation.** If the template is marked rotatable, manually verify that all 4 rotations produce valid edge signatures and sensible movement channels. An author mistake here will cause solver failures at runtime.
- **Provide at least one paired counterpart.** Every chain-type template should have at least one matching chained partner and one terminator. A river straight is useless without a river bend and a river end. A wall segment is useless without a wall gate and a wall terminator.

### 6.2 Naming Convention

Templates should follow the naming pattern: `{feature}_{shape}_{direction_or_qualifier}`

Examples:
- `river_straight_ns` (river, straight, north-south orientation)
- `wall_gate_ew` (wall with gate, east-west orientation)
- `fence_enclosure_open_n` (fence enclosure with opening on the north side)
- `meadow_base` (open meadow, no directional qualifier)
- `bridge_ns` (bridge, north-south orientation)
- `river_end_pond` (river terminator, pond style)

---

## 7. Summary and Next Steps

This document defines the complete spatial hierarchy for Emily's Game world engine. The four tiers — micro tile, nano tile, world unit tile, and macro tile — provide the structural grammar from which procedurally generated worlds are assembled.

The key takeaway is that **metadata is the real product**. The visual SVGs are interchangeable cosmetic expressions. The traversal classes, edge connectors, nano z-modes, 3×3 patch occupancy, movement channels, anchor points, and connectivity classes are what make the world engine actually work. Every subsequent document in this series (edge contracts, solver pipeline, rendering, population) operates on these metadata contracts.

Refer to Document 02 for the edge contract and constraint propagation system that governs how tiles at every scale are stitched together.
