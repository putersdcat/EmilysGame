> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# Campaign 1 notes — inspect + trust probes (2026-08-13)

## Dead / orphan / duplicate walk paths (found while wiring)

Do **not** delete in C1. Motor winner is `src/engine/walkability-query.ts` ← `play-kernel/walk.ts`.

| Path | Status |
|------|--------|
| `src/engine/iso2/walkability.ts` (`buildWalkableMap`, `isPointWalkableInTile`) | Residual nano tooling. Header says not product locomotion. |
| `src/rendering/terrain-cache.ts` still imports `buildWalkableMap` | Dead for play; leftover walkableMap wire. |
| `src/engine/iso2-solver.ts` re-exports walkability.ts | Barrel for experiment/tools. |
| Dual connect: `tile-variants` (paint) vs `assetsConnectForCollision` (query) | Still two policies. Query claims it uses barrier-connect. |
| Orphan thickness labels | `WORLD_CONFIG.cellPixels`, old `COLLISION_*` comments in geometry map. Live rail hit is `barrier-geometry` + `pointHits*Footprint`. |
| `resolveCollisionVariant` / `collisionVariantFromPaint` | Deprecated aliases in walkability-query. |

## Archive ideas missing from cleaned `docs/01–04`

Sources still on disk: `archived-planning/NewGame_GameBible_StartHere.md`, `docs/archive-2026-07-14/WorldEngine-05-PopulationAndProgression.md`, `Nano-3D-Structural-Asset-Inventory.md`, `clean-rebuild-assessment/05-deep-intent-feature-map.md`.

| Idea | Clean docs | Product now |
|------|------------|-------------|
| Shops / bars / inns as **places** (not emoji stalls) | Flattened to “meet an NPC” | `shop*` asset stamps + `market-stall-row` recipe |
| **NPC gatekeepers** (person owns the quiz / blocks the path) | Gates exist; person-as-gate dropped | Bare `quiz_gate` dialog owner `'quiz_gate'` |
| Forced quiz on the **route** (unavoidable) | `04` still says it; `13` lists it | Origin teaches **no** quiz; modular scenes skip `chunkDist ≤ 1` |
| Treasure room / chapter end after 10–20 tiles | Session bar in `01`, no place kit | Not stamped |
| Z-height shop / cathedral / homestead **kits** | Paint-only in `05` | Materials ported; assemblies mostly not product places |
| Toll / key / crowbar as first-class route locks | In `03`/`04` | Code exists; origin loop does not use them |

Do not restore missing files unless a named path is gone (`git checkout 8d7135e -- …`).

## C2 finding (motor, 2026-08-13)

Headless motor charges on homestead rails: **no mid-line cross**. Stop distance is symmetric (~0.32 cell from rail mid, both faces). Corner L-shape free-depth 0.38 vs 0 is the open quadrant vs two solid arms, not a walk-through. Old inspect “footprint crossed” was a false positive (far cell walkable ≠ path through rail). `--probe-fence` now fails only on mid-footprint legal or motor through.

## C3 trap reverted (2026-08-13)

`first-lesson-garden` boxed the dirt leave into a second pen. Stamp and inn weight **removed**. Leave is dirt `(13,16)` again. Do not add a fenced quiz booth on the only exit.

## Iso fence contact (same day)

Paint solids stay centered. Locomotion uses `barrierContactRects`: fence band thickened and shifted grid-NW so the bump matches extruded posts (walk up at the visual top; do not nestle under the visual bottom). Inspect: `runIsoFenceFeel` / `--probe-fence`.

## LLM entropy for inspect (port 8005)

- Vite `/api/llm` proxies to `http://127.0.0.1:8005`.
- Headless inspect uses the same origin (`useDirectLocalLlm`). Override `EMILYS_LLM_ORIGIN`.
- Health accepts 200 or 401 (key-gated OpenAI-style).
- Last **10** authentic `expandEntropy` sentences persist in `localStorage` (browser) or `recordings/entropy-samples.json` (CLI).
- `expandEntropy` order: live LLM → cached samples → template. Test mode skips live + cache.
- Inspect `--entropy=off|auto|llm|cache`. `--assert` defaults to `off` (deterministic). Bare `inspect:world` uses `auto`.
- Live play still uses `generateChunkSync` (no hang). Inspect salts that path via the entropy buffer.
