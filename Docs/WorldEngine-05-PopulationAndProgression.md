# Emily's Game — World Engine: Population, Progression, and Gameplay Logic

## 1. Overview

The previous documents describe how the world's physical structure is generated (spatial hierarchy, edge contracts, solver pipeline) and how it is rendered (cache hierarchy, draw commands, WASM acceleration). This document describes what **lives** in the world: the NPCs, items, obstacles, decorations, quizzes, and interactive elements that transform a landscape of grass and rivers into a playable game.

Population and progression logic is the layer that bridges world generation and gameplay mechanics. It answers questions like: Where should the merchant NPC stand? Should the locked door appear before or after the key? How many coins should this meadow contain? Where should flowers be placed so they look natural without obscuring a treasure chest?

This is the most gameplay-sensitive part of the world engine. Mistakes in terrain generation produce visual ugliness; mistakes in population logic produce unwinnable levels, empty-feeling worlds, or frustrating dead ends.

---

## 2. The Entity Taxonomy

Every non-terrain element in the world falls into one of these categories. The category determines which solver rules govern its placement.

### 2.1 Progression Entities (Solver D)

These entities are integral to the player's ability to complete the level. Their placement must satisfy strict ordering and reachability constraints.

**Locks:**
- *Locked doors* — Block movement until a key is used. Always paired with a key somewhere reachable.
- *Barricades* — Block movement until a crowbar is used. Always paired with a crowbar somewhere reachable.
- *Toll gates* — Block movement until coins are paid. The player must have earned enough coins through exploration and quizzes before encountering the toll.
- *Quiz gates* — Block movement until a quiz is answered correctly. The player may optionally consult the Book of Knowledge before answering. No physical item required, but correct knowledge required.
- *NPC gatekeepers* — NPCs who block a path and only step aside after a conversation, trade, or quiz. Functionally similar to quiz gates but with narrative wrapping.

**Keys:**
- *Door keys* — Collectible items that unlock locked doors. Consumed on use.
- *Crowbars* — Collectible items that clear barricades. Consumed on use.
- *Coin caches* — Concentrated coin deposits that provide the wealth needed for toll gates. Not consumed individually — the player's total coin balance is checked at the toll.

**Progression markers:**
- *Treasure chests* — End-of-sequence rewards that signal the player has completed a section. May contain valuable items, large coin payouts, or progression-critical items.
- *Signs and waymarks* — Provide directional hints to guide the player toward objectives, especially useful after completing a challenge to signal "you're going the right way."

### 2.2 Knowledge Entities (Solver E with Educational Logic)

These entities support the educational dimension of the game. They introduce new concepts, test understanding, and reward curiosity.

**Quiz-bearing NPCs:**
- NPCs who pose quiz questions drawn from the player's selected subjects (math, science, language, history, technology). Correct answers yield coins, items, or passage. Incorrect answers yield hints and encouragement to try again.
- The Book of Knowledge integration means players can pause, look up unfamiliar terms, and return to the quiz with new understanding. The game rewards learning, not just prior knowledge.

**Word bag triggers:**
- Certain NPC dialogues or sign texts contain bolded or highlighted terms that the player can save to their word bag for later research. These do not block progression but enrich the educational experience.

**Knowledge-gated discoveries:**
- Optional challenge areas where answering advanced quiz questions unlocks bonus content (hidden treasures, rare items, cosmetic unlocks). These are never on the critical path — they reward engagement with the educational system.

### 2.3 Economic Entities (Solver E with Density Rules)

These entities form the game's resource economy. Their placement density and distribution affect the feeling of abundance or scarcity.

**Coins:**
- The primary currency. Found scattered in the world, in treasure chests, as quiz rewards, and from NPC trades. Used to pay toll gates, buy items from merchants, and unlock cosmetic features.
- Density follows biome rate multipliers: meadows are moderately rewarding, caves are rich, forests are lean.

