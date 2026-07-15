# VS Code renderer OOM crash diagnosis (2026-07-09)

Symptom: "The window terminated unexpectedly (reason: 'oom', code: -536870904)"
happening 5+ times recently in this workspace.

## Investigation method
No smoking-gun line exists in `%APPDATA%\Code\logs\*\**\*.log` for any of the
last 8 log sessions (searched for oom|out of memory|terminated
unexpectedly|RenderProcessGone|crashed|SIGKILL) - this is EXPECTED, Chromium's
OOM killer terminates the renderer before it can flush a "why" log line.
`reason: 'oom'` is Electron's own render-process-gone classification. Diagnosis
had to be built from structural risk factors instead, not a single log line.
Don't waste time re-searching VS Code's own logs for this - it won't be there.

## Ranked root causes found
1. **Primary suspect**: global user `settings.json` (`%APPDATA%\Code\User\settings.json`,
   NOT this repo) has `chat.agent.maxRequests: 3500` + `chat.tools.global.autoApprove: true`
   + `copilot-resurrect.enabled: true` (user's own extension - repo
   `putersdcat/HelkinSwarm`, "keep autonomous coding loops alive overnight").
   The renderer holds the FULL chat transcript (every tool call, terminal
   dump, diff, screenshot) for the life of ONE continuous session. These
   settings let a single session run for hours with no natural pause.
   Important nuance: `copilot-resurrect.startNewSession` defaults to `true` -
   it DOES reset the transcript by starting a fresh chat when it fires. The
   gap is that it only fires after `silenceTimeoutSeconds` (default 180s) of
   inactivity - a continuously-active auto-approved agent session never goes
   silent, so the watchdog never gets a chance to reset anything, and the one
   session just grows until the renderer's heap is exhausted.
2. **Compounding**: ~60 globally-installed extensions activate in every VS
   Code window regardless of relevance, incl. full C# Dev Kit/Roslyn, 4
   Python/Pylance extensions, ~14 Azure resource extensions, 4 MSSQL
   extensions (all for an unrelated "FitFlex"/ITAssetManagement/SAP-Fioneer
   work project sharing this machine/profile - evidenced by
   `terminal.integrated.env.windows` Zscaler/FioneerTools cert paths and Jira
   FIT/WPIT settings in the same global settings.json), plus THREE concurrent
   AI agent extensions (`github.copilot-chat`, `anthropic.claude-code`,
   `ms-windows-ai-studio.windows-ai-studio`) plus a wildcard-activation
   (`"activationEvents": ["*"]`) chat-participant extension
   (`buildwithlayer.vs-code-integration-expert`). Raises baseline memory
   floor of every window before project content even loads.
3. **Compounding**: process snapshot showed dozens of concurrent `Code.exe`
   processes (many windows/profiles open at once) on a 32GB machine with
   only ~9GB free at a quiet moment - each window re-pays the extension tax.
4. Workspace itself is NOT the problem by size: only ~6,600 files / ~430MB
   total content (node_modules 171MB/1262 files, experiment/ 129MB/4257
   files, OnlyFails 48MB/53 files, tests 39MB, .playwright-mcp 10MB, public
   10MB, src only 1.7MB). Not a monorepo-scale file-watcher issue - don't
   over-invest in that theory if this recurs.
5. Git pack is 474.89 MiB (7107 objects) - not itself alarming (no GitLens
   installed), noted for completeness only.

## What was fixed directly (2026-07-09, uncommitted local edits)
- Created `.vscode/settings.json` (workspace had NONE before) with
  `files.watcherExclude` / `search.exclude` for OnlyFails, test-results,
  playwright-report, .playwright-mcp, terminals, .grok,
  experiment/isometric-2.0 node_modules/tmp, wasm build output,
  asset-dev/Export, Docs/images, Docs/ScreenshotUpscales. Defensive
  hardening, explicitly NOT expected to be the primary fix given point 4
  above.
- Added **`chat.agent.maxRequests: 300`** to that same workspace
  settings.json (workspace-scoped override of the global 3500, this repo
  only). Forces more frequent natural session checkpoints so
  copilot-resurrect's silence-based fresh-session reset actually gets
  triggered periodically instead of one session running unbounded for
  hours. Does NOT touch the user's global chat settings or disable
  copilot-resurrect. This repo's own conventions (GitHub issues +
  session/repo memory files) already carry task continuity across fresh
  chat sessions, so this should cost little in practice.
- Added `OnlyFails/` to `.gitignore` (was untracked-from-ignore despite
  test-results/playwright-report/.playwright-mcp all being ignored - the 53
  files/48MB already committed were NOT untracked, only future growth is
  prevented; untracking existing files was left as a user decision).

## Follow-up after user review (same session)
User confirmed all three: untrack OnlyFails/ now, keep maxRequests=300,
wants Profile walkthrough. Executed `git rm --cached -r OnlyFails` (files
kept on disk) + committed isolated as local commit `319a29a` ("chore: stop
tracking OnlyFails/ test-artifact screenshots") on `experiment/isometric-2.0`
- NOT pushed (per git-workflow.md). Left the 7 modified iso2 files + 2
untracked test specs + untracked scripts/gen-patch.ps1 + modified
GameMan.agent.md completely untouched/unstaged, exactly as they were.
Also discovered `.vscode/` is already in this repo's `.gitignore`, so the
new `.vscode/settings.json` (watcher excludes + maxRequests:300) is
LOCAL-ONLY to this machine and will never show in `git status` or get
committed - that's consistent with the existing convention (`.vscode/mcp.json`
presumably has personal config too), not a bug.

## Deliberately NOT done (needs explicit user decision, don't do these
unprompted in a future session)
- Did NOT set `copilot-resurrect.enabled: false` anywhere - it's the user's
  own intentional tool; there's precedent in user memory notes from another
  project explicitly saying not to disable it.
- Did NOT touch global `%APPDATA%\Code\User\settings.json` at all - only
  workspace-scoped `.vscode/settings.json` in this repo was touched.
- Did NOT `git rm --cached OnlyFails/` (would untrack 53 already-committed
  files) - ask first, the name suggests intentionally curated failure
  screenshots, not obvious accidental bloat.
- Did NOT disable/uninstall any of the ~60 extensions or set up a VS Code
  Profile for this workspace - that requires manual UI action from the user
  (Profiles aren't file-editable); recommended it verbally instead.
- Did NOT commit or push any of these file edits (per
  `/memories/repo/git-workflow.md`: never push unless asked; this session
  left them as local uncommitted changes for the user to fold in whenever
  they like, kept deliberately separate from the in-progress Phase D iso2
  texture-transitions work already dirty in the working tree).
