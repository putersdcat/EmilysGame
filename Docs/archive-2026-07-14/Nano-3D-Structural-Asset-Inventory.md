# Nano 3D Structural Asset Inventory and Texture Plan

**Date:** May 8, 2026
**Status:** Research snapshot / planning input
**Scope:** `experiment/isometric-2.0`, main `Docs`, and the primary game source under `src/`

This document consolidates the repo's current and planned **structural / "3D" world assets** into one working inventory.

It is meant to answer four practical questions:

1. What structure-like assets already exist in the legacy game?
2. What structural Nano kinds already exist in the Iso 2.0 experiment?
3. What larger structure families are already implied by the template library and assembly system?
4. What texture/material sets still need to be authored to make those structures believable in the Nano architecture?

---

## Executive summary

- The **legacy game already contains structure placeholders and replacements** for `house`, `hut`, `shop`, `fence`, `wall`, `bridge`, `door_locked`, `door_open`, `quiz_gate`, `toll_gate`, `barricade`, and `outhouse`. These are currently lightweight emoji-era assets, many of which now have custom 48×48 SVG replacements rather than raw emoji renders.
- The **Iso 2.0 experiment already defines a Nano structural vocabulary**: `stone-wall`, `fence`, `gate`, `bridge`, `troll-bridge`, `cathedral-wall`, and `homestead-wall`, plus support overlays like `river`, `river-bank`, and `tall-grass`.
- The experiment already has **two multi-tile structural assemblies**: `homestead-small` and `ruined-cathedral`.
- The main game's world-unit template library already implies a broader **fortification / settlement / civic backlog**: `guard_tower`, `gatehouse`, `fortified_passage`, `castle_courtyard`, `castle_hall`, `castle_throne`, `wall_bastion`, `fenced_yard`, `fenced_garden`, `market_square`, `treasure_alcove`, `ruins`, and more.
- The solver/generation side of the codebase already treats some structures as **progression topology**, not mere decoration: `balanceObstacles()` in `src/gen.ts` reasons about reachable regions and staged unlocks, while the Iso 2.0 solver already treats gates and certain bridges as condition-bearing passage primitives in its walkability map.
- The **true 3D / extruded wall material pipeline is currently strongest for `stone-wall`**. `cathedral-wall` and `homestead-wall` are named and used by assemblies, but the docs and toolchain still indicate incomplete render-path implementation compared with `stone-wall`.
- The most important missing art work is not one single sprite; it is a set of **reusable material families**: castle masonry, cathedral masonry, homestead timber/plaster, roof materials, gate/bridge wood, ironwork, rubble/ruin debris, and support details like windows, doors, banners, and stained glass.

---

## Status legend

- **Legacy live** — exists in the current main game, but as v1/placeholder-style art or logic.
- **Nano live** — exists in the Iso 2.0 experiment as an actual Nano kind or assembly.
- **Planned in templates** — not a distinct final asset yet, but clearly implied by world-unit templates, docs, or generation weights.
- **Recommended addition** — not explicitly named in source, but a logical near-term backlog item required to round out a structure family.

---

## 1) Legacy structure assets already in the main game

These are the structural assets the main game already knows about in `src/config/assets.config.ts` and/or `src/asset-sprites.ts`.

