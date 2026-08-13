> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# 07 — Education and Knowledge System

**Status:** Historical (was labeled canonical). Adapts `archived-planning/Grokipedia_Book_of_Knowledge.md`
and `archived-planning/Knowledge_Capture_Automation.md`.

---

## 1. Why this system exists

Education is not a mode bolted onto Emily's Game — it's the specific
mechanism behind Pillar 2 (`01` §4): "movement is restricted only by
things the player can overcome by playing," and the primary way that
promise is redeemed is *answering a question correctly*. This document
describes the two halves of that: the **quiz** mechanic (the obstacle
side) and the **Book of Knowledge** (the "how do I learn what I need"
side), plus the content pipeline that supplies both.

## 2. Quizzes

- **Format**: short, multiple-choice (typically 3–4 options plus an
  explicit "I don't know" option), covering math, science, history,
  language, geography, technology, and logic/riddles.
- **Verification is always deterministic code**, never the LLM — a math
  question's answer is checked with real evaluation logic, not asked of a
  language model. This is non-negotiable: the LLM's only allowed role
  anywhere near a quiz is cosmetic rephrasing of an already-correct,
  already-verified question (`06` §5).
- **Difficulty scales with distance** from the player's start (per `04`
  §1/§6) and is **modulated by streak**: answering correctly raises the
  ceiling for what comes next; a run of wrong answers softens it, never
  hardens it (`01` Pillar 5).
- **"I don't know" is a real, first-class outcome**, not a failure state —
  it should route the player toward the Book of Knowledge rather than
  just re-asking the same question, and the game should say so explicitly
  (a gate that's still locked after "I don't know" must clearly
  communicate "still locked, go learn" rather than silently doing
  nothing).
- **Wrong answers never cost progress.** A quiz gate (`03` §4, `04` §6) is
  always retriable, without limit — this is what makes quiz gates the
  *preferred* obstacle type in generation: they can never produce a
  softlock (`01` Pillar 1).
- **A subject-selection step at new-game start** lets the player bias which
  subjects they see more of (with a sensible default mix if skipped, and a
  guaranteed minimum of variety so one subject never fully crowds out the
  rest).

## 3. The Book of Knowledge

An in-game, always-accessible reference — short (roughly 200–500 word),
age-appropriate articles per subject, searchable, with:

- **Word bag** — unfamiliar terms encountered in quizzes or NPC chat can be
  saved for later lookup; using a saved word correctly later gives a small
  bonus. This turns "I don't know this word" into a concrete, trackable
  action rather than a dead end.
- **Read tracking** — articles mark as read, feeding lightweight
  achievement/progress feedback.
- **Subject-based routing** — when a player picks "I don't know," the game
  should route them to the Book article for that quiz's *actual subject*
  first (a technology question should open the technology article, not
  fall back to a generic text search that might miss it entirely because
  the article's title/body never happens to contain the literal word
  "technology").

## 4. Pillar 6, made mechanically checkable: "the world is learnable"

This is the one design pillar (`01` §4) that can be verified by a simple,
automatable rule rather than judgment: **every quiz question in the
library must have a corresponding Book of Knowledge article covering its
subject, and every stated answer must be factually correct.** This is a
data-integrity property of the content library, independent of any code
path — a content pack that adds new quiz questions without matching Book
coverage has broken this pillar even if every other system works
perfectly. See `12` for how this is currently checked.

## 5. Content pipeline (offline, not live in-game)

Quiz and Book content is produced **offline**, not fetched live during
play — the shipped game bundles static content packs, keeping sessions
fully functional without a network connection beyond the local LLM.

The pipeline's job (originally specified as a Python content-generation
script, see the archived source doc for full detail):

1. **Fetch** raw material from free, kid-appropriate sources (Simple
   English Wikipedia, Khan-style datasets, NASA facts, CK-12, and similar).
2. **Rephrase/simplify** for the target age band using an LLM pass — this
   is a completely different LLM usage than `06`'s in-game entropy role:
   here the LLM is producing *reviewed, shipped content*, not live
   unpredictable flavor text, and its output is expected to be checked
   before it ships.
3. **Organize** into per-subject packs (quizzes + articles), tagged for
   search and word-bag linking.
4. **Validate** for age-appropriateness and (per §4) quiz-to-article
   coverage before the pack is considered complete.
5. **Ship** as bundled static content, versioned, periodically refreshable
   via a repeatable pipeline (not a one-time manual drop) — see `12`/`13`
   for exactly how much of this automation exists today versus how much of
   the current content was a manual one-time content drop.

## 6. Where to go next

- `04-World-Generation-Design.md` §6 — how quiz gates are placed and why
  they're preferred over key-item locks.
- `06-LLM-Entropy-and-Procedural-Seeding.md` §5 — the boundary between
  entropy-flavored rephrasing and verified quiz content.
- `12-Current-Reality-Gap-Analysis.md` — current quiz-bank size, content
  pipeline automation status, and the quiz↔Book coverage check.
