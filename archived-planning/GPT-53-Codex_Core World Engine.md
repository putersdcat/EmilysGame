

# Emily’s Game — Refined World Generation Architecture (Micro → World Unit → Macro)

## 1) Purpose and Scope

This document defines the next-generation world engine architecture for Emily’s Game, centered on a three-tier spatial hierarchy:

- **Micro Tiles** (atomic art/logic cells)
- **World Unit Tiles** (5×5 micro composites)
- **Macro Tiles** (5×5 world-unit composites)

It describes how these layers should be generated, stitched, validated, cached, and rendered while preserving gameplay logic, player physics, and performance goals.

This scope covers the **base world map layer** first, then the secondary population layers (decorative sprites, NPCs, keys, doors, interactive gates), and finally global solvability validation.

---

## 2) Current Foundation (What Exists Today)

The current engine already has important pieces to build on:

- Chunk-based world generation (32×32 cells)
- Perlin/noise-based base terrain with entropy seeding
- Sparse 5×5 template stamping for structured features (river/wall/bridge/gate patterns)
- Playability safeguards (passability enforcement and obstacle-item balancing)
- Isometric pre-rendered terrain cache per chunk
- Separate dynamic draw command path (with optional WASM assist)

This means the project is **not starting from zero**. The required evolution is to formalize and scale what is currently ad-hoc into a fully layered, rule-driven world grammar.

---

## 3) Spatial Hierarchy Definition

## 3.1 Micro Tile Layer (L0)
Micro tiles are the smallest reusable units. They represent texture and local collision semantics.

**Role**
- Visual base texture and local collision behavior
- Primitive connectors for larger structures
- Fine-grain metadata source for traversal and decoration rules

**Required metadata**
- Traversal class (walkable, blocked, conditional, hazardous)
- Height profile (flat, low obstacle, high obstacle)
- Edge connector signature on all four sides
- Surface type (grass, dirt, stone, water, bridge deck, gate face, etc.)
- Decoration eligibility tags (can host flowers, can host NPC, can host item, etc.)
- Variation family reference (for artistic diversity without logic drift)

## 3.2 World Unit Tile Layer (L1, 5×5 Micro)
World Unit Tiles are authored/generated local motifs that create meaningful shape language.

**Role**
- Introduce local structure: bends, corridors, barriers, crossings, pockets, plazas
- Preserve local coherence through edge signatures
- Carry transform-safe variants (rotation/flip where legal)

**Required metadata**
- Full 5×5 traversal mask and movement channels
- Border edge signatures (north/south/east/west)
- Internal anchor points (spawn anchors, gate anchors, bridge centerline, scenic anchors)
- Connectivity class (river-chain, wall-chain, path-chain, enclosure, terminal)
- Transform permissions (rotatable, flippable, constrained orientation)
- Minimum internal openness and guaranteed local route hints

## 3.3 Macro Tile Layer (L2, 5×5 World Units = 25×25 Micro)
Macro tiles become the principal procedural assembly unit for coherent world zones.

**Role**
- Build gameplay-relevant local “chapters” of terrain
- Solve route flow, obstacle pacing, and thematic continuity
- Produce robust boundaries for stitching to neighboring macros

**Required metadata**
- Macro edge contracts (stitched from world-unit border states)
- Mandatory entrances/exits and route corridors
- Progression landmarks (gate corridor, key region, NPC checkpoint, safe pocket)
- Difficulty/biome profile
- Solver confidence and repair history markers (for debugging and quality control)

---

## 4) Edge Solver Architecture (All Levels)

A single concept should govern stitching at every scale: **edge contracts**.

## 4.1 Edge Contracts
Every tile unit (micro/world-unit/macro) declares side contracts:
- Surface continuity class
- Traversal continuity class
- Height transition class
- Connector polarity (open/closed/conditional)

## 4.2 Compatibility Logic
Edges are valid only when all mandatory dimensions align:
- Visual continuity
- Traversal continuity
- Height continuity
- Semantic continuity (for chains like rivers/walls/fences)

## 4.3 Corner and Junction Governance
In addition to edge matching, every placement must pass corner/junction sanity:
- No illegal corner pinches
- No impossible one-cell traps unless intentionally flagged
- No broken channels for chain structures (river/wall path integrity)

---

## 5) Multi-Solver Stack (Generation and Validation)

## 5.1 Solver A: Micro Adjacency Solver
Ensures neighboring micro tiles produce legal seams and coherent local collision/height transitions.

## 5.2 Solver B: World Unit Constructor
Constructs or selects valid 5×5 world units with transform-aware edge signatures and internal movement guarantees.

## 5.3 Solver C: Macro Assembly Solver
Builds 5×5 world-unit macro structures from biome/theme intent and route obligations.

