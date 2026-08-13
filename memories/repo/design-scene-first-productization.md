> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# Design: Scene-first productization of experiment/isometric-2.0

**Status:** PR Plan complete (PR1–7 landed on execute-plan integrated tip)  
**Date:** 2026-07-16  
**Branch:** `experiment/isometric-2.0` (campaign work on `execute-plan/4baf1950-*`)  
**Authority:** `definitive-path-forward-2026-07-16.md`, `docs/01`–`04`, `AGENTS.md`

---

## 1. Problem (macro)

Emily’s Game’s **loop spine is largely working** on this branch (M1). The world still **does not look or play like places** because generation still prioritizes:

- WU template / Perlin **atoms**
- Decorative fence geometry **without functional gates**
- Free scatter of structures (outhouse, towers)

That contradicts `01` (core loop in a coherent world) and `04` (solvable, purposeful obstacles). Iso 2.0 paint does not fix missing **scene grammar**.

## 2. Goal / objective at the other side

A **clean focused product base** where:

1. Early world (dist ≤ ~3) is built from **scene recipes + path skeleton + functional gates**.  
2. Visual FOV/scale are **stable** (128×64 diamonds).  
3. Iso2 remains **paint** (optional materials), not ontology.  
4. **Expandability:** new place = new recipe; new learning = content pack; new character = config+sprite — without touching WorldUnitSolver/nano architecture.  
5. Proof screenshots show intentional places (no random towers, no gate-less pens).  
6. M1 + scene-invariant tests stay green.

## 3. Non-goals

- Greenfield or switch trunk to `main`  
- Full AC-3 redesign  
- Material showcase parity with experiment folder  
- Speculative file splits  

## 4. Key Decisions

| Decision | Rationale |
|----------|-----------|
| Stay on experiment tip | Playability/content/audio already paid; shortest path |
| Scene-first gen, not WU-first | Fixes product failures; matches expandability |
| Structure only via scenes | Eliminates random tower/outhouse class bugs |
| Fence opening requires gate/path | Pillar 2 functional barriers |
| Freeze Iso2 architecture | Paint later; avoid thrash |
| FOV locked 128×64 | Settled scale contract |
| PR Plan as execution unit | Enables `/execute-plan` + long-horizon automation |

## 5. Architecture (target)

```
Biome + distance + seed
        → Path skeleton (entry → landmark → exit)
        → Scene stamps (with required functional cells)
        → On-path quiz_gate density (ObstacleSolver, keep)
        → Soft terrain fill (grass/dirt paths)
        → Sparse decoration/coins (S5 caps)
        → Optional non-structure WU filler (frozen/disabled for structures)
        → Validation: traversable + scene invariants
```

Presentation: unchanged layering (`docs/02`/`05`). Gen never imports nano kinds for gameplay decisions.

## 6. Scene recipe contract

Each recipe declares:

- `id`, `width`, `height`, `placements[]`  
- **`openings[]`**: cells that must be `quiz_gate` | `door_locked` | open path (`dirt`/`path`/`grass` walkable entry)  
- **`forbiddenFreeScatter`**: assets this campaign bans outside recipes  

Validator fails gen (or repairs) if openings are bare decorative gaps without function.

## 7. Phases (macro roadmap)

| Phase | Outcome | Done when |
|-------|---------|-----------|
| **P0 Scene law** | Invariants + farm gate + ban free structures | ✅ Proof PNG + tests (PR1–3, PR6) |
| **P1 Scene-primary early world** | dist≤2–3 mostly scenes+path | ✅ Path skeleton + WU demotion (PR4–5) |
| **P2 Expand rails** | Document recipe+content add paths | ✅ `expandability-rails.md` + register API (PR7) |
| **P3 Paint/audio** | Selective Iso2 look + loop SFX polish | Open — post-campaign, paint only |

---

## Key Decisions (summary block for design skill)

1. Productize this branch, scene-first.  
2. Functional barriers mandatory.  
3. Iso2 paint freeze.  
4. Expand via recipes/content.  
5. Execute via ordered PR Plan + AGENTS.md continuity.

## Open Questions

None blocking execution — product decision already made in definitive-path doc.

---

## PR Plan

### PR 1: Scene invariant infrastructure

