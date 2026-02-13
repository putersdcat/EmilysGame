# Emily's Game — World Engine: Edge Contracts and Constraint Propagation

## 1. Overview

Every tile in the world — micro, world unit, or macro — must sit next to its neighbors without producing visual seams, logical contradictions, or gameplay impossibilities. The **edge contract system** is the formal mechanism that governs these adjacency relationships across all three tiers of the spatial hierarchy.

This document defines the contract system in full: what contracts are, how they are declared and checked, how constraint propagation reduces the search space during generation, how corners and junctions are handled, what happens when no valid placement exists, and how all of this works in a streaming infinite world where only one side of a boundary may exist when a tile is being placed.

---

## 2. What Is an Edge Contract?

An edge contract is a declaration by a tile of what it "offers" and "expects" at each of its four borders (north, south, east, west). Two tiles can be placed next to each other if and only if the offering tile's contract on the shared border is **compatible** with the receiving tile's contract on the opposite border.

At its simplest, this is a type-matching check: tile A's east border says "water" and tile B's west border says "water" → compatible. Tile A's east border says "water" and tile B's west border says "wall" → incompatible.

But real-world contracts have multiple dimensions, and compatibility is more nuanced than simple equality. The system must support:

- Types that are compatible with multiple other types (water is compatible with water and with shore; open is compatible with open, shore, and fence-gap)
- Types that are directionally asymmetric (a gate presents "wall" on the sides parallel to the wall but "conditional-open" on the sides perpendicular to it)
- Types that carry additional information beyond the base type (a river segment's edge is "water flowing north" which is compatible with "water flowing north" but not "water flowing south" if we enforce flow direction — a future refinement)
- Partial borders where only some micro tiles along the edge are constrained (the bottom-left 3 cells of a north border are water, the upper-right 2 are grass)

---

## 3. Contract Dimensions

Every edge contract consists of multiple dimensions that must all be satisfied simultaneously for compatibility. Incompatibility in any single dimension is sufficient to reject a placement.

### 3.1 Surface Continuity

The most basic dimension: the visual terrain type must not change abruptly without a transition. Grass must meet grass (or a grass-to-water shore transition, or a grass-to-dirt blend). Stone wall must meet stone wall (or a wall terminator, or a wall-to-open cap).

Surface continuity failures are the most visually obvious kind of error. A river that suddenly becomes wall at a tile boundary looks broken. Even if the gameplay logic is fine (both sides are non-walkable), the visual discontinuity destroys immersion.

**Contract tag vocabulary for surface continuity:**
- `open` — Any walkable natural ground surface (grass, dirt, sand, stone floor). Compatible with other `open` tags and with `shore`, `fence-gap`, and `path`.
- `water` — Water surface. Compatible with `water` and `shore`.
- `wall` — Solid wall face. Compatible with `wall` and `wall-cap`.
- `fence` — Fence segment. Compatible with `fence` and `fence-post`.
- `shore` — Water-to-land transition. Compatible with `water` on the water side and `open` on the land side.
- `wall-cap` — Wall terminator. Compatible with `wall` on the wall side and `open` on the open side.
- `fence-post` — Fence post terminator. Compatible with `fence` on the fence side and `open` on the open side.
- `path` — Designated walkable path (dirt, stone). Compatible with `open` and `path`.
- `gate` — Gate or door within a wall. Presents `wall` on the parallel axis and `open`/`conditional` on the perpendicular axis.

### 3.2 Traversal Continuity

The walkability state must not create impossible or misleading situations at boundaries. If the last row of tile A is fully walkable, the first row of tile B should not be a solid wall with no gaps — that would create a dead end visible only after the player has already committed to moving in that direction.

Traversal continuity operates at a coarser grain than surface continuity. It does not require exact match of walkable/blocked cells at every position along the border; it requires that movement channels declared by one tile align with movement channels declared by its neighbor.

**Contract declarations for traversal continuity:**
- *Through-channel present* — At least one walkable cell exists along this border, and it connects to the tile's interior. The neighboring tile must also present a through-channel on the shared border.
- *Through-channel absent* — No walkable cells along this border, or walkable cells exist but do not connect to interior routes. This is legal (a wall boundary) but the solver must ensure alternative routes exist at the macro level.
- *Through-channel conditional* — A walkable path exists but requires solving a condition (gate, quiz, toll). The progression solver must ensure the condition is satisfiable.

### 3.3 Height Continuity

Adjacent tiles should not create impossible height transitions. A 0-height grass tile next to a 10-height cliff face is visually jarring. Height continuity requires that height differences across borders are within a specified maximum step size.

For the MVP, height continuity is enforced loosely: base terrain tiles (height 0) can border any other tile, and elevated structures (walls, doors) are expected to have their own visual capping that handles the transition. Future refinements may enforce smoother height gradients.

**Contract declarations for height continuity:**
- Edge height profile: a vector of 5 height values (one per micro tile along the border) for world unit edges, or a single average/max height value for simplified checking.

### 3.4 Semantic Continuity (Chain Integrity)

For chain features (rivers, walls, fences, paths), semantic continuity means the chain must not break at a boundary without an explicit termination. If a river enters a tile from the west, it must either exit from another edge (continuing the chain) or terminate within the tile (ending in a pond or marsh).

Semantic continuity is checked at the world unit level and validated at the macro level:
- A world unit declaring `chainType: 'river'` with `edgeTag: { w: 'water' }` must internally connect that western water edge to either another border's water edge (chain continuation) or a terminator cell (chain end).
- The macro solver tracks active chains and ensures every chain started is eventually terminated.

**Contract declarations for semantic continuity:**
- *Chain entry/exit pairs* — Which borders have chain edges and what chain type they carry. A "river straight north-south" has chain entries on north and south.
- *Terminal flag* — Whether this tile terminates a chain (no chain exits despite having a chain entry).
- *Chain type* — The semantic identity of the chain (river, wall, fence, path). Only same-type chains can connect.

---

## 4. Compatibility Logic

### 4.1 The Compatibility Table

At the core of the edge contract system is a **compatibility table**: a lookup that, given two edge tags and a direction, returns whether they can be adjacent.

For the simplified MVP system, the compatibility table is symmetric (if A is compatible with B, then B is compatible with A on the opposite border) and looks like this:

| Tag A (East) | Tag B (West) | Compatible? | Notes |
|:---:|:---:|:---:|---|
| open | open | Yes | Standard ground-to-ground |
| open | water | No | Abrupt terrain change |
| open | shore | Yes | Shore transitions to open |
| open | wall | No | Need wall-cap |
| open | wall-cap | Yes | Wall terminates cleanly |
| open | fence | No | Need fence-post |
| open | fence-post | Yes | Fence terminates cleanly |
| open | path | Yes | Path connects to open |
| open | gate | Yes | Gate opens toward open |
| water | water | Yes | River continuation |
| water | shore | Yes | Water meets shore |
| wall | wall | Yes | Wall continuation |
| wall | wall-cap | Yes | Wall terminates |
| wall | gate | Yes | Gate is in a wall |
| fence | fence | Yes | Fence continuation |
| fence | fence-post | Yes | Fence terminates |

All other combinations not listed are incompatible by default.

### 4.2 Multi-Cell Border Matching

For world unit tiles, each border has 5 micro tiles. The simplified system collapses these to a single dominant tag per border. The full system compares each of the 5 positions:

Position 0 of tile A's east border must be compatible with position 0 of tile B's west border. Position 1 with position 1, and so on.

This allows mixed borders: a world unit whose northern border has 3 grass cells and 2 water cells can neighbor a unit whose southern border also has 3 grass cells and 2 water cells in the same positions — even though the overall "dominant" tag might be ambiguous.

Multi-cell matching is computationally more expensive but produces much higher visual quality. The MVP can start with single-tag matching and evolve to multi-cell matching as the world unit library grows.

### 4.3 Direction Sensitivity

Edge contracts are directional. Tile A's east edge is compared to tile B's west edge, never to tile B's north edge. This seems obvious but has subtle implications:

- A river that flows north-south presents "water" on its north and south borders but "open" on its east and west borders. These are different contracts on different sides of the same tile.
- A gate in an east-west wall presents "wall" on its east and west borders and "open" (or "conditional") on its north and south borders.
- Rotating a tile swaps its edge contracts: a 90° clockwise rotation maps north→east, east→south, south→west, west→north.

The compatibility table must be consulted with the correct directional pairing.

---

## 5. Corner and Junction Governance

Edges are not the only adjacency relationship. Where four tiles meet at a corner, the corner creates additional constraints that edge-pair checking alone cannot guarantee.

### 5.1 The Corner Problem

Consider four tiles meeting at a point:

```
  A | B
  -----
  C | D
```

Edge contracts check:
- A's east vs. B's west
- A's south vs. C's north
- B's south vs. D's north
- C's east vs. D's west

But they do not check the **corner cell** — the southeast cell of A, the southwest cell of B, the northeast cell of C, and the northwest cell of D all meet at a single point. If A's corner cell is water, B's corner cell is wall, C's corner cell is grass, and D's corner cell is water, the visual result is a chaotic four-way transition that no auto-tiling system can handle gracefully.

### 5.2 Corner Coherence Rules

To prevent corner chaos:

**Rule 1: At most two surface types may meet at any corner.** If A and D are water while B and C are grass, that's a valid two-type corner (diagonal water transition). But water-wall-grass-fence at a single corner is forbidden.

**Rule 2: No "pinch" corners.** A pinch occurs when two diagonally opposite tiles share a type (creating a one-cell diagonal connection) while the other two tiles are incompatible. For example, water in A and D with wall in B and C creates a "pinch" where water connects diagonally through a wall intersection, which is visually nonsensical and creates pathfinding ambiguity.

**Rule 3: Chain corners must be continuous.** If a river passes through a corner (water in A's southeast and D's northwest), the chain must be traceable through connected cells, not a diagonal jump. This means either B or C (or both) must also have water cells adjacent to the corner point.

### 5.3 Junction Resolution

When more than two tiles share an edge or corner, particularly at world unit or macro tile boundaries, the junction between them can create complex multi-way transitions. The system handles these through **junction priority**:

1. Chain features (rivers, walls) have highest priority. If a river passes through a junction, all tiles at the junction must accommodate the water cells.
2. Terrain priority ordering (water > wall > fence > path > open) determines which surface type dominates at ambiguous junctions.
3. If no priority resolution produces a valid corner, the solver replaces the most recent tile placement with a universal adapter (open/grass clearing) that is compatible with everything.

### 5.4 Practical Simplification for MVP

Full corner governance is computationally expensive and requires tracking four-way relationships. For the MVP, the following simplification is sufficient:

- At the micro tile level, corners are handled by auto-tiling (the bitmask-based transition tile system described in the Rendering Pipeline document). The auto-tiler naturally produces coherent corner transitions if the underlying cell types are reasonable.
- At the world unit level, world unit templates that are well-authored (with clean borders as described in Document 01) naturally produce clean corners. The constraint is that border cells should match the declared edge type, which prevents pathological corner cases.
- At the macro level, corner governance is not explicitly checked. The edge contract system between adjacent world units within a macro tile handles the two-edge case; the four-way corner case is handled statistically by the fact that edge-compatible tiles tend to produce corner-compatible results.

As the system matures, explicit corner checks can be added to the world unit solver without changing the fundamental architecture.

---

## 6. Constraint Propagation

### 6.1 What Constraint Propagation Achieves

Constraint propagation is the process by which placing one tile reduces the set of valid tiles at neighboring positions. It is the mechanism that makes the solver efficient — instead of trying every possible tile at every position and backtracking on failure, propagation proactively eliminates invalid options before they are tried.

Without propagation: the solver places tiles one at a time, checking only the immediate neighbor that was just placed. It may fill half the grid before discovering that a configuration painted it into a corner, requiring expensive backtracking.

With propagation: the solver places a tile, immediately updates the "possibility set" of every affected neighbor, and those updates cascade through the grid. Positions far from the placed tile may have their possibility sets reduced or even collapsed to a single option. The solver has much less searching to do because impossible configurations are eliminated early.

### 6.2 Possibility Sets

Each unfilled position in the solver's grid has a **possibility set** — the list of all world unit tiles that could legally go there, given the current state of the grid. At the start of macro tile assembly (with no constraints), every position's possibility set is the full world unit library. As tiles are placed and constraints propagate, possibility sets shrink.

When a position's possibility set shrinks to exactly one tile, that tile is automatically placed (this is called "deterministic collapse"). When a position's possibility set shrinks to zero, a contradiction has occurred and the solver must take recovery action.

### 6.3 Propagation Mechanics

When a tile T is placed at position (r, c):

1. For each neighbor position (north: r-1,c; south: r+1,c; east: r,c+1; west: r,c-1):
   - Examine the placed tile's edge contract on the side facing that neighbor
   - Remove from the neighbor's possibility set any tile whose opposite-side edge contract is incompatible
   - If the neighbor's possibility set changed, add it to a propagation queue

2. Process the propagation queue:
   - For each queued position, re-examine all its neighbors (excluding the already-placed tiles)
   - For each unplaced neighbor, check whether the reduced possibility set at the queued position still supports every tile in the neighbor's possibility set
   - A tile W remains in the neighbor's possibility set only if there exists at least one tile in the queued position's possibility set that is compatible with W on the shared edge
   - If any tiles were removed from the neighbor's possibility set, add the neighbor to the propagation queue

3. Continue until the queue is empty (stable state) or a contradiction occurs (some position has an empty possibility set).

This is an adaptation of the **AC-3 arc consistency algorithm** from constraint satisfaction theory, applied to the 2D grid domain.

### 6.4 Propagation at Each Scale

**Micro-to-micro propagation** is not typically needed during generation because micro tile placement is determined by world unit templates. However, it is implicitly present in the auto-tiling system (which computes transition tiles based on neighbor types) and in the passability enforcement (which considers neighborhood walkability when carving paths).

**World-unit-to-world-unit propagation** is the primary propagation scale. This occurs during macro tile assembly. It is where the edge contract system does most of its work. The typical vocabulary size (50–100 world unit variants after rotations) and grid size (5×5 = 25 positions) makes AC-3 propagation very fast — a full macro tile typically resolves in well under a millisecond on modern hardware.

**Macro-to-macro propagation** is limited in scope because adjacent macro tiles are generated sequentially, not simultaneously. When generating a new macro tile, the already-generated neighbor's edge contracts serve as fixed boundary conditions, not as propagation sources. There is no cascade back into already-generated tiles. This is deliberate: in a streaming infinite world, you cannot afford to propagate constraints backward through the entire generated world.

### 6.5 Propagation Ordering Strategy

The order in which positions are filled affects how much propagation work is needed and how often contradictions occur. Good ordering strategies:

**Most-constrained first:** Fill the position with the smallest possibility set first. This is the "minimum remaining values" (MRV) heuristic from CSP theory. It tends to trigger the most propagation early, collapsing the rest of the grid quickly.

**Boundary-first:** Fill border positions (which are constrained by neighboring macro tiles) before interior positions. This grounds the solution in hard constraints before filling the creative middle.

**Chain-first:** If a chain feature (river, wall) enters the macro tile from a boundary, the solver should trace the chain's path first, placing chain-type world units along the expected route, before filling the remaining positions with non-chain tiles. This prevents the chain from being blocked by incompatible tiles placed in its path.

The recommended composite strategy is: **boundary → chains → most-constrained remaining → unconstrained fill**.

---

## 7. Backtracking and Recovery

### 7.1 When Contradictions Occur

A contradiction occurs when a position's possibility set becomes empty — no valid world unit tile can be placed. This can happen because:

- Over-constraining: too many placed neighbors with incompatible requirements (one neighbor demands water, another demands wall)
- Insufficient library coverage: the world unit library simply doesn't contain a tile that satisfies the required combination of edge contracts
- Chain dead-ends: a chain was extended into a corner where it can neither continue nor terminate

### 7.2 Recovery Strategies (Ordered by Preference)

**Strategy 1: Targeted Replacement**
Identify the most recent placement that caused the contradiction. Replace it with a more flexible tile (typically an open/grass clearing that is compatible with everything). Re-run propagation from the replacement point.

This is the cheapest recovery. It preserves most of the already-assembled macro tile and only undoes the problematic placement.

**Strategy 2: Local Region Restart**
If targeted replacement doesn't resolve the contradiction (because the problem is systemic to the region), clear a 3×3 area around the contradiction point and re-solve that sub-region. The surrounding tiles' edge contracts serve as boundary conditions for the sub-solve.

This is more expensive but handles cases where multiple placements collectively created an impossible situation.

**Strategy 3: Full Macro Tile Restart**
If local recovery fails after a budget of attempts, discard the entire macro tile and regenerate from scratch with a slightly modified entropy seed (increment a counter appended to the seed). This should be rare if the world unit library is well-designed and the compatibility table has good coverage.

**Strategy 4: Degrade to Perlin Fill**
If multiple full restarts fail (indicating a fundamental library gap), fall back to the current generation behavior: Perlin noise for base terrain with random template stamping. This produces a less coherent but still playable result and prevents the game from stalling during generation.

### 7.3 Contradiction Budgets

To prevent generation from hanging, the solver should enforce time and iteration budgets:

- Maximum propagation iterations per macro tile: a configurable limit (suggested starting point: 1000)
- Maximum backtrack events per macro tile: a configurable limit (suggested: 5 targeted replacements, then 2 local restarts, then 1 full restart, then degrade)
- Maximum total generation time per macro tile: a wall-clock timeout (suggested: 50ms, matching one visual frame at 20 FPS)

These budgets are debug-tunable and should be reported in the solver confidence metadata (Document 01, section 3.3.2).

---

## 8. Streaming World Compatibility

### 8.1 The Streaming Challenge

Emily's Game generates the world incrementally as the player explores. New terrain is created when the player approaches the edge of the known world. This is fundamentally different from generating a complete map upfront — the solver cannot reason about the entire world simultaneously.

The edge contract system must work in a streaming context, which imposes specific constraints:

### 8.2 One-Way Constraint Flow

When generating a new tile adjacent to an already-existing tile, the existing tile's edge contract is a **hard boundary condition** on the new tile. The new tile must satisfy the existing tile's contract. The existing tile is never modified to accommodate the new tile.

This one-way flow is essential for:
- **Cache stability**: Already-rendered terrain is cached and displayed. Retroactive changes would require re-rendering and would visually "pop" to the player.
- **Gameplay state integrity**: Items, NPCs, and obstacles placed in existing tiles cannot be invalidated by changes to their spatial context.
- **Memory efficiency**: Old tiles can be evicted from memory and regenerated deterministically from their seed without concern that their content depends on later-generated neighbors.

### 8.3 Deferred Constraint Recording

When a new tile is generated and presents a specific edge contract on a border that faces **ungenerated territory**, the solver should record this contract as a **deferred constraint**. When the neighboring tile is eventually generated, it will consult the deferred constraint to determine its boundary conditions on the shared border.

Deferred constraints are lightweight data structures (just edge tags and positions) that can be stored alongside the chunk/macro tile data or in a separate spatial index.

### 8.4 Universal Adapter Tiles

To prevent dead-end situations where deferred constraints create impossible configurations (a tile was generated with water on its east border, but when the eastern territory is later generated, the biome there is cave with no water at all), the system must include **universal adapter tiles** — world unit tiles whose edge contracts are compatible with any edge type.

The simplest universal adapter is an open/grass clearing with all edges set to `open`. Since `open` is compatible with `shore`, `wall-cap`, `fence-post`, `path`, and `gate`, the adapter can bridge most transitions. For water edges specifically, an additional adapter ("shore transition") that presents water on the constrained side and open on all others provides a graceful degrade.

Universal adapters are a fallback, not a design goal. A well-stocked world unit library will rarely need them. Their existence prevents the generator from stalling.

### 8.5 Generation Order and Seam Prevention

In a streaming world, the generation order is determined by the player's movement. The first tile generated is at the player's spawn point. Subsequent tiles are generated in a roughly expanding ring around the player.

This means tiles at "frontiers" (borders of the generated world) have fewer constraints than tiles in the "interior" (surrounded by already-generated tiles). Frontier tiles have 1–2 constrained borders; interior tiles may have 3–4.

The solver should take advantage of this: frontier tiles have more freedom to establish the direction of new chains, set biome transitions, and introduce novel structures. Interior tiles are more constrained and should focus on satisfying boundary conditions and maintaining continuity.

---

## 9. Auto-Tiling and Terrain Transitions

### 9.1 Why Auto-Tiling Is Necessary

Edge contracts ensure logical compatibility (water meets water, wall meets wall). But the visual rendering of the boundary between different terrain types requires additional work. A grass cell directly adjacent to a water cell produces an ugly hard edge if both are rendered as flat-filled squares. Auto-tiling generates smooth visual transitions — curved shorelines, tapered wall ends, rounded corners — from the logical adjacency data.

### 9.2 The Bitmask Method

For each micro tile cell, examine its cardinal and diagonal neighbors. Assign a bit to each neighbor that shares the same surface type. The resulting bitmask (4-bit for cardinal only, 8-bit for cardinal + diagonal) indexes into a lookup table of visual variants.

For a basic cardinal bitmask (4 bits, 16 configurations):
- Bit 0 (north): neighbor is same type
- Bit 1 (east): neighbor is same type
- Bit 2 (south): neighbor is same type
- Bit 3 (west): neighbor is same type

Bitmask 0 (no same-type neighbors): isolated cell, use "island" variant.
Bitmask 15 (all same-type neighbors): interior cell, use "full" variant.
Bitmask 5 (north and south): corridor, use "straight N-S" variant.
And so on.

For the 47-tile diagonal-aware method, diagonal bits are included but only relevant when both adjacent cardinal neighbors are also the same type (you only need a corner transition when both edges are already matched).

### 9.3 Transition Tile Art Requirements

Each surface type in the game needs a set of transition tiles:
- Full interior tile (surrounded by same type on all sides)
- 4 edge transition tiles (one edge borders a different type)
- 4 outer corner transition tiles (one corner borders a different type)
- 4 inner corner transition tiles (same type on edges, different type on corner)
- Optionally: thin variants (corridor, peninsula, single-cell island)

For N surface types, this requires approximately 13 transition tiles per type, not per type-pair. The transition is rendered as an alpha-blended overlay on the base terrain, so grass-water and grass-stone transitions use the same grass edge tiles.

### 9.4 Integration with the Cache Pipeline

Auto-tiling adds visual variants to the micro tile layer. These variants are computed once when the chunk is first generated and stored as part of the cell data (either as a variant key or as a pre-rendered canvas). They are then included in the terrain cache described in Document 04.

Auto-tiling does not change any metadata — it is a purely visual post-processing step. A grass cell with a water shore variant is still a grass cell for traversal, collision, decoration eligibility, and edge contract purposes.

---

## 10. Summary

The edge contract system is the connective tissue of the world engine. It operates at every scale:

- **Micro tiles** declare edge connector signatures that govern terrain transitions and auto-tiling
- **World unit tiles** declare border edge signatures that govern structural adjacency and chain continuity
- **Macro tiles** declare edge contracts that govern regional coherence and streaming-world stitching

The system uses constraint propagation (AC-3) to efficiently reduce the search space during generation, backtracking with targeted recovery to handle contradictions, and universal adapter tiles to prevent deadlocks in streaming world generation.

The MVP can start with a simplified single-tag-per-border matching system and evolve toward full multi-cell border matching and explicit corner governance as the world unit library grows and visual quality demands increase.

Refer to Document 03 for the complete multi-solver generation pipeline that uses edge contracts as its primary constraint mechanism.