| Legacy asset | Status | Current form | Notes for Nano migration |
|---|---|---|---|
| `house` | Legacy live | Emoji-era obstacle with custom SVG replacement | Natural seed for **small home / cottage / single-family dwelling** kit |
| `hut` | Legacy live | Emoji-era obstacle with custom SVG replacement | Natural seed for **primitive hut / rustic shelter** kit |
| `shop` | Legacy live | Emoji-era obstacle with custom SVG replacement | Could evolve into **market stall / village shop / town building** kit |
| `shop_general` | Legacy live | Variant of shop concept | Better as theme variants of a shared settlement/shop kit |
| `shop_snack` | Legacy live | Variant of shop concept | Could become outdoor stall / kiosk style asset |
| `shop_trading` | Legacy live | Variant of shop concept | Could become trading post / merchant booth assembly |
| `outhouse` | Legacy live | Interactive structure with custom SVG replacement | Good low-cost settlement support asset |
| `wall` | Legacy live | Flat obstacle with custom SVG replacement | Should ultimately map to **stone-wall Nano family** or a biome-specific wall family |
| `door_locked` | Legacy live | Custom SVG replacement | Should become **gate / door-in-wall module** rather than standalone icon |
| `door_open` | Legacy live | Custom SVG replacement | Same family as locked door; needs structural integration |
| `fence` | Legacy live | Emoji-era obstacle with custom SVG replacement | Maps directly to **fence Nano family** |
| `quiz_gate` | Legacy live | Custom SVG replacement | Could become stylized gate skin on top of gate Nano logic |
| `toll_gate` | Legacy live | Custom SVG replacement | Same family as gates/doors, probably with distinct signage/hardware |
| `barricade` | Legacy live | Custom SVG replacement | Could remain non-Nano obstacle, or become a light modular barrier family |
| `bridge` | Legacy live | Custom SVG replacement | Maps directly to **bridge / troll-bridge / crossing kit** |

### What this means

The legacy game is **not starting from zero** on structures. It already has a gameplay vocabulary for homes, huts, walls, gates, fences, and bridges. What it lacks is a coherent **Nano-native construction system** that turns those one-off icons into modular structure families.

---

## 2) Main-game systems that already expect structural content

The main source already assumes structures are part of world generation and interactions:

- Biome obstacle weights already include structural nouns like `house`, `hut`, `fence`, `wall`, `door_locked`, `toll_gate`, and `shop`.
- Mechanics already has flavor or interaction handling for `shop`, `outhouse`, and simple structure flavor for `house`, `hut`, and `fence`.
- The v1-to-Iso bridge in `src/nano-tile-defs.ts` currently maps only:
  - `stone_wall` → extruded Nano wall
  - `wooden_fence` → upright billboard fence

That bridge is important: it shows the intended migration path, but it also shows that **most structure families have not been bridged yet**.

---

## 3) Active Nano structural kinds in `experiment/isometric-2.0`

The experiment's `NanoTileKind` list defines the current structural vocabulary for the new renderer.

| Nano kind | Status | Render intent | Notes |
|---|---|---|---|
| `stone-wall` | Nano live | **Extruded 3D box** wall | Most mature structural Nano today |
| `fence` | Nano live | Positive-Z upright billboard | Existing continuous feature family |
| `gate` | Nano live | Positive-Z upright gate | Used for locked/unlocked passage |
| `bridge` | Nano live | Flat crossing overlay | Supports river traversal |
| `troll-bridge` | Nano live | Positive-Z conditional crossing | Special progression-bearing bridge asset |
| `cathedral-wall` | Nano live, partial | Intended extruded structural wall | Named and used by assemblies, but still behind `stone-wall` in tool support |
| `homestead-wall` | Nano live, partial | Intended extruded home/hut wall | Named and used by assemblies, but still behind `stone-wall` in tool support |
| `river` | Support Nano | Negative-Z carved channel | Not a structure itself, but required for bridges and crossings |
| `river-bank` | Support Nano | Flat shoreline overlay | Structural support terrain for water edges |
| `tall-grass` | Support Nano | Flat overlay | Not structural, but part of the Nano stack vocabulary |

### Important implementation note

The current toolchain is strongest on `stone-wall`.

- `Docs/Iso2.0-HonestResearchAndPlan.md` explicitly calls out `stone-wall`, `cathedral-wall`, and `homestead-wall` as the extruded 3D box family.
- That same doc also notes that `cathedral-wall` and `homestead-wall` are **not yet fully implemented in the same verified way** as `stone-wall`.
- `experiment/isometric-2.0/AiTools/scene-registry.ts` currently extrudes only `stone-wall` and leaves a TODO for `cathedral-wall` and `homestead-wall`.

So in practical terms:

