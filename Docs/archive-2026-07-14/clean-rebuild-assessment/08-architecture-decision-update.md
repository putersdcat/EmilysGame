# 08 — Architecture Decision Update After Deep Pass

> **SUPERSEDED — 2026-07-07:** This update still recommended pursuing Three.js. The actual proof attempts failed. Do not follow this as current direction. See [`17-threejs-rejection-record.md`](17-threejs-rejection-record.md) and [`18-canvas-iso2-hardening-plan.md`](18-canvas-iso2-hardening-plan.md).

**Decision status:** Updated recommendation, not an implementation mandate.  
**Second-pass date:** 2026-07-07

## What changed after the deeper pass

The first-pass recommendation was:

> Rebuild on TypeScript + Vite + Three.js orthographic WebGL renderer + DOM/Preact UI + pure deterministic world/gameplay packages + workerized generation + schema-validated content packs + hard visual/property tests.

After deeper doc/code/issue research, this recommendation still stands, but it needs a stronger preservation clause:

> The clean branch must rebuild the full product system — education, audio, UI, content, survival/wildlife, save/delta model, visual validation, and procedural grammar — not just the renderer/world generator.

The repo is richer than the first pass could fully express. A clean rewrite that only proves walls/rivers in Three.js would miss much of Emily's Game.

## What did not change

### Three.js remains the strongest rendering bet

The deeper pass strengthened, rather than weakened, the argument for a geometry-based renderer:

- the docs repeatedly seek “true height,” occlusion, structures, overhangs, bridges, negative-Z rivers, and roofs;
- Iso2 history shows Canvas face-slice/painter logic has been expensive to validate;
- issues #220, #221, #222, #225, #226, #257, and #258 all point toward depth/occlusion/performance proof as central acceptance;
- normal generated gameplay (#277) suffers from composition mismatch between legacy cells and rich Iso2 structures.

Three.js should be tested because it can model the intended structures directly:

- walls as boxes/prisms;
- rivers as depressed surfaces;
- bridges as raised geometry;
- roofs as sloped meshes;
- player/NPCs as billboards/cards with depth;
- material families as real textures/materials.

### DOM UI remains correct

The deeper pass found even more UI richness: Book, quiz, trade, music popup, customizer, save slots, tutorial, touch/Tesla, thought bubbles. These should remain DOM/UI-framework work, not renderer work.

### LLM should be optional/enriching

Docs sometimes say LLM should be required, but code reality and deployability argue for fallback-first gameplay. The clean branch should preserve LLM novelty without blocking startup or tests.

## Revised clean-branch architecture

```text
src-next/
  app/                 # boot, lifecycle, routing, test mode
  core/                # rng, coords, events, scheduler, assertions
  world/               # deterministic grammar, solver, chunks, workers
  gameplay/            # movement, collision, interaction, inventory, status
  render-three/        # Three.js world renderer and visual debug tools
  education/           # quizzes, Book, content packs, age/subject logic
  ui/                  # DOM/Preact components and UI state
  audio/               # music, SFX, positional audio, speech service
  llm/                 # entropy/flavor client, cache, fallbacks
  persistence/         # save slots, deltas, migrations
  content/             # schemas, manifests, generated indexes
  validation/          # visual scenes, property tests, perf probes
```

## Key design decisions

### Decision 1 — Use geometry for structures

Do not port Canvas face-slice wall drawing literally. Use Three.js geometry/materials for:

- wall runs/corners/tees/crosses;
- gates/doors;
- bridges;
- roofs;
- foundations;
- river depressions;
- overhangs/spires.

Retain the existing material-family contract concept: top/south/east/end or equivalent material slots.

### Decision 2 — Keep nano semantics even if implementation changes

Even with Three.js, keep logical nano data:

- 3×3 footprint;
- walkability;
- condition IDs;
- edge/connectivity signatures;
- variant families;
- stack ordering.

The renderer may turn nano stacks into meshes, but gameplay/generation still reasons over nano occupancy.

### Decision 3 — Workerize generation early

The solver ambitions are large. Generation should not block UI/render. Build the worker message protocol during the core-generator phase, not as late optimization.

### Decision 4 — Make content manifests authoritative

Avoid the current drift where prose claims content counts. The clean branch should derive UI/debug docs from manifest data or build-time checks.

### Decision 5 — Use visual scenes as acceptance units

Implement visual validation early:

- base biome scene;
- wall perimeter scene;
- fence/gate scene;
- river/bridge scene;
- homestead scene;
- cathedral/ruins scene;
- normal generated startup scene;
- final integration scene.

### Decision 6 — Treat current issue list as acceptance backlog, not literal current truth

Several open issues look stale. Before implementation, reconcile:

- #254, #269, #270, #271, #273, #275;
- root `AGENTS.md` absence;
- stale `ARCHITECTURE.md` and `.github/copilot-instructions.md` file tables;
- #255 missing package script.

## Updated proof spike

The two-week spike should expand slightly beyond renderer-only proof:

### Required spike scope

1. Three.js orthographic camera.
2. Deterministic chunk schema with micro+nano data.
3. Worker or worker-like boundary for generation, even if initially inline behind an interface.
4. Terrain base with grass/dirt/water.
5. Wall corner as real geometry.
6. River depression + bridge.
7. Gate with locked/unlocked condition.
8. Player billboard/card with occlusion and sink proof.
9. Minimal DOM quiz gate overlay.
10. Save delta for opened gate.
11. Visual scene output.
12. Deterministic chunk hash test.

### Spike success criteria

- wall/river/bridge/player interactions are simpler than current Canvas path;
- geometry remains data-driven by nano/world metadata;
- DOM quiz can unlock a gate and persist as delta;
- visual proof can be generated without full-game screenshot abuse;
- performance appears plausible.

## Updated effort estimate

The first estimate remains broadly valid but should be interpreted as product-parity, not renderer-parity.

| Target | Solo / AI-assisted | Focused 2-3 person team |
|---|---:|---:|
| Expanded proof spike | 2-3 weeks | 1-2 weeks |
| Current alpha parity | 14-18 weeks | 7-11 weeks |
| Full documented vision | 28-40 weeks | 14-20 weeks |
| Polished public-quality game | 9-12+ months | 4-7 months |

Why slightly larger than first pass:

- current code includes more UI/audio/education/survival/wildlife than the first summary emphasized;
- issue-derived acceptance adds visual-test/perf/content workflow requirements;
- normal generated gameplay coherence is a generator+renderer+content problem, not a material-only problem.

## What to explicitly not do

- Do not start by porting every current module.
- Do not treat Three.js as an excuse to abandon deterministic world metadata.
- Do not rebuild only curated visual scenes and ignore normal generated gameplay.
- Do not make LLM required for tests or startup.
- Do not put UI into Three.js/canvas.
- Do not preserve old docs' stale statuses as truth.
- Do not commit visual artifacts without a promotion policy.

## Recommended next documentation additions

If continuing this assessment in future sessions, add:

1. `09-clean-rebuild-requirements-matrix.md` — checkbox matrix mapping every subsystem to current parity/full vision/cut/defer.
2. `10-threejs-proof-spike-spec.md` — exact technical spike tasks and acceptance scenes.
3. `11-source-of-truth-reconciliation.md` — specific docs/issues to update or close before implementation.
4. `12-data-schema-sketch.md` — proposed micro/nano/world-unit/macro/content/save schemas.
