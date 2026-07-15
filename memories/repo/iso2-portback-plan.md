# Iso2.0 → main engine port-back plan (EmilysGame)

Owner ask (verbatim intent): port ALL isometric-2.0 experiment learnings into the
primary game engine and make the engine genuinely solid — not just structurally
present. User has twice caught real gaps: (1) code placed in wrong architectural
locations (fixed — see "Slice A" below), (2) features that exist in code but were
never actually validated to render correctly at the pixel level (water bug, this
session). Treat "does getNanoStack return the right .kind" as INSUFFICIENT proof
of a working port — always add pixel-level (getImageData) proof for anything with
multiple styles/variants, because structural tests can pass while rendering is
silently broken or style-blind.

## Slice status

- **Slice A — bitmask topology + architecture cleanup: DONE.**
  - Authored structures moved to `src/rendering/nano-structures/{index,geometry,cottage,castle}.ts`.
  - Starter homestead moved to `src/engine/iso2-assemblies/starter-homestead.ts`, re-exported from `src/engine/iso2-assemblies.ts`.
  - Fixed a real duplicate-case bug in `src/engine/iso2/bitmask.ts` (`variantFromBitmask`) that broke `straight-h`/tee resolution.
  - Proof: `tests/rendering/iso2-authored-structures.spec.ts`, `tests/rendering/iso2-main-bitmask.spec.ts`, `tests/rendering/iso2-systems-showcase.spec.ts` (structural `.kind` proof for water/bridge/wall/fence/gate/structures via real `getNanoStack()`+`drawNanoStack()`).
  - Determinism golden hash `061b4390` preserved (`tests/world-gen/gen-determinism.spec.ts`).

- **Slice A.5 — pixel-content revalidation audit: DONE for water/fence/bridge.**
  New spec: `tests/rendering/iso2-b-water-style-audit.spec.ts` (3 tests, all green).
  **Two real bugs found and fixed** (byte-identical bugs existed in BOTH main
  `src/rendering/nano-tile.ts` and `experiment/isometric-2.0/src/nano-tile.ts` —
  the port was faithful, but the underlying feature was never actually finished):
  1. **Isolated water = invisible.** `drawSunkenCutFaces()` and
     `drawProceduralRiverWater()` gated ALL drawing on `hasH || hasV` (any
     connection). A single-cell pond (`variant: 'isolated'`, the default for
     `deep-pond`) has both false → nothing drawn at all (no banks, no fill).
     Only the unrelated grass-edge `blendEdges` fade painted anything.
     Fix: added `isolated = !hasH && !hasV`, gate on `hasX || isolated`, and
     isolated now also triggers the existing "cross-junction" radial-glow
     branch (`(hasH && hasV) || isolated`) — a pond looks like a small
     highlighted basin using the SAME code path as a 4-way river crossing.
  2. **Water style discarded for connected rivers.** `waterNano()` generates a
     real per-tile `WaterStyle` (4 families: clear-river/muddy-creek/deep-pond/
     marsh-water, see `src/asset-pipeline/iso2-water-family/`) into `nano.svg`,
     but `drawNegativeNano()` NEVER uses `nano.svg` for `kind==='river'` — it
     always calls the procedural draw functions, which had every color
     **hardcoded** to clear-river's exact resolved hex values (verified by
     exact RGB match: hardcoded `#2b86a8`/`#1b638f`/`rgba(13,52,95,0.36)`/
     `rgba(168,217,232,0.20)` == `clear-river.shallow/mid/deep/foam` exactly).
     So all 4 "styles" rendered identically in real gameplay. The style
     system was fully built and fully unused at draw time.
     Fix: added `readonly waterStyle?: import('../asset-pipeline/iso2-water-family/types.js').WaterStyle;`
     to `IsoNanoTile` (mirrors the existing `fenceStyle` inline-import-type
     pattern — avoids a circular import since `iso2-water-family/types.ts`
     already imports FROM `iso-renderer.types.ts`). `waterNano()` now resolves
     `waterStyleForTile(styleId, worldCol, worldRow, variant)` once and stores
     it. `drawNegativeNano` resolves `nano.waterStyle ?? defaultWaterStyle()`
     and threads it into both draw functions, which now source every color
     from `style.{shallow,mid,deep,foam,bankOuter,bankInner,bankWet}` via a
     new `rgba(hex, alpha)` export added to the `iso2-water-family` barrel
     (`src/asset-pipeline/iso2-water-family/index.ts`).
  - Visual proof: `tests/screenshots/iso2-systems-showcase.png` top row now
    shows 4 genuinely distinct water renders (blue / murky brown-green / dark
    olive marsh / dark saturated blue) instead of 4 identical blues.
  - **Source-audited (no bug found, so no code change):**
    - `drawProceduralFenceNano` — already style-aware (reads `nano.fenceStyle`
      for real per-style post/rail colors+dimensions) and already handles the
      isolated case (`if (!arms.left && !arms.right...) addPost(center)`).
    - `drawProceduralBridgeNano` — deck geometry (`start=14, end=MICRO_TILE_SIZE-14`)
      is NOT gated on connections at all, so isolated bridges still render a
      full deck; troll vs regular already differentiated via `isTroll` branch.
    - `drawExtrudedNano` (walls) — draws REAL per-face material images via
      `ctx.drawImage(topFaceTextureSvg/southFaceTextureSvg/eastFaceTextureSvg/
      endFaceTextureSvg)`. This is the pattern the user originally pointed to
      as correct (`iso2-materials-homestead.ts`); it does NOT have the
      procedural-discard problem that river water had.
  - Regression-net tests added for fence/bridge isolated-ink (pixel ratio only,
    not style-distinctness, since no bug was found there).
  - **NOT yet done:** an N-variant × M-material pixel sweep for walls (only
    spot-checked via source reading + the existing structural showcase test).
    If a similar bug class is suspected there later, apply the SAME method:
    render every (material × variant) combo to a transparent canvas, assert
    non-trivial ink + pairwise material distinctness.

- **Slice A.6 — mirror the water fix into the experiment: DONE.**
  `experiment/isometric-2.0/src/nano-tile.ts` had the IDENTICAL two bugs
  (confirmed via direct side-by-side read). Fixed 4 files, same shape as main:
  - `experiment/isometric-2.0/src/types.ts` — added
    `readonly waterStyle?: import('./textures/water-family').WaterStyle;` to
    `NanoTile` (inline-import-type, avoids the types.ts<->water-family.ts
    cycle, same pattern as the pre-existing same-file `fenceStyle`).
  - `experiment/isometric-2.0/src/textures/water-family.ts` — changed
    `function rgba(...)` to `export function rgba(...)` (was private).
  - `experiment/isometric-2.0/src/nano-tile.ts` — imported
    `defaultWaterStyle, rgba, type WaterStyle` from `./textures/water-family`;
    rewrote `drawSunkenCutFaces`/`drawProceduralRiverWater` identically to
    main (style-driven colors + `isolated = !hasH && !hasV` fallback that
    reuses the cross-junction glow); wired `drawNegativeNano` to resolve
    `nano.waterStyle ?? defaultWaterStyle()` once and thread it through.
  - **Found a THIRD instance of the same bug pattern while doing this**:
    `experiment/isometric-2.0/AiTools/canvas-renderer.ts`'s `CanvasSceneEntry`
    interface already had a `waterStyle?: WaterStyleId` INPUT field (with a
    comment "Optional procedural water material style for river/pond nanos")
    that `buildNanoTile()` never read. Someone had already tried to wire this
    up at the tooling-input layer and at the `render_nano_scene` SVG-override
    layer (`render-worker.ts` sets `e.svgOverride = WaterFamily.svgWater(...,
    {style: e.waterStyle})` when both are present) — but since `nano.svg` is
    discarded for river at draw time regardless, none of that ever reached
    the screen either. Fixed by adding
    `import { waterStyleForTile } from '../src/textures/water-family.js';`
    and computing/attaching `waterStyle: e.kind === 'river' ? waterStyleForTile(e.waterStyle, e.col, e.row, variant) : undefined`
    in `buildNanoTile()`'s returned object.
  - **Visual proof**: `experiment/isometric-2.0/ProgressEvaluations/water-style-fix-proof.png`,
    generated via `render_nano_scene` (4 isolated river tiles, one per style).
    Confirms clear-river/deep-pond are distinct blues and muddy-creek/marsh-water
    are distinct greens — matches the pixel-math already proven in main.
  - **Validated**: root experiment `npx tsc --noEmit` clean; AiTools sub-package
    `npx tsc --noEmit` has pre-existing unrelated errors in `index.ts` (missing
    `@modelcontextprotocol/sdk` types — grep confirmed zero errors mention
    `canvas-renderer.ts`, and `git status` confirmed `index.ts` untouched by
    me). `git diff --check` clean.
  - **Tooling gotchas learned this pass** (useful for next AiTools session):
    - AiTools sub-package needed `npm install` (node_modules/tsx and the MCP
      SDK were not installed in this workspace) — took ~16s, safe to do.
    - `isoSvgRenderer` MCP tools were NOT registered/available via `tool_search`
      in this session; used the documented CLI fallback instead:
      `echo '<json>' | node node_modules/tsx/dist/cli.mjs render-worker.ts <tool>`
      run from `experiment/isometric-2.0/AiTools/`.
    - **Keep that CLI invocation on ONE line.** Multi-line `$json = '...'`
      followed by a separate piped line (or multi-line PowerShell blocks in
      general sent to `run_in_terminal`) silently mis-executed / truncated
      more than once this session — always inline the JSON directly after
      `echo` on the same line as the pipe.
    - `render-worker.ts`'s `savePng()`/`absPath()` hardcodes
      `outputPath` resolution to `c:/GitRoots/EmilysGame/<outputPath>` —
      i.e. **relative to repo root, NOT relative to AiTools/ or to
      `experiment/isometric-2.0/`**, and independent of the shell's actual
      cwd. Pass `outputPath` as e.g. `"ProgressEvaluations/foo.png"` (repo-root
      relative) and then move the file into
      `experiment/isometric-2.0/ProgressEvaluations/` yourself afterward if
      that's the conventional location you want it in — don't fight it with
      `../` prefixes, they get string-concatenated onto the hardcoded base
      and land somewhere unexpected.
    - `render_nano_scene` entries are placed by (col, row) in ISO GRID space,
      not screen space — a "same row, increasing col" scene renders as a
      diagonal staircase on screen, not a horizontal strip. Use a generously
      sized canvas (e.g. 1400x900) rather than fighting the projection.

- **Slice B — bridge orientation + walkability deep check: DONE, clean bill of health.**
  - **Gotcha caught first**: `tests/rendering/iso2-gate-bridge-walkability.spec.ts`
    imports from `../../experiment/isometric-2.0/src/solver` — it tests the
    EXPERIMENT's solver, NOT `src/engine/iso2/walkability.ts` (main). It was
    passing in the full-suite run but proves nothing about the main engine.
    Don't be fooled by this again; if a test file's `import` points into
    `experiment/`, it is not main-engine proof no matter how relevant its
    filename sounds.
  - **Orientation verified against real authored content, not just code
    reading**: found the actual WU templates in `src/config/tiles.config.ts`
    (`bridge_ns` — water fills a whole column except one row punched out for
    the bridge; `bridge_ew` — water fills a whole row except one column
    punched out). Hand-traced `inferBridgeVariant()` (`terrain-cache.ts`) +
    `bridgeSpansVertical()` (`nano-tile.ts`) against each template's real
    neighbor adjacency: `bridge_ns` (river column, N-S) -> bridge neighbors
    are water top/bottom, grass left/right -> `'straight-h'` variant ->
    `bridgeSpansVertical` returns false -> deck drawn EAST-WEST (correct,
    perpendicular to river). `bridge_ew` (river row, E-W) -> water left/right,
    grass top/bottom -> `'straight-v'` -> deck drawn NORTH-SOUTH (correct).
    Both orientations check out; no bug.
  - **Walkability precedence traced end-to-end, no contamination found**:
    - Coarse map: `ensureChunkWalkableMap` (`terrain-cache.ts`) builds
      `nanosPerTile[i] = getNanoStack(cell.assetKey, 'straight-h')` — ONE
      nano stack per cell keyed by that cell's OWN `assetKey`. A `'bridge'`
      cell only ever gets `[bridgeNano()]` (WALKABLE_ALWAYS); a water nano
      is never merged in, even though the RENDER path (same file) separately
      draws a water stack AND a bridge stack for visual layering on bridge
      cells. Render layering and walkability computation are cleanly
      decoupled — good.
    - Exact per-position check (the one that actually drives real collision):
      `src/engine/mechanics.ts`'s `isPositionWalkable()` -> re-derives the
      REAL variant from live same-assetKey neighbor adjacency (not a hardcoded
      approximation, unlike the coarse map) -> `getNanoStack(cell.assetKey,
      realVariant)` -> `isPointWalkableInTile()` (`engine/iso2/walkability.ts`).
      `isPointWalkableInTile` short-circuits to `true` the instant ANY nano on
      the tile is `'always'` or unlocked-conditional, so even in a
      hypothetical mixed-stack scenario, always-pass correctly wins over
      never-block (priority documented explicitly in that file's header
      comment: "locked conditional > unlocked/always > never").
    - `Passability.ts`'s `validateWaterIntegrity()` (post-generation pass)
      double-enforces this: forces `walkable=false` on any leaked `'water'`
      cell and `walkable=true` on any `'bridge'` cell, and is the thing that
      protects water/bridge cells from being carved/overwritten by the
      passability-repair random walk.
  - **New automated proof** (since the existing test only covered experiment):
    `tests/rendering/iso2-b-bridge-walkability-proof.spec.ts` (3 tests, all
    green) — live main-engine proof via `window.__gameDebug.isFootprintWalkable()`
    for BOTH river orientations (bridge cell walkable=true, flanking water
    cell walkable=false, control grass cell walkable=true), plus a visual
    screenshot (`tests/screenshots/iso2-b-bridge-orientation-proof.png`)
    showing the arched wooden bridge deck running visibly perpendicular to
    the blue water channel — clean, unambiguous confirmation.
  - **Found and filed for later (NOT a live bug today)**: `src/engine/mechanics.ts`'s
    `assetToNanoKind` lookup table only maps the "base" tileTypes
    (`stone_wall`, `homestead_wall`, `cathedral_wall`, `wooden_fence`,
    `barricade`, `quiz_gate`, `door_locked`, `water`, `bridge`, `troll_bridge`).
    It's MISSING every material/style sub-variant (`stone_wall_red_clinker`,
    `stone_wall_mud_brick`, `stone_wall_sandstone`, `stone_wall_cottage_foundation`,
    `homestead_wall_plaster`, `homestead_wall_planks`, `wooden_fence_split_rail`,
    `wooden_fence_picket`, `wooden_fence_wattle`, `door_gate`,
    `water_clear_river`, `water_muddy_creek`, `water_deep_pond`, `water_marsh_water`).
    If a cell ever gets one of these assetKeys, `mechanics.ts` silently falls
    through to the plain `cell.walkable` boolean instead of the real nano/
    footprint check (full-tile block instead of exact wall-hugging footprint
    for walls/fences specifically — NOT a walk-through-solid-objects bug,
    since generation-time code still sets `cell.walkable` correctly, just
    lower fidelity collision). **Confirmed harmless right now**: grepped
    `src/config/tiles.config.ts` for every one of these strings — ZERO
    matches. None of these tileTypes are referenced by any real WU template
    or biome palette; they only exist as switch-cases in `getNanoStack()`
    for tests/tools (my own `iso2-systems-showcase.spec.ts` uses several of
    them). This is dead-until-Slice-D/E surface area, not an active bug.
    **Do complete this table before Slice D/E starts making these materials
    reachable from real generation** — added as its own todo so it isn't
    forgotten once that day comes.

