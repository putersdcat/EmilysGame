---
description: "Use when editing GitHub Actions workflows, CI/CD configuration, or deployment scripts."
applyTo: ".github/workflows/**"
---
# CI/CD Pipeline

## Workflows
| Workflow | Trigger | Purpose |
|---|---|---|
| `ci-cd.yml` | Push/PR | Type check + Playwright tests |
| `pages-deploy.yml` | Manual dispatch | Deploy to GitHub Pages |
| `screenshot.yml` | Manual dispatch | Capture game screenshot |
| `content-refresh.yml` | Manual/schedule | Refresh content packs |
| `copilot-setup-steps.yml` | Copilot | Setup steps for Copilot agent |

## GitHub Pages Deployment
- Manual trigger only (controlled releases)
- Uses `npm run build:pages` which sets base path to `/EmilysGame/`
- `vite.config.ts` reads `--mode pages` to set base path
- LLM bypass auto-activates via pathname detection

## Rules
1. All PRs must pass type check (`npx tsc --noEmit`) and Playwright tests.
2. Never auto-deploy — `pages-deploy.yml` is manual-only.
3. See `.github/CI_CD_CHECKLIST.md` for pre-deploy verification steps.
4. Screenshot script uses `?test=1` to avoid LLM dependency.
5. **PRs that introduce god-file growth are blocked at review time** — see
   `.github/instructions/architecture.instructions.md` for hard ceilings and
   `npx tsc --noEmit` + module-size scan as part of CI gates.

## Cross-References

- `.github/instructions/architecture.instructions.md` — god-file prevention (CI gates)
- `.github/instructions/llm-integration.instructions.md` — test-mode URL param
- `.github/instructions/tests.instructions.md` — Playwright test categories
