# Iso 2.0 Visual Development — Strategic Plan

**Date**: April 10, 2026  
**Status**: Development stalled >1 month. MCP tooling functional + validated. Ready for tight-loop iteration.  
**Target**: Complete stone-wall + fence + river visual + collision by end of sprint.  

---

## Executive Summary

The `experiment/isometric-2.0` branch has built a working MCP tool (`isoSvgRenderer`) that wraps the actual game engine code. The theory is sound: **modify source → MCP render instantly → LLM sees result → iterate**. However, progress has stalled due to:

1. **Feedback loop friction**: Not using MCP tools enough; falling back to full-game server startup
2. **Unclear priority**: No master checklist of what "stone-wall done" means
3. **No agent discipline**: Work is scattered across manual iterations with no clear scope
4. **Documentation debt**: "TODO: DOC" markers throughout codebase, but not blocking visual work

**Solution:** Introduce `IsoVisualLoop` agent with **strict iteration discipline + MCP-first validation**. Target: 30 days to stone-wall + fence visual completion + collision QA.

---

## Current Technical State

### What Works ✅

- **MCP Tool Stack** (8 calls): render_game_tile, render_iso_scene, render_nano_assembly, render_geo_proof, render_variation_sweep, render_svg_isometric, render_svg_isometric_strip, render_nano_isometric
- **Hot-Reload Relay**: Changes to `src/solver.ts`, `src/nano-tile.ts` live on next MCP call (no rebuild/restart)
- **Game Engine Code**: All feature SVG generators (`getVariantSvg`, `stoneWallSvg`, woodenFenceSvg, etc.) implemented + used by MCP
- **Collision Math**: Exact point-in-wall footprint (`pointHitsWallFootprint`, `isPointWalkableInTile`, `wallBounds`)
- **Evaluation Renders**: v8/v9 stone-wall perimeter PNGs showing clean 7×7 perimeter with brick texture

### Known Gaps ❌

- **No visual completion validation**: Evaluation PNGs exist, but no checklist of "ready to ship"
- **Fence variants**: Only baseline rendered; corner/tee variants not evaluated
- **River aesthetics**: No iteration on water color, wave pattern, readability at distance
- **Sprite quality**: SVG proportions, detail, performance not optimized
- **Documentation**: 15+ "TODO: DOC" markers (safe to defer, not blocking)
- **Performance baseline**: No perf profile comparing isometric-1.0 vs 2.0 per-frame cost

### Architecture Decisions Made (Locked In)

1. **Z-pinned shear transform** for nanos (standing billboards)
   - Pros: Matches iso diamond, clean corner geometry
   - Cons: Different perspective than fully extruded walls (3D faces)
   - Status: ✅ Locked, working well

2. **Running-bond brick texture** for stone-wall side + top
   - Pros: Visual continuity, pseudo-random variation per tile
   - Cons: SVG generation cost per tile (mitigated by cache)
   - Status: ✅ Locked, brick scale tuned (18×8 cap)

3. **Center-aligned wall footprint** (WALL_OFFSET=40, WALL_THICKNESS=48)
   - Pros: Matches visual geometry, exact collision
   - Cons: No edge-aligned variant option (if needed later, requires refactor)
   - Status: ✅ Locked, working well

4. **Conditional walkability** (condition IDs map to lock/unlock state)
   - Pros: Supports gates + doors at design time
   - Cons: Requires condition resolver at chunk load
   - Status: ✅ Locked, implemented

---

## Work Breakdown — 3 Month Roadmap

### Phase 1: Stone-Wall Visual Completion (Weeks 1–2)
**Goal**: Ship stone-wall as a complete, shippable feature.

#### Tasks (Priority Order)

1. **Corner Variant Validation** (2-4 hrs)
   - Iterate on corner-br, corner-bl, corner-tr, corner-tl SVG generation
   - Use `render_iso_scene` (7×7 perimeter) + `render_nano_assembly` (corner close-ups)
   - Validate: no voids, clean mortar, brick continuity at corners
   - Acceptance: `stone-wall-perimeter-clean-v10.png` matches visual criterion

2. **Tee Variant Validation** (1-2 hrs)
   - Check tee-t, tee-b, tee-r, tee-l rendering
   - Ensure secondary arm face (added in commit a769bb4) renders cleanly
   - Acceptance: all corners + tees render without issues

3. **Collision Edge Cases** (2-3 hrs)
   - Test player entry/exit at wall corners (float precision?)
   - Test diagonal movement along walls (slide correctly?)
   - Test conditional gates (locked/unlocked state affects walkability?)
   - Acceptance: manual in-game testing confirms no soft-locks or erratic collision

4. **Performance Profile** (1 hr)
   - Measure per-frame cost: `drawExtrudedNano()` for 64 wall tiles in viewport
   - Measure chunk bake time (stone-wall feature resolution)
   - Acceptance: <16ms per-frame draw, <500ms chunk bake

5. **Commit + Push Feature** (30 mins)
   - PR: "feat: stone-wall complete — running-bond texture, corners, collision"
   - Include: evaluation PNG v10 + commit notes on corner geometry decisions

