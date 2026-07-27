# Summary: IsoVisualLoop Agent + Strategic Plan Ready

**Prepared by**: GameMan (initial analysis)  
**Target Agent**: IsoVisualLoop (specialized for Iso 2.0 tight-loop visual iteration)  
**Date**: April 10, 2026  
**Status**: ✅ Agent definition + strategic plan complete. Ready to switch.

---

## What Was Created

### 1. IsoVisualLoop Agent Definition
**File**: `.github/agents/IsoVisualLoop.agent.md`

A dedicated agent configuration for **tight-loop visual iteration on Iso 2.0 features**. Key points:

- **Core purpose**: Complete stone-wall → fence → river visual development via rapid MCP tool iteration
- **Scope**: 3 major features (stone-wall, fence, river) + sprite polish + performance baseline
- **Workflow**: Code change → MCP render (<100ms) → vision inspection → iterate (3–5 cycles per feature)
- **Key rules**:
  - MCP tools are mandatory for validation (not optional)
  - Small, focused commits (one visual improvement per PR)
  - Hot-reload discipline: zero restart for engine changes
  - Evaluation PNGs are proof of completion
- **Priorities**:
  - Priority 1: Stone-wall corner validation + completion (30% effort)
  - Priority 2: Fence variants (25% effort)
  - Priority 3: River aesthetics (20% effort)
  - Priority 4: Sprite polish (15% effort)
  - Priority 5: Performance baseline (10% effort)

### 2. 7-Week Strategic Roadmap
**File**: `Docs/Iso2.0-VisualDevelopmentPlan.md`

A master plan for unblocking visual development. Includes:

- **Current state snapshot**: What works (MCP + hot-reload), what's missing (fence variants, river polish, perf profile)
- **Phase breakdown** (7 phases × 1 week each):
  - Phase 1: Stone-wall completion (corner validation, collision QA, perf profile)
  - Phase 2: Fence variants + quality
  - Phase 3: River aesthetics
  - Phase 4: Sprite polish + optimization
  - Phase 5: Performance baselines
  - Phase 6: Integration prep
- **Resource allocation**: ~26–33 agent hours total (token-efficient via MCP-first approach)
- **Risk assessment**: Scope creep mitigation, MCP reliability, performance regression prevention
- **Success metrics**: All 3 features shipped + polished + <16ms per-frame performance
- **Open design questions**: Flagged 5 decisions (shadow lighting, fence material, river animation, mobile, PNG versioning)

---

## Why This Matters

**The core problem**: Development stalled for >1 month because the feedback loop was **too expensive**. Every iteration required:
1. Modify code
2. Rebuild (or restart)
3. Start game server
4. Navigate to test location
5. Manually inspect
6. Screenshot or memory-based guess
7. Change code again

**Repeated 5–10 times per feature = 2+ hours per feature cycle.**

**The solution**: Leverage the MCP tool (which already exists and works) as the **primary validation mechanism**:
1. Modify code
2. MCP render (<100ms, <50 tokens)
3. Vision inspect (instant)
4. Repeat 3–5 times per feature
5. **Total per-feature cycle: 30–60 minutes** (vs. 2+ hours before)

**Token efficiency**: MCP renders consume ~20–50 tokens per call. Screenshot-based iteration consumes 500+ tokens (Playwright setup + screenshot payload + reasoning).

---

## How to Switch Agents

In VS Code Copilot Chat:

1. **Open Copilot Chat** (Ctrl+Shift+I or Cmd+Shift+I)
2. **Look for agent selector** (top left of chat, usually shows current agent name)
3. **Click agent selector** → Choose `IsoVisualLoop` from dropdown
4. **Paste the follow-up prompt** (provided below)

Alternatively, you can specify the agent in your prompt:
```
/agent IsoVisualLoop

[SWITCH TO IsoVisualLoop AGENT MODE]
...rest of prompt...
```

---

## Follow-Up Prompt for IsoVisualLoop Agent

Copy and paste this into Copilot Chat **after switching to IsoVisualLoop mode**:

```
[CONTEXT HANDOFF TO IsoVisualLoop]

I've prepared a strategic plan for tight-loop visual iteration on Iso 2.0 features.
You now have:

1. Agent definition: .github/agents/IsoVisualLoop.agent.md
   - Workflow rules, priorities, debugging checklists
   - Performance targets, tool reference

2. 7-week roadmap: Docs/Iso2.0-VisualDevelopmentPlan.md
   - Phase breakdown, task list, resource allocation
   - Risk mitigation, success metrics

CURRENT TASK (Priority 1 — Phase 1, Week 1):
Stone-wall corner variants validation + completion

GOAL:
- Iterate on corner-br, corner-bl, corner-tr, corner-tl rendering
- Ensure clean geometry (no voids, clean mortar lines, brick continuity)
- Validate all variants: straight-h/v, corner×4, tee×4, cross, isolated, end×3
- Target: save stone-wall-perimeter-clean-v10.png as evaluation checkpoint
- Acceptance: all corners render cleanly + collision works in-game

CONTEXT:
- Latest good render: stone-wall-perimeter-clean-v9.png (7×7 perimeter visible)
- Recent work: Exact collision via wallBounds() + pointHitsWallFootprint(), running-bond brick texture, top-cap scale tuned
- Commit dd9588a: "fix: exact wall-strip collision and tighter top-cap brick scale"
- Hot-reload ready: changes to src/solver.ts go live on next MCP call (no rebuild/restart needed)

NEXT STEPS:
1. Start by rendering the current stone-wall perimeter with render_iso_scene
   - 7×7 grid with all corner + tee variants
   - Include 8-player boundary overlay for spatial context
   - Save metadata: which variants look clean, which need work

2. Inspect visually:
   - Are there visible voids at corners?
   - Are mortar lines clean + continuous?
   - Do brick patterns align across corner boundaries?
   - Do tee variants render correctly?

3. If issues found:
   - Identify root cause (wallBounds logic? stoneWallSvg variant handling?)
   - Make targeted code changes to solver.ts
   - Re-render + inspect (iterate 3–5 times typical)

4. When satisfied:
   - Commit progress: "fix: stone-wall corner geometry — <specific outcome>"
   - Save evaluation PNG: stone-wall-perimeter-clean-v10.png
   - Summarize findings in commit message

CONSTRAINTS:
- Strict scope: only stone-wall corner validation this session
- No performance tuning yet (that's Phase 1 task 4)
- No fence/river work (that's Phase 2/3)

VALIDATION:
- MCP render_iso_scene is mandatory (you must see the result before marking done)
- Evaluation PNG is proof
- Collision testing (manual in-game) happens next if geometry passes

Ready? Start by calling render_iso_scene with all stone-wall corner variants.
```