- **`stone-wall` = active production prototype**
- **`cathedral-wall` / `homestead-wall` = declared structure families with incomplete end-to-end support**

---

## 4) Current multi-tile assemblies already defined in the experiment

The experiment already includes two structural assemblies in `experiment/isometric-2.0/src/assemblies.ts`.

| Assembly | Footprint | Current contents | Implied final asset family |
|---|---:|---|---|
| `homestead-small` | 5×5 | Fence perimeter, gate, central `homestead-wall` hut | Homestead / cottage / primitive home / small farmstead |
| `ruined-cathedral` | 3×5 | `cathedral-wall` columns, taller central spire, rubble patches | Cathedral / church / ruined religious structure |

### Homestead implications

The homestead assembly strongly suggests a full **settlement / rural dwelling** family:

- hut core
- fenced yard
- gate
- garden enclosure
- support props like outhouse, campfire, merchant stall, and small storage

### Cathedral implications

The cathedral assembly suggests a **religious / monumental stone architecture** family:

- long wall runs
- ruined side walls
- spire / tower massing
- rubble / collapse states
- likely future stained-glass, windows, arch openings, and chapel variants

---

## 5) Structural templates already planned in the main world-unit library

The biggest source of "planned but not yet fully arted" structure work is the world-unit template library in `src/config/tiles.config.ts`.

### 5.1 Wall and fortification family

These template names already exist and imply a coherent fortification kit:

- `wall_segment`
- `wall_gate`
- `wall_corner`
- `wall_end`
- `wall_t_junction`
- `wall_bastion`
- `wall_corner_capped`
- `guard_tower`
- `gatehouse`
- `fortified_passage`
- `castle_courtyard`
- `castle_corridor`
- `castle_hall`
- `castle_throne`
- `treasure_alcove`
- `ruins`

### 5.2 Fence and rural enclosure family

These templates imply a rural structural kit:

- `fence_enclosure`
- `fenced_yard`
- `fenced_garden`
- `fence_row`

### 5.3 Crossing and river-support family

These template names imply structural crossing work:

- `bridge_ns`
- `bridge_ew`
- `fortified_passage` (as a controlled crossing / corridor)
- `river_island`, `shore_*`, `beach_cove`, `water_garden` (not structures themselves, but support terrain for crossing assets)

### 5.4 Cave / ruin / interior architectural family

These are not all "buildings" in a town sense, but they absolutely belong to the structural 3D backlog:

- `cave_tunnel_ns`
- `cave_chamber`
- `cave_fork`
- `cave_dead_end`
- `ruins`
- `stone_plaza`

### 5.5 Civic / settlement / social spaces

These templates imply non-combat / town-like structures:

- `market_square`
- `castle_courtyard`
- `castle_hall`
- `gatehouse`
- `fenced_yard`

---

## 6) Consolidated 3D structural backlog for Nano architecture

This is the most useful "single list" for planning.

### 6.1 Core wall kits

#### A. Stone wall kit

**Status:** active Nano prototype  
**Backed by source:** yes

Needed pieces:

- straight horizontal
- straight vertical
- four corners
- four tees
- cross
- end caps
- isolated block / post

Needed variants/materials:

- standard grey masonry
- ruined / broken stone
- ancient / irregular stone
- red clinker / fired brick variant

#### B. Castle wall / fortification kit

**Status:** planned in templates, partially implied by `stone-wall` and castle templates

Needed pieces:

- long wall runs
- gate sections
- corner sections
- capped wall ends
- bastions
- tower bases
- gatehouse faces
- corridor / hall walls

Recommended additions:

- crenellations / parapets
- arrow-slit window panels
- banner hooks / heraldry slots
- stairs / wall-walk access pieces

#### C. Cathedral / church wall kit

**Status:** named in experiment, partially implemented, strongly planned

Needed pieces:

- nave wall runs
- corner masses
- apse / chapel-like end pieces
- column / buttress strips
- tower / spire modules
- broken-wall and rubble variants

Recommended additions:

