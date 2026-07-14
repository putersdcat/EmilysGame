# 05 — Deep Intent and Feature Map

**Second-pass date:** 2026-07-07  
**Purpose:** Preserve the rich documented intent before any clean-branch rewrite. This file is intentionally broader than the first-pass summary; it captures what the docs and issues imply must either be rebuilt, consciously revised, or explicitly cut.

## Canonical product pillars

### 1. Child-friendly educational adventure

Emily's Game is not just a procedural terrain demo. The original and later docs consistently describe a cozy, child-friendly learning adventure with:

- Zelda-like exploration;
- short 5-15 minute play sessions;
- quizzes as progression and rewards;
- NPCs, shops, chests, gates, items, and discovery;
- a Book of Knowledge as a real in-game learning tool;
- subject selection and age-appropriate content;
- a gentle “I don't know → learn in the Book” path.

Clean-branch implication: education systems must be in the core parity plan, not a postscript after rendering.

### 2. Procedural world as a grammar

The WorldEngine docs are clear: the target is not random tile scatter. The intended world is a formal tile grammar:

```text
Micro Tile → Nano Overlay → World Unit → Macro Tile
```

Every layer has metadata, contracts, and validation rules. Visuals are only one consumer of that metadata.

Clean-branch implication: the new renderer can change, but the logical world grammar must remain renderer-agnostic and deterministic.

### 3. LLM as creative entropy, not truth authority

The LLM's intended role is novel but bounded:

- generate absurd verb/noun pairs;
- expand them into nonsense text;
- hash text into deterministic seeds;
- add flavor to NPCs and quiz wording;
- optionally feed player chat/quiz terms back into the entropy pool.

The LLM must **not** be trusted to verify quiz correctness or math. Verification remains deterministic TypeScript/game logic.

Clean-branch implication: keep LLM as optional entropy/flavor; do not gate core playability or startup on LLM availability.

### 4. Determinism and replayability

The save model depends on deterministic generation:

- same seed + coordinates → same base chunk/macro;
- chunks regenerate from seed;
- saves store player state and deltas, not full generated terrain;
- entropy buffer is part of the replay state;
- tests must lock golden outputs.

Clean-branch implication: build deterministic chunk snapshots and property tests before advanced visuals.

### 5. Isometric storybook toy-world visual identity

The visual intent is not flat. The desired world has:

- readable height;
- walls, fences, roofs, bridges, rivers, gates;
- occlusion and partial visibility;
- cozy, toy-like/procedural structure;
- high-detail natural terrain;
- composed structures such as homesteads and cathedrals.

Clean-branch implication: a Three.js orthographic renderer should aim for the same isometric/toybox visual identity, not become a generic free-camera 3D game.

### 6. Playability guarantees before variety

The world must guarantee:

1. no softlocks;
2. no required content isolated behind invalid obstacles;
3. no dead ends without reward;
4. traversable macro tiles;
5. lock/key/quiz dependencies in valid order;
6. fair corridor clearance and collision readability.

Clean-branch implication: progression and validation solvers are core engine features.

### 7. DOM UI over renderer UI

Across docs and code, UI belongs in HTML DOM, not in the world renderer. Menus, Book, quiz panels, HUD, inventory, settings, audio UI, and accessibility all benefit from DOM.

Clean-branch implication: Three.js should render the world only; Preact/React/DOM should own UI.

### 8. Local-first web delivery

Preserve:

- Vite + TypeScript browser app;
- static hosting compatibility;
- local saves;
- offline/test fallback paths;
- no mandatory remote service for core gameplay.

Clean-branch implication: even with Three.js, do not pivot to a heavyweight native/editor-first engine unless the web-first goal is intentionally abandoned.

### 9. Visual proof discipline

Iso2 docs encode hard-earned process rules:

- single-tile previews do not prove composed geometry;
- composed scenes are the acceptance target;
- debug flat/geometry modes are required;
- PNG/visual artifacts must be linked to issue closure;
- MCP/visual tools are mandatory for visual work.

Clean-branch implication: keep visual validation as a first-class CI/tooling requirement.

### 10. Warm organic audio/UX tone

The audio brief and feature history imply a cozy, natural tone:

