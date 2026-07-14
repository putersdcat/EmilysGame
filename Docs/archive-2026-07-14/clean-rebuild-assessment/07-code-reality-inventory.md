# 07 — Code Reality Inventory

**Second-pass date:** 2026-07-07  
**Purpose:** Document what is actually implemented now, what is partial, and what should be reused versus redesigned in a clean branch.

## Meta finding

The current codebase has evolved beyond several docs. In particular:

- `src/engine/gen.ts` is a facade, not a 2,500-line monolith.
- `src/main.ts` is much smaller than old docs claim, but still contains large orchestration functions.
- `src/ui/ui.ts` and `src/engine/llm.ts` appear much more decomposed than open issue titles imply.
- Current hotspots are config/render/nano/world-solver/audio/input files.

## Implemented systems by subsystem

### Core runtime

Implemented:

- Vite + TypeScript browser app;
- requestAnimationFrame loop;
- Canvas 2D renderer;
- DOM UI overlays;
- test mode;
- perf stats;
- debug globals;
- menu/new-game/load flows;
- asset/content/bootstrap flow.

`main.ts` currently orchestrates:

- initialization;
- quiz/dialog/trade modal priority;
- movement/collision;
- interactions;
- subsystem ticks;
- game loop.

Clean-branch action: preserve behavior, but split runtime into app lifecycle + stores + systems from day one.

### State and persistence

Implemented:

- broad `GameState` factory;
- localStorage save/load;
- four save slots;
- resolved-cell persistence;
- entropy buffer persistence;
- knowledge/book state;
- cosmetics/wildlife/status/audio/voice/streak/fog/age/injury/playtime/touch settings.

Clean-branch action: convert to versioned save with generated-world deltas and subsystem state slices.

### Procedural generation

Implemented:

- async LLM generation path;
- sync deterministic generation path;
- Perlin/base terrain;
- AC-3-style world-unit solver;
- stamping;
- passability;
- anchor population;
- decoration clusters;
- collectibles/coin trails;
- quiz/fence gates;
- locked door promotion;
- bonfires;
- entropy flags;
- difficulty-scaled obstacles;
- lock/key balancing;
- dead-end rewards;
- playability validation;
- starter homestead.

Clean-branch reuse:

- algorithms and tests are valuable;
- schema should be redesigned into data-driven world definitions;
- generation should run in a Worker;
- solver output should include explicit nano occupancy and progression metadata.

### Tile/world metadata

Implemented:

- large `tiles.config.ts` with micro defs, edge compatibility, world-unit templates, rotations, traversal/corner/chain helpers;
- biome/climate/LOD metadata;
- tests for edge contracts and generation determinism.

Clean-branch action:

- split authored data from runtime algorithms;
- validate with schema;
- generate TypeScript indexes;
- reduce giant config files.

### LLM

Implemented:

- OpenAI-style client;
- health check;
- completions/chat;
- endpoint fallback structure;
- TPS tracking;
- wordlist generation/cache;
- entropy expansion;
- NPC chat;
- quiz rephrase;
- test-mode bypass;
- deterministic fallback.

Partial/inconsistent:

- default endpoint differs from older docs;
- fallback endpoints default empty;
- production remote/auth story is basic;
- LLM is usually bypassed in tests/fallback.

Clean-branch action: keep API shape, but make LLM non-blocking and optional.

### Movement/collision/interactions

Implemented:

- keyboard/touch/gamepad input;
- edge detection;
- axis-independent movement;
- footprint collision;
- exact nano walkability for walls/fences/gates/rivers/bridges;
- interactions for collectibles, NPCs, signs, chests, quiz gates, shops, campfires, outhouses, streams, worms, structures;
- auto-collect;
- hazard injury.

Clean-branch reuse:

- interaction vocabulary and tests;
- collision acceptance cases;
- nano walkability semantics.

Redesign:

- tie collision to explicit logical/nano occupancy, not renderer-derived inference.

### Rendering — main engine

Implemented:

- isometric Canvas renderer;
- terrain cache;
- sparse object cell lists;
- zero-allocation draw command pool;
- depth sort;
- occluder pool;
- SVG/emoji/NPC/player drawing;
- fire animation;
- local lights;
- fog;
- weather;
- particles;
- minimap;
- debuff visuals;
- debug grid;
- optional WASM path disabled by default.

Clean-branch action:

- treat this as a reference for pass order and feature parity;
- do not port low-level Canvas projection/depth code if Three.js proof succeeds.

### Iso2 main-engine port

Implemented:

- 144px / 256×128 geometry path;
- nano rendering defs;
- positive/negative/extruded nano concepts;
- wall/fence/river/gate/bridge/troll-bridge definitions;
- roof geometry;
- materials for brick/stone/homestead/roof/fence/water;
- weathering overlays;
- conditional walkability;
- visual tests.

Clean-branch reuse:

- material factories;
- variants/connectivity vocabulary;
- visual proof scenes;
- walkability test cases;
- assembly definitions.

Redesign:

