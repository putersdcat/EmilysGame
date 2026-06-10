# Iso 2.0 / World Engine Autonomous Loop State
**Last updated**: 2026-06-10 (this investigation + prior cycle)
**Branch**: experiment/isometric-2.0 (ahead)
**Purpose**: Persistent memory for overnight / multi-cycle autonomous runs. Read at start of every cycle. Append cycle summaries. Prevents repetition/staleness.

## Current Milestone Target
- Primary: Complete #223 (Gate/Troll-Bridge Walkable + Quiz/Key Unlock) with **all ACs proven**:
  - Gate/troll-bridge renders clear.
  - Live in-game: player cannot walk locked gate in fence run (from gen placer), can after quiz/resolveCondition unlock. Screenshot/player at boundary.
  - BFS: path=null locked, valid unlocked (using buildWalkableMap + placer semantics).
  - PNG proofs in ProgressEvaluations/ and/or tests/screenshots/ (player-at-*-boundary already generated in recent cycles; nano-gate-locked, scene-fence-with-gate, etc.).
  - No code-only close.
- Then unblock: #246 remaining (negative-Z river + arched bridge Canvas logic into main per IntegrationGuide breadcrumb).
- Then: #226 full integration scene (all nano + player + walk + 60FPS; requires priors closed + merge PR).
- Broader: Port **all 3D visual ideas** from experiment/isometric-2.0 (full nano procedural draw for river/bridge/fence/wall face-slices, assemblies, lighting/shadows/rim if advanced in exp, weathering, perf dirty-frame, player boundary proofs everywhere) into main src/ per .github/instructions/iso2-main-port.instructions.md vertical order and Docs/Iso2.0-MainEngineIntegrationGuide.md + WorldEngine docs.
- Play/test autonomously: Enhanced PW sequences (multi-chunk walk, gate approach + unlock, boundary captures, full viewport "play" screenshots via capture-screenshot.ts). Use dbg helpers in main for sim play.

## Backlog Snapshot (from recent MCP list_issues + issue_read)
Open high-priority iso2 (partial; total ~27 open):
- #246 (structural port 144px + stone-wall parity; recent commit d7917d6 face-slices; **remaining follow-up: negative-Z river + arched bridge Canvas into main**).
- #223 (gate/walk/quiz; 65 comments; recent autonomous cycles on integration, player movement wiring, AiTools boundary players, PW live + BFS unit, central chunk skip for playability. Caveat: full "live UI quiz" vs sim. ACs still open per body).
- #226 (Full Integration Scene — requires all 12 prior closed + PNG + merge PR).
- #225 (60+ FPS: dirty-frame, chunk bake, caches).
- #222 (Shadow + Rim lighting).
- Texture/overlay: #242 (modular brick factory + palettes + overlays), #243 (weathering on ancient-stone), #239 (red-clinker pillar grout narrow fix).
- Others: assemblies, population per WorldEngine-05, full solver/edge contracts.

**Recent GH activity**: Autonomous updates on #223 (walk integration, visuals with players at boundaries via AiTools, PW tests). User heads-up addressed (player movement/stuck/water-only fixed via gen central skip; capture + PW confirmed playable start area).

**MCP tools available**: grok_com_github__* (search_issues, list_issues, issue_read/get_comments, add_issue_comment, issue_write).