**Potions and consumables:**
- Speed potions, shield potions (future), and other temporary buffs. Found in specific locations — treasure chests, hidden nooks, NPC shops. Never critical for progression but helpful.

**Trade goods (future):**
- Items that NPCs desire in trade. Found in one biome, valued in another. Creates incentive for cross-biome exploration.

### 2.4 Social Entities (Solver E with Narrative Rules)

Non-player characters who bring the world to life through conversation, personality, and social interaction.

**Merchants:**
- Buy and sell items. Stationed in accessible locations near main routes. Carry biome-appropriate inventory (forest merchant sells mushrooms and potions; castle merchant sells keys and shields).
- Placement: NPC anchor points in open world unit tiles, preferably near route junctions where the player passes frequently.

**Villagers:**
- Provide hints about nearby features ("There's a chest behind the wall to the east!"), lore, and casual conversation. Responses are generated or rewritten by the LLM for personality.
- Placement: scattered along routes, never more than one per world unit tile, preferring safe open spaces.

**Guardians:**
- Powerful NPCs who guard important progression points. Always adjacent to gates or treasure rooms. Pose harder quizzes or require specific items for passage.
- Placement: at gate anchors within gated world unit tiles.

### 2.5 Decorative Entities (Solver E with Aesthetic Rules)

Entities that exist purely for visual richness. They have no gameplay function.

**Flowers and small plants:**
- Wildflowers, small mushrooms, grass tufts, pebbles. Placed on walkable terrain tiles in biome-appropriate varieties. Natural-feeling clusters (3–7 elements with irregular spacing) rather than uniform distribution.

**Environmental details:**
- Fallen logs, puddles, cobwebs (cave), banners (castle), mossy stones (forest). Placed on non-critical cells to add visual interest without affecting movement or interaction.

**Ambient effects (future):**
- Fireflies in forests at night, crystal sparkles in caves, leaf particles in wind. Placed at scenic anchor points. Pure visual overlay.

---

## 3. The Lock-and-Key Dependency System

### 3.1 Why Ordering Matters

The most critical constraint in population logic is that every lock must be solvable when the player encounters it. "Solvable" means the player has already had access to the corresponding key — either by collecting a physical item, accumulating enough coins, or having had opportunity to learn the knowledge needed for a quiz.

A lock placed before its key creates a **softlock** — the game appears to offer a path that the player cannot actually take. This is the worst possible player experience in a procedural game: the player feels punished for the generator's mistake.

### 3.2 The Dependency Graph

The progression solver models locks and keys as a directed graph:

- Each lock is a node with an incoming edge from its corresponding key
- Each key is a node with an incoming edge from its reachability region (the area the player can access before encountering any locks)
- The player's starting position is the root node

For the dependency to be valid, the graph must be a **Directed Acyclic Graph (DAG)** where the key for each lock is an ancestor of the lock in the graph. If any cycle exists (key A is behind lock B, and key B is behind lock A), the level is unsolvable.

### 3.3 Reachability Regions

To build the dependency graph, the solver must understand which parts of the macro tile are reachable from the entry points without crossing any locks. This produces a map of "free regions" — areas the player can explore before encountering any barrier.

The solver performs these steps:

1. BFS from all entry points, stopping at lock cells (non-walkable conditional cells). The resulting reachable set is the "initial free region."
2. For each lock encountered at the free region's boundary, check whether its key is within the free region. If yes, the lock is immediately solvable. If no, the lock blocks progression to the region behind it.
3. After the player solves a lock and enters the newly accessible region, repeat: BFS from the newly opened area, treating solved locks as walkable. This expands the free region.
4. Continue until all locks are solvable or a dependency cycle is detected.

### 3.4 Ordering Strategies

**The Forward Placement Strategy:**
Generate locks first (they are placed by world unit templates — gates, doors, barricades), then place keys in regions that are reachable before the lock. This is a "design forward" approach: the world structure determines where challenges go, then the solver fills in keys appropriately.

