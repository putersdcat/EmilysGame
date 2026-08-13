# Durable engine repair — 2026-08-13

> **SUPERSEDED 2026-08-13 (same day, later).** Incremental fence/sort
> repair of this tree is not the job. Current law: root `AGENTS.md`.
> Recover intent first. Do not resume sort-key / rail-thickness guesses.

**Status:** historical. **Not** a content campaign. **Not** current law.

Owner evidence (playtest screenshots, same day): at the homestead **top** iso corner the avatar cannot walk up to the posts; at the **bottom** corner the posts paint over the head while feet read outside the yard. Prior 16px contact-shift did not change that. A second fenced quiz pen on the dirt leave was a trap and was removed.

## What is actually wrong (not “feel”)

`docs/02` is still law: flat grid owns walk; iso is paint.

The live bug is that **paint and sort pretend fences are 3D volumes**, while **collision is a 2D rail in the cell**:

| Layer | What it does today | Why the screenshots happen |
|-------|--------------------|----------------------------|
| Collision | Centered (then briefly NW-shifted) rail in the fence cell | Inside a **corner**, two rails make a fat L. You stop a long way from the visual posts (top corner). |
| Sort | `depthKey = gy + 0.5 + height*0.4` (`render.ts`). Player is `py + 0.3`. Fence `height: 2` ⇒ fence sorts ~1.3 rows “later” | Walking toward the **south / screen-down** fence, the fence always draws **on top** of the player. Head in posts (bottom corner). |
| Occluders | Trees/walls with `occluderRatio`. **Fence has none** | No partial hide — all-or-nothing fence-on-head. |
| Inspect | Grid motor charges | Reported “symmetric, no through” and I treated that as done. It cannot see sort or iso extrusion. That was my failure. |

Iso depth is **`gx+gy`** (screen into-page). Using only `gy` is a wrong axis. FirstFeedback / WorldEngine already said occlusion is a draw-order problem, not a new physics.

## How we work (no more /plan theater)

1. **Inspect must fail on the owner’s screenshots** — not only mid-rail grid through.
2. One change per seam: sort, then contact, then (later) content.
3. Assume the file is wrong until inspect + a human Ctrl+F5 agree.
4. Do **not** add recipes, inns, or quiz pens on the spawn path until leave + fence hug work.
5. No `COLLISION_*` / FOV / nano-kind / WorldUnitSolver campaigns.

Loop: `npx tsx scripts/inspect-world.mjs --probe-fence` → fix the named seam → Ctrl+F5.

## Workstreams (order)

### W1 — Presentation sort — **reverted 2026-08-13 (human playtest)**

Forcing the player in front of rails made the **bottom** corner worse: avatar drew on the far side of the fence. Restored `gy + height*0.4` / `py+0.3`. Do **not** retune sort by guess. Next sort work only after inspect can compare player sprite AABB vs fence post screen rects from `projectFencePoint`.

### W2 — Thin centered contact (this pass)

- Revert the failed thicken+NW-shift.
- Contact = **centered thin rail** (paint centerline, ~18px), so the inside of a corner is walkable up to the posts.
- Mid-rail still blocks. Motor must not cross.

### W3 — Inspect that can see this

- Keep motor through = 0.
- Add: inside→NW corner approach distance; player vs fence sort keys (debug).
- Later: ASCII “visual occupancy” slice (which cells’ paint overlaps the player sprite). Do not use screenshots as LLM eyes.

### W4 — After W1–W3 survive human playtest

- Teaching quiz **on the route**, not a second pen on the only exit.
- Places via catalog only.
- LLM entropy cache already exists; do not block walk work on it.

## Archives to keep reading (not AmysGame)

- `docs/02` — flat sim, iso paint, occlusion is draw
- `archived-planning/NewGame_GameBible_StartHere.md` — 5–15 min loop
- `docs/archive-2026-07-14/WorldEngine-05-PopulationAndProgression.md` — gates as progression, not trap pens
- `docs/archive-2026-07-14/FirstFeedbackOnIso2.md` — depth / occlusion
- `memories/repo/geometry-stack-dependency-map-2026-07-30.md` — dual stacks (diagnosis only)

## Explicitly out

Rewriting WorldUnitSolver, new nano kinds, restoring the load-slot menu, talking-head quizzes, treating MCP/screenshot “eyes” as proof.