---

## Key Insights from Analysis

1. **MCP tool is production-ready**: The hot-reload relay architecture works. Changes to `src/solver.ts` + `src/nano-tile.ts` are live on next MCP call.

2. **Evaluation PNGs are the ground truth**: The v9 perimeter PNG looks visually correct. Use this as the baseline + iterate from v10, v11, etc.

3. **Stone-wall is ~80% done**: SVG generators, brick texture, collision math are all in place. What's missing is final visual QA + corner validation.

4. **Fence should be easier**: Same architecture as stone-wall; just needs variant iteration + color tuning.

5. **River is the wildcard**: Aesthetics aren't locked yet. Will likely take 2–3 iteration cycles to nail the look.

6. **Performance is likely fine**: No bottleneck signals in recent commits. Phase 5 profiling will confirm.

7. **Documentation is debt, not blocker**: The 15+ "TODO: DOC" markers are intentional. They don't block visual work; they're just markers for doc agent later.

---

## Token Efficiency Comparison

| Approach | Tokens per Iteration | Time per Cycle | Feedback Delay |
|----------|------|----------|---|
| **Old**: Game server + screenshot | 500–1000 | 5–10 min | High (context loss) |
| **New**: MCP render + vision | 20–50 | <1 min | Instant (in-context) |
| **Savings**: | **95%** | **10x faster** | **Immediate** |

For a 3-feature sprint (15 iterations typical), token savings = **7,050 tokens** (5 sessions worth!).

---

## Commit History (for context)

The experiment/isometric-2.0 branch has been steadily refining stone-wall:

```
dd9588a - fix: exact wall-strip collision and tighter top-cap brick scale
95cf0ce - fix: recover stone-wall demo with aligned brick scale and 8-player boundary render
c9fcdfc - fix: stone-wall height=depth, pixel-direct SVG coords, player scene
91595e6 - fix: stone-wall corner dual-arm geometry + cap brick scale
36bdf88 - fix(solver): stoneWallTopSvg — eliminate 90deg alternation, unify brick strips
89f8994 - progress(eval): stone-wall perimeter v2 — corners filled, no voids
1e2b607 - docs: document hot-reload relay architecture across agent/instruction/README
a769bb4 - fix(nano-tile): extend secondary arm face to all tee variants
64a1536 - fix(nano-tile): add secondary arm face for corner variants; fix NANO_Z 3.5; hot-reload relay
1c4c9b3 - fix: depth-sort players + positive nanos in renderNanoScene (#220)
```

Each commit shows incremental visual refinement. The v9 evaluation PNG is the latest ground truth.

---

## What's Next After Stone-Wall

Once stone-wall is done:
1. **Fence** (same MCP workflow, ~8 hrs effort)
2. **River** (aesthetic iteration, less code-heavy, ~5 hrs)
3. **Polish** (sprite quality + simplification, ~5 hrs)
4. **Performance** (baseline profiling + optimization, ~5 hrs)

**Total**: ~30 hrs over 7 weeks, divided into focused 2-4 hr sessions with MCP validation.

---

## Debugging Checklist (Quick Reference)

If MCP tool seems stale:
```bash
cd experiment/isometric-2.0/AiTools
node test-relay.mjs
# Should print: "✓ stone-wall straight-h rendered in <200ms"
# If error: npm run build + MCP restart
```

If corner geometry looks wrong:
1. Use `render_geo_proof` variant=reference to see canonical iso box
2. Use `render_nano_assembly` to zoom in on corner + adjacents
3. Check `wallBounds()` in solver.ts — is arm combination correct?

If performance regresses:
1. Profile chunk bake time + per-frame draw separately
2. Check if `drawExtrudedNano()` call count grew
3. Use `render_iso_scene` with `debug: true` for tile bounds

---

## Final Checklist Before Switching

- [ ] Read `.github/agents/IsoVisualLoop.agent.md` (3 min)
- [ ] Skim `Docs/Iso2.0-VisualDevelopmentPlan.md` phases 1–2 (5 min)
- [ ] Review stone-wall-perimeter-clean-v9.png (visual baseline)
- [ ] Switch agent to IsoVisualLoop in Copilot Chat
- [ ] Paste the follow-up prompt provided above
- [ ] Agent starts with render_iso_scene call (MCP tool)
- [ ] Tight loop begins!

---

**Good luck! The foundation is solid. Now it's just disciplined iteration.**