## 5.4 Solver D: Progression Logic Solver
Places keys, doors, gates, bridges, and challenge chokepoints so the level is logically completable and pacing feels intentional.

## 5.5 Solver E: Population Solver
Places decorations, NPCs, and interactables according to traversal safety, visibility, narrative role, and density budgets.

## 5.6 Solver F: Playability Validator + Repair
Final pass verifies:
- Reachability from entry to target routes
- No softlocks from key/door dependency ordering
- No isolated mandatory content
- Acceptable dead-end ratio
- Traversal fairness and recoverability

If validation fails, perform targeted repair (not full reroll unless repair budget is exhausted).

---

## 6) Transform and Permutation System

To support “many permutations” while maintaining quality:

- Use canonical world-unit archetypes with controlled transform families
- Allow rotation/flip only when resulting edge contracts and progression semantics remain valid
- Track transformed lineage for debugging and cache reuse
- Separate visual variation from structural variation so art diversity does not break solver assumptions

---

## 7) Rendering, Pre-Render, Cache, and WASM Responsibilities

## 7.1 Cache Hierarchy
Adopt a layered cache strategy:
- Micro visual atlas cache
- World-unit composite cache
- Macro terrain cache
- Chunk/viewport projection cache (existing path can be extended)

## 7.2 Pre-Render Policy
Pre-render stable base geometry and static terrain composites early.  
Keep dynamic overlays (NPCs, collectibles, temporary states, effects) in lightweight runtime layers.

## 7.3 Invalidation Rules
Invalidate only affected cache scopes:
- Micro variation tweak → dependent world-unit families
- World-unit update → dependent macro variants
- Macro structure edits → neighboring stitch boundaries where contracts changed
- Dynamic gameplay state changes should avoid invalidating static terrain caches whenever possible

## 7.4 WASM Role
WASM should accelerate deterministic high-volume tasks:
- Batch transform and culling
- Sort and visibility command generation
- Optional constraint prechecks for high-frequency validation paths

TypeScript remains orchestration and gameplay authority.

---

## 8) Gameplay Logic Integration Requirements

## 8.1 Key/Door/Gate Coherence
Progression dependencies must follow strict ordering:
- Required key availability before gated bottleneck
- Alternate route policy if hard gate appears too early
- Optional challenge gates clearly distinguished from mandatory progression gates

## 8.2 NPC and Objective Distribution
NPC placement must be semantically contextual:
- Critical NPCs on safe reachable nodes
- Hint/trade NPCs near decision forks or recovery zones
- Avoid clutter in narrow traversal channels

## 8.3 Decorative Layer Discipline
Decorative population must never:
- Block required routes
- Hide critical interaction points
- Increase collision ambiguity

---

## 9) Physics and Player Navigation Alignment

World generation must explicitly honor movement physics:

- Consistent interpretation of walkable/blocked/conditional states
- Predictable bridge, gate, and crossing behavior
- Clearance-aware obstacle placement near corridors
- Avoidance of visual-collision mismatch in isometric projection
- Stable edge-entry points across macro boundaries for chunk streaming continuity

---

## 10) Proposed Modular Organization (Documentation-Level)

To keep iteration clean, organize world-engine responsibilities into modular domains:

- World schema and metadata contracts
- Template libraries and archetype catalogs
- Edge compatibility and stitching validators
- Macro assembly and progression solvers
- Population and semantic placement solver
- Validation and repair framework
- Cache build/invalidation services
- Runtime integration adapter (generation ↔ renderer ↔ mechanics)

This keeps each subsystem replaceable without destabilizing the entire pipeline.

---

## 11) Delivery Phases

## Phase 1: Contract Formalization
Define all metadata contracts and edge compatibility dimensions across micro/world-unit/macro.

## Phase 2: Structured Assembly
Introduce deterministic world-unit and macro assembly with transform-safe permutations.

## Phase 3: Progression and Population Solvers
Integrate lock/key/door/NPC/item logic with guaranteed solvability ordering.

## Phase 4: Validation + Repair
Add full-world coherence checks and targeted repair passes.

## Phase 5: Cache/WASM Optimization
Scale rendering efficiency through multi-level pre-render caches and expanded high-volume WASM tasks.

---

## 12) Definition of Done for the Core World Engine

The system is considered production-ready when:

- Macro tiles stitch seamlessly at visual, traversal, and semantic levels
- Mandatory progression is always logically completable
- No softlocks are observed under seeded stress runs
- Runtime performance remains stable with layered caches active
- Decorative and dynamic population preserves readability and playability
- New biome/theme packs can be introduced by adding data and rules, not rewriting core architecture