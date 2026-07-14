# 10 — Three.js Orthographic Proof Spike Spec

> **SUPERSEDED — 2026-07-07:** The spike described here was attempted and rejected. This file is historical. Do not create or continue a Three.js spike from this spec. See [`17-threejs-rejection-record.md`](17-threejs-rejection-record.md).

**Date:** 2026-07-07  
**Purpose:** Define a bounded spike that can validate or falsify the proposed Three.js clean-branch architecture before a full rewrite.

## Spike thesis

Three.js with an orthographic isometric camera can render Emily's Game's intended structures more simply and robustly than the current Canvas 2D face-slice/painter's algorithm path, while preserving deterministic world metadata and DOM UI.

## Non-goals

- Do not port the whole game.
- Do not port all content packs.
- Do not build all UI.
- Do not make a new art style without comparison to Iso2 goals.
- Do not implement full macro solver.
- Do not require LLM.
- Do not replace issue/backlog planning with this spike.

## Hard success criteria

The spike succeeds only if all are true:

1. Geometry handles wall/river/bridge/player depth more simply than current Canvas logic.
2. Logical nano/world data remains renderer-agnostic.
3. A DOM quiz overlay can unlock a gate and persist the delta.
4. A deterministic chunk hash test passes.
5. A visual scene can be generated as a compact proof artifact.
6. Performance looks plausible: no obvious frame spikes in the tiny integration scene.
7. The code shape feels easier for future agents to extend.

## Failure criteria

Stop or reassess if:

- Three.js scene setup becomes more complex than the current Canvas renderer for basic structures;
- orthographic view cannot match the desired isometric/toybox style;
- material/texture mapping becomes a worse problem than Canvas face slicing;
- chunk instancing is too heavy or awkward;
- DOM overlay + Three event coordination is fragile;
- deterministic world data gets polluted by renderer types.

## Proposed location

Preferred for spike isolation:

```text
experiment/three-clean-spike/
```

Alternative if committing directly to clean branch:

```text
src-next/
```

Keep it isolated from current `src/` until the spike proves value.

## Minimal dependencies

Runtime:

- `three`
- optional `@types/three` if needed
- optional `preact` for DOM overlay if using a component shell

Dev:

- existing TypeScript/Vite stack;
- Vitest recommended for pure tests if added.

## Data-first spike architecture

```text
src/
  core/
    rng.ts
    coords.ts
    hash.ts
  world/
    schema.ts
    generate-demo-chunk.ts
    walkability.ts
    deltas.ts
  render-three/
    create-scene.ts
    chunk-mesh-builder.ts
    materials.ts
    player-card.ts
    visual-capture.ts
  gameplay/
    movement.ts
    interaction.ts
  ui/
    quiz-gate-overlay.ts
  tests/
    determinism.spec.ts
    walkability.spec.ts
```

## Required world data

The spike chunk must include:

- base grass field;
- dirt path;
- water/river cells with negative-Z nano metadata;
- bridge over river;
- stone-wall corner/perimeter fragment;
- fence + gate segment;
- one locked quiz gate;
- player spawn;
- one collectible coin/chest optional.

## Required scenes

### Scene 1 — Base terrain

Purpose: prove orthographic terrain and material scale.

Contents:

- 15×15 visible area;
- grass/dirt/water;
- no structures.

Acceptance:

- no stretch artifacts;
- no obvious grid seams beyond intended tile borders;
- camera framing matches isometric expectations.

### Scene 2 — Wall geometry proof

Purpose: prove extruded wall corners without Canvas seam bugs.

Contents:

- 7×7 stone-wall perimeter or smaller L/corner mini-scene;
- player in front/behind wall;
- debug wireframe toggle.

Acceptance:

- no visible void at outer corners;
- depth buffer hides player behind solid wall;
- wall material orientation is stable enough for future refinement.

### Scene 3 — River + bridge

Purpose: prove negative-Z and bridge-over-water logic.

Contents:

- river channel;
- bridge spanning land-water-land;
- player positions in water, on bridge, and on bank.

Acceptance:

- water appears below ground;
- bridge appears above water;
- player cannot walk through river except bridge;
- player sink offset visible if standing in shallow/sink test cell.

### Scene 4 — Gate + quiz overlay

Purpose: prove game/UI/data integration.

Contents:

- fence/wall gate with condition `quiz-gate`;
- DOM quiz overlay;
- gate state delta saved after correct answer.

Acceptance:

- locked gate blocks;
- quiz answer unlocks;
- gate visual and walkability update;
- reload/apply delta preserves unlocked state.

### Scene 5 — Normal generated startup smoke

Purpose: avoid repeating current branch problem where curated proofs pass but generated gameplay looks odd.

Contents:

- deterministic generated chunk from spike generator;
- starter homestead/fence/water/path mixture;
- player spawn.

Acceptance:

- visually coherent at game start;
- no standalone old-style structure icons;
- no route-blocking layout.

## Required tests

### Pure tests

- `same seed + coords -> same chunk hash`
- `bridge spans valid banks`
- `river cell blocks unless bridge/gate condition permits`
- `gate unlock delta changes walkability`
- `save delta serializes/deserializes`

### Visual tests

- capture/metadata for scenes 1-5;
- visual tests can be manual-review PNGs initially;
- no giant full-page screenshots required.

### Manual playtest

- move around wall;
- try to enter water;
- cross bridge;
- unlock gate with quiz;
- reload and verify gate remains unlocked.

## Suggested 10-day plan

### Day 1 — project shell

- create isolated Vite app/folder;
- install Three.js;
- render orthographic grid plane;
- add deterministic RNG/hash.

### Day 2 — data schema and generator

- define micro/nano/chunk schema;
- generate deterministic demo chunk;
- hash test.

### Day 3 — terrain renderer

- build terrain mesh/instancing;
- grass/dirt/water materials;
- camera framing.

### Day 4 — wall geometry

- stone-wall mesh builder;
- corner/straight variants;
- debug wireframe;
- scene capture.

### Day 5 — river/bridge geometry

- depressed river geometry;
- bridge mesh;
- bank spanning validator;
- walkability tests.

### Day 6 — player card and collision

- player billboard/card;
- movement/collision;
- occlusion/sink proof.

### Day 7 — gate and DOM quiz

- condition state;
- gate visual/walkability swap;
- minimal DOM quiz overlay.

### Day 8 — save delta

- serialize opened gate;
- reload/apply delta;
- integration test.

### Day 9 — normal startup scene

- deterministic generated chunk composition;
- starter homestead or safe fenced area;
- screenshot proof.

### Day 10 — report decision

- summarize findings;
- compare complexity vs current Canvas path;
- decide continue/pivot/stop.

## Decision output

At the end of the spike, write:

```text
Docs/clean-rebuild-assessment/13-threejs-spike-results.md
```

Required sections:

- what worked;
- what failed;
- screenshots/artifacts;
- performance notes;
- complexity comparison;
- whether to proceed with full clean branch;
- updated estimate.
