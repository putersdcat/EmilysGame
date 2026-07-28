/**
 * options-overlay.ts — Settings overlay (volume sliders, touch controls,
 * fog of war, Tesla mode, replay tutorial).
 *
 * B5 micro-slice 11.17 (#268): extracted from main.ts. Pure DOM
 * manipulation — no module-level state. Takes the game state and
 * input manager as optional parameters (only used when the overlay
 * is invoked mid-game; null/undefined when invoked from the start
 * menu).
 *
 * Why this lives in `src/game/` (not `src/ui/`):
 *   - Despite being DOM, it's tightly coupled to game subsystems
 *     (input manager, fog of war, Tesla mode, tutorial) — the
 *     wiring is more game-logic than UI-component
 *   - Sister to src/game/main-menu.ts (start screen) and
 *     src/game/pause-menu.ts (pause overlay)
 *
 * Public API:
 *   - showOptionsOverlay(state, inputMgr?) — show the overlay with
 *     all settings wired to the live game state
 *
 * @see issue #124 — Touch controls
 * @see issue #126 — UA-based touch auto-show
 * @see issue #127 — Fog of War toggle
 * @see issue #138 — LLM config (Options-only)
 * @see issue #144 — Touch visibility mode (whisper/slide/visible)
 * @see issue #185 — Tesla Mode
 * @see issue #186 — Replay Tutorial
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { InputManager, type TouchControlMode } from './input';
import { isFogEnabled, setFogEnabled } from '../rendering/fog';
import { isTeslaMode, setTeslaMode, detectTeslaBrowser, shouldAutoShowTouchOverlay } from './platform';
import { resetTutorial, initTutorial } from './tutorial';
import { type GameState } from './game-state';
import { resetPlayMode } from './play-mode';

// ─── Public API ──────────────────────────────────────────────

/**
 * Show the options overlay with all settings wired up:
 *   - Volume sliders sync bidirectionally with sidebar (#74, #75, #76)
 *   - Touch controls toggle + visibility mode (#124, #126, #144)
 *   - Fog of War toggle (#127)
 *   - Gamepad status display
 *   - Tesla Mode toggle (#185)
 *   - Replay Tutorial button (#186)
 *   - LLM config panel (loaded by initLlmConfigPanel in ui.ts — #138)
 *
 * @param _state  Optional game state — used to unpause the game when
 *                the user closes the overlay or replays the tutorial.
 *                Pass null/undefined when called from the start menu.
 * @param inputMgr Optional input manager — used for touch controls and
 *                 gamepad status. Falls back to no-op if omitted.
 */
