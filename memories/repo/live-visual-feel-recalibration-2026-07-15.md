# Live visual/feel recalibration (2026-07-15)

## Trigger

User feedback after MCP live browser screenshots: the game’s problems are
**obvious from a single still frame** — random tiles, no grass→dirt flow,
stray gate/fence bits, movement restriction near objects that does not match
intentional gating. Abstract gen metrics (quiz-gate bypass %) were the wrong
primary track for “get it running as the docs describe.”

## What the live view actually shows (source: MCP screenshots)

From spawn / nearby roam frames:

1. **Terrain is a checkerboard, not a landscape**
   - Hard-edged dirt diamonds dropped into flat green grass
   - No edge blending, no path language, no “mud tracks between places”
   - Reads as random cell noise, not Perlin→place

2. **Props are salt-and-pepper**
   - Flowers, coins, posts, stump-like posts scattered with no composition
   - Minimap is multicolored noise soup — confirms chunk-level chaos, not just
     one bad camera angle

3. **Fences / “gates” are fragments, not architecture**
   - Short rail segments and lone posts that do not form yards, corridors, or
     readable barriers
   - Stone patio floats without a building/context that would justify it
   - “Random gate bits here and there” — matches this, not “you hit a chokepoint
     and must solve a quiz”

4. **Movement restriction feels wrong (known, partially documented)**
   - Prior feel audit (`gameplay-feel-audit-2026-07-13.md`) already flagged
     nano-footprint collision: thin fence/wall bands → pass-through OR snag
     near objects without reading as a real wall
   - That is **not** the designed Pillar-2 “blocked until you engage” feel —
     it is collision imprecision / visual–physical mismatch

5. **Safe zone has no quiz_gates in the 3×3 loaded meadow ring**
   - 0 quiz_gates, some door_locked, lots of fence cells — so the “solve to
     advance” loop is not even present near spawn; what the player *does*
     feel is clutter + sticky geometry

## Priority reordering (supersedes B→A gate-first for this campaign)

Docs `13` listed quiz-gate unavoidability as #1 because it maps cleanly to
Pillar 2 *on paper*. Live play shows **Pillar 2 cannot be felt** until the
world reads as places and collision matches what you see.

| Order | Problem | Why first |
|------:|---------|-----------|
| 1 | **Terrain visual coherence** (grass/dirt edges, path flow, less checkerboard) | Every frame fails the “is this a world?” test |
| 2 | **Collision matches visible geometry** (nano footprint vs full-tile expectation for fences/posts; no random snags) | User’s movement complaint; blocks trusting any “gate” work |
| 3 | **Structure language** (fences form runs/yards; no lone posts; gates sit in runs) | “Random gate bits” is a placement/chain integrity *presentation* problem |
| 4 | **Then** progression gating (corridor bias, unavoidability) | Only meaningful once 1–3 make barriers readable and fair |

Standing rules still apply: no speculative rewrites; Slice methodology;
headless Playwright = narrow regression only; **feel = live MCP browser**.

## What NOT to prioritize next

- More bypass-rate instrumentation as the main deliverable
- Expanding `sealTrivialQuizGateBypasses` until visual/collision baseline improves
  (partial Phase A code may already be in working tree — treat as optional /
  park until 1–3 move)

## Likely code touchpoints (for next session — investigate, don’t rewrite wholesale)

- Terrain: `TerrainBuilder.ts` / Perlin base + any dirt/path post-pass;
  render path in `terrain-cache.ts` / tile drawing (edge blend may be render-
  only vs gen-only)
- Collision: `mechanics.ts` `isFootprintWalkable` / `isPositionWalkable` +
  `nano-tile-defs` / `isPointWalkableInTile` (feel audit dead-end note)
- Fence/gate fragments: `placeGatesInFenceRuns`, chain integrity, stamp
  templates, decoration scatter density in `Populator` / `CollectibleScatterer`

## Session note

User was correct to stop token burn on headless gameplay scripting. Live
screenshot diagnosis is higher signal than gen-hash metrics for current
state.