- chapel / church-sized sibling to the cathedral kit
- stained-glass window inserts
- arch doorway variants

### 6.2 Rural dwelling and homestead kits

#### D. Homestead / cottage / primitive hut kit

**Status:** active concept via `homestead-wall` and legacy `house` / `hut`

Needed pieces:

- primitive hut shell
- small cottage shell
- single-family home shell
- fenced yard perimeter
- gate
- garden enclosure
- porch / stoop / threshold pieces

Recommended additions:

- roof variants: thatch, shingles, slate, wood plank
- chimney options
- window options
- small shed / lean-to / storage annex

#### E. Shop / market / merchant kit

**Status:** legacy live, not yet Nano-native

Needed pieces:

- shopfront shell
- market stall / awning booth
- trading post booth
- snack stand kiosk
- open plaza / market square dressing pieces

### 6.3 Gate and passage kits

#### F. Gate kit

**Status:** active in both legacy and experiment

Needed pieces:

- simple wooden gate
- heavy stone gate-in-wall
- quiz gate skin / signage state
- toll gate skin / signage state
- open and closed states
- possibly portcullis variant for castle family

#### G. Door / portal kit

**Status:** legacy live, template-supported, under-Nanoed

Needed pieces:

- locked wooden door
- open wooden door
- heavy reinforced door
- cathedral/church doorway
- ruin arch opening

### 6.4 Crossing kits

#### H. Wooden bridge kit

**Status:** active in legacy and experiment

Needed pieces:

- straight plank crossing
- guarded / gated crossing
- broken bridge state
- wider civic/stone bridge variant (recommended)

#### I. Troll bridge kit

**Status:** active experiment concept

Needed pieces:

- crude plank bridge
- troll sign / toll marker / obstruction state
- locked/unlocked states

### 6.5 Special structure support kits

#### J. Tower / bastion / spire kit

**Status:** planned in templates and assemblies

Needed pieces:

- guard tower
- bastion corner mass
- cathedral spire
- castle tower / lookout tower

#### K. Ruin / rubble / debris kit

**Status:** partially present, not complete

Needed pieces:

- rubble piles
- collapsed wall stubs
- broken columns
- broken arch pieces
- ruined floor debris

#### L. Civic stonework kit

**Status:** planned in templates

Needed pieces:

- stone plaza
- market square paving
- castle floor / hall floor
- treasure room / alcove floor and trim

---

## 7) Texture and material families

The Nano architecture is not just about silhouettes. The renderer already supports a more advanced material model for extruded structures, especially wall-like assets.

### 7.1 Existing or proven texture/material families

| Material family | Status | Current use |
|---|---|---|
| `StoneBrick` | Live / proven | Canonical `stone-wall` texture family |
| `RedClinker` | Live / proven | Alternate brick wall material for stone-wall tests |
| `AncientStone` | Experimental / researched | Useful direction for old masonry / ruins / cathedral stone |
| `StoneStub` | Diagnostic only | Placeholder fallback, not final production art |
| Legacy structure SVGs | Live | Good silhouette references, but not true Nano materials |

### 7.2 Material families still needed for the backlog

#### Required for homes / huts / homesteads

- timber-frame wall material
- plaster / whitewash wall material
- rough wood plank wall material
- thatch roof material
- shingle roof material
- simple cottage stone foundation

#### Required for castle / fortification work

- heavy ashlar stone blocks
- ruined fortress stone
- crenellation top material
- iron-banded gate/door material
- banner / heraldic color overlays

#### Required for cathedral / church work

- dark ecclesiastical stone
- worn sacred masonry / ruin variant
- stained glass inserts
- column / buttress stone variant
- spire roof / cap material

#### Required for fences / gates / bridges

- weathered fence wood
- reinforced gate wood
- bridge plank wood
- rope / chain / iron fastener accents
- mossy / wet wood variant for river crossings

#### Required for ruins and support dressing

- rubble / broken stone chunks
- cracked flagstones
- soot / age / moss overlays
- broken timber fragments

