# GitHub Pages Deployment Guide

## Overview

This repository includes a manual GitHub Actions workflow to deploy Emily's Game to GitHub Pages. The deployment automatically bypasses the local LLM integration requirement, allowing the game to run as a static website.

## How It Works

### LLM Bypass

The game normally requires a local LLM server running at `http://127.0.0.1:8002` (or other configured endpoints). This is not available in GitHub Pages static hosting. The deployment workflow solves this by:

1. **Build Mode**: Uses `vite build --mode pages` which sets `base: '/EmilysGame/'` in vite config
2. **Path Detection**: The `isTestMode()` function in `src/llm.ts` automatically detects GitHub Pages by checking if `window.location.pathname.startsWith('/EmilysGame/')`
3. **Test Mode Behavior**: When in test mode:
   - Skips LLM health checks entirely
   - Uses pre-cached/scrambled wordlists from bundled assets
   - All LLM-dependent features fall back to static content
   - Game starts immediately without waiting for LLM connection

### Base Path Configuration

GitHub Pages serves repositories at `https://{username}.github.io/{repo-name}/`. The build configuration:

- Sets `base: '/EmilysGame/'` in vite.config.ts when mode is 'pages'
- All asset paths are automatically prefixed with this base path
- Works correctly in both local development and GitHub Pages deployment

## Deploying to GitHub Pages

### Prerequisites

1. Enable GitHub Pages in repository settings:
   - Go to Settings → Pages
   - Source: "GitHub Actions"

### Manual Deployment

The deployment workflow is **manually triggered** to avoid unnecessary deployments on every commit:

1. Go to the **Actions** tab in GitHub
2. Select the **"Deploy — GitHub Pages (Manual)"** workflow
3. Click **"Run workflow"**
4. Select the branch (usually `main`)
5. Click **"Run workflow"** button

The workflow will:
1. Install dependencies
2. Build WASM renderer
3. Build the game with `--mode pages` (sets base path and enables path-based detection)
4. Upload the `dist/` folder as a GitHub Pages artifact
5. Deploy to GitHub Pages

### Accessing the Deployed Game

After successful deployment, the game will be available at:

```
https://putersdcat.github.io/EmilysGame/
```

The game will start immediately without requiring LLM connection because the pathname `/EmilysGame/` triggers test mode.

## Local Testing

To test the GitHub Pages build locally:

```bash
# Build for GitHub Pages
npm run build:pages

# Preview the build (will serve at http://localhost:4173/EmilysGame/)
npx vite preview --base /EmilysGame/
```

Or to test with test mode enabled locally:

```bash
# Regular dev mode with test mode enabled via URL parameter
npm run dev
# Then open: http://localhost:5173/?test=1
```

## Build Scripts

- `npm run build` - Standard build (requires local LLM for production use)
- `npm run build:pages` - GitHub Pages build (LLM bypassed via pathname detection, base path set to /EmilysGame/)
- `npm run dev` - Development server

## Test Mode Detection

The game automatically enters test mode (skips LLM) when any of these conditions are met:

1. **URL parameter**: `?test=1` in the URL
2. **GitHub Pages pathname**: URL pathname starts with `/EmilysGame/` 
3. **Playwright detection**: `navigator.webdriver === true`

Test mode can be explicitly disabled with `?test=0` in the URL, which overrides other detections.

## Configuration Files

- `.github/workflows/pages-deploy.yml` - GitHub Actions workflow for Pages deployment (manual trigger)
- `vite.config.ts` - Vite configuration with mode-based settings (base path)
- `src/vite-env.d.ts` - TypeScript definitions for environment variables
- `src/llm.ts` - LLM client with pathname-based test mode detection
- `package.json` - Added `build:pages` script

## Troubleshooting

### Game doesn't load

1. Check browser console for errors
2. Verify base path is correct in network requests (should be `/EmilysGame/`)
3. Ensure GitHub Pages is enabled in repository settings

### Assets not loading (404 errors)

- Check that asset paths in browser DevTools start with `/EmilysGame/`
- Verify the build was created with `npm run build:pages`
- Clear browser cache and hard refresh

### LLM splash screen appears and blocks

- This should not happen in Pages deployment
- If it does, check the pathname in the browser address bar (should be `/EmilysGame/...`)
- Check browser console for test mode detection logs
- Manually add `?test=1` to the URL as a workaround

### Assets load but with wrong paths

- Ensure you're using `npm run build:pages`, not `npm run build`
- Check that vite.config.ts has `base: '/EmilysGame/'` when mode is 'pages'

## Development Notes

### Adding Features

When adding new LLM-dependent features:

1. Always check `isTestMode()` before making LLM calls
2. Provide fallback behavior for test mode
3. Test with `?test=1` URL parameter locally before deploying

### Updating Deployment

The workflow is intentionally manual to:

- Avoid deploying every commit (saves Actions minutes)
- Allow testing before public deployment
- Give control over when the live site updates

To change to automatic deployment on push, edit `.github/workflows/pages-deploy.yml`:

```yaml
on:
  push:
    branches: [ main ]
  # Keep workflow_dispatch to allow manual triggers too
  workflow_dispatch:
```

### Changing the Repository Name

If you rename the repository, update:

1. `vite.config.ts` - change `base: '/EmilysGame/'` to `base: '/NewRepoName/'`
2. `src/llm.ts` - change `pathname.startsWith('/EmilysGame/')` to `pathname.startsWith('/NewRepoName/')`
3. This documentation file

Then rebuild and redeploy.
