---
description: "Use when porting experiment/isometric-2.0 nano tiles, materials, assemblies, or renderer behavior into the main Emily's Game engine."
applyTo: "{src/asset-pipeline/iso2-materials.ts,src/engine/iso2-assemblies.ts,src/engine/iso2-solver.ts,src/engine/iso2/**,src/rendering/nano-tile*.ts,src/rendering/render.ts,src/rendering/terrain-cache.ts,src/rendering/tiles.ts,src/config/tiles.config.ts,src/config/assets.config.ts,tests/rendering/iso2-*.spec.ts}"
---

# Iso 2.0 Main Engine Port Instructions

> **2026-07 product freeze:** Iso2 on the product tip is **paint only** (root `AGENTS.md`).  
> Do not restart a full port architecture campaign, new nano kinds, or FOV thrash from this file.

## Port-Back Contract (historical C1 — issue #259)

A "mergeable iso2 module" satisfies **all** of the following:

1. **Source parity** — the module's behavior matches the experiment's behavior
   for at least one canonical scene (e.g. the 7×7 stone-wall perimeter from
   `experiment/isometric-2.0/ProgressEvaluations/walls-huggers-iter04.png`).
2. **No new public API** — consumers import from the existing paths
   (`src/asset-pipeline/iso2-materials.ts`, `src/rendering/nano-tile*.ts`,
   `src/engine/iso2-solver.ts`, `src/engine/iso2-assemblies.ts`). Do not
   create new top-level modules when an existing one can be extended.
3. **No re-implementation** — if a helper exists in the experiment
   (`solver.ts`, `iso-geometry.ts`, `nano-tile.ts`, `textures/`), port the
   helper **verbatim** into the main engine rather than rewriting the same
   math in a different style. The port keeps the source-of-truth at
   `experiment/isometric-2.0/src/`; main is the consumer.
4. **Visual proof** — every micro-slice commits a PNG checkpoint in
   `experiment/isometric-2.0/ProgressEvaluations/` (for experiment visuals)
   **and** a paired main-engine screenshot in `tests/screenshots/`. Both must
   be reproducible.
5. **B-series discipline** — extracted sub-modules follow the B-series
   rules from `.github/instructions/architecture.instructions.md` (soft
   limit 250 lines, hard 400). If a port pushes a main module past the
   limit, decompose it as part of the same slice.
6. **Adapter boundary documented** — when a port can't preserve source
   parity (e.g. experiment uses an API not exposed in main), add a code
   comment at the adapter call site explaining the difference and
   linking to the experiment line.
7. **No regression in main tests** — `npx tsc --noEmit` clean and
   `tests/rendering/iso2-*.spec.ts` green before declaring the slice done.

**C1 sequencing** — `#259` (port-back contract + corner-void) gates
`#257` (C2 render systems), which gates `#256` (C3 walkability), which
gates `#258` (C4 FPS validation). All C work depends on B5 #268, B6 #272,
and B9 #272 closed (✅ all closed as of 2026-06-18).

**Reference docs** (kept cross-consistent):
- `.github/instructions/iso2-main-port.instructions.md` — this file
- `Docs/Iso2.0-MainEngineIntegrationGuide.md` — narrative companion
- `AGENTS.md` (planned, see C1) — operating manual section

**If a missing rule surfaces during a port**, add it to this section
**and** mirror it into the integration guide, not just the issue.

## Integration Discipline

- Treat `experiment/isometric-2.0/src/` as the source of truth until the main game has feature parity.
- Port in vertical slices, not random helpers:
  1. shared constants/types
  2. material factories
  3. nano definitions and solver metadata
  4. terrain/cache bake path
  5. runtime render path
  6. collision/walkability
  7. tests and screenshots
- Keep the experiment compiling while porting. If a behavior differs in the main engine, document the adapter boundary in code comments near the adapter.

## Files to Compare First

- Experiment source:
  - `experiment/isometric-2.0/src/types.ts`
  - `experiment/isometric-2.0/src/solver.ts`
  - `experiment/isometric-2.0/src/nano-tile.ts`
  - `experiment/isometric-2.0/src/textures/**`
  - `experiment/isometric-2.0/src/assemblies.ts`
