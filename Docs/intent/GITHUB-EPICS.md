# GitHub epics and issues (harvest)

**Repo:** [putersdcat/EmilysGame](https://github.com/putersdcat/EmilysGame)  
**Pulled:** 2026-08-13. **48 open**, **176 closed**.  
Closed ≠ “not intended.” Most of the genius is in closed WorldEngine / education /
Iso2 / survival issues whose *code* should not be ported.

This file is an index. Recovered meaning goes to `GAME.md` / `ENGINE.md` / `ISO.md`.
Do not paste issue pseudocode into those files.

---

## Still-open master epics (must read in full)

| # | Title | Why it matters |
|---|-------|----------------|
| [2](https://github.com/putersdcat/EmilysGame/issues/2) | **Game Bible — Master Design** | Still OPEN. Parent of 26 children. Migrated from `NewGame_GameBible_StartHere.md`. Vision: 1024×1024 world, 32×32 lazy chunks, Canvas 2D iso, LLM entropy (50 verb/noun → SHA-256 seeds), 100–500 educational Q&A, biome Forest → Cave → Castle, obstacle templates (door/key, toll/coins, barricade/crowbar, river/bridge), Book of Knowledge, save/FoW/minimap, Web Audio. |
| [3](https://github.com/putersdcat/EmilysGame/issues/3) | **Isometric Rendering Engine & PoC** | Still OPEN. Migrated from Iso PoC + **Addendum**. Already names today’s playtest: collision too restrictive → tighter hitboxes / natural “near” approaches; occlusion broken → `sortKey = y + height/2` + canvas clipping; arm detach on flip. Original PoC tile size **64×32** (later docs said 128×64 — contradiction to record). |
| [4](https://github.com/putersdcat/EmilysGame/issues/4) | **LLM Entropy System** | Still OPEN. World seeds from play, not a chat overlay. |
| [6](https://github.com/putersdcat/EmilysGame/issues/6) | **Tile & World Generation** | Still OPEN. |
| [214](https://github.com/putersdcat/EmilysGame/issues/214) | **Iso 2.0 REBOOT** (12/12) | Still OPEN. The nano/Z/materials campaign that never became shops/bars/quiz venues in the product. |
| [247](https://github.com/putersdcat/EmilysGame/issues/247) | Engine Architecture Refactor & Iso 2.0 Main-Integration | Still OPEN. Spawned the AGENTS.md / ARCHITECTURE.md / god-file instruction pile. |
| [260](https://github.com/putersdcat/EmilysGame/issues/260) | Visual Quality & World Coherence | Still OPEN. Biomes, seams, water/bridge. |
| [273](https://github.com/putersdcat/EmilysGame/issues/273) | Phase B-extended god-file decompose | Still OPEN. Line-count campaign — recover *intent of modules*, not the split plan. |

## Other open work (intent, not a todo list to implement on `src/`)

Iso2 remaining: #215, #218, #220–223, #225–226, #239, #242–243, #246, #255–258, #262–264, #266, #269, #275, #277.

God-file leftovers: #252, #254, #267, #270, #271, #274.

Education still open: #91, #93, #95, #96.

Audio still open: #108, #147, #149, #150.

WASM: #45.

Depth/parallax research: #184.

## Closed — harvest anyway (high signal)

### WorldEngine (the spatial grammar)

#17 #18 #22 #23 #24 #42 #43 #44 #46 #47 — edge contracts, micro-tile metadata,
multi-solver pipeline, population/progression, render cache. Local copies:
`Docs/archive-2026-07-14/WorldEngine-00`–`05`.

### Education / Book / quizzes

#7 Book of Knowledge (closed epic). #8 knowledge capture. #87–#94 age bands,
content packs, early-reader a11y. #98 lock-key DAG (no softlocks). #103 streak
difficulty. #109 injury + wound-care quizzes.

### Iso 2.0 (what the new components were *for*)

First wave: #194–#210. Reboot 12/12: #216, #217, #219, #224 closed; several
still open. Texture/material gold-standard fight: #227–#245. Assemblies:
homestead, cathedral, overhangs. Player sink, occlusion gaps in fences,
neg-Z rivers, gate + troll-bridge + quiz.

### Survival / session feel (the game, not the renderer)

#70 #110 #131 #133 #136 #137 — injury, hydration, night, time scale.
#99 themed structures (homestead / seller cart / inn). #77 shop / campfire / house.
#112 trading. #186 onboarding tutorial.

### Presentation contact (named in 2026-02, still broken 2026-08)

#151 walkability/collision misalignment into water. #179 occlusion sorting
(`sortKey = y + height/2`). #180 tightened hitbox. #181 canvas clipping.
#3 addendum: wide-berth collision + height occlusion.

### Instruction-stack origin (adversarial archaeology)

#248 **Author AGENTS.md** (closed) — this is where the poison pill was born.
#250 Author ARCHITECTURE.md. #253 layered folders + instruction `applyTo` globs.

## Bodies read this session (meaning merged into living files)

| # | Merged as |
|---|-----------|
| 2 | Session, templates, biome ladder, Book, save, Canvas/TS |
| 3 | 64×32 PoC, wide-berth contact, occlusion, arm flip, painter-as-consumer |
| 4 | Entropy as creative RNG; play authors seeds; fallback |
| 6 | Micro / world unit / macro; orthogonal MVP; BFS playability |
| 7 | Subject select, Book, word bag, “I don’t know” |
| 8 | Offline content packs; entropy LLM ≠ authoring LLM; age 5–12+ |
| 42 | Multi-dimension edge contracts (intent; closed ≠ shipped) |
| 70 | Survival-lite secondary, never lethal |
| 77 | Shop / campfire / house interact — emoji era |
| 87 | Age-band filter (closed as duplicate of #92) |
| 98 | Lock-key DAG, no softlocks |
| 99 | Homestead / seller cart / inn as compounds |
| 109 | Injury + wound-care quiz |
| 110 | Visual debuffs, outhouse, stream drink |
| 151 | Paint vs collision; water from the north |
| 179 | Occlusion feel (formula is not the product) |
| 186 | Emily did not know how to move; first-run tutorial |
| 214 | Iso2 reboot purpose; voided #194–#213; PNG-or-it-didn’t-happen |
| 223 | Gate / bridge walk rules; quiz unlock must change the map |
| 247 | Origin of AGENTS/ARCHITECTURE/god-file freeze — recover module *jobs*, not the split |
| 131 | Time 12:1; event injuries; FoW default off; stream joke; HUD disclosure |
| 180 | Tight hitbox / anchor (closed, still broken — see #266 open) |
| 248 | Where the first AGENTS.md freeze was authored (nano walkthrough, MCP-first, Playwright as proof) |
| 260 | Biome regions, hide diamond quilt, water continuity, bank-to-bank bridges |

## Second pass (2026-08-13)

**All 224 issues listed.** 176 closed + 48 open. Full dump:
`docs/intent/harvest/issues-all.json`, catalog `ISSUE-CATALOG.md`,
closed index `CLOSED-INDEX.md`.

**Every comment thread except pagination was pulled.** 423 comments on
the issue list + **253 on #223** (`comments-223.json`).

#223’s thread is almost entirely autonomous-loop agent spam (252/253).
The one design comment: troll-bridge is a **flat always-walkable**
crossing; live quiz-UI unlock was never done. That is now in
`CONTRADICTIONS.md` D17.

Closed issues that added product law this pass (not just “tests pass”):
#25 (owner cats/mushrooms/shadows), #26 (entropy once), #57 (homestead
hubs, animals, bridges), #66 (menu + cosmetic unlocks), #67/#114 (night
light / glowing eyes), #68/#142 (wildlife + cats), #71/#111 (thought
bubbles), #72/#112 (buy/sell/themed shops/barter), #73–#76/#107/#191
(WalkGirl cassette, MIDI, voice), #94 (early-reader), #100 (rivers
impassable except crossings), #113 (mouth flap), #124/#126/#185 (Tesla/
touch), #133–#139 (illness, 12:1 time, FoW default off), #184 (depth
still open), #208/#209 (walk priority, assemblies).

**Missing from the repo (cited by issues, not on disk):**
`Docs/Side Quests, Inventory Management, and NPC Interactions,md.md`,
`Docs/Epic Music and Sound Engine Implementation.md`,
`Docs/Visual and Feature Enhancements.md`. Recovered only via the
issues that quote them. If those files exist in an old commit or
another machine, they still need scavenging.

PRs: 48 listed (`prs-all.json`). Almost no discussion (0–3 comments).
Bodies are implementation, not new law.

## Next harvest steps

1. Remaining closed WorldEngine bodies #17 #18 #22 #23 #24 #43 #44 #46 #47.
2. Education #88–#96 (open and closed), #103.
3. Survival / time #131 #133 #136 #137.
4. Iso contact #180 #181; Iso2 first wave (voided) only if they add purpose not already in #214.
5. **#223 comments (253)** — likely contains owner feel; do not skip.
6. #248 / #250 / #253 — instruction-stack archaeology (how the freeze was born).
7. Open #260, #273 bodies.
8. PR discussion and milestones (project boards 403 this session).
