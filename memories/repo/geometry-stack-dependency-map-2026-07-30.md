> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# Geometry stack dependency map — ground-up validated research

| Field | Value |
|-------|--------|
| **Date** | 2026-07-30 |
| **Branch** | `experiment/isometric-2.0` |
| **Status** | Research complete; **Phases A–D implemented 2026-07-30** (see product-campaign-progress.md) |
| **Trigger** | Fence/wall walk feel fails WYSIWYG after thickness/shelf/invert patches; user correctly redirected work **below** walkability |
| **Binding laws** | Flat sim owns walk; Iso2 is paint only (`Docs/02`); FOV 128×64 locked; no FOV/nano thrash |

---

## 1. Verdict (one paragraph)

Walkability feel is the **symptom**, not the root. The product has **no single geometry primitive** for barriers. Paint draws fences as **thin centerline posts/rails** in projected source space; walls as **48px footprint rects** extruded in iso; collision invents a **separate shelf+rail AABB model** with independent thicknesses (64/80) and a second neighbor-connect policy. Variant inference is dual (`tile-variants` via `ASSET_DEFS.tileType` vs `bitmask` via raw `assetKey`). Residual nano walkability (`iso2/walkability` + `buildWalkableMap` in terrain-cache) still exists beside the real motor SSOT (`walkability-query`). Tuning `COLLISION_*` / `RAIL_SHELF_DEPTH` cannot produce “what you see is what you get” because collision is not derived from the draw primitives. **Fix order: geometry SSOT → one connection/variant path → collision consumes that SSOT → motor only if still broken.**

---

## 2. Layer map (bottom → top)

```
L0  Constants / coordinate frames
    ISO_MICRO_TILE_SIZE=144, ISO_DIAMOND 128×64, RENDER_CONFIG.tileWidth/Height
    LOCAL duplicates: nano-tile WALL_THICKNESS=MICRO/3, nano-roof same
    footprints: WALL_THICKNESS=48, FENCE_THICKNESS=18, COLLISION_FENCE=64, COLLISION_WALL=80
    WORLD_CONFIG.cellPixels=64 (orphaned label — not collision SSOT)

L1  Barrier primitive geometry (DRAW)
    Fence: drawProceduralFenceNano — centerline at centerCoord=72, line rails, postWidth~7
           projectFencePoint(x,y) → screen via (x-y)*ISO_X + (x+y)*ISO_Y
           Does NOT use FENCE_THICKNESS or wallBounds
    Wall:  drawExtrudedNano — wallBounds(variant) rects @ 48px from footprints
           via nano-tile-svgs → iso2-solver → footprints.wallBounds
    Roof:  nano-roof local WALL_THICKNESS again (third copy of 48)

L2  Connection + variant inference (DUAL)
    Paint:  tile-variants.inferTileVariant
            neighbor via ASSET_DEFS[assetKey].tileType + nanoConnectionFamily
            wall ↛ fence unless gate bridges; bare assetKey "fence" → tileType wooden_fence
    Coll:   walkability-query.resolvePaintVariant
            neighbor via assetsConnectForCollision(assetKey, assetKey)
            fence ↔ wall MIX connect; uses connectionsToBitmask + variantFromBitmask
    Note:   variantFromConnections ≈ variantFromBitmask for same 4 bools (OK)
            Connection *policy* and *key space* differ (NOT OK)

L3  Collision model (SIM — invented, not derived from L1)
    collision-profile: open | full | fence | wall (assetKey heuristics)
    walkability-query: hitsRailSlab (footprintBounds @ COLLISION_*) then onFreeShelf(0.38)
    iso2/walkability: residual nano path (pointHits* defaults) — NOT motor path
    terrain-cache: still wires buildWalkableMap (unused by motor)

L4  Stamp / gen walk flags
    cell.walkable + ASSET_DEFS.walkable + walkability-policy (tests/helpers only)
    PlaceCoherence seals gaps; homestead stamps assetKey 'fence'
    Coarse isWalkable = cell.walkable; sub-tile only for fence/wall profiles

L5  Motor / play
    play-kernel/motor → isFootprintWalkable → isPositionWalkable
    PLAYER collisionHalfW/H = 0.16 (must fit shelves if shelf model kept)
    Player DRAW: gridToScreen(px,py) — same projection family as fence points

L6  Presentation of player/sprite scale
    entityDisplayScale ≈ 1.0; sprite ~48px vs diamond 128 — visual bulk ≠ collision box
```

