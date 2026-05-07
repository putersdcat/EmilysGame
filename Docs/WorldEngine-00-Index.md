# Emily's Game — World Engine Design Documentation Index

## Purpose

This index links the complete set of design documents that define the world engine architecture for Emily's Game. These documents describe every subsystem required to deliver a procedurally generated, LLM-entropy-driven, isometric tile world with guaranteed playability.

These documents are **design-only** — they describe what must be built, why each piece exists, how each piece relates to every other piece, and what the expected behaviors and contracts are. They contain no code or pseudo-code. Implementation details are deferred to GitHub Issues and actual source files.

---

## Document Set

| Document | Covers |
|----------|--------|
| [01 — Spatial Hierarchy and Tile Grammar](WorldEngine-01-SpatialHierarchy.md) | The four-tier spatial model (Micro → Nano → World Unit → Macro), metadata contracts at each level, construction rules, variation families, and how the tiers compose into a coherent world grammar. |
| [02 — Edge Contracts and Constraint Propagation](WorldEngine-02-EdgeContracts.md) | The edge matching system at every scale, contract dimensions, compatibility logic, corner and junction governance, propagation mechanics, backtracking strategies, and streaming-world compatibility. |
| [03 — Multi-Solver Generation Pipeline](WorldEngine-03-SolverPipeline.md) | The complete generation pipeline from LLM entropy input through macro assembly, world unit construction, micro fill, and post-processing. Describes each solver phase, their ordering dependencies, inputs, outputs, and failure recovery strategies. |
| [04 — Rendering Pipeline, Caching, and WASM Delivery](WorldEngine-04-RenderingPipeline.md) | The layered rendering architecture, cache hierarchy (micro atlas → world unit composite → macro terrain → viewport projection), invalidation rules, WASM acceleration targets, and how the renderer consumes world data. |
| [05 — Population, Progression, and Gameplay Logic](WorldEngine-05-PopulationAndProgression.md) | Entity placement (NPCs, items, collectibles, decorations), lock-and-key dependency graphs, progression ordering, quiz and obstacle integration, playability guarantees, and how the population solvers interact with the spatial hierarchy. |

---

## How These Documents Relate to the Existing Codebase

The current engine already implements early versions of several concepts described here:

- **Micro Tiles** exist as 32×32 SVG tiles in `src/tiles.ts` with 8 visual types
- **Nano Tiles / Nano Stacks** already exist in the `experiment/isometric-2.0/` work as a 3×3 sub-grid overlay on top of base biome micro tiles, with positive-Z, negative-Z, and flat behavior
- **World Unit Templates** exist as 5×5 stamp patterns in `src/config/tiles.config.ts` with basic edge tags
- **Perlin noise generation** exists in `src/gen.ts` with density-based cell assignment
- **Template stamping** exists in `src/gen.ts` (0–3 random stamps per chunk, no edge enforcement)
- **BFS passability enforcement** exists in `src/gen.ts`
- **Terrain pre-render cache** exists in `src/terrain-cache.ts`
- **WASM bridge** exists in `src/wasm-bridge.ts` for draw command sorting
- **Object cell cache** exists in `src/render.ts` for sparse non-base cell iteration

The documents describe the **target architecture** that evolves from this foundation. They are written to be implementable incrementally — each solver, each cache layer, each contract dimension can be added without rewriting existing working systems.

---

## How These Documents Relate to Archived Planning

These documents supersede and refine concepts from:

- `archived-planning/Visual Mapping and Tile Asset Generation.md` — original tile hierarchy sketch
- `archived-planning/GPT-53-Codex_Core World Engine.md` — earlier architecture outline
- `archived-planning/NewGame_GameBible_StartHere.md` — original development bible sections on world gen
- `archived-planning/Additional Technical Details, PoC Quirks, and UI Discussions Addendum.md` — movement, occlusion, and UI rules

The archived documents remain valid historical references. These new documents are the authoritative current design.

---

## Reading Order

For someone new to the project, read in numerical order (01 through 05). Each document builds on concepts introduced in the previous one.

For someone implementing a specific subsystem, jump directly to the relevant document — cross-references are included where dependencies exist.

---

## Relationship to GitHub Issues

Each major subsystem described in these documents should map to one or more GitHub Issues under the master epic (Issue #2). The documents provide the intellectual foundation; the issues provide the implementation tasks, acceptance criteria, and tracking.
