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

## Next harvest steps

1. Read full bodies of #2, #3, #4, #6, #7, #214, #247 and their comments.
2. Read WorldEngine archive 00–05 next to issues #42–#47.
3. Read `archived-planning/NewGame_GameBible_StartHere.md` + Iso PoC + Addendum
   (issue #3 says the addendum is the occlusion/contact spec).
4. Write recovered meaning into `GAME.md` / `ENGINE.md` / `ISO.md`.
5. Log contradictions (tile size 64×32 vs 128×64, etc.) in `CONTRADICTIONS.md`.