### Dependency edges that matter

| From | To | Edge type | Healthy? |
|------|-----|-----------|----------|
| `wallBounds` (footprints) | wall paint extrusion | shared rects | **Yes** (48px) |
| `wallBounds` / 48px | wall **collision** | should share | **No** — collision uses 80 + shelf |
| Fence paint centerline | fence collision | should share | **No** — collision never reads paint path |
| `FENCE_THICKNESS=18` | anything live | intended visual | **Orphan for collision**; paint ignores it too |
| `tile-variants` family | paint variant | live | Yes for render |
| `assetsConnectForCollision` | collision variant | live | Parallel, different rules |
| `iso2/walkability` | motor | residual | **No** — motor ignores it |
| `buildWalkableMap` in terrain-cache | play | residual | **No** — dead for locomotion |
| `gridToScreen` | player + tiles | shared formula | Yes for positions |
| Player sprite size | collision half | intentional decouple | Feel gap if bulk ≫ box |

---

## 3. Validated lower-layer errors (evidence)

Ordered by **depth** (fix first). Each item is code-backed, not a feel guess.

### E1 — No barrier geometry SSOT (root)

**What paint does**

- Fence (`nano-tile.ts` `drawProceduralFenceNano`): arms from `nano.connections` / `connectionsFromVariant`; rails/posts along **centerline** `centerCoord = WALL_THICKNESS * 1.5 = 72` in 144 source space; posts every 48px along span; rail is stroke width ~5–7 **screen** px. Zero use of `FENCE_THICKNESS` or `pointHitsFenceFootprint`.
- Wall (`drawExtrudedNano`): solid volume = `wallBounds(variant)` rectangles at **48** thickness (imported chain: nano-tile → nano-tile-svgs → iso2-solver → footprints).

**What collision does**

- `footprintBounds(variant, COLLISION_FENCE_THICKNESS=64)` or wall 80 — thick cross/L of axis-aligned rects in the same 144 space, then **shelf free bands** (`RAIL_SHELF_DEPTH=0.38`) that have **no paint counterpart**.
- Comment in `footprints.ts` says “Must stay in sync with wall geometry in nano-tile.ts” — only true for the **visual** `wallBounds` export; gameplay deliberately diverged.

**Why constant thrash fails**

- Thickening the rail makes SE “stop too soon” while shelves try to recover N/W “too far”; inverting corners swaps which tip fails. The free set is not the complement of drawn posts.

### E2 — Dual connection policy (variant can disagree at junctions)

| Policy | Location | Fence–wall mix | Key space |
|--------|----------|----------------|-----------|
| Paint | `tile-variants.familiesConnect` | **No** (unless gate) | `tileType` via ASSET_DEFS |
| Collision | `assetsConnectForCollision` | **Yes** | raw `assetKey` |

Homestead pure-fence ring often matches. Mixed seals (place-coherence wall plug next to fence), gates, and material variants can pick **different FeatureVariant** for the same cell → different arm layout → asymmetric feel even if thickness were perfect.

Also: paint `nanoConnectionFamily` has no bare `'fence'` / `'wall'` cases (relies on tileType `wooden_fence` / stone_wall*). Collision classifies bare `'fence'` / `'wall'` directly. Defaults usually work because ASSET_DEFS maps fence → wooden_fence, but the two graphs are not the same function.

### E3 — Dual walk stacks (law debt + agent confusion)

| Path | Used by motor? | Model |
|------|----------------|-------|
| `walkability-query` + `collision-profile` | **Yes** (play-kernel/walk) | cell.walkable + shelf/rail |
| `iso2/walkability` (`isPointWalkableInTile`, `buildWalkableMap`) | **No** | nano descriptors + defaults thickness |
| `terrain-cache` walkableMap bake | **No** for move | residual #223 wire |
| Stale comments in `nano-tile-defs` / tests | N/A | still claim mechanics uses getNanoStack for collision |

Product law (Docs/02 + play-stack design) says cell SSOT. Residual nano path and comments invite re-opening the wrong layer.

### E4 — Stale geometry documentation in paint itself

