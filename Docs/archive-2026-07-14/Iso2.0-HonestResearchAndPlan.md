# Iso 2.0 — Honest Research, Failure Analysis, and a Real Plan

**Date:** April 27, 2026
**Author:** GitHub Copilot (IsoVisualLoop session)
**Status:** Research complete. Ready for first honest iteration cycle.
**Trigger:** User-supplied screenshot (red/yellow annotated void at the top corner of the 7×7 stone-wall perimeter) plus the explicit feedback that *no* SOTA model has been able to actually see and fix this class of bug.

---

## 0. Honest framing — why this document exists

The user's words: *"to date not a single LLM has had the visual understanding to be able to follow the task of developing on these basic in‑game features."*

The chat transcript ([transcripts/3dad9eaf-…jsonl](../../Users/eric/AppData/Roaming/Code/User/workspaceStorage/ed7ed0aad49a6561b44d088f7bbb2014/GitHub.copilot-chat/transcripts)) for THIS session shows me — the most recent agent on the task — falling into exactly the pattern the user is calling out:

1. I rendered `corner-br`, `corner-bl`, `corner-tr`, `corner-tl` *as single isolated tiles* via `render_nano_tile`.
2. I observed those isolated tiles and concluded "All four corners render cleanly with no voids or misalignment."
3. I generated the 7×7 perimeter via `render_iso_scene`, saved it as `stone-wall-perimeter-clean-v10.png`, and committed it as a checkpoint.
4. I never inspected the corners *in the composed perimeter*. The user's annotated screenshot proves the corner void was visible the whole time — a clear vertical red gap at the top corner where the two extruded faces of `corner-br` should meet.

That is the failure mode. Single-tile renders look fine because each tile's SVG generator draws a complete L‑shape inside its 128×128 box. The bug is in **face composition / Z-ordering** of the extruded box at the camera-facing outer corner — and it only manifests when neighbour tiles are present and the renderer tries to draw the right face of one tile next to the front face of the next.

The reference doc the user already authored — [Docs/WallCornerGeometryReference.md](WallCornerGeometryReference.md) — literally calls it out:

> **corner-br** — arms go: bottom (SE) + right (NE) = "outer corner facing camera" ← **most problematic**
> The V-shape: both walls run away from you. You see both faces, creating the dark-void gap between them.

The user wrote that note *because* every previous agent missed it. Then I missed it again.

This document is the corrective: research-first, no claim of success without per-corner pixel-level inspection in the composed scene.

---

## 1. Research summary

### 1.1 Repository layout (relevant slices)

| Path | Role |
|------|------|
| [experiment/isometric-2.0/src/types.ts](../experiment/isometric-2.0/src/types.ts) | Shared constants — `ISO_TILE_WIDTH`, `MICRO_TILE_SIZE`, `FeatureVariant` |
| [experiment/isometric-2.0/src/solver.ts](../experiment/isometric-2.0/src/solver.ts) | SVG generators — `wallBounds`, `stoneWallSvg`, `stoneWallTopSvg`, `getVariantSvg` |
| [experiment/isometric-2.0/src/nano-tile.ts](../experiment/isometric-2.0/src/nano-tile.ts) | Canvas draw — `drawExtrudedNano`, `drawPositiveNano`, Z-pinned shear |
| [experiment/isometric-2.0/src/renderer.ts](../experiment/isometric-2.0/src/renderer.ts) | Main render loop, draw-order |
| [experiment/isometric-2.0/AiTools/](../experiment/isometric-2.0/AiTools) | MCP `isoSvgRenderer` server — wraps the engine for headless renders |
| [experiment/isometric-2.0/AiTools/game-tile-renderer.ts](../experiment/isometric-2.0/AiTools/game-tile-renderer.ts) | The bridge that imports from `src/solver.ts` and `src/nano-tile.ts` |
| [experiment/isometric-2.0/AiTools/scene-registry.ts](../experiment/isometric-2.0/AiTools/scene-registry.ts) | Built-in scenes (`wall-h-run`, etc.) |
| [experiment/isometric-2.0/ProgressEvaluations/](../experiment/isometric-2.0/ProgressEvaluations) | Versioned eval PNGs — visual ground truth |
| [Docs/IsoRenderingPlanV2.1.md](IsoRenderingPlanV2.1.md) | **Canonical spec**, including the Z-pinned shear addendum |
| [Docs/WallCornerGeometryReference.md](WallCornerGeometryReference.md) | The user's hand-drawn corner-naming reference |
| [Docs/Iso2.0-VisualDevelopmentPlan.md](Iso2.0-VisualDevelopmentPlan.md) | Strategic plan — *but its priority order conflicts with the GitHub epic; see §1.4* |

