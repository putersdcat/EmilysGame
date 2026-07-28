# 08 — Characters, NPCs, and Wildlife

**Status:** Canonical. Adapts `archived-planning/Character_Sprite_System.md`
and the NPC/character sections of `archived-planning/NewGame_GameBible_
StartHere.md`.

---

## 1. The player character

The player's on-screen character is generated programmatically as SVG, not
loaded from external art files — this keeps customization cheap
(recombine parts, not re-author art) and keeps the whole character system
inspectable and hand-tunable like everything else in this codebase.

- **Poses**: idle and a multi-frame walk cycle, built from layered parts
  (head/hair, face, dress/outfit, arms, legs) so any one part can vary
  independently.
- **Customization** covers hair style/color, eye color *and* shape (an
  independent selector from color), outfit pattern, and several
  accessory slots (hat, backpack, scarf) that can be worn simultaneously
  because each occupies its own slot rather than competing for one "extra
  accessory" field.
- **Direction/facing** is handled by simple horizontal mirroring plus
  per-direction pose data, not per-direction hand-drawn art.
- **Customization is a flat, pre-presentation concept**: which colors,
  which parts, which accessories — this is core player state (`03` §5),
  same as the historical PoC's "customizable pre-projection" framing.
  How the resulting character reads in the isometric view (billboard-style
  Z-pinned rendering, draw-order relative to terrain) is entirely `05`'s
  concern.
- **Cosmetic unlocks** are earned through play — quiz-answer streaks,
  wildlife-discovery milestones, and coin-count thresholds each gate
  specific cosmetic items, tying customization back into the core loop
  (`01` §3) as a reward channel rather than a separate menu-only system.

## 2. NPCs

NPCs are lightweight: a position, a persona, and a small behavior state
(idle/wandering/fleeing where relevant).

- **Personas** bundle a greeting pool, a quiz-category bias, and — for
  merchants — a trade list. Personas are picked partly by *role* (a
  farmer, a ranger, a knight) and, for the generic wandering merchant role
  specifically, by **biome** — a meadow merchant's goods and flavor differ
  from a castle merchant's, matching the original design intent that
  merchant inventory should feel biome-appropriate rather than
  interchangeable.
- **Placement** follows population rules from `04` §8 — biome-appropriate
  pools, spacing so merchants don't cluster, clearance so an NPC never
  blocks the one path through a corridor.
- **Dialogue** is short (a couple of lines), drawn primarily from
  hand-authored persona flavor; an optional LLM-driven fallback exists for
  more open-ended chat, with a strict rule that its fallback response
  should still sound like *this specific NPC* (persona-appropriate),
  never one generic line reused for every NPC regardless of who's talking.
- **Interaction history** — which NPCs the player has already talked to —
  is part of the player's persistent state (`11`), not just an in-session
  convenience, so repeat-visit behavior (if any) survives save/load.

## 3. Wildlife

Small ambient animals (rabbits, birds, cats, and similar) exist primarily
for texture and a light "discovery" reward loop:

- **Behavior** is a simple state machine — wander, flee when approached,
  idle — driven by a per-species wander speed and flee radius; no
  pathfinding intelligence is required or intended.
- **Discovery** is tracked per species and persists across sessions;
  reaching discovery milestones unlocks cosmetics (§1), giving wildlife a
  genuine payoff beyond decoration rather than being a spawn/despawn
  simulation with no player-facing outcome.
- **Species-specific interaction lines** and an associated quiz category
  (if any) let an encounter double as a light, optional teaching moment,
  consistent with how the rest of the education system works (`07`).

## 4. Where character/NPC/wildlife concepts stop and rendering begins

Everything above is described without reference to how a sprite is drawn
in the isometric view. Sprite generation, layering/occlusion against
terrain, and animation-frame timing are presentation concerns (`05`);
this document's job is to define *what exists and what it means*, not how
it's painted on screen.

## 5. Where to go next

- `03-Core-Simulation-Model.md` §5 — the entity model these characters use.
- `05-Presentation-Layer-Isometric-Rendering.md` — how sprites are drawn
  and occluded correctly.
- `12-Current-Reality-Gap-Analysis.md` — current customization options,
  persona coverage, and wildlife discovery reward status.
