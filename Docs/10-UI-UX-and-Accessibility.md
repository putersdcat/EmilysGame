# 10 — UI, UX, and Accessibility

**Status:** Canonical. Adapts the UI/Menu sections of `archived-planning/
NewGame_GameBible_StartHere.md` and `archived-planning/NewGame_Isometric_PoC.md`.

---

## 1. A firm boundary: Canvas draws the world, DOM draws the UI

The isometric world (`05`) is drawn entirely on Canvas. Every menu, HUD
element, dialog box, and overlay is ordinary HTML/DOM, styled with CSS,
layered on top of the canvas. This is not a stylistic preference — it's
what keeps UI accessible (screen readers, browser zoom, text selection all
work normally), keeps UI code simple (no hand-rolled hit-testing or text
layout), and keeps the presentation layer (`05`) focused purely on the
isometric world it's actually responsible for.

## 2. Layout

- **HUD**: persistent, minimal — coins, key inventory count, streak/status
  indicators, time-of-day/weather hint.
- **Side panel**: inventory, active interaction (quiz/dialog/trade), and
  status/knowledge access live in a dedicated screen region rather than
  crowding the play area — the original design flagged wasted side space
  in a purely-centered viewport as a concrete gap to fix, and a docked
  side panel is the resolution.
- **Overlays**: full-screen modal treatment for the start menu, pause
  menu, character customizer, and the Book of Knowledge — each is a
  distinct, dismissible layer over the world, never something the player
  can accidentally lose track of being "in."

## 3. Input

- **Movement**: arrow keys / WASD. Movement direction is expressed in
  screen-relative terms (up/down/left/right as the player sees them) and
  translated into the flat simulation's grid axes by the presentation/
  input layer — see `05` §2 for the projection this mirrors. The player
  should never need to think in isometric-grid diagonals to move
  intuitively toward something they can see on screen.
- **Interact**: a single button (Space/equivalent) for talk, collect,
  open, solve — deliberately not a context-sensitive multi-button scheme.
  Interaction targeting should be forgiving: a player who is clearly
  standing next to an obstacle and presses the interact button should
  reliably trigger it, regardless of the exact sub-pixel position or
  facing angle their last movement input happened to produce.
- **Touch and gamepad** are first-class alternate input sources, not
  afterthought fallbacks — analog input from either source feeds the same
  movement model as digital keyboard input.
- **Accessibility extras**: numeric/letter shortcuts for quiz-choice
  selection, a repeat-question voice/read-aloud option, and forgiving
  hitboxes throughout — all serving the same young-audience need named in
  `01` §2.

## 4. Feedback discipline

Every player action gets fast, legible feedback through at least one of:
a toast/notification, a sound cue (`09`), a particle effect, or a direct
state change visible in the HUD. A young player should never be left
wondering whether their input registered.

## 5. Where to go next

- `05-Presentation-Layer-Isometric-Rendering.md` — the Canvas world this
  UI sits on top of.
- `12-Current-Reality-Gap-Analysis.md` — current HUD/menu/accessibility
  implementation status.
