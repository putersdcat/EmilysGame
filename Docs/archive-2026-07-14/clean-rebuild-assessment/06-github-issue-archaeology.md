# 06 — GitHub Issue Archaeology

**Second-pass date:** 2026-07-07  
**Source:** GitHub CLI against `putersdcat/EmilysGame`  
**Inventory:** 224 issues total — 48 open, 176 closed.

This file maps issue-derived scope into clean-rebuild planning. It is not a replacement for GitHub Issues; it is a rebuild-oriented summary of what the issues imply.

## Open issues by subsystem

### Product / master design

| Issue | Title | Clean-rebuild relevance |
|---:|---|---|
| #2 | `[EPIC] Game Bible - Master Design & Architecture` | Top-level product scope anchor. |
| #45 | `WASM Core Transition Plan` | Historical performance path. Reassess in light of Three.js/WebGL. |

### Engine architecture and refactor

| Issue | Title | Clean-rebuild relevance |
|---:|---|---|
| #247 | `[EPIC] Engine Architecture Refactor & Iso 2.0 Main-Integration — Phase 1` | Current architecture epic. |
| #252 | `B4: Consolidate module-level state + centralize shared types` | Still relevant as state/type discipline. |
| #254 | `B3: Decompose gen.ts into solver-pipeline phase modules` | Likely stale/mostly delivered; reconcile before using as scope. |
| #267 | `Add token-efficient refactoring toolkit` | Useful if continuing current branch; less central for clean rewrite. |
| #269 | `B9: Decompose src/engine/iso2-solver.ts` | Likely stale by file size; verify acceptance. |
| #270 | `B7: Decompose src/ui/ui.ts` | Likely stale by file size; verify acceptance. |
| #271 | `B8: Decompose src/engine/llm.ts` | Likely stale by file size; verify acceptance. |
| #273 | `[EPIC] Phase B-extended` | Useful conceptually, but status/body need reconciliation. |
| #274 | `B5-followup: Extract remaining god-functions from main.ts` | Still relevant; identifies remaining orchestration hotspots. |

### Rendering / Iso 2.0

| Issue | Title | Clean-rebuild relevance |
|---:|---|---|
| #3 | `[EPIC] Isometric Rendering Engine & PoC` | Original rendering epic. |
| #184 | `[EPIC] Rendering depth & parallax overhaul` | Validates need for depth/parallax rethink. |
| #214 | `Iso 2.0 REBOOT: Verified Isometric Rendering Engine [EPIC]` | Most important visual validation epic. |
| #215 | Base biome tile rendering | Base terrain acceptance. |
| #218 | Negative-Z carve-out rendering | Rivers/banks/depth acceptance. |
| #220 | Player occlusion | Wall/fence/player depth acceptance. |
| #221 | Player sink effect | Negative-Z player integration. |
| #222 | Shadow + rim lighting | Lighting intent. |
| #223 | Gate/troll-bridge walkable logic | Gameplay + renderer integration. |
| #225 | 60+ FPS validation | Performance acceptance. |
| #226 | Full integration scene | Final composed-scene proof. |
| #239 | Red-clinker pillar cap | Material-detail backlog. |
| #242 | Modular brick variants | Material factory backlog. |
| #243 | Weathering overlays | Material/weathering backlog. |
| #246 | Main engine Iso2 structural port | 144px/stone-wall parity. |
| #256 | C3 gate/troll bridge integration | Main-game unlock integration. |
| #257 | C2 render systems into main | Negative-Z/occlusion/sink/shadow. |
| #258 | C4 60 FPS + final scene | Main-game perf proof. |
| #275 | Phase D texture factories | Texture/seam backlog, partly delivered. |
| #277 | Main engine visual stabilization | Current practical next visual issue. |

### World generation / visual coherence

