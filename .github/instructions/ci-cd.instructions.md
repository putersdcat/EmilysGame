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
