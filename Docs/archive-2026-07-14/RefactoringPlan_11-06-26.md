**Emily's Game – Engine Refactoring & Architecture Phase 1 Plan**

**Version:** 1.0  
**Date:** June 11, 2026  
**Branch Context:** `experiment/isometric-2.0` + `main`  
**Goal:** Transform the current ad-hoc, monolithic TypeScript + Canvas codebase into a clean, modular, LLM-friendly game engine while preserving the "no external game engine / pure from-scratch" philosophy.

---

### 1. Executive Summary

Emily's Game is a procedurally generated educational isometric adventure built entirely from scratch in TypeScript + HTML5 Canvas (with planned WASM hot paths). The project has grown organically over many months of agent-assisted development. This has produced valuable systems (especially the recent stone/brick nano texture work and river solver), but has also resulted in:

- Large monolithic files that exceed LLM context windows
- Inconsistent patterns and naming
- Blurred boundaries between "experiment" and "core engine"
- Weak documentation of architectural intent
- Difficulty for both humans and agents to reason about the system

**This plan** defines a deliberate, phased refactoring effort whose primary objective is to create a **coherent, modular, well-documented engine** that is easy for future LLM agents (including Grok Code / sub-agents) to work with, while still respecting the project's core constraints (no heavy libraries, Canvas 2D primary, WASM for performance).

The end state should feel closer to a small, purpose-built engine (think a very lightweight custom version of what Tiled + a simple renderer might do) rather than a collection of big files.

---

### 2. Current State Analysis (June 2026)

**Strengths**
- Strong recent progress on modular stone/brick textures and continuous feature solving (nano walls, rivers, bridges).
- Clear vision for Z-pinned nano tiles + extrusion in the 2.0 experiment.
- Working procedural world generation pipeline (LLM entropy → tile data).
- Educational layer (quizzes, Book of Knowledge) is conceptually sound.
- No dependency bloat — everything is hand-rolled.

**Major Problems**
- Several files exceed 800–1500+ lines with mixed concerns (rendering + generation + UI + asset logic).
- Inconsistent naming and abstraction levels (e.g. "micro tile", "nano tile", "world unit", "chunk" are used somewhat interchangeably in places).
- The `experiment/isometric-2.0` branch contains both valuable new systems **and** experimental dead-ends. The boundary with `main` is unclear.
- Very little architectural documentation or diagrams. LLMs must reverse-engineer intent from code.
- MCP / SVG rendering tool is powerful in theory but inconsistently used and not strictly enforced.
- Player occlusion, shadows, and proper isometric depth are still fragile in many areas.

**Root Cause**
The codebase was grown incrementally through many short agent sessions without a strong, living architectural blueprint. This is normal for exploratory projects, but has now reached the point where further progress is slowed by cognitive load (for both you and the agents).

---

### 3. Target Architecture Vision

We will evolve toward a **layered, modular engine** with these high-level boundaries:

1. **Core Engine** (`src/engine/`)
   - Pure data structures, math, and rules (no rendering).
   - World model, tile metadata, walkability, solver logic.

2. **Rendering Layer** (`src/rendering/`)
   - All Canvas drawing, isometric projection, Z-sorting, shadows, occlusion.
   - Nano tile rendering pipeline (Z-pinned skew + extrusion).

3. **Asset & Tooling Layer** (`src/tools/` or `src/asset-pipeline/`)
   - MCP integration, SVG factories, texture generation, visual test suite.
   - Should be the primary interface for LLM-driven asset work.

4. **Game Systems** (`src/game/`)
   - Player, inventory, quizzes, NPC interaction, time-of-day, etc.
   - High-level orchestration.

5. **Experiments** (`src/experiments/` or keep on the dedicated branch)
   - Risky or exploratory work stays isolated until proven.

**Key Design Principles (to be enforced)**
- Every major system gets its own folder + `index.ts` barrel + clear public API.
- Files should ideally stay under ~300–400 lines.
- Strong use of interfaces / types for everything that crosses boundaries.
- Clear separation between "data" and "rendering".
- Consistent naming: `MicroTile`, `NanoOverlay`, `ZPinTransform`, `ContinuousFeatureSolver`, etc.
- Documentation lives next to code (not just in a separate wiki).

---

### 4. Proposed Folder Structure (Target)

```
src/
├── engine/                  # Pure logic, no DOM/Canvas
│   ├── core/
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   └── math.ts
│   ├── world/
│   │   ├── MicroTile.ts
│   │   ├── NanoOverlay.ts
│   │   ├── WorldGrid.ts
│   │   └── solver/
│   │       ├── ContinuousFeatureSolver.ts
│   │       └── ...
│   └── metadata/
│       └── TileMetadata.ts
│
├── rendering/               # All drawing + projection
│   ├── isometric/
│   │   ├── IsometricRenderer.ts
│   │   ├── ZPinTransform.ts
│   │   ├── NanoRenderer.ts
│   │   └── ShadowSystem.ts
│   ├── canvas/
│   │   └── CanvasContext.ts
│   └── layers/
│       ├── BaseBiomeLayer.ts
│       ├── NanoOverlayLayer.ts
│       └── PlayerLayer.ts
│
├── asset-pipeline/          # MCP tool + generation
│   ├── mcp/
│   │   └── CopilotSvgToolv2.ts   # The enhanced tool
│   ├── factories/
│   │   ├── StoneWallFactory.ts
│   │   ├── RiverFactory.ts
│   │   └── ...
│   └── visual-tests/
│       └── VisualTestSuite.ts
│
├── game/
│   ├── Player.ts
│   ├── Inventory.ts
│   ├── QuizSystem.ts
│   └── TimeOfDay.ts
│
├── experiments/             # Temporary / risky work (can be deleted)
│   └── isometric-2.0/       # Current experiment branch content (to be cleaned)
│
├── ui/                      # Menus, HUD, inventory panel, etc.
├── data/                    # JSON assets, quiz content, etc.
└── main.ts                  # Entry point + high-level bootstrap
```