**The Critical Path Strategy:**
Define a critical path through the macro tile (entry to exit, or entry to treasure). Place locks along this path at pacing-appropriate intervals. Place keys off the critical path in side branches. This creates a classic adventure game flow: explore side areas to find tools, return to the critical path to use them.

**The Nested Lock Strategy:**
Create a hierarchy: solving lock 1 gives access to the area containing key 2, which unlocks lock 2, which gives access to the area containing key 3. This creates a satisfying chain of escalating progress. Must be limited to 2–3 nesting levels within a single macro tile to avoid tedium.

### 3.5 Quiz Gate Special Handling

Quiz gates do not have physical keys. Instead, the "key" is the player's knowledge. The difficulty of the quiz should match the position in the progression: early quizzes should be easier (rewarding basic recall), later quizzes harder (rewarding comprehension and Book of Knowledge use).

Quiz difficulty scaling follows the biome progression (meadow quizzes easier than cave quizzes) and the depth within the macro tile (first quiz encountered is easier than third).

Quiz questions should be drawn from the player's selected subjects (chosen at game start) with occasional surprises from unselected subjects to broaden exposure. The LLM rewrites questions for narrative flavor appropriate to the NPC posing them (a wizard phrases differently than a goblin).

---

## 4. NPC Placement Logic

### 4.1 Placement Rules by NPC Type

**Merchants:**
- Place adjacent to walkable route junctions (intersections of multiple movement corridors)
- Prefer world unit tiles that are "standalone" or "open space" types — never inside a chain feature (not on a river, not on a wall)
- Minimum spacing from other merchants: at least one full macro tile between merchants (prevent economic oversaturation)
- The merchant's inventory is determined by biome (biome-specific item weights) and difficulty level

**Villagers:**
- Place along main movement corridors, not in dead ends
- Prefer cells with adequate clearance (no wall on two or more adjacent sides — prevents the NPC from blocking a narrow passage)
- Multiple villagers per macro tile are fine (2–4 depending on size and NPC rate multiplier), but no more than one per world unit tile
- Each villager gets a unique persona generated or selected from a persona library, influenced by biome

**Guardians:**
- Place at gate anchor points within gated world unit tiles (directly adjacent to the gate cell)
- Always exactly one guardian per gate (if the gate has a guardian — not all gates require one; some are key-only)
- The guardian's quiz difficulty matches the lock's position in the progression chain

### 4.2 NPC Persona Assignment

Each placed NPC receives a persona that determines their dialogue style, name, appearance emoji, and quiz/trade behavior:

- Personas are drawn from a biome-specific persona library (meadow: farmer, beekeeper, flower seller; forest: hermit, ranger, moss collector; cave: miner, crystallographer, bat keeper; castle: knight, librarian, ghost)
- The LLM wraps the persona in narrative flavor for dialogue generation
- The persona may influence trade inventory (a miner sells pickaxes and torches; a librarian sells knowledge scrolls)

### 4.3 NPC Dialogue and Interaction Flow

When the player interacts with an NPC (presses the interaction key while facing them):

1. The NPC delivers a greeting line (generated or pre-written, persona-flavored)
2. The player can respond through a text input or menu choices
3. Based on NPC type: offer trade (merchant), offer quiz (villager with quiz), offer hint (villager with hint), demand quiz/item for passage (guardian)
4. The conversation flows for 1–3 exchanges, with LLM generating responses within persona constraints
5. Conversation keywords are fed back into the entropy pool for future generation influence

---

## 5. Collectible Distribution

### 5.1 Density Targets

Each biome x difficulty level defines a target density for each collectible type:

- **Coins:** Base rate × biome multiplier × difficulty modifier. Meadow has moderate coins, cave has rich coins, castle has rich coins (but harder to reach).
- **Keys:** Exactly 1 per locked door in the macro tile. Never more, never fewer.
- **Crowbars:** Exactly 1 per barricade. Same strict pairing as keys.
- **Potions:** Rare (0–2 per macro tile), placed in treasure chests or hidden spots.

