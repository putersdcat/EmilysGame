# Playability Milestone 1 (M1) — unlock Iso 2.0 visual re-attachment

**Status:** ✅ Complete (2026-07-15)  
**Unlocks:** Docs `13` §4 / `iso2-visual-technology-inventory-and-deferred-plan.md` Tracks V1+

## M1 definition (core loop is trustworthy)

A child can, without debug hacks, complete this loop repeatedly:

1. Move with predictable collision (no random snags / walk-through solids)
2. Learn Space/Enter at a gate (homestead sign + hints)
3. Fail a quiz and retry without softlock
4. Open a gate and walk through
5. Find further gates outside spawn
6. Use key/crowbar/coins when blocked by door/barricade/toll
7. Progress is saved (gate open survives reload via resolved cells / autosave)

## Checklist

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Full-tile structural collision | ✅ |
| 2 | Interact floor targeting + Space while moving | ✅ |
| 3 | Non-origin min quiz_gate + meadow weight + fence-run gates | ✅ |
| 4 | Corridor bias + bypass seal | ✅ |
| 5 | Per-gate unlock (no global quiz-gate condition leak) | ✅ |
| 6 | Immediate re-deal after wrong at gate | ✅ |
| 7 | Starter homestead south gate + coin trail + sign | ✅ |
| 8 | Starter key + coins; quiz drops key/crowbar/map | ✅ |
| 9 | Campfire cooldown (no infinite rest farm) | ✅ |
| 10 | Teaching toasts/hints (gate, crowbar, tier, leave-home) | ✅ |
| 11 | Autosave on gate/door/chest resolve | ✅ |
| 12 | Automated E2E: homestead gate fail→retry→open | ✅ `playability-m1-core-loop.spec.ts` |
| 13 | Automated: non-origin chunk has ≥1 quiz_gate (sample) | ✅ same file + last-resort placement in `ensureMinimumQuizGates` |
| 14 | Softlock: empty quiz pool at gate does not freeze | ✅ code path |
| 15 | Docs mark M1 complete → visual work unblocked | ✅ this file + `13` §4 + iso2 inventory |

## Proof (2026-07-15)

```
npx tsc --noEmit                          → exit 0
playability-m1-core-loop.spec.ts          → 2 passed
quiz-gate-retry-loop.spec.ts              → 2 passed
```

Sampled non-origin gate counts (seed 42): all ≥1 (e.g. (1,0)=1, (0,1)=3, (1,1)=5).

## After M1

Visual work is **allowed** under `13` §4 (V1 gen composition first).  
Playability polish may continue in parallel, but is no longer a hard gate.
