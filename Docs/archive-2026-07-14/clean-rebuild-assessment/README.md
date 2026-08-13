> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# Emily's Game Clean Rebuild Assessment

**Date:** 2026-07-07  
**Repository:** `putersdcat/EmilysGame`  
**Branch analyzed:** `experiment/isometric-2.0`  
**Active PR context:** `feat(iso2): complete Phase D texture transitions` / PR #276  
**Assessment type:** Read-only architectural/product/codebase audit plus clean-branch rebuild proposal.

This folder captures the assessment requested on 2026-07-07: if we could create a clean branch and rebuild Emily's Game from the documented intent and lessons learned, what should change, why, and how much effort would it take to reach current parity and the full envisioned scope?

## Files

1. [`01-current-state-and-evolution.md`](01-current-state-and-evolution.md)  
   Evidence-based audit of the current repository, documentation, git evolution, delivered systems, technical debt, and implementation gaps.

2. [`02-clean-branch-rebuild-recommendation.md`](02-clean-branch-rebuild-recommendation.md)  
   Original first-pass recommendation. Superseded by the Three.js rejection record and should be read as historical context, not current direction.

3. [`03-effort-estimate-and-roadmap.md`](03-effort-estimate-and-roadmap.md)  
   Concrete delivery plan, phases, estimates, risks, and a two-week proof spike to validate the rebuild direction before committing to a full rewrite.

4. [`04-evidence-notes.md`](04-evidence-notes.md)  
   Snapshot of repo metrics, observed documentation drift, high-risk files, and validation caveats from the audit.

5. [`05-deep-intent-feature-map.md`](05-deep-intent-feature-map.md)  
   Second-pass preservation map of product pillars, intended systems, gameplay loops, world grammar, education, audio, UI, platform, and validation directives mined from overlooked docs.

6. [`06-github-issue-archaeology.md`](06-github-issue-archaeology.md)  
   Open/closed issue inventory grouped by subsystem, with issue-derived acceptance criteria and stale-status conflicts to reconcile before a clean rebuild.

7. [`07-code-reality-inventory.md`](07-code-reality-inventory.md)  
   What is actually implemented now, what is partial/inconsistent, and what should be reused versus redesigned.

8. [`08-architecture-decision-update.md`](08-architecture-decision-update.md)  
   Historical update from before the failed Three.js proof. Superseded by `17`.

9. [`09-clean-rebuild-requirements-matrix.md`](09-clean-rebuild-requirements-matrix.md)  
   Actionable requirements matrix mapping current parity, full documented vision, acceptance tests, and source-of-truth references by subsystem.

10. [`10-threejs-proof-spike-spec.md`](10-threejs-proof-spike-spec.md)  
   Historical spike spec. The spike failed; do not use as current implementation plan.

11. [`11-source-of-truth-reconciliation.md`](11-source-of-truth-reconciliation.md)  
   Concrete stale-doc/stale-issue reconciliation plan to execute before or alongside a clean branch.

12. [`12-data-schema-sketch.md`](12-data-schema-sketch.md)  
   Proposed clean-branch schemas for world hierarchy, nano occupancy, generated chunks, deltas, saves, content packs, and visual validation scenes.

13. [`13-final-synthesis-and-decision-brief.md`](13-final-synthesis-and-decision-brief.md)  
   Historical decision brief from before the failed proof. Superseded by `17`.

14. [`14-risk-register-and-open-questions.md`](14-risk-register-and-open-questions.md)  
   Risk register and open design questions with default recommendations and mitigation paths.

15. [`15-first-90-days-clean-branch-plan.md`](15-first-90-days-clean-branch-plan.md)  
   Historical first-90-days plan. Do not execute as written; update around Canvas/Iso2 hardening if work continues.

16. [`16-validation-and-acceptance-strategy.md`](16-validation-and-acceptance-strategy.md)  
   Validation strategy covering deterministic tests, visual scenes, performance artifacts, content QA, accessibility, and issue closure evidence.

17. [`17-threejs-rejection-record.md`](17-threejs-rejection-record.md)  
   Final outcome of the proof attempts: Three.js rejected as the recommended direction; preview code/dependencies removed.

18. [`18-canvas-iso2-hardening-plan.md`](18-canvas-iso2-hardening-plan.md)  
   Revised go-forward plan after rejecting Three.js: harden the existing Canvas/Iso2 main engine, fix generator composition, and build proper visual validation.

## Executive conclusion

The current repo is a valuable, working, agent-grown alpha with a broad set of gameplay, education, rendering, audio, content, and test systems. It should not be dismissed as disposable.

However, subsequent proof work invalidated the initial Three.js recommendation. The renderer problem is not separable from world semantics, authored structures, material pipelines, walkability, and scale. A generic Three.js scene created a different and equally disappointing mess.

The current recommended direction is now:

> **Do not pursue Three.js. Keep the existing Canvas/Iso2 main engine alive and harden it: fix generated-world composition, structure assembly output, visual tests, and material integration in the current renderer.**

## High-level estimates

| Target | Solo / AI-assisted | Focused 2-3 person team |
|---|---:|---:|
| Two-week technical proof spike | 2 weeks | 1-2 weeks |
| Current alpha parity | 12-16 weeks | 6-10 weeks |
| Full documented vision | 24-36 weeks | 12-18 weeks |
| Polished public-quality game | 9-12 months | 4-6 months |

These estimates assume disciplined scope control and reuse of existing content, tests, design docs, and validated visual/material work where practical.

## Second-pass status

A deeper pass was started on 2026-07-07 after this initial bundle was created. It added issue archaeology, a fuller intent map, and a code-reality inventory. The top-level recommendation still stands: prove a Three.js orthographic renderer in a bounded spike before committing to a full rewrite. The second pass added one important refinement: **the clean branch must preserve the current project's rich educational/gameplay/audio/UI scope, not just its renderer and world generator.**

The follow-on actionable docs (`09`-`12`) turn the assessment into implementation planning inputs: what has to be preserved, what the spike must prove, what stale sources need reconciliation, and what data contracts the new branch should start with.

The final pass (`13`-`16`) converts the research into an executable decision package: pursue a bounded Three.js proof spike first, keep the existing game alive, and only commit to a full clean branch if the spike proves simpler geometry, deterministic data boundaries, DOM quiz/save integration, and visual/performance viability.

## Final proof-spike result

Both the isolated and main-engine Three.js proof attempts failed to demonstrate a better path. The related preview code and dependencies were removed.

See [`17-threejs-rejection-record.md`](17-threejs-rejection-record.md) for the final decision and revised direction.

Current go-forward plan: [`18-canvas-iso2-hardening-plan.md`](18-canvas-iso2-hardening-plan.md).