### 5.2 Spacing Rules

- **Minimum spacing:** No two collectibles of the same type within 3 cells of each other (prevents clumping)
- **Trail behavior:** Coins may form trails (spaced 4–6 cells apart) along movement corridors to guide the player toward objectives
- **Dead-end rewards:** Dead-end branches should have a collectible or item at the end (the player should feel rewarded for exploring a non-critical path, not punished)
- **Proximity to progression elements:** Keys and crowbars should be discoverable naturally — placed near visited areas, not hidden in obscure corners. The player should not need to pixel-hunt.

### 5.3 Item Placement on the Decoration Eligibility Grid

Collectibles can only be placed on cells whose decoration eligibility tags include "can host item." This prevents items from appearing inside walls, on water, or on non-walkable obstacles. The eligibility tags are set during micro tile metadata definition and composed into the decoration eligibility map during Phase 5 of the solver pipeline.

---

## 6. Decoration Placement

### 6.1 The Aesthetic Mandate

Decorations serve no gameplay function, but they are what makes the world feel alive rather than sterile. A meadow without flowers is just a green grid. A forest without fallen logs and mushroom clusters is just a field of tree emojis. Decoration placement deserves as much care as obstacle placement, because it determines the emotional quality of the player's exploration experience.

### 6.2 Natural Clustering

Decorations should be placed in clusters that mimic natural distribution patterns, not uniform grids or pure random scatter.

**Cluster algorithm:**
1. Select a cluster center on a walkable, decoration-eligible cell
2. Place 3–7 decorative sprites within a radius of 2–4 cells from the center
3. Within the cluster, vary the specific decoration type (mix flowers and grass tufts, not all the same sprite)
4. Each cluster should have slight density variation (denser at center, sparser at edges)
5. Space clusters at least 5–8 cells apart to create visual breathing room
6. Total decoration coverage should be 15–30% of eligible cells (biome-dependent)

### 6.3 Biome-Appropriate Decoration Sets

Each biome has its own decoration palette:

- **Meadow:** Wildflowers (🌼, 🌸, 🌺), tall grass, butterflies (future), small stones
- **Forest:** Mushrooms (🍄), fallen leaves, moss, small logs, fern fronds
- **Cave:** Crystals, stalactites (on walls), small pebble piles, glowing fungi
- **Castle:** Banners, broken pottery, cobwebs, candle sconces (on walls), cracked tiles

### 6.4 Non-Interference Rules

Decorations must never:
- **Block required routes.** Decorations on walkable cells must keep the cell walkable. If a decoration would suggest a collision (like a log across a path), the cell remains walkable — the decoration is a visual overlay, not a physical obstacle.
- **Hide critical interaction points.** No decoration on a cell that contains an item, NPC, gate, or sign. The interactable element always takes visual priority.
- **Increase collision ambiguity.** Decorations should not look like obstacles. A decorative stone should be visually distinct from a blocking rock obstacle. Scale and artistic style differentiate them.
- **Overload visual density.** No more than one decoration per cell. No decorations on cells adjacent to NPCs or interactive elements (maintains visual clarity around important objects).

---

## 7. Playability Guarantees

### 7.1 The Five Guarantees

The population and progression solvers must collectively guarantee:

**Guarantee 1: No Softlocks**
The player can never reach a state where the game's progression is impossible. Every lock encountered has its key accessible. Every quiz has a correct answer. Every toll gate is precedable by sufficient coin availability.

**Guarantee 2: No Dead Ends Without Reward**
Every navigable dead-end branch contains at least one collectible, decoration cluster, or NPC interaction. The player is never punished for exploring.

**Guarantee 3: Every Macro Tile Is Traversable**
The player can always reach at least one exit from any entry point. There is no macro tile that traps the player.

**Guarantee 4: Progression Is Paced**
The player encounters progressively harder challenges as they move further from spawn. Early macro tiles have easy quizzes and few locks; later macro tiles have harder quizzes and more complex lock-key chains.

