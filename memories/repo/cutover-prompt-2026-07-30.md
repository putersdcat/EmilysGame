# Cutover prompt (paste after `/new`)

> **SUPERSEDED 2026-08-13.** Do **not** paste this into a new session.
> Use [`cutover-prompt-2026-08-13.md`](cutover-prompt-2026-08-13.md) instead.
> The laws below (stay on branch, paint only, FOV lock, don’t reopen
> campaigns) are repealed.

Use when starting a fresh Grok session so the new brain is not poisoned by the old chat, but still has owner law + what actually landed.

---

```
You are on Emily's Game, branch experiment/isometric-2.0, product entry src/ (not nested experiment/isometric-2.0).

Read first (binding, in order):
- memories/repo/operator-guidance-2026-07-30.md
- AGENTS.md
- memories/repo/cutover-prompt-2026-07-30.md (this file — for facts below)
- memories/repo/product-campaign-progress.md (status only; do not resume its geometry campaign unless I reopen it)

Owner (human): brain-shot. I will not write granular /plan or /goal charters. I will only answer 1–3 plan questions if you must ask. You write every prompt I need to paste.

Laws:
- Stay on experiment/isometric-2.0 / src/. AmysGame is independent, not a replacement.
- Iso2 is paint only. Flat sim owns walk/progression. FOV diamonds stay 128×64.
- Do not re-run closed campaigns (scene-first, place-coherence, critical-path) as wholesale plans.
- Do not thrash COLLISION_* / RAIL_SHELF / FOV / nano kinds / WorldUnitSolver.
- Do not treat LLM visual comprehension (screenshots, MCP “eyes”, Playwright “look at iso”) as a goal. It fails. Prefer mechanical tests, traces, inspect/CLI, shared sim data.
- After any boot/paint/JS change: remind me to Ctrl+F5. Vite can serve new files while the tab keeps the old module graph. Playwright ?test=1 skips menus and is not proof of Start Adventure.

What is actually true as of 2026-07-30 (do not invent more):
- Start Adventure used to lock the tab (Chrome wait/kill) with the subject overlay still painted. Cause: first play paint baked every visible world-unit terrain canvas on one rAF after menus. Chunk gen was already done earlier.
- Fix landed and human-confirmed after Ctrl+F5: warmupWorldPaint (src/game/terrain-warmup.ts) under “Starting adventure… N/M” after runMenuFlow in src/main.ts; play frames cap WU bakes at 1 (beginPlayTerrainBakeFrame in render.ts / terrain-cache.ts). Tests: tests/perf/start-adventure-hang-fix.spec.ts.
- Load-slot menu is missing (known chaos). Not restored. Existing load/continue paths should still use the same warmup.
- Prior Grok 4.5 geometry/collision session (shelf+rail, thickness thrash, barrier-geometry SSOT campaign) is UNTRUSTED. Do not continue it as the default next step. Some files may still contain that work; treat as dirty WIP unless I reopen it.
- Product bar remains: child 5–15 min session (spawn → move → real quiz → fail gently → open → leave → another place). Expand via recipes/packs/NPCs, not new world ontology.
- Long-term owner direction (not this turn’s implement job): an LLM-native sim/inspect layer (Plarail-style world-model + inspect-world + telemetry) so agents can test without seeing iso. Inspiration only: C:\TEMP\PlarailMemeDemo. Not a greenfield rewrite.

THIS TURN — only this:
Write me a single copy-paste `/plan` prompt for the NEXT message. That plan’s job is to propose the next incremental campaign(s) given the laws above, with a done-bar I can approve without writing it myself.
Do not start /plan yourself. Do not edit product code. Do not ask me to invent the plan prompt. Output the prompt in one fenced block I can paste after I type /plan (or as `/plan` plus the text).
Keep the plan prompt short enough to paste; put file pointers in it so the planner reads the repo instead of stuffing this whole essay again.
```
