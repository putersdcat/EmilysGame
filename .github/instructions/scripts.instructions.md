---
description: "Use when editing build scripts, content pipeline, or automation scripts. Covers script conventions and available tooling."
applyTo: "scripts/**"
---
# Scripts & Automation

## Script Runner
All scripts use `tsx` for TypeScript execution: `npx tsx scripts/foo.ts`

## Available Scripts
| Script | Purpose |
|---|---|
| `capture-screenshot.ts` | Automated game screenshot (uses `?test=1`) |
| `convert-midi.ts` | Convert MIDI files for in-game playback |
| `export-svg-assets.ts` | Export SVG sprites to files |
| `generate-asset-ab-tests.ts` | A/B test variants (Aurora Glow, Ink Etching) → `asset-dev/Export/A-B-Tests/` |
| `generate-knowledge-content.ts` | Generate Book of Knowledge content packs |
| `generate-quiz-content.ts` | Generate quiz question content packs |
| `generate-manifest.ts` | Generate asset manifests |
| `sync-soundfonts.ts` | Sync soundfont files for piano playback |
| `midi-parser.ts` | MIDI file parsing utility |
| `content-pipeline/` | Content generation pipeline modules |

## Content Pipeline
Content packs are JSON files in `public/content/` with schema defined in `src/types/content-pack.types.ts`. Packs include version, shard metadata, and provenance tracking.

## Rules
1. Scripts should be idempotent — safe to re-run.
2. Use `?test=1` in any script that launches the game.
3. Output generated files to `asset-dev/Export/` (gitignored) or `public/content/` (tracked).
