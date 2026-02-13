# Emily's Game — World Engine: Multi-Solver Generation Pipeline

## 1. Overview

Generating a playable chunk of world in Emily's Game is not a single step — it is a pipeline of distinct solver phases, each responsible for a different layer of the world's integrity. Each solver phase takes the output of the previous phase as input, adds its own logic, and passes a more complete world to the next phase.

This document describes the complete generation pipeline from the initial LLM entropy input through to a fully populated, validated, renderable chunk of world. It defines the responsibility of each solver phase, the ordering constraints between phases, the inputs and outputs of each, and the failure recovery strategies at each stage.

---

## 2. Pipeline Overview

The full generation pipeline runs when the player approaches ungenerated territory. The pipeline produces one macro tile (25×25 micro cells, organized as a 5×5 grid of world unit tiles) per invocation.

The phases are:

1. **Entropy Harvest** — Obtain entropy from the LLM or fallback RNG
2. **Theme Selection** — Determine biome, difficulty, and mood for this macro tile
3. **Boundary Collection** — Gather edge constraints from already-generated neighbors
4. **Macro Assembly (Solver C)** — Fill the 5×5 world unit grid using constraint-driven selection
5. **Micro Fill and Auto-Tiling** — Fill individual cells and compute terrain transitions
6. **Chain Integrity Check (Solver A/B)** — Verify micro-level adjacency and world-unit-level construction
7. **Progression Placement (Solver D)** — Place keys, doors, gates, and challenge chokepoints
8. **Population (Solver E)** — Place decorations, NPCs, and interactables
9. **Playability Validation and Repair (Solver F)** — Final pass for reachability and solvability
10. **Cache Preparation** — Pre-render terrain to cache for the rendering pipeline

Each phase is described in detail below.

---

## 3. Phase 1: Entropy Harvest

### 3.1 Purpose

Obtain a raw entropy string that will seed all subsequent generation decisions for this macro tile. The entropy string should be unique per macro tile position and session, ensuring that the same world position generates the same content within a session but different content across sessions.

### 3.2 Inputs

- Macro tile grid coordinates (the position in the infinite world grid)
- Session wordlist (the 50 verb-noun pairs generated at game start)
- Previous entropy outputs (for chaining and evolution)

### 3.3 Process

The system selects a wordlist pair based on a deterministic hash of the macro tile's grid coordinates. This pair is then expanded into a longer nonsense sentence:

- **Via LLM (preferred):** The verb-noun pair is sent to the local LLM with a prompt requesting 1–2 surreal, nonsensical sentences elaborating on the pair. The LLM's output provides high-variance entropy that carries subtle thematic clustering from its training data — a desirable property that makes adjacent tiles feel loosely related without being identical.

- **Via fallback RNG:** If the LLM is unavailable or responds too slowly (exceeding the configured timeout), the pair itself is hashed using SHA-256 and the hash serves as the entropy source. This produces adequate randomness but lacks the thematic clustering effect.

### 3.4 Outputs

- **Entropy string:** The raw text (or hash) that will be numerically decomposed in subsequent phases
- **Biome seed:** An integer derived from the first 8 hex characters of the entropy hash, used to select the biome
- **Noise seed:** An integer derived from the next 8 hex characters, used to initialize Perlin noise for terrain distribution
- **Feature seed:** An integer derived from the next 8 hex characters, used for feature placement and template selection decisions

### 3.5 Current Implementation Status

This phase exists in the current engine (`src/gen.ts`, `generateChunk` and `generateChunkSync` functions). The LLM expansion path calls `expandEntropy()` from `src/llm.ts`. The fallback path uses `fastHash()` from `src/utils.ts`. The hash decomposition into biome, noise, and feature seeds is already implemented.

---

## 4. Phase 2: Theme Selection

### 4.1 Purpose

Translate the raw entropy into high-level thematic decisions for this macro tile: which biome it belongs to, what mood or character it should have, and what difficulty level it targets.

### 4.2 Inputs

- Biome seed from Phase 1
- Macro tile grid coordinates (for spatial continuity — adjacent tiles should tend toward the same biome)
- Neighboring macro tiles' biome identities (if they exist, for smooth biome transitions)

### 4.3 Process

**Biome determination** is currently a simple modulo operation on the biome seed. The target system should consider spatial coherence: biomes should form contiguous regions, not a checkerboard. This can be achieved through several approaches:

