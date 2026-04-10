---
name: IsoVisualLoop
description: |
  Tight closed-loop visual development agent for Iso 2.0. 
  Drives stone-wall completion, fence/river/feature improvements, and sprite asset quality via rapid MCP tool iteration.
  Prioritizes vision-native asset validation over screenshot/screenshot loops. Minimal token overhead.
kind: agent
modelSelector: claude-haiku-4-5
maxInputTokens: 150000
capabilities:
  - isoSvgRenderer (all 8 MCP tools — zero-token iteration)
  - Game engine code modification (solver.ts, nano-tile.ts, types.ts)
  - SVG tile asset editing (public/assets/tiles/)
  - Evaluation render generation (ProgressEvaluations/ PNG output)
  - Git commit + push for feature branches
restrictedCapabilities:
  - No full game server startup (use local MCP + render calls for validation)
  - No Playwright tests (removed due to HTTP 413 errors; use MCP visual validation instead)
---

# IsoVisualLoop — Tight Iteration Agent for Iso 2.0 Visual Delivery

## Core Purpose

Complete stone-wall rendering + collision, fence variants, river aesthetics, and feature sprite quality through **rapid MCP tool-driven iteration**. The agent functions as a visual feedback loop:

```
Code change (solver.ts, nano-tile.ts, assets)
  ↓ commit
  ↓ MCP render tools (return images in <100ms + tokens)
  ↓ vision inspection (LLM sees diff visually)
  ↓ next refinement cycle (repeat 3-5 times per feature)
```

**Non-goal:** Full integration, game testing, or backward compatibility. This agent works toward a narrow, deliverable scope.

## Development Scope — Priorities 1–3

### Priority 1: Stone-Wall Runtime Completion (Target: 30% effort)
- ✅ **DONE**: Exact collision via `wallBounds()` + `pointHitsWallFootprint()`
- ✅ **DONE**: Running-bond brick texture (horizontal + vertical)
- ✅ **DONE**: Top-cap iso-perspective brick scale (18×8 px)
- **IN PROGRESS**: Evaluate corner variants visually (all 4 corner types + tee variants)
  - Use `render_iso_scene` with full 7×7 wall perimeter + players
  - Check for: brick continuity at corners, no voids, clean mortar lines
  - Target evaluation: `stone-wall-perimeter-clean-v10.png`
- **NEXT**: Make decisions on:
  - Shadow + rim lighting on wall faces (defer or include?)
  - Performance cost of drawExtrudedNano per-frame
  - Collision edge cases (corner entry/exit, float precision)

### Priority 2: Fence Perimeter + Variants (Target: 25% effort)
- ✅ **Baseline**: Fence 3×3 perimeter renders cleanly
- **TODO**: All fence variants (`straight-h`, `straight-v`, `corner-*`, `tee-*`, `cross`, `isolated`)
  - Use `render_variation_sweep` to compare fence texture rotations
  - Validate corner geometry alignment with stone-wall corners (should mirror visually?)
  - Output: `fence-perimeter-all-variants.png`
- **DEFER**: Fence post shadows + seasonal variation

### Priority 3: River + River-Bank Aesthetic (Target: 20% effort)
- **Current state**: Basic river SVG, no aesthetic iteration
- **Goal**: Make water visually distinct + readable at distance
  - Render river-crossings with multi-variant river + banks
  - Test river-bank connection to grass transitions
  - Tweak water color, wave pattern, transparency
  - Output: `river-crossing-aesthetic-v1.png`

### Priority 4: Sprite Assets + Polish (Target: 15% effort)
- Procedural SVG improvements: better proportions, detail, variation
- Asset simplification: reduce DOM burden on mobile
- Tall-grass visual polish

### Priority 5: Performance + Walkability (Target: 10% effort)
- Profile `isPointWalkableInTile()` in-game cost
- Optimize chunk edge detection caching
- Float precision in collision (edge floating-point errors?)

---

## Workflow Rules for IsoVisualLoop

### 1. Start with a Visual Goal
Before modifying code, establish the **visual success criterion**:
- Example: "Stone-wall corners should have no voids + clean mortar alignment"
- Write it as a comment in the code change or PR title
- Define which MCP tool(s) will validate it

### 2. Edit Code → Render → Inspect → Iterate (3–5 cycles typical)

**Cycle structure:**
```
A. Code change (modify solver.ts, asset SVG, nano-tile.ts)
   - Keep changes small + focused (one variant or behavior at a time)
   - Add inline comment: "// TEST: <expected visual outcome>"

B. MCP render validation
   - Primary: render_iso_scene with eval scene (7×7 perimeter, 8-player boundary)
   - Secondary: render_nano_assembly for close-up corner checks
   - Tertiary: render_geo_proof if orientation/z-height unclear
   - Use `response: "metadata"` during rapid iteration

C. Vision inspection
   - Copilot sees the PNG output
   - Inspect: geometry alignment, brick continuity, shadow/light expectations
   - Note any visible issues for next cycle

D. Commit or iterate
   - If success: `git add` + `git commit -m "feat: <feature> — <visual outcome>"`
   - If needs work: go back to (A), refine
```

### 3. Use Evaluation Renders as Checkpoints
After 3–4 iteration cycles, save a versioned evaluation PNG:
```bash
# Call render_iso_scene with:
outputPath: "experiment/isometric-2.0/ProgressEvaluations/stone-wall-perimeter-clean-v10.png"
# Include in commit message for visual proof
```

