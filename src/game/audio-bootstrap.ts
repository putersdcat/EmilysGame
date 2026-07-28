// filepath: src/game/audio-bootstrap.ts
// B5 micro-slice 11.42 (#268): MIDI + sampled-SFX background loading
// extracted from main.ts main(). Both loaders run in the background
// after the menu flow resolves; the game loop starts immediately and
// uses oscillator fallbacks until the samples arrive.
//
// `initMidiTracks` resolves once MIDI files are parsed. When there are
// enough tracks and music is enabled + not muted + not in test mode,
// we auto-start playback.
//
// `initSampledSfxPipeline` rejects on sample manifest failure but
// we swallow it — oscillator SFX still works.
import type { GameState } from './game-state';
import {
  initMidiTracks, getTotalTrackCount,
  play as musicPlay,
} from './audio/music';
import { initSampledSfxPipeline } from './audio/sfx';
import { isTestMode } from '../engine/llm';

/** Threshold below which we don't bother logging the MIDI track count. */
const MIDI_VERBOSE_THRESHOLD = 4;

/**
 * Start the background audio loading. Returns immediately — both
 * pipelines run as fire-and-forget promises. The game loop can start
 * in parallel; oscillator fallbacks cover the gap until real samples
 * arrive.
 */
export function bootstrapAudio(state: GameState): void {
  // Load MIDI tracks in background (non-blocking, oscillator tracks work immediately)
  initMidiTracks(state.music).then(() => {
    if (getTotalTrackCount() > MIDI_VERBOSE_THRESHOLD) {
      console.log(`[Music] ${getTotalTrackCount()} MIDI tracks available`);
    }
    // Auto-start music after tracks are ready if music is enabled and not muted.
    // Skip in test mode — tests control music state explicitly.
    if (!isTestMode() && state.music.settings.enabled && !state.music.settings.muted) {
      musicPlay(state.music);
    }
  });

  // Load sampled SFX in background (oscillator SFX work immediately as fallback)
  initSampledSfxPipeline(state.sfx).catch(e => console.warn('[SFX] Sample init failed:', e));
}
