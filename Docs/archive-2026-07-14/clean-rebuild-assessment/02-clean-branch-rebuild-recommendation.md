# 02 — Clean Branch Rebuild Recommendation

> **SUPERSEDED — 2026-07-07:** This first-pass recommendation favored a Three.js orthographic renderer. Subsequent isolated and main-engine proof attempts failed to preserve Emily's Game's visual/composition quality. Do **not** use this file as current implementation guidance. See [`17-threejs-rejection-record.md`](17-threejs-rejection-record.md) and [`18-canvas-iso2-hardening-plan.md`](18-canvas-iso2-hardening-plan.md).

## Executive recommendation

If a clean branch can relax the original artificial limitation of "Canvas 2D only, no heavy libraries," I would not rebuild Emily's Game as another pure Canvas 2D engine.

I would rebuild it as:

> **TypeScript + Vite + Three.js orthographic WebGL renderer + DOM/Preact UI + pure deterministic world/gameplay packages + workerized generation + schema-validated content packs + hard visual/property tests.**

The goal is not to chase technology for its own sake. The goal is to remove the accidental complexity that has repeatedly slowed the project: hand-authored isometric Canvas geometry, painter's-algorithm depth sorting, wall face seams, extrusion math, and occlusion hacks.

## What to preserve

### Preserve the product identity

Keep:

- child-friendly educational adventure;
- short sessions;
- local-first saves;
- procedural replayability;
- LLM entropy novelty;
- quizzes and knowledge as progression;
- biome progression;
- exploration, collection, NPCs, and cozy adventure tone.

### Preserve the deterministic world principles

Keep:

- chunk generation from seed + coordinates;
- deterministic fallback when LLM is absent;
- generated base world plus persisted deltas;
- property tests for determinism;
- world-unit/micro/nano concepts;
- edge contracts and passability validation;
- future lock-key/quiz-gate DAG guarantees.

### Preserve content investments

Reuse or port:

- quiz and article packs;
- NPC personas;
- item definitions;
- music/SFX assets;
- known-good procedural material functions;
- existing gameplay tests as acceptance references;
- visual scenes that catch real composition bugs.

### Preserve hard lessons from Iso2

Carry forward these rules:

- visual work is not done until composed scenes pass;
- single-tile previews are not sufficient;
- visual baselines need named purpose and acceptance criteria;
- debug geometry modes should exist for walls/rivers/bridges/occlusion;
- issue closure needs linked visual evidence.

## What to replace

### Replace Canvas isometric geometry with real orthographic 3D-ish rendering

Use Three.js with an orthographic camera. Render the game as stylized low-poly / 2.5D geometry:

- terrain as instanced diamond/plane meshes or low-height prisms;
- walls as actual boxes/prisms;
- fences/gates as thin geometry or billboards with real depth;
- rivers as depressed planes/channels;
- bridges as raised meshes;
- roofs as sloped geometry;
- player/NPC sprites as billboards or small 3D paper-cut cards.

Why this is the biggest change:

- the depth buffer handles many occlusion cases;
- wall corners are geometry, not manual face-slice painter logic;
- bridge-over-river is physically represented;
- roof slopes are natural;
- lighting/shadow options improve;
- visual bugs become easier to inspect in 3D debug mode.

The current Canvas renderer is clever, but it is solving problems a WebGL scene graph already solves.

### Replace broad `GameState` dependency with stores and events

Instead of one giant object passed everywhere, use subsystem stores:

- `WorldStore`
- `PlayerStore`
- `InventoryStore`
- `EducationStore`
- `InteractionStore`
- `AudioStore`
- `UiStore`
- `SettingsStore`

Systems should communicate through typed commands/events:

```ts
dispatch({ type: 'gate.quizPassed', gateId });
dispatch({ type: 'inventory.add', itemId: 'coin', qty: 5 });
dispatch({ type: 'knowledge.openArticle', articleId });
```

This reduces hidden coupling and makes save migration/testing easier.

### Replace code-heavy config with schema-validated content

Move large config tables to data files:

- tile definitions;
- nano definitions;
- world-unit templates;
- NPC definitions;
- item definitions;
- audio manifests;
- content packs.

Use a validator such as `zod` or generated JSON Schema. Build-time scripts should produce TypeScript indexes and fail on invalid data.

This avoids another 2,000+ LOC config god-file.

### Replace startup-blocking LLM gate with asynchronous enrichment

The game should start immediately using deterministic fallback entropy. LLM should enrich future chunks/dialogue asynchronously.

Recommended behavior:

1. Start game with deterministic seed and fallback wordlist.
2. Start LLM health check in background.
3. If LLM is available, generate/refresh entropy events.
4. Cache entropy events in save/session storage.
5. Never block movement, UI, or new game start on LLM availability.

