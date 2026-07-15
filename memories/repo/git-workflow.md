# Git workflow rules for EmilysGame (this workspace)

## NEVER `git push` unless explicitly asked to in that exact session

The user manages remote sync themselves via a "sneakernet" process:
- `scripts/gen-patch.ps1` snapshots local work into a binary patch file under
  `C:\Temp\EmilysGame-local-iso2-work-<timestamp>.patch` (uses a throwaway
  copy of `.git/index` + `git add -A` + `git diff --cached <base> --binary
  --full-index`, so it does NOT disturb the real index/staging area). The
  user manually moves that patch to another machine/remote and applies +
  pushes it there themselves. Usage after a run: `git apply <patch>` (or
  `--check` / `--3way --binary` variants), printed by the script itself.
- This means `git push origin <branch>` from THIS environment can fail
  (observed: exit code 1) and that is EXPECTED, not an error to chase or
  retry. Committing locally is fine and normal; pushing is not this
  environment's job.
- Do not try to "fix" a failed push by force-pushing, re-authenticating, or
  investigating credentials — it's an intentional workflow boundary, not a
  bug.
- **BUG FOUND AND FIXED 2026-07-08**: the script originally diffed the temp
  index against implicit HEAD (`git diff --cached --binary --full-index`).
  That only captures "working tree vs last local commit" — if an agent
  session commits its own work-in-progress (normal, good git hygiene), that
  entire delta is already IN HEAD and silently invisible to a HEAD-relative
  diff, even though origin still doesn't have it. User noticed this directly
  ("my patch script is not picking up all the work") right after a session
  where I'd committed ~2 commits of Slice A.5-D work. Fixed by diffing
  against the upstream tracking ref instead of HEAD: `git diff --cached
  $upstream --binary --full-index`, where `$upstream = git rev-parse
  --abbrev-ref --symbolic-full-name '@{u}'` (falls back to
  `origin/experiment/isometric-2.0` if unset). This captures BOTH
  still-uncommitted dirt AND any local commits already ahead of origin, in
  one combined patch — the correct semantic for "everything this machine has
  that the other remote doesn't yet". **Going forward: committing locally
  during a session is safe and does NOT require any special handling before
  the user runs the script** — the fixed script handles it automatically.
  If `gen-patch.ps1` ever again seems to produce a suspiciously small/empty
  patch, check `git status` for "ahead of origin by N commits" first before
  assuming the working tree is actually clean of new work.
- Launch the script via `& .\scripts\gen-patch.ps1` in the EXISTING pwsh
  terminal session, not `powershell -File ...` (spawns a fresh sub-process
  that hits a stricter machine-wide execution policy / unsigned-script
  block via the user's OneDrive-synced PowerShell profile — fails with
  `UnauthorizedAccess`/"not digitally signed"). The persistent session
  already has whatever policy/profile lets it run directly.