export function showOptionsOverlay(
  _state: GameState | null,
  inputMgr?: InputManager,
): void {
  const overlay = document.getElementById('optionsOverlay')!;
  overlay.style.display = 'flex';

  // Sync options sliders FROM sidebar current values
  const sidebarMusic = document.getElementById('musicVolume') as HTMLInputElement | null;
  const sidebarSfx = document.getElementById('sfxVolume') as HTMLInputElement | null;
  const sidebarAmbience = document.getElementById('ambienceVolume') as HTMLInputElement | null;
  const sidebarVoice = document.getElementById('voiceVolume') as HTMLInputElement | null;

  const optMusic = document.getElementById('optMusicVol') as HTMLInputElement;
  const optSfx = document.getElementById('optSfxVol') as HTMLInputElement;
  const optAmbience = document.getElementById('optAmbienceVol') as HTMLInputElement;
  const optVoice = document.getElementById('optVoiceVol') as HTMLInputElement;

  // Read current values from sidebar/popup controls
  if (sidebarMusic) optMusic.value = sidebarMusic.value;
  if (sidebarSfx) optSfx.value = sidebarSfx.value;
  if (sidebarAmbience) optAmbience.value = sidebarAmbience.value;
  if (sidebarVoice) optVoice.value = sidebarVoice.value;

  // Update display values
  const updateDisplay = () => {
    document.getElementById('optMusicVal')!.textContent = optMusic.value;
    document.getElementById('optSfxVal')!.textContent = optSfx.value;
    document.getElementById('optAmbienceVal')!.textContent = optAmbience.value;
    document.getElementById('optVoiceVal')!.textContent = optVoice.value;
  };
  updateDisplay();

  // Sync options → sidebar on input (live preview)
  const syncToSidebar = (optEl: HTMLInputElement, sidebarEl: HTMLInputElement | null) => {
    if (sidebarEl) {
      sidebarEl.value = optEl.value;
      sidebarEl.dispatchEvent(new Event('input'));
    }
    updateDisplay();
  };

  optMusic.oninput = () => syncToSidebar(optMusic, sidebarMusic);
  optSfx.oninput = () => syncToSidebar(optSfx, sidebarSfx);
  optAmbience.oninput = () => syncToSidebar(optAmbience, sidebarAmbience);
  optVoice.oninput = () => syncToSidebar(optVoice, sidebarVoice);

  // #138: LLM config is now Options-only (no sidebar sync needed)
  // LLM settings load/applied via initLlmConfigPanel() in ui.ts

  // Touch controls toggle (#124, #126 — UA-based auto-show)
  const optTouch = document.getElementById('optTouchControls') as HTMLSelectElement | null;

  // Touch visibility mode (#144 — 3-way: whisper/slide/visible)
  const TOUCH_VIS_KEY = 'emilys_game_touch_vis';
  const optTouchVis = document.getElementById('optTouchVisibility') as HTMLSelectElement | null;
  const sbTouchVis = document.getElementById('sbTouchVisMode') as HTMLSelectElement | null;
  const savedTouchVis = (localStorage.getItem(TOUCH_VIS_KEY) || 'whisper') as TouchControlMode;
  if (inputMgr) inputMgr.setTouchControlMode(savedTouchVis);
  const syncTouchVis = (mode: TouchControlMode) => {
    if (inputMgr) inputMgr.setTouchControlMode(mode);
    localStorage.setItem(TOUCH_VIS_KEY, mode);
    if (optTouchVis) optTouchVis.value = mode;
    if (sbTouchVis) sbTouchVis.value = mode;
  };
  if (optTouchVis) {
    optTouchVis.value = savedTouchVis;
    optTouchVis.onchange = () => syncTouchVis(optTouchVis.value as TouchControlMode);
  }
  if (sbTouchVis) {
    sbTouchVis.value = savedTouchVis;
    sbTouchVis.onchange = () => syncTouchVis(sbTouchVis.value as TouchControlMode);
  }

  // Fog of War toggle (#127)
  const FOG_PREF_KEY = 'emilys_game_fog_enabled';
  const optFog = document.getElementById('optFogOfWar') as HTMLSelectElement | null;
  if (optFog) {
    optFog.value = isFogEnabled() ? 'on' : 'off';
    optFog.onchange = () => {
      const enabled = optFog.value === 'on';
      setFogEnabled(enabled);
      localStorage.setItem(FOG_PREF_KEY, enabled ? '1' : '0');
    };
  }
  const optGamepadStatus = document.getElementById('optGamepadStatus');
  if (optTouch && inputMgr) {
    // (#126) Determine current state: 'auto' means UA-matched, 'on' means forced, 'off' means disabled
    if (inputMgr.touchEnabled) {
      optTouch.value = shouldAutoShowTouchOverlay() ? 'auto' : 'on';
    } else {
      optTouch.value = 'off';
    }
    optTouch.onchange = () => {
      if (!inputMgr) return;
      if (optTouch.value === 'on') {
        inputMgr.enableTouchControls();
      } else if (optTouch.value === 'off') {
        inputMgr.disableTouchControls();
      } else {
        // Auto: only enable if UA matches (#126)
        if (shouldAutoShowTouchOverlay()) {
          inputMgr.enableTouchControls();
        } else {
          inputMgr.disableTouchControls();
        }
      }
    };
  }
  if (optGamepadStatus && inputMgr) {
    optGamepadStatus.textContent = inputMgr.gamepadConnected ? '✅ Connected' : '❌ Not connected';
    optGamepadStatus.style.color = inputMgr.gamepadConnected ? '#88ff88' : '#888';
  }

  // Tesla Mode (#185)
  const optTesla = document.getElementById('optTeslaMode') as HTMLSelectElement | null;
  const teslaBadge = document.getElementById('teslaBadge');
  const applyTeslaMode = (active: boolean) => {
    // Show/hide Tesla "T" badge
    if (teslaBadge) {
      teslaBadge.classList.toggle('active', active);
    }
    // Auto-enable/disable touch controls when Tesla mode changes
    if (inputMgr) {
      if (active && !inputMgr.touchEnabled) {
        inputMgr.enableTouchControls();
        if (optTouch) optTouch.value = 'on';
      }
    }
  };
  if (optTesla) {
    // Determine initial state
    const teslaActive = isTeslaMode();
    const teslaAutoDetected = detectTeslaBrowser();
    if (teslaActive) {
      optTesla.value = 'on';
    } else if (teslaAutoDetected) {
      optTesla.value = 'auto';
    } else {
      optTesla.value = 'off';
    }
    applyTeslaMode(teslaActive);

    optTesla.onchange = () => {
      if (optTesla.value === 'on') {
        setTeslaMode(true);
        applyTeslaMode(true);
      } else if (optTesla.value === 'off') {
        setTeslaMode(false);
        applyTeslaMode(false);
      } else {
        // Auto: enable only if auto-detected
        const auto = detectTeslaBrowser();
        setTeslaMode(auto);
        applyTeslaMode(auto);
      }
    };
  } else {
    // No settings element — still apply if Tesla mode active (e.g. ?tesla=1)
    if (isTeslaMode()) {
      applyTeslaMode(true);
    }
  }

  // Close button
  document.getElementById('optionsClose')!.onclick = () => {
    overlay.style.display = 'none';
  };

  // Replay Tutorial (#186)
  document.getElementById('optReplayTutorial')?.addEventListener('click', () => {
    resetTutorial();
    initTutorial();
    overlay.style.display = 'none';
    if (_state) {
      // PlayMode: drop freeze after tutorial replay (PR5)
      resetPlayMode(_state);
    }
  });
}