**Guarantee 5: The World Is Learnable**
Every quiz question has educational value. The Book of Knowledge contains the information needed to answer any quiz. The word bag system allows players to mark and research unfamiliar concepts. No quiz is pure trivia — every question teaches something.

### 7.2 Verification Methods

- **Guarantee 1** is verified by the lock-key dependency graph analysis (Section 3.3). If the graph is a valid DAG with all keys accessible before their locks, no softlocks exist.
- **Guarantee 2** is verified by dead-end scanning: BFS identifies all cells reachable by exactly one path (no alternate route back). Each dead-end cluster must contain at least one collectible or NPC.
- **Guarantee 3** is verified by BFS from every entry point to every exit point, treating locks as non-traversable. If any exit is unreachable, the validator triggers repair (path carving or lock removal).
- **Guarantee 4** is verified by distance-from-spawn analysis: fetch the player's spawn-relative distance for each quiz/gate, verify that difficulty correlates with distance.
- **Guarantee 5** is verified by the knowledge system's data integrity: every quiz question in the library has a corresponding Book of Knowledge article, and every answer is factually correct.

---

## 8. Integration Points with Other Systems

### 8.1 Integration with the Generation Pipeline

Population solvers (D and E) run as Phases 7 and 8 of the generation pipeline (Document 03). They receive the validated cell grid from the chain integrity check (Phase 6) and output a fully populated cell grid for the playability validator (Phase 9).

Population results are stored in the cell data structure: `itemId` for collectibles, `npcId` for NPCs, `resolved` for gates, and `interactable` for interactive elements. This data structure is shared with the mechanics system for runtime interactions.

### 8.2 Integration with the Mechanics System

The mechanics system (`src/mechanics.ts`) handles runtime player interactions with populated entities:

- Collision detection queries cell walkability (which is set by the generation pipeline, including population effects — an NPC on a cell makes it non-walkable)
- Interaction resolution queries cell properties (assetKey, itemId, npcId) to determine what happens when the player presses the interaction key
- Obstacle template matching (which item resolves which obstacle) is defined in the asset configuration and consumed by both the population solver (for placement pairing) and the mechanics system (for runtime resolution)

### 8.3 Integration with the LLM System

The LLM plays several roles in population:
- **NPC dialogue generation:** When the player interacts with an NPC, the LLM generates persona-appropriate dialogue
- **Quiz question rewriting:** The LLM rewrites factual quiz questions in narrative style appropriate to the NPC and biome
- **Entropy feedback:** Player conversation text and quiz answers are fed back into the entropy pool, influencing future world generation

### 8.4 Integration with the Rendering System

