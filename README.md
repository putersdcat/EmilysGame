# Emily's Game

Isometric browser adventure (TypeScript + Vite + Canvas 2D): places, quiz gates, procedural world, educational Book of Knowledge.

## Start here (humans & coding agents)

| Doc | Why |
|-----|-----|
| **[AGENTS.md](AGENTS.md)** | **Current law** (replaced 2026-08-13) — read first |
| **[Docs/intent/](Docs/intent/README.md)** | Living recovered design. Write here. |
| **[memories/repo/cutover-prompt-2026-08-13.md](memories/repo/cutover-prompt-2026-08-13.md)** | Paste after `/new` |

`Docs/01`–`13`, `ARCHITECTURE.md`, `memories/repo/*`, archives, and
`.github/instructions` / `.github/agents` are **historical**. Scavenge.
Do not treat `src/` as the thing to extend.

**Rewrite branch:** `rewrite/intent-first`  
**Old product tip (crime scene):** `experiment/isometric-2.0` / `src/`  
Nested `experiment/` is AiTools + legacy iso sources, not the rewrite target.

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
Docs/intent/     # living recovered design (current)
Docs/            # historical design (01–13) + archives
memories/repo/   # historical agent notes — not law
.github/agents/  # repealed personas — do not invoke
experiment/isometric-2.0/AiTools/  # isoSvgRenderer MCP (optional)
```

## Status

Playable product base on the branch tip: scene-first gen law + playable-session recovery (boot/coins/water/density/homestead). Expand via **content + scene recipes**, not new world ontology. See `AGENTS.md`.
