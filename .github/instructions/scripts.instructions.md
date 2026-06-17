---
description: "Use when editing build scripts, content pipeline, or automation scripts. Covers script conventions and available tooling."
applyTo: "scripts/**"
---

# Scripts & Automation

## Script Runner
All scripts use `tsx` for TypeScript execution: `npx tsx scripts/foo.ts`

PowerShell helpers (`.ps1`) and batch files (`.cmd`, `.bat`) are allowed for
Windows-specific tooling (e.g., `wait-for-dev.ps1`, `launch-alpha-preview.cmd`).

## Available Scripts

| Script | Purpose |
|---|---|
| `capture-screenshot.ts` | Automated game screenshot (uses `?test=1`) |
| `convert-midi.ts` | Convert MIDI files for in-game playback |
| `export-svg-assets.ts` | Export SVG sprites to files |
| `export-world-tile-assets.ts` | Export per-world-tile assets |
| `generate-asset-ab-tests.ts` | A/B test variants (Aurora Glow, Ink Etching) → `asset-dev/Export/A-B-Tests/` |
| `generate-knowledge-content.ts` | Generate Book of Knowledge content packs |
| `generate-quiz-content.ts` | Generate quiz question content packs |
| `generate-manifest.ts` | Generate asset manifests |
| `sync-soundfonts.ts` | Sync soundfont files for piano playback |
| `midi-parser.ts` | MIDI file parsing utility |
| `transcode-piano-to-ogg.ts` | Transcode piano MP3 → OGG for browser playback |
| `run-iso2-autonomous-cycle.ts` | Iso 2.0 autonomous visual cycle |
| `content-pipeline/` | Content generation pipeline modules |
| `create-iso2-issues.ps1` | Create GitHub issues for Iso 2.0 visual debt |
| `iso2-lock-check.ps1` / `iso2-lock-check-burst.ps1` | Iso 2.0 lock check tools |
| `setup-github-project.ps1` | Initialize GitHub Project V2 board |
| `poll-game-dev-5173.ps1` / `wait-for-dev.ps1` | Dev-server polling helpers |
| `launch-alpha-preview.cmd` | Launch alpha preview build |

## Content Pipeline
Content packs are JSON files in `public/content/` with schema defined in
`src/types/content-pack.types.ts`. Packs include version, shard metadata, and
provenance tracking.

## Rules

1. Scripts should be idempotent — safe to re-run.
2. Use `?test=1` in any script that launches the game.
3. Output generated files to `asset-dev/Export/` (gitignored) or `public/content/` (tracked).
4. **Long-running scripts** (autonomous cycles, lock checks) should be backgrounded
   — use `run_in_terminal` with `mode=async` rather than blocking.
5. **PowerShell scripts** should work cross-platform where possible — fall back to
   Node.js if a task is platform-agnostic.

## Adding a New Script

1. Create `scripts/<verb>-<noun>.ts` (kebab-case).
2. Use `tsx` for TS execution, no manual build step.
3. Make it idempotent — re-running shouldn't break anything.
4. Add to the inventory table above.
5. If it's part of the content pipeline, put it in `scripts/content-pipeline/`.

## Pre-Commit Checks

```bash
# Typecheck (scripts compile via tsx, but tsc should still pass)
npx tsc --noEmit
```

## Cross-References

- `.github/instructions/architecture.instructions.md` — module size discipline (applies to script files too)
- `.github/instructions/llm-integration.instructions.md` — `?test=1` for LLM-free execution
- `.github/instructions/ci-cd.instructions.md` — when scripts run in CI