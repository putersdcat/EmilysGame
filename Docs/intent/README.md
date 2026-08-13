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

## Status (2026-08-13)

First implementable draft is on disk. Read in this order:

1. `GAME.md` — who it is for, the 5–15 minute session, places, gates, Book, playtest law
2. `ENGINE.md` — grammar, walk fact, generation, entropy, DAG, save
3. `ISO.md` — why Iso2 existed (venues, Z, contact, occlusion)
4. `CONTRADICTIONS.md` — settled picks, dilutions, **three optional owner forks**
5. `SOURCES.md` / `GITHUB-EPICS.md` — what was actually read vs title-only

Home-is-not-an-exam, one walk fact including nano occupancy, and
closed-≠-shipped are already settled. Do not reopen those as debates.

**Second pass (same day):** all 176 closed + 48 open issue bodies dumped;
all comment threads read. #223 is 252 autonomous-loop comments + one
design note (troll-bridge is a walkable deck). Product that was on the
table and is now in the living files: cats, wildlife, night/flashlight,
WalkGirl cassette, buy/sell shops, mouth-flap talk, early-reader keys,
owner #25 feel, river crossings, entropy-once.

**Copilot Chat (this machine, 2026-08-13):** found and harvested.
VS Code workspace storage, not git. 4.63 GB of session logs; the usable
prose is in `GitHub.copilot-chat/transcripts/` (113 owner directives).
Method + quotes: `docs/intent/harvest/COPILOT-HARVEST.md`.
**Copy that folder off this PC** — a Windows reinstall erases the last
uncited owner teaching (brick wrap, nano hug, 2026-07 “it all falls
apart”).

Still not in-repo (cited, missing): Side Quests spec, Epic Music spec,
Visual Enhancements spec.

Raw dumps stay in `docs/intent/harvest/` so a later session does not
re-fetch.

## Next

Harvest is enough. Action charter: [`NEXT.md`](NEXT.md).
Do not keep patching the dirty `src/` on this branch.