- no harsh synthetic hiss or jump scares;
- sampled ambience/SFX preferred;
- positional audio for campfire/water/wildlife;
- classical/MIDI music and cassette-player UI are part of the personality.

Clean-branch implication: audio is part of product identity, not just optional polish.

## World model inventory to preserve

### Micro tiles

Required conceptual metadata:

- traversal class: walkable, blocked, conditional, hazardous;
- height profile;
- per-side edge connector signature;
- surface type;
- decoration eligibility tags;
- visual variation family;
- biome/climate affinity;
- collision semantics independent of art.

### Nano overlays

Nano is a first-class 3×3 sub-grid inside one micro tile. Preserve:

- kind;
- 3×3 footprint occupancy;
- anchor patch;
- z mode: positive, negative, flat;
- render family: billboard, extruded, carve-out, flat;
- z offset;
- walkability rule: always, never, conditional;
- edge presence;
- connectivity signature;
- variant family: straight, corner, tee, cross, end, isolated;
- blend policy;
- stack ordering.

Canonical stacks:

- river carve-out + bridge;
- grass base + tall grass;
- wall/fence + gate;
- river-bank + water;
- roof/wall/foundation assembly components.

### World units

A world unit is a 5×5 local motif. Preserve:

- traversal mask;
- movement channels;
- border edge signatures;
- transform permissions;
- anchor points for NPCs/items/gates/scenery;
- connectivity class;
- biome and mood weights;
- minimum openness.

### Macro tiles

A macro tile is a 5×5 set of world units, 25×25 micro cells. Preserve:

- macro edge contracts;
- entrances/exits;
- route corridors;
- safe pockets;
- progression landmarks;
- difficulty/biome profile;
- solver confidence and repair history.

## Intended solver pipeline

The clean rebuild should preserve the conceptual 10-phase WorldEngine pipeline:

1. Entropy harvest.
2. Theme/biome/mood selection.
3. Boundary collection from generated neighbors.
4. Macro assembly with constraint propagation.
5. Micro fill, nano resolution, and auto-tiling.
6. Chain integrity validation.
7. Progression placement.
8. Population.
9. Playability validation and repair.
10. Cache/render preparation.

Important algorithms/directives:

- AC-3-like propagation;
- MRV collapse;
- boundary-first and chain-first placement;
- deferred constraints for streaming;
- targeted repair before reroll;
- universal adapter tiles as recovery;
- chain terminators unless a chain exits to a future neighbor;
- corner governance;
- validation reports for debugging.

## Gameplay feature inventory

### Core loop

1. Generate/choose LLM-influenced seed.
2. Spawn in safe chunk/macro.
3. Explore isometric world.
4. Collect coins/items.
5. Resolve obstacles and quizzes.
6. Talk/trade with NPCs.
7. Learn through Book of Knowledge.
8. Reach treasure/chapter objective.
9. Save and continue/revisit.

### Movement/collision

Preserve or consciously revise:

- keyboard WASD/arrows;
- touch/gamepad support;
- interact key;
- logical collision with visual hitbox tuning;
- nano-aware collision for partial footprints;
- player sink on negative-Z surfaces;
- occlusion behind solid walls;
- see-through gaps for fences.

### Obstacles and progression

Preserve:

- locked door/key;
- barricade/crowbar;
- toll gate/coins;
- quiz gate;
- river/bridge;
- troll bridge;
- NPC gatekeeper;
- treasure room/chest;
- signs/waymarks;
- dead-end rewards.

### Economy and inventory

Preserve:

- coins;
- keys;
- tools;
- potions/consumables;
- shops;
- buy/sell/trade;
- barter quiz;
- biome/persona-aware merchant flavor.

### NPC/social systems

Preserve:

- merchants;
- villagers/hint NPCs;
- guardians/gatekeepers;
- biome personas;
- short LLM/fallback dialogue;
- voice/mouth animation if feasible;
- NPC interactions feeding entropy.

### Wildlife/survival/status

Preserve as parity scope unless consciously cut:

- wildlife species and facts;
- discovery interactions;
- wildlife quiz bias;
- cats and animal behaviors;
- energy/hydration/cleanliness;
- injury and wound-care quiz;
- stream drinking / worm eating / hygiene systems;
- non-lethal status debuffs.