#### Definition of Done (Stone-Wall)

- [ ] All 14 wall variants render cleanly (straight-h/v, corner×4, tee×4, cross, isolated, end×3)
- [ ] `stone-wall-perimeter-clean-v10.png` passes visual inspection (no voids, clean mortar)
- [ ] Collision works: player can walk up to wall, enter/exit corners without glitching
- [ ] Performance: <16ms per-frame draw in typical wall-heavy scene
- [ ] PR reviewed + merged to `experiment/isometric-2.0`

---

### Phase 2: Fence Variants + Quality (Weeks 3–4)
**Goal**: Fence feature parity with stone-wall (all variants, clean visuals).

#### Tasks

1. **Fence Variant Iteration** (3-4 hrs)
   - Render all 14 fence variants (same names as stone-wall)
   - Compare fence texture angle vs. wall orientation (should they differ?)
   - Test fence post proportion, rail tightness
   - Use `render_variation_sweep` to compare texture rotations (0°, 90°, 180°, 270°)
   - Acceptance: `fence-all-variants.png` shows clean perimeter

2. **Fence Color + Contrast** (1-2 hrs)
   - Current fence SVG: gray wood. Iterate on tone, saturation, weathering
   - Goal: visually distinct from grass + wall at distance
   - Use `render_iso_scene` at varying zoom levels to validate readability
   - Acceptance: fence is clearly readable at tile distance

3. **Fence Performance** (1 hr)
   - Profile fence SVG generation + render cost (compare to stone-wall)
   - Acceptance: <15ms per-frame for dense fence scene

4. **Commit + Push** (30 mins)

#### Definition of Done (Fence)

- [ ] All 14 fence variants render
- [ ] `fence-all-variants.png` passes visual inspection
- [ ] Fence distinct from grass + stone-wall in color/tone
- [ ] <15ms per-frame draw performance
- [ ] PR merged

---

### Phase 3: River + River-Bank Aesthetic (Week 5)
**Goal**: River looks polished + readable; river-bank transitions smooth.

#### Tasks

1. **River Water Aesthetic** (2-3 hrs)
   - Iterate on water color (blue tone, saturation, transparency)
   - Add wave pattern or ripple visual (SVG + procedural variation)
   - Test river contrast vs. green grass
   - Use `render_iso_scene` river-crossings to validate
   - Acceptance: `river-crossing-aesthetic-v1.png` shows clean water + readable banks

2. **River-Bank Transition** (1-2 hrs)
   - Check river-bank SVG connects cleanly to grass tiles
   - Validate bank shadow/highlight for depth cueing
   - Acceptance: no visible seams between river + bank + grass

3. **Multi-Biome River** (1 hr)
   - Render river crossing cave biome (if applicable, defer if not)
   - Acceptance: river remains readable in dimmer cave palette

4. **Commit + Push** (30 mins)

#### Definition of Done (River)

- [ ] Water color + pattern readable at tile distance
- [ ] River-bank transitions are seamless
- [ ] `river-crossing-aesthetic-v1.png` passes visual
- [ ] PR merged

---

### Phase 4: Sprite + Polish (Week 6)
**Goal**: Improve overall asset visual quality; reduce SVG generation overhead.

#### Tasks

1. **Sprite Proportions** (2 hrs)
   - Review tall-grass, all biome tiles for visual balance
   - Tweak proportions if needed (e.g., grass height, rock mass)
   - Use `render_variation_sweep` (scale param) to compare sizes
   - Acceptance: all sprites feel proportional + readable

2. **Asset Simplification** (1-2 hrs)
   - Reduce DOM nodes in procedural SVGs (if applicable)
   - Simplify hand-authored SVGs (Bezier reduction, clip path optimization)
   - Goal: faster SVG load + render, especially on mobile
   - Acceptance: no visual regression, faster SVG parse

3. **Seasonal Variation** (defer if time-tight)
   - Placeholder: skipped this cycle

4. **Commit + Polish** (30 mins)

#### Definition of Done (Polish)

- [ ] All sprites visually polished + proportional
- [ ] SVG simplification measured (before/after size comparison)
- [ ] No visual regression
- [ ] PR merged

---

### Phase 5: Performance + Finalization (Week 7)
**Goal**: Performance baseline established; ready for integration.

#### Tasks

1. **Full Scene Profile** (2 hrs)
   - Render 25×25 chunk with mixed biomes + all feature types
   - Measure per-frame cost breakdown (terrain, nanos, players)
   - Identify bottlenecks
   - Acceptance: <60fps typical scene, <33ms per frame

2. **Collision Stress Test** (1 hr)
   - 8-player wall navigation, rapid direction changes
   - Check for missed collisions or jitter
   - Acceptance: zero glitches observed

3. **Mobile Readiness** (1 hr)
   - Test on lower-end device or simulator if available
   - Verify SVG perf on mobile
   - Acceptance: playable on mid-range mobile

4. **Integration Prep** (1 hr)
   - Verify branch can merge to main without conflicts
   - Prepare integration PR draft
   - Acceptance: clean merge ready

#### Definition of Done (Phase 5)

