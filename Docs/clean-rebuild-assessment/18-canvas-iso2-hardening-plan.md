# 18 — Canvas/Iso2 Hardening Plan After Three.js Rejection

**Date:** 2026-07-07  
**Decision:** Keep the existing Canvas/Iso2 main engine. Do not pursue Three.js.  
**Goal:** Make normal generated gameplay coherent by aligning generation, structure semantics, materials, renderer, and visual validation.

## Why this is now the right path

The failed Three.js attempts showed that the renderer library was not the core missing piece. The core problem is that multiple systems are not yet speaking the same structural language:

- the generator still emits too many isolated v1-style asset cells;
- Iso2 visuals expect multi-cell structures and nano-aware topology;
- material factories are meaningful only when the structural geometry is correct;
- bridge/fence/wall/cathedral/homestead assets need authored assembly semantics, not ad-hoc per-cell rendering;
- validation must look at normal generated gameplay, not only curated proof scenes.

The existing Canvas/Iso2 path already contains the project-specific projection, nano grammar, material factories, tests, and visual iteration tooling. It is flawed, but it is the only path that currently embeds the game’s learned constraints.

## Immediate priorities

### 1. Fix normal generated composition (#277)

Do not add new art families first. Make generated gameplay coherent with existing families.

Tasks:

- reduce or eliminate standalone `house`/`hut`/`shop` cells in normal generation;
- replace them with authored assemblies or safe-zone templates;
- ensure origin chunk composition is stable and readable;
- make the starter homestead a true structure: foundation + walls + roof + gate + path;
- keep old v1 cells only as fallbacks, not primary generated structures.

Acceptance:

- normal startup screenshot looks coherent without manual injected test scene;
- no loose roof shards, lone wall towers, nonsense fences, or bridges in open water;
- `tests/rendering/iso2-main-game-visual-smoke.spec.ts` remains meaningful and updated.

### First recovery slice completed in this session

The origin starter homestead was extracted into `src/engine/world/StarterHomestead.ts` and changed from a loose `fence` ring + single `house` icon into an explicit generated safe-zone assembly using real main-engine asset keys:

- fenced yard;
- stone-floor cottage footprint;
- lower starter plaster wall band;
- quiz gate entrance;
- path/campfire/sign/coin affordances.

Important finding from live screenshot iteration:

- full roof nanos and cottage foundation wall nanos are **not safe for normal startup generation yet**. They produced enormous, visually broken roof/foundation blocks in normal gameplay. They should stay in focused material/geometry proof scenes until the engine has a true multi-cell house/roof assembly primitive.

Current stabilized rule:

- startup may use low starter wall/floor/gate primitives;
- startup must not emit `roof_thatch_*` or `stone_wall_cottage_foundation` as ordinary generated safe-zone cells.

### 2. Make generator output structure-aware

Rendering cannot fix semantically bad input.

Tasks:

- promote structures to generation-time assemblies;
- define explicit placement rules for homestead, ruins/cathedral, fences, bridge crossings;
- emit connected assets/nanos with known variants rather than relying on renderer inference alone;
- add generator-level assertions for bank-to-bank bridges and fence/gate continuity.

Acceptance:

- structure placement tests prove assembled footprints are coherent;
- bridges always have bank-water-bank topology;
- gates are embedded in fence/wall runs, not standalone blockers.

### 3. Build the visual-test suite (#255)

The project needs repeatable visual proof before more visual work.

Tasks:

- add `npm run visual-test`;
- define canonical scene specs;
- separate scratch/candidate/baseline artifacts;
- include normal generated startup scene as a first-class visual test;
- include wall, fence, river/bridge, homestead, cathedral/ruin, and final integration scenes.

Acceptance:

- a deliberate regression fails visual-test or produces an obvious candidate diff;
- issue closure links test command + artifact path.

### 4. Preserve material factories inside the existing renderer

Do not try to route Iso2 SVG material factories through a generic 3D adapter.

Tasks:

- keep material factories as canonical SVG/Canvas sources for the Canvas renderer;
- verify each material family in composed scenes, not only isolated tiles;
- add narrow adapter comments where experiment behavior differs from main;
- continue porting through existing `nano-tile`, `nano-tile-defs`, `terrain-cache`, and material modules.

Acceptance:

- material proofs are paired with main-engine screenshots;
- no raw material family is considered “done” without composed-scene validation.

### 5. Fix source-of-truth drift

Tasks:

- update stale README/ARCHITECTURE references to `AGENTS.md` if still missing;
- update issue statuses for delivered refactors (#254/#269/#270/#271/#273/#275 as applicable);
- mark Three.js recommendation docs as superseded;
- keep `17-threejs-rejection-record.md` as the final architectural outcome of this experiment.

## What not to do

- Do not create another Three.js/Pixi/Phaser renderer spike right now.
- Do not add more visual families before normal generated gameplay is coherent.
- Do not rely on screenshots of isolated tiles as completion proof.
- Do not let renderer code infer all structure semantics from disconnected cells.
- Do not convert material factories to another rendering model until the existing pipeline is stable.

## Suggested next issue title

> Main engine Iso2 composition hardening: generator emits coherent assemblies, not v1 loose cells

Suggested acceptance:

- starter homestead generated as assembly;
- bridge placement validated bank-to-bank;
- fences/gates connected and variant-correct;
- origin screenshot coherent;
- `npx tsc --noEmit` and focused `tests/rendering/iso2-*.spec.ts` pass;
- visual artifact committed for startup scene.

## Revised architecture stance

The clean-rebuild idea should now mean:

> Clean up and harden the existing engine in place, preserving the Canvas/Iso2 renderer and world grammar, rather than replacing the renderer stack.

If a future renderer replacement is considered, it must first reproduce current Iso2 proof scenes **side-by-side** with the Canvas renderer using identical generated data and objective visual criteria.
