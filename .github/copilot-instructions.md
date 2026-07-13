# Copilot Agent Instructions — Emily's Game

## Project Overview

Emily's Game is an isometric browser-based procedural adventure game with LLM-driven entropy, educational quizzes, and biome progression. Built with TypeScript, Vite, and Canvas 2D.

**All planning, feature tracking, and task management is in GitHub Issues and the GitHub Project board.** Reference issues and milestones first — do not create standalone Markdown planning documents.

**Start-here docs:** Read [`ARCHITECTURE.md`](../ARCHITECTURE.md) (engine architecture: layered structure, spatial hierarchy, rendering/generation pipelines, state/save model) and [`AGENTS.md`](../AGENTS.md) (how to add code, run visual tests, conventions, and the Iso 2.0 → main port contract) before making engine changes.

## GitHub Project Location

- **Project Board:** "EmilysGame - Development Roadmap" (user-level GitHub Project V2)
- **Repository:** `putersdcat/EmilysGame`
- GitHub Projects V2 are user/org-level (not repo-level). The project name includes the repository prefix for clarity.
- The master epic is Issue #2 — all feature and task issues are linked as sub-issues.

## Agent Workflow Rules

### Starting a Session
1. Check GitHub Issues for assigned or prioritized tasks. Reference the issue number (e.g., `#4`) before proceeding.
2. Review the Project board for current sprint/backlog priorities.
3. Pull latest from the working branch before making changes.

### During Work
1. Break work into small, verifiable steps. Use the todo list tool to track progress.
2. Reference the issue's acceptance criteria throughout. Do not claim done until all criteria are met.
3. Follow the coding standards below for all code changes.
4. Write or update Playwright tests for any new functionality.
5. Run `npx tsc --noEmit` (type check) and `npx playwright test` (E2E tests) before considering work complete.

### Ending a Session
1. Update the GitHub Issue with a comment summarizing what was done.
2. If code was changed, commit to a feature branch and open/update a PR referencing the issue.
3. Update issue status (move to Review/Done on the project board if applicable).

### Creating New Work Items
- **Always create GitHub Issues** for new tasks, features, or bugs — never standalone Markdown planning docs.
- Use labels: `epic`, `task`, `feature`, `performance`, `ui`, `rendering`, `llm`, `world-generation`, `education`, `infrastructure`, `ci-cd`, `sprites`, `art`, `tooling`, `high-priority`.
- Link child issues to the appropriate epic using sub-issues.
- Add acceptance criteria to every issue.

### Hallucination Prevention
- If uncertain about any aspect, ask the user. Always ground decisions in repo context (existing code, issues, config files).
- Scan actual files before assuming content. Do not fabricate file paths or API endpoints.
- Verify build/test results before reporting success.

## Coding Standards

### Language & Framework
- **TypeScript** (strict mode) with Vite bundler
- **Canvas 2D** for rendering (not WebGL)
- **HTML DOM** for all UI elements (not canvas-drawn UI)

### Architecture
- Game loop in `src/main.ts` with `requestAnimationFrame`
- Configuration in `src/config/*.config.ts` files
- UI sync in `src/ui.ts`, DOM elements in `src/index.html`
- Input edge detection via `justPressed()`/`endFrame()` pattern in `src/input.ts`

### Performance Requirements
- All render operations must be viewport-culled
- Throttle animation frames (don't tick `animFrame` every rAF)
- Throttle DOM syncs (not every frame)
- Avoid closure allocations in hot paths (render loop)
- Chunk loading only when player crosses chunk boundaries

### LLM Integration
- LLM endpoint: proxied via `vite.config.ts`'s dev-server proxy (`/api/llm` -> `http://127.0.0.1:<port>`) to avoid CORS. **The port is machine/session-dependent** (has been 8000, 8001, 8002, and 8005 at different times/on different machines) -- always verify with `GET http://127.0.0.1:<port>/health` before assuming a number in any doc is current; update `vite.config.ts`'s proxy target if it doesn't match. Currently configured for `8005` (verified 2026-07-10).
- Game startup gates on LLM health check (`GET /health`)
- Use `POST /v1/chat/completions` for entropy/NPC chat
- Fallback to TypeScript RNG if LLM inference >1-2s
- Configuration must be flexible (local/remote, configurable URL)
- See Docs\LocalBitNet_Integration_Readme.md for details

### Testing
- E2E tests via Playwright in `tests/` directory
- Run: `npx playwright test --reporter=line`
- Dev server: `npx vite` (localhost:5173)
- Type check: `npx tsc --noEmit`
- Build: `npx vite build`

## Path-Scoped Instructions

Detailed, context-aware instructions live in `.github/instructions/`. These auto-attach when editing matching files:

| Instruction File | Scope | Key Content |
|-----------------|-------|-------------|
| `src-main.instructions.md` | `src/main.ts` | God-file mitigation, extraction targets |
| `src-gen.instructions.md` | `src/gen.ts` | Monolith extraction strategy |
| `rendering.instructions.md` | `src/{render,terrain-cache,local-lights,shadows,fog,lighting}.ts` | Zero-allocation rules, Camera dedup |
| `config-files.instructions.md` | `src/config/*.config.ts` | Typing, immutability, duplicate types |
| `types.instructions.md` | `src/types/**` | Type centralization strategy |
| `audio.instructions.md` | `src/{sfx,music,sampled-sfx,midi-loader,npc-voice}.ts` | Error handling, factory patterns |
| `tests.instructions.md` | `tests/**` | Test mode, sharding, coverage gaps |
| `state-management.instructions.md` | On-demand | State architecture, save/load rules |
| `performance.instructions.md` | On-demand | Hot-path rules, throttling, chunks |
| `llm-integration.instructions.md` | `src/llm.ts` | Test mode bypass, fallback strategy |
| `scripts.instructions.md` | `scripts/**` | Script conventions, content pipeline |
| `ci-cd.instructions.md` | `.github/workflows/**` | Workflow rules, deployment process |

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/main.ts` | Game loop, LLM gate, perf tracking (**⚠️ 3,150-line god file — see instructions**) |
| `src/render.ts` | Viewport-culled isometric renderer |
| `src/ui.ts` | HTML DOM UI sync |
| `src/input.ts` | Edge detection input handling |
| `src/sprites.ts` | SVG sprite generation + cache |
| `src/llm.ts` | LLM client (health, chat, entropy) |
| `src/gen.ts` | World generation (**⚠️ 2,480-line monolith — see instructions**) |
| `src/quiz.ts` | Quiz system |
| `src/inventory.ts` | Item/inventory management |
| `src/mechanics.ts` | Game mechanics (collision, interaction) |
| `src/save.ts` | Save/load via localStorage |
| `src/index.html` | HTML structure (splash, HUD, overlays) |
| `src/config/*.config.ts` | All game configuration |

## Issue Structure

| Issue | Title | Type |
|-------|-------|------|
| #1 | Performance Optimizations | Task (High Priority) |
| #2 | Game Bible - Master Design | Epic (Parent) |
| #3 | Isometric Rendering Engine | Epic |
| #4 | LLM Entropy System | Epic |
| #5 | Character Sprite System | Epic |
| #6 | Tile & World Generation | Epic |
| #7 | Book of Knowledge | Epic |
| #8 | Knowledge Capture Pipeline | Task |
| #9 | CI/CD Pipeline | Task |
| #10 | UI Layout & Sidebar | Task |
