# Operator guidance (2026-07-30) — binding for this product

> **HISTORICAL / SUPERSEDED 2026-08-13.** No longer current law.
> Current law: root `AGENTS.md`. Cutover: `cutover-prompt-2026-08-13.md`.
> Direction 1 (LLM-native inspect) and Direction 2 (boot lockup notes) are
> historical facts to recover, not a ban on rewrite. “One scoped `/goal` /
> no whole-game dump” is repealed.

**Author:** repo owner (human). **Status:** historical.

## Why this note exists

Sunk agentic cost on Emily’s Game has been huge with little usable output. Iso 2.0 paint (flat sim → isometric parallax) did not become a scalable modular renderer. Visual LLM comprehension (MCP “eyes”, screenshot audits, Playwright “play and look”) consistently fails: models cannot read the iso layout. Walk-feel / Z-solid / fence work from that approach was often thrown out as regression.

**Do not resume the previous session’s collision/geometry campaign as the default next step.** That context is treated as untrusted unless re-proven from code + non-visual tests.

## Direction 1 — LLM-native sim / viewport (inspiration, not a copy)

Abandon “the model can see the game” as a goal. Assume visual comprehension will fail.

Build instead a **comprehensible, comprehensive 1:1 (or layered-filter) synthetic viewport + full sim/test layer** that is playable *to the LLM*:

- Shared world model used by renderer, collision, CLI, and tests (not a second fake physics).
- Text / JSON traces, invariants, and layered slices (walk grid, solids, occupancy, camera) that cover the view without screenshots.
- Failures must be visible **before** or **without** a human staring at the canvas.

Inspiration (data point, not a drop-in): `C:\TEMP\PlarailMemeDemo`

- `js/world-model.js` + `js/simulation/scenario.js` — same geometry for browser, CLI, tests
- `scripts/inspect-world.mjs` + `docs/PHYSICS_VALIDATION.md` — assert layouts without screenshots
- `js/train/telemetry.js` — frame events, not pixels
- Relatively weak models could iterate because they could **code + test against the sim layer**

When/if we build this for Emily’s Game, it belongs under `src/engine/` (flat sim SSOT) + a small inspect CLI — **not** more iso paint systems.

## Direction 2 — Prove worth on boot lockup first — **landed 2026-07-30**

Start Adventure / load must not freeze the tab. **Done** (`warmupWorldPaint` + 1 bake/play-frame). Load-slot menu still missing (do not restore unless asked). Active campaign is Direction 1 (inspect + synthetic play).

## Direction 3 — AmysGame

Independent sibling. Not a replacement for this repo or this game.

## Boot lockup (2026-07-30) — cause and fix

**Not** chunk gen on Start Adventure (that already ran at New Game under a spinner).  
**Yes** first play paint: `drawCachedChunkTerrain` baked every on-screen world-unit canvas (640×320 at current FOV) in **one rAF** with the spinner already hidden → browser wait-or-kill.

Fix:
- After menus, `warmupWorldPaint` bakes visible WUs one-per-yield under “Starting adventure… N/M”
- Play frames cap new WU bakes at 1 (`beginPlayTerrainBakeFrame`)
- Tests: `tests/perf/start-adventure-hang-fix.spec.ts`

Load/continue hit the same first-paint path; they get the same warmup. Slot-menu restoration was **not** in this prove-worth task.

## Human verify after agent edits

Vite serves `/main.ts` live, but the **browser tab often keeps the old module graph**. After any paint/boot/JS change the human must **Ctrl+F5** (hard reload) before judging lockup, spinner, or gameplay. Playwright `?test=1` skips menus and is **not** proof of the Start Adventure path.

## How agents should work after this note

1. Durable notes here + `product-campaign-progress.md` — not session novels.
2. Prefer **yielding main-thread work + mechanical tests** over screenshot “does it look right”.
3. Do not thrash `COLLISION_*` / FOV / nano kinds / closed campaigns.
4. If a fix is not easy, **say why** with evidence from the real call path.
5. Default operating loop: **investigate (plan mode) → owner gate on ambiguities → one scoped `/goal` campaign → Ctrl+F5 human check**. No whole-game autonomous dump.
