# Second-pass GitHub harvest (2026-08-13)

The first pass read master epic *bodies* and a handful of closed issues.
It did **not** read all 176 closed bodies or the long comment chains.
This pass did.

## What was pulled

| Artifact | What it is |
|----------|------------|
| `issues-all.json` | All 224 issues (48 open, 176 closed) with full bodies + comments as returned by `gh issue list` |
| `comments-223.json` | All **253** comments on #223 (`gh api --paginate`) |
| `ISSUE-CATALOG.md` | Human-readable bodies (truncated at 1200 chars) |
| `CLOSED-INDEX.md` | Every closed title |
| `COMMENTS-OTHER.md` | Every comment except #223 |
| `COMMENTS-223-KEPT.md` | The one non-spam #223 comment |
| `SELECTED.md` | Full bodies + comments for the product-law subset |
| `prs-all.json` | 48 PRs; almost no discussion |

## #223 comment chain

253 comments, all under `putersdcat`, 2026-05-22 → 2026-06-11.
252 are autonomous-loop status (“lock acq”, “MCP first”, “AiTools 198694B”).
They do not add product law. They are evidence of the agent stack that
declared victory from harnesses.

The one design comment (`b7acd77`): troll-bridge is a **flat
always-walkable** river overlay; live quiz-UI unlock was **not** done.

## Owner-voice that was on the table

#25 is the human, not an agent:

- Game looked like garbage; movement awkward; gen incoherent.
- Grass must not look stamped; water must move; shadows at an angle.
- **Cats you can pet that purr.**
- Mushrooms tiny, three to a cell, no shadow; trees get shadows.

## Product law merged into living files this pass

Cats/wildlife, night+flashlight+glowing eyes, WalkGirl cassette,
buy/sell + themed shops + barter quiz, thought bubbles, mouth flap,
early-reader 1-2-3/R, menu→customizer→subjects, cosmetics from
quizzes+discovery, entropy called once, rivers impassable except
crossings, walk priority, homestead assembly vs home-not-exam,
troll-bridge deck vs locked floor.

## Still missing

These filenames are cited by many closed issues and are **not in the
repository** (current tree or a quick `--diff-filter=A` search):

- `Docs/Side Quests, Inventory Management, and NPC Interactions,md.md`
- `Docs/Epic Music and Sound Engine Implementation.md`
- `Docs/Visual and Feature Enhancements.md`

If they exist on another machine or in a lost commit, they are the
last high-value archive. Until then, the issues that quote them
(`#109`, `#110`, `#111`, `#112`, `#113`, `#107`, `#114`) are the
recovery path.

Project boards: GitHub API 403.
