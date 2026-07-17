# AGENTS.md — Emily's Game

**Product branch:** `experiment/isometric-2.0`  
**Always-on Copilot context:** this file + [`.github/copilot-instructions.md`](.github/copilot-instructions.md). Path rules auto-attach from [`.github/instructions/`](.github/instructions/). Named personas live in [`.github/agents/`](.github/agents/).

---

## Product goal

A child can play a **satisfying 5–15 min session**: spawn in a place → move reliably → hit a real quiz gate → fail gently → open → leave → see another intentional place. Expand via **scene recipes**, **content packs**, **NPC personas** — not new world ontology.

## Standing laws

1. **Stay on `experiment/isometric-2.0`** for product work (no silent trunk switch / greenfield).
2. **Scene-first gen** — free structure atoms (random towers, gate-less fence pens) are bugs.
3. **No barrier without function** — openings are `quiz_gate` | `door_locked` | explicit open path.
4. **Flat sim owns walkability/progression** — presentation never decides gate open (`docs/02`).
5. **Iso2 is paint only** — no new nano systems, FOV thrash, or material-factory campaigns.
6. **FOV locked** — on-screen diamonds **128×64**, `entityDisplayScale` ~1.0 unless written RFC.
7. **No speculative reorgs** for line-count aesthetics (`memories/repo/code-organization-philosophy.md`).
8. **Proof = playtest** — live session feel beats green tests alone (tests stay a regression net).

## Campaign status (keep short)

| Campaign | Status |
|----------|--------|
| Scene-first productization (PR1–7) | ✅ Done — do **not** re-run that plan |
| Playable-session recovery (boot/coins/water/density/homestead) | ✅ Landed on tip — re-open only if playtest still fails |
| Next default | Content + recipes + residual **feel** fixes only |

Canonical designs: `memories/repo/definitive-path-forward-2026-07-16.md`, `memories/repo/design-playable-session-recovery.md`, `memories/repo/expandability-rails.md`.  
Vision/arch: `docs/01`, `docs/02`.

## Where code goes

| Kind | Put it in |
|------|-----------|
| Pure logic (walkability, gen, quiz rules, math) | `src/engine/` |
| Canvas / iso projection / nano paint | `src/rendering/` |
| Sprites / materials pipeline | `src/asset-pipeline/` |
| Loop orchestration, save, input, audio systems | `src/game/` |
| DOM HUD / menus | `src/ui/` |
| Tunables / content tables | `src/config/*.config.ts` (`as const`) |
| Shared types used by 2+ layers | `src/types/` |

Prefer surgical edits. Do not invent parallel ontologies under `experiment/` for product features already on tip.

## Agent workflow (all tools)

- Ground claims in **repo files** and **playtest**; do not invent paths or “done” without verification.
- Prefer small PR slices with player **Done-when** + a short test command.
- Do **not** auto-continue closed PR plans. Only run `/execute-plan` / multi-PR stacks when the user points at a **current** design doc.
- Visual asset loops: use isoSvgRenderer MCP when available; do not dump full-page Playwright screenshots into chat (413 risk). Live game feel → Vite + manual or targeted Playwright specs.

## Out of scope by default

New nano kinds, EDGE_COMPAT rewrites, V4 scale thrash, dual-trunk main rewrites, greenfield repos “for cleanliness.”
