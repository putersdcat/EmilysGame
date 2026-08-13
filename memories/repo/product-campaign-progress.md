> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# Product campaign progress — session bar via geometry A→D first

> **UNTRUSTED / HISTORICAL 2026-08-13.** “Green” here is harness evidence
> the owner rejected in playtest. Do not resume geometry A–D. Current law:
> `AGENTS.md`. Recover intent into `docs/intent/`.

| Field | Value |
|-------|--------|
| **Branch** | `experiment/isometric-2.0` |
| **Started** | 2026-07-30 |
| **Status** | **Untrusted.** Phases A–D claimed green; playtest failed. |

## Product done bar (evidence)

1. Shared barrier solid/centerline for fence/wall paint + locomotion — **done** (`src/engine/iso2/barrier-geometry.ts`)
2. One connection/variant policy for paint + collision — **done** (`src/engine/iso2/barrier-connect.ts`; tile-variants + walkability-query)
3. Motor walk = cell SSOT + shared rail solid only — **done** (play-kernel → walkability-query; nano path de-authorized in comments)
4. Session mechanics: spawn free, locked gate blocks, resolve opens, leave path, approach — **done** (play-path Playwright 21/21)
5. This memo + FOV 128×64 unchanged

## Work order

| Phase | Item | Status |
|-------|------|--------|
| A | Barrier geometry SSOT + paint consumes it | **done** |
| B | One connect/variant path | **done** |
| C | Collision from SSOT solids (no shelf invention) | **done** |
| D | De-authorize residual nano/`buildWalkableMap` locomotion | **done** |
| R | Residual session (quiz open, leave, approach) | **done** (already stamped + tests green) |
| V | Evidence pack (tsc + tests + scratch) | **done** |

## Key files landed

- `src/engine/iso2/barrier-geometry.ts` — centerline, solid rects, hit tests
- `src/engine/iso2/barrier-connect.ts` — shared family/connect
- `src/engine/iso2/footprints.ts` — re-exports SSOT
- `src/engine/walkability-query.ts` — free = not in solid
- `src/engine/collision-profile.ts` — profiles via barrier-connect
- `src/rendering/nano-tile.ts` / `nano-roof.ts` / `tile-variants.ts` — consume SSOT
- `tests/core/barrier-geometry-ssot.spec.ts` + `scripts/_verify-barrier-ssot-run.ts`

## Verification snapshot

- `npx tsc --noEmit` → exit 0
- `npx tsx scripts/_verify-barrier-ssot-run.ts` → free-depth span 0 (≤0.05), mid-rail blocked
- Playwright: barrier-geometry-ssot, walkability-ssot, playability-m1-core-loop, play-stack-golden, quiz-gate-retry-loop → **21 passed**
- FOV: `RENDER_CONFIG.tileWidth/Height` 128/64

## Next step

None for session bar mechanics. Optional human playtest feel; content/recipes expansion is out of this campaign scope.

## Blockers

None.
