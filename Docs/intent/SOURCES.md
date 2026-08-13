# Source inventory

Harvest status for the intent-recovery campaign. Update the status column
when a source has actually been read into `GAME.md` / `ENGINE.md` /
`ISO.md` / `CONTRADICTIONS.md`. A title list is **not** a harvest.

**Last merge:** 2026-08-13. Action: `NEXT.md` (slice 1). Harvest is
enough to build; do not wait on missing Side Quests files.

Every GitHub issue body (open and closed) and every comment thread is
dumped under `docs/intent/harvest/`. #223’s 253 comments were read:
252 are agent-loop spam. Three cited historical specs are **not in
the tree**.

## Remote GitHub (`putersdcat/EmilysGame`)

| Set | Count (2026-08-13) | Status |
|-----|--------------------|--------|
| Open issues | 48 | **All titles + bodies dumped** (`harvest/issues-all.json`). Living-file merge includes #184, remaining Iso2 ACs. |
| Closed issues | 176 | **All titles + bodies dumped.** Second-pass merge of product-law issues listed in `GITHUB-EPICS.md`. Implementation-only closers (WASM setup, CI, god-file splits) not copied as design. |
| Epic #2 children | 26 | Bodies in dump; education/audio/survival/wildlife children now in `GAME.md`. |
| Comments | 423 on list + 253 on #223 | **#223 read in full.** 252 autonomous-loop spam; 1 design comment. All other issue comments in `harvest/COMMENTS-OTHER.md`. |
| PRs | 48 | Listed. Almost no review discussion. |
| Project boards | — | API 403 still. |
| Missing cited specs | 3 files | Side Quests / Epic Music / Visual Enhancements **not in tree**. Recovered only through issues that quote them. |
| **Local Copilot Chat** | 75 sessions, ~5 GB | **Harvested twice.** Transcripts → 113 directives. Stream scan of the 100–600 MB snapshots → 791 unique texts, 599 new (many drafts). Method + new product: `harvest/COPILOT-HARVEST.md`. Copy off this machine before a reinstall. |
| Repo description | harvested | Owner voice: “a game made for my girls to learn while they play…” |

## Current docs (cleaned restatement — often diluted)

| Path | Status |
|------|--------|
| `Docs/01-Game-Vision-and-Design-Pillars.md` | Harvested. Pillars 1–6 kept; Pillar 7 flagged as dilution. |
| `Docs/02-Architecture-Core-Principle.md` | Harvested as the paint-only slogan. Contradicted by Iso2 + `AGENTS.md`. |
| `Docs/07-Education-and-Knowledge-System.md` | Harvested into `GAME.md` education. |
| `Docs/03`–`06`, `08`–`13` | Skim / partial. Subagent in flight for full pass. Do not treat `13` freeze as law. |
| `Docs/00-INDEX.md` | Marked historical |
| `ARCHITECTURE.md` | Historical snapshot of failed tree; not yet deep-harvested |

## Archives (scavenge in full)

| Path | Status |
|------|--------|
| `archived-planning/NewGame_GameBible_StartHere.md` | **Harvested in full** → `GAME.md` / `ENGINE.md` |
| `archived-planning/NewGame_Isometric_PoC.md` | **Harvested in full** → `ISO.md` |
| `archived-planning/Additional Technical Details, PoC Quirks, and UI Discussions Addendum.md` | **Harvested in full** → contact, occlusion, LLM fallback contradiction |
| `archived-planning/NewGame_LlmEntropyAddendum.md` | **Harvested in full** → `ENGINE.md` §6 |
| `archived-planning/Grokipedia_Book_of_Knowledge.md` | **Harvested in full** → `GAME.md` §5 |
| `archived-planning/Visual Mapping and Tile Asset Generation.md` | **Harvested** (hierarchy origin) → `ENGINE.md` §2 |
| `archived-planning/Knowledge_Capture_Automation.md` | Partial (via #8). Full file still to merge. |
| `archived-planning/Character_Sprite_System.md` | Not yet |
| `archived-planning/GPT-53-Codex_Core World Engine.md` | Not yet |
| `archived-planning/Archive/NewGameIdea_v0.md` + LLM addenda v0 | Harvested via explore (top-down v0; same loop; no homestead) |
| `Docs/archive-2026-07-14/WorldEngine-00-Index.md` | Harvested |
| `Docs/archive-2026-07-14/WorldEngine-01-SpatialHierarchy.md` | **Harvested in full** |
| `Docs/archive-2026-07-14/WorldEngine-02-EdgeContracts.md` | **Harvested in full** |
| `Docs/archive-2026-07-14/WorldEngine-03-SolverPipeline.md` | Harvested overview + phases 1–2; later phases via 05 |
| `Docs/archive-2026-07-14/WorldEngine-04-RenderingPipeline.md` | Partial (renderer consumes world data; DOM minimap) |
| `Docs/archive-2026-07-14/WorldEngine-05-PopulationAndProgression.md` | **Harvested in full** |
| `Docs/archive-2026-07-14/FirstFeedbackOnIso2.md` | Harvested |
| `Docs/archive-2026-07-14/IsoRenderingPlanV2.1.md` | Harvested goal / architecture / success criteria |
| `Docs/archive-2026-07-14/IsoRenderingPlanV2.md` + Detail + AiTools | Not yet |
| `Docs/archive-2026-07-14/Iso2.0-*.md` | Harvested via explore (anchor, integration, honest research, visual plan) |
| `Docs/archive-2026-07-14/Nano-3D-Structural-Asset-Inventory.md` | Harvested (venues, not emoji; no beautiful prisons) |
| `Docs/archive-2026-07-14/clean-rebuild-assessment/` | Harvested 05/09/11/13/17 + Three.js rejection. Remainder (effort, 90-day plan) is process, not product. |
| `Docs/archive-2026-07-14/Next-Engine-And-Gameplay-Plan.md` | Not yet |
| `asset-dev/Archive/` | Not harvested |
| `experiment/isometric-2.0/` docs / ProgressEvaluations | Not harvested (crime scene + intended look) |

## Memories (what agents thought they were doing)

| Path | Status |
|------|--------|
| `memories/repo/playtest-findings-after-critical-path-2026-07-20.md` | **Harvested** as owner playtest law |
| `memories/repo/cutover-prompt-2026-08-13.md` | Current session brief (obeyed) |
| Other `memories/repo/design-*.md` | Harvested as **agent-thought**. Session shrink, “loop already works,” homestead-must-quiz, paint-only freeze: **rejected**. Owner playtest + Three.js rejection kept. |
| `operator-guidance-2026-07-30.md` | Historical freeze; Direction 1 inspect idea is a fact, not a freeze |
| `product-campaign-progress.md` | Untrusted “green” table — do not harvest as proof |

## Do not treat as sources of *implementation*

`src/`, `tests/`, closed-campaign “landed” memos, geometry A–D, inspect stubs.
Use them only to name failures and rejected ideas.

## What “done” means for this folder

A later session can implement a homestead you can walk around, leave
without a quiz, and one teaching gate that actually opens — **from
`GAME.md` + `ENGINE.md` + `ISO.md` alone.** That bar is now *close*.
It is not done until remaining issue bodies cannot surprise those files.