- **Description:** Add scene recipe opening contract + `validateSceneOpenings` (or equivalent) and wire a post-stamp validation/repair pass. Shared types for openings. Unit/Playwright tests that a fence ring with bare dirt gap fails or is repaired to include a gate.
- **Files/components affected:** `src/engine/iso2-assemblies/catalog.ts`, `src/engine/iso2-assemblies.ts`, new `src/engine/iso2-assemblies/scene-invariants.ts` (or similar), `tests/world-gen/scene-invariants.spec.ts`, `src/engine/world/ChunkGenerator.ts`
- **Dependencies:** None

### PR 2: Ban free structure atoms in early biomes

- **Description:** Remove/zero free placement of outhouse, and non-scene house/hut/tower-like obstacles from meadow (and early dist) scatter/obstacle weights and WU template weights that drop isolated structures. Structures only via scene stamps + starter homestead.
- **Files/components affected:** `src/config/biomes.config.ts`, `src/config/tiles.config.ts` (BIOME_TEMPLATE_WEIGHTS), `src/engine/world/Populator.ts`, `src/engine/world/ObstacleSolver.ts` (if needed), tests
- **Dependencies:** PR 1

### PR 3: Functional fence openings + farm recipe gate

- **Description:** Every fenced scene opening must place `quiz_gate` or `door_locked`. Fix `fenced-farm` and homestead-adjacent recipes. Add gen pass or stamp rules so WU fence enclosures cannot leave functionless openings (disable or convert).
- **Files/components affected:** `src/engine/iso2-assemblies/catalog.ts`, `src/engine/iso2-assemblies/starter-homestead.ts`, fence-related template handling / `ChunkGenerator.ts`, `tests/world-gen/scene-invariants.spec.ts`
- **Dependencies:** PR 1

### PR 4: Path skeleton for early chunks

- **Description:** For chunkDist ≤ 2 (or ≤ 3), after biome select, lay a simple dirt path corridor from a border entry toward a landmark cell; prefer stamping scenes adjacent to path; ensure ≥1 quiz_gate on path (reuse ensureMinimumQuizGates after stamps).
- **Files/components affected:** new path helper under `src/engine/world/` or assemblies, `ChunkGenerator.ts`, tests/gameplay or world-gen path specs
- **Dependencies:** PR 2, PR 3

### PR 5: Demote structure-bearing WU templates

- **Description:** Zero or hard-reduce meadow/forest template weights for structure/enclosure templates that create walls/fences without going through scene stamps (fence_enclosure, wall_*, homestead_compound if redundant, outhouse_clearing, etc.). Keep pure terrain/path/river templates as needed.
- **Files/components affected:** `src/config/tiles.config.ts` BIOME_TEMPLATE_WEIGHTS, determinism golden re-capture, world-gen tests
- **Dependencies:** PR 4

### PR 6: Proof bar + docs campaign lock

- **Description:** Capture `tests/screenshots/proof-scene-law-spawn.png` (and explore) showing gated farm/homestead, no free towers. Update `docs/13`, `definitive-path` status, AGENTS.md checklist. Ensure M1 + scene-invariants + determinism green.
- **Files/components affected:** screenshots, `docs/13-Development-Roadmap.md`, `memories/repo/*`, tests
- **Dependencies:** PR 5

### PR 7: Expandability rails (base engine freeze)

- **Description:** Document “How to add a scene” and “How to add quiz content” in `docs/` or `memories/repo/expandability-rails.md`. Optional thin helper API `registerSceneRecipe`. No new solvers. Smoke test that a second farm variant can be added by catalog-only change.
- **Files/components affected:** docs/memories, maybe small export in assemblies index, optional test
- **Dependencies:** PR 6

---

## Acceptance (campaign)

- [x] PR 1–7 landed (or equivalent sequential commits if not using Graphite)  
- [x] `proof-scene-law-spawn.png` replaces S5 density as visual bar  
- [x] M1 green; scene-invariants green; determinism golden updated deliberately  
- [x] AGENTS.md still describes the same finish line  
- [x] New scene can be added without editing WorldUnitSolver/nano-tile (`expandability-rails.md` + `registerSceneRecipe`)  


## Execution

```text
/execute-plan memories/repo/design-scene-first-productization.md --concurrency 2 --no-graphite
```

Resume: `/execute-plan --resume <PLAN_ID>`
