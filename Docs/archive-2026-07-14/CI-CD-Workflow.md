## CI/CD pipeline

Two separate workflows live in `.github/workflows/`:

**`ci-cd.yml`** (test + build only) runs on push and pull requests to `main`:

- Install dependencies (with npm cache)
- Type-check (`tsc --noEmit`)
- Run Playwright E2E tests
- Build with `vite build`

This workflow does **not** deploy anywhere.

**`pages-deploy.yml`** (deploy only, manual) triggers via `workflow_dispatch`
only -- never automatically on push. It builds and publishes `dist/` to
GitHub Pages using the default `GITHUB_TOKEN`.

Why deploy is manual, not push-triggered: the game gates startup on a
local LLM health check that a static GitHub Pages host can never satisfy.
Automatic push-to-deploy was tried and reverted (closed issue #27); the
current manual-trigger + pathname-based test-mode/LLM-bypass approach
(closed issue #123) is the intentional, current design -- not a
regression or an oversight.

Notes:
- Playwright browsers are installed in CI (`npx playwright install --with-deps`).
