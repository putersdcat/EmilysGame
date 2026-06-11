# AGENTS.md — Working in Emily's Game

**Status:** Living document · **Owner EPIC:** #247 · **Issue:** #248 (A2)
**Last updated:** 2026-06-11

This is the operating manual for AI agents (and humans) contributing to Emily's
Game. Read [ARCHITECTURE.md](ARCHITECTURE.md) first for the big picture, then this
for *how to actually make changes*. This file complements — never contradicts — the
path-scoped rules in `.github/instructions/*.instructions.md` and the workflow rules
in `.github/copilot-instructions.md`.

---

## 1. Golden rules

1. **Plan/track in GitHub Issues**, not standalone markdown. Reference the issue
   number (e.g. `#249`) in commits and PRs.
2. **Ground every claim in real code.** Read files before changing them; never
   fabricate paths, symbols, or APIs.
3. **Keep the build green between steps.** Run `npx tsc --noEmit` and
   `npx playwright test` and do not move on while red.
4. **MCP-first for visuals.** Iterate on tiles/materials with the `isoSvgRenderer`
   MCP tools before opening a browser. Commit proof PNGs.
5. **Respect the layering** (§3) and the **zero-allocation render hot path**
   (`performance.instructions.md`, `rendering.instructions.md`).
6. **Don't over-engineer.** Make only the change requested or clearly necessary.

---

## 2. Mandatory pre-commit checks