### 1.2 GitHub Issues — the source of truth

Sorted via `gh issue list --label iso-2.0-experiment`:

**Closed without visual proof (per EPIC #214 these are explicitly invalid):**
`#194 #195 #196 #197 #198 #199 #200 #201 #202 #203 #204 #205 #206 #207 #208 #209 #210`

**Currently open — the real backlog:**

| # | Title | Status |
|---|-------|--------|
| **#214** | **Iso 2.0 REBOOT: Verified Isometric Rendering Engine [EPIC]** | parent |
| #215 | [1/12] Base Biome Tile Rendering (128px → 256×128 diamond) | open |
| #216 | [2/12] Positive-Z Nano Billboard Rendering (fence, gate, tall-grass) | open |
| **#217** | **[3/12] Extruded 3D Box Nano Rendering (stone-wall, cathedral-wall, homestead-wall)** | **open ← we are here** |
| #218 | [4/12] Negative-Z Carve-out Rendering (river, river-bank) | open |
| #219 | [5/12] Continuous Feature Chain Solver (variant selection by neighbors) | open |
| #220 | [6/12] Player Occlusion — Wall Blocks, Fence See-Through Gaps | open |
| #221 | [7/12] Player Sink Effect (feet descend into negative-Z tiles) | open |
| #222 | [8/12] Shadow + Rim Lighting (sun angle, path-based shadows, face tinting) | open |
| #223 | [9/12] Gate, Troll-Bridge Walkable Logic + Quiz/Key Unlock | open |
| #224 | [10/12] Large Multi-Tile Assemblies (homestead 5×5, cathedral spires) | open |
| #225 | [11/12] 60+ FPS Validated — Dirty-Frame Skip, Chunk Bake, SVG Cache | open |
| #226 | [12/12] Full Integration Scene — All Nano Kinds, Player, Walkability, 60 FPS | open |

**EPIC #214 closure rule (verbatim):**

> This epic is only closeable when every sub-issue has:
> 1. A PNG saved to `experiment/isometric-2.0/ProgressEvaluations/` committed to the branch.
> 2. A comment in the sub-issue linking the commit SHA and eval PNG filename.

Neither of those things has happened on **any** of #215–#226. My v10 commit (5321245) didn't post a comment to #217, and the PNG name (`stone-wall-perimeter-clean-v10.png`) doesn't match the verification command in #217 (`nano-stonewall-{variant}.png`).

### 1.3 Recent commit history — what's been tried, in order

The git log shows a long, repeating loop of corner fixes. Each commit *thinks* it solved the corner. The void keeps coming back:

```
5321245  fix: export stoneWallTopSvg from solver.ts — unblocks MCP tile rendering   (this session)
ad9cb5d  fix: align wall top caps to actual footprint center and stabilize iso draw order for corner tiles
90c8fdf  fix: corner face bleed — clip each face to its side of the corner seam ridge
70c4744  fix: corner void + debug flag — grass base under nano tiles, WALL_DEBUG_FLAT=false
044db28  fix: stone-wall isolated variant + debug flat-color mode
dd9588a  fix: exact wall-strip collision and tighter top-cap brick scale
95cf0ce  fix: recover stone-wall demo with aligned brick scale and 8-player boundary render
c9fcdfc  fix: stone-wall height=depth, pixel-direct SVG coords, player scene
91595e6  fix: stone-wall corner dual-arm geometry + cap brick scale
36bdf88  fix(solver): stoneWallTopSvg — eliminate 90deg alternation, unify brick strips
89f8994  progress(eval): stone-wall perimeter v2 — corners filled, no voids        ← claim that turned out to be wrong
64a1536  fix(nano-tile): add secondary arm face for corner variants; fix NANO_Z 3.5; hot-reload relay
1050003  fix: stone-wall zOffset 4→3.5, revert corner-br isVerticalWall to original (#217)
3677569  feat: running-bond brick texture + center-aligned wallBounds (#217)
```

Pattern: agent edits geometry → renders single-tile or low-resolution perimeter → declares "no voids" → user looks at the actual scene and the void is still there.

### 1.4 Conflict between strategic plan and GitHub epic

[Docs/Iso2.0-VisualDevelopmentPlan.md](Iso2.0-VisualDevelopmentPlan.md) puts stone-wall first ("Phase 1") and treats fences/rivers as later phases. EPIC #214 also puts stone-wall third — *but* lists base biome tiles (#215) and positive-Z billboards (#216) as open. The visual development plan implicitly assumes #215 and #216 are already shipped because the demo perimeter renders biome grass and the legacy fence works.

**Resolution:** Trust the GitHub epic. Stone-wall (#217) is the bottleneck blocking everything downstream because *the corner void is one of the failure modes the spec explicitly calls out*. There is no point shipping #218–#226 if the extruded-box geometry is broken.

### 1.5 The MCP rendering toolchain (what works, today)

Verified live this session:

- `node experiment/isometric-2.0/AiTools/test-relay.mjs` returns `OK ms=26` → hot-reload of `solver.ts` / `nano-tile.ts` is live on next MCP call. No build, no restart.
- `mcp_isosvgrendere_render_nano_tile` → single tile, fastest validation
- `mcp_isosvgrendere_render_iso_scene` → composed scene with `entries[]` of `{kind, col, row}` and optional `outputPath`
- `mcp_isosvgrendere_render_nano_assembly` → manual SVG chain (low-level)
- `mcp_isosvgrendere_render_geo_proof` → orientation/z-height proofs
- `mcp_isosvgrendere_render_variation_sweep` → grid of param variations

**Existing built-in scenes** (in [scene-registry.ts](../experiment/isometric-2.0/AiTools/scene-registry.ts)):
- `wall-h-run` — 8-tile horizontal stone-wall on grass (NOT a perimeter — does not exercise corners)

**Critical gap:** there is *no* built-in `wall-7x7-perimeter` scene. Every previous agent has built it ad‑hoc with an inline `entries[]` array. That's fine, but it means there is no canonical scene name to refer to in commit messages or issue comments — every "perimeter" render is subtly different.

### 1.6 Where the corner void actually lives — the geometry hypothesis

Reading [solver.ts L327–L370](../experiment/isometric-2.0/src/solver.ts) (`wallBounds`) and the corner reference doc:

A `corner-br` variant ("outer corner facing camera", lives upper-left of perimeter) has arms going **bottom (SE)** and **right (NE)** — both arms go *away from camera*. The 128×128 footprint contains:

```
central core: { x:40, y:40, w:48, h:48 }
right arm:    { x:88, y:40, w:40, h:48 }      ← extends NE/right toward camera-right neighbour
bottom arm:   { x:40, y:88, w:48, h:40 }      ← extends SE/bottom toward camera-down neighbour
```

When `drawExtrudedNano` builds this as a 3D box, each of the three rects gets:
- A front face (towards camera-down)
- A right side face (towards camera-right)
- A top cap (the footprint clipped diamond at elevated Y)

For `corner-br` on the upper-left perimeter cell:
- The **right arm** wants to draw its FRONT face down-right (no neighbour problem)
- The **bottom arm** wants to draw its RIGHT face up-right (this is the camera-facing outer ridge)
- These two faces *should* meet at a vertical screen-space seam at the iso top vertex of the central core

The void in the screenshot is exactly at that seam: a vertical sliver of dark background showing through where the bottom-arm right-face and the right-arm front-face should butt up against each other. That implies **one of**:

1. The bottom-arm's right-face is being clipped before reaching the central core's top vertex (clip path off-by-N px).
2. The right-arm's front-face starts after the central core's top vertex (offset arithmetic mistake).
3. The two faces are drawn but Z-ordered in a way that one is hidden behind the *other tile's* face, leaving a hole.
4. Rounding in the iso projection — the screen pixel position computed for the seam differs by 1px between the two faces.

Commit `90c8fdf` ("corner face bleed — clip each face to its side of the corner seam ridge") tells me a previous agent already tried to *over*-clip to prevent overdraw, and the cure was likely worse than the disease — leaving the seam with a sub-pixel void.

I cannot conclude which hypothesis is correct without **flat-debug renders** that show the face geometry without brick texture confusion. That is exactly what `WALL_DEBUG_FLAT` (set to `false` in commit 70c4744) was for.

---

## 2. What the user is *actually* asking

Stripping the meta-frustration out of the request:

> *Do honest research, then write a doc that says (a) what you found, (b) what you think the real task is, (c) how you'd do it, in what order, and (d) what "done" actually looks like at each step.*

The deeper expectation, supported by the screenshot and chat history:

> *Prove you can SEE the bug before you start fixing. Then prove your fix is real by showing the SAME composed scene the user is looking at — not a reassuring single-tile thumbnail.*

The actual unit of work for the next several sessions is:

**Close GitHub issue #217 honestly**, by satisfying its written acceptance criteria, with PNGs named per the spec, with a commit-SHA comment posted to the issue. Then move down the EPIC #214 list one issue at a time, in order.

---

## 3. The plan — proposed order of work

### Pre-flight (every session)

1. `node experiment/isometric-2.0/AiTools/test-relay.mjs` — confirm relay live (<200ms).
2. Read the target issue's **acceptance criteria** verbatim. Paste them into the working notes.
3. Look at the most recent annotated user screenshot. Note where they have drawn boxes/arrows. **That is the test, not your single-tile thumbnail.**
4. Set `WALL_DEBUG_FLAT = true` (or thread `debugFlat` through the MCP tool — see §5) for any geometry change. Texture is a distraction during geometry work.

### Step 1 — Ship #217 honestly (current session and next)

This is the immediate task. The screenshot shows the bug; we have to fix it.

**1.1 Reproduce the void in a flat-debug render.**
- Render the same 7×7 perimeter the user did, but with `WALL_DEBUG_FLAT=true` so each face is a solid colour and the seam is visible without brick noise.
- Save as `ProgressEvaluations/issue217-perimeter-flat-debug-baseline.png` and commit. *Do not edit code yet.*

**1.2 Render `corner-br` in isolation in a 3-tile mini-context.**
- Build a scene with grass underneath, a horizontal stone-wall to the right of the corner, and a vertical stone-wall below it. This is the smallest scene that reproduces the camera-facing outer corner.
- Save as `ProgressEvaluations/issue217-corner-br-mini-flat.png`.
- Use `render_geo_proof` to get the screen coordinates of the iso top vertex of the corner cell. Mark them in working notes.

**1.3 Diagnose, then fix one variable at a time.**
- Hypothesis A: clip path in `drawExtrudedNano` for the right-face of the bottom arm is too narrow.
- Hypothesis B: Z-order between right-arm front and bottom-arm right is wrong; the *farther* face should draw *first* (painter's algorithm) but for an outer corner both arms tie on Y.
- For each hypothesis: change ONE thing in `nano-tile.ts`, re-render the same mini-scene, diff against baseline.
- A change is only kept if (a) the void shrinks AND (b) no new voids appear in any other corner variant.

**1.4 Re-render, with texture back on, the full perimeter.**
- Save as `ProgressEvaluations/issue217-perimeter-fixed-{N}.png` where N is iteration number.
- Save the per-variant 8 PNGs the spec actually asks for, with the spec's names:
  - `nano-stonewall-straight-h.png`
  - `nano-stonewall-straight-v.png`
  - `nano-stonewall-corner-tr.png` ← spec mentions this one explicitly
  - `nano-stonewall-corner-br.png` ← the problem child
  - `nano-stonewall-corner-tl.png`
  - `nano-stonewall-corner-bl.png`
  - `nano-stonewall-cross.png`
  - `nano-stonewall-tee-t.png` (or one of the four tees)

**1.5 Post a comment on #217 with the commit SHA and PNG filenames. Close.**

**Definition of done for #217 (per the issue):**
- [ ] `render_nano_tile stone-wall straight-h` → H box: front face brickwork, right end cap, flat stone top. NO Z-pinned billboard fallback.
- [ ] `render_nano_tile stone-wall straight-v` → V box: correct face matrix, cap at different end.
- [ ] `render_nano_tile stone-wall corner-tr` → corner: both arms meet at correct angle, end caps only on open ends.
- [ ] `render_nano_tile stone-wall cross` → cross: no end caps (4-way join), 4 front face segments, full top.
- [ ] `render_nano_tile cathedral-wall straight-h` → cathedral palette (dark stone). *Currently missing — `cathedral-wall` is not implemented in `getVariantSvg`. This is its own task.*
- [ ] `render_nano_tile homestead-wall straight-h` → homestead palette (timber/plaster). *Same — not implemented.*
- [ ] At least 8 variants saved as `nano-stonewall-{variant}.png`.
- [ ] **My self-imposed extra:** the 7×7 perimeter scene, with the user's exact viewing angle, has zero visible voids when zoomed to 200%.

### Step 2 — Backfill #215 (Base Biome Tiles)

Why second, even though it's marked [1/12]: the perimeter render in #217 already exercises grass biome tiles. If they look acceptable in that context they probably pass #215 too. The remaining work is:

- Render 5×5 single-biome PNGs for the 6 biomes (`grass`, `dirt`, `rock`, `water`, `sand`, `dry-grass`).
- Verify diamond edges are sharp (sub-pixel test).
- Save as `biome-{name}-5x5.png`.
- Comment on #215 with SHA + filenames. Close.

**Definition of done:** all 6 biome PNGs committed, no visible stretching, no edge bleed.

### Step 3 — Ship #216 (Positive-Z Billboards)

- Validate fence variants in the same way: render in a perimeter (3×3 minimum, since fences also have corner variants), inspect for voids.
- Render gate and tall-grass single tiles.
- 4×4 grid of all 16 fence variants → `nano-fence-all-variants.png`.
- Comment SHA + filenames. Close.

**Definition of done (per #216):** all named PNGs committed; fences upright (no shear of the post tops); tall-grass is semi-transparent.

### Step 4 — Ship #218 (Negative-Z Carve-outs)

- River straight-h, river cross, river-bank straight-h.
- Critical visual check: in a mixed scene with grass + river, the river surface must be measurably **lower** than surrounding grass. Use `render_geo_proof` to confirm pixel offset matches `abs(zOffset) × Z_PX_PER_LEVEL`.
- Edge blending (4-side gradient) must be visible.

**Definition of done (per #218):** `scene-river-in-grass.png` shows visible sink; bank tile blends correctly.

### Step 5 — Ship #219 (Continuous Solver)

This one tests *the solver*, not the renderer:

- Place 5 stone-wall tiles in a horizontal row, run solver, every tile must come out as `straight-h`.
- 3×3 fence perimeter → 4 corners must auto-pick `corner-{tr,tl,br,bl}`.
- River cross → centre tile must be `cross`.

**Definition of done (per #219):** all 4 named scene PNGs committed; visual inspection confirms variant assignment matches the layout.

### Steps 6–11 — #220 through #225 in order

Each follows the same pattern: read spec, build minimal repro, validate visually in composition, save spec-named PNG, comment SHA, close.

### Step 12 — #226 (Full Integration)

Only attempted once everything above is closed.

---

## 4. What "visual understanding" actually means here

The previous failure mode was:

1. Render a 1-tile SVG → looks fine
2. Conclude "the geometry is correct"

What is **actually required**:

1. **Render the composed scene at the size and angle the user has been showing.** A 320×320 single-tile is useless for corner validation.
2. **For corner work specifically: zoom to ≥200% and screenshot the suspect corner pixel-region.** The void is ~3–8 px wide and disappears at thumbnail scale.
3. **Render the same scene with `WALL_DEBUG_FLAT=true`.** Texture noise hides geometry holes. Solid colours expose them.
4. **Render BEFORE and AFTER on every code change.** If the BEFORE doesn't show the bug clearly, your test isn't strong enough.
5. **Cross-check the four corner variants together.** A fix for `corner-br` that breaks `corner-tr` is not a fix.
6. **Diff the two PNGs explicitly.** Even an `Image.open(a) - Image.open(b)` pixel-XOR script saved next to the PNG would be more honest than "looks the same to me."

Until these become reflexes, no claim of "validation passed" is credible.

---

## 5. Tooling gaps to fix while doing the above

These are small, but each removes a future failure mode:

1. **`debugFlat` MCP parameter.** Currently `WALL_DEBUG_FLAT` is a constant in `solver.ts`. Wiring it through `render_nano_tile` / `render_iso_scene` as a boolean param means flat-debug renders no longer require source edits between iterations. Already noted as "Open Question 5" in the visual dev plan; implement it now.
2. **Built-in scene `wall-7x7-perimeter` in [scene-registry.ts](../experiment/isometric-2.0/AiTools/scene-registry.ts).** Eliminates ad-hoc inline `entries[]` arrays so every session renders the *same* perimeter for comparison.
3. **Built-in scene `corner-br-minicontext`** (and one each for the other three corners) — the smallest scene that exercises a corner with neighbours.
4. **A `pngDiff` script** in `scripts/` or `experiment/isometric-2.0/AiTools/` that pixel-XOR-compares two renders and writes a third PNG highlighting deltas in red. Two lines of `sharp` or `pixelmatch`. Makes regression detection trivial.
5. **Issue-comment helper** — a one-liner shell function `gh issue comment $N --body "Validated: commit $SHA, PNG: $FILE"` so closing per the EPIC rule is friction-free.

These should be done *before* attempting #217 if the session has budget; otherwise interleave them as needed.

---

## 6. Risks and how I'll watch for them

| Risk | Mitigation |
|------|-----------|
| Fixing `corner-br` regresses the other three corners | Always render all 4 corners side-by-side after each change |
| Fixing the void introduces overlap (light bleed in the seam) | Zoom 200% and inspect; the seam should be exactly 0px wide, neither void nor overlap |
| `WALL_DEBUG_FLAT=false` re-introduces the void after texture is back on | Always re-render textured AFTER the flat-debug check passes |
| Cathedral-wall and homestead-wall are not yet implemented but #217 lists them | Treat as scope-creep; close #217 with stone-wall verified, file separate sub-task for the other two if needed |
| Naming-convention drift (`stone-wall-perimeter-clean-vN.png` vs `nano-stonewall-{variant}.png`) | Use the spec names from now on; keep the legacy `clean-vN` PNGs as session checkpoints in a subfolder, not as issue evidence |
| Chat-context exhaustion before fix lands | After each successful diagnostic step, write a TWO-LINE breadcrumb to `/memories/session/iso2-progress.md` so a fresh session can resume |

---

## 7. Immediate next action (proposed)

If approved, the very next action is **§3 Step 1.1**: render the same 7×7 perimeter the user screenshotted, but with `WALL_DEBUG_FLAT=true`, and save it as `ProgressEvaluations/issue217-perimeter-flat-debug-baseline.png`. That is the honest "before" picture. Only after that's saved do I touch any code.

I will NOT claim corners are clean again until I've shown a side-by-side pixel-XOR diff at the suspect corner and the diff is empty.

---

## 8. Open questions for the user before I start fixing

1. **Naming convention:** stick with the spec's `nano-stonewall-{variant}.png` and let the `*-clean-vN.png` files become legacy, or keep the `vN` checkpoint chain alive in parallel?
2. **Cathedral-wall / homestead-wall:** the #217 acceptance criteria list them, but they're not implemented in `getVariantSvg`. Implement them in this issue, or split into #217a / #217b?
3. **MCP tooling priority:** worth investing the ~30 min to add `debugFlat` as an MCP parameter before starting the actual corner fix, or push through with source edits?
4. **Branch / PR strategy:** keep committing directly to `experiment/isometric-2.0` as has been the pattern, or open a `fix/issue-217-corner-void` sub-branch and PR?

I will proceed with the most-likely-helpful default for each (spec names, split cathedral/homestead out, add `debugFlat` first, direct commits with explicit SHAs in issue comments) unless told otherwise.
