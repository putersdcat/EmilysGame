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

## Agent notes (short)

Canonical product notes live under [`memories/repo/`](../memories/repo/) — prefer those over chat dumps. Do not recreate deleted archive folders or closed multi-PR campaign auto-runs unless the user asks.

## Out of tree

- Nested `experiment/isometric-2.0/` = MCP AiTools + legacy iso sources, **not** the app entrypoint (`src/main.ts`).
