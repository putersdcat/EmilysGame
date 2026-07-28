# Emily's Game — Design documentation

**Read first for code work:** root [`AGENTS.md`](../AGENTS.md) and [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## Reading order

If you read one design file, read **02**.

| # | Document | Purpose |
|---|----------|---------|
| 01 | [Vision & pillars](01-Game-Vision-and-Design-Pillars.md) | What the game is; core loop |
| 02 | [Architecture core principle](02-Architecture-Core-Principle.md) | **Keystone:** flat sim vs isometric paint |
| 03 | [Core simulation model](03-Core-Simulation-Model.md) | Grid/cells/entities without iso jargon |
| 04 | [World generation](04-World-Generation-Design.md) | Places, gates, guarantees |
| 05 | [Presentation layer](05-Presentation-Layer-Isometric-Rendering.md) | Iso as swappable paint |
| 06 | [LLM entropy](06-LLM-Entropy-and-Procedural-Seeding.md) | Creative RNG + fallbacks |
| 07 | [Education](07-Education-and-Knowledge-System.md) | Quizzes, Book |
| 08 | [Characters & wildlife](08-Characters-NPCs-and-Wildlife.md) | NPCs, sprites |
| 09 | [Audio](09-Audio-Design.md) | Music / SFX |
| 10 | [UI / a11y](10-UI-UX-and-Accessibility.md) | HUD, input |
| 11 | [Save / persistence](11-Save-State-and-Persistence.md) | Save contract |
| 12 | [Current reality gap analysis](12-Current-Reality-Gap-Analysis.md) | Restored — vision vs shipped gaps |
| 13 | [Development roadmap](13-Development-Roadmap.md) | Restored — roadmap ideas |

## Archives (restored idea library)

| Path | Purpose |
|------|---------|
| [`archive-2026-07-14/`](archive-2026-07-14/) | Pre-gut design dump (WorldEngine, Iso2, clean-rebuild assessment, gameplay plans). **Idea mine for AmysGame.** See [`archive-2026-07-14/README-FOR-AMYS-AGENTS.md`](archive-2026-07-14/README-FOR-AMYS-AGENTS.md). |
| [`../archived-planning/`](../archived-planning/) | Earliest NewGame bible, Grokipedia/Book, LLM entropy addenda, sprite systems |
| [`../asset-dev/Archive/`](../asset-dev/Archive/) | Micro-tile / SVG art experiments |

Also: root [`ARCHITECTURE.md`](../ARCHITECTURE.md), [`memories/repo/`](../memories/repo/), [`.github/agents/`](../.github/agents/), [`.github/instructions/`](../.github/instructions/).

## Agent notes (short)

Canonical **live** product notes: [`memories/repo/`](../memories/repo/) + this Docs set.  
**Archives are restored on purpose** for AmysGame / future agents — mine ideas, do not re-bind Emily's iso FOV laws as product law.

## Out of tree

- Nested `experiment/isometric-2.0/` = MCP AiTools + legacy iso sources, **not** the app entrypoint (`src/main.ts`).