---

## 8) Recommended Nano authoring contract for true 3D structural assets

For any structure intended to be genuinely 3D/extruded in Iso 2.0, the art should be authored as a **material family**, not as a single flat icon.

### Minimum art package for an extruded wall-family asset

1. **Top face material**
2. **South/front face material**
3. **East/cap face material**
4. **Variant coverage** for straight/corner/tee/cross/end/isolated states
5. **Z-height target** for the family
6. **Walkability/collision occupancy rules**
7. **Assembly usage rules** (where it belongs: tower, hut, cathedral, courtyard, etc.)

### Minimum art package for billboard/flat support assets

1. upright SVG or flat overlay SVG
2. state variants (open/closed, locked/unlocked, damaged/intact)
3. clear role in progression logic

This matters because the renderer already supports face-specific texture inputs and multi-tile assemblies; the art plan should take advantage of that instead of flattening everything into one square SVG.

---

## 9) Structural primitives as solver topology

One important planning conclusion from re-reading `src/gen.ts`, `src/config/assets.config.ts`, `src/config/tiles.config.ts`, `Docs/WorldEngine-03-SolverPipeline.md`, `Docs/WorldEngine-05-PopulationAndProgression.md`, and `experiment/isometric-2.0/src/solver.ts` is this:

**walls, fences, water, gates, and bridges should be treated as world-solver primitives that define navigable sectors, not as decorative afterthoughts.**

### 9.1 Barrier primitives are the shape grammar of the world

The procedural generator needs a vocabulary of **blocking** and **pass-through** primitives that it can compose into regions.

#### Core blocking/barrier primitives

- stone walls / castle walls
- cathedral walls / ruin walls
- homestead walls / hut perimeters
- fences and yard boundaries
- deep water / river channels / impassable shore cuts
- barricades and locked doors

#### Core passage/exit primitives

- gates
- doors
- bridges
- troll-bridges
- quiz gates
- toll gates

The existing code already points in this direction:

- `src/gen.ts` has `promoteDoorGates()`, `placeQuizGates()`, and `balanceObstacles()`.
- `balanceObstacles()` explicitly works in staged reachable-area passes: find a free region, identify boundary locks, place prerequisites in the reachable space, then reopen progression.
- `src/config/assets.config.ts` already encodes requirement-bearing blockers like `door_locked`, `barricade`, and `toll_gate`, each with an unlock/payment/tool requirement and a resolved post-clear state.
- `Docs/WorldEngine-03-SolverPipeline.md` explicitly describes **reachability regions**, **lock-key ordering**, and progression gating as part of the solver pipeline.
- `experiment/isometric-2.0/src/solver.ts` already treats some crossings and gates as condition-bearing Nano placements rather than passive art.

### 9.2 The solver should think in sectors, wards, and compounds

For planning purposes, the world builder should be able to "draw" bounded play sectors by placing barrier belts and then inserting a controlled number of exits.

Useful sector archetypes include:

| Sector archetype | Built from | Typical exit primitive | Gameplay use |
|---|---|---|---|
| Fenced field / yard | `fence`, posts, enclosure corners | simple gate | gentle tutorial gating, livestock/garden spaces |
| Walled compound | `stone-wall`, `wall_gate`, `wall_corner`, `gatehouse` | locked gate / door | keys, guards, treasure rooms |
| River-separated zone | `river`, `river-bank`, impassable water cuts | `bridge` / `troll-bridge` | progression by bridge repair, toll, quiz, or story unlock |
| Church or cathedral precinct | `cathedral-wall`, fence, plaza edges | doorway / gate | quest destination, lore space, relic chamber |
| Castle ward / keep sector | fortification kit, bastions, towers, corridors | gatehouse / portcullis / bridge | multi-stage progression, boss or throne access |
| Market or village lot | fence, shopfront edges, plaza paving | open threshold / optional closing gate | town layout, vendor clustering |

The practical model is:

