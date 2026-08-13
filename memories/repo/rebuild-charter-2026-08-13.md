# Rebuild charter — 2026-08-13 (wide)

> **SUPERSEDED 2026-08-13 (same day, later).** This charter still assumed
> stay-on-branch incremental repair of `src/`. Current law: root `AGENTS.md`.
> Living design: `docs/intent/`. Rewrite branch: `rewrite/intent-first`.
> Gravity list below is historical diagnosis, not a patch plan.

**Status:** historical. Fence corners are one symptom.  
**Former branch:** `experiment/isometric-2.0`. **Entry was:** `src/`. AmysGame is independent.

Today proved agents will shrink the job to the last screenshot and then guess. This file is the **gravity list**. Execute via LOOP + one domain `/goal` at a time. Do not skip **G0-WIDE**.

## Slash commands (what actually helps)

| Command | Use |
|---------|-----|
| `/new` + cutover | Fresh brain. Paste `memories/repo/cutover-prompt-2026-07-30.md` then LOOP+G0-WIDE. |
| `/goal` + LOOP + one G# / D# | Only execution unit. One seam. |
| `/plan` | **After** G0-WIDE writes `rebuild-audit.md`, if you want a DAG. Not before — planning without the audit repeats today. |
| `/review` | After a D# that touched a lot of files. |
| Deep-dive / explore | Optional **inside G0-WIDE** (read-only fan-out). Not a substitute for G0. |
| `/execute-plan` | Only if you pointed at a **current** design from G0, not old closed epics. |

There is no “listen harder” slash. If an agent skips G0-WIDE or “just fixes the fence,” stop them.

## Gravity (why it is everywhere)

From live `src/` + archives (not one corner):

1. **Two worlds in one process** — Flat grid sim (`docs/02`, `03`) vs iso paint that carries walk rules in nano types (`docs/12` §3: `getNanoStack` / `iso2/walkability` / `mechanics`). Paint Z and sort (`render.ts` `gy + height*0.4`) disagree with collision rails (`walkability-query` + `barrier-geometry`). Addendum *already* named this in 2026: wide berths + occlusion failure (`archived-planning/Additional Technical Details…Addendum.md`).
2. **Two walk stacks** — Motor uses `walkability-query`. Residual `iso2/walkability` + `buildWalkableMap` in `terrain-cache`. Dual connect: `tile-variants` vs `barrier-connect`.
3. **Two gens** — `generateChunk` (async LLM entropy) is largely unwired. Play uses `generateChunkSync` (hash + buffer). `docs/06` entropy loop is only half live. LLM = 8005.
4. **Grammar vs noise** — WorldEngine wants Micro→Nano→WU→Macro contracts. Live gen is still Perlin + stamps + chance modular scenes (`docs/12` §5). Materials exist in `src/asset-pipeline/iso2-*`; places are still emoji shops and dirt salt.
5. **Progression vs scatter** — `docs/01` loop and WorldEngine-05 want unavoidable solvable gates, lock-key order, NPC-owned quizzes. Live: origin teaches **no** quiz; modular scenes skip `chunkDist ≤ 1`; gates are solvable but bypassable (`docs/13` §2). A second pen on the dirt leave was a regression of “no barrier without function.”
6. **Inspect is a stub** — `src/engine/inspect` dumps cells. It cannot see `projectFencePoint` posts, player sprite AABB, or sort keys. That is why “tests green” and playtest failed.
7. **Closed campaigns are landed rails, not the product** — Scene-first, place-coherence, critical-path, boot warmup. Do not re-run as wholesale plans. Do not treat them as “the game works.”
8. **Dead / dup / inline** — `debug-api` kitchen sink; load-slot menu missing; `EDGE_COMPAT` asymmetry deferred; content pipeline 2/4 (`docs/12` §2).

## Outcomes (docs, not vibes)

`docs/01` pillars + GameBible + WorldEngine-05 + addendum DoD:

| # | Outcome |
|---|---------|
| O1 | Flat sim is SSOT for walk and gate open; paint never decides progression |
| O2 | Child can walk *up to* solids; no wide berth; no body through / far-side draw |
| O3 | Occlusion is draw-order + clip (`docs/05`, addendum), testable without eyes |
| O4 | Spawn → free leave `(13,16)` dirt → move → real quiz on a **route** → fail gently → open → another place |
| O5 | World is scene grammar (recipes + openings), not fence/dirt salt |
| O6 | Entropy is LLM-seeded when 8005 is up, cached fallback when not; never required to boot |
| O7 | Agents assert O1–O6 via inspect/CLI/traces (operator Direction 1) |
| O8 | FOV 128×64; no nano-kind factory; no WorldUnitSolver rewrite; no COLLISION_* thrash |
| O9 | Start Adventure does not freeze; Ctrl+F5 after JS; `?test=1` ≠ menus |

## Domain `/goal` sequence (broad)

After **G0-WIDE**, run domains in this order. Each domain may take several `/goal`s; never two domains in one paste.

| ID | Domain | First concrete seam |
|----|--------|---------------------|
| **G0-WIDE** | Full audit | `rebuild-audit.md` — every O# × live function |
| **D-INSPECT** | Sim/inspect layer | Screen + grid + sort + occupancy slices (Plarail-shaped, not a copy) |
| **D-WALK** | Walk SSOT | Kill or quarantine residual nano walk; one contact from paint centerline; inspect-gated |
| **D-PAINT** | Sort / occlusion | Only after D-INSPECT can measure sprite vs `projectFencePoint`. No “player always in front” |
| **D-LEAVE** | Origin session | Dirt leave stays; no cage on the gap; teaching quiz *after* leave if at all |
| **D-GEN** | Scene grammar | Recipes/openings; stop salt; attach existing iso2 materials as paint of existing kinds |
| **D-PROG** | Progression | Unavoidable quiz on corridors (`docs/13` #1); NPC-owned later |
| **D-LLM** | Entropy | Wire or honestly document sync-only; cache last 10 (started); port **8005** |
| **D-DEAD** | Dead code | One owner per walk/connect/sort; delete or call, don’t rewrite a third copy |
| **GSKIP** | Skeptic | Refute last claim from diff + inspect numbers |

Fence hug is **D-INSPECT → D-WALK / D-PAINT**, not a standalone campaign.

## Out until D-INSPECT + D-WALK/D-PAINT survive a human at both homestead corners

New inns, talking-head, load-slot restore, Three.js, greenfield, dual-trunk, re-running scene-first / place-coherence / critical-path PR plans, MCP/screenshot “eyes” as proof.

## Archives G0-WIDE must open

- `docs/01`–`05`, `12`, `13`
- `archived-planning/NewGame_GameBible_StartHere.md`
- `archived-planning/Additional Technical Details, PoC Quirks, and UI Discussions Addendum.md` (movement + occlusion DoD — **this is today’s bug, already written**)
- `docs/archive-2026-07-14/WorldEngine-00-Index.md` through `05`
- `docs/archive-2026-07-14/FirstFeedbackOnIso2.md`
- `docs/archive-2026-07-14/clean-rebuild-assessment/05-deep-intent-feature-map.md`
- `memories/repo/operator-guidance-2026-07-30.md`
- `memories/repo/durable-engine-repair-2026-08-13.md`
- `memories/repo/geometry-stack-dependency-map-2026-07-30.md`
- `AGENTS.md`, `ARCHITECTURE.md`
