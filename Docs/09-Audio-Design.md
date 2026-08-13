> **HISTORICAL as of 2026-08-13.** Memory of work past. Not living law.
> Current law: root `AGENTS.md`. Living design: `docs/intent/`.
> Scavenge ideas. Do not obey paint-only / no-greenfield / stay-on-branch /
> closed-campaign / FOV-lock / one-scoped-goal framing in this file.
# 09 — Audio Design

**Status:** Historical (was labeled canonical). Adapts `archive-2026-07-14/Audio_Asset_Sourcing_Brief.md`
and the audio sections of `archived-planning/NewGame_GameBible_StartHere.md`.

---

## 1. Tone

Warm, cozy, storybook-adventure — never harsh, never synth-alarm-like,
never jump-scare loud. This is a direct consequence of the audience
(`01` §2): audio feedback should feel encouraging and safe at all times,
including when something goes "wrong" (a wrong quiz answer's sound cue
should feel gentle, not punishing).

## 2. Music

Music is real, recorded/sampled instrumentation via MIDI files played
through SoundFont samples (piano, harpsichord, pipe organ, nylon guitar,
electric guitar voicings available), drawn from a real classical-music
library — not synthesized oscillator tones. Biome/context can bias which
track or voicing plays, giving each area a slightly different musical
character without needing bespoke composition per biome.

## 3. Sound effects

- **UI feedback**: short (well under half a second), soft-transient
  one-shots for menu navigation, dialog, and interaction confirmation.
  Multiple variants per event avoid repetitive-sounding feedback.
- **World feedback**: footsteps (varying by the surface a cell declares,
  `03` §2), collection chimes, quiz correct/incorrect cues, wall-bump
  cues — every player action that changes state should have an audible
  confirmation.
- **Positional/ambient audio**: looping ambience beds (wind, distant
  nature, weather) layered with localized emitters (a waterfall, a
  campfire) that fall off with distance from the player, using real
  panner-based positional audio rather than a single flat mix.

## 4. Source and format discipline

Real, recorded or sample-based assets are preferred over synthesized
placeholders wherever feasible (this was itself the subject of an explicit
prior quality pass, replacing early oscillator-based placeholders). Source
handoff favors uncompressed WAV, healthy headroom, and a consistent naming
convention (`amb_<domain>_<context>_<detail>_vNN`,
`sfx_<system>_<event>_<variant>_vNN`, `ui_<event>_<variant>_vNN`) so assets
stay organized as the library grows.

## 5. Where audio sits relative to `02`'s principle

Audio is purely a presentation-layer concern in the same sense rendering
is — it reacts to simulation events (a quiz resolved correctly, the player
entered a water cell, an NPC greeted the player) but never influences
simulation state. A sound cue is an *effect* of something the flat model
(`03`) already decided, never a cause.

## 6. Where to go next

- `12-Current-Reality-Gap-Analysis.md` — current music/SFX/positional-audio
  implementation status.