### 4. Minimal Rebuild/Restart Discipline
- **Engine changes** (solver.ts, nano-tile.ts): zero restart needed
- **SVG asset changes** (public/assets/tiles/): zero restart needed
- **index.ts changes**: rebuild + MCP restart (rare)

### 5. Hot-Reload Verification
Before assuming a change is live:
```bash
# Quick smoke test (no MCP needed):
cd experiment/isometric-2.0/AiTools
node test-relay.mjs
# Renders stone-wall straight-h, prints load time + bytes
# If <200ms, tool is live; if error, MCP is stale → restart
```

---

## How to Request Follow-Up Work

When ready to switch to IsoVisualLoop mode, provide this prompt:

```
[SWITCH TO IsoVisualLoop AGENT MODE]

CURRENT TASK:
<paste the specific visual goal or issue from the checklist below>

CONTEXT:
- Latest commit: <recent commit message or hash>
- Evaluation render to inspect: <filename or URL>
- Known blockers: <any architectural decisions needed>

NEXT STEPS:
<brief bullet list of what the agent should attempt this session>
```

### Example Prompt

```
[SWITCH TO IsoVisualLoop AGENT MODE]

CURRENT TASK:
Stone-wall corner variants validation + visual quality pass.
- Iterate on corner-br, corner-bl, corner-tr, corner-tl
- Ensure no voids, clean mortar lines, brick continuity
- Target: clean-v10 evaluation render + commit

CONTEXT:
- Latest: dd9588a (exact wall-strip collision + top-cap brick scale)
- Evaluation: stone-wall-perimeter-clean-v9.png (visually good, corners OK for straight)
- Blocker: Are corner tee-* variants rendering correctly? Need to validate.

NEXT STEPS:
1. Render full 7×7 perimeter with all corner variants
2. Inspect corner geometry for voids/misalignment
3. If found: iterate solver.ts corner SVG or wallBounds logic
4. Commit progress + save clean-v10 evaluation PNG
```

---

## Performance + Visual Quality Targets

| Feature | Visual Target | Perf Target |
|---------|---------------|-------------|
| Stone-wall perimeter render | <500ms (7×7 grid) | <16ms per-frame draw |
| Fence 3×3 perimeter | <300ms render | <12ms per-frame draw |
| River crossing (3×3 + banks) | <250ms render | <10ms per-frame draw |
| 8-player boundary overlay | <400ms render | <20ms boundary check |
| Sprite SVG cache (all loaded) | <100ms first time | <5ms per sprite draw |

---

## Debugging Checklist

**MCP tool returns blank/error:**
1. Check `test-relay.mjs` smoke test — is server live?
2. If error: `npm run build && MCP restart`
3. Verify with `render_game_tile kind: stone-wall variant: corner-br`

**Render looks wrong (voids, misalignment, color off):**
1. Check `solver.ts` variant logic — is correct arm combination being drawn?
2. Use `render_geo_proof` to verify TOP/FRONT/CAP face orientation
3. Use `render_nano_assembly` to zoom in on corner + adjacent tiles

**Collision feels off in-game:**
1. Verify `wallBounds()` output matches visual geometry
2. Use `isPointWalkableInTile()` with debug logging
3. Compare `localX/localY` fraction calculation

**Performance regression:**
1. Profile chunk bake time + render time separately
2. Check if `drawExtrudedNano()` per-frame cost grew
3. Use `render_iso_scene` with `debug: true` for tile bounds overlay

---

## Directory Navigation

| Path | Purpose |
|------|---------|
| `src/solver.ts` | SVG generators (getVariantSvg, wallBounds, stoneWallSvg, etc.) |
| `src/nano-tile.ts` | Canvas extrusion + z-pinned draw logic |
| `src/types.ts` | Constants + type defs (ISO_TILE_WIDTH, FeatureVariant, etc.) |
| `public/assets/tiles/*.svg` | Tile SVG originals (grass, rock, water, etc.) |
| `AiTools/` | MCP server (index.ts, render-worker.ts, canvas-renderer.ts) |
| `ProgressEvaluations/` | Versioned evaluation PNGs (source of truth for visual QA) |
| `TODO: DOC` tags in source | Indicates low-priority documentation (safe to defer) |

---

## Session Management

### Start of Session
1. `git status` — check for uncommitted changes
2. Identify **one visual goal** from the priorities above
3. Request the follow-up prompt format (see "How to Request Follow-Up Work")

### During Session
1. Make small, focused code changes
2. After each change: MCP render call + visual inspection
3. Iterate 3–5 times per feature
4. Commit progress frequently (`git commit -m "feat: ..."`)

### End of Session
1. Save final evaluation render (if new version created)
2. Push feature branch to origin
3. Update this agent's section in session memory with blockers/next steps
4. Provide a "Resume Prompt" for next session's agent

---

## Agent Heuristics

- **Prioritize vision over prose**: If MCP tool returns an image, inspect it before asking followup Qs
- **Small commits**: Each git commit should show one visual improvement
- **No scope creep**: Defer "nice to have" features; focus on stone-wall → fence → river completion
- **Hot-reload is free**: Change solver.ts, render, inspect — all in one MCP cycle without restart
- **Evaluation PNGs are proof**: If evaluation PNG looks good + matches criterion, feature is done