- `scripts/gen-patch.ps1` is the user's own tool; don't modify or commit it
  as part of unrelated feature work unless asked. Two direct fixes made so
  far, both in response to the user hitting the exact symptom (not
  speculative — that's the bar for touching it again):
  1. 2026-07-08: diff base changed from `HEAD` to upstream (see bug writeup
     above).
  2. 2026-07-08 (same day, follow-up): after applying a patch on the remote
     via `git apply --3way --binary <patch>`, exactly 2 of 22 files failed
     (`does not match index` / `does not exist in index` + `patch does not
     apply`) — both were `.github/agents/GameMan.agent.md` and
     `scripts/gen-patch.ps1` itself, i.e. the two known per-machine-local
     files. Root cause: the remote already has its own independently-
     differing copy of each, so a patch that assumes "this file doesn't
     exist yet" (new-file add) or "this file's blob matches what I saw"
     (modify) correctly refuses rather than silently clobbering. This is
     SAFE behavior, not data loss/corruption — the other 20/22 files (100%
     of actual feature work) applied cleanly every time. Fixed by excluding
     both paths right after `git add -A` in the throwaway index: `git reset
     -- ".github/agents/GameMan.agent.md" "scripts/gen-patch.ps1" *>$null`
     (suppress reset's own chatter) before the `git diff --cached` step, so
     future patches never attempt to include either file at all.
  If a FUTURE `git apply` run reports failures on files OTHER than these
  two known ones, that's a real conflict worth investigating properly (not
  automatically safe to dismiss) — the "this is expected/harmless" read
  applies specifically to these two paths, not apply failures in general.
- `.github/agents/GameMan.agent.md` has also been seen locally modified
  (tool-permissions edit) outside of any feature work — leave it alone,
  don't stage/commit it as part of unrelated commits, don't revert it either.
  Note: the patch script's own `git add -A` DOES sweep this file (and itself)
  into the generated patch regardless — that's fine/intended for the
  sneakernet transfer, it's only git *commits* (feature-work history) that
  should exclude it.

## Fix #3 (2026-07-13): pathspec exclusion + byte-safe patch write

Investigated a "did the sneakernet transfer actually land?" question and found
origin (`origin/experiment/isometric-2.0`) was byte-identical (same git blob
hashes) to the 2026-07-08 merge-base for every real source file -- i.e. the
prior transfer-apply-push cycle did NOT bring across the 27 commits' worth of
code, despite 3 commits with lazy messages ("all the new things"/"just a few
things"/"a few more things") landing on origin. Root cause NOT fully pinned
down (the specific full patch from that day, `...-140538.patch`, was NOT
byte-corrupted when checked after the fact) -- most likely either the
differential patch got applied without its assumed prior-patch baseline ever
having been applied there, or `git apply` reported errors that got ignored
before `git add -A && git commit`. Two real, independent bugs were found and
fixed while investigating, regardless of which one actually caused this
specific incident:

1. **Latent encoding bug**: `git diff ... > $patch` (PowerShell `>` /
   Out-File redirection) is byte-UNSAFE -- if this script is ever invoked via
   Windows PowerShell 5.1 (`powershell.exe`) instead of PowerShell 7+
   (`pwsh.exe`), `>` defaults to UTF-16LE, which silently null-interleaves
   every byte of a `--binary` patch (git apply then either hard-fails or,
   worse, appears to accept it while doing nothing). Fixed by adding a
   `Write-GitDiffBytesToFile` helper that shells out to `cmd.exe /c "... >
   file"` for the actual redirect -- a raw OS-level byte pipe with zero text
   re-encoding, safe regardless of which PowerShell version runs the script.
2. **Insufficient exclusion mechanism**: the original `git reset --
   ".github/agents/GameMan.agent.md" "scripts/gen-patch.ps1"` (from Fix #2,
   2026-07-08) only reverts a path back to whatever HEAD has -- it does NOT
   stop the path from appearing as a full deletion in the diff when origin
   has a *committed* version of that path that local's HEAD never tracked at
   all. This became a live problem here: origin had somehow accumulated its
   own committed copy of `scripts/gen-patch.ps1` (114-126 lines, presumably
   swept in by an overly-broad `git add -A` on the remote during the
   incomplete sync attempt), so the old exclusion would have made a fresh
   patch DELETE the remote's own copy of the very tool used to apply it.
   Fixed by moving both exclusions onto the final `git diff` command itself
   via pathspec (`":(exclude)path"`), which correctly no-ops regardless of
   which side has the path. **Verified empirically**: same technique also
   caught a third case live -- `Docs/Next-Engine-And-Gameplay-Plan.md` existed
   ONLY on origin (184 lines, apparently written directly on the sync
   workstation, unrelated to any patch) and would have been silently DELETED
   by a naive upstream-vs-local diff. Resolved by adopting it locally instead
   of adding a permanent exclusion (commit `da4bf38`, byte-verified identical
   to origin via `git hash-object`/`git rev-parse origin:path` before
   committing) -- the general tool's exclusion list should stay limited to
   true per-machine files (GameMan.agent.md, gen-patch.ps1 itself), not grow
   arbitrary project-content exclusions.

**Verification method now recommended before any handoff** (worth repeating
for future one-time/large syncs): simulate the apply against an exact copy of
the target base BEFORE handing the patch off --
```powershell
$env:GIT_INDEX_FILE = <temp index path>
git read-tree origin/experiment/isometric-2.0
git apply --check --cached --binary <patch>   # plain, non-3way: proves zero ambiguity
git apply --cached --binary <patch>
git write-tree                                 # then diff this tree vs local HEAD (patched paths)
                                                # and vs origin (excluded paths) -- expect ZERO output both ways
```
A plain (non-`--3way`) check passing is a strong guarantee: it means the
patch's base assumption exactly matches origin's current tip, so applying on
the far side after `git reset --hard origin/experiment/isometric-2.0` will be
100% deterministic (hard-fails loudly per-hunk if anything doesn't match,
rather than `--3way`'s fuzzier/silent-partial-merge behavior). Updated the
script's own printed instructions to lead with plain apply + hard reset to
the exact base first, `--3way` only as a documented fallback, and an explicit
"check `git status`/`git diff --stat` BEFORE committing" step -- directly
targeting the "committed a partially-failed apply without checking" failure
mode suspected here.

**Small process lesson (2026-07-13):** when relaying "apply this patch" steps
in chat for the user to run on the OTHER (authenticated) machine, copy the
full absolute path (e.g. `C:\Temp\EmilysGame-local-iso2-work-<ts>.patch`)
exactly as `gen-patch.ps1` itself printed it -- don't retype/shorten it to a
bare filename in a hand-written recap. The script's own output always uses
the full path correctly; a chat summary that drops the folder prefix assumes
an unknown cwd on a machine we can't see.

## Current branch note (as of 2026-07-08)

Working on `experiment/isometric-2.0` branch directly (not a feature branch
off main), with an active PR #276 "feat(iso2): complete Phase D texture
transitions". Commit locally as normal; let the user's sneakernet process
handle getting commits to whatever remote actually serves that PR.

## Confirmed successful push cycle (2026-07-09)

User explicitly confirmed this session: "i have just pushed it all to the
remote branch" (referring to commits through `05a1df7`, made via the
sneakernet gen-patch.ps1 process). This is the first EXPLICIT user
confirmation of a successful round-trip (patch generated here -> applied on
remote -> pushed) since the process was fixed on 2026-07-08 (upstream-diff
base + GameMan.agent.md/gen-patch.ps1 exclusion, see above). Terminal
history the same day also shows the user (or a resumed instance) ran
`.\scripts\gen-patch.ps1` again directly (exit code 0) after further commits
landed (`9c36921` spawn-escape-hatch fix). **Working conclusion: the fixed
patch workflow is confirmed reliable in practice, not just in theory** --
continue committing locally as normal after every validated slice, no
special handling needed before the user's own patch/push cycle.
