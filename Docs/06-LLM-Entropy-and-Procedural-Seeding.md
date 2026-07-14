# 06 — LLM Entropy and Procedural Seeding

**Status:** Canonical. Adapts `archived-planning/NewGame_LlmEntropyAddendum.md`
(still the richest historical source — read it for full original detail;
this document restates the mechanic in light of `02`'s principle and notes
what's changed operationally since).

---

## 1. The idea: a local LLM as a "creative RNG," not a narrator

A small local language model (originally specified as BitNet b1.58 2B4T,
run via a local inference server) is used purely as a source of
unpredictable, thematically-flavored text — never as a dialogue writer,
never as a decision-maker for gameplay outcomes, and never shown to the
player as if it were authored narrative. Its output is deliberately
**nonsensical** ("obliterate quasar," "fabricate nebula") — coherent
sentences aren't the goal; high-variance raw material is.

This is the entropy source that feeds biome/mood selection in world
generation (`04` §3) and adds flavor to NPC dialogue (`08`) — but it is
never load-bearing for whether generation *succeeds*: every guarantee in
`04` §1 holds regardless of what the LLM produces, because entropy is
converted into ordinary seeds and weights through deterministic math, not
consumed as instructions.

## 2. The pipeline

```
Wordlist seed (session start)
        │  50 verb/noun pairs, one LLM call
        ▼
Player-action feedback loop
        │  movement direction, NPC chat keywords, quiz outcomes all
        │  append new material into the pool over the session
        ▼
Hashing / mathematical hacking
        │  SHA-256 → hex chunks → numeric seeds
        │  ASCII sums modulo N → categorical params (biome pick, density)
        ▼
Consumed by world generation (04) as: a seed for the region's Perlin base,
a bias vector for biome/mood weighting, density parameters for population
```

### 2.1 Wordlist initialization

At game start, one LLM call produces ~50 absurd verb/noun pairs. This is
the session's initial entropy pool. If the LLM is slow or unavailable, a
scrambled fallback list is used instead — the game must never block
waiting on this (see §4).

### 2.2 The feedback loop — the world "listens" to how you play

Player movement direction maps to a small lookup table of verb/noun
options (see the archived addendum for the original table); NPC chat
input and quiz outcomes also feed keywords back into the pool. This is
intentionally the one place player *agency* shapes entropy without any
explicit "this action means X" semantics — the world evolves based on how
someone plays, without the game ever interpreting that play narratively.

### 2.3 Mathematical hacking

Raw text is never interpreted for meaning. It is hashed (SHA-256) into hex,
chunked into numeric seeds (a Perlin noise seed, a density parameter), and
separately summed character-by-character (ASCII sums modulo N) for
categorical choices (which biome, which density bucket). Mixing both
methods avoids visible repetition patterns.

## 3. What entropy is *not* allowed to do

This boundary matters enough to state explicitly, and lines up directly
with `02`'s core/presentation split:

- Entropy never decides whether a generated Region is *valid* — that's
  `04`'s deterministic constraint-solving and validation, unaffected by
  what the LLM said.
- Entropy is scoped to **macro-level variety** — which biome a Region
  leans toward, what mood it has, roughly where a notable scene should
  appear — never to synthesizing the fine-grained placement of individual
  Cells or Blocks from raw entropy at the finest grain every time. Just as
  visual assets and structural templates are pre-authored and tuned (`05`
  §4-§5), *complex composite scenes* are assembled by the dedicated
  Composite Assembly pattern (`04` §7) from a small recipe (scene type,
  footprint, style parameters) that entropy merely helps select — never
  improvised cell-by-cell from raw hash bits.
- The LLM's raw output is never rendered to the player as if it were
  written content — dialogue the player actually reads is either
  hand-authored persona flavor or a short, explicitly LLM-*rephrased*
  version of a verified quiz question (see §5), never free-form LLM prose
  presented as truth.

## 4. Performance and reliability rules

- All LLM calls are asynchronous; the game never blocks a frame waiting on
  one.
- A hard fallback to deterministic TypeScript RNG kicks in if inference
  takes too long for the interactive budget it's being used for (a
  short NPC greeting rephrase has a much smaller time budget than a
  once-per-session wordlist call).
- A tokens-per-second rolling measurement of the actual local server
  informs that interactive-budget decision live, rather than a single
  hardcoded timeout — a slow machine degrades gracefully to the RNG
  fallback more readily than a fast one, instead of stalling gameplay.
- A single-slot request queue with fire-and-forget prefetching means
  latency-sensitive call sites (e.g. "the player just approached a quiz
  gate") can kick off their LLM rephrase *before* the moment it's actually
  needed (while an earlier dialog line is still being read), hiding
  latency rather than incurring it inline.
- If the LLM is unreachable at all, the game degrades to pure RNG for
  everything entropy touches — this must never be a hard failure state.

## 5. Quiz rephrasing — the one place LLM output reaches the player directly

The LLM is allowed to rephrase an already-verified quiz question into a
more flavorful, in-character wrapper (e.g., "As a wise owl, rhyme this
question...") — but it never generates the question or its correct answer,
and never verifies correctness. Verification is always deterministic
TypeScript code (`07` §2) applied to the original, unmodified question
data; the LLM's job is purely cosmetic framing, with an explicit
stop-sequence/cleanup contract to guarantee a malformed rephrase can never
reach the player as their actual quiz question.

## 6. Where to go next

- `04-World-Generation-Design.md` §3 — how the entropy pool becomes biome
  and mood selection.
- `07-Education-and-Knowledge-System.md` — the quiz verification contract
  referenced in §5.
- `08-Characters-NPCs-and-Wildlife.md` — how NPC dialogue uses this same
  entropy/fallback discipline.