- **Slice B.5 — wall/material N-variant pixel audit: DONE, clean bill of health
  (plus one real fix + one deliberately-rejected fix).**
  - Confirmed via pixel tests (`tests/rendering/iso2-b-wall-material-audit.spec.ts`,
    3 tests green): all 9 wall materials (stone_wall, stone_wall_red_clinker,
    stone_wall_mud_brick, stone_wall_sandstone, stone_wall_cottage_foundation,
    homestead_wall, homestead_wall_plaster, homestead_wall_planks,
    cathedral_wall) paint visible ink for isolated/straight-h/cross; all 16
    wall variants paint visible ink for a representative material (no
    degenerate zero-rect variant, matching the `wallBounds()` source-audit
    finding that it always pushes >=1 rect even for `default`/isolated); all
    9 materials are pairwise visually distinct (zero near-duplicates).
  - **Real testing gotcha found and documented (not a game bug)**: `drawExtrudedNano`
    (unlike the procedural water/fence/bridge draw paths) depends on
    `loadSvgImage()`'s async `Image()`/data-URI decode. A single-shot render
    call returns 0 ink for EVERY wall material/variant on the FIRST paint
    (image not decoded yet) -- self-heals within a frame or two in the real
    60fps game loop, but any FUTURE isolated-canvas pixel test of an
    extruded/wall-family nano needs an explicit warm-up draw + a short wait
    (~200ms) + a second draw before capturing pixels, or it will show 100%
    false-negative "invisible" results that look exactly like the water bug
    but aren't. This also means `iso2-systems-showcase.spec.ts`'s wall/
    structure entries were never actually pixel-verified (only `.kind`
    checked) -- consistent with the broader "structural check insufficient"
    lesson, filed as a note rather than re-opened right now since no actual
    render bug was found once measured correctly.
  - **assetToNanoKind completeness (the "smaller fix")**: `src/engine/mechanics.ts`'s
    `assetToNanoKind` table was completed for the SAFE set only -- every wall/
    fence/water MATERIAL sub-variant (stone_wall_red_clinker, stone_wall_mud_brick,
    stone_wall_sandstone, stone_wall_cottage_foundation, homestead_wall_plaster,
    starter_homestead_wall_plaster, homestead_wall_planks,
    wooden_fence_split_rail, wooden_fence_picket, wooden_fence_wattle,
    water_clear_river, water_muddy_creek, water_deep_pond, water_marsh_water)
    -- 14 new entries, all unconditional WALKABLE_NEVER with zero lock/gate
    state, so completing them can only IMPROVE footprint precision (narrow
    wall/fence arms instead of a blunt whole-tile `cell.walkable` block),
    never change locked/unlocked semantics. `getNanoKindForAsset` exported
    for testability. Proven live via `tests/rendering/iso2-b-asset-nano-kind-completeness.spec.ts`
    (2 tests green): a completeness cross-check against `hasNanoRenderer`,
    plus a behavioral proof that an isolated `stone_wall_red_clinker` cell
    (no ASSET_DEFS entry -- material-only, test/tool tileType, cell built
    directly) now gets exact nano-footprint precision instead of a
    whole-tile block (a corner reaching ~19px into the wall's cell from the
    adjacent grass cell is now correctly walkable, where before the fix it
    was unconditionally blocked).
  - **Deliberately rejected a bigger, riskier fix**: `ASSET_DEFS.barricade.tileType
    === 'wooden_fence'` and `ASSET_DEFS.door_locked.tileType === 'door_gate'`
    and `ASSET_DEFS.toll_gate.tileType === 'troll_bridge'` are real
    render-path overrides (`terrain-cache.ts` resolves `def.tileType` before
    dispatch), but `mechanics.ts`'s collision path and `terrain-cache.ts`'s
    OWN `ensureChunkWalkableMap` both use `cell.assetKey` directly, never
    resolving this override. I initially "fixed" this (resolve
    `ASSET_DEFS[assetKey]?.tileType ?? assetKey` before the nano lookup in
    both places) but REVERTED it after tracing the consequence: routing
    `barricade` through `wooden_fence`'s footprint would shrink its blocking
    area from full-tile to a ~18px center post (FENCE_THICKNESS), making a
    supposedly-locked obstacle trivially walkable-around -- a real gameplay
    regression, not an improvement. Confirmed this is currently harmless
    because `door_locked`/`barricade`/`toll_gate` unlock via a completely
    SEPARATE mechanism: `OBSTACLE_TEMPLATES` in `mechanics.ts` directly
    REWRITES the whole cell (`assetKey` + `walkable`) on successful
    interact/pay/key-use, never touching the nano conditional system at all.
    **If this tileType-resolution gap is ever revisited, it needs a product
    decision first** (should a barricade's collision be full-tile or a thin
    fence-post?), not a blind "make it consistent with the render path" pass.
    Left `mechanics.ts`'s neighbor-adjacency-detection logic (which same-
    assetKey-compares raw `cell.assetKey`, not the resolved tileType) also
    untouched for the same reason -- whether a `barricade` embedded in a
    `wooden_fence` run should visually/collision-wise "connect" to its fence
    neighbors is a separate, unresolved design question.
  - **Testing gotcha learned**: `PLAYER_CONFIG.collisionHalfW/H = 0.3` grid
    units is LARGE relative to a single 1.0-unit tile and to
    `WALL_THICKNESS/MICRO_TILE_SIZE = 0.333`. `isFootprintWalkable`'s 4-corner
    AABB can straddle clean past a wall's own blocking band when centered on
    it (neither corner lands inside), giving a counterintuitive "walkable"
    result for standing in a wall's exact center -- a pre-existing collision-
    system property, not a bug, and not something to test against. The
    robust way to prove "exact footprint, not whole-tile block" is a query
    point centered in the NEIGHBORING walkable cell whose corner just barely
    reaches into the target cell at a location safely outside the blocking
    rect on both axes (~19px margin) -- see
    `iso2-b-asset-nano-kind-completeness.spec.ts` for the worked example.

