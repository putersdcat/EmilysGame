# 11 — Source-of-Truth Reconciliation Plan

**Date:** 2026-07-07  
**Purpose:** List stale or conflicting sources discovered during the deep audit and define how to reconcile them before or alongside a clean branch.

## Why this matters

The repo contains rich design knowledge, but several docs/issues are stale relative to current code. A clean rebuild needs a reliable source-of-truth hierarchy to avoid rebuilding old plans instead of current intent.

## Recommended source-of-truth hierarchy

1. Current GitHub issues with explicit acceptance criteria, after stale issue triage.
2. Current code/tests/content manifests for delivered behavior.
3. WorldEngine docs for target world architecture.
4. Iso2 docs/issues for visual and validation lessons.
5. Archived planning docs for product intent and historical context.
6. Stale README/status docs only after refresh.

## Reconciliation checklist

### Missing/stale root agent docs

| Item | Current state | Action |
|---|---|---|
| Root `AGENTS.md` | Referenced by README/ARCHITECTURE but missing | Either restore a root `AGENTS.md` or update references to `.github/copilot-instructions.md` + `.github/agents/*`. |
| #248 | Closed as AGENTS/conventions delivered | Add comment or follow-up noting current file location/status. |

### Architecture docs

| Item | Current state | Action |
|---|---|---|
| `ARCHITECTURE.md` | Some file sizes/status from earlier B phase are stale | Refresh current state section and line counts if continuing current branch. |
| `Docs/EngineDecompositionMap.md` | Historical inventory, useful but stale by current branch | Mark as historical or update with current top hotspot table. |
| `Docs/RefactoringPlan_11-06-26.md` | Valuable but pre-later-refactor | Add status note: which phases are done, stale, superseded. |
| `.github/copilot-instructions.md` | Key-file table has old root paths/line counts | Refresh to current `src/engine`, `src/rendering`, `src/ui` paths. |

### Open issues likely stale or partly delivered

| Issue | Observed conflict | Action |
|---:|---|---|
| #254 | `gen.ts` is now a facade | Verify acceptance and close/update. |
| #269 | `src/engine/iso2-solver.ts` currently small | Verify if decomposition scope moved elsewhere. |
| #270 | `src/ui/ui.ts` currently small | Verify acceptance; close/update if delivered. |
| #271 | `src/engine/llm.ts` currently tiny/barrel-like | Verify acceptance; close/update if delivered. |
| #273 | Body/status references older mapping | Update epic checklist to current truth. |
| #275 | Phase D partially/mostly implemented per #277 | Decide whether to close #275 or convert to remaining gaps only. |
| #277 | Current active stabilization handoff | Keep open until normal generated gameplay coherent. |

### Visual validation tooling

| Item | Current state | Action |
|---|---|---|
| #255 | Open; requires `npm run visual-test` | Implement or keep as explicit rebuild requirement. |
| `package.json` | No `visual-test` script | Add during visual-test implementation/spike. |
| Iso2 proof artifacts | Many screenshots/binaries | Define promotion policy for baseline vs scratch artifacts. |

### Content docs

| Item | Current state | Action |
|---|---|---|
| `public/content/README.md` | Claims 420 quizzes / 31 articles | Update to actual manifest count or generate counts automatically. |
| Manifest | Actual 381 quizzes / 30 articles | Treat as authoritative. |
| Content generation docs | Some source/API claims aspirational | Mark as planned pipeline vs shipped pack. |

### Rendering geometry contracts

| Item | Current state | Action |
|---|---|---|
| Older 32px/64×32 docs | Historical | Do not use for clean branch except as history. |
| #192 96px micro tile | Superseded for Iso2 | Treat as historical unless asset compatibility needed. |
| #246 144px / 256×128 | Latest main Iso2 geometry contract | Use as current visual reference if staying Canvas/Iso2. |
| Three.js path | Proposed, not accepted implementation | Validate with spike before changing canonical docs. |

### LLM docs

| Item | Current state | Action |
|---|---|---|
| Some docs require LLM/no static fallback | Conflicts with code fallback/test reality | Decide product policy. Recommendation: fallback-first gameplay. |
| Endpoint docs | Older docs mention different localhost ports | Update after current LLM config policy chosen. |

## Issue comments to add if continuing current branch

Recommended comments/updates:

1. #254 — summarize current `gen.ts` facade and world modules; close if acceptance met.
2. #269/#270/#271 — verify file sizes and moved modules; close or rewrite scope.
3. #275 — summarize Phase D shipped pieces and list only true remaining gaps.
4. #277 — link this assessment folder as clean-rebuild/context docs if useful.
5. #255 — confirm no `visual-test` script yet; keep as active validation backlog.

## Clean-branch-specific source policy

If the clean branch starts, create one root file:

```text
Docs/clean-rebuild-assessment/00-source-of-truth.md
```

It should state:

- which issue/milestone is active;
- which architecture decision is accepted;
- which docs are historical;
- which content manifest is authoritative;
- which validation scripts must pass;
- what current-alpha parity means.

## Do not do this

- Do not update every stale doc before the proof spike; that can become planning paralysis.
- Do not close issues without checking acceptance criteria.
- Do not treat closed issues as sufficient proof if #214 requires visual evidence.
- Do not use prose counts for content.
- Do not make the clean branch inherit old path names just to satisfy stale docs.

## Minimum reconciliation before implementation

Before writing significant clean-branch code, do at least:

1. Choose source-of-truth issue/milestone.
2. Decide Three.js spike acceptance.
3. Mark current assessment docs as the rebuild context bundle.
4. Decide whether root `AGENTS.md` will be restored or references updated.
5. Decide which current alpha features are parity vs defer.