1. **Barrier primitives define the boundaries** of a sector.
2. **Exit primitives define the legal ways out** of that sector.
3. **Progression content determines when each exit becomes traversable.**

That is already more or less what the docs describe for reachability regions; the missing step is to formalize Nano structural assets around that same model.

### 9.3 Structural templates already expose solver-friendly hooks

The world-unit templates in `src/config/tiles.config.ts` are already halfway to this abstraction. They expose concepts like:

- `movementChannels`
- `anchors`
- `connectivity`
- `chainType`
- `minPassability`

Those fields are exactly the kind of metadata a sector-aware structure system needs.

In other words, the structural asset backlog should not just ask for "a church sprite" or "a castle sprite." It should ask for:

- the barrier edges the structure contributes
- the entrances/exits it exposes
- the interior/exterior walkable cells it preserves
- the places where keys, NPCs, quizzes, or treasure can be anchored

---

## 10) Passage primitives as progression-controlled exits

The current codebase already supports the idea that some structural pieces are really **interactive exits** between sectors.

### 10.1 Current gameplay-facing exit vocabulary

| Exit primitive | Current grounding in repo | Sector role |
|---|---|---|
| `door_locked` | `src/config/assets.config.ts`, `src/gen.ts` | hard gate between reachable regions until key is found |
| `barricade` | `src/config/assets.config.ts`, `src/gen.ts` | tool-gated exit requiring a crowbar-like unlock |
| `toll_gate` | `src/config/assets.config.ts` | currency-gated exit |
| `quiz_gate` | `src/config/assets.config.ts`, `src/gen.ts` | knowledge/progression gate |
| `gate` | `experiment/isometric-2.0/src/solver.ts` | Nano-native passage marker, likely door/gate family foundation |
| `bridge` | legacy + Iso 2.0 solver | always-open or solver-approved crossing over water barriers |
| `troll-bridge` | Iso 2.0 solver | conditional crossing with an explicit condition ID |

### 10.2 Design implication for Nano planning

This means the passage backlog should be handled as a first-class system, not as a side effect of wall art.

Each passage primitive should eventually carry or derive:

- a **collision/walkability state**
- an **open/closed or locked/unlocked state**
- a **progression requirement** (key, quiz, toll, repair, story flag, NPC permission, etc.)
- a **visual state family** that clearly communicates blocked vs available
- a **structure-family binding** so that the same gate logic can skin as rustic, castle, cathedral, village, or ruin-themed art

That gives the solver a consistent way to say things like:

- "This fenced tutorial yard has one gate that opens after the player gets the first key."
- "This river cuts the map into two regions; a bridge becomes available after the troll toll or quiz requirement is met."
- "This castle ward has two exits, but only the outer gatehouse is available at first."

### 10.3 Suggested planning rule

Every time the world builder creates a bounded sector, it should also explicitly place or reserve at least one **passage primitive** that explains how the player will eventually leave it.

That keeps the procedural topology legible and prevents "beautiful prison cells" — the classic procgen mistake where the region is believable but progression forgot to include an escape hatch.

---

## 11) Larger structures should be composite Nano assemblies, not monolithic sprites

The current experiment already points the right way: `homestead-small` and `ruined-cathedral` are assembled from Nano placements rather than authored as one giant building image.

That should be the default pattern for larger 3D structures.

### 11.1 Composition model for large structures

Large structures like huts, castles, churches, stores, and civic buildings should be built from a layered recipe:

1. **Barrier shell**
  Wall runs, corners, towers, fences, and heavy thresholds.

2. **Passage modules**
  Doors, gates, bridges, archways, portcullises, and breakable barricades.

3. **Ground/floor treatment**
  Plaza stones, packed dirt yards, chapel floors, hall floors, courtyards, and bridge decks.

4. **Roof/cap or silhouette modules**
  Roof overlays, spires, awnings, chimneys, parapets, crenellations, or upper trim.

5. **Detail overlays and props**
  Windows, stained glass, signs, banners, shutters, rubble, crates, market tables, wells, braziers, and similar secondary detail.

