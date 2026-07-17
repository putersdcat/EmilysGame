---
description: "God-file prevention + module size discipline. Always-on rules for any new module or refactoring PR. Triggers when editing anything in src/."
applyTo: "src/**"
---

# Architecture & God-File Prevention

## ⚠️ The God-File Rule (Non-Negotiable)

Emily's Game has been through a 6-phase god-file decomposition campaign
(EPIC #273, sub-issues #268–#272). The following files **MUST NOT** grow
back into monoliths:

| File | Current line budget | Hard ceiling | Why it matters |
|---|---|---|---|
| `src/main.ts` | ~1,200 | **1,600** | Game-loop orchestrator — extract anything not strictly orchestration |
| `src/engine/gen.ts` | 71 | **150** | World-gen barrel re-export |
| `src/rendering/render.ts` | 704 | **800** | Render orchestrator (class with `render()` / `renderWasm()`) |
| `src/ui/ui.ts` | 117 | **200** | UI orchestrator + types |
| `src/engine/llm.ts` | 21 | **50** | LLM barrel re-export |
| `src/engine/iso2-solver.ts` | 35 | **75** | Iso 2.0 solver barrel re-export |

> **Rule:** When editing any file in the table above, if your change would push
> it past its hard ceiling, extract the new logic into a focused sub-module first.
> Document the extraction commit in the file's `// ── B-series ──` history block.

## Module Size Discipline

Every `.ts` file under `src/` should follow these soft limits:

| Size | Verdict | Action |
|---|---|---|
| ≤ 150 lines | ✅ Ideal | No action |
| 151–250 lines | ⚠️ Acceptable | OK if cohesive; consider splitting if multiple responsibilities |
| 251–400 lines | 🟠 Should split | Plan extraction next time the file is touched |
| > 400 lines | 🔴 God-file | **Block the PR** until extraction |

## Layer Boundaries (same tree as root `AGENTS.md`)

```
Is it pure logic — no Canvas, no DOM, no window?
  └─ yes → src/engine/   (world gen, solver, walkability, math, LLM client, utils)
Does it draw to the Canvas or do isometric projection?
  └─ yes → src/rendering/ (render, terrain-cache, nano-tile*, lights, shadows, fog, weather, particles)
Does it generate sprites / textures / SVG assets?
  └─ yes → src/asset-pipeline/ (sprites, asset-sprites, npc-sprites, materials, emoji-cache)
Is it a game system or per-frame orchestration?
  └─ yes → src/game/      (input, quiz, trading, status, injury, wildlife, save, audio/, bootstrap, game-loop)
Is it HUD / menus / DOM overlays?
  └─ yes → src/ui/        (ui, menus, customizer, thought-bubbles, book-content)
Is it immutable configuration data?
  └─ yes → src/config/    (*.config.ts)
Is it a type shared across two or more layers?
  └─ yes → src/types/     (Camera, world types, InteractionResult, ...)
```

**Do not cross these boundaries.** A rendering module must never import a `game/*`
module (no game logic in the render loop). A game module must never reach into
the canvas directly — use the rendering API. An `engine/*` module must never touch
the DOM.

## Naming Conventions (from `AGENTS.md` §4)

- **Files:** `kebab-case.ts`. Config files end in `.config.ts`; shared type files end in `.types.ts`.
- **Extracted `engine/world/` phase modules** use `PascalCase.ts` (`BiomeSelector.ts`, `TemplateStamper.ts`, `Validation.ts`).
- **Types/interfaces/classes:** `PascalCase`.
- **Functions/methods/properties/locals:** `camelCase`.
- **Module-level constants:** `SCREAMING_SNAKE_CASE`.
- **Intentional module-level mutable state:** prefix with `_` (`_dialogNpcId`, `_nanoStackCache`, `_terrainCache`).
  Document in ARCHITECTURE.md §7. Do not add new ad-hoc globals without classifying them.
- **Config objects:** `as const` / immutable and typed.
- **Barrel files** (re-export only, ≤ 50 lines): `parent.ts` next to `parent/` directory.

## Sub-Directory Patterns (Established by B-series)

When extracting a large file, the proven pattern is a **barrel re-export**:

```
src/llm.ts                 ← 21-line barrel re-export
src/llm/
  ├── test-mode.ts         ← 35 lines, owns isTestMode()
  ├── tps.ts               ← 50 lines, owns TPS rolling window
  ├── wordlist-cache.ts    ← 32 lines, owns sessionStorage cache
  ├── client.ts            ← 202 lines, owns HTTP / fetch
  ├── entropy.ts           ← 104 lines, owns high-level entropy
  └── npc.ts               ← 70 lines, owns NPC chat + quiz + cleanup
```

Every public export from the original file must be re-exported from the barrel
so consumers don't need to change their imports.

## Refactoring Tools (Always Prefer Mechanical)

When extracting, use the toolkit at `tools/refactor/`:

```bash
# 1) Discovery — find candidates over 70 lines
python tools/refactor/find-large-functions.py src/foo.ts --min-lines 70

# 2) Mechanical extraction
python tools/refactor/extract-function.py \
  --source src/foo.ts \
  --name myFunction \
  --target src/foo/my-function.ts

# 3) Intelligent cleanup — review the new file + call sites, fix types/imports
# 4) Verify: npx tsc --noEmit + targeted Playwright tests
# 5) Commit + reference issue
```

See `tools/refactor/README.md` for the full workflow.

## Pre-Commit Checks (Mandatory)

| Check | Command | When |
|---|---|---|
| Root typecheck | `npx tsc --noEmit` | every change to `src/**` |
| Experiment typecheck | `cd experiment/isometric-2.0; npx tsc --noEmit` | every change under `experiment/**` |
| E2E tests | `npx playwright test --reporter=line` | every behavior/rendering change |
| Targeted tests | `npx playwright test tests/<category>/` | every focused change |
| Module size scan | `python tools/refactor/find-large-functions.py src/<file>.ts --min-lines 70` | every structural change |

A green build between steps is non-negotiable. Do not move on while red.

## Detection: How to Tell a Module Is Growing Back

Watch for these patterns during code review:

1. **Multiple unrelated subsystems in one file** — e.g., `render.ts` growing
   to also handle sound mixing or input polling. Extract.
2. **Class with 10+ private methods** where methods cluster into 2-3 groups.
   Extract each group into a focused class with the parent class as orchestrator.
3. **Module-level state that other files import** (e.g., `let foo: T;` accessed
   from another file via `import`). Move to factory state objects.
4. **A `.ts` file with 5+ `// ───` section dividers** — each section is a
   candidate module.
5. **A function > 70 lines** — extract helpers or split the function.

When you see one of these, create a GitHub issue (linked to parent epic) before
starting the fix, per `devloop-practices.md`.

## Cross-References

- `AGENTS.md` — operating manual for AI agents
- `ARCHITECTURE.md` — engine architecture, layered structure, state model
- `Docs/Refactoring-Playbook.md` — extraction methodology
- `Docs/RefactoringPlan_11-06-26.md` — EPIC #273 decomposition plan
- `.github/instructions/src-main.instructions.md` — main.ts-specific rules
- `.github/instructions/src-gen.instructions.md` — gen.ts-specific rules
- `.github/instructions/rendering.instructions.md` — render.ts-specific rules
- `.github/instructions/state-management.instructions.md` — state patterns
- `.github/instructions/types.instructions.md` — type centralization