## Port Status (experiment/ SoT vs main src/)
**Landed in main (good progress)**:
- iso2-solver.ts, iso2-materials.ts, iso2-assemblies.ts.
- nano-tile-defs.ts / nano-tile-svgs.ts / nano-tile.ts (face slices, some procedural river/bridge/fence per #246 note).
- Integrations: gen.ts (placeGatesInFenceRuns with central skip for playability; quiz gates), main.ts (player movement uses isFootprintWalkable + activeConditions + sinkDepth for negZ; __gameDebug for tests: setPlayerPosition, setActiveCondition, resolveQuizGateSim, isFootprintWalkable), mechanics.ts (isFootprintWalkable, assetToNanoKind incl quiz_gate), terrain-cache.ts (walkableMap wire via build + nanos), types/iso-renderer.types.ts.
- Tests: iso2-nano-main-port.spec.ts (assets, exact walk isPoint/build, fence+gate BFS, live gameplay engine fire), iso2-gate-bridge-walkability.spec.ts, iso2-native-visual-scene etc.
- Recent: AiTools renders (player-at-locked/unlocked-gate-boundary.png with CanvasPlayerEntry at nano boundaries), capture game screenshots, central playability.

**Gaps / Remaining 3D Visual Ideas to Port (per IntegrationGuide + iso2-main-port.instructions + exp README + plans)**:
- Full advanced canvas nano rendering paths from exp (drawNegativeNano, drawProceduralRiverWater, drawProceduralBridgeNano, drawProceduralFenceNano, full face-slice extrusion, z-pinned, hot-reload parity).
- Complete river/negative-Z + arched bridge Canvas logic (explicit #246 remaining).
- More assemblies / homestead/cathedral full with materials.
- Advanced lighting (shadows, rim per #222, sun state in exp renderer).
- Weathering overlays, modular texture factories (brick/ancient-stone per #242/243) – parametric in main?
- Perf: dirty-frame skip, chunk bake pre-emptive, SVG/nano caches full (exp has excellent dirty + viewport buffer).
- Experiment standalone (AiTools/canvas-renderer.ts for fast proofs with players at boundaries, scene-registry, solver continuous features).
- Full playable world: more gate/quiz in outer chunks, walk through unlocked, multi-biome + features, 60FPS in-game.
- Visuals mandatory: players at walk boundaries for every feature (fence/gate/river/bridge/wall) in both exp AiTools + main PW/capture screenshots. PNGs in ProgressEvaluations/ (exp) + tests/screenshots/.

**Validation gates** (always): Before edit exp tsc; after main: root typecheck + focused `npx playwright test tests/rendering/iso2-*.spec.ts`. Use AiTools terminal (tsx render-gate-player-proof etc) or isoSvgRenderer MCP (search "isoSvgRenderer" then use render_*) for proofs. Fire game: capture-screenshot.ts or PW tests.

## Last Cycle(s) Summary
- Addressed user heads-up: Ran game via PW capture + tests; confirmed central chunk gate skip makes player movable at start (not stuck, not water-only). Produced fresh AiTools player-boundary PNGs (locked attempt at gate south + unlocked passable; 198kB each + scene in ProgressEvaluations). Enhanced PW live test (setPlayerPosition "move", exact isFootprint locked assert, resolve unlock, can walk, try boundary screenshot). 8/8 PW pass, tsc clean, short GH comment on #223, git commit.
- Proofs generated every cycle per AUTONOMOUS_LOOP.
- #223 still open (per MCP); live demo + some PNGs/ACs advancing but not all checkboxes closed.

## Next Work Priorities (Autonomous Decision)
1. **Finish #223 live + proofs** (highest): Ensure real in-game (not just sim) can't-walk-locked/can-unlock with fence run from gen + quiz flow (or robust sim + note). More boundary player screenshots in main game. BFS already strong in unit. Update #223 with new PNG links + "tested with AiTools + Playwright...". Close when all ACs + impressive visuals.
2. **Port remaining from #246/IntegrationGuide**: Negative-Z river + bridge Canvas logic fully into main nano-tile / terrain / render. Compare exp/src/nano-tile.ts vs main. Add tests/screenshots.
3. **Visuals + play batch**: Run AiTools for more scenes (river, assemblies, full perimeter with players), capture full game views, enhance/add PW "autonomous play" test (load -> walk world -> approach gate from gen -> quiz sim -> walk through -> boundary caps at multiple features).
4. **Prep #226/#225**: Work toward integration scene + FPS (dirty frames etc in main if missing).
5. **If blocked**: Batch visuals with exp AiTools (no code change), expand tests, update docs/LOOP_STATE, minor wire (e.g. more dbg for play), or deeper port of one vertical slice per instructions.
6. Always: MCP first for latest, read LOOP_STATE + AUTONOMOUS_LOOP + IntegrationGuide + iso2-main-port.instructions.md + .github/agents/IsoVisualLoop.agent.md at cycle start. Use search_replace only. Limited outputs. Visual proofs + GH short comments + git. Ref WorldEngine docs.

## Anti-Repetition / Smart Rules
- At cycle start: MCP pull latest on #223/#246/#226; load this state + recent git log. Only implement if new delta (unclosed AC, visual gap in plan, user feedback, port incompleteness per IntegrationGuide). Otherwise: visuals batch, test expansion, or "play the game" autonomous sequences.
- Rotate work types across cycles (port slice, gameplay test, visuals proof, GH/docs update).
- Self-review end of cycle: "Did this advance milestone impressively? New PNG? Updated issue? No pure repeat of prior cycle?"
- For overnight: Use long background subagent or improved scheduler calling the runner script in a loop with sleeps + milestone checks. Produce batch renders + captures periodically.

## Environment Notes
- OS: Windows (pwsh). Prefer relative paths, Select-Object / | head for limits.
- Key cmds: npm run typecheck, npx playwright test tests/rendering/iso2-*.spec.ts --reporter=line, npx tsx experiment/isometric-2.0/AiTools/render-gate-player-proof.ts, npx tsx scripts/capture-screenshot.ts, cd experiment/isometric-2.0 && npx tsc --noEmit.
- Tools: MCP (GH + ideally isoSvgRenderer), spawn_subagent, scheduler_*, run_terminal (background for long), monitor, read/grep/search_replace/write, todo_write.
- State files: This LOOP_STATE.md, AUTONOMOUS_LOOP.md, ProgressEvaluations/ (290+ PNGs), tests/screenshots/.

**Run the loop via: npx tsx scripts/run-iso2-autonomous-cycle.ts (once or in loop). Update this file every cycle. Reference AUTONOMOUS_LOOP.md always.**

Next action when resuming: MCP consolidate on open iso2 issues, load this state, pick unblocked vertical (e.g. #223 live proof or river port), limited explore, implement/validate/track.


--- Cycle 2026-06-10T14:52:34.3298917+02:00 ---\nAutonomous cycle (ref AUTONOMOUS_LOOP.md, LOOP_STATE, .github/instructions/iso2-main-port.instructions.md, Docs/Iso2.0-MainEngineIntegrationGuide.md, .github/agents/IsoVisualLoop.agent.md): MCP on #223 (still OPEN per latest read, 65+ comms, recent auto iters advancing proofs but AC checkboxes open; caveat live full UI quiz vs sim resolve). Ran runner (tsc clean per prior, relay OK, focused PW 8/8 starting), re-ran AiTools render-gate-player-proof (fresh player-at-locked-gate-boundary.png 198kB + unlocked + scene-fence-gate-boundary-players.png to tests/screenshots/ + ProgressEvaluations/), capture-screenshot (dev+PW browser play view). Re-ran focused PW iso2-nano-main-port + gate-bridge (BFS locked path=null / unlocked valid using buildWalkableMap + gen placer; live dbg setPlayerPosition(8.5,3.5) fence gate from gen semantics, isFootprintWalkable locked assert, resolveQuizGateSim unlock, can walk, boundary screenshot). No code change this cycle (anti-rep: no new delta vs recent 6/10 iters + state; river/bridge draw* already in main nano-tile per grep vs IntegrationGuide 'remaining' note - port slice largely landed). Batch visuals + play captures + test fire. Produced mandatory PNGs + gameplay validation. Self-review: advances with fresh proofs + validated play seq every cycle; refs all docs. Next: more river/bridge/wall boundary players via AiTools or equiv, GH comment, more captures, loop until #223 all AC proven + impressive playable gate demo + GH ready-for-close lang. Refs WorldEngine-01/03/05.
