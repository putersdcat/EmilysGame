# Autonomous Development Loop for Emily's Game Iso 2.0 / World Engine

**Reference this file for self-directed work. Run autonomously until major milestones (e.g., full playable iso2 demo with walk/gates, visuals proven, per #223/#246 and WorldEngine docs). Only then seek user input.**

## Core Principles (from Proompts.md, instructions, Docs)
- **Tracking**: Consolidate ALL to GitHub issues (use grok_com_github MCP: search_issues, list_issues, issue_write, add_issue_comment). Prioritize by impact/dependencies (e.g., walkability before population). Update status, add proofs/PNGs/links. No code-only closes for iso2 (require PNG in ProgressEvaluations/ from render_nano_* or screenshots).
- **Vertical Slices** (per .github/instructions/iso2-main-port.instructions.md): Port in order - constants/types, materials, nano/solver metadata (walkability), terrain/render, collision/walkability, assemblies, tests/screenshots. Treat experiment/isometric-2.0/src/ as SoT until parity. Run exp tsc before changes; main tsc + focused iso2 tests after. Document adapters.
- **Validation Loop**: Read code/Docs/issues → understand → write → run → test visually with isoSvgRenderer MCP (search_tool "isoSvgRenderer" then use_tool for render_game_tile/render_iso_scene with players for occlusion/walk boundaries) + Playwright mcp/tests for full engine (fire dev, navigate, screenshot). Don't mark done unless functionally tested + impressive visual proof. Use terminal for renders if MCP not connected.
- **Docs & History**: Always cross-ref /Docs (WorldEngine-01 SpatialHierarchy, 03 SolverPipeline, 04 Rendering, 05 Population; Iso2 plans, integration guide, visual dev plan) + closed/open GitHub issues (milestone 5 "Iso 2.0 Verified Delivery", #246 structural, #223 walk/gate, #218 river, older epics like #6 world gen, #184 rendering). Archived-planning for context but not blocking.
- **Impressive Milestones**: E.g., 1. Walkable iso2 world (walls/fences/rivers/bridges/gates, player exact walk/sink/quiz unlock, BFS valid per #223). 2. Visuals proven (MCP renders + in-game Playwright/screenshots with players at boundaries). 3. Performance (60FPS). 4. Assemblies + population. 5. Full pipeline per WorldEngine (edge contracts, solvers, progression). Update issues with evidence.
- **Tools**: GitHub MCP for issues. isoSvgRenderer MCP for fast visuals (AiTools, hot-reload, scenes like river-crossing, fence-perimeter, assemblies; render with players for walk/occlusion). Playwright for full engine tests/rendering view (launch, interact, capture). Terminal for builds/tests/renders (test-relay.mjs, capture-screenshot.ts). tsc/tests as gates.

## Loop Steps (repeat until milestone, then pause for review)
1. **Consolidate & Prioritize (GitHub MCP first)**: 
   - search_issues / list_issues for "iso-2.0-experiment" or milestone:5, state:open/closed. Read bodies/comments (use issue_read if needed).
   - Review roadmap: Docs/WorldEngine + Iso plans + this file + Proompts + .github/instructions + current issues (#246, #223, #218 etc.).
   - Pick highest priority unblocked (e.g., walkability/collision integration from #223 after render path in #246; then assemblies; then full solver/edge contracts per WorldEngine-03; population per 05).
   - If no central issue, use issue_write to create/update master (e.g., "Iso 2.0 Walkability & Player Integration - complete #223 acceptance").

2. **Explore & Understand**:
   - Read relevant Docs (e.g., WorldEngine-01/03 for hierarchy/solver, Iso2.0-VisualDevelopmentPlan for visuals).
   - Read code (src/iso2-*.ts, experiment/isometric-2.0/src/* as SoT, main.ts for player, terrain-cache, gen.ts).
   - Check current state: git status/log, run exp tsc.

3. **Implement (Vertical, Disciplined)**:
   - Follow port order/instructions. Experiment as SoT; port/adapt (e.g., wire iso2-solver walk funcs into player collision, terrain walkableMap, gate placement).
   - Use search_replace for changes. Add tests/screenshots.
   - For visuals: Use isoSvgRenderer (discover with search_tool, use_tool render_game_tile kind=gate/river with players; or terminal node test-relay / render-worker for scene). Save PNGs to experiment/.../ProgressEvaluations/ or tests/screenshots/. Fire game: npm run dev (bg) or npx playwright test rendering/ --reporter=line or scripts/capture-screenshot.ts. Use Playwright mcp if connected for interactive view.
   - Update todo_write for internal tracking.

4. **Validate & Prove**:
   - exp tsc clean.
   - Main tsc + focused `npm run test:rendering -- tests/rendering/iso2-*.spec.ts` (or specific iso2-native-visual-scene).
   - Visuals: isoSvgRenderer MCP renders (with players at walk boundaries for fence/gate/river/bridge). Playwright in-game (load game, move player, assert no walk through locked, screenshot).
   - Performance spot-check if relevant (FPS via test or dev).
   - If passes all, impressive (visual + functional), proceed.

5. **Track & Loop**:
   - Use grok_com_github__add_issue_comment or issue_write to update GitHub (progress, PNG links, "tested with MCP + Playwright, player walks correctly").
   - If milestone complete (e.g., #223 closed with proofs), pick next.
   - Self-review: Does it advance roadmap impressively? Any blocks? Reference this loop file.
   - Repeat. Use scheduler if for recurring, but manual loop here.
   - Only break for user input on major milestone (e.g., "playable iso2 gate demo done, visuals in issues").

## Next Work (Autonomous Decision as of now)
From issues (#223 open for walk/gate, #246 river follow-up done per commits, #218 river polish), instructions (walkability next after render), Docs (walkable logic in solver, population with gates/quizzes, full hierarchy), Proompts (loop on visuals + issues):
- **Priority 1**: Complete Iso 2.0 Walkability & Gate/Bridge Logic (finish #223). Wire iso2-solver (isPointWalkableInTile, buildWalkableMap, resolve) into main player collision (main.ts/input), terrain-cache (walkableMap), gen/place for gates in fences, quiz unlock. Add BFS/pathfind support. Prove with MCP renders (players at boundaries) + Playwright in-game test (can't walk locked gate, can unlocked; pathfind works). Update #223/#246.
- Then: Assemblies full, perf/FPS (#225), shadows/rim (#222), full integration scene (#226), broader WorldEngine (edge contracts in gen per 02/03, population 05).
- Track in GitHub, visuals mandatory.

**Run this loop. Produce impressive deliverables (e.g., working iso2 world with exact walk, gates, visuals proven in engine + MCP). Update issues. Avoid user ping until e.g. full playable segment + proofs.**

(Reference: Proompts.md, Docs/*, .github/instructions/iso2-*, GitHub milestone 5 issues, current code state with iso2-solver.ts + river port.)

## Long-Running / Overnight Operation (added for reliability)
The original 5-minute static scheduler prompt injection led to repetition, staleness, and cutoff. 

**Preferred mechanisms (builds local tooling/memory/instructions):**
- **Persistent memory**: Always read `LOOP_STATE.md` (created with backlog snapshot, port status vs IntegrationGuide, anti-rep rules, cycle history) at the **start** of every cycle. Append a short summary + date at end of cycle. This is the single source of "what was done last" so you never purely repeat.
- **Runner script**: Use `npx tsx scripts/run-iso2-autonomous-cycle.ts` for each iteration. It encapsulates health (tsc + relay + focused PW), mandatory visuals (AiTools player-boundary renders) + "play the game" (capture-screenshot.ts for live in-engine state), delta-based decisioning (from LOOP_STATE + latest MCP), limited git, state append, and clear "orchestrator notes" for the next MCP/GH/subagent step. Safe, idempotent, produces proofs every run.
- **Schedulers vs background subagents**:
  - Short recurring (15-30min): `scheduler_create` with prompt "Invoke the runner script once; read/update LOOP_STATE; MCP delta check on #223/#246; if milestone near produce batch visuals and comment GH. Ref AUTONOMOUS_LOOP + LOOP_STATE."
  - Long overnight (recommended): Use `spawn_subagent` (background: true, capability_mode all or execute) with a detailed briefing that includes: full current LOOP_STATE content, AUTONOMOUS_LOOP.md, Docs/Iso2.0-MainEngineIntegrationGuide.md + WorldEngine-*, .github/instructions/iso2-main-port.instructions.md, .github/agents/IsoVisualLoop.agent.md, Proompts.md. Instruct the subagent to: "Run the runner in a while loop with 30-120s sleeps. Re-MCP at start of each inner cycle for fresh issue state. Prioritize port of 3D visuals (experiment/ SoT -> main per vertical slices), autonomous playtests (PW sequences + capture for movement/gates/quizzes/world traversal + boundary PNGs), advance/close #223 with proofs, then #246 river/bridge, prep #226. Use monitor for long cmds. Stop only on explicit 'playable iso2 gate demo done with proofs, #223 ready for close' or unrecoverable error. Log everything to LOOP_STATE and git."
  - Use `get_command_or_subagent_output` + `wait_commands_or_subagents` + `kill_command_or_subagent` to supervise.
- **Anti-staleness & anti-repetition rules** (enforced in runner + subagent prompts):
  - Every cycle start: MCP (search/list/read key issues with small perPage) + load LOOP_STATE + recent git + key docs (limited reads). Compute "delta" (new unclosed ACs, new comments, visual gaps called out in plans, user feedback).
  - Only perform code changes (search_replace) or major work if delta exists or a clear next vertical from IntegrationGuide/port order is unblocked. Otherwise: batch visuals (re-run AiTools renders or isoSvgRenderer MCP scenes with players at boundaries), autonomous play captures (multiple capture runs or enhanced PW "play" sequences), docs/state updates, or health/perf spot checks.
  - Rotate: port slice -> gameplay test enhancement -> visuals proof batch -> GH tracking.
  - Self-review every cycle end (write 2-3 sentences to state): "Advanced milestone? New PNG proof? Updated issue? Not a pure repeat?"
- **Environment & tooling built for overnight (Windows/pwsh)**:
  - Health on every cycle: main+exp tsc (limited), AiTools/test-relay.mjs smoke, focused iso2 PW or capture.
  - Visuals: terminal AiTools (render-gate-player-proof.ts etc. for player-at-boundary PNGs in tests/screenshots/ + ProgressEvaluations/) + capture-screenshot.ts for live game "play" views. If MCP connected: search_tool "isoSvgRenderer" then use_tool render_* with players.
  - Play/test autonomously: Use dbg in main (__gameDebug: setPlayerPosition, isFootprintWalkable, setActiveCondition, resolveQuizGateSim) inside PW evaluate + page.screenshot at boundaries. Enhance tests/rendering/iso2-*.spec.ts for longer sequences (walk to gen fence+gate, locked assert, unlock, pass, multi-feature boundaries). Run full capture for end-to-end in-game visuals.
  - Git: small, frequent commits of specific proofs + state + changed files only. Branch is experiment/isometric-2.0.
  - Limits respected: read with offset/limit, grep head_limit, run cmds with | Select-Object -First / head, short GH comments.
  - Subagent isolation: Use isolation "worktree" or "none" as appropriate; resume_from for continuity.
- **Exit / pause only on milestone**: "playable iso2 gate demo done with proofs, visuals committed, #223 ready for close" (or equivalent for next epic). Then human review + new target in LOOP_STATE. Update GH with all PNG links + "tested with AiTools + Playwright + runner + capture".
- **MCP first, every cycle**: grok_com_github tools (list/search/issue_read/add_issue_comment). Consolidate backlog, read latest comments on #223 etc., add short progress + PNG links. Use issue_write only if creating master tracker.

**How to leave overnight**: Delete old short schedulers if stale. Create/improve one long scheduler **or** (better) spawn a background subagent with the briefing above + "use the runner script in loop". Check logs / subagent output / new PNGs / GH comments / git log in the morning. Major progress expected on port (3D visuals into main), #223 ACs closed with proofs, autonomous play validated, LOOP_STATE + docs updated.

Always reference this file + LOOP_STATE.md + the IntegrationGuide + iso2-main-port instructions in every iteration. Use todo_write at start/end of cycles. Be autonomous until the explicit milestone.