| Issue | Title | Clean-rebuild relevance |
|---:|---|---|
| #6 | `[EPIC] Tile & World Generation System` | Older world-gen epic. |
| #260 | `[EPIC] Visual Quality & World Coherence` | Current world-composition visual epic. |
| #261 | Biome coherence | Large consistent regions and transitions. |
| #262 | Seamless nano-tile edge blending | Hide diamond/grid seams. |
| #263 | Water/stream seam continuity | Water adjacency correctness. |
| #264 | Bridge bank-to-bank placement | Bridge generation correctness. |
| #266 | Player walks through manually injected water cell | Current collision regression to preserve as test. |

### LLM entropy

| Issue | Title | Clean-rebuild relevance |
|---:|---|---|
| #4 | `[EPIC] LLM Entropy System for World Generation` | Core LLM entropy scope. |
| #271 | LLM decomposition | Likely delivered/stale but maps LLM module boundaries. |

### Education/content

| Issue | Title | Clean-rebuild relevance |
|---:|---|---|
| #91 | Rephrasing + quality gate pipeline | Content safety/readability. |
| #93 | Older-kid math validation path | Free-response solver path. |
| #95 | Automated content refresh workflow | CI/content refresh gates. |
| #96 | Source ingestion & normalization | Public content → game packs. |

### Audio

| Issue | Title | Clean-rebuild relevance |
|---:|---|---|
| #108 | Sampled SFX + positional audio | Audio parity target. |
| #147 | Hard reset: replace synthetic ambience | Audio quality direction. |
| #149 | Integrate curated audio assets | Implementation task. |
| #150 | Source/handoff audio files | Asset-sourcing task. |

### Tooling/validation

| Issue | Title | Clean-rebuild relevance |
|---:|---|---|
| #255 | VisualTestSuite + `npm run visual-test` | Must be first-class in clean branch. |
| #267 | Refactoring toolkit | Useful for current branch hygiene. |

## Delivered capabilities inferred from closed issues

### Architecture/refactor

Closed issues indicate delivery of:

- architecture docs and decomposition map;
- layered folder skeleton;
- `main.ts` decomposition series;
- `render.ts` decomposition series;
- determinism fix for generation;
- Iso2 port-back contract;
- shared-type centralization work.

Clean-rebuild implication: start clean with these boundaries instead of recreating the old monolith first.

### Iso2/rendering

Closed issues indicate implementation history for:

- nano core types;
- nano rendering;
- player sink/draw-order integration;
- nano walkability/gate/quiz unlocks;
- homestead/cathedral assemblies;
- visual test scenes;
- AiTools/MCP rendering;
- positive-Z billboards;
- extruded 3D wall boxes;
- continuous feature solver;
- material factory stabilization;
- ancient-stone/red-clinker material fixes.

Important caveat: #214 says some older closures lacked sufficient visual proof. Treat them as implementation history, not final validation.

### World generation

Closed issues indicate delivery of:

- edge contracts;
- multi-solver pipeline pieces;
- metadata schema;
- world-unit library;
- procedural solver;
- BFS playability checks;
- auto-tiling/neighbor variants;
- terminator logic;
- edge matching;
- collision fixes;
- rendering benchmarks.

### LLM entropy

Closed issues indicate delivery of:

- wordlist init and health check;
- movement-to-verb/noun mapping;
- SHA-256 hash chain;
- ASCII/byte mappings;
- biome bias from entropy;
- cell flags from entropy;
- NPC chat to entropy pool;
- latency fallback.

### UI/survival/platform

Closed issues indicate delivery of:

- HUD/menu refactor;
- non-lethal survival/status systems;
- injury/hazard systems;
- illness/hygiene systems;
- message bubbles/history;
- fog toggle;
- time-scale rebalance;
- Tesla/touch controls;
- onboarding tutorial.

### Audio/assets/tooling

Closed issues indicate delivery of:

- MIDI/cassette music UI;
- audio sourcing brief;
- asset library PNG fallback;
- web SVG asset editor;
- Playwright test reorganization.