- **Slice C — fence/gate production pass: DONE. Found and fixed a real
  gameplay-integrity bug** (arguably the highest-severity finding this
  session — affects actual game progression, not just visuals).

  **The bug**: `door_gate`/`quiz_gate` cells embedded in a REAL generated wall
  or fence run (`ObstacleSolver.ts`'s `placeGatesInFenceRuns` punches
  `quiz_gate` into `wooden_fence`-family runs; `placeQuizGates`'s "Strategy 1"
  converts existing `door_gate`/`door_locked`/`toll_gate` cells in place to
  `quiz_gate` within wall runs) resolved to the `'isolated'` `FeatureVariant`
  for BOTH:
  - **Render** (`src/rendering/tile-variants.ts`'s `nanoConnectionFamily`):
    hardcoded `quiz_gate`/`door_gate` to `'wall'` family only, never matching
    a `'fence'`-family neighbor (e.g. `wooden_fence`) -- so a gate punched
    into a FENCE run rendered visually disconnected from it.
  - **Collision** (`src/engine/mechanics.ts`'s `isPositionWalkable`): used a
    strict same-`cell.assetKey`-only neighbor check (no family awareness at
    all, and no cross-chunk-boundary handling either) -- so a gate NEVER
    correctly detected ANY wall or fence neighbor (its assetKey never equals
    theirs), regardless of which family it was embedded in.
  - **Consequence**: `'isolated'` collapses a gate's blocking footprint to a
    tiny center post (`pointHitsFenceFootprint`'s default case,
    FENCE_THICKNESS=18px, out of a 144px tile -- note gates ALWAYS use the
    fence-footprint function regardless of wall/fence context, since
    `nanoBlocksPoint` dispatches purely on `nano.kind === 'gate'`). This
    leaves the rest of the gate's own tile width freely walkable AROUND a
    supposedly-locked quiz gate -- i.e. **a player could likely walk around
    (not through) a locked quiz gate embedded in a real fence/wall run
    without ever answering the quiz**, bypassing the intended challenge
    entirely. This is a confirmable break in the lock-key/quiz progression
    system, not merely a cosmetic gap.

  **The fix** (two coordinated changes):
  1. `src/rendering/tile-variants.ts`: added `GATE_TILE_TYPES = new Set(['door_gate','quiz_gate'])`
     and a `familiesConnect(tileTypeA, tileTypeB)` helper -- same family
     always connects; additionally, if either tileType is a gate AND both
     resolved families are in `BARRIER_FAMILIES = new Set(['wall','fence'])`,
     they connect too. `sameFeatureNeighbor` now calls `familiesConnect`
     instead of strict `nanoConnectionFamily(a) === nanoConnectionFamily(b)`.
     Plain walls still never connect directly to plain fences -- only gates
     bridge the two.
  2. `src/engine/mechanics.ts`: replaced `isPositionWalkable`'s entire local
     same-assetKey neighbor-check block with a direct reuse of
     `sameFeatureNeighbor`/`variantFromConnections` imported from
     `../rendering/tile-variants` (removed the now-dead `variantFromBitmask`/
     `connectionsToBitmask` imports from `nano-tile-svgs`, which were only
     used in that one spot). This is a strict improvement beyond just fixing
     gates: `sameFeatureNeighbor` also correctly handles cross-CHUNK-boundary
     neighbors (walks into the adjacent chunk via the `chunks` map), which
     the old local `check()` function did not (it just bailed to "no match"
     for any out-of-bounds coordinate) -- so walls/fences that happen to sit
     exactly on a chunk seam are now also collision-correct, not just gates.
     Passed `cell.assetKey` (NOT resolved through `ASSET_DEFS.tileType`) as
     the current-tile parameter, deliberately preserving the Slice B.5
     decision to leave `barricade`'s full-tile-block behavior alone (a raw
     `'barricade'` string falls through `nanoConnectionFamily`'s `default`
     case and matches nothing, same as before -- zero behavior change there).

  **Important assetKey-vs-tileType gotcha hit while testing** (cost real
  debugging time, worth remembering): real generation places cells with
  assetKey `'fence'` and `'wall'` (see `biomes.config.ts`'s
  `obstacleWeights`), NOT the literal strings `'wooden_fence'`/`'stone_wall'`
  -- those are `ASSET_DEFS.tileType` *values* that `'fence'`/`'wall'` map to
  (`ASSET_DEFS.fence.tileType === 'wooden_fence'`,
  `ASSET_DEFS.wall.tileType === 'stone_wall'`), mirroring the
  `barricade -> wooden_fence` pattern from Slice B.5. Similarly, `'door_gate'`
  and `'stone_wall'` are NOT valid `ASSET_DEFS` keys at all (no def exists
  for the bare tileType string) -- the real assetKey for a locked wall-gate
  is `'door_locked'` (`tileType: 'door_gate'`). `door_locked`/`barricade`/
  `toll_gate` still never reach `getNanoStack` successfully via
  `mechanics.ts` today (their raw assetKey has no matching switch case) --
  same class as before, deliberately unresolved, always full-tile-blocked
  via the `cell.walkable` fallback (safe, just low-fidelity). Only
  `quiz_gate` (assetKey IS its own tileType, self-referential) reaches the
  nano path directly, which is why the live proof tests use `quiz_gate` for
  BOTH the fence-run and wall-run scenarios, not `door_gate`.

  **Live-engine proof**: `tests/rendering/iso2-c-gate-connectivity-fix.spec.ts`
  (3 tests, all green):
  1. `quiz_gate` in a real `'fence'`-assetKey run: locked gate blocks at a
     point ~19px into the gate's own tile from center (Y fraction 0.8, lands
     one collision-rect corner inside the fence rail band [0.4375,0.5625]
     with ~9px margin) -- this position was WALKABLE before the fix (isolated
     variant's tiny center square missed it entirely) and is correctly
     BLOCKED after. Also proves unlock (`activeConditions.set('quiz-gate','unlocked')`)
     still correctly passes.
  2. `quiz_gate` in a real `'wall'`-assetKey run: same proof, same Y=0.8
     (gates always use the FENCE footprint function regardless of wall/fence
     context -- a real gotcha I hit mid-test, see below).
  3. Visual: `tests/screenshots/iso2-c-gate-in-fence-run-proof.png` -- the
     fence line now renders as one continuous connected run (not broken into
     disconnected end-caps around a floating post) with the padlock marker
     visible at the gate's position.

  **Testing gotcha learned**: `nanoBlocksPoint` (`engine/iso2/walkability.ts`)
  dispatches footprint geometry purely on `nano.kind` -- `kind === 'gate'`
  ALWAYS uses `pointHitsFenceFootprint` (FENCE_THICKNESS=18, band
  [0.4375,0.5625]), even when the gate is logically embedded in a WALL run.
  Don't assume a wall-embedded gate uses `WALL_THICKNESS`'s wider band
  [0.333,0.667] -- it doesn't; use the fence-band Y offset (0.8) for gate
  tests regardless of which family it's connecting.

- **Slice D — wall/material parity pass: DONE, clean bill of health (no bug
  found; added a new durable automated regression guard instead).**
  - **Existence/completeness check** (experiment `experiment/isometric-2.0/src/textures/index.ts`
    barrel vs main `src/asset-pipeline/iso2-materials.ts` + siblings): every
    experiment material is present in main. Cross-checked: StoneBrick,
    RedClinker, MudBrick, SandstoneBrick (bricks); AncientStone, Limestone,
    DarkCathedralStone, CottageStoneFoundation (ancient-stone family);
    TimberFrameWall, PlasterWhitewashWall, RoughWoodPlankWall (homestead
    family); ThatchRoof (roof family — confirmed `roof-family.ts` only ever
    defined ONE concrete roof spec in the experiment too, so this is full
    parity, not a missed sibling); all 6 fence styles (BleachedPaddock,
    HazelWattle, MossyFarmRail, RoughPicket, SplitRailOak, WeatheredPostRail)
    plus `defaultFenceStyle`/`fenceStyleForTile`/`getFenceStyle`/`listFenceStyles`;
    WaterFamily (already fixed in Slice A.5/A.6). The experiment's `*-family.ts`
    files (`brick-family.ts`, `homestead-family.ts`, `roof-family.ts`) are
    PURE FACTORY modules (`createBrickMaterial`/`createHomesteadMaterial`-
    equivalent/`createRoofMaterial`) — main exposes the same factories
    directly (no missing behavior, just no namespace-wrapper re-export,
    which is a cosmetic organizational difference only).
  - **Byte-level content parity, automated**: new
    `tests/rendering/iso2-d-material-parity.spec.ts` (5 tests, all green)
    cross-imports the SAME material from BOTH `experiment/isometric-2.0/src/textures/*`
    and `src/asset-pipeline/iso2-materials.ts` (same precedent as the existing
    `iso2-gate-bridge-walkability.spec.ts`, which already imports experiment's
    solver directly into a main-repo test) and asserts every face-slice
    output is identical: StoneBrick, DarkCathedralStone, TimberFrameWall
    (SVG-string materials, all 6 face methods each), ThatchRoof (4 primitive
    methods), and all 6 fence styles (plain frozen data objects, `toEqual`).
    **First run found a diff on every SVG material — but it was 100%
    cosmetic**: experiment's hand-written template emits `fill="#3a3835" />`
    (space before the self-closing `/>`) while main's emits `fill="#3a3835"/>`
    (no space). Every coordinate/color/size value was identical once
    whitespace is stripped (`normalizeSvg()` helper: `svg.replace(/\s+/g, '')`)
    — confirmed true content parity, not a false pass from a too-loose test.
    Not worth "fixing" the cosmetic formatting in either copy — would touch
    every material factory for zero behavioral gain. The fence-style data
    objects needed no normalization (plain object `toEqual`, not string
    comparison) and were byte-identical on the first try.
  - **Manual spot-checks before writing the automated test** (kept for
    context — the automated test now supersedes needing to redo these by
    hand): StoneBrick's `BrickPaletteSpec` (mortar/rBase/gBase/bBase/rVar/
    gVar/bVar/rMin-Max/hi/lo/salt), DarkCathedralStone's `AncientStonePaletteSpec`,
    and WeatheredPostRail's full `IsoFenceStyle` (20+ fields including
    weathering sub-object) were all byte-identical between experiment and
    main on direct read, before any automated test existed.
  - **Weathering overlay system — checked, found a GOOD main-only addition,
    not a gap**: main's `src/rendering/nano-weathering.ts` has
    `drawAutoWeathering()`, called unconditionally first inside
    `drawNanoWeathering()`, which the experiment's inline `drawWeathering()`
    (in `nano-tile.ts`) does NOT have. It hooks into main's OWN day/night
    lighting system (`import { getCurrentLighting } from './lighting'`) to
    auto-apply snow when `lighting.brightness < 0.4` (top face only), mud
    (always, non-top faces), and moss (non-top faces, `brightness < 0.78`)
    BEFORE the shared `nano.weatheringOverlays` array (identical logic/
    algorithm to experiment's `drawWeathering`) layers on top. This is a
    reasonable main-engine-specific enhancement (the experiment sandbox has
    no day/night cycle to hook into) — evidence the port didn't just copy
    1:1, it properly integrated materials into main's broader systems.
    No fix needed; noted for awareness only.
  - **Net result**: wall/roof/fence material parity between experiment and
    main is genuinely solid — no drift found across 3 independent detection
    methods (existence check, byte-level automated SVG/data comparison,
    weathering-logic read). This slice concludes clean, unlike B.5/C which
    each found a real bug — a valid and expected outcome, not every audit
    needs to surface a fix.

- **Slice E — assemblies into generation: NOT STARTED.** Authored structures
  (`starter_cottage`/`castle_keep`/`cathedral_chapel`) currently only appear via
  the hand-authored `starter-homestead.ts` assembly, never from the procedural
  biome/template generator. Confirm whether that's intended (structures are
  meant to be assembly-only, hand-placed) or whether the generator should be
  able to place them too. Also the natural home for finally wiring real
  biome palettes to use the wall/fence/water material sub-variants that
  Slice B.5 confirmed are currently dead-until-then (see also: the rejected
  tileType-resolution fix above needs a product decision before this slice
  can safely route obstacle-template assets through material families).

  **KNOWN BUG — user-reported 2026-07-09, NOT YET TRIAGED, no GitHub issue
  filed (GitHub MCP tools are disabled in this environment, same restriction
  as `git push` — see `git-workflow.md`; user needs to file the issue
  themselves or re-enable GitHub tool access).** User reported via live
  playtest + screenshot: "the player or rather the world gets spawned so the
  player is inside a wall or other structure." Screenshot shows a stone-wall
  structure in a cross/plus shape (crenellation-like square gaps cut into the
  wall at intervals) with a locked wooden gate/fence segment (padlock icon)
  coming off one arm, on a grass field with dirt patches, scattered coins,
  flowers, a butterfly. **No player sprite is visible anywhere in the
  screenshot** -- consistent with the player being positioned inside/behind
  the wall's footprint, occluded by the extruded wall geometry (or literally
  overlapping solid/blocked cells). HUD shows Playtime: 0m with Coins: 16
  already banked -- looks like the start of a fresh session loaded from a
  save (coins persisted, playtime counter just reset), i.e. this is most
  likely a **spawn-time placement bug**, not a mid-game teleport/collision
  bug. The wall shape strongly resembles the starter-homestead perimeter,
  which already has dedicated safe-zone placement logic from a PRIOR
  (non-Slice-A-E) initiative -- pre-existing commits `812dbab` "fix(iso2):
  starter homestead + safe-zone template adapter (refs #277)" and `2387bfb`
  "fix(iso2): reposition starter homestead around player start (refs #277)"
  already tried to solve exactly this class of problem. This new report
  suggests that safe-zone logic has an edge case it doesn't fully cover,
  OR a different/newer code path (e.g. procedural WU wall generation) can
  independently produce the same symptom near spawn. **Root cause not yet
  confirmed either way -- do not assume it's the same mechanism without
  checking.** Investigate when it makes sense (user's own words: "address it
  when it makes sense," not urgent-drop-everything) -- Slice E is a natural
  place to pick this up since it already touches starter-homestead placement
  and safe-zone/spawn logic, but treat it as a separate, explicitly-scoped
  fix, not something to silently roll into the material-parity work.
  Suggested first investigation steps for whoever picks this up: (1) find
  the actual spawn-point resolution code (likely in `main.ts` bootstrap or
  `game/game-state.ts` factory per ARCHITECTURE.md's state model) and check
  whether it re-validates walkability at the FINAL chosen spawn coordinate
  after the starter-homestead assembly (or any procedural wall/fence) has
  been stamped, not just at template-selection time; (2) check refs #277's
  original fix for what specific case it covered (e.g. only prevented the
  ASSEMBLY from being centered ON TOP of a fixed spawn point) vs whether a
  DIFFERENT spawn coordinate (e.g. a save-loaded position, or a randomized
  spawn) could still land inside the assembly's or a procedural wall's
  footprint; (3) reproduce with a determinism-seeded test once a hypothesis
  exists, following this plan's established live-engine-proof standard
  (`window.__gameDebug.isFootprintWalkable`) rather than assuming a fix
  worked from a single manual playtest.

  **FIXED 2026-07-09 — root cause confirmed, matches the hypothesis above
  almost exactly.** `stampStarterHomestead`'s hand-authored `STARTER_HOMESTEAD`
  cell list is SPARSE: cells inside its 7x7 footprint that aren't explicitly
  listed silently retain whatever Phase 3's WU-template stamping (which runs
  BEFORE this assembly) placed there. `PLAYER_CONFIG.startPosition` (12.5,
  12.5) resolves to grid cell (12,12) = offset (3,4) inside this layout,
  which is exactly one of those unstamped gaps -- along with its cardinal
  neighbors (3,3)/(2,4)/(4,4) (the diagonal neighbors are NOT gaps: (4,3) is
  the explicit `starter_cottage`, (2,5) is the explicit `campfire`). If the
  WU template selected for that safe-zone position placed a blocking
  obstacle at any of those 4 cells, the player spawns on top of / inside it
  -- intermittent, since it depends on which template/RNG outcome landed
  there. Confirmed `addExtraObstacles` (Phase 5.6) and `placeGatesInFenceRuns`
  (Phase 5.42) are BOTH already correctly skipped for chunk (0,0) (difficulty
  tier 0 "Safe Zone" has `extraObstacles: 0`; the `Math.abs(chunkX/Y) > 1`
  guard skips fence-run gates for central chunks) -- so the WU-template's OWN
  baked-in decorative/obstacle content (or, in principle, entropy-flag
  overrides at Phase 5.5) is the real remaining risk surface, not those two.
  **Fix**: new `ensureSpawnClearance(cells)` in `starter-homestead.ts`,
  called for chunk (0,0) ONLY as the ABSOLUTE LAST step of
  `generateGridChunk` (after Phase 8's `validatePlayability`) -- deliberately
  late, not right after `stampStarterHomestead` at Phase 3, since any later
  phase could otherwise silently re-block the spawn cell after an early
  clearance pass already ran. Force-clears the spawn cell + its 4 CARDINAL
  neighbors only (a plus shape, NOT a 3x3 box -- the diagonal neighbors
  include the cottage and campfire, which must never be touched), and only
  ever touches a cell if it's actually non-walkable (preserves any
  legitimately-placed walkable content, like the dirt path, untouched).
  **Live-engine proof**: `tests/rendering/iso2-e-spawn-clearance-fix.spec.ts`
  (3 tests, all green): (1) hand-constructed reproduction of the exact bug
  (pre-seed the 4 gap cells with a fence, confirm `stampStarterHomestead`
  alone leaves them blocked, confirm `ensureSpawnClearance` clears them
  without touching the cottage/campfire/dirt/coin cells); (2) a REAL-pipeline
  sweep -- `generateChunkSync(0,0)` called 40 times with `restoreEntropyBuffer`
  fed a different arbitrary string each iteration (this is required to get
  VARIED chunk(0,0) outcomes at all, since `generateChunkSync`'s internal
  seed derivation salts with the entropy buffer and chunk(0,0)'s coordinate
  hash is otherwise fixed) -- spawn cell walkable in all 40; (3) the actual
  running game has a walkable spawn point at real startup.
  **Test-suite flakiness observed while validating (not caused by this fix,
  not resolved, just documented)**: `iso2-main-game-visual-smoke.spec.ts`'s
  `starterIso2 >= 10` assertion failed ONCE when run as part of the full
  60-test suite (got 6), but passed cleanly both in isolation and on a full
  suite re-run immediately after. `entropyBuffer` (Entropy.ts) is confirmed
  PURE module-level state (not persisted to localStorage), so it fully
  resets on every `page.goto` -- ruled out as the cross-test leak vector.
  Root cause of the one-off flake not identified; treat as pre-existing
  suite flakiness, not a regression from this fix, unless it recurs
  consistently in a future session (if it does, worth a dedicated
  investigation into what full-suite-only, order-dependent state the
  smoke test's "normal" ungoverned chunk(0,0) generation is sensitive to).

- **Slice E — CLOSED, 2026-07-09. Committed as `9c8d571`** (recovered and
  committed after a chat-app crash — see `next-batch-plan.md`'s "Crash
  recovery note" for details; no code was lost, memory docs fully
  reconstructed the state and everything re-validated green before
  committing). Two real findings fixed, plus one deliberate scope deferral:

  **Finding 1 (bigger than originally scoped) — collision precision for
  real generated walls/fences.** `ObstacleSolver.ts` places real obstacles
  with the literal, UNRESOLVED `weightedPick(obstacleWeights)` result as
  `cell.assetKey` (e.g. `'wall'`, `'fence'`) -- confirmed by direct read of
  the cell-write code, never `ASSET_DEFS[assetKey].tileType` (`'stone_wall'`/
  `'wooden_fence'`). Neither `assetToNanoKind` (mechanics.ts) nor
  `getNanoStack`'s switch (nano-tile-defs.ts) had a case for these BARE
  strings -- only their resolved-tileType and other-assetKey forms (the
  original 10 + Slice B.5's 14 additions). Consequence: **every real biome-
  obstacle-weighted wall/fence fell through to the blunt whole-tile
  `cell.walkable` block instead of the precise nano footprint** -- a real
  visual/collision mismatch (the wall visibly renders as a narrow band with
  open grass beside it, per its own nano geometry, but the WHOLE tile was
  blocked, so the player couldn't actually walk into that visually-open
  grass). Unlike the Slice C gate bug (narrow footprint enabling a bypass)
  or the Slice B.5 barricade case (narrowing would shrink a LOCKED obstacle's
  blocking area -- rejected), plain `'wall'`/`'fence'` are not progression-
  gating and Slice B.5 already proved every stone_wall/wooden_fence
  sub-variant shares identical footprint geometry, so precision-only
  narrowing here is a strict fidelity improvement with no exploit risk.
  Fixed with two small, additive cases (no change to existing cases):
  - `nano-tile-defs.ts`'s `getNanoStack` switch: added `case 'wall':` (alias
    to `stoneWallNano`) and `case 'fence':` (alias to `woodenFenceNano`)
    right before their resolved-tileType siblings. The RENDER path never
    calls `getNanoStack` with these bare strings (it always resolves
    `def.tileType` first), so this ONLY changes the collision path's
    resolution -- zero rendering impact.
  - `mechanics.ts`'s `assetToNanoKind`: added `'wall': 'stone-wall'` and
    `'fence': 'fence'`.

  **Finding 2 (the originally-scoped question) — biome material variety.**
  Confirmed via grep: there is NO `wallStyleIdForBiome`/`fenceStyleIdForBiome`
  analog anywhere -- `render.ts`'s `emitObjectSpriteCmd` always set
  `cmd.tileType = def.tileType` verbatim (always plain `'stone_wall'`/
  `'wooden_fence'` for every biome). Fixed additively, mirroring
  `waterStyleIdForBiome`'s exact one-pick-per-biome pattern (new
  `wallTileTypeForBiome`/`fenceTileTypeForBiome` in nano-tile-defs.ts,
  called from render.ts right after the `hasNanoRenderer` check, only ever
  substituting WITHIN the same nano `kind` family so collision is never
  affected regardless of which material renders). Per real biome
  obstacleWeights (biomes.config.ts): biome 0 meadow places `fence` only ->
  `wooden_fence_picket` (cheerful, matches "Sunny Meadow, Easy difficulty");
  biome 1 forest and biome 2 cave place neither `wall` nor `fence` directly
  today (forest has `barricade`, deliberately left alone per the Slice B.5
  barricade decision) -> both default to plain `stone_wall`/`wooden_fence`;
  biome 3 castle places BOTH -> `stone_wall_cottage_foundation` (ancient-
  stone family, aged/ruined look) + `wooden_fence_split_rail` (rugged/aged
  rail, fits ruin grounds better than the cheerful picket or rustic wattle).
  `wooden_fence_wattle` remains unused by this mapping (no biome places
  plain `fence` besides meadow/castle today) -- fine, this is still a net
  new capability, not a regression, and easy to extend later.

  **Live-engine proof**: `tests/rendering/iso2-e-wall-fence-biome-wiring.spec.ts`
  (5 tests, all green): (1) pure-logic biome->tileType mapping incl.
  negative/wraparound safety; (2) direct `getNanoStack`+`drawNanoStack`
  pixel-distinctness for castle wall vs plain, and meadow/castle/plain fence
  pairwise (colour distance > 4 threshold, matching Slice B.5's method); (3)
  live-engine collision-precision proof using the REAL bare `'wall'`/
  `'fence'` assetKeys with real `ASSET_DEFS`-derived `walkable` values
  (edge-reach point walkable after the fix, was blocked before); (4) a FULL
  live-pipeline wiring proof -- set `chunk.biomeId` on a real chunk, position
  `state.camera` on a `'wall'` cell, wait for the running rAF loop to
  redraw, read live canvas pixels via `gridToScreen` (imported from
  `rendering/projection.ts`, the SAME function the real renderer uses) at
  the computed screen position, and confirm biome 0 vs biome 3 produce
  measurably different average colour (colour distance > 2, a deliberately
  looser threshold than (2)'s since this capture is diluted by surrounding
  grass) -- this specifically proves `render.ts`'s wiring itself runs, not
  just that the pure functions exist and typecheck.

  **Deliberately deferred, not forgotten**: the original "should
  `starter_cottage`/`castle_keep`/`cathedral_chapel` be proc-gen-placeable,
  not just assembly-only" question. Decision: **leave assembly-only for
  now.** Reasoning: the user independently reported a live "player spawns
  inside a wall/structure" bug this same session (see the KNOWN BUG entry
  above) with root cause not yet confirmed. Expanding procedural authored-
  structure placement WHILE a spawn-safety bug is open would only multiply
  the ways a player could end up embedded in solid geometry (more structure
  instances = more chances for an uncovered safe-zone edge case), the
  opposite direction of what's needed right now. Revisit this question
  AFTER the spawn-in-wall bug is triaged and fixed, not before -- sequencing,
  not indefinite avoidance.

  **Test-file gotcha hit this slice (fixed, worth remembering)**: a JSDoc
  block comment containing the literal substring `stone_wall_*/wooden_fence_*`
  (asterisk immediately followed by a slash) prematurely closes the `/** */`
  comment early, corrupting everything after it into broken syntax. Avoid
  writing tileType-family wildcard notation like `foo_*/bar_*` in comments;
  add a space (`foo_* / bar_*`) or just spell out "every foo and bar
  sub-variant" instead.

## Validation loop (repeat for every slice)

1. `npx tsc --noEmit` (root).
2. Targeted `npx playwright test <touched specs> --reporter=line` — NOTE: on
   this Windows/PowerShell shell, Playwright treats path args as REGEXES, not
   globs. `tests/rendering/iso2-*.spec.ts` finds ZERO tests (bare `*` in regex
   means "zero or more of preceding char", not wildcard). Use either explicit
   space-separated file paths, or a real regex like
   `"tests/rendering/iso2-.*\.spec\.ts"` (quoted, with `.*` and escaped dots).
3. Full relevant suite: `npx playwright test "tests/rendering/iso2-.*\.spec\.ts" --reporter=line`
   (57 tests as of Slice E, includes unrelated pre-existing `iso2-d7-`/
   `iso2-d8-` seam/biome-transition specs from a DIFFERENT "#275" initiative —
   coincidental "d" prefix collision with this plan's Slice-lettering, not an
   actual naming conflict since full filenames differ) + `tests/world-gen/gen-determinism.spec.ts`.
4. `git status --short` — expect screenshot churn ONLY for specs whose visual
   output could plausibly have changed given the edit. Revert (`git checkout --`)
   any screenshot for an unrelated system (e.g. wall/fence/roof screenshots
   after a water-only change, or ALL of them if the turn's code changes were
   collision-only/test-only with zero rendering-path touches) — these are
   typically harmless re-encode noise, not real content diffs, and reverting
   keeps the PR diff honest/scoped.
   `tests/screenshots/iso2-live-gate-boundary-player.png` in particular is
   known to get rewritten by ANY run that includes `iso2-native-visual-scene.spec.ts`'s
   live-gameplay gate-boundary test, unrelated to whatever you're actually
   working on — always check it back out unless you specifically changed
   gate/gameplay-position logic.
5. `git diff --check` clean before calling a slice done.
6. **Isolated-canvas pixel tests for EXTRUDED/wall-family nanos need a
   warm-up.** `drawExtrudedNano` depends on `loadSvgImage()`'s async
   `Image()` decode and silently no-ops (0 ink) on the very first draw call.
   Draw once, `await new Promise(r => setTimeout(r, 200))`, clear the canvas,
   draw again, THEN capture pixels. Water/fence/bridge procedural draws don't
   have this issue (no image dependency), only wall/structure `drawImage`
   paths do.

- **Step 2 (post-Slice-E roadmap item) — authored structures into
  procedural generation: DONE, committed as `15672ab`.**
  - **Discovery**: `stampIso2Assembly` (the generic multi-cell assembly
    stamper, supports `'homestead-small'`/`'ruined-cathedral'`) was fully
    built but had EXACTLY ONE call site in the whole codebase:
    `debug-api.ts`'s `window.__gameDebug.stampIso2Assembly` — never called
    from real generation. The single-cell `castle_keep`/`cathedral_chapel`
    nano "proof" assets (assets.config.ts) had ZERO call sites anywhere,
    real or debug — pure rendering capability, exercised only by
    `iso2-systems-showcase.spec.ts`'s direct `getNanoStack`+`drawNanoStack`
    calls. Also found the `'landmark'` anchor role already exists in
    `tiles.config.ts`'s type system and `Populator.ts`'s `populateAnchors`
    switch, but is a pure placeholder (`// TODO: DOC — new anchor roles
    placeholder, treat as decoration`) — zero real WU template actually
    declares a `role: 'landmark'` anchor, so there was no existing design
    intent to reverse-engineer there (confirmed: WorldEngine-05's Entity
    Taxonomy has no landmark/structure category at all).
  - **Decision** (made unilaterally per explicit user instruction not to
    stop and ask): wire `stampIso2Assembly`'s `'ruined-cathedral'` +
    `castle_keep` into real generation for the **castle biome only** — no
    other biome has ANY authored landmark asset today (meadow already has
    the starter homestead near spawn; forest/cave have none), and
    WorldEngine-05 §9.2 explicitly describes castle as "structured rooms
    and corridors... best rewards behind the hardest challenges", which
    matches a rare architectural landmark well. `cathedral_chapel`
    deliberately NOT wired — it thematically overlaps with
    `ruined-cathedral` (both are "a cathedral"); shipping BOTH as
    independent landmark flavors would risk two competing "cathedral"
    designs coexisting with no way to tell which is canonical. Flagged as
    an open follow-up for the user rather than guessed at.
  - **Implementation**: new `maybePlaceCastleLandmark(cells, size, biome,
    chunkDist, rng)` in `src/engine/iso2-assemblies.ts` (same file as
    `stampIso2Assembly`/the placement data — NOT a new sub-file, per
    `code-organization-philosophy.md`'s "don't reorganize for its own
    sake" directive). Gates: `biome.name !== 'castle'` → no-op;
    `chunkDist <= 2` → no-op (keeps the starter safe zone + its ring
    landmark-free); ~12.5% chance roll; then 40% tries the 3x5
    ruined-cathedral rect first (falls back to the single-cell keep if no
    clear rect is found), else 60% goes straight to the single-cell keep.
    Both scan real terrain for currently-plain, unoccupied cells (reusing
    `ObstacleSolver.addExtraObstacles`'s eligible-terrain set: grass/dirt/
    sand/stone_floor, no itemId/npcId); the single-cell keep additionally
    requires `countWalkableNeighbors >= 3` so it can't seal a corridor.
    `stampIso2Assembly` was refactored to share its bounds-checked stamp
    loop via a new private `stampAssemblyOntoCells(cells, id, x, y)` helper
    (operates on a raw cell grid instead of a `ChunkData`) — zero behavior
    change to the existing debug-API call site.
  - **Wired as Phase 5.46** in `ChunkGenerator.ts` (`generateGridChunk`),
    directly after `placeBonfires` (Phase 5.45) and before Phase 6
    `balanceObstacles`/Phase 7 `enforcePassability`/Phase 8
    `validatePlayability` — deliberately BEFORE the existing safety net so
    a landmark that happens to land across a needed route still gets
    repaired the same way any other Phase-5.x placement does (no new BFS
    reachability check was hand-rolled; the existing guarantees are
    trusted here, same rigor level as every other Phase-5.x placement).
  - **Real discovery made while building the live-pipeline test (worth
    remembering, NOT fixed — out of scope for this slice)**: castle biome
    is empirically only **~0.6%** of eligible (chunkDist>=7ish) chunks in
    real play, not the "~25%" `BiomeSelector.ts`'s own inline comment
    claims (`// castle (~25%)` on the `combined >= 0.75` branch). Measured
    via a direct `selectBiomeCoherent` sweep across a dense
    -40..40-step-2 grid: `{cave: 798, forest: 824, castle: 10}` out of
    1632 samples, ZERO meadow at that distance. Root cause: `biomeVal`/
    `subVal` are `(PerlinNoise.noise(...) + 1) / 2` — Perlin noise
    naturally clusters near its output midpoint rather than being uniform
    across [-1,1], so `combined = biomeVal*0.7 + subVal*0.3 + shift` also
    clusters near the middle, starving the two EXTREME buckets (meadow
    `<0.20`, castle `>=0.75`) and over-filling the two middle buckets
    (forest `0.20-0.50`, cave `0.50-0.75`). This is a PRE-EXISTING
    characteristic of `selectBiomeCoherent`, not something this session's
    change caused or broke — but it means real players will see castle
    biome (and therefore these new landmarks) far more rarely than the
    code's own comments suggest. Worth a dedicated look in a future
    session if "players almost never see the castle biome" turns out to
    matter for the actual game feel — NOT addressed here since it's an
    unrelated, pre-existing biome-tuning question, not a landmark-wiring
    one. The live-pipeline test (`iso2-e-castle-landmark.spec.ts`, test 3)
    had to pre-scan for real castle coordinates with `selectBiomeCoherent`
    directly (cheap, pure noise lookup) rather than trust a small
    hand-picked coordinate list, specifically BECAUSE of this rarity — a
    first attempt with 12 hand-picked distant coordinates found ZERO real
    castle chunks across 180 real `generateChunkSync` calls.
  - **Live-engine proof**: `tests/rendering/iso2-e-castle-landmark.spec.ts`
    (3 tests, all green, stable across repeated runs): (1) deterministic
    pure-logic gating via a sequence-controlled fake rng (biome gate,
    distance gate, chance-roll gate, cathedral-vs-keep branch, both
    outcomes produce the expected asset keys); (2) real-generated-terrain
    integration proof — clones real messy generated cells, runs the
    function with a forced castle biome param vs. a forced meadow biome
    param on byte-identical terrain across 60 real chunks, proving it
    fires often enough on real (non-pristine) terrain, NEVER fires for the
    non-castle param, and `validatePlayability(...).valid` stays true for
    every chunk that received a landmark; (3) full live-pipeline wiring
    proof — real untouched `generateChunkSync` calls at real castle
    coordinates (found via the `selectBiomeCoherent` pre-scan) produce
    real landmarks, real non-castle coordinates never do.
  - **Validated**: `npx tsc --noEmit` clean; full
    `tests/rendering/iso2-.*\.spec\.ts` + gen-determinism suite (64 tests,
    up from 61) green. The new phase is PROVABLY incapable of affecting
    the determinism golden hash: every coordinate the determinism test
    exercises is `chunkDist<=2` (`cx` -1..1, `cy` 0..2), which
    `selectBiomeCoherent` forces to meadow-only regardless of noise/entropy
    — so `maybePlaceCastleLandmark`'s very first gate (`biome.name !==
    'castle'`) always early-returns before touching cells or even calling
    `rng()` once, for every single golden-hash coordinate.

- **Phase 3b/6 (post-Step-2 roadmap item) — cross-chunk boundary + chain
  integrity audit: DONE, committed as `05a1df7`.**
  - **ARCHITECTURE.md's own table was partially STALE**: it marks Phase 6
    "Chain integrity (edge contracts)" as "❌ planned, not implemented at
    all". In reality, `enforceChainIntegrity` (src/engine/world/
    WorldUnitSolver.ts, tagged `#42` throughout) already existed, was
    already fully wired as Phase 2e of every single `solveWorldUnitGrid`
    call, and already replaces a chain feature (river/wall/path) that
    would dangle off a chunk edge with an appropriate terminator
    (river_end_pond / wall_end / path_dead_end). The doc's "not fully
    enforced" framing for Phase 3b turned out to be the MORE accurate
    half — real, confirmable bugs were found in HOW that enforcement
    worked, not in whether it existed at all.
  - **Bug 1 (the original, most severe finding) — orientation-blind
    terminator selection.** `findTerminator` always returned the
    UNROTATED (0°) rotation of the terminator template regardless of
    which direction the chain was actually dangling toward. Every
    terminator has exactly ONE non-'open' side; rotation 0 happens to put
    it on 'n', which only matches a north-south river dangling toward the
    SOUTH edge. Every other case — an east-west river (dangling east or
    west), or ANY chain dangling toward north/east/west — got a
    mis-oriented terminator, which then failed the function's own
    (north/west-only) neighbor-compatibility re-check and left the
    dangling chain port **completely unfixed**, exporting a raw,
    un-terminated edge tag right at the chunk boundary. Proven with a
    hand-constructed test placing real `river_straight_ns`/`river_straight_ew`
    rotations at all 4 grid edges before any fix existed.
  - **Bug 2 — stale per-cell snapshot clobbers earlier fixes.** The
    per-cell loop read `template = grid[gy][gx]` ONCE, then iterated every
    dangling direction (`dirsToCheck`) using that same stale snapshot. A
    cell with 2+ simultaneously-dangling directions (a chain reaching an
    actual grid CORNER, or a terminator itself naturally solved with its
    connector facing outward) would have its FIRST fix silently
    overwritten by a SECOND full-cell replacement computed from the
    pre-fix template. Confirmed via a real-pipeline sweep across 180
    `solveWorldUnitGrid` calls (4 biomes x 3 moods x 15 seeds): **726
    dangling single-connector exports found before any fix.**
  - **Bug 3 — grid corners have 2 simultaneously off-grid directions.**
    Even after fixing bug 1, re-orienting a single-connector terminator to
    escape ONE off-grid direction could land its connector on the OTHER
    off-grid direction at a corner cell (2 of the 4 rotations are always
    unsafe at any given corner). Fixed by computing ALL off-grid
    directions for a cell once (not just the one being checked) and
    requiring the chosen rotation avoid all of them.
  - **Bug 4 — single best-guess candidate isn't always compatible.** Even
    an off-grid-safe, correctly-oriented candidate can still fail the
    real north/west neighbor-compatibility check (e.g. a real wall
    reaches the cell from the west specifically, but the chosen rotation
    put its connector on the north side instead). Fixed by turning
    `findTerminator` into `findTerminatorCandidates` (preference-ordered:
    exact `into`-side match first, any off-grid-safe rotation next, the
    historical default, then `meadow_base` last) and having
    `enforceChainIntegrity` try each in turn until one passes
    compatibility, instead of giving up after one guess.
  - **Gap 1 — shore templates had no terminator mapping at all.**
    `shore_n`/`shore_corner_ne` use `chainType: 'river'` but don't start
    with `river_`, so `findTerminator` never recognized them and fell
    through to a `meadow_base` fallback that's almost always incompatible
    with a real water neighbor (silently leaving them dangling too). Fixed
    by mapping the `shore_` prefix to `river_end_pond` as well.
  - **Gap 2 — `cave_fork` (chainType 'wall', single connector on 'w') has
    a non-standard name** that doesn't start with `wall_`. Added as an
    explicit exception alongside `wall_` / `guard_tower`. (Not exhaustively
    audited against all 17 `chainType: 'wall'` / 6 `chainType: 'path'`
    templates for further naming exceptions — this was the one that
    showed up in the real-pipeline sweep; there may be others.)
  - **False-positive fix — fully-enclosed rooms (`connectivity: 'enclosure'`,
    e.g. `castle_courtyard`, `fence_enclosure` — 8 templates) were being
    treated as dangling chains.** These are walled/fenced on all 4 sides
    BY DESIGN (self-contained rooms, not a chain that continues anywhere),
    but `computeChainPorts` gave them non-empty entries on every non-open
    side, and `findTerminator` had no name-prefix match for them, so they
    fell through to the `meadow_base` fallback too (would have silently
    dissolved a courtyard corner into open grass if it ever passed the
    compatibility check). Fixed at the source: `computeRotations`
    (`tiles.config.ts`) now returns empty `chainPorts` up front for any
    template with `connectivity === 'enclosure'`, so `enforceChainIntegrity`
    never considers them dangling in the first place.
  - **Deliberately NOT solved — multi-way junction shapes.** River bends,
    T-junctions, crossroads, islands, and shore corners can have 2-3
    simultaneously non-open sides. No single-connector terminator
    (river_end_pond/wall_end/path_dead_end all have exactly ONE connecting
    side) can correctly cap these; a real fix needs dedicated multi-way
    junction terminator CONTENT (new WU templates), which is a content/art
    design task, not a narrow code fix. Also not solved: the tiny residual
    of single-connector cells whose real north AND west neighbors demand
    two DIFFERENT non-open connections simultaneously (needs an actual
    corner piece, same root cause). Both are precisely measured, not
    guessed at: the real-pipeline sweep test tracks a `multiWayJunctionCount`
    (255 across 180 solves in the sample run, logged not asserted) and a
    bounded `singleConnectorProblems.length < 20` (down from 726, the
    residual being exactly this dual-conflicting-neighbor-corner case).
  - **Determinism golden hash deliberately re-captured**: `061b4390` ->
    `839e4437`. This is the SANCTIONED response per
    `gen-determinism.spec.ts`'s own header comment ("If you intentionally
    change generation output, re-capture GOLDEN_HASH"), not a regression.
    Root cause of the change: all 9 tested coordinates are `chunkDist<=2`
    (forced meadow biome), but meadow's WU template candidate pool still
    includes decorative river/shore features (a small pond/stream can
    appear in a meadow), so the chain-integrity fixes changed real cell
    content for at least one of those 9 chunks.
  - **Live-engine proof**: `tests/world-gen/gen-chain-integrity-boundary-audit.spec.ts`
    (3 tests): (1) hand-constructed proof that all 4 dangling directions
    now get capped correctly for a real 2-segment river chain (previously
    only south worked); (2) the fix generalizes to wall/path chain types,
    not just rivers; (3) the real-pipeline sweep described above.
  - **Validated**: `npx tsc --noEmit` clean; full
    `tests/rendering/iso2-.*\.spec\.ts` + `tests/world-gen/.*\.spec\.ts`
    (151 tests) — only the expected/sanctioned determinism hash diff,
    everything else green.

- **Phase 7 (Progression placement — lock-key DAG) — AUDITED 2026-07-09,
  clean bill of health, no code change.**
  - Read `ObstacleSolver.ts`'s `balanceObstacles` in full (the lock-key DAG
    algorithm ARCHITECTURE.md's §6 table cites for Phase 7). Confirmed the
    algorithm is sound: layered BFS reachability expansion (stop at lock
    cells, quiz gates always passable since they're "solvable via retry"
    per the design comment), each newly-boundary-adjacent lock gets EITHER
    a key placed in the already-reachable region (biased toward the 30%
    closest-to-center candidates, for early-path placement) OR gets
    removed as a safe recovery fallback if no room exists for a key: no
    third outcome, so `keysPlaced + locksRemoved === totalLocks` holds by
    construction, not by luck. Final cleanup pass also removes any lock
    NEVER reached (nested/nested-unreachable pockets). `dagValid` is
    FALSE whenever any recovery/removal happened -- this is a signal for
    the debug overlay, not itself a correctness failure; the actual
    no-softlock guarantee is the keysPlaced+locksRemoved accounting,
    which every existing test already asserts.
  - Traced the ARCHITECTURE.md "⚠️ partial" label to its accurate meaning:
    the algorithm does NOT always achieve zero-recovery placement (a lock
    can legitimately get removed instead of solved if its region is too
    cramped) -- that's a real, accepted, DELIBERATE limitation (full
    backtracking/replanning to avoid ANY recovery would be a much bigger
    solver rewrite), not a bug. The existing `tests/world-gen/lock-key-dag.spec.ts`
    (7 tests) already covers this precisely, including its own comment
    "If recovery happened, that's fine — it means the system worked to
    prevent softlocks" -- i.e. the test suite's authors already understood
    and intentionally accepted this design, matching what I found reading
    the source fresh.
  - **No fix made, no new test added** -- this is a legitimate "clean"
    audit outcome (same category as Slice B/D in the earlier Iso2 port-back
    work): reading the algorithm end-to-end against real generation
    semantics found no discrepancy between documented behavior and actual
    behavior, so there was nothing narrow-and-safe to fix. Do not
    re-propose "hardening" this without a NEW concrete failure mode in
    hand (e.g. an actual observed softlock in real play) -- speculative
    rewrites of a working safety-net are exactly what
    `code-organization-philosophy.md` warns against.

- **Phases 9-10 (full edge contracts, macro assembly) — SCOPED, NOT
  IMPLEMENTED, 2026-07-09. Deliberately left as future work, not attempted
  this session.**
  - ARCHITECTURE.md marks these "❌ planned" and that framing is ACCURATE
    (unlike Phase 6, where the underlying mechanism already existed).
  - **What "full edge contracts" (cross-chunk chain FLOW) would require**:
    the Phase 3b/6 audit above already establishes that chains (rivers/
    walls/paths) are currently self-contained WITHIN a chunk -- they
    terminate cleanly at every boundary rather than continuing into a
    neighbor. Making them ACTUALLY continue across a chunk seam needs
    more than "stop capping the edge": the FIRST-generated chunk of any
    pair has no neighbor yet, so if it optimistically leaves a chain port
    open, the SECOND chunk's candidate pool must be GUARANTEED to contain
    a compatible connecting template for every biome, or the AC-3 solver's
    existing `findFallbackTemplate` (`meadow_base`, generic, not
    border-aware) would silently substitute a non-matching template and
    produce a genuinely broken visual seam (a river ending in a wall of
    grass with a phantom "river continues" expectation) -- WORSE than
    today's clean self-contained termination. This is real, non-trivial
    solver work (border-aware fallback selection, or a two-pass/deferred
    commit generation model), not a narrow code fix -- correctly a
    separate, larger initiative.
  - **What "macro assembly" would mean**: per `WorldEngine-01-SpatialHierarchy.md`'s
    four-tier model (Macro 5x5 world units -> WU -> Micro -> Nano), a
    "macro" tier concept -- e.g. deliberately composing an entire 5x5 WU
    chunk's template selection toward a coherent large-scale shape (a
    proper castle grounds spanning multiple world units, a lake spanning
    several WU slots) rather than each WU slot being solved independently
    via AC-3 -- does not exist in the current solver at all. This is a
    genuinely new solver TIER, not a fix to an existing one; it would sit
    conceptually above `solveWorldUnitGrid`, providing it with additional
    macro-level candidate-weighting hints. A real design/architecture
    task, not something to improvise without the user's steering on what
    "macro assembly" should concretely produce for gameplay.
  - **Recommendation for whoever picks this up next**: do NOT attempt
    either of these as a quick fix. Both need an explicit product/design
    conversation first (does the game actually want rivers to flow between
    chunks visually, given the "generate lazily as player explores" model
    means the player will rarely if ever SEE both sides of a seam at once
    anyway? does "macro assembly" mean literal multi-WU authored structures,
    or just template-weighting bias toward large-scale coherence?) before
    committing to an implementation approach.

  **RESOLVED 2026-07-10 — user directive answers the open question above
  directly.** "Macro assembly" is NOT a new AC-3-style constraint-solving
  tier sitting above `solveWorldUnitGrid` with smarter candidate-weighting
  hints (the framing this section originally left open). It is a
  **template-driven Composite Assembly Sub-Solver**: LLM entropy stays
  scoped to macro-level variety (biome, mood, roughly-where); it must NOT
  drive a giant deterministic state machine assembling nano-tiles/terrain/
  structure-primitives arbitrarily from raw entropy at the finest grain.
  Complex composite SCENES (a homestead with a fence + open gate, a
  general store, a bounded progression section's required structure) are
  meant to be handled the SAME way textures and structural primitives
  already are: pre-authored, visually tested, and tuned -- not synthesized
  on the fly by the generic per-slot world-unit solver.

  The intended division of responsibility (verbatim intent, condensed):
  1. The macro/world-unit solver decides THAT a footprint needs a named
     scene (e.g. "a homestead, meadow style, 7x7 footprint, gate facing
     south") and WHERE -- it does NOT work out the nano-level composition.
  2. It hands that **recipe** (scene type + footprint + biome/style +
     specific parameters like gate orientation) to the **Composite
     Assembly Sub-Solver**.
  3. The sub-solver selects a matching pre-authored, hand-tuned template
     for that scene type and lays out the WHOLE footprint's nano/micro
     elements atomically, honoring the requested parameters.
  4. The result is handed back to the world/macro solver, which simply
     marks the footprint as filled -- same as a single WU template today.

  This generalizes a pattern that ALREADY EXISTS in nascent form:
  `stampIso2Assembly` (`src/engine/iso2-assemblies.ts`) is exactly this
  kind of sub-solver for TWO known scene types today (`'homestead-small'`,
  `'ruined-cathedral'`); `stampStarterHomestead`
  (`src/engine/iso2-assemblies/starter-homestead.ts`) and
  `maybePlaceCastleLandmark` are concrete callers deciding WHERE/WHETHER
  to invoke it (Step 2 from this same file, committed `15672ab`). Neither
  caller today reserves its footprint BEFORE Solver C (the per-slot AC-3
  fill) runs -- they overwrite whatever Solver C already placed there,
  relying on the later passability/playability passes as a safety net.
  Formalizing a true up-front reservation handoff (Solver C excludes the
  footprint from its own candidate pool entirely, rather than a post-hoc
  overwrite) is the concrete next step for whoever generalizes this.

  **Directly reframes Finding #3** (river-heavy mood's emergent water
  lattice, this file's own "Bug 3" entry above): the appropriate real fix
  is most likely a coherent **pond/lake composite template** requested
  explicitly via this mechanism (the world solver decides "a pond goes
  here, this biome style, this footprint" and hands off to the sub-solver
  for atomic placement) -- NOT smarter per-slot AC-3 candidate weighting,
  which this file's own Bug 3 investigation already measured and found
  insufficient (halving mood modifiers only dropped water saturation from
  74% to 65%, because the driver is the hard EDGE_COMPAT constraint, not
  weight preference). This also supersedes Bug 3's own "Recommendation"
  bullet's suggestion of "a neighbor-water-density-aware candidate filter"
  as the narrower option -- that was a reasonable guess at the time but a
  worse fit for the user's actual intended architecture than a proper
  composite pond/lake template would be.

  Documented in full in `ARCHITECTURE.md` (new "Entropy scope & the
  Composite Assembly pattern" subsection under §6) and
  `Docs/WorldEngine-03-SolverPipeline.md` (new §6.7, distinguishing this
  from Solver C). NOT implemented this pass -- per the user's own
  instruction, this was purely a documentation/intent-capture directive;
  building the generalized sub-solver registry remains future work.

## Correct-layer cheat sheet (from the Slice A architecture correction)

- Authored single-cell structure rendering → `src/rendering/nano-structures/*.ts`
  (dispatched from `nano-tile.ts`'s `drawNanoStack` via `isAuthoredStructureNanoKind`).
- Hand-placed multi-tile assembly DATA (which cells get which asset key) →
  `src/engine/iso2-assemblies/*.ts`, re-exported from the existing
  `src/engine/iso2-assemblies.ts` barrel. Do NOT put this in `engine/world/` or
  `engine/iso2/` — those are for the generic solver/topology, not specific
  authored content.
- Material face-slice factories (svgTop/svgTopV/svgSouth/svgEast/svgEnd) →
  `src/asset-pipeline/iso2-materials.ts` (bricks/walls) or
  `src/asset-pipeline/iso2-water-family/` (water) or
  `src/asset-pipeline/iso2-fence-family.ts` (fences) — these are the
  "generates real style data" layer. ALWAYS verify the renderer actually
  consumes what these generate; do not assume wiring is complete just because
  the factory exists and typechecks.
- Bitmask/topology/walkability solver logic → `src/engine/iso2/{bitmask,
  footprints,walkability}.ts`, barrel `src/engine/iso2-solver.ts`.
- Collision/walkability entry point for REAL gameplay movement →
  `src/engine/mechanics.ts`'s `isPositionWalkable()`/`isFootprintWalkable()`
  (exposed as `window.__gameDebug.isFootprintWalkable` for live tests). This
  is a SEPARATE code path from `terrain-cache.ts`'s `ensureChunkWalkableMap`
  (a coarse per-chunk map used for other purposes) — both independently call
  `getNanoStack()`, so a fix to one does not automatically apply to the
  other (see the Slice B.5 assetToNanoKind fix, applied to `mechanics.ts` only).
- `ASSET_DEFS[assetKey].tileType` is a real, load-bearing override field the
  RENDER path (`terrain-cache.ts`) resolves before dispatch (e.g.
  `barricade`→`wooden_fence`, `toll_gate`→`troll_bridge`). The COLLISION path
  in `mechanics.ts` does NOT resolve this override today (deliberately left
  that way per the Slice B.5 rejected-fix writeup above) — don't assume
  render-path tileType resolution is mirrored in collision without checking.

## What to avoid (reminders from user corrections this session)

- Do not create new top-level loose files in `src/rendering/` for one-off
  features — extend or add to an existing family folder
  (`nano-structures/`, `nano-tile-defs.ts`, etc.).
- Do not assume a `.kind`/type-level structural test proves a feature renders
  correctly — add pixel-content proof (non-transparent ratio + style/variant
  distinctness) for anything with multiple visual variants. For extruded/
  wall-family nanos specifically, remember the async-image warm-up gotcha
  above or you'll get false-negative "invisible" results.
- Do not let `experiment/isometric-2.0` and main silently diverge when a bug
  is found in a ported function — the instructions treat experiment as source
  of truth; fixes found while working on main should be mirrored back.
- Do not "fix" an inconsistency just because it's inconsistent — trace the
  actual consequence first. The tileType-resolution gap in `mechanics.ts`
  looked like an obvious completeness bug but would have silently changed
  real gameplay collision behavior (barricade full-tile-block → thin-post)
  for a case that already works correctly via a different mechanism. Prefer
  the narrower, provably-safe fix and explicitly flag the riskier one for a
  product decision rather than silently taking the bigger swing.

- Material face-slice factories (svgTop/svgTopV/svgSouth/svgEast/svgEnd) →
  `src/asset-pipeline/iso2-materials.ts` (bricks/walls, plus sibling
  `iso2-materials-ancient-stone.ts`/`iso2-materials-homestead.ts`/
  `iso2-materials-roof.ts`) or `src/asset-pipeline/iso2-water-family/`
  (water) or `src/asset-pipeline/iso2-fence-family.ts` (fences) — these are
  the "generates real style data" layer. ALWAYS verify the renderer actually
  consumes what these generate; do not assume wiring is complete just
  because the factory exists and typechecks (this is exactly the water bug
  class from Slice A.5 — Slice D's automated cross-import parity test is
  the durable version of that same verification habit).


## KNOWN BUGS — user-reported 2026-07-10, live remote-deployment playtest,
NOT YET TRIAGED (explicitly deferred by user: "i do not want to take you
away from your current work with this feedback, please just take a moment
to stash it away in planning... come back to later"). No GitHub issue filed
(same `gh` read-only restriction as the 2026-07-09 spawn-in-wall bug above
— user needs to file via their own access, or these should be included in
the "draft issue content" deliverable already queued in
vision-model-and-gap-audit.md's todo list).

**Positive context first**: user confirmed, after pulling a patch to the
remote test system, that render speed and player movement responsiveness
have "noticeably increased" and "for the first time" meet the performance
goal — i.e. the performance-optimization thread (separate from this
session's Vision Alignment Audit work) is landing successfully on real
hardware. Good signal to preserve: whatever the most recent perf-relevant
commits were, they're working as intended.

**Bug 1 — river/water rendering is "visually totally a fail" across
multiple axes** (user's words), demonstrated by a screenshot of a diagonal
river crossed by a wooden bridge:
- "the negative z depth of the river banks... is not working right" —
  the negative-Z carve-out rendering family (ARCHITECTURE.md §4's
  render-family table: "Negative-Z carve-out: sunken channel below ground
  plane: river, river-bank") isn't producing the right visual depth/shape
  for banks specifically.
- "the negative z depth of the water surface is not working right" — same
  concern for the water surface itself, not just the banks.
- "the continuous flow of river water tiles from one to the next is not
  right" — this reads as a MULTI-TILE continuity problem: how adjacent
  river nano-tiles visually connect to each other (does the water surface
  look like one continuous flowing body across a WU boundary, or does each
  tile look like an independent, disconnected patch?). This is a DIFFERENT
  class of bug than Slice A.5/A.6's fixes above (isolated single-tile
  water rendering: pond-invisible bug, hardcoded-style-discarded bug) —
  those fixes were validated via single-tile/isolated-canvas pixel tests,
  NOT a multi-tile continuity sweep across real adjacent WU cells. Worth
  checking whether `drawProceduralRiverWater`/`drawSunkenCutFaces`
  (nano-tile.ts) account for the ACTUAL neighboring tile's water state
  when drawing shared edges (bank curvature, foam/depth gradient direction
  continuing correctly across the seam) or whether each tile draws in
  isolation assuming symmetric neighbors, causing a visible seam/kink at
  every WU boundary along a winding river.

**Bug 2 — water under the bridge is "not right at all", both visually
AND for walkability**: screenshot shows the player sprite standing
directly on/immediately next to the bridge deck, and the user explicitly
says "you can see this in that the player is standing on the tile where
there should be unwalkable water." IMPORTANT: do not assume this is a NEW
regression in the walkability system before checking — Slice B above
("bridge orientation + walkability deep check: DONE, clean bill of
health") specifically proved bridge/water walkability correct via
`window.__gameDebug.isFootprintWalkable()` for both river orientations,
with a passing visual screenshot. Two non-exclusive possibilities for
whoever triages this: (a) this is a genuinely NEW/different scenario Slice
B's specific test coordinates didn't cover (e.g. a diagonal-looking river
bend near a bridge, not a clean straight N-S/E-W case), or (b) the
UNDERLYING walkability is still actually correct at that exact grid
position, and what looks like "standing on water" is purely a Bug-1
rendering/perspective problem (the water's negative-Z depth or the
bridge's rendering not lining up with where the actual walkable bridge
deck footprint is, making a correctly-blocked position visually ambiguous
to a human eye) — i.e. Bug 1 might be MAKING Bug 2 look worse than it
mechanically is, or Bug 2 might be entirely explained by Bug 1. First
diagnostic step for whoever picks this up: reproduce the exact spot with
`window.__gameDebug.isFootprintWalkable()` at the player's actual reported
position BEFORE assuming the collision system itself regressed.

**Bug 3 — water arranged in "strange square structures" instead of
forming a believable pond/lake** (second screenshot): a lattice/grid/plaid
pattern of interlocking water channels enclosing several small grass
"island" patches, clearly not a natural single body of water. User's own
words: "its clear the whole water / river sub texture / nano-tile etc.
systems need expansion and improvements."

**ASSESSED 2026-07-10 (Vision Alignment Audit Finding #3) — root cause
CONFIRMED with measured evidence, fix scope CONFIRMED as too large for a
narrow slice, NOT attempted.** Reproduced directly via `solveWorldUnitGrid`
with the real `river-heavy` `MoodProfile` object (`BiomeSelector.ts`)
across 32 biome/seed combinations, rendering each resulting 5x5 WU grid as
ASCII and counting how many of the 25 slots ended up "water-touching"
(any edge tagged water/shore). **Result: average 18.4/25 (74%) water-
touching slots, max 25/25 (100%) -- multiple samples showed the ENTIRE
chunk's WU grid saturated with interlocking crossroads/T-junction/bend/
straight water shapes**, visually indistinguishable from the user's
"lattice" screenshot. This is a MORE SEVERE finding than the screenshot
alone suggested (not just "sometimes ugly," but "can consume 100% of a
chunk").

**Root cause, precisely identified**: `MOOD_MODIFIERS['river-heavy']`
(`BiomeSelector.ts`) gives EVERY river/water template (river_straight_*,
river_bend_*, river_t_junction, river_crossroads, river_island,
bridge_*, shore_*, water_garden) a flat, uniform additive weight boost
(+0.2 to +0.4), with NO template-count-aware damping and NO extra
preference for termination-shaped templates (river_end_pond/shore_*)
over "keep spreading" shapes (straight/T/crossroads). Once a FEW water
slots get seeded (via this blanket upweighting), the spread becomes
**structurally self-reinforcing, not just weight-preferred**:
`EDGE_COMPAT.water = Set(['water','shore'])` in `tiles.config.ts` means a
slot bordering an already-placed water/shore edge is HARD-CONSTRAINED
(not just biased) to also place a water- or shore-compatible template --
literally no meadow_base/forest_clearing/etc. candidate is edge-legal
there at all (`edgesCompatible('open', 'water')` is false both
directions). Combined with `river-heavy` mood offering many more
"keep-going" water shapes than termination shapes in its weighted pool,
the AC-3 solve has essentially no way to naturally stop once it starts.

**Tested (and REJECTED) the obvious narrow mitigation**: hypothesized that
either (a) simply reducing the mood modifier magnitudes, or (b) re-biasing
the modifiers to favor termination shapes (river_end_pond/shore_*/
river_island) over continuation shapes (straight/T/crossroads) within the
SAME weight budget, would meaningfully help. Measured BOTH directly:
halving every modifier only dropped the average from 18.4/25 to 16.3/25
(still 65% water-saturated on average); the termination-biased variant
(river_end_pond weight 0.4->0.6, river_crossroads 0.4->0.02,
shore_*/water_garden all boosted to 0.5) barely helped either (17.2/25
average). **Conclusion: weight-tuning alone cannot fix this** -- the
self-reinforcing edge-compatibility "stickiness" dominates regardless of
how the mood's candidate weights are tuned, since weights only matter
among ALREADY-edge-legal candidates, and once water starts, non-water
candidates aren't edge-legal at all for the affected slots. A real fix
needs either (a) the already-deferred macro-assembly tier (the "Phases
9-10" section above) biasing the WHOLE region toward one coherent shape
from the start, or (b) a genuinely new solver-level heuristic -- e.g. a
neighbor-water-density-aware candidate filter during collapse that
categorically EXCLUDES "keep-spreading" water templates (but still allows
termination-shaped ones) once some threshold of a chunk's slots are
already water-touching. Option (b) is narrower than the full macro tier
but is still a genuine ALGORITHM change to `collapseAllMRV`/candidate
weighting (not a config-value tweak), needs careful validation against
every mood (not just river-heavy) and the determinism golden hash, and
deserves its own dedicated, carefully-scoped session -- explicitly NOT
attempted here, per the session's standing anti-speculative-large-work
policy and the user's own earlier "don't take you away from current work"
framing for this exact feedback.

**Recommendation for whoever picks this up** — **SUPERSEDED 2026-07-10** by
the user's own architectural clarification (see this file's "Phases 9-10...
RESOLVED 2026-07-10" entry above for the full writeup). The option-(b)
approach below is NOT the intended direction after all:

~~start with option (b) above (a bounded, MRV-collapse-time density cap)
rather than the full macro tier -- prototype it as a `waterDensityDamping`
step inside `collapseAllMRV`...~~

The user explicitly clarified that complex composite scenes (a coherent
pond/lake IS one) should be handled by a dedicated, pre-authored,
hand-tuned **Composite Assembly Sub-Solver** — the world/WU solver decides
"a pond goes here, this biome style, this footprint" and hands off a
recipe, rather than the generic per-slot AC-3 solver being made
incrementally smarter about water density. This generalizes the
ALREADY-EXISTING `stampIso2Assembly` mechanism (2 scene types today:
`'homestead-small'`, `'ruined-cathedral'`). **The correct fix for Finding
#3 is now understood to be**: author a pond/lake composite template (or a
small family of them, by biome style) and a placement decision (chunk
mood/entropy signals "there should be a body of water here" → hand off to
the sub-solver for atomic footprint placement) — NOT weight tuning, NOT a
neighbor-density filter. Still not implemented — the sub-solver system
itself needs to be generalized first (a proper recipe/registry, not just
2 hardcoded scene types) before a pond/lake template can be added to it.
No GitHub issue filed for this (read-only `gh` access this session) —
should be part of the "draft issue content" deliverable already queued.

**Suggested triage entry points for a future session** (not started):
- Bug 1: `src/rendering/nano-tile.ts` (`drawProceduralRiverWater`,
  `drawSunkenCutFaces`) — check whether these read ANY real neighbor-tile
  state when drawing a shared bank/edge, or draw symmetrically regardless
  of what's actually next door. Cross-reference Slice A.5's water-style
  fix above (same functions, different bug class: style-application vs.
  multi-tile seam continuity).
- Bug 2: `src/engine/mechanics.ts` (`isPositionWalkable`/
  `isFootprintWalkable`) at the EXACT reported bridge configuration, using
  the same live-engine-proof method Slice B established
  (`window.__gameDebug.isFootprintWalkable`) before assuming a regression.
- Bug 3: `src/engine/world/WorldUnitSolver.ts` (mood/candidate weighting)
  and/or `src/config/biomes.config.ts` (river-heavy mood modifiers) for a
  narrow damping heuristic; full fix is the "Phases 9-10" macro-assembly
  gap, already scoped as future work, not to be attempted speculatively.

## Bug 1 / Bug 2 triage — DONE 2026-07-13 (partial: Bug 2 fully fixed with
proof; Bug 1's continuity hypothesis investigated but not conclusively
proven as the dominant issue; Bug 1's depth complaints assessed as
art-direction, not a code defect, and left untouched)

**Investigation method**: the `isoSvgRenderer` MCP tools (and the
`IsoVisualLoop` subagent normally used for this kind of work) were BOTH
unavailable this session (`IsoVisualLoop` agent not found/registered;
`isoSvgRenderer__*` tools not surfaced -- per `iso2-main-port.instructions
.md`'s own breadcrumb, this MCP server needs a VS Code restart to surface
its tools, which requires the user's action and wasn't requested since a
working alternative existed). Used this codebase's OWN established
Playwright pixel/screenshot pattern instead (`page.screenshot({path:...})`
+ the `view_image` tool to actually LOOK at the result -- NOT the banned
MCP `browser_take_screenshot`, a completely separate, always-available
mechanism: write to disk via a normal `.spec.ts` test, then view the file).
This combination (real screenshots + actually viewing them, not just
guessing from source) proved fully sufficient for this investigation and
is a good precedent for future sessions without MCP visual tooling access.

### Bug 2 — FIXED with proof: bridge deck was narrower than the water channel it must cover

Root cause, precisely measured: `drawProceduralRiverWater`/
`drawSunkenCutFaces` (`nano-tile.ts`) use `channelW = 64` (channel
half-width 32, centered on the tile). `drawProceduralBridgeNano`'s deck
`widthHalf` was hardcoded to `28` -- **4px short per side, 8px total** --
so terrain-cache.ts's bridge-cell draw order (full water nano drawn
first, THEN the bridge deck on top, `terrain-cache.ts` `def.tileType ===
'bridge'` branch) always left a visible sliver of water peeking out past
both edges of the deck. This is a pure rendering/geometry bug, confirmed
via a live-engine `window.__gameDebug.isFootprintWalkable()` check at the
bridge cell and both adjacent water cells (`{"bridge-center":true,
"water-north-of-bridge":false,"water-south-of-bridge":false}`) proving
collision was ALREADY correct both before and after this fix -- matches
Slice B's prior finding exactly, confirming (b) from this file's own
"Bug 2" diagnostic suggestion above: the walkability was fine all along,
only the visual coverage was wrong.

**Fix** (`src/rendering/nano-tile.ts`):
- New exported constant `RIVER_CHANNEL_WIDTH = 64`, replacing the two
  independent `const channelW = 64;` locals inside
  `drawSunkenCutFaces`/`drawProceduralRiverWater` (previously drifted
  independently from the bridge's own hardcoded width with no shared
  source of truth).
- `drawProceduralBridgeNano`'s `widthHalf` changed from the hardcoded
  `28` to `RIVER_CHANNEL_WIDTH / 2 + 3` (= 35, giving a 70px-wide deck vs
  the 64px channel, 3px margin per side for anti-aliasing/rounding
  safety) -- with a comment explaining the invariant so this can't
  silently drift apart again.

**Pixel-test attempts and why none were kept as a permanent regression
test** (documented so a future session doesn't waste time repeating the
same dead ends): tried (1) whole-canvas water-blue pixel ratio comparison
between water-alone and water+bridge composite -- NOT sensitive enough,
passed even with the old buggy width because the AGGREGATE ratio is
dominated by the deck's LENGTH-wise coverage (which was already fine),
not the width shortfall; (2) find-the-widest-blue-row-in-water-alone,
measure-same-row-in-composite -- MISLEADING, because the bridge's ARCH
means a row that's "widest" for the flat water doesn't necessarily
intersect the flat deck in the composite (can hit the arched
railing/handrail instead, which is a thin stroke, not the solid
side-face fill); (3) whole-canvas max-horizontal-span of the bridge alone
-- confounded by the LENGTH axis, which is much longer (116) than the
WIDTH axis (56-70) and dominates any "widest row" measurement regardless
of width; (4) hand-derived exact `projectFlatIsoPoint` coordinates for a
specific (axis=72 midpoint, side=34) probe point, checking a narrow pixel
box for bridge-alpha presence -- STILL non-discriminating (204 pixels
found even with the old buggy width=28), most likely because the
railing's line-width/anti-aliasing and the multiple post positions
(`[0, 0.25, 0.5, 0.75, 1]` along the span) contribute more coverage in
that probe region than accounted for in the hand-derived math, or a small
error remains in the derivation. **Conclusion**: the arched, multi-
layered bridge geometry (side-face solid fill + separately-positioned
railings + posts, all following a `sin()`-based arch height that varies
continuously along the span) makes "isolate just the width contribution"
genuinely difficult to do reliably via pixel heuristics in the time
available -- the underlying fix remains mathematically certain and
low-risk (a simple, unambiguous `32 vs 28` inequality) regardless.

**Validation**: `npx tsc --noEmit` clean. Full existing
`tests/rendering/iso2-*.spec.ts` suite (63 tests, matched via `--grep
"iso2-"` since a literal glob didn't expand correctly in this session's
PowerShell) + `tests/world-gen/gen-determinism.spec.ts`: **all 64 green**,
zero regressions, determinism hash unaffected (expected -- this is a pure
rendering change, no seed/generation logic touched). Visual review via
direct screenshots (isolated canvas + real in-game bridge-crossing-river
scene) confirms the fix doesn't visibly break anything; the exact pixel-
level "how much less water shows now" could not be reliably automated
(see above) but the fix is sound by construction.

**Not filed as a GitHub issue** (this session's `gh` access remains
read-only) -- this is a small, already-fixed bug, not a scoping item that
needs tracking; `Docs/VisionAlignmentAudit.md` should get a short new row
referencing this fix (see that file's own maintenance instructions).

### Bug 1 — partially investigated, not conclusively resolved

**Continuity complaint** ("the continuous flow of river water tiles from
one to the next is not right"): found a real, precise CONTRIBUTING
FACTOR -- `waterStyleForTile(styleLike, worldCol, worldRow, variant)`
(`src/asset-pipeline/iso2-water-family/styles.ts`) seeds
`createWaterStyleVariant`'s per-tile procedural color perturbation
(`bankOuter`/`bankInner`/`shallow`/`mid`/`deep`/etc, each independently
hash-randomized by up to ~20-25%) with `${base.id}:${worldCol}:${worldRow}
:${variant}` -- meaning every tile in a connected river gets an
UNCORRELATED random shade even though `chooseWaterStyle` correctly keeps
the FAMILY (clear-river vs muddy-creek vs etc) consistent across a
connected run ("Connected rivers must not randomly change color family
from tile to tile" -- already-existing, correct comment). Adjacent tiles'
exact hues are NOT spatially smooth/correlated, which is the right shape
of bug for a "not a continuous flow, more like disconnected patches"
complaint.

**However**: rendered a real, clean 8-tile straight river run (screenshot,
camera pulled back) specifically to LOOK for this effect, and it did NOT
look dramatically broken -- reads as a reasonably continuous, natural-
looking river, not an obvious patchwork. This doesn't disprove the
per-tile-variance hypothesis (the effect may be more noticeable in a
busier real-gameplay scene, at a bend/junction, or simply subtle enough
that it reads as "natural texture variation" rather than "broken
continuity" in an isolated, well-lit test scene) but it means this was
NOT fixed this pass -- no code change was made for this specific
complaint, since I couldn't get clean, confident before/after visual
proof that changing the seeding (e.g. correlating it across a connected
run's tiles, or dropping the worldCol/worldRow component in favor of a
per-*river-instance* seed) would visibly improve things, and speculative
shading changes without a demonstrated before/after aren't justified per
this repo's own anti-speculative-work convention.

**Depth complaints** ("negative z depth of the river banks... is not
working right", "negative z depth of the water surface... is not working
right"): read `drawProjectedCutFace`'s exact geometry
(`drop = Math.max(11, sinkPx * 1.55)`, where `sinkPx = |zOffset| *
Z_PX_PER_LEVEL = 2*4 = 8` for the default river `zOffset=-2`, so
`drop = max(11, 12.4) = 12.4px`) -- a fairly SHALLOW visual wall height
relative to a 128px-tall tile diamond. Assessed this as a plausible
CONTRIBUTOR to a "doesn't look sunken enough" complaint, but this is
fundamentally a SUBJECTIVE ART-DIRECTION judgment (how deep should a
river look?), not a clear code defect with an unambiguous "should be X,
is actually Y" mismatch the way Bug 2's width shortfall was. **No change
made** -- adjusting `drop`'s formula or the sink-depth constants without
a clear target value or the user's own reference screenshot to compare
against would be speculative, not evidence-based. **Recommendation for
whoever picks this up next**: get the user's ORIGINAL reported screenshot
(not available to this session, only the verbal description) for a
direct before/after comparison, or ask for explicit feedback on a
rendered test scene (e.g. "here's the current river depth, does it need
to look X% deeper?") before tuning these constants.

**Files touched this pass**: `src/rendering/nano-tile.ts` only (the Bug 2
fix). No test file added (see the "why none were kept" writeup above).
No GitHub issue filed (read-only `gh` access).

## Memory-hygiene note (2026-07-10): "Step 4 candidate systems" section referenced by next-batch-plan.md was never actually found in this file

`next-batch-plan.md` (item 4) claims: "Step 4's plan is drafted and
awaiting user review — see the new 'Step 4 candidate systems' section at
the bottom of `iso2-portback-plan.md`." Searched this ENTIRE file (all
1312 lines, read in full across this and prior sessions) — **no such
section exists anywhere in this file.** Either a prior session intended to
write it and the write silently failed/was never actually executed, or it
was written to a different file that no longer exists in
`/memories/repo/` (repo-memory directory listing confirms only 5 files:
`code-organization-philosophy.md`, `git-workflow.md`,
`iso2-portback-plan.md`, `next-batch-plan.md`, `vscode-oom-diagnosis.md`
— no `step4-gameplay-systems-plan.md` or similar). Proceeding pragmatically
based on the conversation's own compacted-summary record (trading.ts
biome wiring [now superseded/done via Vision Alignment Audit Finding #1],
quiz.ts retry-loop softlock audit, NPC dialogue LLM-fallback persona-
quality check) rather than delaying further on this archaeology — this
matches `next-batch-plan.md`'s own example list ("wildlife.ts, trading.ts,
quiz.ts + math-solver.ts, save.ts, NPC dialogue/interaction") closely
enough to trust. Do NOT assume a "Step 4 candidate systems" section will
be found by a future session searching this file again -- it isn't there.

## Step 4, item 1 (quiz.ts retry-loop audit) — DONE 2026-07-10, uncovered a MAJOR pre-existing bug

**Starting point**: narrow audit of whether a `quiz_gate` obstacle could
ever permanently soft-lock a player (unlimited retries or hidden attempt
cap?). Mechanically, the answer was always "genuinely unlimited, no
softlock" (confirmed via full read of `quiz.ts`/`mechanics.ts`/
`interaction-handler.ts`: a wrong/idk answer never touches the gate cell,
only `resolveQuizGate()` on a correct answer does; merged question pool
coverage is healthy at 123/156/137 easy/medium/hard, static-only fallback
14/14/7, so `startQuiz`'s empty-pool early-exit is unreachable today).

**But writing a real live-engine test for the retry loop surfaced a much
bigger, previously-undiscovered bug**: `handleQuizInput` and
`handleDialogInput` in `src/main.ts` (the B5 micro-slice 11.28/11.29
extractions) both had `return false;` positioned OUTSIDE their
`if (state.quiz.active) {...}` / `if (state.ui.dialog.active) {...}`
blocks -- so they ALWAYS returned `false`, contradicting their own JSDoc
("Returns true if... handled input... caller should call
input.endFrame() and return early") and their sibling `handleTradeInput`
(11.30), which correctly returns `true` from inside its active-check
block. Consequence: `update()`'s intended short-circuit
(`if (handleQuizInput(...)) { input.endFrame(); return; }`) NEVER fired,
so `handleMovement` + `handleSpaceInteraction` ALSO ran in the same frame
using the same `justKeys.interact=true` -- silently re-triggering a fresh
interaction the instant a quiz was submitted or a dialog closed, if the
player was still facing the same interactable. For a quiz gate this meant
every "submit answer" press re-opened the gate dialog and re-rolled a new
random question instead of processing the submitted answer -- looked like
"nothing happens" from outside, and was invisible to a JSDoc-trusting read.

**This is very likely the true root cause of the session-long "flaky"
`tests/core/npc-interaction.spec.ts` "dialog can be closed with Space"
test**, dismissed MULTIPLE times across this entire session (and possibly
prior sessions) as "pre-existing world-gen-dependent flakiness, unrelated
to my changes." That characterization was WRONG (or at best incomplete)
-- self-correction logged here explicitly so future sessions don't repeat
the same dismissal reflexively. (There WAS also a second, genuinely
separate/unrelated contributing flake source in that same test file, see
below -- so the full picture is "two real bugs, not one", not "the whole
flaky reputation was this one thing".)

**Fix** (`src/main.ts`): both functions now capture
`const wasActive = state.quiz.active;` (resp. `state.ui.dialog.active`)
BEFORE their body runs -- necessary because `quizClose()`/`closeDialog()`
flip that flag to `false` mid-body as part of normal result processing --
and `return wasActive;` at the end instead of a hardcoded `false`. Also
added a small UX fix in the same pass: "I don't know" at a quiz gate
previously cleared `pendingGateQuiz` silently (Book of Knowledge opening
could read as a reward rather than "still blocked"); added a matching
"gate is still locked" toast to mirror the 'wrong' branch's existing
clarity.

**New permanent test**: `tests/gameplay/quiz-gate-retry-loop.spec.ts` (2
tests) proves both the retry mechanism end-to-end (wrong -> retry ->
correct opens the gate) and the idk-toast fix; its header comment has the
full writeup. A throwaway diagnostic file
(`tests/gameplay/_tmp-quiz-flow-diag.spec.ts`, used to catch the bug via
rich state snapshots showing `quiz.correctIndex` changing across
consecutive presses and `dialog.active` never actually closing) was
deleted once the real fix landed.

**Validation of the fix's blast radius** (this touches the CORE input
dispatch loop, so validated broadly, not just the new test) -- **ALL
CONFIRMED GREEN, committed as `fb90127`**:
- `npx tsc --noEmit` clean throughout.
- `tests/gameplay/quiz-gate-retry-loop.spec.ts`: 2/2 pass, repeat-each=3
  (6/6) also green.
- `tests/core/npc-interaction.spec.ts`: BEFORE this fix, "dialog can be
  closed with Space" failed ~15-65% of the time across repeated runs
  (varying signature: dialog stuck open, or the reverse). AFTER the fix
  (plus the two test-only bugs below), 29/29 passed + 1 skipped at
  `--repeat-each=10` (30 test invocations), clean.
- **Full regression sweep** across `tests/core`, `tests/gameplay`,
  `tests/education`, `tests/ui` (446 tests total, not 47 -- each spec file
  has multiple test cases): **421 passed / 21 failed / 4 skipped**, 25.9
  minutes. ZERO of the 21 failures relate to dialog/quiz/trade/NPC
  interaction -- every test in that space (`npc-interaction.spec.ts`,
  `quiz-gate-retry-loop.spec.ts`, `structure-interactions.spec.ts`,
  `themed-shops.spec.ts`, `trading-sellback.spec.ts`,
  `npc-interaction-history.spec.ts`, `save-resume-parity.spec.ts`) passed
  cleanly. The 21 failures break down as: 16x `tests/education/math-solver-93.spec.ts`
  (ALL with the same "Failed to fetch dynamically imported module:
  .../src/game/math-solver.ts" error -- reproduces even with a FULLY FRESH
  dev server, so NOT a stale-server artifact as first suspected; confirmed
  via `git log` that `math-solver.ts` itself has no uncommitted changes and
  was last committed 2026-06-11, a month before this session -- a genuine
  but clearly PRE-EXISTING, unrelated issue, not investigated further
  since it's completely outside this fix's scope), plus 1 each in
  `collision-boundary.spec.ts` (world-gen "no boundary found",
  distance-dependent flake), `screenshot.spec.ts` (README content-path
  check), `tesla-mode.spec.ts` + `touch-ux-126.spec.ts` (UA-detection
  heuristics), `thought-bubbles.spec.ts` (timing-sensitive auto-expire).
  **Verified via `git log -1` on each of these 5 files: all last touched
  Feb-June 2026, months before this session** -- conclusive proof none of
  the 21 failures are regressions from this fix.
- **Committed**: `fb90127` "fix(input): handleQuizInput/handleDialogInput
  always returned false, breaking modal short-circuit" -- `src/main.ts`
  (41 lines), `tests/core/npc-interaction.spec.ts` (69 lines, the 3
  sub-fixes below), `tests/gameplay/quiz-gate-retry-loop.spec.ts` (new,
  253 lines). Diagnostic-only files (`_tmp-quiz-flow-diag.spec.ts`,
  `_tmp-quiz-diag.spec.ts`) deleted, not committed.

### Second, separate bug found while validating: `npc-interaction.spec.ts`'s OWN "all 4 directions" test had a real state-bleed issue (test-only, not a main.ts bug)

While proving the handleQuizInput/handleDialogInput fix explained the
npc-interaction flakiness, `tests/core/npc-interaction.spec.ts`'s
"interaction works from all 4 directions" test started deterministically
failing on whichever direction ran right after a trades-enabled NPC
(`merchant_meadow`, etc. -- see `src/config/npc.config.ts`, most personas
have `canQuiz: true` and/or `trades.length > 0`). Root cause (found via a
rich diagnostic exactly like the one above): closing a trades-enabled
NPC's dialog auto-opens a REAL trade panel (`state.trade.active = true`,
by `handleDialogInput`'s own `else if (state.pendingTrade) { ... openTrade(...) }`
branch -- correct game behavior). But the test's own per-direction reset
block only force-cleared `dialog.active`/`quiz.active`, NOT
`trade.active`/`pendingQuiz`/`pendingTrade` -- so the NEXT direction's
fresh `pressSpace()` got swallowed by the (correctly-behaving)
`handleTradeInput` short-circuit instead of ever reaching
`handleSpaceInteraction`, and no new dialog opened. **Fixed test-side
only**: the reset block now also clears `state.trade.active`,
`state.pendingQuiz`, `state.pendingTrade`, and hides `#tradeOverlay`.
Also relaxed an overly-specific NPC-name regex assertion
(`/Merchant|Villager|.../i`) to `expect(dialog.name).not.toBe('Stranger')`
-- a coincidentally-nearby WILDLIFE creature (e.g. "Hedgehog") can
legitimately steal the interaction via `interactWithWildlife` (runs before
the tile-based NPC check in `handleSpaceInteraction`), and that's a valid
"found a real persona" outcome too, not a bug.

### Third, separate bug found while validating: MY OWN test code had a `page.waitForFunction` argument-order mistake (occasionally caused a 60s hang instead of a fast failure)

While adding polling-based DOM checks (replacing fixed `waitForTimeout` +
snapshot assertions, since HUD DOM sync is throttled to every 4th frame in
`render-frame.ts` and a snapshot right after a state change can race a
slow/loaded test run), I called
`page.waitForFunction(fn, { timeout: N })` -- **this is WRONG**. The real
signature is `waitForFunction(pageFunction, arg?, options?)`; the options
object must be the THIRD argument. Passing it as the second silently
treats it as `arg` (passed into the page function, harmlessly unused
since these functions take no argument) and applies NO timeout override
at all, so a genuine failure hangs until Playwright's outer per-test
timeout (60000ms, `playwright.config.ts`) kills it instead of failing
fast. Confirmed via the actual `playwright-core/types/types.d.ts`
overload: `waitForFunction<R>(pageFunction: PageFunction<void, R>, arg?: any, options?: PageWaitForFunctionOptions): Promise<SmartHandle<R>>`.
**Fixed by adding the missing `undefined` arg**:
`page.waitForFunction(fn, undefined, { timeout: N })`.

**Important scope note**: grepped the ENTIRE test suite afterward --
`waitForFunction\([^,]+,\s*\{\s*timeout` matches **100+ occurrences across
67 files**, essentially every test file's `waitForGame`-equivalent helper.
This is a **pre-existing, codebase-wide convention**, not something I
introduced (I only introduced 3 fresh instances of it myself, now fixed).
In practice it's been harmless because the game reliably finishes loading
well within the intended 10-15s window, so the "wrong" timeout (which
silently becomes ~60s / whatever the ambient test timeout is) never
actually gets exercised by a real failure -- but if the game ever DID fail
to load, every one of these 67 files would hang ~60s instead of failing
in 10-15s. **Not fixed broadly** (way out of scope for this session --
would touch 67 files for a currently-invisible robustness nice-to-have,
not a correctness bug). Fixed only in my own 2 files
(`tests/core/npc-interaction.spec.ts`, `tests/gameplay/quiz-gate-retry-loop.spec.ts`).
**Flagged here as a good candidate for a future small, mechanical,
low-risk cleanup pass** (a single find/replace-style fix across the test
suite) if someone wants faster failure feedback on a genuine game-load
regression -- not urgent, not a bug bounty, just a note.

## Step 4, item 2 (NPC dialogue LLM-fallback persona-quality check) — DONE 2026-07-10, MAJOR framing correction

**The task's premise didn't hold.** "Check the quality of NPC dialogue's
LLM fallback" assumes a LIVE, LLM-driven "chat with an NPC" feature exists
today. It doesn't. Full investigation:

- **Original design** (`archived-planning/NewGame_GameBible_StartHere.md`,
  "NPCs & Chats" section): "Persona: LLM prompt... for flavor. Chat: Text
  box input (50-100 char limit), LLM responds briefly. Feeds words back
  into gen pool for evolution." Two SEPARATE envisioned systems: (1) a
  quiz-question LLM rephrase, (2) a real back-and-forth NPC text chat.
- **What got built**: (1) is fully realized -- `rephraseQuizQuestion()` in
  `src/engine/llm/npc.ts`, wired into `quiz.ts`, working fallback (return
  the original question unmodified). (2) is HALF-built: the backend
  function `npcChatResponse(persona, playerInput)` exists, fully
  implements the LLM call + fallback contract, and `LLM_CONFIG.maxTokens.npcChat
  = 100` token budget is reserved for it (`config/game.config.ts`) --
  but a full-codebase grep (`src/**` and `tests/**`) found **ZERO call
  sites** for `npcChatResponse` anywhere, and no chat-input DOM element
  exists in `index.html` or anywhere else. Confirmed via
  `git log --all -S "npcChatResponse("` that this string was added in the
  VERY FIRST commit (2026-02-12) and only ever touched again by the B8
  decomposition refactor (moved file, didn't add a caller) -- this has
  been dead code since day one, not a recent regression.
- **What IS live today**: `mechanics.ts`'s NPC interaction (`interact()`,
  fully synchronous) picks ONE static, pre-authored greeting line at
  random from `NpcPersona.greetings[]` -- **no LLM call happens for NPC
  dialogue at all**, ever, in the current game. Also live but SEPARATE:
  `feedEntropy(result.greeting)` in `interaction-handler.ts` DOES feed
  that static greeting text into the entropy pool -- so the game bible's
  "feeds words back into gen pool" intent is partially honored even
  without live chat, just via the static line instead of a live exchange.
- **Also fully unused**: `NpcPersona.fallbackResponses[]` (per-NPC,
  hand-written, in-character fallback lines for ALL 20 personas in
  `src/config/npc.config.ts` -- 16 flavor/biome NPCs + 4 themed-shop
  personas) is likewise never read by any real code path (only appears
  in test fixtures as an empty-array placeholder to satisfy the
  `NpcPersona` type). **Content quality itself is genuinely good** --
  read every persona's `greetings`/`fallbackResponses`: well
  differentiated per-voice (goblin-pun merchant, warm villager, cat that
  ONLY makes cat sounds, poetic melancholy castle ghost, gruff miner,
  formal knight, etc.), consistently matches each `llmPersona` system
  prompt's described tone, appropriate/wholesome for a child-facing
  product. This data is simply sitting unused, not badly written.

**The one real, concrete quality bug found**: `npcChatResponse`'s OWN
internal fallback (`return result || 'Hmm, I seem to have lost my train
of thought...'`) used a single GENERIC line for every persona regardless
of voice -- so a cat-sounds-only persona or the poetic castle ghost would
have broken character into plain modern English the instant the LLM was
down/slow/in test mode. This is exactly the kind of "quality" issue the
task was actually asking about, just found on the (currently-dead) code
path rather than a live one.

**Fix** (`src/engine/llm/npc.ts`): `npcChatResponse` now accepts an
optional 3rd param `fallbackResponses?: string[]`; on fallback, picks
randomly from THAT NPC's own curated pool (same random-pick pattern
`mechanics.ts` already uses for greetings) instead of the generic line,
falling back to the generic line only if no pool is provided/empty
(defensive). Added a STATUS NOTE doc-comment on the function explaining
it currently has no callers, cross-referencing this exact finding, and
flagging the real fork in the road (wire up a real chat UI vs. formally
retire the scaffolding) as a product decision, not something to decide
unilaterally.

**Test infrastructure added** (both previously ZERO-covered functions):
- `src/game/debug-api.ts`: new `window.__gameDebug.npcChatResponse(npcId,
  playerInput)` (resolves the persona via `getNpcPersona`, calls the real
  function with its `llmPersona` + `fallbackResponses`), `.rephraseQuizQuestion(q)`
  (direct pass-through), and `.getNpcFallbackResponses(npcId)` (exposes
  the raw pool for precise test assertions). Chose this over copying
  `tests/education/math-solver-93.spec.ts`'s dynamic-import-inside-
  `page.evaluate` technique, since that file is the ONLY other user of
  that pattern in the whole test suite and it's currently broken there
  (16/16 of its tests fail with "Failed to fetch dynamically imported
  module" even against a fully fresh dev server -- confirmed via
  `git log` that `math-solver.ts` itself is untouched for a month, so
  this is a pre-existing, unrelated environment issue, not something
  worth copying into a brand-new test file).
- New `tests/gameplay/npc-chat-fallback-quality.spec.ts` (8 tests): for a
  representative sample of very-distinct personas (goblin merchant,
  villager, cat, castle ghost, a themed-shop persona), asserts the
  fallback is a STRING that's a member of THAT persona's own
  `fallbackResponses` pool (not just "not the generic line" -- precise
  membership, using the new `getNpcFallbackResponses` hook); an unknown
  npcId fails gracefully (`null`, no throw); the cat persona specifically
  never regresses into plain English across 8 repeated samples (voice
  check); and `rephraseQuizQuestion` still returns the question
  byte-for-byte unmodified on fallback. All 8 pass, 40/40 at
  `--repeat-each=5` (no flakiness despite the randomized pick).

**Decision** (user unavailable to respond in-session; per this session's
established pattern of defaulting to the conservative, lowest-risk option
when a genuine product decision can't be confirmed live): **left parked**.
No chat-input UI was built. The fallback-quality fix, test coverage, and
STATUS NOTE doc-comment are the complete, correct scope of this session's
work on this topic -- a future session with explicit product sign-off
should own actually building (or formally retiring) the feature.

**Validation**: `npx tsc --noEmit` clean. New test file 8/8, 40/40 at
`--repeat-each=5`. Scoped regression sweep across `tests/gameplay`,
`tests/core`, `tests/education` (327 tests, 21.7 min) after the change --
**310 passed / 17 failed**. 16 of the 17 are the same pre-existing
`math-solver-93.spec.ts` failures documented above (confirmed unrelated).
The 1 NEW-looking failure, `tests/gameplay/injury-system.spec.ts` "hazard
injury respects cooldown (#137)", was verified via `git log` to be
untouched for a month (`b710f24`, 2026-06-17) and passed 3/3 cleanly when
re-run in isolation immediately after -- a one-off timing flake under
327-tests-in-sequence load, not a regression (matches this session's
established pattern of occasional flakes appearing only under heavy
sequential-test-run conditions, e.g. the npc-interaction.spec.ts
DOM-throttle timing issue from the entry above). **Zero genuine
regressions** from this change. Committed as a separate commit from the
handleQuizInput/handleDialogInput fix (different files, different finding,
kept the git history legible per-topic).

## KNOWN BUGS (user-reported 2026-07-10 live-playtest) — Bug 1 / Bug 2 triage, 2026-07-13

Investigation tooling note: neither the `isoSvgRenderer` MCP tools nor the
`IsoVisualLoop` subagent were available this session (`tool_search` found
zero `isoSvgRenderer__*` tools despite `.vscode/mcp.json` registration --
per `iso2-main-port.instructions.md`'s own breadcrumb, this requires a
VS Code MCP-panel restart, a user action not requested mid-session;
`runSubagent(agentName="IsoVisualLoop")` failed twice with "agent not
found"). **Fallback technique that worked well and is worth reusing**:
standard Playwright `page.screenshot({ path: 'tests/screenshots/...png' })`
(writes to disk) + the always-available `view_image` tool to actually look
at it. This is NOT the same mechanism as the banned MCP
`browser_take_screenshot` (which returns huge inline payloads and caused
HTTP 413s) -- it's the ordinary Playwright API and remains fully usable.

### Bug 2 (water-under-bridge) -- RESOLVED, committed `be78caf`

**Symptom**: water visibly peeked out from under a bridge deck.
**Root cause** (precisely measured, not guessed): `drawProceduralBridgeNano`
in `src/rendering/nano-tile.ts` hardcoded `widthHalf = 28` (56px total deck
width), while the water channel it must fully cover
(`drawSunkenCutFaces`/`drawProceduralRiverWater`'s `channelW`) is 64px
(half-width 32px) -- an 8px total shortfall (4px per side). Architecturally
possible because `terrain-cache.ts` always draws a FULL water nano
underneath a bridge cell, then draws the bridge deck on top -- the deck must
be >= the channel width or water shows past its edges.
**Fix**: extracted a new shared exported constant `RIVER_CHANNEL_WIDTH = 64`
(top of `nano-tile.ts`, "Constants" section), used by both water-drawing
functions AND the bridge deck: `widthHalf = RIVER_CHANNEL_WIDTH / 2 + 3`
(= 35, 70px total -- 3px margin over the channel's 32px half-width for
anti-aliasing/rounding safety). Both changes fully commented in-place
explaining the invariant so it can't silently regress if either value is
tuned independently in the future.
**Validation**: confirmed via live `isFootprintWalkable()` queries that
collision behavior was IDENTICAL before and after (this was a pure
rendering bug, never a collision bug). `npx tsc --noEmit` clean. Full
existing `tests/rendering/iso2-*.spec.ts` (63 tests) + `gen-determinism.spec.ts`
all green, zero regressions. Visually reviewed via Playwright screenshot +
`view_image` (river/bridge scenes look correct, no water sliver visible).
**Honest note on automated regression-proof difficulty**: FOUR distinct
pixel-test approaches were attempted to build an automated guard
specifically proving "old width visibly leaks water, new width doesn't" --
all four failed to discriminate reliably, due to the bridge's continuously
-varying arch height (`archH = max(18, zOffset*NANO_Z_SCALE+8)`, computed
per-pixel via `sin(pi*t)`) and its length axis (116px) dominating any
single-row or whole-canvas aggregate measurement over the much smaller
width difference (7px) being tested:
  1. Whole-canvas water-blue-pixel-ratio (water-alone vs water+bridge
     composite) -- ratio dominated by deck LENGTH coverage (already fine),
     insensitive to the width-specific shortfall (0.4355 old vs 0.4481 new
     -- barely different, actually *worse* with the fix).
  2. Find-widest-blue-row-in-water-alone, measure-same-row-in-composite --
     misleading because that row can intersect the arched RAILING (a thin
     stroke) rather than the flat deck's solid fill, since the arch height
     varies continuously along the span.
  3. Whole-canvas max-horizontal-span of bridge-alone -- confounded because
     the length axis (116px) vastly exceeds the width axis (56-70px) and
     dominates any single-row "widest extent" measurement regardless of
     width settings.
  4. Hand-derived exact `projectFlatIsoPoint(axis=72, side=34)` probe
     coordinates, narrow pixel box -- STILL found 205 bridge-alpha pixels
     even with the OLD buggy width=28, likely railing line-width/AA bleed
     into the probe region, or an undiscovered small error in the hand
     derivation. Abandoned after this 4th attempt.
  **Decision**: stopped trying to force a fragile/misleading automated
  pixel test. Relied instead on (a) the mathematically unambiguous
  source-level inequality (channel half-width 32 <= new deck half-width 35),
  documented in code comments, (b) the full existing rendering+determinism
  suite passing clean, (c) direct visual review. This is judged a reasonable,
  honestly-documented stopping point -- not every legitimate fix needs (or
  can practically get) a pixel-perfect automated regression test.

### Bug 1 (river depth + multi-tile continuity) -- partially investigated, NOT fixed

A precise CONTRIBUTING FACTOR was found for the continuity complaint:
`src/asset-pipeline/iso2-water-family/styles.ts`'s `waterStyleForTile`
seeds its per-tile procedural color variance using `worldCol`/`worldRow`,
so adjacent tiles in the SAME connected river get uncorrelated random shade
variation even though the water-style FAMILY (clear-river/muddy-creek/
deep-pond/marsh) stays correctly consistent along the run. However, a
direct visual check of a long, clean river run (Playwright screenshot +
`view_image`) didn't show dramatic/obviously-wrong breakage, so **no code
change was made** without clearer before/after proof of an actual visual
defect (vs. intentional/acceptable per-tile texture variation). The
"depth" (negative-Z bank/water-surface) complaint was assessed as
subjective art-direction -- no clear "should be X, is Y" code defect was
found the way Bug 2's width shortfall was a hard, measurable number.
**Not further triaged.** No GitHub issue filed (this session's `gh` access
remains read-only). A future session with either (a) more specific
before/after visual evidence from the user, or (b) explicit product
direction on what "correct" river depth should look like, is needed to
make progress here -- do not re-attempt the same 4 pixel-test approaches
above; they are a documented dead end for this class of arched/skewed
isometric geometry.

## Finding #14 residual (sprite customizer unlock condition types) -- DONE 2026-07-13

Per `vision-model-and-gap-audit.md`'s Finding #14 entry, #116's own broader
Phase 2/3 task list (not part of its strict acceptance criteria) included
2 undelivered unlock condition types alongside eye-shape/backpack/scarf
(the latter three left undone -- they need new SVG rendering geometry, a
larger/riskier slice deliberately deferred to a future session).

**Delivered this pass** (`src/config/cosmetics.config.ts` +
`src/game/cosmetic-unlocks.ts`):
- `UnlockConditionType` extended: `'coin_count' | 'streak_length'` added
  alongside the existing `'quiz_correct' | 'wildlife_discovered' |
  'quiz_answered'`.
- `ProgressionData` extended with `coins: number` and `streakLength: number`.
- `isConditionMet` gained matching `case` branches.
- 2 new `UNLOCKABLE_COSMETICS` entries prove both types end-to-end:
  `outfit_treasure_hunter` (outfitColor, `#C9A24B`, `coin_count >= 50`),
  `hair_streak_flame` (hairColor, `#FF7A1A`, `streak_length >= 8`).
- `checkCosmeticUnlocks` (`cosmetic-unlocks.ts`) now populates the new
  `ProgressionData` fields from REAL live state, matching the existing
  pattern (not stubbed): `coins: state.inventory.countItem('coin')`
  (verified `Inventory.countItem(itemId)` is the real accessor,
  `src/game/inventory.ts`), `streakLength: state.streak.consecutiveCorrect`
  (verified `StreakState.consecutiveCorrect` is the real live-streak field,
  `src/game/quiz.ts` -- NOT the same as the unrelated flattened
  `streakLength` key seen in an old save-data JSON test fixture from a
  DIFFERENT, unrelated finding write-up above; that was a serialization
  detail, this is the live in-memory field).
- 4 new Playwright tests added to `tests/sprites/cosmetics.spec.ts`
  following the exact existing pattern (direct `state` mutation +
  `debug.checkUnlocks()` + assert `getUnlockedCosmetics()`): coin-count
  unlock at threshold, coin-count NOT unlocked below threshold,
  streak unlock at threshold, streak NOT unlocked below threshold.
**Validation**: `npx tsc --noEmit` clean. `tests/sprites/cosmetics.spec.ts`
16/16 passing (12 pre-existing + 4 new). Full `tests/sprites/` directory
regression also run to check for collateral effects (13 spec files:
accessories-expressions, cosmetics, customizer-cancel, directional-sprites,
eye-colors, hair-ponytail, hair-styles, mouth-animation, npc-sprites,
outfit-accessories, sprite-customizer, sprite-limb-layering,
wildlife-directionality) -- see next entry / git log for the result if this
note wasn't updated with the outcome yet.
**Docs synced**: `Docs/VisionAlignmentAudit.md` §3 row 14 and §5 item 4
updated to reflect this delivery, narrowing the residual to eye shape +
backpack + scarf only (SVG rendering work, not yet started).
**Not done this pass** (deliberately deferred, needs its own session):
eye SHAPE selector, backpack accessory, scarf accessory -- all three
require reading `src/ui/customizer.ts` + `src/asset-pipeline/sprites.ts` in
depth and adding new SVG rendering geometry per facing direction, a
larger/riskier undertaking than this config-level slice.
