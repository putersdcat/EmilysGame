# Functional-first campaign (2026-07-15)

## User direction

- Iso 2.0 had better materials/assemblies; port may be incomplete — **defer
  looks**. Minecraft-looking but feature-complete is a win; attach visuals later.
- Core play issues first: movement restriction that feels random, interact
  failures, progression loop — not terrain blend polish.

## What Iso 2.0 actually ported (functional angle)

From `iso2-portback-plan.md`: bitmask, nano stacks, fence/wall/gate/water
walkability paths, assemblies (starter homestead, castle landmark), gate
connectivity fixes. **Much of that is structural/render fidelity.** The
thin nano footprints for fence/wall/gate were intentional for “slide along
rails” but produced **live snag / walk-past** feel — worse for children than
full-tile solids.

## Fixes landed this session

### 1. Full-tile structural collision (predictable movement)

`src/engine/iso2/walkability.ts` — walls, fences, locked gates block the
**entire** micro tile when not unlocked. Sub-tile footprints deferred with
visual polish. Rivers/bridges still use always/conditional short-circuit.

**Why:** Live complaint “movement randomly restricted near objects” maps to
thin `FENCE_THICKNESS=18` bands. Full-tile = Minecraft-style clear solids.

**Tests updated:** edge-reach proofs in
`iso2-b-asset-nano-kind-completeness` + `iso2-e-wall-fence-biome-wiring` now
expect block (document product decision).

### 2. Interact targeting bug (Space missed adjacent cells)

`src/engine/mechanics.ts` `interact()` used
`Math.round(playerX + facingDx)`. At rest `n.5`, that targets the **wrong**
cell (often +2 on the axis). Fixed to
`Math.floor(player) + sign(facing)`.

**Live MCP proof:** door_locked south of player → toast **“Need a key!”**
(previously silent miss). quiz_gate south → quiz dialog + `pendingGateQuiz`.

### 3. Parked (not reverted) earlier gen work

`placeQuizGates` corridor bias + `sealTrivialQuizGateBypasses` still in
working tree from earlier same day — functional for progression, not
visual. Not the main story this pass; leave for next progression pass
after movement/interact trust is solid. Headless bypass baseline file is
optional instrumentation only.

## Live MCP verification (after fixes)

| Check | Result |
|-------|--------|
| Mid door/gate footprint blocked | yes |
| Edge into door cell blocked | yes |
| Grass between clear | yes |
| Space on door_locked | “Need a key!” toast |
| Space on quiz_gate | quiz active + barrier message |
| Related Playwright suite (21 tests) | all green |

## Next functional priorities (suggested)

1. ~~Roam/spawn loop / progression density~~ — partial: non-origin min gate,
   meadow quiz weight, fence-run gates, coin trails to gates, near_gate Space
   teaching, starter key, Enter=Space.
2. **Welcome splash / first-run** — still can block non-test play until dismiss.
3. **Visuals / Iso2 materials** — only after core loop feels complete.
4. User (2026-07-15): **auto-continue** without waiting for prompts
   (`auto-continue-directive.md`).

## Files touched

- `src/engine/iso2/walkability.ts` — full-tile structural collision
- `src/engine/mechanics.ts` — interact floor targeting; autoCollect floor;
  cell.interactable honor; structure flavor for wall/fence/rock
- `src/main.ts` — Space while moving; priority neighbor scan (gate > fence)
- `src/game/interaction-handler.ts` — structure = toast not full dialog pause
- `src/config/game.config.ts` — speed 0.05→0.08; safe/easy quiz freq
- `src/config/biomes.config.ts` — meadow quiz_gate weight 0.04
- `src/engine/world/ChunkGenerator.ts` — gates all non-origin; trails after gates
- `src/engine/world/ObstacleSolver.ts` — corridor bias + seal + min gates
- `src/engine/world/CollectibleScatterer.ts` — trails to quiz_gate
- `src/game/bubble-triggers.ts` — near_gate for door_locked/toll; floor cells
- `src/game/state-init.ts` — starter key
- `src/game/input.ts` — Enter = interact
- `src/game/welcome-splash.ts` — Space/Enter/Esc dismiss
- `src/game/quiz.ts` — easy/medium key drops; coins
- `src/game/state-init.ts` — starter key + 10 coins
- `src/config/assets.config.ts` — barricade no bump injury
- `src/main.ts` — hard pause blocks movement; face gate on bump
- tests updated for full-tile + gate interaction
