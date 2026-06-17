---
description: "Use when editing audio code — src/game/audio/*.ts. Covers WebAudio error handling, silent-failure patterns, and module size discipline."
applyTo: "src/game/audio/**"
---

# Audio System Rules

## Sub-Directory Inventory

```
src/game/audio/
  ├── music.ts         ← cassette player state + MIDI synthesis
  ├── sfx.ts           ← sound effects (synthesized + samples)
  ├── sampled-sfx.ts   ← sample-based SFX loading + playback
  ├── midi-loader.ts   ← MIDI file parsing utility
  └── npc-voice.ts     ← NPC text-to-speech
```

All under the soft 250-line target. If any file exceeds 250 lines, plan
extraction following the B-series pattern (see
`.github/instructions/architecture.instructions.md`).

## Error Handling

Audio code has ~20 `catch { /* ok */ }` silent-failure patterns. These exist
because WebAudio APIs throw in many edge cases (suspended context, missing
codec, autoplay policy).

### Rules
1. **Log at `console.debug` level** instead of silently swallowing — aids
   debugging without cluttering console.
2. **Never silently drop Promise rejections** — `.catch(() => {})` hides real
   bugs. At minimum: `.catch(e => console.debug('audio:', e.message))`.
3. **AudioContext resume** must be called from a user gesture handler — don't
   retry in a loop.

## State Pattern

Audio modules use factory-pattern state objects:
- `createMusicState()` in `music.ts`
- `createSfxState()` in `sfx.ts`
- `createVoiceState()` in `npc-voice.ts`

These are stored in `GameState.audio` (composed in `src/game/game-state.ts`).
This is the correct pattern — maintain it. See
`.github/instructions/state-management.instructions.md`.

## Module-Level Globals

`sfx.ts` has 8 module-level `let` vars (AudioContext, gain nodes, counters).
These should eventually move into factory state objects for consistency.

## Dependencies

Only 2 production deps: `midi-player-js` and `piano-mp3`. Keep the audio stack lean.

## Test Mode Integration

Audio modules should check `isTestMode()` (from `src/engine/llm/test-mode.ts`)
to skip TTS or music generation in test mode:

```ts
import { isTestMode } from '../../engine/llm/test-mode';

if (isTestMode()) return; // Skip in test/CI mode
```

See `.github/instructions/llm-integration.instructions.md` for test-mode rules.

## Pre-Commit Checks

```bash
# Typecheck
npx tsc --noEmit

# Audio tests
npx playwright test tests/audio/ --reporter=line

# Module size scan
python tools/refactor/find-large-functions.py src/game/audio/ --min-lines 70
```

## Cross-References

- `.github/instructions/architecture.instructions.md` — god-file prevention
- `.github/instructions/state-management.instructions.md` — factory pattern
- `.github/instructions/llm-integration.instructions.md` — test-mode bypass