# 13 — Development Roadmap

**Status:** Living document. Assumes `12`. This document is about *how* the
rest of this set gets applied to real work, not a new design.

---

## 1. The standing constraint: no speculative rewrites

This repository has an explicit, prior user directive
(`/memories/repo/code-organization-philosophy.md`) against reorganizing
working code for its own sake: "does not really move the needle... token
heavy busy work." A file is fine to be large if it's cohesive; splitting
or restructuring is only warranted when it serves a genuine functional
reason discovered while doing real work.

**This document set does not override that rule — it operates inside it.**
Concretely:

- `02`'s core principle is a **lens for new work and a way to talk about
  the system clearly** — not a mandate to go split `nano-tile.ts` or
  rewrite `WorldUnitSolver.ts` this week.
- The isometric/logic entanglement documented in `12` §3 is **known,
  written down, and low-priority as a code change** unless it's actually
  blocking a real feature or causing a real bug.
- The proven way this codebase closes real gaps is the same methodology
  already used successfully for the Iso 2.0 port-back and the Vision
  Alignment Audit passes: **deep-read the real source → form a grounded
  hypothesis → verify against real generation/config data → make a
  narrow, safe fix → prove it with a live-engine test.** Nothing in this
  roadmap should be read as license to skip that discipline in favor of a
  bigger, riskier restructuring project.

## 2. Priority order for real, functional work

Ordered by (a) how directly it serves a design pillar from `01` §4, and
(b) how well-evidenced/narrow the fix already is per `12`:

1. **Quiz-gate unavoidability** (`12` §2, `04` §9) — the highest-value,
   most directly Pillar-2-relevant open gap. Candidate approach (already
   scoped in the archived `Next-Engine-And-Gameplay-Plan.md`, still valid):
   bias gate placement onto a Region's main traversal corridors and check
   for trivial bypass routes around a placed gate, as a narrow addition to
   the existing obstacle-placement pass — not a new solver.
2. **Composite pond/lake template** (`12` §2, `04` §7) — closes the
   river-heavy over-saturation finding using the pattern that already
   works for homesteads and castle landmarks (`stampIso2Assembly`),
   applied to one more scene type.
3. **Content pipeline automation** (`07` §5, `12` §2) — the rephrasing
   quality-gate and CI-refresh pieces that were always part of the
   original spec but never built; the manual content drop already in
   place is a legitimate, sanctioned interim state, not an emergency.
4. **`EDGE_COMPAT` symmetry fix** (`12` §2) — deliberately deferred due to
   blast radius (touches the whole constraint solver); revisit only with a
   full regression + determinism-hash re-capture plan in hand, exactly as
   the prior chain-integrity fix did.
5. **Opportunistic nano-tile schema alignment** (`12` §3/§4) — the lowest
   priority on this list precisely because it's the one item that's
   "architecturally interesting" but has no open bug or missing feature
   attached to it right now. Only touch it as a side-effect of doing real
   work inside that system for an unrelated reason (matching the standing
   rule in §1) — if a future session is genuinely working in
   `nano-tile-defs.ts`/`mechanics.ts` for a real bug or feature and a
   clean seam falls out of that work naturally, take it; don't go looking
   for the seam on its own.

## 3. How to use this document set day to day

For anyone (human or agent) picking up a new piece of work on Emily's Game:

1. Read `01`+`02` once, fully, before anything else.
2. When building a **new gameplay system**: model its data in `03`'s
   vocabulary first. If you find yourself wanting a field that describes
   *how something looks* rather than *what it does*, that's `05`'s
   resolver table, not your new schema.
3. When **fixing a bug or auditing an existing system**: use the Slice
   methodology from §1 — read real source, verify against real data,
   fix narrowly, prove with a test. Update `12` with what you found,
   the same way this document set's own gap analysis was built.
4. When in doubt about scope, prefer the smaller, narrower, better-tested
   change — this has been this project's most reliably successful pattern
   across every audit pass referenced in `12`.

## 4. Phase: Iso 2.0 visual technology re-attachment

**Not abandoned.** Iso 2.0 experimental work (even nano subdivision / higher
detail scale, parametric materials, fence/wall/water families, seamless-ish
ground language, composite assemblies) was largely **ported into `src/`**
(Slices A–E, material parity D, starter homestead, rare castle landmarks).
What is missing is **generation composition**: live worlds still salt random
dirt/sand, under-stamp materials, and rarely call modular scene recipes —
so the game *looks* pre-Iso2 even though the draw library exists.

**Playability Milestone 1 — complete (2026-07-15).** Core loop
(move → interact → quiz fail/retry → unlock → denser non-origin gates →
progress save) is trustworthy enough to unlock this phase. Checklist + E2E
proof: `/memories/repo/playability-milestone-1.md` and
`tests/gameplay/playability-m1-core-loop.spec.ts`.

**Standing order:** visual re-attachment is the active major campaign.
V1 + V2 landed 2026-07-15; **V3 water & terrain polish is next**.

**Authoritative inventory + checklist:**
`/memories/repo/iso2-visual-technology-inventory-and-deferred-plan.md`

Attach in this order (detail in that file):

1. **V1 — Gen composition** — ✅ coherent biome surfaces, surface cohere,
   orphan fence/wall cleanup.
2. **V2 — Assembly catalog** — ✅ modular recipes (farm, pond, church+graveyard,
   gatehouse, bridge) via `maybePlaceModularScenes` + catalog.ts.
3. **V3 — Water & terrain polish** — river/pond shapes, WU diamond leaks,
   roofs-as-assembly-only. **Next active track.**
4. **V4 — Scale/math audit** — only if 144px / even-division contracts still
   fail end-to-end after V1–V3.

**Do not** treat this section as permission to drop playability work for a
big-bang visual rewrite. Proof bar remains Slice methodology + live/screenshot
evidence, not “import exists therefore done.”

## 5. Keeping this document set alive

Update `12` (and, if it materially changes, the relevant numbered doc) in
the same session as any change that closes a gap, confirms a finding was
already stale, or discovers a new one — the same discipline
`archive-2026-07-14/VisionAlignmentAudit.md` established and that this
rewrite continues. `00-INDEX.md`'s status table should stay accurate as
the source of truth for "is this document set itself finished."
