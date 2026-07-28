# 01 — Game Vision & Design Pillars

**Status:** Canonical · **Supersedes:** `archive-2026-07-14/README.md`,
the original `archived-planning/NewGame_GameBible_StartHere.md` (still the
primary historical source — read it for full original color; this document
is the current, living restatement).

---

## 1. What Emily's Game is

Emily's Game is a browser-based, procedurally generated adventure game,
presented in an isometric view, built for one specific child, with a local
LLM used as a source of creative unpredictability ("entropy") rather than
as a chatbot or narrator. It draws its gameplay shape from classic
Zelda-style top-down exploration: walk around, collect things, get blocked
by an obstacle, solve or answer your way past it, meet an NPC, reach a
reward, move to the next area.

It is built from scratch — no game engine, no heavy rendering library — in
TypeScript, bundled with Vite, rendered with HTML5 Canvas 2D. This is a
deliberate constraint, not a limitation to work around: it keeps the whole
system inspectable, keeps performance predictable on modest hardware, and
keeps every layer of the game (simulation, generation, rendering, UI)
something a developer — human or agentic — can hold in their head.

## 2. Who it's for

The game is built for a young child, played in short sessions, with an
explicit educational purpose baked into the core loop rather than bolted on
as a side quiz-mode. The player should never feel like the "game" stops so
a "quiz" can happen — answering questions, learning new words, and reading
short knowledge articles **are** how you make progress. See
`07-Education-and-Knowledge-System.md` for the full design of that system.

Practical consequences of this audience:

- **Session length is short by design**: 5–15 minutes should feel like a
  complete, satisfying unit of play (reach a reward, finish a "chapter" of
  the world), not an arbitrary stopping point in something longer.
- **Failure must never feel punishing.** Getting a quiz question wrong
  should cost a little momentum, never progress. There is no game over.
- **Text and interactions are simple.** Short dialogue, short questions,
  clear feedback (toasts, sounds, particle bursts) for every action.
- **The controls are simple and forgiving.** Arrow keys/WASD to move,
  one button to interact. No combo inputs, no precision-timing challenges.
- **Accessibility matters directly**, not as an afterthought — read-aloud
  support, touch controls, and forgiving hitboxes all serve the same
  audience need. See `10-UI-UX-and-Accessibility.md`.

## 3. The core loop

```
Explore  →  Collect  →  Hit an obstacle  →  Solve it (usually: answer a
question, sometimes: find a key/item)  →  Obstacle opens, reward given  →
Meet an NPC (chat, trade, or another small quiz)  →  Reach the "treasure"
of this area  →  Move into a new area (new seed-influenced content, harder)
```

This loop is the entire game. There is no separate "story mode," no
overworld map screen, no menu-driven quiz mode — the loop above **is** what
"playing Emily's Game" means, moment to moment. Every system described in
this document set exists to make one part of that loop work well:

- World generation (`04`) builds the areas the loop happens in, and is
  responsible for making sure the loop's "hit an obstacle → solve it"
  beat is *guaranteed to be solvable* and *paced* appropriately.
- The education system (`07`) is what "solve it" usually means.
- LLM entropy (`06`) is what makes each area feel different from the last
  without needing hand-authored levels.
- NPCs, characters, and wildlife (`08`) populate the "meet an NPC" beat and
  give the world texture between obstacles.
- The presentation layer (`05`) is how all of the above gets shown to the
  player as a coherent isometric world — it does not change what the loop
  *is*, only how it *looks*.

## 4. Design pillars (non-negotiable)

These are restated and made load-bearing from what the world-generation
design previously called "The Five Guarantees" (see
`archive-2026-07-14/WorldEngine-05-PopulationAndProgression.md` §7.1 for
the historical version) — they are promoted here to whole-game design
pillars because they are really about the player's *experience*, not just
about the world-generation solver's internal correctness.

### Pillar 1 — No softlocks, ever

