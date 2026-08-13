# #223 comments — non-spam filter

Total comments: 253. Kept as possibly substantive: 1. Classed as autonomous-loop spam: 252.

## keep 1 — 2026-05-22T07:16:52Z (1824 chars)
Completed a substantial #223 pass in `b7acd77` (`fix: gate bridge walkability — add locked gate proofs`).

What changed:
- Improved native Canvas gate rendering so `nano-gate-locked.png` clearly reads as a locked gate with posts, braced leaves, and a padlock.
- Changed `troll-bridge` to a flat, always-walkable river overlay, matching the issue goal that `bridge` and `troll-bridge` are traversal assets.
- Updated AiTools metadata so locked `gate` entries are blocking and `troll-bridge` is flat/walkable.
- Added built-in scene `fence-with-gate` for the yard/perimeter gate proof.
- Added focused Playwright/unit-style coverage in `tests/rendering/iso2-gate-bridge-walkability.spec.ts`:
  - locked gate blocks BFS from inside fence perimeter to the gate cell
  - unlocked gate opens the BFS path
  - troll-bridge overrides negative-Z river blocking as walkable

Proof PNGs committed:
- `experiment/isometric-2.0/ProgressEvaluations/nano-gate-locked.png`
- `experiment/isometric-2.0/ProgressEvaluations/nano-troll-bridge.png`
- `experiment/isometric-2.0/ProgressEvaluations/scene-fence-with-gate.png`

Validation run:
- `experiment/isometric-2.0` typecheck: passed
- root `npm run typecheck`: passed
- `npx playwright test tests/rendering/iso2-gate-bridge-walkability.spec.ts --reporter=line`: 2 passed
- `npx playwright test tests/rendering/iso2-nano-main-port.spec.ts tests/rendering/iso2-native-visual-scene.spec.ts tests/rendering/iso2-gate-bridge-walkability.spec.ts --reporter=line`: 5 passed
- AiTools bundle rebuilt successfully for MCP restart/recheck.

Caveat before closing: I did not mark the "live demo quiz UI unlock" checkbox complete in this pass; the deterministic solver/BFS behavior is now covered, but live UI interaction should be verified or split into a main-game quiz-integration issue if needed.