This structure is deliberately **engine-like** without being a full game engine. It should feel familiar to LLMs that have seen small custom renderers or tile-based games.

---

### 5. Core Design Patterns & Conventions (to be documented in ARCHITECTURE.md)

- **Data-Oriented where possible** — structs/interfaces first, behavior second.
- **Renderer is a service** — `IsometricRenderer` owns the Canvas context and draw order.
- **Nano Overlays are first-class** — they carry their own metadata (`zOffset`, `isExtrusion`, `topTexture`, `sideTexture`, `walkable`, `occlusionMode`).
- **Solver is deterministic and testable** — given neighbor bitmask → returns correct variant.
- **Every visual asset has a corresponding visual test** — no new asset is "done" until it passes the canonical test scenes.
- **Naming Convention**:
  - `PascalCase` for classes/types
  - `camelCase` for methods/properties
  - Folders use `kebab-case` or `camelCase` consistently (decide once).

---

### 6. Detailed Phased Work Plan

**Phase 0 – Assessment & Documentation (1–2 days)**
- Create `ARCHITECTURE.md` in repo root with current state + target vision.
- Inventory every major file > 400 lines and tag its primary responsibility.
- Identify the 3–4 cleanest modules to use as "model examples" for the new style.
- Document the exact current micro/nano tile data model.

**Phase 1 – Foundation & Structure (Highest Priority)**
- Create the new folder skeleton above.
- Move/refactor the best parts of the recent stone wall and river work into `src/engine/world/` and `src/rendering/isometric/`.
- Define core interfaces: `IMicroTile`, `INanoOverlay`, `IRenderer`, `ISolver`.
- Implement a strict `VisualTestSuite` runner that the MCP tool must call.

**Phase 2 – Renderer Hardening**
- Make `IsometricRenderer` the single source of truth for all drawing.
- Fully implement and enforce Z-pinned skew + extrusion logic.
- Add proper path-based shadows and basic rim lighting.
- Enforce player occlusion tests in the visual suite.

**Phase 3 – Merge & Cleanup**
- Selectively merge proven systems from `experiment/isometric-2.0` back into `main` using the new structure.
- Delete or archive failed experiments.
- Update all import paths and ensure the game still runs.

**Phase 4 – Agent Enablement**
- Write a detailed `AGENTS.md` (or expand `ARCHITECTURE.md`) that tells future LLM agents exactly how to add a new nano type, how to run visual tests, where to put new code, etc.
- Make the MCP tool the mandatory interface for any new visual work.

---

### 7. Documentation Strategy

Every significant module must have:
- A short `README.md` inside its folder explaining purpose and public API.
- Heavy inline JSDoc / comments on public methods and complex logic.
- Living `ARCHITECTURE.md` at root that is updated with every major change.

The goal is that an LLM can read the folder structure + `ARCHITECTURE.md` and have a good mental model before touching code.

---

### 8. Tooling & Iteration Loop Improvements

- Make the enhanced MCP tool (`CopilotSvgToolv2`) the **only** approved way to generate or modify visual assets during this phase.
- Add a CI-like local check: running the visual test suite must pass before a commit is considered "visually clean".
- Consider adding a simple `npm run visual-test` script.

---

### 9. Success Metrics

- All core files are under ~400 lines and live in logical folders.
- A new developer (or LLM) can add a new continuous feature (e.g. "bamboo hedge") in < 2 hours following the patterns.
- The 6 canonical visual test scenes render correctly with proper height, shadows, and player occlusion.
- The `experiment/isometric-2.0` branch is either fully merged or cleanly archived.
- Future agent sessions produce coherent, well-structured code instead of monolithic additions.

---

### 10. Risks & Mitigations

| Risk | Mitigation |
|------|----------|
| Refactoring breaks existing functionality | Work in small, testable increments + keep visual test suite green |
| Agent still produces flat / wrong isometric output | Strict enforcement of MCP + visual tests + better spec in `ARCHITECTURE.md` |
| Over-engineering / analysis paralysis | Time-box Phase 0 and Phase 1. Start moving real code early. |
| Loss of momentum on gameplay | Keep gameplay work on `main` while engine work happens on a dedicated refactor branch if needed |

---

### 11. Immediate Next Steps (Recommended Order)

1. Create this plan as `docs/EmilyGame-Engine-Refactoring-Phase1.md` (or similar) in the repo.
2. Create the new folder structure in a feature branch.
3. Begin Phase 0 assessment — inventory current files.
4. Write the first draft of `ARCHITECTURE.md`.
5. Pick the stone wall system as the first module to refactor into the new structure (it was the strongest recent work).

---

This document is intentionally detailed enough to hand off to Grok Code (or any other agent) as the primary context for the next phase of work.