| Check | Command | When |
|-------|---------|------|
| Root typecheck | `npx tsc --noEmit` | every change to `src/**` |
| Experiment typecheck | `cd experiment/isometric-2.0; npx tsc --noEmit` | every change under `experiment/**` |
| E2E tests | `npx playwright test --reporter=line` | every behavior/rendering change |
| Dev smoke | `npm run dev` → load at `http://localhost:5173` | after structural moves |
| Visual suite | `npm run visual-test` *(after D1 #259)* | every visual/asset change |

Build for prod: `npm run build`. Dev server: `npm run dev` (port 5173); the iso2
experiment dev server is port 5200.

---

## 3. Where does my code go? (decision tree)

```
Is it pure logic — no Canvas, no DOM, no window?
  └─ yes → src/engine/   (world gen, solver, walkability, math, LLM client, utils)
Does it draw to the Canvas or do isometric projection?
  └─ yes → src/rendering/ (render, terrain-cache, nano-tile*, lights, shadows, fog, weather, particles)
Does it generate sprites / textures / SVG assets?
  └─ yes → src/asset-pipeline/ (sprites, asset-sprites, npc-sprites, materials, emoji-cache)
Is it a game system or per-frame orchestration?
  └─ yes → src/game/      (input, quiz, trading, status, injury, wildlife, save, audio/, bootstrap, game-loop)
Is it HUD / menus / DOM overlays?
  └─ yes → src/ui/        (ui, menus, customizer, thought-bubbles, book-content)
Is it immutable configuration data?
  └─ yes → src/config/    (*.config.ts)
Is it a type shared across two or more layers?
  └─ yes → src/types/     (Camera, world types, InteractionResult, ...)
```

> During the Phase B (#251–#254) migration some files still live at flat `src/`.
> Check [EngineDecompositionMap.md](Docs/EngineDecompositionMap.md) for the current
> target of any given file, and the `.github/instructions/*` `applyTo` globs for the
> authoritative current path mapping.

---

## 4. Naming & convention standard

- **Files:** `kebab-case.ts` (existing convention: `nano-tile-defs.ts`,
  `local-lights.ts`). Config files end in `.config.ts`; shared type files end in
  `.types.ts`.
- **Extracted `engine/world/` phase modules** are conceptual services and use
  `PascalCase.ts` (`BiomeSelector.ts`, `TemplateStamper.ts`, `Validation.ts`).
- **Types/interfaces/classes:** `PascalCase` (`IsoNanoTile`, `IsometricRenderer`,
  `Camera`).
- **Functions/methods/properties/locals:** `camelCase` (`getNanoStack`,
  `drawNanoStack`, `zOffset`).
- **Module-level constants:** `SCREAMING_SNAKE_CASE` (`WALKABLE_NEVER`,
  `RENDER_CONFIG`, `WORLD_CONFIG`).
- **Intentional module-level mutable state** (caches/animation): prefix with `_`
  (`_nanoStackCache`, `_dialogNpcId`, `_terrainCache`). Document it in
  ARCHITECTURE.md §7 — do not add new ad-hoc globals without classifying them.
- **Config objects** are `as const` / immutable and typed (see
  `config-files.instructions.md`).

---

## 5. Visual validation with the isoSvgRenderer MCP

Use these tools (see `.github/instructions/isosvgrenderer.instructions.md` for the
full protocol) to iterate on tiles/materials without a browser:

| Tool | Use |
|------|-----|
| `render_game_tile` | exact game output for a `kind` + `variant` (gold path) |
| `render_nano_isometric` | preview a single nano SVG with Z-pinning |
| `render_nano_assembly` | multi-tile composite (zoom into corners/joins) |
| `render_iso_scene` | named or custom scene with players/occlusion |
| `render_geo_proof` / `render_variation_sweep` | geometry proof / parameter sweeps |

**Efficiency defaults:** prefer `response: "metadata"` for non-visual validation
loops; use small `frameCount` (2–4) for strips during iteration; switch to image
output only for explicit visual checks.

**Hot-reload note:** changes to `experiment/isometric-2.0/src/*.ts` (solver,
nano-tile, materials, canvas-renderer, scene-registry) are **live on the next MCP
call** — no build/restart. Only `AiTools/index.ts` schema changes need a rebuild +
MCP restart. Smoke-test locally first:
`cd experiment/isometric-2.0/AiTools; node test-relay.mjs`.

**Validation flow:** modify `src/` → call `render_game_tile` for the affected
kind/variant → compare PNG to the golden in `ProgressEvaluations/` → commit `src/`
+ PNG → comment the commit SHA + PNG filename on the issue.

⚠️ **Do NOT use `browser_take_screenshot`** with the Playwright MCP — it caused
HTTP 413 failures. For live in-browser checks use `npm run dev` and verify manually.

---

## 6. Worked example: add a "bamboo-hedge" nano tile (main engine)

This is the canonical end-to-end recipe, grounded in the current main-game files.
Bamboo hedge = a positive-Z billboard that blocks movement (like a fence).

**Step 1 — SVG painter.** In `src/nano-tile-svgs.ts`, add a connection-aware painter:
```ts
export function bambooHedgeSvg(variant: FeatureVariant): string { /* return SVG string */ }
```

**Step 2 — (optional) face-slice material.** If it extrudes (positive-Z box), add a
material to `src/iso2-materials.ts` exposing `svgTop/svgTopV/svgSouth/svgEast/svgEnd`.
A billboard hedge can skip this and use only the painter.

**Step 3 — descriptor factory.** In `src/nano-tile-defs.ts`, add a factory mirroring
`woodenFenceNano` (billboard) or `stoneWallNano` (extruded):
```ts
export function bambooHedgeNano(variant: FeatureVariant = 'straight-h'): IsoNanoTile {
  return {
    kind: 'bamboo-hedge',
    zOffset: 3,
    zMode: 'positive',
    svg: bambooHedgeSvg(variant),
    walkable: WALKABLE_NEVER,   // reuse the shared const — no per-call alloc
    blendEdges: false,
    variant,
  };
}
```

**Step 4 — register in the dispatch.** In `src/nano-tile-defs.ts`:
- add `case 'bamboo_hedge': stack = [bambooHedgeNano(variant ?? 'straight-h')]; break;`
  to the `getNanoStack()` switch;
- add `|| tileType === 'bamboo_hedge'` to `hasNanoRenderer()`.

**Step 5 — walkability footprint.** If it blocks movement, add its footprint rects
to `src/iso2-solver.ts` so `isPointWalkableInTile` / `pointHits*Footprint` treat it
correctly (mirror the fence footprint).

**Step 6 — world placement.** Have generation emit the `bamboo_hedge` tile type
(config in `src/config/assets.config.ts` / `tiles.config.ts` and the relevant
`engine/world/` populator).

**Step 7 — validate.** `render_game_tile kind=bamboo-hedge variant=straight-h`, then
`render_iso_scene` with a hedge run + a player behind it (occlusion). Commit the PNG.
Run `npx tsc --noEmit` + `npx playwright test`.

---

## 7. Iso 2.0 → main port contract

When porting from `experiment/isometric-2.0` into `src/`, follow the order in
`.github/instructions/iso2-main-port.instructions.md` and
[Iso2.0-MainEngineIntegrationGuide.md](Docs/Iso2.0-MainEngineIntegrationGuide.md):
constants/coordinate contracts → material factories → solver metadata → canvas
renderer → assemblies. A module is "mergeable" only when it is renderer-safe, has no
experiment-only dependencies, and its output matches a committed golden PNG.

---

## 8. Session hygiene

- Break work into small verifiable steps; keep a todo/plan updated.
- **Breadcrumb issues:** if you discover a multi-step gap mid-task, STOP and create a
  GitHub issue (linked to the parent epic) documenting findings, files read, the gap,
  and the proposed fix — *before* starting the fix.
- Don't trust sub-agent audits blindly — verify against actual source (check that a
  symbol is *wired*, not merely defined).
- Update the GitHub issue with a progress comment when acceptance criteria are met.
