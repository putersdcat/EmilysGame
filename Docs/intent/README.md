# Recovered intent (living)

**Started 2026-08-13.** This directory is the only *current* design tree.

Everything else (`Docs/`, `memories/repo/`, `archived-planning/`, GitHub
epics, `ARCHITECTURE.md`, old AGENTS.md) is historical. Agents recover
full-fidelity intent **here**. They do not copy old code or pseudocode
into these files.

## Campaign

Until the owner opens the rewrite: **ignore `src/` as something to
extend.** Harvest GitHub + archives + current docs + memories. Write
what the game, engine, and iso layer were *meant* to be.

Rewrite target branch: `rewrite/intent-first`.

## Expected contents (fill these; do not leave as stubs)

| File | Purpose |
|------|---------|
| `SOURCES.md` | Inventory of every historical source + harvest status |
| `GAME.md` | Session, places, gates, education, NPCs, book, feel |
| `ENGINE.md` | Spatial model, walk, gen, entropy, progression, save |
| `ISO.md` | What Iso2 was for: materials, Z, occlusion, contact |
| `CONTRADICTIONS.md` | Unresolved conflicts between sources (owner picks) |
| `GITHUB-EPICS.md` | Deep review of remote issues/epics/PRs |

Do not mark a file “done” because a summary exists. Done means a later
session can implement from that file without opening the old tree.
