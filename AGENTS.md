# AGENTS.md — Emily's Game

**Product branch:** `experiment/isometric-2.0`  
**Always-on:** this file + [`.github/copilot-instructions.md`](.github/copilot-instructions.md). Path rules: [`.github/instructions/`](.github/instructions/). Personas: [`.github/agents/`](.github/agents/).

---

## Autonomy (default)

**Keep working until the user's request is done.** Multi-turn tool use is expected. Do **not** stop after one edit or one search to "report status," ask permission for the next obvious step, or narrate a plan instead of executing it.

| Do | Don't |
|----|--------|
| Implement → verify → fix → continue | Pause every turn for human approval |
| Batch related edits in one run | One-file-then-stop "updates" |
| Only ask when blocked on a real product choice | Ask before every `tsc` / test / commit path the user already authorized |
| Short final summary when **finished** | Mid-task essays and checklists |

**"Do not auto-continue closed campaigns"** means: do not re-run finished scene-first / paint-architecture PR plans from old docs. It does **not** mean stop mid-task or refuse to drive a clear user request to completion.

---

## Product goal

A child can play a **satisfying 5–15 min session**: spawn in a place → move reliably → real quiz gate → fail gently → open → leave → another intentional place. Expand via **scene recipes**, **content packs**, **NPC personas** — not new world ontology.

## Standing laws

1. **Stay on `experiment/isometric-2.0`** for product work (no silent trunk switch / greenfield).
2. **Scene-first gen** — free structure atoms (random towers, gate-less fence pens) are bugs.
3. **No barrier without function** — openings are `quiz_gate` | `door_locked` | explicit open path.
4. **Flat sim owns walkability/progression** — presentation never decides gate open (`docs/02`).
5. **Iso2 is paint only** — no new nano systems, FOV thrash, or material-factory campaigns.
6. **FOV locked** — on-screen diamonds **128×64**, `entityDisplayScale` ~1.0 unless written RFC.
7. **No speculative reorgs** for line-count aesthetics.
8. **Proof = playtest** when the task is feel/UX; keep tests as a regression net.

## Campaign status

| Campaign | Status |
|----------|--------|
| Scene-first productization (PR1–7) | Done — do **not** re-run that plan |
| Playable-session recovery | Landed — reopen only if playtest still fails |
| Next default | Content + recipes + residual feel fixes |

Designs: `memories/repo/definitive-path-forward-2026-07-16.md`, `design-playable-session-recovery.md`, `expandability-rails.md`. Vision: `docs/01`, `docs/02`.

## Where code goes

| Kind | Put it in |
|------|-----------|
| Pure logic | `src/engine/` |
| Canvas / iso paint | `src/rendering/` |
| Sprites / materials | `src/asset-pipeline/` |
| Loop, save, input, audio | `src/game/` |
| DOM HUD | `src/ui/` |
| Content knobs | `src/config/*.config.ts` (`as const`) |
| Shared types (2+ layers) | `src/types/` |

App entry is **`src/`**. Nested `experiment/isometric-2.0/` is MCP/legacy iso sources, not the product entrypoint.

## Verify without thrashing

- `npx tsc --noEmit` and **targeted** Playwright when relevant; full suite only when the change warrants it.
- Visual assets: isoSvgRenderer MCP when available; avoid dumping huge Playwright screenshots into chat.
- Multi-PR `/execute-plan` stacks only when the user points at a **current** design doc.

## Out of scope by default

New nano kinds, EDGE_COMPAT rewrites, V4 scale thrash, dual-trunk main rewrites, greenfield “for cleanliness.”