- Main engine port targets (note current paths after B-series decomposition):
  - `src/asset-pipeline/iso2-materials.ts` (was `src/iso2-materials.ts`)
  - `src/engine/iso2-assemblies.ts` (was `src/iso2-assemblies.ts`)
  - `src/engine/iso2-solver.ts` + `src/engine/iso2/**` (B9 decomposition — barrel re-export)
  - `src/rendering/nano-tile-defs.ts`
  - `src/rendering/nano-tile-svgs.ts`
  - `src/rendering/nano-tile.ts`
  - `src/rendering/terrain-cache.ts`
  - `src/rendering/render.ts`
  - `src/rendering/tiles.ts`

## B9 Solver Decomposition (issue #272)

`src/engine/iso2-solver.ts` is a **35-line barrel re-export** of 3 focused modules:

```
src/engine/iso2-solver.ts                    ← 35-line barrel re-export
src/engine/iso2/
  ├── bitmask.ts     (93)  ← connectionsToBitmask, variantFromBitmask, resolveVariants
  ├── footprints.ts  (129) ← wallBounds, pointHitsWallFootprint, pointHitsFenceFootprint
  └── walkability.ts (128) ← isPointWalkableInTile, buildWalkableMap, resolveCondition
```

All public API is preserved through the barrel. New solver logic goes in the
appropriate sub-module and is re-exported from the barrel.

## Validation Requirements

- Before port changes: run the Iso 2.0 experiment type-check to verify the source branch is healthy.
- After main-engine changes: run main TypeScript and the focused Iso 2.0 rendering tests before wider Playwright runs.
- Keep visual checkpoints paired with tests when possible; screenshot tests without a source-of-truth checkpoint are easy to misread.

## Current Breadcrumb

- Tracking issue: `#246` (Main engine Iso 2.0 structural port: 144px tiles and stone-wall parity; remaining follow-up was negative-Z river + arched bridge Canvas logic).
- Structural slice committed: `d7917d6` (face-sliced stone/homestead/cathedral walls, types for top/south/east/end face textures + rotate/equal-lighting/end-cap flags, nano defs + renderer updates, tee convention fixes, focused tests + screenshot).
- River/negative-Z + bridge + procedural fence render path port: in-flight on this branch (large updates to `src/nano-tile.ts` for channel-cut faces, `drawProceduralRiverWater`, `drawProceduralBridgeNano`, `drawProceduralFenceNano` + connections handling, integration into draw*Nano paths, supporting changes in defs/types/test/screenshot). Matches experiment SoT (per solver.ts connections, water-family, nano-tile drawNegative/drawFlat).
- Local visual tooling: `isoSvgRenderer` registered in `.vscode/mcp.json` (stdio → `experiment/isometric-2.0/AiTools/dist/index.js`; the entry for the mandated AiTools/isoSvgRenderer MCP per `isosvgrenderer.instructions.md` and Proompts). dist built + relay verified; restart in VS Code MCP panel (or TUI /mcps) required to surface `isoSvgRenderer__*` tools (`render_game_tile`, `render_iso_scene`, etc.) for proofs.
- Texture contracts demonstrated (main `asset-pipeline/iso2-materials.ts` + face slices in defs/nano-tile). Exact walkability/solver metadata (isPointWalkableInTile, buildWalkableMap, resolveVariants, wallBounds point queries from exp/solver.ts) + gate placement at fence runs (placeGatesInFenceRuns in gen using quiz_gate conditional nanos) landed for #223. Walk+gate cond tests + native visual scene pass; fence-gate PNGs in ProgressEvaluations/.
- **B-series decomposition of solver:** B9 split `iso2-solver.ts` into 3 modules (see above). Consumers (`nano-tile-svgs.ts`, `terrain-cache.ts`) unchanged.
- Always: before changes run experiment `npx tsc --noEmit`; after main changes run root typecheck + focused `tests/rendering/iso2-*.spec.ts`. Prefer isoSvgRenderer MCP calls for experiment-side visual iteration/proofs; pair checkpoints with tests. (Strict output limits used in tooling to avoid truncation.)

## Pre-Commit Checks

```bash
# Experiment typecheck
cd experiment/isometric-2.0 && npx tsc --noEmit

# Main typecheck
npx tsc --noEmit

# Iso 2.0 rendering tests
npx playwright test tests/rendering/iso2-*.spec.ts --reporter=line

# Module size scan
python tools/refactor/find-large-functions.py src/engine/iso2/ --min-lines 70
```