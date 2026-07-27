# 03 — Effort Estimate and Roadmap

> **SUPERSEDED — 2026-07-07:** This roadmap assumes a Three.js proof path. That proof failed. Keep as historical reasoning only. Current direction is Canvas/Iso2 hardening; see [`17-threejs-rejection-record.md`](17-threejs-rejection-record.md) and [`18-canvas-iso2-hardening-plan.md`](18-canvas-iso2-hardening-plan.md).

## Summary estimates

| Target | Solo / AI-assisted | Focused 2-3 person team |
|---|---:|---:|
| Technical proof spike | 2 weeks | 1-2 weeks |
| Current alpha parity | 12-16 weeks | 6-10 weeks |
| Full documented vision | 24-36 weeks | 12-18 weeks |
| Public polished game | 9-12 months | 4-6 months |

These estimates assume:

- reuse of content packs, existing design docs, and known-good material/visual work;
- a clean branch, not an in-place refactor;
- strict scope control;
- tests and visual baselines promoted as acceptance criteria;
- LLM is optional/enriching, not required for core playability.

## Phase 0 — Product/spec freeze

**Duration:** 1 week

Deliverables:

- define current-alpha parity checklist;
- define full-vision checklist;
- choose technology stack;
- define chunk/cell/nano schemas;
- decide which existing features are required for v1 parity;
- decide which current features are deferred or intentionally dropped;
- define visual style target and canonical scenes.

Exit criteria:

- one checked-in parity matrix;
- one checked-in architecture sketch;
- no ambiguous "we'll know it when we see it" requirements for the first spike.

## Phase 1 — Technical proof spike

**Duration:** 2 weeks solo / 1-2 weeks small team

This spike should determine whether Three.js actually removes enough pain to justify a full rebuild.

Required deliverables:

1. Vite + TypeScript + Three.js boot.
2. Orthographic isometric camera.
3. Deterministic 25×25 chunk generation.
4. Grass/dirt/water terrain render.
5. One extruded wall corner as actual geometry.
6. One river depression with a bridge over it.
7. Player billboard/card walking in front of and behind a wall correctly.
8. One quiz gate that unlocks and changes walkability.
9. Deterministic chunk hash test.
10. One visual regression scene.

Success criteria:

- wall/bridge/river/player occlusion is simpler and more robust than the current Canvas path;
- 60 FPS is plausible on a normal dev machine;
- world logic remains renderer-agnostic;
- one agent can understand the scene and make a visual change without touching low-level projection math.

Failure criteria:

- Three.js introduces more complexity than it removes;
- visual style cannot match the intended Iso2 look;
- instancing/chunk management becomes too heavy;
- browser deployment becomes materially worse.

If the spike fails, do not continue the full rewrite. Reassess PixiJS, Phaser, or continuing the existing Canvas engine.

## Phase 2 — Skeleton runtime

**Duration:** 1-2 weeks

Deliverables:

- app boot and lifecycle;
- test mode;
- input abstraction;
- core RNG/coords/events;
- save wrapper;
- renderer shell;
- UI shell;
- initial CI scripts.

Exit criteria:

- can launch the new runtime;
- can run unit tests;
- can render a blank world and move a placeholder player;
- can save/load minimal state.

## Phase 3 — World model and generator MVP

**Duration:** 2-4 weeks

Deliverables:

- chunk schema;
- cell schema;
- nano occupancy schema;
- deterministic generator;
- initial world-unit templates;
- simple edge contracts;
- passability validation;
- chunk worker;
- generated-world delta model;
- golden determinism tests.

Exit criteria:

- same seed + coords produce same chunk;
- adjacent generated chunks can satisfy basic borders;
- player spawn is always reachable;
- generator can run in a worker without blocking render/input.

## Phase 4 — Three.js renderer MVP

**Duration:** 4-6 weeks

Deliverables:

- terrain mesh/instancing;
- material atlas or procedural materials;
- walls/fences/gates/bridges/rivers as geometry;
- player/NPC billboard cards;
- chunk add/remove;
- debug overlays;
- visual regression harness;
- performance instrumentation.