- **Perlin-based biome map:** Use a low-frequency Perlin noise field (different from the terrain noise) to assign biome regions. The biome seed selects which octave/offset of the noise field this macro tile samples. Adjacent tiles sample nearby points, producing smooth biome regions.

- **Neighbor bias:** When a new macro tile is generated, check its already-generated neighbors' biomes. Apply a strong bias (80–90%) toward the dominant neighbor biome, with a small chance (10–20%) of biome transition. This produces organic-looking biome boundaries without requiring a global biome map.

- **LLM thematic clustering:** If the LLM entropy strings for neighboring tiles share linguistic themes (both mention "water" or "darkness"), bias toward biome choices that match those themes. This is the "creative RNG" concept from the original design — LLM hallucination patterns produce emergent thematic regions.

**Mood selection** determines the character of this macro tile within its biome. A meadow biome might be "open and sparse" (lots of clearings), "river-heavy" (many water features), or "enclosed" (fence structures and contained spaces). Mood is derived from the entropy string's character distribution and biases the world unit selection weights in Phase 4.

**Difficulty level** is a function of distance from the player's spawn point (farther = harder) modulated by the biome's base difficulty (cave harder than meadow). Difficulty affects obstacle density, collectible rarity, NPC frequency, and gate prevalence.

### 4.4 Outputs

- **Biome identity:** The biome definition (from the biome library) governing terrain weights, obstacle weights, feature weights, and visual parameters
- **Mood profile:** A set of weight modifiers on world unit selection (river weight +0.3, wall weight -0.2, etc.)
- **Difficulty multiplier:** A scalar affecting obstacle and feature density targets
- **Biome transition flags:** If this macro tile borders a different biome, flags indicating which borders are transition zones

### 4.5 Current Implementation Status

Basic biome selection exists. Mood and difficulty modulation do not exist. Biome spatial coherence is not enforced (biomes are per-chunk random). Biome transition handling does not exist.

---

## 5. Phase 3: Boundary Collection

### 5.1 Purpose

Gather the hard constraints imposed by already-generated neighbor macro tiles. These constraints define what the new macro tile must satisfy along its shared borders.

### 5.2 Inputs

- The new macro tile's grid coordinates
- The world's generated macro tile storage (from which neighboring tiles' edge contracts are read)
- Any deferred constraints recorded during previous generations

### 5.3 Process

For each of the four cardinal neighbors (north, south, east, west):

- If the neighbor exists: read its edge contract on the shared border. This becomes a hard constraint for the new macro tile. The 5 world unit positions along the shared border must each present an edge signature compatible with the corresponding world unit in the neighbor.

- If the neighbor does not exist: no constraint on that border. The new macro tile is free to present any edge on that side. However, the chosen edge should be recorded as a deferred constraint for the neighbor's future generation.

### 5.4 Outputs

- **Boundary constraint map:** For each of the 4 borders, either a hard constraint (5-element vector of required edge compatibility tags) or "unconstrained"
- **Deferred constraint records:** For unconstrained borders, the new macro tile's chosen edge contracts are recorded for future reference

### 5.5 Current Implementation Status

No boundary collection exists. Chunks are generated independently without considering neighbor edges. This is the primary gap between the current system and the target architecture.

---

## 6. Phase 4: Macro Assembly (Solver C)

### 6.1 Purpose

This is the heart of the generation pipeline. Solver C fills the 5×5 world unit grid of the macro tile, selecting a world unit tile for each position such that all edge contracts, chain continuations, and aggregate constraints are satisfied.

### 6.2 Inputs

- Boundary constraint map from Phase 3
- Biome identity and mood profile from Phase 2
- Feature seed and noise seed from Phase 1
- The complete world unit library (with pre-computed rotation variants)
- Active chain state (if chains from neighboring macro tiles enter this one)

### 6.3 Process

**Step 1: Initialize possibility sets**
Every position in the 5×5 grid starts with its full possibility set — all world unit tiles from the library that match the current biome's affinity filter.

**Step 2: Apply boundary constraints**
For positions along constrained borders, reduce their possibility sets by removing any world unit tile whose edge on the constrained side is incompatible with the boundary constraint.

**Step 3: Propagate initial constraints**
Run the AC-3 propagation algorithm (described in Document 02) to cascade the boundary constraint reductions through the grid. Interior positions' possibility sets may shrink as a result.

