# Copilot Chat harvest (local VS Code)

This is **not** in git. It lives on this machine. Harvested 2026-08-13.

## Where it is

| Store | Path | What it is |
|-------|------|------------|
| Chat sessions (CRDT logs) | `%APPDATA%\Code\User\workspaceStorage\ed7ed0aad49a6561b44d088f7bbb2014\chatSessions\` | **75 files, 4.63 GB.** One session is 634 MB. Full snapshots + tool dumps. |
| Transcripts (usable) | `…\GitHub.copilot-chat\transcripts\` | 13 JSONL event streams. **214 `user.message` events** → 140 unique after dropping terminal noise → **113 owner directives**. |
| Session DB | `%APPDATA%\Code\User\globalStorage\github.copilot-chat\session-store.db` | 770 KB + 4 MB WAL. Index, not the prose. |
| Copilot CLI | `%USERPROFILE%\.copilot\session-state\` | Later CLI sessions (graphify / fleet), not the 2026-04–07 game teaching. |
| Memory tool | `%USERPROFILE%\.copilot\memories\emilysgame-refactor.md` | God-file extraction notes. Not product law. |
| Copilot Spaces (GitHub) | API | **404 / no spaces.** |
| Cloud Copilot coding-agent jobs | GitHub MCP | Overlaps the #223 autonomous-loop spam already harvested. |

Workspace folder record: `file:///c:/GitRoots/EmilysGame`.
A second workspace exists for `CopilotSvgToolv2` (one session).

## Second crack: the multi-hundred-MB files (2026-08-13)

They **are** JSON. Specifically JSONL CRDT logs:

- Line 0 is `{"kind":0,"v":{…entire session…}}` — this single line can
  be **100–600 MB** because it embeds every request **and** every tool
  dump.
- Later lines are tiny patches: `{"kind":1,"k":["hasPendingEdits"],"v":false}`.

`json.loads` of line 0 is how the first extractor died.

What worked: **chunked I/O** (8 MB), search for
`"message":{"text":"`, `"customTitle":"`, `"inputText":"`, decode the
JSON string with a small escape state machine. Peak RAM ≈ one chunk +
one prompt. **5 GB in 42 seconds.**

Result vs transcripts:

| | count |
|--|------:|
| Session files scanned | 75 |
| Unique user texts | 791 |
| Already in transcripts | 107 |
| **New** (not in transcripts) | **599** (many are draft keystrokes of the same prompt) |

Review file: `COPILOT-SESSION-NEW-INPUTS.md` (214 KB).
Index: `COPILOT-SESSION-INDEX.md`. Titles: `COPILOT-SESSION-TITLES.md`.

The 599 is inflated by **inputText drafts** (you typing the same
message 6 times). Unique *ideas* are fewer. The ones that were not in
GitHub issues or transcripts are merged into `GAME.md` / `ISO.md`
(Emily’s first playtest in his words; 8-sprite walk-boundary proof;
cottage-before-yard; 48 px fence; diagonal roof cube; soundfont MIDI;
hiss + mute).

## How to do this again (next machine / next clone)

1. VS Code must have opened this folder as `C:\GitRoots\EmilysGame` (or the same URI). History does **not** travel with `git clone`.
2. Copy `workspaceStorage\<hash>\GitHub.copilot-chat\transcripts\` and `chatSessions\` off the owner’s box **before** a Windows reinstall.
3. Parse transcripts for `"type": "user.message"` / `data.content`. Ignore `assistant.*` and `tool.*`.
4. Do **not** `json.loads` the 100–600 MB session files. They are single-line CRDT dumps. Stream, or skip them if transcripts exist.
5. Filter “please continue.” Keep anything that names feel, walls, water, gates, music, blur, keyboard, or “looks like shit.”

## What the owner said here that GitHub issues flattened

These are now in `GAME.md` / `ENGINE.md` / `ISO.md`:

1. **Walk:** leftover nano space is walkable; hug the wall in the next ninth; S/E “on the wall” is occlusion, not the wrong cell. (2026-04-29/30)
2. **Materials:** grout wraps the cube; 48³ nano after 144 micro; families (gray brick → red clinker → ancient stone). Texture factories, not solver bloat.
3. **#260 was born in chat** (2026-06-11 screenshot): scatter biomes, visible diamonds, bridge in the water.
4. **2026-07-03 port playtest:** green overlays, 90° bridge, hang, FPS.
5. **2026-07-17 desperation:** looks like shit, too slow, bad keyboard, hissing SFX, only MIDI works. Ready for “dead end.”
6. **2026-07-18:** blur = hydration at zero (starter drain too fast). Gate looks like a stick in a fence hole.
7. **Kit order** (2026-05-19): stone/castle walls → gates/bridges → fence/yard → homestead → cathedral.
8. **OK to break compat** if the break is documented (2026-06-15).
9. **Playwright MCP means play the game**, not only the suite (2026-06-11).

## What this store is *not*

- Not a second Game Bible. Most turns are “continue the refactor.”
- Not proof that B-phase line counts “landed.” Owner later said the game still falls apart.
- Not complete for chats **before ~2026-04-27**. Those may sit only inside the 4.6 GB CRDT files, or be gone.

## Files written

- `COPILOT-OWNER-DIRECTIVES.md` — 113 filtered owner messages
- `COPILOT-USER-PROMPTS.md` — all 140 including continue/short
