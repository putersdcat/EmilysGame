/**
 * dom-wiring.ts — DOM event wiring for HUD buttons + keyboard shortcuts (#268, B5.6).
 *
 * B5 micro-slice 11.6 (#268): extracted from main.ts. The DOM wiring
 * module registers all event listeners for the in-game HUD: book button,
 * customizer button, music/sfx/voice controls, touch visibility selector,
 * and the keyboard shortcuts (C for customizer, M for music toggle).
 *
 * Called once from `main()` after state init + asset preloading.
 *
 * Public API:
 *   - wireHudEvents(deps) — register all HUD event listeners
 *
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { type GameState } from './game-state';
import { type InputManager, type TouchControlMode } from './input';
import { toggleBook, wireBookUI } from './knowledge';
import { addToast } from '../ui/ui';
import { showCustomizer } from '../ui/customizer';
import { clearVariationCache, loadCharacterSprite } from '../asset-pipeline/sprites';
import {
  togglePlayPause, nextTrack, prevTrack, toggleMute,
  setVolume as musicSetVolume,
} from './audio/music';
import {
  toggleSfxMute, toggleAmbienceMute, setSfxVolume, setAmbienceVolume,
} from './audio/sfx';
import { toggleVoice, setVoiceVolume, speakLine } from './audio/npc-voice';

// ─── Dependencies ────────────────────────────────────────────

/**
 * Dependencies needed to wire HUD events. Includes the game state and
 * the input manager (for touch control mode).
 */
export interface WireHudDeps {
  state: GameState;
  input: InputManager;
  /** Callback when book is closed (to unpause the game) */
  onBookClose: () => void;
}

// ─── Main Function ───────────────────────────────────────────

/**
 * Register all HUD event listeners. Called once from main() after
 * state init. The function is synchronous — it just attaches listeners
 * and returns. The actual handlers run in response to user events.
 */
export function wireHudEvents(deps: WireHudDeps): void {
  const { state, input, onBookClose } = deps;

  // ─── Book of Knowledge UI ───────────────────────────────
  // wireBookUI handles the in-book UI (article list, back button, etc.)
  wireBookUI(state.knowledge, onBookClose);

  // Quiz Repeat button (#94)
  document.getElementById('quizRepeat')?.addEventListener('click', () => {
    if (state.quiz.active && state.quiz.displayText) {
      speakLine(state.voice, state.quiz.displayText, null);
    }
  });

  // HUD book button
  document.getElementById('btnBook')?.addEventListener('click', () => {
    if (!state.quiz.active && !state.ui.dialog.active) {
      toggleBook(state.knowledge);
      state.paused = state.knowledge.bookOpen;
    }
  });

  // ─── Character Customizer ──────────────────────────────
  const openCustomizer = async () => {
    if (state.paused || state.quiz.active || state.ui.dialog.active) return;
    state.paused = true;
    const newVariation = await showCustomizer(state.playerVariation, true);
    if (!newVariation) {
      // Cancelled — resume game
      state.paused = false;
      return;
    }
    clearVariationCache('custom');
    state.playerVariation = newVariation;
    state._baseExpression = newVariation.expression ?? 'happy';
    state.expressionOverride = null;
    state.egoImg = loadCharacterSprite(newVariation, 0, false);
    state.lastAnimFrame = -1;
    state.paused = false;
    addToast(state.ui, '🎨 Character updated!', '#ce93d8', 2000);
  };
  document.getElementById('btnCustomize')?.addEventListener('click', openCustomizer);

  // 'C' key opens customizer
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey) {
      openCustomizer();
    }
  });

  // ─── Music Controls (#74) ──────────────────────────────
  document.getElementById('btnMusicPlayPause')?.addEventListener('click', () => {
    togglePlayPause(state.music);
  });
  document.getElementById('btnMusicNext')?.addEventListener('click', () => {
    nextTrack(state.music);
  });
  document.getElementById('btnMusicPrev')?.addEventListener('click', () => {
    prevTrack(state.music);
  });
  document.getElementById('btnMusicMute')?.addEventListener('click', () => {
    toggleMute(state.music);
  });
  document.getElementById('musicVolume')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    musicSetVolume(state.music, val / 100);
  });
  // 'M' key toggles play/pause
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
      togglePlayPause(state.music);
    }
  });

  // ─── SFX Controls (#75) ────────────────────────────────
  document.getElementById('btnSfxMute')?.addEventListener('click', () => {
    toggleSfxMute(state.sfx);
  });
  document.getElementById('btnAmbienceMute')?.addEventListener('click', () => {
    toggleAmbienceMute(state.sfx);
  });
  document.getElementById('sfxVolume')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    setSfxVolume(state.sfx, val / 100);
  });
  document.getElementById('ambienceVolume')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    setAmbienceVolume(state.sfx, val / 100);
  });

  // ─── Voice Controls (#76) ───────────────────────────────
  document.getElementById('btnVoiceToggle')?.addEventListener('click', () => {
    toggleVoice(state.voice);
  });
  document.getElementById('voiceVolume')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    setVoiceVolume(state.voice, val / 100);
  });

  // ─── Touch Visibility (#144) ────────────────────────────
  {
    const TOUCH_VIS_KEY_INIT = 'emilys_game_touch_vis';
    const savedMode = (localStorage.getItem(TOUCH_VIS_KEY_INIT) || 'whisper') as TouchControlMode;
    input.setTouchControlMode(savedMode);
    const sbVis = document.getElementById('sbTouchVisMode') as HTMLSelectElement | null;
    if (sbVis) {
      sbVis.value = savedMode;
      sbVis.onchange = () => {
        const m = sbVis.value as TouchControlMode;
        input.setTouchControlMode(m);
        localStorage.setItem(TOUCH_VIS_KEY_INIT, m);
        // Sync options dropdown if open
        const optVis = document.getElementById('optTouchVisibility') as HTMLSelectElement | null;
        if (optVis) optVis.value = m;
      };
    }
    const optVis = document.getElementById('optTouchVisibility') as HTMLSelectElement | null;
    if (optVis) {
      optVis.value = savedMode;
      optVis.onchange = () => {
        const m = optVis.value as TouchControlMode;
        input.setTouchControlMode(m);
        localStorage.setItem(TOUCH_VIS_KEY_INIT, m);
        // Sync sidebar dropdown if open
        if (sbVis) sbVis.value = m;
      };
    }
  }
}