6. **Metadata for gameplay**
  Entry anchors, interior anchors, loot points, NPC markers, puzzle slots, occupancy, and walkability.

### 11.2 What this means for specific structure families

#### Hut / homestead / cottage

Should be assembled from:

- `homestead-wall` or future timber/plaster wall primitives
- fence enclosure pieces
- one gate or door module
- a floor/yard surface
- a roof overlay family
- optional support overlays such as garden beds, shed annexes, wood piles, chimneys, and signs

#### Church / cathedral

Should be assembled from:

- `cathedral-wall` runs and corners
- doorway/arch modules
- interior stone or tiled floor treatment
- stained glass / window overlays
- spire or chapel-end modules
- ruin-state overlays where applicable

#### Castle / fortification

Should be assembled from:

- `stone-wall` or a future castle-wall specialization
- bastions, towers, gatehouses, corridors, and courtyards
- gate or portcullis modules
- bridge modules where moats/rivers split wards
- heraldry, banners, braziers, rubble, treasure-room trim, and stair/walkway support assets

#### Shop / market / store

Should be assembled from:

- a small wall shell or open booth shell
- threshold/door modules
- awning/roof overlays
- signage and merchandising props
- adjacent plaza or fenced-lot treatment

The key planning point is that a "building" is not just one asset. It is a **composite recipe** over Nano primitives, material families, and overlay/detail layers.

---

## 12) Recommended structure factory abstraction for the world builder

To make the larger composite structures usable by procedural generation, the game should likely grow a **structure factory** layer above raw Nano placement.

The existing assembly system (`loadAssembly()` / `placeAssembly()` returning `MacroAssembly`) is already a good prototype of this idea. The next step is to make it solver-friendly and parameterized.

### 12.1 Problem this abstraction solves

The world builder should not have to hand-place every wall segment when it wants a church, hut, store, or castle feature.

Instead, it should be able to ask for something like:

- a hut of size small, facing south-east, variation 3
- a chapel of medium size with one public doorway and one locked relic room
- a castle gatehouse aligned to a wall run with two valid exits
- a riverside bridge crossing with a toll or troll requirement

### 12.2 Suggested request surface

A future structure factory request should probably include at least:

- **structure family** — hut, cottage, church, cathedral, shop, market stall, tower, gatehouse, castle hall, etc.
- **size / footprint** — small, medium, large, or explicit tile footprint
- **orientation** — north/south/east/west or wall-axis alignment
- **variation seed** — to keep structures repeatable but not identical
- **material/style set** — rustic, fortress, cathedral, ruin, merchant, biome-specific, etc.
- **progression role** — decorative, soft barrier, hard barrier, sector anchor, quest destination, boss approach, safe zone, vendor zone
- **entrance policy** — number of exits, which side they appear on, whether any are locked
- **state variant** — intact, ruined, burned, abandoned, holy, occupied, fortified

### 12.3 Suggested output surface

The factory should return more than visuals. It should return structure metadata the solver can reason about:

- Nano placements / overlays to render
- occupancy and walkability map contribution
- barrier edges contributed by the structure
- entrance/exit anchors and their requirements
- interior anchors for loot, NPCs, quizzes, doors, treasure, altars, beds, shops, etc.
- optional sector tags such as `compound`, `church-precinct`, `market-lot`, `outer-ward`, `inner-keep`

### 12.4 Where it fits in the generation stack

The clean planning model is:

1. **Macro/world-unit solver** lays out regions, rivers, roads, and major barrier belts.
2. **Progression solver** decides which exits are open, locked, conditional, or staged.
3. **Structure factory** fills chosen locations with composite buildings/compounds that respect those barriers and exits.
4. **Nano renderer/material pipeline** draws the resulting primitives and overlays.

That keeps responsibilities clean:

- the solver owns topology
- the progression layer owns requirements
- the structure factory owns building recipes
- the renderer owns final appearance

### 12.5 Planning consequence

If this abstraction is adopted, the art backlog becomes much more reusable.

