#!/usr/bin/env pwsh
# create-iso2-issues.ps1 — Creates fresh ISO 2.0 issue set from IsoRenderingPlanV2.1.md spec.
# Each issue has MCP-verifiable acceptance criteria. Run once. Idempotent: check before running again.
# Usage: pwsh scripts/create-iso2-issues.ps1
#
# IMPORTANT: "Iso 2.0 Verified Delivery" milestone (id=5) must exist before running.
# Milestone contract: every issue close requires a saved PNG in ProgressEvaluations/.

$milestone = 5  # "Iso 2.0 Verified Delivery"
$labels = "rendering,iso-2.0-experiment"
$repo = "putersdcat/EmilysGame"

function New-Issue($title, $body, $extraLabels = "") {
    $allLabels = if ($extraLabels) { "$labels,$extraLabels" } else { $labels }
    $tmpFile = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $tmpFile -Value $body -Encoding UTF8
    gh issue create --repo $repo --title $title --body-file $tmpFile --label $allLabels --milestone "Iso 2.0 Verified Delivery"
    Remove-Item $tmpFile
    Start-Sleep -Milliseconds 800
}

# ── EPIC ────────────────────────────────────────────────────────────────────
New-Issue "Iso 2.0 REBOOT: Verified Isometric Rendering Engine [EPIC]" @"
## Context
This is the clean-slate reboot of the ISO 2.0 isometric rendering experiment.
The prior issues (#194–#213) were closed without visual proof. All are invalid.

This epic tracks the full, spec-compliant delivery of the rendering engine as
defined in ``Docs/IsoRenderingPlanV2.1.md``.

## Sub-issues (close this epic last, after all subs are PNG-verified)
- [ ] Base biome tile rendering
- [ ] Positive-Z nano billboard rendering (fence, gate, tall-grass)
- [ ] Extruded 3D box nano rendering (stone-wall, cathedral-wall, homestead-wall)
- [ ] Negative-Z carve-out rendering (river, river-bank)
- [ ] Continuous feature chain solver
- [ ] Player occlusion (wall vs fence)
- [ ] Player sink effect (negative-Z feet offset)
- [ ] Shadow + rim lighting
- [ ] Gate + troll-bridge walkable/unlock logic
- [ ] Large multi-tile assemblies (homestead, cathedral)
- [ ] 60 FPS + chunk bake performance
- [ ] Final integration scene validation

## Closure rule
This epic is only closeable when every sub-issue has:
1. A PNG saved to ``experiment/isometric-2.0/ProgressEvaluations/`` committed to the branch.
2. A comment in the sub-issue linking the commit SHA and eval PNG filename.
"@ "epic,high-priority"

# ── 1. BASE BIOME TILES ─────────────────────────────────────────────────────
New-Issue "Iso 2.0 [1/12]: Base Biome Tile Rendering (128px → 256×128 diamond)" @"
## Spec reference
IsoRenderingPlanV2.1.md §Phase 2 — Tile rendering; §3.1 Base Tile

## Goal
All 6 base biome tile types render as proper 256×128 iso diamonds with correct
colors and no stretch artifacts:
- grass, dirt, rock, water, sand, dry-grass

## Technical requirements
- MicroTile SVG is 128×128.
- Rendered via flat iso projection: ``ctx.transform(1, 0.5, -1, 0.5, cx, topY)``
- Result diamond: 256px wide, 128px tall, clipped to diamond shape.
- Tile color palette must pass visual inspection vs spec §3.1 table.

## Acceptance criteria (ALL required to close)
- [ ] ``render_nano_scene`` with a 5×5 grid of each biome type produces a clean single-biome canvas (6 PNGs).
- [ ] Diamond edges are sharp (no sub-pixel bleed).
- [ ] Each PNG saved to ``ProgressEvaluations/biome-{name}-5x5.png`` and committed.
- [ ] Commit SHA referenced in issue comment.

## Verification command
``render_nano_scene entries=[{kind:"grass",col:0,row:0},...] width=512 height=400 outputPath=ProgressEvaluations/biome-grass-5x5.png``
Repeat for all 6 biomes.
"@ "high-priority"

# ── 2. POSITIVE-Z BILLBOARD ─────────────────────────────────────────────────
New-Issue "Iso 2.0 [2/12]: Positive-Z Nano Billboard Rendering (fence, gate, tall-grass)" @"
## Spec reference
IsoRenderingPlanV2.1.md §3.2 Positive-Z Nano; §Addendum A — Z-Pinned Shear

## Goal
Positive-Z nano tiles render as Z-pinned upright billboards aligned to the left
iso axis. The bottom edge follows the iso angle (0.5 shear), vertical edges stay
vertical. Coverage: fence, gate, troll-bridge, tall-grass.

## Technical requirements
Transform: ``ctx.translate(screenX, screenY+HALF_H); ctx.transform(1, 0.5, 0, 1, 0, 0);``
Drawing: ``ctx.drawImage(img, 0, -drawH, 128, drawH);``
drawH = zOffset × NANO_Z_SCALE (min 16px).

## Acceptance criteria (ALL required to close)
- [ ] ``render_nano_tile fence straight-h`` → horizontal fence correct posts+rails, upright, no distortion.
- [ ] ``render_nano_tile fence corner-tl`` → L-corner variant correct.
- [ ] ``render_nano_tile gate straight-h`` → gate graphic visible, correct z-height.
- [ ] ``render_nano_tile tall-grass`` → semi-transparent flat grass decal.
- [ ] All 16 variants of fence rendered as a strip PNG (``render_nano_scene`` 4×4 grid of variants).
- [ ] PNGs committed: ``ProgressEvaluations/nano-fence-all-variants.png``, ``nano-gate-h.png``, ``nano-tall-grass.png``.

## Verification command
``render_nano_tile kind=fence variant=straight-h outputPath=ProgressEvaluations/nano-fence-h.png``
``render_nano_tile kind=fence variant=corner-tl outputPath=ProgressEvaluations/nano-fence-corner-tl.png``
"@ "high-priority"

# ── 3. EXTRUDED 3D BOX ──────────────────────────────────────────────────────
New-Issue "Iso 2.0 [3/12]: Extruded 3D Box Nano Rendering (stone-wall, cathedral-wall, homestead-wall)" @"
## Spec reference
IsoRenderingPlanV2.1.md §3.3 Extruded Nano; §3.4.1 Stone Wall; §Addendum A §3

## Goal
Extruded nano tiles render as a 3-face isometric box:
1. End cap face (further from camera, darker)
2. Front face (closer to camera, full brightness)
3. Top cap (flat iso projection at elevated Y, showing footprint fill)

Correct orientation for H vs V wall:
- Horizontal (straight-h): front face matrix (1, 0.5), cap at right end
- Vertical (straight-v): front face matrix (-1, 0.5), cap at bottom end

## Technical requirements
- Geometry from ``wallBounds(variant)`` → wall footprint rects
- ``shouldDrawEndCap(variant)`` false for straight-h, straight-v, cross
- ``isVerticalWall(variant)`` controls matrix sign flip
- ``sideTextureSvg`` used for front + cap faces
- ``topTextureSvg`` uses clipDiamond at elevated screenY

## Acceptance criteria (ALL required to close)
- [ ] ``render_nano_tile stone-wall straight-h`` → H box: front face brickwork, right end cap, flat stone top. NO Z-pinned billboard fallback.
- [ ] ``render_nano_tile stone-wall straight-v`` → V box: correct face matrix, cap at different end.
- [ ] ``render_nano_tile stone-wall corner-tr`` → corner: both arms meet at correct angle, end caps only on open ends.
- [ ] ``render_nano_tile stone-wall cross`` → cross: no end caps (4-way join), 4 front face segments, full top.
- [ ] ``render_nano_tile cathedral-wall straight-h`` → cathedral palette (dark stone).
- [ ] ``render_nano_tile homestead-wall straight-h`` → homestead palette (timber/plaster).
- [ ] All PNGs committed to ProgressEvaluations/: ``nano-stonewall-{variant}.png`` for at least 8 variants.

## Verification command
``render_nano_tile kind=stone-wall variant=straight-h outputPath=ProgressEvaluations/nano-stonewall-straight-h.png``
``render_nano_tile kind=stone-wall variant=corner-tr outputPath=ProgressEvaluations/nano-stonewall-corner-tr.png``
``render_nano_tile kind=stone-wall variant=cross outputPath=ProgressEvaluations/nano-stonewall-cross.png``
"@ "high-priority"

# ── 4. NEGATIVE-Z CARVE-OUT ─────────────────────────────────────────────────
New-Issue "Iso 2.0 [4/12]: Negative-Z Carve-out Rendering (river, river-bank)" @"
## Spec reference
IsoRenderingPlanV2.1.md §3.5 Negative-Z Nano; §Addendum B §2

## Goal
Negative-Z nanos render as sunken depressed tiles — the tile surface appears
below the surrounding ground level. River water texture is visible at depth.
River-bank shows a transitional blended edge.

## Technical requirements
- Flat iso projection (same matrix as base tiles) shifted down by sinkPx = abs(zOffset) × Z_PX_PER_LEVEL.
- Entire render clipped to parent tile diamond (clipDiamond).
- blendEdges=true → four-sided inward gradient overlaid on tile edges.
- Sink amount: zOffset=-2 → 8px sink.

## Acceptance criteria (ALL required to close)
- [ ] ``render_nano_tile river straight-h`` → water texture visible, clearly below ground plane, edge blending on all 4 diamond sides.
- [ ] ``render_nano_tile river cross`` → 4-way river crossing, continuous water surface.
- [ ] ``render_nano_tile river-bank straight-h`` → transitional bank tile (partial water, partial land blend).
- [ ] In a mixed scene: river tiles sit visually lower than surrounding grass tiles.
- [ ] PNGs committed: ``ProgressEvaluations/nano-river-{variant}.png`` for at least 4 variants + ``scene-river-in-grass.png``.

## Verification command
``render_nano_tile kind=river variant=straight-h outputPath=ProgressEvaluations/nano-river-straight-h.png``
``render_nano_scene entries=[... grass terrain + river row ...] outputPath=ProgressEvaluations/scene-river-in-grass.png``
"@

# ── 5. CONTINUOUS CHAIN SOLVER ──────────────────────────────────────────────
New-Issue "Iso 2.0 [5/12]: Continuous Feature Chain Solver (variant selection by neighbors)" @"
## Spec reference
IsoRenderingPlanV2.1.md §4 Continuous Features; §5 Solver Pipeline; §Addendum C

## Goal
The solver inspects each feature tile's 4 neighbors and assigns the correct
FeatureVariant: straight-h/v, corner-tr/tl/br/bl, tee-t/r/b/l, cross, end-t/r/b/l, isolated.

Result: a fence perimeter has no gaps, no wrong corners, and correct end-caps.
A stone wall run has continuous brickwork with no disconnected posts.

## Technical requirements
- Neighbor bitmask: bit0=top, bit1=right, bit2=bottom, bit3=left
- 16 bitmask entries → FeatureVariant lookup table
- Solver runs AFTER world gen places tiles, BEFORE chunk bake
- ``solver.resolveVariants(chunk, kind)`` → mutates nano.variant in place

## Acceptance criteria (ALL required to close)
- [ ] 5-tile horizontal fence run → all 5 tiles are straight-h (not isolated).
- [ ] Fence L-corner → corner-br on the turn tile (verified visually: no gap).
- [ ] 3×3 fence perimeter (hollow square) → correct corners at all 4 corners, no isolated variants.
- [ ] Stone wall straight 7-tile run → all straight-h, continuous brickwork, no end-cap artifacts on mid tiles.
- [ ] River cross-shaped join → center tile is ``cross`` variant.
- [ ] PNGs committed: ``ProgressEvaluations/scene-fence-5tile-run.png``, ``scene-fence-3x3-perimeter.png``, ``scene-wall-7tile-run.png``, ``scene-river-cross.png``.

## Verification command
``render_nano_scene entries=[fence tiles forming 3x3 perimeter] outputPath=ProgressEvaluations/scene-fence-3x3-perimeter.png``
"@ "world-generation"

# ── 6. PLAYER OCCLUSION ─────────────────────────────────────────────────────
New-Issue "Iso 2.0 [6/12]: Player Occlusion — Wall Blocks, Fence See-Through Gaps" @"
## Spec reference
IsoRenderingPlanV2.1.md §6.2 Player Occlusion; §Addendum B §5

## Goal
The player sprite draw-order is correct relative to nano tiles:
- **Behind a stone wall**: player is fully hidden (wall is opaque solid geometry).
- **Behind a fence**: player is partially visible through fence rail gaps.
- **In front of both**: player draws on top correctly.

## Technical requirements
- Two-pass render: terrain + nanos first (sorted by row), then players.
- Player at same row as wall → player drawn BEFORE wall (wall occludes).
- Player at same row as fence → fence SVG has transparent gap areas → player visible.
- Sort key: ``sortY = (row + 0.5) * HALF_H * 2`` ensures fence drawn after player at same row − 1.

## Acceptance criteria (ALL required to close)
- [ ] ``render_nano_scene`` with player at ``behind`` position of stone-wall → player NOT visible.
- [ ] ``render_nano_scene`` with player at ``behind`` position of fence → player partially visible through gaps.
- [ ] ``render_nano_scene`` with player ``in front`` of both → player on top.
- [ ] PNGs committed: ``ProgressEvaluations/occlusion-wall-behind.png``, ``occlusion-fence-behind.png``, ``occlusion-front.png``.

## Verification command
``render_nano_tile kind=stone-wall variant=straight-h includePlayer=[behind] outputPath=ProgressEvaluations/occlusion-wall-behind.png``
``render_nano_tile kind=fence variant=straight-h includePlayer=[behind] outputPath=ProgressEvaluations/occlusion-fence-behind.png``
"@ "sprites"

# ── 7. PLAYER SINK EFFECT ───────────────────────────────────────────────────
New-Issue "Iso 2.0 [7/12]: Player Sink Effect (feet descend into negative-Z tiles)" @"
## Spec reference
IsoRenderingPlanV2.1.md §6.3 Sink Effect; §Addendum B §3

## Goal
When the player stands on a negative-Z tile (river, mud), their feet appear
to descend below the normal ground plane. Implemented by offsetting the player
sprite drawY by ``sinkDepthPx`` returned from drawNanoStack.

## Technical requirements
- ``drawNanoStack`` returns ``{ sinkDepthPx, allImagesLoaded }``.
- Player draw position: ``playerScreenY += sinkDepthPx``.
- sinkDepthPx = abs(zOffset) * Z_PX_PER_LEVEL for negative-Z tiles.
- No sink on positive or flat tiles.

## Acceptance criteria (ALL required to close)
- [ ] Player on river tile: feet visually lower than player on adjacent grass tile.
- [ ] Player on grass tile adjacent to river: feet at normal level.
- [ ] Sink amount visible in screenshot: at least 6px difference for zOffset=-2.
- [ ] PNGs committed: ``ProgressEvaluations/player-sink-river.png``, ``player-sink-grass.png``.

## Verification command
``render_nano_scene entries=[... grass row=0..4, river row=5 ...] players=[{col:3,row:5,label:SINK},{col:3,row:3,label:NORMAL}] outputPath=ProgressEvaluations/player-sink-comparison.png``
"@ "sprites"

# ── 8. SHADOW + RIM LIGHTING ────────────────────────────────────────────────
New-Issue "Iso 2.0 [8/12]: Shadow + Rim Lighting (sun angle, path-based shadows, face tinting)" @"
## Spec reference
IsoRenderingPlanV2.1.md §4 Advanced Rendering; §Addendum B §4 Lighting

## Goal
Two lighting effects:
1. **Shadow**: positive-Z nanos cast a small elliptical shadow on the ground plane
   offset by sun azimuth angle and altitude. ``drawNanoShadow(ctx, nano, sx, sy, sun)``.
2. **Rim lighting**: sun-facing faces of extruded nanos are lightened; opposite faces
   are darkened. Applied via ctx.fillStyle rgba overlays on front/cap faces.

## Technical requirements
- ``SunState = { azimuth: number, altitude: number, shadowLength: number, shadowAlpha: number }``
- ``computeShadowOffset(sun, zOffset)`` → { dx, dy }
- Shadow: small filled ellipse at (cx+dx, cy+dy), rgba(0,0,0,shadowAlpha×0.5)
- Rim: front face gets ``rgba(255,255,255,0.1)`` overlay; cap face gets ``rgba(0,0,0,0.2)``

## Acceptance criteria (ALL required to close)
- [ ] ``render_nano_tile stone-wall straight-h`` with sun from NE → shadow offset NW of tile, front face brighter, cap face darker.
- [ ] ``render_nano_tile stone-wall straight-h`` with sun from NW → shadow offset NE.
- [ ] Shadow changes direction between the two renders (delta dx visible).
- [ ] PNGs committed: ``ProgressEvaluations/lighting-shadow-ne-sun.png``, ``lighting-shadow-nw-sun.png``.
- [ ] No sun → no shadow (shadowAlpha=0 → no shadow drawn).
"@

# ── 9. GATE + WALKABLE LOGIC ────────────────────────────────────────────────
New-Issue "Iso 2.0 [9/12]: Gate, Troll-Bridge Walkable Logic + Quiz/Key Unlock" @"
## Spec reference
IsoRenderingPlanV2.1.md §5.2 Walkable Logic; §5.3 Gate/Quiz Integration

## Goal
Feature tiles have walkability states:
- ``fence``, ``stone-wall``: walkable=never (blocks movement)
- ``gate``: walkable=conditionally (locked=blocked, unlocked=passable)
- ``troll-bridge``, ``bridge``: walkable=always

Solver places gates at fence run openings. Quiz unlock changes gate state.
BFS pathfinder respects walkable map.

## Technical requirements
- ``WalkableRule = { type: 'never' | 'always' | 'conditional', conditionFn?: () => boolean }``
- ``walkableMap[row][col]`` = boolean (true = can enter)
- ``solver.placeGatesInFenceRuns()`` → inserts gate nano at calculated opening
- Gate locked state → walkable=false; unlocked → walkable=true
- Quiz trigger: player approaches gate → quiz UI opens → correct answer → unlocks

## Acceptance criteria (ALL required to close)
- [ ] ``render_nano_tile gate straight-h`` → gate graphic clearly visible (locked appearance).
- [ ] ``render_nano_tile troll-bridge straight-h`` → bridge visible, spans negative-Z gap.
- [ ] ``render_nano_scene`` with fence perimeter + gate opening → gate at correct position in perimeter.
- [ ] In live demo: player cannot walk through locked gate, can walk through after quiz.
- [ ] BFS pathfind from inside to outside fence perimeter: path = null when gate locked, valid path when unlocked.
- [ ] PNGs committed: ``ProgressEvaluations/nano-gate-locked.png``, ``scene-fence-with-gate.png``, ``nano-troll-bridge.png``.
"@ "feature,world-generation"

# ── 10. LARGE ASSEMBLIES ────────────────────────────────────────────────────
New-Issue "Iso 2.0 [10/12]: Large Multi-Tile Assemblies (homestead 5×5, cathedral spires)" @"
## Spec reference
IsoRenderingPlanV2.1.md §5.4 Assemblies; §Addendum D Large Structures

## Goal
Pre-defined assembly blueprints place multi-tile structures in the world.
Each assembly is a list of { col, row, kind, variant, zOffset } entries.

Verified assemblies:
- **Homestead**: 5×4 footprint, homestead-wall perimeter, gate south side, wood-floor interior
- **Cathedral**: 3×6 nave with cathedral-wall sides, 2-tile spires at north end (zOffset=8)

## Technical requirements
- ``assemblies.ts`` exports HOMESTEAD_BLUEPRINT, CATHEDRAL_BLUEPRINT as AssemblyEntry[]
- ``placeAssembly(chunk, blueprint, originCol, originRow)`` → stamps entries into chunk
- All assembly tiles resolve variants via solver (no hard-coded variant strings in blueprint)
- Cathedral spires: zOffset=8 → 96px tall, visible above surrounding walls

## Acceptance criteria (ALL required to close)
- [ ] ``render_nano_scene`` rendering HOMESTEAD_BLUEPRINT → recognizable house shape, gate on south side, walls meet at corners.
- [ ] ``render_nano_scene`` rendering CATHEDRAL_BLUEPRINT → nave walls + spires taller than side walls visible.
- [ ] No seams or z-fighting between adjacent tiles in either assembly.
- [ ] PNGs committed: ``ProgressEvaluations/assembly-homestead.png``, ``assembly-cathedral.png``.
- [ ] PNGs show structures from standard iso angle (no debug overlay required, debug optional).
"@ "world-generation,art"

# ── 11. 60 FPS PERFORMANCE ──────────────────────────────────────────────────
New-Issue "Iso 2.0 [11/12]: 60+ FPS Validated — Dirty-Frame Skip, Chunk Bake, SVG Cache" @"
## Spec reference
IsoRenderingPlanV2.1.md §7 Performance; performance.instructions.md

## Goal
The iso 2.0 demo world renders at 60+ FPS on a standard desktop browser with:
- 7×7 visible tile range (49 terrain + up to 49 nano stacks)
- Player movement + animation
- No frame-rate drops on new chunk load (chunk bake pre-emptive)

## Technical requirements
- Dirty-frame skip: only re-render when player moved, animation ticked, or world changed
- Chunk bake: off-screen canvas pre-render of base terrain per chunk
- SVG image cache: ``loadSvgImage`` stores decoded HTMLImageElement, never re-decodes
- NanoStack cache: ``_nanoStackCache`` in nano-tile-defs.ts prevents re-alloc per frame
- Frame budget: ≤16.7ms total per rendered frame

## Acceptance criteria (ALL required to close)
- [ ] Demo world runs in browser at 60+ FPS (verified via browser perf panel or built-in FPS counter).
- [ ] FPS counter shown in debug HUD (F5 or dev flag to enable).
- [ ] Frame time log: 100 consecutive frames, all ≤16.7ms (no spikes >33ms).
- [ ] Chunk boundary cross: no frame-rate drop below 58 FPS on new chunk load.
- [ ] Screenshot of FPS counter showing 60+ committed to ``ProgressEvaluations/fps-60-verified.png``.
"@ "performance,high-priority"

# ── 12. INTEGRATION SCENE ───────────────────────────────────────────────────
New-Issue "Iso 2.0 [12/12]: Full Integration Scene — All Nano Kinds, Player, Walkability, 60 FPS" @"
## Spec reference
IsoRenderingPlanV2.1.md §8 Final Validation Scene; entire spec

## Goal
A single render_nano_scene call (or browser screenshot) that shows ALL systems
working simultaneously:
- Base terrain: 3+ biomes visible
- Stone wall perimeter
- Fence run with gate
- River with troll-bridge crossing
- Tall-grass patches
- Cathedral or homestead assembly
- 2+ player sprites at various positions (inside fence, at gate, on bridge)
- Shadows visible on wall tiles
- Player behind fence (partially visible through gaps)
- Player behind wall (hidden)
- 60+ FPS confirmed

## Acceptance criteria (ALL required to close)
- [ ] Single PNG ``ProgressEvaluations/integration-scene-final.png`` ≥ 900×600px showing all of the above.
- [ ] All 12 prior issues must be closed (with their PNGs committed) before this issue can be closed.
- [ ] PR merging experiment/isometric-2.0 findings into main src/ opened and linked in comment.
- [ ] Both #184 (rendering overhaul epic) and this epic (#iso-2.0-reboot) updated with final PR link.
"@ "high-priority"

Write-Host "All 13 issues created (1 epic + 12 sub-issues). Check GitHub Issues for the 'Iso 2.0 Verified Delivery' milestone."