- render as actual geometry/materials rather than Canvas face-slice drawing where possible.

### Audio

Implemented:

- MIDI/SoundFont music engine;
- playlist/track preload;
- music popup/cassette UX;
- biome-aware track switching;
- ducking;
- sampled SFX loader;
- one-shot SFX;
- ambience profiles;
- positional audio scanning/listener updates;
- terrain footsteps;
- animal calls;
- speech synthesis NPC voice.

Clean-branch action:

- reuse assets and manifests;
- redesign mixer as a clean audio service;
- preserve mute/test-mode guarantees.

### Education/content

Implemented:

- content pack loader;
- actual quiz/article packs;
- in-code fallback content;
- Book of Knowledge UI/state;
- article search;
- word bag;
- subject filters;
- discovery points/read tracking;
- quiz difficulty/category bias;
- `I don't know` path;
- auto-read/numeric accessibility;
- math solver/free-response hooks;
- content pipeline scripts and QA checks.

Clean-branch reuse:

- content pack files;
- schema concepts;
- quiz/Book behavior;
- QA scripts/tests.

Redesign:

- make manifest authoritative;
- avoid stale prose counts;
- isolate education as a package/system.

### UI/UX/platform

Implemented:

- HUD/sidebar;
- menus/options/save slots;
- music popup;
- LLM settings;
- status meters;
- inventory tray;
- toasts;
- dialogs/quizzes;
- Book overlay;
- customizer;
- age/subject selection;
- tutorial;
- controls guide;
- bug reporter;
- touch controls;
- gamepad;
- Tesla mode;
- thought bubbles/history.

Clean-branch action:

- use DOM/Preact components;
- preserve flows and accessibility;
- do not redraw these inside Three.js.

### Sprites/cosmetics/NPC visuals

Implemented:

- procedural player SVG sprites;
- walking frames/facing poses;
- hair/eyes/skin/clothes/accessories/outfits;
- expressions;
- transient expression overrides;
- cosmetic unlocks;
- procedural NPC paper-cut sprites;
- NPC mouth animation.

Clean-branch action:

- reuse SVG generation concepts;
- render player/NPC as billboards/cards in Three.js;
- preserve customization data model.

### Wildlife/survival

Implemented:

- deterministic wildlife spawning/cache;
- biome/time/habitat species weights;
- animal behaviors;
- facing direction;
- discoveries/facts;
- quiz bias;
- survival meters;
- injuries;
- hygiene/illness chain;
- stream/worm interactions;
- poop markers/particles.

Clean-branch action:

- decide whether all of this is current-parity or post-parity;
- if retained, implement as gameplay systems independent of rendering.

## Partial/incomplete/inconsistent areas

### VisualTestSuite not implemented as package script

Open #255 requires `npm run visual-test`, but root `package.json` lacks it. Visual tests exist, but the canonical visual-test runner is pending.

### Docs and issues stale

Several open issues appear delivered or partially delivered. Current docs have old paths/line counts. Clean rebuild should begin with source-of-truth reconciliation.

### Normal generated gameplay visual coherence remains open

#277 diagnoses the current main problem: proof scenes are good, but normal generation still emits old v1 composition concepts that do not always match rich Iso2 structures.

### Renderer/generator semantic mismatch

The current renderer can draw rich structures, but generator cells are still often single-cell legacy concepts. Clean branch should make generator output structure assemblies and nano occupancy explicitly.

### LLM deployment story

The client exists, but production local/remote configuration, proxying, and optional startup behavior should be clarified.

### Audio asset transition

Curated sampled SFX and synthetic ambience replacement remain open. Audio is partly delivered and partly pending.

## Reuse vs redesign matrix

| Area | Reuse directly | Reuse concept/tests | Redesign |
|---|---|---|---|
| Content packs | Yes | Yes | Minor manifest cleanup |
| Quiz/Book behavior | Some | Yes | Component/store structure |
| LLM client | Some | Yes | Non-blocking/fallback-first runtime |
| World solver | Some algorithms | Yes | Data schemas + worker pipeline |
| Tile/world-unit templates | Data mined | Yes | Schema-validated authored data |
| Canvas renderer | No if Three.js succeeds | Yes | Three.js geometry renderer |
| Iso2 material factories | Likely | Yes | Convert to Three materials/textures |
| Movement/collision | Some | Yes | Explicit occupancy/collision system |
| UI DOM flows | Some logic | Yes | Preact/structured components |
| Audio assets | Yes | Yes | Mixer/service architecture |
| Tests | Yes as acceptance | Yes | Add Vitest/property/visual CI |

## Code-derived clean-branch requirements

1. Keep generated world logic pure.
2. Keep render pass semantics but change renderer implementation.
3. Persist deltas, not generated chunks.
4. Make content manifests authoritative.
5. Preserve test-mode bypasses.
6. Preserve debug/test APIs, but make them typed and bounded.
7. Preserve current gameplay breadth unless explicitly cut.
8. Ensure normal generated gameplay is a first-class visual test, not just curated scenes.
