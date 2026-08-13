> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# Play input softlock + locomotion ownership (2026-07-19)

## Symptoms
- Movement improved after dt substeps, then player **froze** and **keyboard stopped working**.

## Root causes (design, not one-off)

1. **`startQuiz` async activation race**  
   Callers set `paused = true` then `void startQuiz(...)`.  
   `startQuiz` only set `quiz.active = true` *after* `await rephraseQuizQuestion`.  
   If rephrase was slow/hung/busy-slot delayed: **paused with no quiz UI and no movement**.

2. **Orphan `paused` flag**  
   `paused` was a shared bit set by dialog/quiz/trade/pause-menu with many code paths.  
   No recovery if no modal still owned the pause.

3. **Frame-count illness lock**  
   Diarrhea lock used `frameCount + 1500`. At ~2 FPS that is ~12 minutes frozen.

4. **No mid-play unstick**  
   `spawnEscape` only on load. Embedded footprint / fence snags left player glued.

## Ownership fix (commit `9409059`)

| Concern | Owner |
|---------|--------|
| Locomotion substeps + stuck escape | `src/game/player-motor.ts` |
| Quiz must be interactive before any await | `startQuiz` in `quiz.ts` (sync activate) |
| Orphan pause recovery | `update()` modal gate in `main.ts` |
| Illness timers | real-time ms via `performance.now()` in `illness.ts` |

## Laws going forward
- Never set `paused=true` for a quiz/dialog unless the matching `active` flag is true **in the same synchronous turn**, or provide a recovery path.
- Prefer real-time durations over frame counts for any player-affecting lock.
- Collision softlocks need an escape valve; full-tile solids still block, but never permanently glue input.
