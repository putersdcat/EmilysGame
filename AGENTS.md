# AGENTS.md — Emily's Game productization campaign

**Read first every session:**  
`memories/repo/definitive-path-forward-2026-07-16.md`  
`memories/repo/design-scene-first-productization.md`  
`docs/01` + `docs/02` (vision + flat-sim principle)

---

## Campaign objective (macro — the finish line)

Deliver a **clean, focused product base** on branch `experiment/isometric-2.0` such that:

1. A child can complete a **satisfying 5–15 min session**: spawn in a *place* → move reliably → hit a **real** quiz gate → fail gently → open → leave → see another intentional place.  
2. World generation **authors places** (scenes + paths + functional barriers), not decorative atom soup.  
3. **Iso 2.0 nano/materials are paint only** — no new presentation architecture, no new world ontology.  
4. Expansion is cheap: new **scene recipe**, **quiz/Book content**, **NPC persona**, **side-quest flag** without opening `WorldUnitSolver.ts` or inventing nano kinds.  
5. FOV/scale stay locked (on-screen diamonds **128×64**, `entityDisplayScale` ~1.0) unless a written RFC says otherwise.

**This is not “MVP then abandon.”** It is the durable base for continuous content growth.

---

## Standing laws (non-negotiable)

1. **Stay on this branch** for product work. Do not greenfield or switch daily trunk to `main` without user decision.  
2. **Scene-first gen.** Free structure atoms (outhouse, random house/tower, decorative fence pens without gates) are bugs.  
3. **No barrier without function.** Fence/wall openings must be `quiz_gate`, `door_locked`, or an explicit open path entry.  
4. **Flat sim owns walkability/progression.** Presentation never decides if a gate is open (`docs/02`).  
5. **Iso2 freeze for architecture.** Paint OK; new nano systems / tileWidth thrash not OK.  
6. **No speculative reorgs** for line counts (`memories/repo/code-organization-philosophy.md`).  
7. **Auto-continue** along the PR Plan in `design-scene-first-productization.md` until blocked or phase done.  
8. **Proof bar:** live screenshot of intentional places + green M1 + scene-invariant tests — not material showcase alone.

---

## Long-running execution (how agents stay on track)

| Mechanism | Use |
|-----------|-----|
| This `AGENTS.md` | Loaded every session — campaign memory |
| `design-scene-first-productization.md` | Full phases + **PR Plan DAG** for `/execute-plan` |
| `definitive-path-forward-2026-07-16.md` | Why this path (evidence) |
| `/execute-plan <design-doc>` | Multi-PR orchestrated implementation with review loops |
| `/design …` | Only if the design doc must be re-opened |
| `/check-work` | After each PR slice |
| Subagents (`plan` / `explore` / `general-purpose`) | Parallel research/impl when needed |

**Preferred long-horizon command (user or agent-orchestrated):**

```text
/execute-plan memories/repo/design-scene-first-productization.md --concurrency 2 --no-graphite
```

(Add `--auto-pr` only if opening draft PRs is desired.)

Resume after interruption:

```text
/execute-plan --resume <PLAN_ID>
```

If not using `/execute-plan`, implement **PR Plan order only** (PR1 → PR2 → …), one slice per session if needed, always re-read this file first.

---

## Out of scope until campaign acceptance

- New material factories / nano primitives for their own sake  
- Speculative engine rewrites or main-branch dual trunk  
- EDGE_COMPAT full symmetry rewrite  
- V4 scale thrash (256 diamonds, etc.)