- `drawExtrudedNano` header still describes **128×128** tile space with strip y=40..88; live MICRO is **144**, strip y=48..96 at thickness 48. Comments and mental models lag code → agents “sync” to the wrong numbers.

### E5 — Orphan / misleading constants

| Constant | Claimed role | Reality |
|----------|--------------|---------|
| `FENCE_THICKNESS=18` | visual fence thickness | Paint ignores; collision defaults to 64 |
| `COLLISION_FENCE_CORNER_THICKNESS` | corner special | Deprecated alias of 64 |
| `WORLD_CONFIG.cellPixels=64` | logical cell px | Not used by walk query (frac grid units) |
| Local `WALL_THICKNESS` in nano-tile / nano-roof | same as footprints | Numeric twin, not import of SSOT |

### E6 — Player visual bulk vs collision box (upper layer, secondary)

- Collision: 0.16×0.16 half-extent (dense 3×3 samples).
- Draw: ~48px sprite on 128-wide diamond (~0.375 tile visual height).
- Even with perfect rail WYSIWYG, the avatar can **look** nested into posts while the box is still free (or vice versa). Fix **after** L0–L3, not by more rail thickness.

### E7 — Prior residual session defects (orthogonal but real)

From earlier research / playtests (not re-run this pass): quiz open, homestead leave, cottage stamp. Those are **stamp/progression** issues, not geometry primitives — keep them out of the geometry campaign unless they reappear after geometry SSOT.

---

## 4. What is already healthy (do not break)

1. **Projection identity:** `gridToScreen` and `projectFencePoint` / wall `isoX/isoY` share the same `(x−y)/(x+y)` family. Player feet and fence centerlines **can** align in one coordinate system if solids share definitions.
2. **Motor → walk query ownership:** single import path through play-kernel; no render imports in walkability-query.
3. **Wall paint uses footprints.wallBounds** for extrusion rects — the only clean shared primitive today.
4. **`variantFromConnections` ≡ `variantFromBitmask`** for the same four booleans (table-checked mentally; both encode 15 non-isolated masks).
5. **FOV / diamond sizes** locked and consistent across types + RENDER_CONFIG (128×64, micro 144).
6. **Place coherence + cell.walkable** for coarse open/block of full solids (water, cottage, locked gates).

---

## 5. Prioritized plan — what to address first

**Rule:** no further `COLLISION_*` / shelf / half-extent patches until Phase A–B land and a pen-corner proof exists.

### Phase A — Geometry primitive SSOT (lowest dependency) — **FIRST**

**Goal:** One module owns “where the barrier solid lives in micro-tile source space,” consumed by paint and sim.

| Step | Work | Acceptance |
|------|------|------------|
| A1 | Create `src/engine/iso2/barrier-geometry.ts` (or promote footprints to pure geometry only): **centerline** + **visual half-thickness** + **gameplay half-thickness** derived from same centerline; export `barrierSolidRects(kind, variant)` and `barrierCenterline(variant)` | Unit tests: center of straight-h = (0.5, 0.5); arm directions match variant table |
| A2 | Fence paint: drive posts/rails from `barrierCenterline` (stop inventing centerCoord from WALL_THICKNESS*1.5 ad hoc) | Visual pen still continuous; posts at shared centerline |
| A3 | Wall paint: keep using shared rects; delete local WALL_THICKNESS twins in nano-tile/nano-roof — import SSOT | tsc; wall regression screenshots unchanged within tolerance |
| A4 | Document coordinate frame once (144 source → 128×64 diamond); delete 128-space comments | Doc + types comment match |

**Do not** invent a second shelf model here. Solids are the complement of free space.

### Phase B — Single connection + variant path

| Step | Work | Acceptance |
|------|------|------------|
| B1 | One `assetsConnect(a,b)` / family function used by **both** paint and collision (decide product: fence–wall mix yes/no; gates bridge) | Same 4-bool connections for same neighborhood in a fixture chunk |
| B2 | Resolve via **one** of: always `ASSET_DEFS.tileType`, or always normalized assetKey family — not both | Homestead + mixed seal fixtures |
| B3 | Collision `resolvePaintVariant` calls the shared helper (delete policy fork) | `resolvePaintVariant` ≡ `inferTileVariant` on stamped cells |

### Phase C — Collision consumes geometry SSOT (not invent thickness)