Exit criteria:

- current representative Iso2 scenes have equivalents;
- wall corners and player occlusion are visibly correct;
- chunk streaming does not stutter badly;
- visual tests catch regressions.

## Phase 5 — Gameplay current-parity slice

**Duration:** 4-6 weeks

Deliverables:

- movement and collision;
- camera follow;
- auto-collect;
- interaction dispatch;
- items/inventory;
- chests;
- NPC dialogue shell;
- quiz gate flow;
- save/load deltas;
- basic status/injury subset;
- wildlife subset if needed for alpha parity.

Exit criteria:

- player can explore multiple chunks;
- player can collect items and save/load;
- player can encounter and resolve a quiz gate;
- gameplay tests cover core flow.

## Phase 6 — Education systems

**Duration:** 3-4 weeks

Deliverables:

- content pack loader;
- schema validation;
- quiz engine;
- subject selection;
- age filtering;
- Book UI;
- search;
- "I don't know" quiz-to-book flow;
- word bag MVP.

Exit criteria:

- shipped content manifest is source of truth;
- quiz categories/age filters work;
- Book lookup supports quiz learning loop;
- no documentation-only content counts.

## Phase 7 — LLM integration

**Duration:** 2-3 weeks

Deliverables:

- LLM health/client;
- entropy wordlist generation;
- entropy event cache;
- deterministic fallback;
- async LLM enrichment;
- NPC flavor wrapper;
- tests proving game starts without LLM.

Exit criteria:

- game is fully playable without LLM;
- LLM adds flavor/entropy when available;
- tests never require LLM;
- save/load preserves entropy-relevant state.

## Phase 8 — Audio/UI/platform parity

**Duration:** 3-5 weeks

Deliverables:

- audio mixer;
- SFX manifest;
- music playback;
- settings UI;
- HUD polish;
- menus;
- touch/gamepad basics;
- accessibility pass;
- optional Tesla/browser-specific modes.

Exit criteria:

- current alpha UX expectations are met or intentionally revised;
- settings persist;
- audio can be fully muted;
- touch/gamepad path is testable.

## Phase 9 — Full WorldEngine ambitions

**Duration:** 8-12+ weeks

Deliverables:

- robust world-unit library;
- full edge compatibility;
- chain integrity checks;
- progression DAG placement;
- richer structures/assemblies;
- settlement/castle/cave content;
- nano-aware population rules;
- visual-material backlog;
- broader content expansion.

Exit criteria:

- generated chunks are not merely passable but compositionally coherent;
- locks/gates have valid key/knowledge paths;
- structures read visually as authored spaces;
- generated worlds support the documented gameplay vision.

## Key risks

### Rewrite trap

A clean branch can spend months without matching current gameplay. Mitigation: parity matrix, short spike, and old game remains playable.

### Solver overreach

The WorldEngine docs describe a large system. Do not implement the full 10-phase solver before proving the runtime. Start with a minimal deterministic grammar.

### Visual churn

Iso2 history shows visual work can loop indefinitely. Mitigation: canonical scenes, debug modes, and clear acceptance images.

### Content drift

Docs currently drift from content manifests. Mitigation: make manifests/tests authoritative.

### LLM dependency

Startup-blocking LLM hurts deployment and testing. Mitigation: fallback-first gameplay.

### Asset scope explosion

The structural backlog is huge. Mitigation: define MVP kits:

1. meadow terrain;
2. fence/gate;
3. stone wall;
4. river/bridge;
5. homestead;
6. one cave/castle kit.

## Recommended immediate next action

Do a **two-week Three.js orthographic proof spike** before any full rewrite commitment.

The spike should answer one question:

> Can a Three.js geometry-based approach make walls, rivers, bridges, roofs, and player occlusion easier and more reliable than the current Canvas/Iso2 path while preserving the game's desired look?

If yes, proceed with the clean branch. If no, continue refining the current engine or evaluate PixiJS/Phaser alternatives.