Population entities appear in the renderer's object layer (Layer 2 in Document 04). Each entity is rendered through the draw command system:
- NPCs are drawn as emoji sprites with shadow
- Collectibles are drawn as smaller emoji sprites without shadow, slightly elevated above the terrain
- Decorations are drawn as base-layer or mid-layer emoji sprites (depending on their asset definition's layer property)
- Interactive element highlights (sparkle effects, hover indicators) are future rendering features

### 8.5 Integration with the Save System

All population state must be serializable for save/load:
- Collected items (removed from world, added to inventory)
- Resolved obstacles (gates opened, barricades cleared)
- NPC interaction history (which NPCs the player has talked to, what quizzes have been completed)
- Discovered areas (fog of war state, which macro tiles have been visited)
- Word bag contents (saved terms for educational tracking)

The save system stores this state in localStorage. On load, the world regenerates terrain deterministically from seeds, then applies the saved mutation state to restore collected items and resolved obstacles.

---

## 9. Pacing and Difficulty Curve

### 9.1 Distance-Based Difficulty

Difficulty increases with distance from the player's spawn point. This is measured in macro tile hops (Manhattan distance from spawn macro tile to current macro tile).

| Distance | Biome Likelihood | Quiz Difficulty | Lock Density | Collectible Density |
|:---:|:---:|:---:|:---:|:---:|
| 0 (spawn) | 90% meadow | Tutorial (simple recognition) | None | High (welcoming) |
| 1–2 | 70% meadow, 30% forest | Easy (basic recall) | 0–1 per macro | Moderate |
| 3–5 | Mixed meadow/forest | Medium (comprehension) | 1–2 per macro | Moderate |
| 6–9 | Forest/cave | Hard (application) | 2–3 per macro | Lower |
| 10+ | Cave/castle | Expert (analysis) | 3–4 per macro | Rare but valuable |

### 9.2 Biome-Based Character

Each biome has a distinct gameplay character created by its population rules:

**Meadow:**
- Open, welcoming, easy to navigate
- Friendly villager NPCs with gentle quizzes
- Flowers and butterflies as decorations
- Coins visible and accessible
- Few locks, mostly tollgates (spend coins, not solve puzzles)

**Forest:**
- Denser, more paths blocked by obstacles
- Mix of helpful and challenging NPCs
- Mushrooms and natural decorations
- Items sometimes hidden off main paths
- Key/door locks begin appearing

**Cave:**
- Tight corridors, many walls and doors
- Guardian NPCs with harder quizzes
- Crystal and mineral decorations
- Valuable loot but behind multiple locks
- Nested lock chains (key 1 → area with key 2)

**Castle:**
- Structured rooms and corridors
- Merchant and guardian NPCs
- Architectural decorations (banners, torches)
- Best rewards behind the hardest challenges
- Complex multi-gate progression sequences

### 9.3 Streak Awareness

The population solver is aware of the player's recent performance:
- After a streak of correct quiz answers, spawn slightly harder quizzes and rarer rewards
- After a streak of incorrect answers, spawn easier quizzes, helpful hint NPCs, and more generous collectible density
- This creates a dynamic difficulty adjustment that keeps the game challenging but not punishing

Streak data is maintained in the game state and consulted by the population solver during Phases 7 and 8 of the pipeline.

---

## 10. Modular Organization

To keep the population and progression systems maintainable and extensible, the following modular boundaries should be maintained:

**Progression Rule Module:**
- Lock-key pairing rules
- Dependency graph construction and validation
- Reachability region computation
- Ordering constraint enforcement

**NPC Placement Module:**
- NPC type selection based on biome and difficulty
- Position selection based on anchor points and clearance rules
- Persona assignment
- Dialogue integration hooks

**Collectible Distribution Module:**
- Density target computation from biome and difficulty
- Spacing rule enforcement
- Dead-end reward placement
- Key/crowbar pairing with locks/barricades

**Decoration Module:**
- Biome decoration palette lookup
- Cluster algorithm execution
- Non-interference validation
- Density targeting

**Quiz Integration Module:**
- Question selection from subject-filtered library
- Difficulty scaling based on distance and streak
- LLM rewriting integration
- Book of Knowledge cross-reference validation

Each module exposes a minimal interface: it accepts the cell grid and configuration, and returns modifications to apply. Modules do not call each other directly — they are orchestrated by the solver pipeline as sequential phases.

---

## 11. Summary

Population, progression, and gameplay logic form the final and most player-facing layer of the world engine. Terrain and structure create the stage; population creates the performance.

The key principles are:
1. **Every lock must be solvable** — the dependency graph guarantees no softlocks
2. **Every exploration is rewarded** — dead ends have collectibles, side paths have NPCs
3. **Placement respects context** — merchants at junctions, guards at gates, flowers in meadows
4. **Difficulty escalates organically** — through distance, biome, and streak-aware adaptation
5. **Education is integrated, not bolted on** — quizzes are NPC encounters, knowledge is an in-game resource, learning is rewarded mechanically

This completes the five-document world engine design series. Together, Documents 01 through 05 define the complete intellectual architecture for transforming LLM entropy into a playable, educational, visually coherent isometric adventure world.
