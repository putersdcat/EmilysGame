# 17 — Three.js Rejection Record

**Date:** 2026-07-07  
**Decision:** Reject Three.js as the recommended clean-rebuild direction based on failed proof work.  
**Status:** Three.js preview code/dependencies/scripts/artifacts removed from the working tree.

## What happened

The assessment initially recommended testing a Three.js orthographic path. Two attempts were made:

1. an isolated `experiment/three-clean-spike/` proof slice;
2. a main-engine preview graft under `src/three-preview.html` and `src/rendering/three-preview/*`.

Both failed to produce a compelling or faithful representation of Emily's Game.

## Why it failed

### 1. It did not preserve the game feel

The isolated spike looked like a tiny floating board in empty space. It did not match the scale, density, visual identity, or evolved hand-rolled renderer style of the current game.

### 2. It shifted complexity instead of removing it

Three.js solved none of the hard semantic problems automatically:

- generated cell composition still needed to become structure-aware;
- fences and walls still required correct topology/variants;
- bridges still required bank-to-bank semantic placement;
- player/entity scale and occlusion still required authored rules;
- materials still needed a proper conversion pipeline.

It replaced Canvas face-slice problems with a new adapter/material/scale/composition problem.

### 3. The material path was not straightforward

Direct SVG material textures from the Iso2 factories corrupted the headless WebGL screenshot path. Backing off to solid materials produced a cleaner screenshot but removed the material depth that made Iso2 worth porting.

This invalidated the assumption that existing Iso2 SVG/material factories could be quickly reused as Three.js textures.

### 4. The main-engine graft still looked wrong

Even after using `generateChunkSync()`, `ASSET_DEFS`, and real asset keys, the result still had obvious composition problems: illogical fence segments, poor structure massing, weak castle/chapel representation, scale issues, and overlap artifacts.

## Decision

Do **not** pursue Three.js as the clean-rebuild foundation.

Do **not** spend more time trying to make a Three.js spike sell the direction.

Do **not** add Three.js to the main runtime or package dependencies.

## Cleanup performed

Removed from the working tree:

- `experiment/three-clean-spike/`
- `src/three-preview.html`
- `src/three-preview.ts`
- `src/rendering/three-preview/*`
- `scripts/capture-three-preview.ts`
- `tests/screenshots/three-preview-main-engine.png`
- root `three` dependency
- root `@types/three` dev dependency
- `screenshot:three-preview` script

## Revised direction

The correct path is now:

> Keep and harden the existing Canvas/Iso2 main engine. Do not restart the renderer on Three.js.

Prioritize:

1. normal generated gameplay visual stabilization (#277);
2. generator output that emits coherent structures/assemblies, not isolated v1 cells;
3. canonical `npm run visual-test` / visual-scene pipeline (#255);
4. safe Iso2 material and texture factory integration inside the existing renderer;
5. source-of-truth reconciliation for stale docs/issues;
6. continued god-file decomposition only where it unblocks real rendering/generation fixes.

## Lessons to preserve

- A renderer library cannot fix missing world semantics.
- The main failure is not just drawing; it is composition: generator, assets, materials, walkability, scale, and authored structure grammar must agree.
- The existing Iso2/Canvas renderer is flawed, but it contains project-specific knowledge that a generic Three.js scene does not automatically recover.
- Future spikes must use real acceptance screenshots and side-by-side comparisons before any architectural recommendation.
