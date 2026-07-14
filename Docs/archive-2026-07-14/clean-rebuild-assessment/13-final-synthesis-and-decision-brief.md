# 13 — Final Synthesis and Decision Brief

> **SUPERSEDED — 2026-07-07:** This brief recommended a bounded Three.js proof. The proof failed and the direction was rejected. Current guidance is Canvas/Iso2 hardening; see [`17-threejs-rejection-record.md`](17-threejs-rejection-record.md) and [`18-canvas-iso2-hardening-plan.md`](18-canvas-iso2-hardening-plan.md).

**Final-pass date:** 2026-07-07  
**Decision type:** Recommendation for next action, not a code implementation.

## One-sentence conclusion

Emily's Game should not be rewritten blindly, but it **should** run a bounded Three.js orthographic proof spike because the current product vision wants real isometric structure, depth, occlusion, bridges, rivers, roofs, and composed scenes that are disproportionately hard to sustain in the current hand-rolled Canvas 2D renderer.

## Final recommendation

Do this next:

1. Keep the current `experiment/isometric-2.0` branch/game alive.
2. Treat `Docs/clean-rebuild-assessment/` as the clean-rebuild context bundle.
3. Reconcile stale docs/issues only enough to avoid confusion.
4. Create an isolated proof spike in `experiment/three-clean-spike/` or a new branch.
5. Prove or disprove the Three.js orthographic renderer before any full rewrite.
6. If the spike succeeds, build a clean `src-next/` architecture in phases.
7. If the spike fails, continue current Canvas/Iso2 path with better visual-test enforcement.

## What the research proved

### The current repo is valuable

It contains a real alpha-scale game:

- procedural world generation;
- deterministic save/regeneration model;
- broad Playwright tests;
- content packs;
- Book/quiz systems;
- audio/music;
- wildlife/survival/status;
- customizer/cosmetics;
- touch/gamepad/Tesla support;
- Iso2 material/rendering stack;
- agent/visual tooling.

A clean branch should mine and preserve this value. It should not start from a blank product spec.

### The original artificial constraint is now expensive

The original constraint — pure TypeScript + Canvas 2D + no heavy libraries — was useful for the prototype. It is now the main reason the renderer is complicated:

- custom projection;
- custom face-slice extrusion;
- custom depth sorting;
- custom occlusion;
- custom terrain/cache system;
- custom visual proof tooling;
- many tiny geometry bugs.

This is exactly the kind of accidental engine work a library can reduce.

### The full product is broader than rendering

The deeper pass changed the emphasis. The first pass focused heavily on world/rendering. The final view is broader:

- education/content is core;
- audio identity is significant;
- UI/platform/touch/Tesla flows are delivered features;
- survival/wildlife/status systems are current alpha scope unless cut explicitly;
- validation/process discipline is part of the product development model.

### Three.js is a hypothesis, not a foregone conclusion

The recommendation is not “switch to Three.js no matter what.” It is:

> Run a proof spike because Three.js directly targets the hardest current pain: structure/depth/occlusion geometry.

The spike must earn the rewrite.

## Keep / change / defer

### Keep

- TypeScript/Vite/web-first app.
- DOM UI.
- deterministic world generation.
- LLM entropy concept.
- micro/nano/world-unit/macro semantics.
- content packs and Book/quiz loop.
- save-as-deltas model.
- visual proof discipline.
- current tests as acceptance references.
- cozy child-safe tone.

### Change

- Use geometry/depth for world rendering if spike succeeds.
- Make LLM optional/enriching, not startup-blocking.
- Replace broad mutable `GameState` dependency with stores/events.
- Move giant configs toward schema-validated data.
- Workerize generation.
- Make manifests/tests source of truth over prose status claims.

### Defer unless prioritized

- Full content ingestion automation.
- Free-response math beyond the current spike level.
- Exact MIDIocre backend preservation if a simpler equivalent preserves the audio identity.
- Tesla-specific polish if not needed for near-term play.
- Full macro solver perfection before proofing renderer/gameplay viability.

## Final architectural shape

```text
src-next/
  app/          boot, lifecycle, route/test mode
  core/         rng, coords, events, scheduler
  world/        deterministic grammar, solver, chunks, workers
  gameplay/     movement, collision, interactions, inventory, status
  render-three/ Three.js scene, meshes, materials, visual debug
  education/    quiz, Book, content packs, age/subject logic
  ui/           DOM/Preact components and UI state
  audio/        music, SFX, positional audio, speech
  llm/          entropy/flavor client and fallbacks
  persistence/  saves, deltas, migrations
  content/      schemas, manifests, generated indexes
  validation/   visual scenes, perf, property tests
```

## Decision gates

### Gate 1 — proof spike go/no-go

Proceed only if the spike proves:

- wall/river/bridge/player depth is simpler than Canvas path;
- data remains renderer-agnostic;
- DOM quiz unlock + save delta works;
- deterministic hash test passes;
- compact visual proof works;
- performance is plausible.

### Gate 2 — current alpha parity

Proceed to full migration only if `src-next` proves:

- movement/collision/interactions;
- generated chunks;
- quiz gates;
- Book/quiz basics;
- save/load;
- audio basics;
- UI basics;
- visual smoke;
- tests.

### Gate 3 — product parity/full vision

Only after current parity should the team expand into:

- full macro solver;
- richer structures;
- content automation;
- audio hard reset;
- advanced education;
- final visual/perf suite.

## What not to do

- Do not port the current Canvas renderer line-for-line into Three.js.
- Do not abandon nano/world metadata just because Three.js has geometry.
- Do not start by rewriting every current feature.
- Do not let screenshots pile up without baseline promotion policy.
- Do not treat stale open/closed issue state as truth without reconciliation.
- Do not block gameplay on LLM.
- Do not build UI in the world renderer.

## Final effort view

| Target | Solo / AI-assisted | Small focused team |
|---|---:|---:|
| Proof spike | 2-3 weeks | 1-2 weeks |
| Current alpha parity | 14-18 weeks | 7-11 weeks |
| Full documented vision | 28-40 weeks | 14-20 weeks |
| Polished public-quality game | 9-12+ months | 4-7 months |

These numbers are intentionally larger than the first pass because the deeper research confirmed significant delivered breadth beyond renderer/world generation.

## Final practical next action

Write one GitHub issue or PR note titled:

> Three.js orthographic clean-branch proof spike

Use `10-threejs-proof-spike-spec.md` as the body. Do not start a full rewrite until that issue's acceptance criteria pass.
