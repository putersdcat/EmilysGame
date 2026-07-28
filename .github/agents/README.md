# Copilot custom agents (workspace)

Location: `.github/agents/*.agent.md`  
Docs: [VS Code custom agents](https://code.visualstudio.com/docs/agent-customization/custom-agents)

## Always-on vs pickable

| Surface | When loaded | Purpose |
|---------|-------------|---------|
| `AGENTS.md` (repo root) | Agent / coding agent sessions | Product laws (keep **short**) |
| `.github/copilot-instructions.md` | Copilot Chat / CCA | Session habits + current layout |
| `.github/instructions/*.instructions.md` | When editing `applyTo` globs | Path-scoped detail |
| `.github/agents/*.agent.md` | When user (or parent) selects agent | Persona + tools |

**Rule:** Laws live once in `AGENTS.md`. Agents **link** to them; they must not paste competing campaigns.

**Autonomy:** Default agents (especially GameMan) run **multi-turn until the user task is done**. Token-lean docs must not be read as “one tool call then report.” “No auto-continue closed campaigns” ≠ anti-autonomy.

## Agents

| File | Human picker | Role |
|------|--------------|------|
| [GameMan.agent.md](GameMan.agent.md) | Yes | Default implementer |
| [GameMan-sub.agent.md](GameMan-sub.agent.md) | **No** (`user-invocable: false`) | Narrow coding subagent for GameMan |
| [IsoVisualLoop.agent.md](IsoVisualLoop.agent.md) | Yes | Iso paint MCP loops (experiment + product paint) |
| [RefactorMan.agent.md](RefactorMan.agent.md) | Yes | Justified extractions only |

## Frontmatter conventions used here

- `user-invocable: false` — hide from humans; subagent/API only  
- `disable-model-invocation: true` — block use as subagent (not used yet)  
- `agents: [...]` — allowlisted subagents for the parent  
- Keep bodies **token-lean**; link to AGENTS.md instead of duplicating

## Hygiene

If you add an agent: one job, short body, no closed PR-plan auto-continue, no stale `src/gen.ts`-style paths.