If the player can get stuck — physically boxed in, or blocked by something
they have no way to ever satisfy — that is the single worst thing this
game can do to its player. Every gate, lock, and barrier must have a
guaranteed, reachable way past it, and quiz-gated obstacles must be
retriable without limit (a wrong answer costs nothing but a moment; it
never locks you out). See `04` §6 for how generation enforces this and
`12` for where this is verified today.

### Pillar 2 — Movement is restricted *only* by things the player can overcome by playing

The world can and should block the player's path — that tension is the
whole game. But every single thing that blocks a path must be something
the player can resolve *by engaging with the game* (answer a question,
find a key, pay a toll) — never by luck, never by a mechanic the player
hasn't been taught, and never by something that turns out, on inspection,
to not really be enforced at all (a "gate" that doesn't actually gate
anything is worse than no gate — it's a broken promise the player can't
even see). This is the pillar most directly connected to the "revelation"
that triggered this documentation rewrite: if the *simulation* doesn't
clearly and simply track "is this cell open, blocked, or conditionally
open," in a way fully decoupled from how it happens to be drawn, this
pillar becomes very hard to verify and easy to silently break. See `02`.

### Pillar 3 — No dead end is empty-handed

Every unrewarded path the player can wander down should still end in
*something* — a collectible, a scenic moment, an NPC, a piece of world
flavor. Exploration off the critical path should never feel like wasted
time.

### Pillar 4 — Every area is traversable

Whatever region-sized chunk of world the player is dropped into must have
at least one genuine route from its entrance to its notable
content/exit — generation must prove this, not hope for it.

### Pillar 5 — Progression is paced

Difficulty (obstacle density, quiz difficulty, lock/key complexity) should
correlate with how far the player has traveled from their starting point,
and should also respond to how the player is doing right now (a streak of
correct answers can raise the ceiling; a streak of wrong answers should
soften the next stretch, not harden it).

### Pillar 6 — The world is learnable

Every quiz question the game can ask has a real, correct answer, and a
short, readable article behind it in the Book of Knowledge that a curious
player (or a stuck one) can go read. Nothing is asked that can't be
learned. See `07`.

### Pillar 7 — Isometric is how it looks, not what it is *(new pillar, this rewrite)*

The game's world, rules, and state are a flat, top-down 2D model. The
isometric look is achieved entirely by how that model is drawn — it is a
presentation choice, fully reversible, and never something the rest of the
game's logic needs to reason about. This pillar exists because it was true
at the start of the project, drifted over time, and is being restored
here deliberately. See `02` for the full principle and its evidence, and
`03`/`05` for what it means concretely.

## 5. What this game deliberately is *not*

Being explicit about scope boundaries prevents scope creep and keeps every
future addition honest about whether it belongs:

- **Not multiplayer.** Single child, single session, single save.
- **Not narrative-driven.** There is no authored plot, no voiced story
  beats, no branching dialogue trees. NPC chat is short, flavorful, and
  functional (hints, trades, quizzes) — see `08`.
- **Not procedurally "smart."** The LLM is an entropy *source*, not a
  world-building intelligence — it never decides gameplay outcomes
  directly, and its raw output is never shown to the player as if it were
  authored content. See `06`.
- **Not realistic or gritty.** Injuries, hazards, and survival mechanics
  exist as light, forgiving, teachable systems (see `08`/`10`), never as a
  hardcore-survival layer.
- **Not built on an external engine.** No Phaser, no Unity/Godot/etc. This
  keeps the codebase legible end-to-end and keeps this whole document set
  meaningful — a heavier engine would hide exactly the kind of
  architectural decisions this document set exists to make explicit.

## 6. Where the rest of this document set fits

```
01 (this doc)          — the "why" and the experience the whole system serves
02                      — the core architectural principle everything else follows
03 + 04                 — the flat 2D simulation: what the world IS
05                      — the isometric presentation: how the world is SHOWN
06                      — how variety and unpredictability enter the simulation
07 + 08                 — the content that fills the loop (knowledge, people, animals)
09 + 10                 — how the player perceives and controls all of the above
11                      — how a session survives being closed and reopened
12 + 13                 — where the real code stands today, and how to move it forward
```
