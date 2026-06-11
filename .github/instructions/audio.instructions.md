---
description: "Use when editing audio code — sfx.ts, music.ts, sampled-sfx.ts, midi-loader.ts, npc-voice.ts. Covers WebAudio error handling and silent-failure patterns."
applyTo: "src/game/audio/{sfx,music,sampled-sfx,midi-loader,npc-voice}.ts"
---
# Audio System Rules

## Error Handling
Audio code has ~20 `catch { /* ok */ }` silent-failure patterns. These exist because WebAudio APIs throw in many edge cases (suspended context, missing codec, autoplay policy).

### Rules
1. **Log at `console.debug` level** instead of silently swallowing — aids debugging without cluttering console.
2. **Never silently drop Promise rejections** — `.catch(() => {})` hides real bugs. At minimum: `.catch(e => console.debug('audio:', e.message))`.
3. **AudioContext resume** must be called from a user gesture handler — don't retry in a loop.

## State Pattern
Audio modules use factory-pattern state objects (`createMusicState()`, `createSfxState()`) stored in `GameState`. This is the correct pattern — maintain it.

## Module-Level Globals
`sfx.ts` has 8 module-level `let` vars (AudioContext, gain nodes, counters). These should eventually move into factory state objects for consistency.

## Dependencies
Only 2 production deps: `midi-player-js` and `piano-mp3`. Keep the audio stack lean.
