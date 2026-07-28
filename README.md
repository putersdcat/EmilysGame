# Emily's Game

Isometric browser adventure (TypeScript + Vite + Canvas 2D): places, quiz gates, procedural world, educational Book of Knowledge.

## Start here (humans & coding agents)

| Doc | Why |
|-----|-----|
| **[AGENTS.md](AGENTS.md)** | Product laws, branch, where code goes — **read first** |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Engine layers, pipelines, save model |
| **[Docs/00-INDEX.md](Docs/00-INDEX.md)** | Design doc map (`docs/01`–`11`) |
| **[.github/copilot-instructions.md](.github/copilot-instructions.md)** | Copilot session habits |

**Product branch:** `experiment/isometric-2.0`  
**App code:** `src/` (not the nested `experiment/` package — that is AiTools + legacy iso sources for MCP).

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npx tsc --noEmit
npx playwright test --reporter=line   # or a single path under tests/
```

Optional local LLM is proxied via Vite (`/api/llm`). Port is machine-local — check health before assuming a number from old docs.

## Layout

```
src/engine/      # sim, gen, mechanics, quiz, llm
src/rendering/   # isometric paint
src/game/        # loop systems, save, audio, menus
src/ui/          # DOM HUD
src/config/      # content knobs
tests/           # Playwright
Docs/            # design (01–11)
memories/repo/   # short agent design notes (not session chat dumps)
.github/agents/  # optional Copilot personas (GameMan, …)
experiment/isometric-2.0/AiTools/  # isoSvgRenderer MCP (optional)
```

## Status

Playable product base on the branch tip: scene-first gen law + playable-session recovery (boot/coins/water/density/homestead). Expand via **content + scene recipes**, not new world ontology. See `AGENTS.md`.
