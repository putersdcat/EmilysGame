# Code organization philosophy (user directive, 2026-07-09 — overrides stale instruction-file line-count ceilings)

**User's exact framing (verbatim intent, paraphrased minimally):** decomposition
work "does not really move the needle in terms of delivering the game and is
token heavy busy work." Defined maximum line numbers "are not really relevant."
The real criterion: **is the file contained and scoped to a single logical
area of code?** If yes, a large file is FINE — "we do not need to go crazy and
break it down into smaller chunks." Split only when:
  (a) the file has actually become a catchall bucket mixing UNRELATED
      concerns (a true god-file), or
  (b) there's a natural, logical seam where something inside clearly
      deserves its own file (reusability/testability/clarity reason, not a
      line-count reason).

## What this means in practice

- **IGNORE the hard line-count ceilings** stated in `.github/instructions/
  src-main.instructions.md` (2,800), `rendering.instructions.md` (800 for
  render.ts), `src-gen.instructions.md` (150 for gen.ts), and
  `architecture.instructions.md` generally. These are NOT authoritative
  triggers for action per explicit user override — do not propose splitting
  a file just because it crossed one of these numbers.
- Several of the repo's own planning docs are ALSO stale on raw line counts
  (see `next-batch-plan.md`'s survey — main.ts is actually 997 lines, not the
  documented 2,807/3,317; render.ts is 825, over its own documented 800
  ceiling, and that's fine per this directive). Don't trust cached numbers in
  ANY doc without re-measuring if a decision hinges on it.
- Before proposing ANY split of an existing file, ask: "does this file mix
  genuinely unrelated concerns, or is it one big cohesive subsystem that
  happens to be long?" `nano-tile.ts` (1109 lines, all nano-tile drawing),
  `render.ts` (825 lines, the IsometricRenderer orchestrator — already had
  unrelated concerns extracted in the B6 series: projection math, shadow
  cache, mouth animation, debug grid all moved out already), `terrain-cache.ts`
  (777, chunk terrain compositing), `wildlife.ts`/`input.ts`/`knowledge.ts`/
  `trading.ts`/`debug-api.ts` (each a single named subsystem) are all
  EXAMPLES OF COHESIVE FILES that should NOT be split just for size per this
  directive — they were incorrectly flagged as "god-file watch list" items
  in stale instruction docs based purely on line count.
- Instead, when a large file needs attention, the productive question is:
  "does this file have a REAL FUNCTIONAL BUG or missing-wiring gap inside
  it?" — i.e. apply the Slice A-E audit methodology (deep read, form a
  hypothesis, verify against real generation/config data, fix with a narrow
  safe change, prove with a live-engine test) to hunt for actual solidity
  gaps, NOT to reorganize files. This is what "moves the needle."
- If a genuine extraction opportunity is found DURING a bug-fix (a natural
  seam falls out of the fix itself), that's fine and expected — extraction
  as a side-effect of real work, not as the goal in itself.

## Standing rule for future sessions

Do not re-propose the render.ts/nano-tile.ts/terrain-cache.ts/`src/game/*`
decomposition batch that was drafted in `next-batch-plan.md`'s first version
— it was explicitly rejected by the user on this exact philosophical basis.
If asked to "solidify" or "improve" a large-but-cohesive file, default to a
functional audit, not a refactor, unless the user explicitly asks for a split.
