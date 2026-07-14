# 15 — First 90 Days Clean Branch Plan

> **SUPERSEDED — 2026-07-07:** This plan assumes Three.js acceptance. Three.js has been rejected. Keep as historical planning only; replace with Canvas/Iso2 hardening work from [`18-canvas-iso2-hardening-plan.md`](18-canvas-iso2-hardening-plan.md).

**Date:** 2026-07-07  
**Purpose:** Convert the clean-rebuild recommendation into a realistic first-90-days execution plan.

This assumes a solo/AI-assisted workflow. A small team can compress phases by parallelizing renderer, world, UI/education, and audio.

## Phase 0 — Days 1-3: Source-of-truth setup

Deliverables:

- create/choose GitHub issue for Three.js proof spike;
- link `Docs/clean-rebuild-assessment/`;
- record active decision: spike first, no full rewrite yet;
- decide spike folder: `experiment/three-clean-spike/`;
- add a minimal source-of-truth note if needed.

Exit criteria:

- everyone knows the spike is bounded;
- no one is trying to update every stale doc first;
- current game branch remains untouched except docs.

## Phase 1 — Days 4-14: Three.js proof spike

Use `10-threejs-proof-spike-spec.md` as scope.

Deliverables:

- isolated Vite/Three spike;
- deterministic demo chunk schema;
- terrain scene;
- wall geometry proof;
- river/bridge proof;
- player occlusion/sink proof;
- gate + DOM quiz overlay;
- save delta;
- visual captures;
- short results doc.

Exit criteria:

- go/no-go decision written;
- screenshots/artifacts saved intentionally;
- complexity compared against Canvas path.

Stop if:

- Three.js does not simplify the core visual problems;
- style is unacceptable;
- renderer pollutes world data.

## Phase 2 — Days 15-21: Decision and branch setup

If spike succeeds:

- create `src-next/` or clean branch structure;
- add packages intentionally (`three`, optional `preact`, validation/test packages);
- set up lint/type/test scripts;
- define package/module boundaries;
- create first schemas from `12-data-schema-sketch.md`.

If spike fails:

- document why;
- update recommendation;
- either continue current Canvas/Iso2 branch or run a Pixi/Phaser mini-spike.

Exit criteria:

- no ambiguous half-rewrite;
- accepted architecture has one root decision doc.

## Phase 3 — Days 22-35: Deterministic world core

Deliverables:

- core IDs/coords/RNG/hash;
- micro/nano/world-unit schema validators;
- deterministic chunk generator MVP;
- delta model;
- save V2 sketch and serializer;
- pure tests for determinism, bridge placement, gate unlock, water collision.

Exit criteria:

- world package imports no DOM/Three;
- same seed/coords test passes;
- delta apply/replay test passes.

## Phase 4 — Days 36-50: Renderer MVP

Deliverables:

- Three renderer package;
- chunk mesh builder;
- material registry;
- terrain, wall, river, bridge, gate geometry;
- player/NPC card/billboard;
- visual debug overlays;
- visual capture harness.

Exit criteria:

- visual scenes 1-5 run from spec;
- no geometry-specific gameplay logic in renderer;
- performance baseline recorded.

## Phase 5 — Days 51-65: Gameplay MVP

Deliverables:

- movement/collision;
- interaction dispatch;
- inventory basics;
- coin/chest/gate;
- NPC dialog shell;
- quiz gate flow;
- save/load slot MVP;
- current alpha smoke route.

Exit criteria:

- player can explore, collect, open chest, unlock quiz gate, save/load;
- browser integration test exists for the route;
- old game still available if parity not reached.

## Phase 6 — Days 66-78: Education/UI parity slice

Deliverables:

- content pack loader;
- quiz engine;
- Book browse/search MVP;
- subject/age selection MVP;
- `I don't know` path;
- DOM HUD/sidebar/menu shell;
- accessibility hooks for quiz repeat/numeric keys.

Exit criteria:

- current content manifest loads;
- quiz/Book loop works in game;
- content counts derive from manifest.

## Phase 7 — Days 79-90: Audio, polish, and parity review

Deliverables:

- simple music/SFX service using existing assets or placeholders;
- mute/test-mode guarantees;
- basic touch/gamepad if in parity scope;
- visual/perf pass;
- parity matrix update;
- issue/source reconciliation update;
- go/no-go for continued full rebuild.

Exit criteria:

- current-alpha parity gaps listed explicitly;
- next 90-day plan is scoped;
- no hidden rewrite debt.

## Parallelizable workstreams

If multiple agents/people work in parallel:

| Workstream | Can start | Outputs |
|---|---|---|
| Renderer | Day 4 | Three proof, materials, visual scenes |
| World/core | Day 15 | schemas, generator, deltas, tests |
| UI/education | Day 35 | content loader, quiz/Book components |
| Audio | Day 50 | mixer/service, manifest cleanup |
| Validation | Day 4 | visual scene specs, perf/tests |
| Source reconciliation | Day 1 | stale issue/doc updates |

## Weekly checkpoint questions

Ask every week:

1. Can the old game still run?
2. Did the new branch prove something concrete?
3. Did we add tests or only code?
4. Did we preserve renderer-agnostic world data?
5. Did any scope creep enter without a decision?
6. Is the parity matrix more complete than last week?

## Definition of success after 90 days

Best case:

- Three.js path accepted;
- `src-next` has deterministic world, renderer MVP, gameplay MVP, quiz/Book MVP;
- major current-alpha parity gaps are known;
- visual/perf validation exists;
- full rewrite continuation is justified.

Acceptable case:

- Three.js spike failed honestly;
- the repo avoided a bad rewrite;
- current Canvas/Iso2 path has clearer validation and source-of-truth docs.

Failure case:

- partial rewrite with no parity;
- old game broken;
- no proof artifacts;
- stale docs still guiding work;
- no go/no-go decision.