Instead of creating ten one-off building sprites, the project creates:

- 3 to 5 wall/material families
- a door/gate/bridge passage family
- a roof/cap overlay family
- several detail overlay sets
- a catalog of composite recipes that the structure factory can assemble on demand

That is a better match for procedural generation and a better long-term fit for Nano tiles.

---

## 13) Suggested translation map from legacy assets to Nano families

| Legacy v1 asset | Best Nano-era destination |
|---|---|
| `wall` | `stone-wall` or a future castle-wall family |
| `door_locked` / `door_open` | gate/door module within wall families |
| `fence` | `fence` Nano family |
| `bridge` | `bridge` or `troll-bridge` family |
| `house` | cottage / homestead assembly |
| `hut` | primitive hut / homestead assembly |
| `shop*` | market/shop assembly family |
| `quiz_gate` / `toll_gate` | gate skins / logic states on top of passage assets |
| `outhouse` | settlement support prop |
| `barricade` | light structural obstacle family |

---

## 14) Recommended production order

If the goal is to grow the Nano architecture into the game's next structural art layer, the most efficient order looks like this:

1. **Finish `stone-wall` as the gold-standard extruded family**
2. **Finish `gate` + `bridge` + `troll-bridge` as progression-aware passage assets**
3. **Finish `fence` as the lightweight enclosure family**
4. **Promote `homestead-wall` into a real cottage/hut/home kit**
5. **Promote `cathedral-wall` into a real cathedral/church/ruin kit**
6. **Spin out castle/fortification kit** from wall, bastion, tower, gatehouse, and corridor templates
7. **Add settlement/civic variants**: shops, market squares, yards, gardens, outhouses, support props

That sequence reuses the same underlying architecture instead of inventing bespoke one-off assets for every building.

---

## 15) Bottom line

The repo already contains the beginnings of a coherent structural asset stack:

- **legacy gameplay nouns** for houses, huts, shops, walls, fences, bridges, and gates
- **Nano kinds** for modular structural rendering
- **assemblies** for homestead and cathedral-scale structures
- **template library evidence** for castles, bastions, towers, gatehouses, courtyards, gardens, and market spaces
- **solver/progression evidence** for bounded regions, staged exits, and requirement-bearing passage primitives

The missing piece is not imagination; it is **turning these named concepts into consistent modular art families with reusable materials**.

Just as importantly, the generator should treat those structural families as **gameplay topology**:

- barriers define sectors
- gates/doors/bridges define exits
- larger structures are composite recipes
- a future structure factory should let the world builder request those recipes declaratively

The highest-value families to build next are:

1. stone/castle walls  
2. gates and bridges  
3. fence and yard kits  
4. homestead / hut / cottage kits  
5. cathedral / church / ruin kits

Once those exist, most of the planned world-unit templates already in the repo can be expressed using the Nano architecture instead of placeholder sprites.

---

## Sources consulted

- `src/config/assets.config.ts`
- `src/asset-sprites.ts`
- `src/config/biomes.config.ts`
- `src/config/tiles.config.ts`
- `src/gen.ts`
- `src/mechanics.ts`
- `src/nano-tile-defs.ts`
- `experiment/isometric-2.0/README.md`
- `experiment/isometric-2.0/src/chunk.ts`
- `experiment/isometric-2.0/src/types.ts`
- `experiment/isometric-2.0/src/assemblies.ts`
- `experiment/isometric-2.0/src/solver.ts`
- `experiment/isometric-2.0/src/textures/stone-brick.ts`
- `experiment/isometric-2.0/src/textures/stone-stub.ts`
- `experiment/isometric-2.0/AiTools/scene-registry.ts`
- `Docs/Iso2.0-HonestResearchAndPlan.md`
- `Docs/WorldEngine-03-SolverPipeline.md`
- `Docs/WorldEngine-04-RenderingPipeline.md`
- `Docs/WorldEngine-05-PopulationAndProgression.md`
- `Docs/DevelopmentFeedback.md`