## Issue/doc/code conflicts to reconcile

| Conflict | Evidence / action |
|---|---|
| Root `AGENTS.md` is referenced but missing. | README/ARCHITECTURE reference it; issue #248 says it was delivered. Use `.github/copilot-instructions.md` + agent files as current source or restore root `AGENTS.md`. |
| `ARCHITECTURE.md` line counts/status are stale. | It describes pre-later-refactor `main.ts`/`gen.ts`; update if continuing current branch. |
| `.github/copilot-instructions.md` key-file table is stale. | It still references old root paths and old line counts. |
| #254 open despite `gen.ts` now being a facade. | Verify acceptance and close/update. |
| #269/#270/#271 likely stale by current file sizes. | Verify if acceptance is met or scope shifted. |
| #273 status/body stale. | Update issue if using as current roadmap. |
| #255 open but docs treat visual-test as canonical. | Clean rebuild should implement `npm run visual-test` early. |
| #275 open but #277 says Phase D backports are implemented. | Reconcile issue/PR status. |
| #266 open collision bug conflicts with older closed collision fixes. | Preserve #266 as regression test. |
| #192 96px micro tile superseded by #246 144px / 256×128. | Use latest Iso2 geometry unless explicitly preserving older assets. |

## Issue-derived acceptance criteria for clean rebuild

### Architecture

- clear layers;
- pure engine with no DOM/render imports;
- DOM UI;
- no god files;
- central shared types;
- explicit state ownership;
- save/load round-trip unaffected by refactors.

### World generation

- deterministic chunk generation;
- edge contracts;
- biome coherence;
- bridge placement correctness;
- water collision correctness;
- passability validation;
- lock/key/quiz gate ordering;
- dead-end rewards.

### Rendering/Iso2

- base biome tiles with no stretch artifacts;
- positive-Z billboards;
- extruded wall structures;
- negative-Z rivers;
- player occlusion;
- player sink;
- shadow/rim lighting;
- gate/troll-bridge unlock states;
- material factory families;
- normal generated gameplay visual coherence;
- 60 FPS / no spike performance proof;
- final composed integration scene.

### Education/content

- quiz accessibility;
- age-appropriate rephrasing;
- quality/safety gates;
- source ingestion;
- content refresh workflow;
- math free-response path if retained.

### Audio/UX

- MIDI/cassette or equivalent music identity;
- sampled SFX;
- positional ambience;
- full mute correctness;
- tutorial;
- touch/gamepad/Tesla if retained.

## Clean-rebuild milestone mapping

### Milestone 0 — Reconcile source of truth

Use issues #2, #247, #250, #248, #249, #252, #254, #269, #270, #271, #273, #274, #275, #277, #214.

Outcome: stale issue/docs statuses updated or explicitly ignored for clean branch.

### Milestone 1 — Deterministic core

Use #4, #6, #42, #46, #165-#178, #265, #266.

Outcome: deterministic generator, save/delta model, collision baseline.

### Milestone 2 — Renderer proof

Use #3, #184, #214-#226, #246, #257.

Outcome: prove Three.js/orthographic path can satisfy Iso2 visual acceptance.

### Milestone 3 — Gameplay integration

Use #223, #256, #264, #266, #168, #171, #260, #261.

Outcome: gates/bridges/water/collision/progression work in generated world.

### Milestone 4 — Visual coherence/materials

Use #260-#263, #275, #277, #239, #242, #243.

Outcome: normal generated gameplay looks coherent, not only curated scenes.

### Milestone 5 — Performance/final visual CI

Use #183, #225, #226, #258, #255.

Outcome: visual-test script, perf artifacts, composed final scene.

### Milestone 6 — Product parity systems

Use #91, #93, #95, #96, #108, #147-#150, #131, #138, #185, #186, #144, #126.

Outcome: education, audio, UI, platform, and survival/wildlife features restored or intentionally cut.
