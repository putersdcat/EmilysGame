# Copilot instructions — Emily's Game

Isometric browser adventure (TypeScript, Vite, Canvas 2D) with quiz gates, procedural places, and optional LLM entropy.

**Read first:** root [`AGENTS.md`](../AGENTS.md) (standing laws + layer map). Engine deep-dive: [`ARCHITECTURE.md`](../ARCHITECTURE.md). Do **not** invent parallel planning docs — use GitHub Issues + existing `memories/repo/*` designs.

## Branch & product

- Product tip: **`experiment/isometric-2.0`**
- Flat sim owns walkability; Iso2 materials are **paint only**; FOV **128×64**
- Success = **playtest feel**, not only green tests

## Layout (current)

```
src/main.ts          # rAF orchestrator (keep thin)
src/engine/          # gen, mechanics, world, llm, quiz logic, …
src/rendering/       # isometric render, terrain-cache, nano paint
src/game/            # state, save, menus, audio, interaction
src/ui/              # DOM HUD
src/config/          # *.config.ts content/knobs
src/types/           # shared types
tests/               # Playwright
```

Path-scoped rules auto-attach from [`.github/instructions/`](instructions/) when you edit matching globs. Prefer those over inventing conventions.

## Session habits

1. Pull/sync product branch; check open issues if task is issue-linked.
2. Small steps; verify with `npx tsc --noEmit` and **targeted** Playwright, not always the full suite.
3. Dev server: `npx vite` → `http://localhost:5173`
4. Comment on the issue / PR with what changed and how you verified.

## Hard don’ts (prompt hygiene)

- Do **not** re-open closed scene-first or paint-architecture campaigns from stale docs.
- Do **not** treat root paths like `src/render.ts`, `src/gen.ts`, `src/ui.ts` as live — they moved under `src/rendering`, `src/engine`, `src/ui`.
- Do **not** paste multi‑MB screenshots into chat; use MCP previews or files under `tests/screenshots/`.
- Do **not** claim ship without a player-visible check when the task is feel/UX.

## LLM / local services

- Chat/completions via Vite proxy `/api/llm` → local BitNet (or similar). Port is **machine-local** — verify health before hardcoding ports in docs.
- Tests may bypass LLM (`?test=1` / test mode). Prefer deterministic fallbacks over hanging boot.

## Named agents

| Agent | Use |
|-------|-----|
| [GameMan](agents/GameMan.agent.md) | Default implementer (human-pickable) |
| [GameMan-sub](agents/GameMan-sub.agent.md) | Same laws, **subagent only** (`user-invocable: false`) |
| [IsoVisualLoop](agents/IsoVisualLoop.agent.md) | Experiment iso paint loops (MCP) |
| [RefactorMan](agents/RefactorMan.agent.md) | Extraction only when justified — not reorg for fun |

Map: [agents/README.md](agents/README.md).
