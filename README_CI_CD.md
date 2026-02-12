---
name: CI/CD Workflow docs
---

This file documents the CI/CD GitHub Actions workflow added in `.github/workflows/ci-cd.yml`.

Workflow behavior
- Runs on `push` and `pull_request` targeting `main`.
- Steps: checkout → install → typecheck → Playwright tests → build → deploy to GitHub Pages (on `main`).

Usage
- The workflow deploys `dist/` to the `gh-pages` branch using the `GITHUB_TOKEN`.
- To test locally, run `npm run typecheck && npm test && npm run build`.