- [ ] Performance baseline documented
- [ ] No bottleneck
s identified
- [ ] Collision robust under stress
- [ ] Integration PR ready

---

## Resource Allocation

| Phase | Duration | Effort (Agent Hours) | Checkpoints |
|-------|----------|------|---|
| 1: Stone-Wall | 2 weeks | 8–10 | Corner validation + perf profile + clean-v10 PNG |
| 2: Fence | 2 weeks | 6–8 | All variants render + perf OK |
| 3: River | 1 week | 4–5 | Aesthetic v1 + transitions clean |
| 4: Sprite Polish | 1 week | 4–5 | Visual quality + simplification measured |
| 5: Performance | 1 week | 4–5 | Baselines documented, integration ready |
| **Total** | **7 weeks** | **26–33 hrs** | — |

---

## Risk Assessment + Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| MCP tool becomes slow/unreliable | Low | High | Use test-relay.mjs smoke test before each session; rebuild/restart protocol documented |
| Corner geometry changes require major refactor | Medium | Medium | Use render_geo_proof + render_nano_assembly for early validation before major changes |
| Performance regression during iterations | Medium | Medium | Profile after every major change; keep perf targets in sight |
| Scope creep (feature requests during iteration) | High | High | **Strict scope**: only stone-wall + fence + river + polish. Defer shadow/lighting/seasonal. |
| Agent context exhaustion during long iteration cycles | Low | Medium | Save evaluation PNGs; reset session with fresh prompt if >10K tokens used |
| Collision edge cases discovered late | Medium | Low | Test collision early + frequently; use in-game manual testing in parallel |

---

## Success Metrics

1. **Delivery**: Stone-wall + fence + river shipped to `experiment/isometric-2.0` + visually polished
2. **Quality**: All 3 features pass visual inspection (evaluation PNGs) + collision testing
3. **Performance**: <16ms per-frame draw for typical wall-heavy scene
4. **Process**: Tight MCP loop enabled <1 min feedback cycles (no server startup required)
5. **Unblocked**: Ready for merge to main branch (or next integration sprint)

---

## Open Questions / Decisions Needed

1. **Shadow + Rim Lighting**: Should stone-wall faces have depth cueing (shadow on bottom, rim highlight on top)?
   - Current: flat color
   - Options: (a) defer, (b) add subtle shadow, (c) full 3D lighting
   - Recommendation: **Defer to Phase 4 (polish)**

2. **Fence Post Material**: Wood texture vs. procedural fill?
   - Current: simple gray rect with mortar
   - Recommendation: **Keep simple; iterate on color contrast if needed**

3. **River Wave Animation**: Static SVG or procedural animation frame by frame?
   - Current: static water pattern
   - Recommendation: **Static for MVP; animated iteration in Phase 3 if time allows**

4. **Mobile Optimization**: Vectorize or rasterize tile assets for faster load?
   - Current: procedural SVG
   - Recommendation: **Benchmark first (Phase 5); rasterize only if bottleneck identified**

5. **Evaluation PNG Versioning**: How to track visual changes across iterations?
   - Current: `stone-wall-perimeter-clean-v8.png`, `v9.png`, etc.
   - Recommendation: **Continue versioning; delete old versions after 2 iterations to save space**

---

## Next Steps for IsoVisualLoop Agent

1. **Switch agent mode** to `IsoVisualLoop` (in VS Code Copilot Chat settings or agent selector)
2. **Use the follow-up prompt format** provided in the agent definition
3. **Start with Priority 1**: Stone-wall corner validation
4. **First session target**: Make 2–3 iteration cycles, commit progress, save evaluation PNG

Example first prompt to agent:

```
[SWITCH TO IsoVisualLoop AGENT MODE]

CURRENT TASK:
Stone-wall corner variants validation.
- Goal: Ensure corner-br, corner-bl, corner-tr, corner-tl render cleanly (no voids)
- Target: stone-wall-perimeter-clean-v10.png evaluation render

CONTEXT:
- Latest good render: stone-wall-perimeter-clean-v9.png (7×7 perimeter, looks solid)
- Known issue: Haven't validated tee variants yet; corner geometry may have edge cases
- Hot-reload is ready (changes to solver.ts live instantly)

NEXT STEPS:
1. Render full 7×7 perimeter with render_iso_scene
2. Inspect corners visually for voids/misalignment
3. If issues found: debug + iterate solver.ts corner logic
4. Commit + save clean-v10 evaluation PNG as checkpoint
```

---

## Success Story (Target State)

**End of 7-week sprint:**

Stone-walls render perfectly with clean corners, running-bond brick texture, and exact collision detection. Fences complement the landscape with consistent geometry and readable color. Rivers are beautiful and readable, with smooth transitions to riverbank and grass. The entire feature set has been validated through MCP renders and visual inspection, with evaluation PNGs showing pixel-perfect results.

The tight MCP feedback loop has enabled rapid iteration: most decisions made in single 30-min sessions with 3–5 MCP render calls. Performance is solid (<16ms per-frame). The agent has committed clean, focused changes regularly, and the codebase remains maintainable.

**Ready for integration to main branch.**