**Step 4: Establish chain entries**
If boundary constraints include chain entries (a river entering from the north, a wall continuing from the west), mark the entry positions as chain-active. Initialize a chain tracking structure that records chain type, entry position, and expected continuation direction.

**Step 5: Progressive filling**

Using the composite ordering strategy (boundary positions first, chain continuations second, most-constrained remaining positions third, unconstrained fill last):

For each position to fill:
  - Select a world unit tile from the position's possibility set. Selection is weighted by:
    - Biome affinity (tiles native to this biome are preferred)
    - Mood profile weights (river tiles weighted higher in river-heavy mood)
    - Chain obligation (if this position is chain-active, only chain-compatible tiles are candidates)
    - Variety preference (slight weight against tiles that have already been placed elsewhere in this macro tile)
  - Place the selected tile. Record it.
  - Propagate constraints to all neighbors (AC-3 update). If any neighbor's possibility set empties, trigger recovery (see below).
  - If a chain was extended, update chain tracking (has it terminated? Must it continue at the next position?).

**Step 6: Chain termination enforcement**
After all 25 positions are filled, verify that all active chains have been properly terminated. A chain that enters the macro tile must either:
  - Exit through a non-constrained border (to be continued by the eventual neighbor)
  - End at a terminator world unit within this macro tile

If a chain is unterminated and not exiting through a border, the solver must replace a tile along the chain with a terminator variant.

**Step 7: Aggregate constraint check**
Verify that the assembled macro tile meets its aggregate requirements:
  - Total walkable fraction is above the minimum threshold
  - Variety of world unit types meets the minimum
  - Obstacle density is within the target range for the difficulty level

