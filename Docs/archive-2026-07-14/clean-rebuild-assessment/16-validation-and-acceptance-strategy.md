# 16 — Validation and Acceptance Strategy

**Date:** 2026-07-07  
**Purpose:** Define how the clean branch should prove correctness and avoid repeating past “looks fine in one preview” failures.

## Validation principles

1. Pure logic gets pure tests.
2. Generated worlds get deterministic/property tests.
3. Visual features get composed-scene tests.
4. Content gets schema/QA tests.
5. Performance gets artifacts, not vibes.
6. Issue closure gets linked evidence.
7. Test mode must never require LLM/audio/human input.

## Test layers

### Layer 1 — schema validation

Run on every authored data file:

- micro tile defs;
- nano defs;
- world-unit templates;
- material registry;
- item defs;
- NPC defs;
- content packs;
- audio manifests;
- visual scene specs.

Acceptance:

- invalid data fails before runtime;
- content counts are derived from manifests;
- no prose-only count claims.

### Layer 2 — pure world tests

Examples:

- same seed + coords -> same chunk hash;
- border contracts compatible;
- chain features terminate or exit correctly;
- bridge spans valid bank/water/bank pattern;
- water blocks unless bridge/condition allows;
- gate delta changes walkability;
- lock has accessible key/knowledge path;
- dead ends contain reward or are non-critical;
- generated safe zone is passable.

Acceptance:

- no browser required;
- deterministic snapshots are easy to update intentionally;
- property tests cover random seed ranges.

### Layer 3 — gameplay system tests

Examples:

- inventory add/use/remove;
- chest opened persists;
- quiz correct/wrong/idk flows;
- NPC dialog opens and closes;
- trade buy/sell/barter;
- injury/status debuffs;
- word bag save/lookup;
- save/load migrations.

Acceptance:

- most run in unit/integration environment;
- browser tests reserved for real DOM/render interactions.

### Layer 4 — visual validation scenes

Canonical scenes:

1. base biome terrain;
2. wall perimeter/corner proof;
3. fence/gate proof;
4. river/bridge proof;
5. player occlusion proof;
6. player sink proof;
7. homestead assembly;
8. cathedral/ruin assembly;
9. normal generated startup scene;
10. final integration scene.

Each scene spec should include:

- purpose;
- input seed/fixture;
- camera;
- actors;
- conditions;
- assertions;
- output path;
- owner issue.

Acceptance:

- composed scene, not just single asset;
- debug wireframe/flat mode available for geometry;
- baseline promotion policy followed.

### Layer 5 — browser integration tests

Core flows:

- game boots in test mode;
- player moves;
- player collides with wall/water;
- player crosses bridge;
- quiz gate unlocks;
- Book opens from `I don't know`;
- save/load works;
- settings/mute works;
- touch/gamepad smoke if in parity.

Acceptance:

- no huge screenshots unless explicitly visual baseline;
- no LLM dependency;
- no audio output in test mode.

### Layer 6 — performance tests

Required artifacts:

- 100-frame perf JSON;
- average and max frame time;
- chunk boundary crossing profile;
- visible entity count;
- renderer stats;
- memory/canvas/texture counts where possible.

Targets inherited from issues:

- representative scenes under ~16.7ms/frame;
- no frame above 33ms in final integration proof;
- avoid dropping below 58 FPS during chunk-boundary movement;
- startup interactive within acceptable time.

## Visual artifact policy

### Scratch artifacts

- ignored by git;
- may include agent iterations;
- no issue closure uses scratch files.

### Candidate baselines

- checked into a candidate folder;
- named by scene and issue;
- reviewed before promotion.

### Promoted baselines

- checked into canonical baseline folder;
- referenced by visual scene spec;
- linked from issue/PR;
- only updated with intentional change note.

Suggested layout:

```text
tests/visual-scenes/specs/
tests/visual-scenes/baselines/
tests/visual-scenes/candidates/
tests/visual-scenes/scratch/   # gitignored
```

## Issue closure evidence

For visual/rendering issues:

- issue number;
- commit SHA;
- scene spec ID;
- baseline/candidate image path;
- test command;
- short note on what was visually inspected.

For generation/gameplay issues:

- issue number;
- test file(s);
- seed(s) used;
- invariant proven;
- save/delta evidence if relevant.

For content issues:

- manifest diff;
- schema validation output;
- QA report;
- review sign-off if required.

## Required scripts for clean branch

Proposed scripts:

```json
{
  "typecheck": "tsc --noEmit",
  "test:unit": "vitest run",
  "test:e2e": "playwright test --reporter=line",
  "content:validate": "tsx scripts/content/validate.ts",
  "visual-test": "tsx scripts/visual/run-visual-tests.ts",
  "perf:test": "tsx scripts/perf/run-frame-probe.ts",
  "validate:all": "npm run typecheck && npm run test:unit && npm run content:validate && npm run visual-test"
}
```

## Minimum validation before declaring current-alpha parity

- typecheck clean;
- deterministic world tests pass;
- content manifest/schema validation pass;
- visual scenes 1-5 pass/reviewed;
- browser smoke for move/interact/quiz/save passes;
- audio mute/test-mode smoke passes;
- perf smoke recorded.

## Minimum validation before declaring full documented vision

- macro solver property tests;
- lock/key DAG tests;
- chain integrity tests;
- all canonical visual scenes pass;
- final integration scene passes;
- content ingestion/rephrase/QA pipeline passes;
- audio curated asset manifest passes;
- save migration tests pass;
- source-of-truth docs updated.

## Anti-patterns to avoid

- “It looks right in my browser” without scene artifact.
- Single tile proof for a composed geometry bug.
- Updating baselines without explaining why.
- Hiding prompts behind screenshot-heavy Playwright calls.
- Letting LLM/audio/network failures break deterministic tests.
- Treating closed issues as proof when visual evidence is missing.