## Education/content inventory

### Subject selection

Subjects from docs/code:

- Math;
- Science;
- History;
- Language / English / German;
- Technology;
- Logic;
- Geography;
- Art;
- custom topics as future expansion.

### Quiz system

Preserve:

- multiple choice;
- difficulty tiers;
- age bands;
- explanations/hints;
- selected-subject bias;
- "I don't know" path;
- rewards;
- quiz gates;
- accessibility: auto-read, repeat, numeric keys;
- older-kid free-response math as a planned path.

### Book of Knowledge

Preserve:

- inventory item / hotkey UI;
- searchable articles;
- summaries and key facts;
- key terms;
- related links;
- reading progress;
- discovery points;
- subject filters;
- age-appropriate content;
- word bag lookup.

### Content pipeline

Preserve:

- public-source ingestion;
- normalization;
- age-appropriate rephrasing;
- QA/safety gates;
- schema validation;
- sharded offline packs;
- manifest as source of truth;
- CI/manual review gates.

## Visual/asset inventory

### Legacy live structures

- `house`
- `hut`
- `shop`
- `shop_general`
- `shop_snack`
- `shop_trading`
- `outhouse`
- `wall`
- `door_locked`
- `door_open`
- `fence`
- `quiz_gate`
- `toll_gate`
- `barricade`
- `bridge`

### Nano structural kinds

- `stone-wall`
- `cathedral-wall`
- `homestead-wall`
- `fence`
- `gate`
- `bridge`
- `troll-bridge`
- `river`
- `river-bank`
- `tall-grass`
- roof pieces / slopes / ridges in current branch.

### Structure families

The docs imply these authored families:

- stone wall kit;
- castle/fortification kit;
- cathedral/church/ruins kit;
- homestead/cottage/hut kit;
- shop/market kit;
- gate/door/portcullis kit;
- crossing/bridge/troll-bridge kit;
- cave/ruin/interior kit;
- civic/plaza/treasure kit.

### Material families

Preserve or port:

- StoneBrick;
- RedClinker;
- AncientStone;
- DarkCathedralStone;
- SandstoneBrick;
- MudBrick;
- TimberFrameWall;
- PlasterWhitewashWall;
- RoughWoodPlankWall;
- CottageStoneFoundation;
- ThatchRoof;
- fence styles;
- water families;
- weathering overlays: mud, moss, snow, cracks/wetness.

Clean-branch implication: use material families plus topology/geometry, not one flat sprite per structure.

## UI/platform inventory

Preserve:

- HUD/sidebar;
- inventory tray;
- status bars;
- minimap;
- dialog overlay;
- quiz overlay;
- Book overlay;
- trade overlay;
- options overlay;
- main menu;
- pause menu;
- save slots;
- audio UI/cassette deck;
- LLM settings;
- tutorial;
- character customizer;
- thought bubbles;
- debug overlay;
- bug report capture;
- touch controls;
- gamepad support;
- Tesla mode if still desired.

## Audio inventory

Preserve/rebuild:

- music playlist;
- MIDI/SoundFont path or replacement;
- cassette/tapeplayer personality;
- SFX one-shots;
- terrain footsteps;
- sampled ambience;
- positional audio;
- animal calls;
- NPC voice / speech synthesis toggle;
- ducking during overlays;
- full mute correctness;
- no synthetic hiss/ambience fallback once curated assets exist.

## Validation directives

Clean branch must have:

- deterministic unit tests;
- property tests for generator invariants;
- visual scenes for each structural family;
- composed-scene acceptance, not just single assets;
- performance artifacts;
- content schema/QA tests;
- Playwright or browser integration tests for player flows;
- issue-linked validation evidence.

## Source-of-truth recommendation

Use these as primary sources:

1. `Docs/WorldEngine-00..05` for world/generation semantics.
2. Open GitHub issues for current acceptance and state.
3. Current `src/` and tests for delivered behavior.
4. Iso2 docs for visual process/lessons and nano semantics.
5. `public/content/packs/default-v1/manifest.json` for content counts.

Treat as historical/secondary:

- archived planning docs;
- older IsoRenderingPlan versions when contradicted by later Iso2 issues;
- stale README/ARCHITECTURE status sections until refreshed.