The LLM is a flavor/entropy advantage, not a hard dependency.

## Recommended architecture

```text
src-next/
  app/
    main.ts
    boot.ts
    routes.ts
  core/
    rng.ts
    coords.ts
    events.ts
    scheduler.ts
    test-mode.ts
  world/
    schema.ts
    chunk-generator.ts
    world-unit-solver.ts
    edge-contracts.ts
    passability.ts
    progression-dag.ts
    population.ts
    chunk-worker.ts
  render-three/
    renderer.ts
    scene.ts
    camera.ts
    chunk-mesh-builder.ts
    materials.ts
    instancing.ts
    player-billboard.ts
    debug-overlays.ts
  gameplay/
    movement.ts
    collision.ts
    interactions.ts
    inventory.ts
    quests.ts
    wildlife.ts
    status.ts
  education/
    quiz-engine.ts
    content-loader.ts
    knowledge-book.ts
    age-profile.ts
  llm/
    entropy-client.ts
    npc-chat.ts
    fallbacks.ts
    cache.ts
  ui/
    components/
    state/
  audio/
    mixer.ts
    music.ts
    sfx.ts
  persistence/
    save-store.ts
    migrations.ts
    deltas.ts
  content/
    schemas/
    generated/
```

## Layer contracts

### World engine must be renderer-agnostic

The world engine emits logical data:

- chunks;
- cells;
- nano occupancy;
- traversal/walkability;
- entities;
- progression constraints;
- deltas.

It must not import Three.js, DOM, Canvas, or UI.

### Renderer consumes immutable chunk snapshots

The renderer builds meshes from chunk snapshots and applies deltas through explicit invalidation messages.

It should not decide gameplay walkability. It can expose picking/debug helpers, but source of truth remains world/gameplay data.

### Gameplay talks through commands/events

Movement, interaction, inventory, quiz, and NPC systems should not mutate arbitrary nested state directly. They should emit commands that stores apply.

### UI remains DOM

Keep the good existing decision: UI belongs in DOM, not canvas. Use Preact/React only to reduce manual DOM plumbing.

## Technology options considered

### Phaser

Good for conventional 2D games. Less ideal here because the hardest requirements are true 2.5D isometric structure, wall depth, bridges, roofs, and occlusion. Those remain custom.

### PixiJS

Excellent 2D renderer. It would improve batching and sprite management but would not fully remove painter's-algorithm/isometric geometry pain.

### Three.js

Best match if the project wants Iso2-style structural geometry. It keeps the app web-native and TypeScript-friendly while replacing the most fragile rendering math with real geometry/depth.

### Godot

Potentially fastest for game-editor workflows, but too disruptive for this repo's TS/web/content/LLM/test investments. Web export size and integration complexity are also concerns.

## Recommended choice

Use **Three.js**, not a full game engine.

This keeps Emily's Game as a web-native TypeScript product but stops wasting effort on low-level rendering problems that Three.js already solves.

## Current-parity target

Current alpha parity should mean:

- player movement and collision;
- camera follow;
- generated chunks;
- biome variation;
- items/coins/chests;
- NPCs/dialogue;
- quizzes and quiz gates;
- inventory;
- save/load with deltas;
- Book of Knowledge;
- content packs;
- basic audio/music;
- wildlife subset;
- status/injury subset;
- character customization subset;
- touch/gamepad basics;
- visual quality at least matching current Iso2 branch in representative scenes;
- tests for generation, movement, interaction, education, and rendering.

## Full documented-vision target

Full documented parity should include:

- robust macro/world-unit/micro/nano grammar;
- cross-chunk edge contracts;
- chain integrity;
- progression DAG guarantees;
- rich structural kits:
  - homestead;
  - cathedral;
  - fences;
  - gates;
  - bridges;
  - rivers;
  - castle/cave/civic structures;
- true educational loop:
  - subject selection;
  - age filtering;
  - Book lookup;
  - word bag;
  - quiz/knowledge gating;
  - content expansion;
- deterministic LLM entropy;
- NPC flavor/chat feeding entropy;
- visual validation suite;
- performant 60 FPS target on intended hardware;
- production-quality save migrations;
- CI gates for content/schema/test/visual regression.

## Migration strategy

Do not rewrite the current branch in place. Instead:

1. Create a clean branch or `src-next/` parallel implementation.
2. Build a two-week proof spike.
3. Reuse current content/tests as acceptance references.
4. Keep current game playable while the new runtime matures.
5. Only cut over when current alpha parity is demonstrably reached.

The current codebase should remain the reference implementation until the new branch proves it can render, generate, move, interact, quiz, and save better than the existing branch.
