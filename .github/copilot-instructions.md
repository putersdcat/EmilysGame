# Copilot instructions — Emily's Game

Isometric browser adventure (TypeScript, Vite, Canvas 2D): places, quiz gates, procedural world, educational content.

**Laws + layout:** root [`AGENTS.md`](../AGENTS.md). Architecture deep-dive: [`ARCHITECTURE.md`](../ARCHITECTURE.md). Path rules auto-attach from [`.github/instructions/`](instructions/).

## Autonomy first

You are an **implementation agent**. Drive the user's request to completion across many tool turns.

- **Do not** stop after one turn to report progress, restate the plan, or ask “should I continue?” when the next step is clear.
- **Do not** treat “token efficiency” or “small slices” as “one file then halt.” Ship the whole requested outcome; slice only *internally* if helpful.
- **Do** implement, typecheck/test as needed, fix failures, and finish. End with a brief summary of what changed and how you verified.
- Ask the user only for genuine product forks (branch/greenfield, FOV change, new ontology) or when hard-blocked (missing secret, external service down after a real try).

“Closed campaign / do not re-run scene-first” = don’t revive finished multi-PR plans. It is **not** an anti-autonomy rule.

## Product constraints (short)

- Branch: **`experiment/isometric-2.0`**
- Flat sim owns walkability; Iso2 is **paint only**; FOV **128×64**
- Success for feel work = playtest-relevant outcome, not only green tests

## Layout

```
src/main.ts        # rAF orchestrator (keep thin)
src/engine/        # gen, mechanics, world, llm, quiz
src/rendering/     # isometric paint
src/game/          # state, save, menus, audio
src/ui/            # DOM HUD
src/config/        # *.config.ts
src/types/
tests/             # Playwright
```

No live root `src/render.ts` / `src/gen.ts` / `src/ui.ts` — those moved under the folders above.

## Verify

- Dev: `npm run dev` → `http://localhost:5173`
- `npx tsc --noEmit`; targeted `npx playwright test <path>` when useful
- LLM via Vite `/api/llm` (port is machine-local). Tests may use `?test=1` bypass.

## Don’t

- Re-open closed scene-first / paint-architecture campaigns from stale docs
- Paste multi‑MB screenshots into chat
- Invent parallel planning docs; use Issues + existing `memories/repo/*` when needed

## Agents

| Agent | Role |
|-------|------|
| [GameMan](agents/GameMan.agent.md) | Default implementer — **autonomous** |
| [GameMan-sub](agents/GameMan-sub.agent.md) | Subagent only (`user-invocable: false`) |
| [IsoVisualLoop](agents/IsoVisualLoop.agent.md) | Iso paint MCP loops |
| [RefactorMan](agents/RefactorMan.agent.md) | Justified extractions only |

Map: [agents/README.md](agents/README.md).
