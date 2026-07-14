# 11 — Save, State, and Persistence

**Status:** Canonical. Adapts the save/load sections of `archived-planning/
NewGame_GameBible_StartHere.md` and the determinism principle from `03` §8.

---

## 1. What gets saved

A session's save data is the **player's accumulated progress**, not the
world itself:

- Player position, inventory, status/injury state, customization.
- Quiz streak history and cumulative played time.
- Which conditional cells have been resolved (gates unlocked, tolls paid)
  and which items have been collected — the *deltas* from a Region's
  deterministic base generation, not the Region's full data.
- Discovered wildlife species, visited-cell fog-of-war state, NPC
  interaction history.
- Book of Knowledge read/saved-word state, cosmetic unlocks earned.
- The current LLM entropy pool/wordlist buffer (`06`), so the world's
  "personality" continues rather than resetting.

## 2. What does *not* get saved — and why that's correct, not an oversight

Regions are **not** stored wholesale. A Region regenerates identically
from its seed plus whatever resolved deltas (§1) apply on top — this is
the determinism guarantee from `03` §8, and it's what keeps saves small
and keeps "same seed → same world" meaningfully true rather than
accidentally true. Ephemeral UI/interaction state (an open dialog, an
active quiz mid-question, an open trade panel) is also deliberately not
saved — resuming a session should never try to replay "you were halfway
through answering a question," it should simply put the player back in
the world at their last resolved position.

## 3. One save path, not two

A save can be resumed two ways in practice — reopening the browser
(auto-resume from local storage) and explicitly loading a save slot from a
menu. **Both paths must restore identically.** This sounds obvious but is
worth stating as a rule precisely because it has been a real, previously-
hidden bug class in this codebase: an auto-resume path that duplicates
(rather than shares) restore logic with the manual-slot-load path can
silently drift out of sync over time as new state is added to one path and
forgotten in the other. The correct shape is a single, shared
"apply saved data to a fresh state" function that every resume path calls
— never two independently-maintained restore implementations.

## 4. Determinism is load-bearing here too

Because Regions regenerate from seed rather than being stored, the
generation pipeline (`04`) must be exactly reproducible given the same
seed and the same resolved-delta overlay — a change to generation logic
that isn't seed-stable would mean an existing save's "already unlocked"
gate could regenerate in a different position or not exist at all on
reload. This is why generation determinism has its own dedicated
verification (a golden-hash test) rather than being assumed.

## 5. Where to go next

- `03-Core-Simulation-Model.md` §7-8 — the state shape and determinism
  guarantee this document assumes.
- `04-World-Generation-Design.md` — the generation pipeline that must stay
  seed-deterministic.
- `12-Current-Reality-Gap-Analysis.md` — current save-fidelity coverage
  and any known parity gaps between resume paths.