If any aggregate constraint fails, attempt targeted replacement (swap the least constrained position's tile for one that moves the aggregate toward the target).

### 6.4 Outputs

- **Completed 5×5 world unit grid** — Each position assigned a specific world unit tile variant
- **Composed micro cell grid** — The 25×25 micro tile grid derived from the world unit tiles' constitutent cells
- **Macro edge contracts** — The edge signatures of the border world units (for neighbor-facing deferred constraints)
- **Chain exit records** — Any active chains exiting through unconstrained borders (to be recorded as deferred constraints)
- **Solver confidence data** — Number of propagation steps, backtrack events, and recovery actions taken

### 6.5 Failure Recovery

If the solver encounters a contradiction it cannot resolve through targeted replacement or local region restart:

1. Clear the grid, perturb the entropy seed (append a counter to the seed string), and retry from Step 1
2. After 3 full retries, degrade to the current Perlin-fill approach (direct cell generation without world unit structure)
3. Log the failure for debugging (include the boundary constraints that proved unsatisfiable)

### 6.6 Current Implementation Status

No macro assembly solver exists. The current engine generates chunks cell-by-cell using Perlin noise, then stamps 0–3 random world unit templates at non-overlapping positions without edge constraint checking. The target solver would replace this approach entirely for macro-tile-aligned generation, with the Perlin fill serving as the degraded fallback.

---

## 7. Phase 5: Micro Fill and Auto-Tiling

### 7.1 Purpose

After the macro assembly determines the world unit tile at each position, the individual micro tile cells are populated. This phase also handles terrain transitions (auto-tiling) to produce visually smooth boundaries between different surface types.

### 7.2 Inputs

- The 25×25 micro tile grid from Phase 4
- The biome's terrain weight table (for variation selection)
- Noise seed for deterministic visual variation

### 7.3 Process

**Cell population:** For world unit templates that use explicit cell definitions (like a river template that specifies "water" cells in specific positions), the cells are already determined. For templates that use `null` cells ("keep existing" / "fill with biome default"), the Perlin noise system generates appropriate terrain cells using the biome's terrain weights.

**Variation assignment:** For each cell, a deterministic hash of the cell's world-space coordinates selects a visual variant from the cell's variation family. Cell (100, 200) with type "grass" might get variant "grass_c" while cell (101, 200) gets "grass_a". This produces visual diversity without affecting gameplay logic.

**Auto-tiling computation:** For each cell, the system examines cardinal (and optionally diagonal) neighbors to compute a bitmask indicating which neighbors share the same surface type. The bitmask is stored as part of the cell data and used by the rendering pipeline to select the appropriate transition tile sprite.

**Edge blending zones:** Cells along world unit boundaries within the macro tile should have their auto-tiling computed considering the neighboring world unit's cells, not just cells within their own world unit. This prevents visible "seams" at world unit boundaries. Similarly, cells along the macro tile boundary should consider the neighboring macro tile's cells (if generated) for cross-macro auto-tiling.

### 7.4 Outputs

- **Fully populated 25×25 micro cell grid** — Every cell has an assigned asset key, traversal class, height profile, and visual variant
- **Auto-tiling bitmasks** — Per-cell bitmasks for terrain transition rendering
- **Decoration eligibility map** — Per-cell flags indicating what can be placed on top (derived from micro tile metadata)

### 7.5 Current Implementation Status

Cell population from Perlin noise exists (`buildChunkCells` in `src/gen.ts`). Template stamping overwrites cells (`stampTemplates`). Variation assignment does not exist (each tile type has one visual). Auto-tiling does not exist (cells are rendered as flat-filled tile types without transition blending).

---

## 8. Phase 6: Chain Integrity Check (Solvers A and B)

### 8.1 Purpose

After the macro assembly and micro fill, verify that all chain features (rivers, walls, fences, paths) are internally coherent at the micro level and structurally sound at the world unit level. This is a validation step, not a generation step — it catches errors rather than creating content.

### 8.2 Solver A: Micro Adjacency Verification

Scan the 25×25 micro grid and verify that every pair of adjacent cells has compatible edge connectors. Specifically:

- No water cell directly adjacent to a wall cell without an intervening shore or bridge cell
- No wall cell adjacent to an open cell without a wall-cap or transition
- No fence cell adjacent to open without a fence-post
- Chain cells (water, wall, fence) that connect based on their connectable flag actually form continuous chains, not isolated fragments

If violations are found, the repair logic performs minimal edits:
- Insert shore transition cells between water and grass
- Insert wall-cap cells at wall terminations
- Convert orphaned chain cells to their corresponding base terrain (orphaned water cell → grass with a small pond visual variant, if available)

### 8.3 Solver B: World Unit Construction Verification

Verify that each world unit tile, as realized in the micro grid, satisfies the constraints declared in its template definition:
- Traversal mask matches (walkable cells are where the template says they should be)
- Edge signatures are accurate (the actual micro tiles along the border match the declared edge tags)
- Movement channels are functional (a BFS through the world unit's walkable cells confirms that declared channels connect the expected border positions)
- Anchor points are on appropriate cells (NPC anchors on walkable cells, gate anchors on conditional cells)

If violations are found (typically due to cell mutation during auto-tiling or edge blending), repair by restoring the template's specified cells at the violated positions.

### 8.4 Outputs

- Validated (or repaired) micro cell grid
- Chain integrity report (number and type of violations found and repaired)

### 8.5 Current Implementation Status

No explicit chain integrity checking exists. The `enforcePassability` function performs BFS reachability checking but does not verify chain continuity or micro-level adjacency correctness.

---

## 9. Phase 7: Progression Placement (Solver D)

### 9.1 Purpose

Place the key gameplay elements that create the player's progression experience: locked doors, keys, quiz gates, toll gates, bridges with quiz requirements, and challenge chokepoints. The placement must guarantee that the level is logically completable — the player can never reach a lock before having access to its key.

### 9.2 Inputs

- Validated micro cell grid from Phase 6
- World unit tiles' anchor point maps (gate anchors, key region anchors)
- Difficulty profile from Phase 2
- Macro tile's route corridors and progression landmarks

### 9.3 The Lock-and-Key Ordering Problem

This is the most intellectually demanding solver in the pipeline. It must solve an ordering problem: every lock (obstacle requiring a specific condition) must be reachable only after the player can access its key (the item, quiz, or action that satisfies the condition). This means:

- The key must be placed in a region that is reachable from the macro tile's entry points without passing through the lock
- If multiple locks exist, they should be ordered so that solving one lock may give access to the key for the next lock (creating a satisfying chain of progression)
- Lock placement should create chokepoints that feel intentional, not frustrating — the player should understand that the lock is a solvable challenge, not a dead end

### 9.4 Process

**Step 1: Identify gate positions**
Using world unit anchor points, identify all positions where gates/doors/toll points exist in the macro tile. These were placed by the world unit templates themselves (a "wall gate" world unit has a gate at its center cell).

**Step 2: Analyze reachability regions**
Run a BFS from each entry point of the macro tile. For each gate, determine which entry points can reach the gate and which regions the gate separates. This produces a "reachability graph" showing how gates partition the macro tile into distinct regions.

**Step 3: Assign lock types**
Based on the difficulty profile and biome, assign a lock type to each gate:
- Key-locked door (requires a key item found elsewhere)
- Quiz gate (requires answering a quiz correctly)
- Toll gate (requires paying coins)
- Crowbar barricade (requires a crowbar item)

The assignment should vary across gates within a macro tile for gameplay variety.

**Step 4: Place corresponding keys**
For each key-locked gate, place the required key item in a region that is reachable from the macro tile's entry points WITHOUT passing through that gate. This is the critical ordering constraint.

For quiz gates and toll gates, ensure the player has had opportunity to earn coins or prepare (through earlier quiz practice with NPCs) before encountering the gate.

**Step 5: Validate ordering**
Run a simulation walk: starting from each entry point, verify that the player can reach every gate's key before encountering the gate. If a key is placed behind its own gate (ordering violation), swap the key to an accessible region.

**Step 6: Place additional challenge elements**
Place optional challenge elements (extra quizzes, bonus chests, hidden items) in regions that are accessible but off the critical path. These reward exploration without blocking progression.

### 9.5 Outputs

- Placement map of all lock elements (gates, doors, barricades, toll points)
- Placement map of all key elements (keys, crowbars, coin caches)
- Lock-key dependency graph (for debugging and validation)
- Updated cell data with interactable flags and item IDs set

### 9.6 Current Implementation Status

Basic lock-key balancing exists (`balanceObstacles` in `src/gen.ts`). It finds locked doors and spawns keys randomly on walkable cells, and finds barricades and spawns crowbars. However, it does not verify that the key is reachable before the door (no ordering guarantee) and does not reason about reachability regions or progression flow.

---

## 10. Phase 8: Population (Solver E)

### 10.1 Purpose

Populate the world with non-progression elements: decorative sprites (flowers, mushrooms, scenic details), NPCs (merchants, villagers, hint-givers), and collectibles (coins, potions, bonus items). These elements bring the world to life without affecting progression logic.

### 10.2 Inputs

- Cell grid with progression elements placed
- Decoration eligibility map from Phase 5
- Biome feature weights and density targets
- Difficulty profile (affects NPC placement density and collectible rarity)
- World unit anchor points (NPC anchors, scenic anchors, spawn anchors)

### 10.3 Process

**NPC Placement Rules:**
- NPCs should be placed at world unit NPC anchor points when available, otherwise on walkable cells with adequate clearance (not in narrow corridors where they block movement)
- Critical NPCs (merchants, quest-givers) should be on safe, easily reachable nodes — near entry points or along main routes, not in dead ends behind multiple obstacles
- Hint NPCs should be near decision forks or recovery zones (areas where the player might be confused about where to go or might need to restock)
- NPC density should match the biome's NPC rate multiplier
- No more than one NPC per world unit tile (prevents crowding and confusion)

**Collectible Placement Rules:**
- Coins and basic items scatter across walkable cells with decoration eligibility
- Density follows the biome's collectible rate multiplier and the difficulty profile
- Collectibles should not cluster too densely (minimum spacing of 3 cells between items) to encourage exploration
- Bonus items (potions, rare collectibles) should be placed in harder-to-reach areas (behind optional obstacles, in dead-end branches) to reward thoroughness

**Decoration Placement Rules:**
- Decorative sprites place only on cells whose decoration eligibility tags allow them
- Decorations must never block required movement routes (walkable cells with decorations must remain walkable)
- Decorations must not obscure interactable elements (no tree on top of a treasure chest)
- Decoration density follows a natural-feeling distribution — slight clustering (3–5 flowers together, then a gap, then another cluster) rather than uniform scattering
- Biome-appropriate decorations only (flowers in meadow, mushrooms in forest, crystals in cave, flags in castle)

**Ambient Element Placement (Future):**
- Particle effects (fireflies, falling leaves, sparkles) placed at scenic anchor points
- Sound emitters placed in logical positions (water splash near rivers, bird calls in forests)

### 10.4 Outputs

- Updated cell grid with all NPCs, collectibles, and decorations placed
- NPC identity assignments (which persona each NPC has, based on biome and position)
- Decoration density report (for tuning and quality control)

### 10.5 Current Implementation Status

Basic feature placement exists (`placeFeatures` in `src/gen.ts`). It scatters collectibles and NPCs randomly on walkable cells using biome feature weights. There is no anchor-point-based placement, no spacing enforcement, no clearance checking, no decoration eligibility filtering, and no NPC role assignment based on position.

---

## 11. Phase 9: Playability Validation and Repair (Solver F)

### 11.1 Purpose

The final validation pass ensures the complete macro tile is playable: all intended routes are traversable, all progression locks are solvable, no softlocks exist, and the overall difficulty and density meet targets. If validation finds problems, targeted repairs are applied.

### 11.2 Inputs

- Complete cell grid with all elements placed
- Lock-key dependency graph from Phase 7
- Macro tile entry/exit points and route corridor declarations
- Biome and difficulty targets

### 11.3 Validation Checks

**Check 1: Global reachability**
BFS from every entry point. Every required destination (route exits, progression gates, key items, critical NPCs) must be reachable from at least one entry point. If a required destination is isolated (unreachable without crossing a barrier that has no corresponding key), the validation fails.

**Check 2: Progression solvability**
Walk the lock-key dependency graph: verify that for every lock, its key is in a reachable region that does not require passing through the lock. This is a topological sort of the dependency graph — if any cycle exists (key A is behind lock B, and key B is behind lock A), it's a softlock.

**Check 3: Dead-end ratio**
Count dead-end branches (walkable regions accessible from only one direction). Some dead ends are fine (they reward exploration). Too many (more than 30% of navigable area) make the world feel frustrating. The ratio threshold is configurable.

**Check 4: Density targets**
Verify that the placed element densities match the biome and difficulty targets within acceptable tolerance (±20%). Too few obstacles make the world trivial; too many make it frustrating. Too few collectibles make it unrewarding; too many trivialize progression.

**Check 5: Traversal fairness**
The player should not need to traverse the same route more than twice to complete the macro tile's progression (there and back). If the layout requires excessive backtracking (more than 3× the direct path length), the validation flags it.

### 11.4 Repair Actions

Repairs are targeted and minimal — the solver removes or replaces the fewest elements necessary to fix the problem:

- **Isolated region:** Carve a walkable path from the isolated region to the nearest reachable area. Replace non-walkable cells along the path with grass. If the path crosses a wall, insert a gate.
- **Softlock:** Move the offending key to an accessible region. If no accessible region exists, remove the lock (convert the gate to an open door).
- **Excessive dead-ends:** Connect dead-end branches to the main route through carved paths.
- **Density off-target:** Add or remove collectibles/obstacles to bring densities into range.
- **Excessive backtracking:** Add a shortcut path (usually dirt or grass cells replacing obstacles between two route endpoints).

### 11.5 Fail-Safe Degradation

If repairs exceed a configurable budget (more than 10% of cells modified) without achieving validation, the entire macro tile is flagged as "degraded" and regenerated from scratch with a perturbed entropy seed. If 3 regeneration attempts all fail, accept the best-scoring attempt and mark it in solver confidence metadata for later investigation.

### 11.6 Outputs

- **Final validated cell grid** — Ready for rendering and gameplay
- **Validation report** — Which checks passed, which required repairs, what repairs were applied
- **Solver confidence score** — A 0–100 metric summarizing generation quality (100 = no issues, 0 = fully degraded)

### 11.7 Current Implementation Status

Basic BFS reachability enforcement exists (`enforcePassability` in `src/gen.ts`). It checks that 50%+ of cells are reachable from center and carves paths if not. It forces walkable entry points at border midpoints. Lock-key ordering is not checked. Dead-end ratio, density targets, and traversal fairness are not validated.

---

## 12. Phase 10: Cache Preparation

### 12.1 Purpose

After the generation pipeline produces a validated cell grid, the rendering pipeline needs to consume it efficiently. Cache preparation pre-renders the stable base terrain to offscreen canvases and builds the sparse object lists used by the renderer.

### 12.2 Process

- **Terrain cache build:** Render all base-layer micro tiles (terrain, auto-tiling transitions) to an offscreen canvas for this chunk. The renderer will blit this entire canvas in a single `drawImage` call per frame instead of hundreds of individual tile draws.

- **Object cell list build:** Scan the cell grid and create a sparse list of non-base cells (obstacles, NPCs, items, decorations, features). The renderer iterates only this list for dynamic/elevated object drawing, avoiding the cost of scanning all cells.

- **Auto-tiling sprite selection:** For each cell with an auto-tiling bitmask, look up and pre-cache the appropriate transition tile sprite.

### 12.3 Outputs

- Pre-rendered terrain canvas (cached in the terrain cache system)
- Sparse object cell list (cached in the render-side object cell cache)
- Cache metadata (generation stamp, cache key)

### 12.4 Current Implementation Status

Terrain caching exists (`src/terrain-cache.ts`). Object cell caching exists (`src/render.ts`, `getObjectCells`). Auto-tiling sprite selection does not exist.

---

## 13. Pipeline Timing and Budgets

The entire generation pipeline must complete within a performance budget to avoid visible frame drops. Target: the pipeline should complete in under 50ms for synchronous generation (fallback path) and under 200ms for async generation (LLM path, running in the background with the player seeing ungenerated territory filled in asynchronously).

Estimated time budget breakdown:

| Phase | Target Time | Notes |
|-------|-------------|-------|
| Entropy Harvest (sync) | <1ms | Hash computation only |
| Entropy Harvest (async) | <2000ms | LLM inference, running in background |
| Theme Selection | <1ms | Lookup and hash operations |
| Boundary Collection | <1ms | Map lookups |
| Macro Assembly | <10ms | Constraint propagation on 5×5 grid (25 positions × ~100 tile variants) |
| Micro Fill and Auto-Tiling | <5ms | 625 cells, bitmask computation |
| Chain Integrity Check | <2ms | Adjacency scan of 625 cells |
| Progression Placement | <3ms | BFS + dependency graph analysis |
| Population | <2ms | Random placement with density checks |
| Playability Validation | <5ms | BFS + constraint checks |
| Cache Preparation | <20ms | Offscreen canvas rendering |
| **Total (sync)** | **<50ms** | |
| **Total (async)** | **<2050ms** | LLM latency dominates |

These are estimates. Actual timing should be measured and the pipeline tuned to fit within budget on the target hardware (8th Gen Intel i7, 16GB RAM).

---

## 14. Pipeline Modularity

Each phase of the pipeline is designed to be independently replaceable. This means:

- The entropy harvest can switch between LLM and RNG without affecting any other phase
- The macro assembly solver can be swapped from the constraint propagation approach to a simpler random-stamp approach (like the current system) for debugging
- The progression solver can be disabled entirely (just skip Phase 7) to test basic terrain generation
- The population solver can use different density targets without affecting terrain structure
- The validation can be run independently on externally-generated content for testing

This modularity is achieved by defining clear interfaces between phases: each phase's inputs and outputs are documented data structures, not side effects of function calls. A phase receives its inputs as explicit parameters and returns its outputs as explicit values.

---

## 15. Future Pipeline Extensions

The pipeline is designed to accommodate Future phases without restructuring:

- **Biome transition blending (post-Phase 5):** When two adjacent macro tiles have different biomes, a blending pass softens the transition (grass fading to desert sand, trees thinning at forest edges).

- **Lighting and atmosphere (post-Phase 10):** A post-generation pass computes ambient lighting (darker in caves, golden in meadows, blue at night) and applies tinted overlays to the terrain cache.

- **Event and narrative placement (post-Phase 8):** A narrative solver places story-relevant elements (quest objectives, lore fragments, plot triggers) based on the game's current narrative state.

- **Dynamic weather effects (runtime, not generation):** Weather overlays (rain, snow, fog) are applied at render time, not during generation, but the generation pipeline may pre-compute "weather suitability" metadata for the terrain cache.

---

## 16. Summary

The generation pipeline transforms LLM entropy into a complete, playable, renderable world chunk through 10 distinct solver phases. Each phase owns a specific layer of the world's integrity: entropy → theme → boundaries → structure → terrain → chains → progression → population → validation → cache.

The pipeline is incremental (each phase builds on the previous), recoverable (each phase has failure handling), budgeted (time limits prevent stalling), and modular (phases can be replaced or skipped independently).

Refer to Document 04 for how the rendering pipeline consumes the generation pipeline's outputs, and Document 05 for deep dives into the progression and population logic.
