## CI/CD pipeline

This workflow runs on push and pull requests to `main` and performs the following steps:

- Install dependencies (with npm cache)
- Type-check (`tsc --noEmit`)
- Run Playwright E2E tests
- Build with `vite build`
- Deploy `dist/` to `gh-pages` branch using `peaceiris/actions-gh-pages@v3`

Notes:
- Playwright browsers are installed in CI (`npx playwright install --with-deps`).
- The workflow uses the default `GITHUB_TOKEN` for Pages deployment.
