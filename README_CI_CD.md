---
name: CI/CD Workflow docs
---

This file documents the CI/CD GitHub Actions workflows in `.github/workflows/`.

Workflow behavior
- **`ci-cd.yml`** — Runs on `push` and `pull_request` targeting `main`.
  Steps: checkout → install → typecheck → Playwright tests → build.
  **Does NOT deploy.** (Docs/VisionAlignmentAudit.md Finding: this file
  previously described push-triggered auto-deploy as a single combined
  workflow -- that behavior was intentionally removed, see below.)
- **`pages-deploy.yml`** — "Deploy — GitHub Pages (Manual)". Trigger:
  `workflow_dispatch` only (manually run from the Actions tab). Builds and
  deploys `dist/` to GitHub Pages.

Why deploy isn't push-triggered: the game gates on a local LLM health
check (`waitForLlm()` polling `127.0.0.1:8002`) that a static GitHub Pages
host can never satisfy. Automatic push-to-deploy was tried and reverted
(closed issue #27); manual `workflow_dispatch` (closed issue #123) with a
pathname-based test-mode/LLM-bypass hack is the current, intentional
deploy path -- see README.md's own "GitHub Pages disabled due to local LLM
requirement" note, which already reflected this correctly.

Usage
- The deploy workflow publishes `dist/` via GitHub Pages using the
  `GITHUB_TOKEN`.
- To test locally, run `npm run typecheck && npm test && npm run build`.
- To deploy: trigger `pages-deploy.yml` manually from the Actions tab.