| Step | Work | Acceptance |
|------|------|------------|
| C1 | `pointHits*` / rail free test = distance to centerline (or solid rects from A1) with **one** gameplay half-width chosen to match visual bulk (posts ~thin, walls ~48/144) | Approach distance from interior N/S/E/W of a square pen **symmetric within ~0.05 cell** |
| C2 | **Delete shelf model** (or reduce it to “open if not in solid”) — shelves were compensating for wrong solids | No `RAIL_SHELF_DEPTH` tuning loop |
| C3 | Keep full solids for water/cottage/locked gates; rail profile only for fence/wall families | Existing walkability-ssot + pen tests |
| C4 | Player half-extent only after C1–C2; size so body cannot tunnel thin rails | Playtest homestead fence ring |

### Phase D — Kill residual dual walk path (hygiene)

| Step | Work | Acceptance |
|------|------|------------|
| D1 | Mark `iso2/walkability` as non-product or rewire only to offline/tooling; remove motor/test confusion | Grep: motor never imports iso2/walkability |
| D2 | Stop terrain-cache from implying walkableMap is locomotion SSOT (delete or rename dead wire) | Comment + no dead imports |
| D3 | Fix stale nano-tile-defs “mechanics uses getNanoStack for collision” comment | Docs match cell SSOT |

### Phase E — Only then upper feel

| Step | Work |
|------|------|
| E1 | Player sprite anchor / scale vs collision box (if still “looks nested”) |
| E2 | Quiz open / homestead leave / cottage — **stamp/progression** track if still broken (separate PR stream) |
| E3 | Content/recipes — product default after session feel holds |

---

## 6. Explicit non-goals (this campaign)

- FOV change, entityDisplayScale campaigns, WorldUnitSolver thrash, new nano kinds.
- Greenfield engine rewrite or AmysGame as product replacement.
- More isolated patches to `COLLISION_FENCE_THICKNESS`, `RAIL_SHELF_DEPTH`, corner invert, or pocket fills without Phase A–B.
- Re-running place-coherence / critical-path PR plans as wholesale campaigns.

---

## 7. Proof bar for Phase A–C

1. **Unit:** shared centerline + solid rects for all FeatureVariants; paint and collision sample the same function.
2. **Deterministic play:** square fence pen 5×5 — approach from interior toward each of four sides and four corners; stop distance variance &lt; 0.05 cell; no walk-through mid-rail.
3. **Homestead:** human playtest spawn → walk fence interior → touch rails → leave via intended opening (not geometry thrash).
4. **Regression:** existing `walkability-ssot`, `play-stack-golden`, place-coherence stamps still pass (update expectations only when model intentionally changes).

---

## 8. File index (authoritative touch list)

| Layer | Files |
|-------|--------|
| L0/L1 geometry | `src/engine/iso2/footprints.ts`, **new** barrier-geometry (recommended), `src/rendering/nano-tile.ts`, `nano-roof.ts`, `nano-tile-svgs.ts` |
| L2 connect/variant | `src/rendering/tile-variants.ts`, `src/engine/collision-profile.ts`, `src/engine/iso2/bitmask.ts`, `src/engine/walkability-query.ts` |
| L3 collision | `walkability-query.ts`, `footprints.ts` (consume SSOT), retire shelf |
| Residual kill | `src/engine/iso2/walkability.ts`, `terrain-cache.ts` walkableMap, comments in `nano-tile-defs.ts` |
| Motor (last) | `src/game/play-kernel/motor.ts`, `src/config/game.config.ts` PLAYER_CONFIG |
| Stamps (separate) | `starter-homestead.ts`, PlaceCoherence, ObstacleSolver |

---

## 9. Honest assessment of recent work

The shelf+rail rewrite and thickness patches were **rational compensations** for E1, not malice — but they sit on L3 while E1/E2 remain false. Continuing at L3 without L0–L2 will fail again. This document is the gate: **implement Phase A first**, then B, then C.

---

## 10. Suggested next human decision

Pick one:

1. **Execute Phase A** (geometry SSOT module + fence paint consumption) as a focused PR — no collision constant changes in that PR.
2. **Design-doc formalization** of A–C via `/design` if you want PR DAG + acceptance checklists before code.
3. **Hold product collision as-is** and only ship stamp/quiz residual work until geometry PR is scheduled.

Recommended: **(1)** or **(2)**; do not resume thickness thrash.
