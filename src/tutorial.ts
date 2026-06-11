/**
 * tutorial.ts - Interactive onboarding tutorial (#186)
 * State machine that guides new players through movement, collection,
 * interaction, and flashlight controls as an overlay on the real game.
 * TODO: DOC - tutorial flow diagram, step descriptions
 */

import { isTestMode } from './engine/llm';

// ─── Constants ───────────────────────────────────────────────

const TUTORIAL_PREF_KEY = 'emilys_game_tutorial_done';
const TUTORIAL_DISABLED_KEY = 'emilys_game_tutorial_disabled';
const MOVE_THRESHOLD = 3; // tiles of total distance
const COLLECT_THRESHOLD = 3; // items to collect

// ─── Types ───────────────────────────────────────────────────

export enum TutorialStep {
  MOVE = 0,
  COLLECT = 1,
  ACTION = 2,
  FLASHLIGHT = 3,
  COMPLETE = 4,
  HIDDEN = 5,
}

interface TutorialState {
  step: TutorialStep;
  active: boolean;
  moveDistance: number;
  itemsCollected: number;
  interacted: boolean;
  flashlightToggled: boolean;
  initialFlashlightState: boolean;
  // Track last position for distance calc
  lastX: number;
  lastY: number;
  // Track initial inventory count for collection delta
  initialInventoryCount: number;
}

// ─── Step metadata (no allocations in tick) ──────────────────

const STEP_ICONS = ['🏃', '💎', '💬', '🔦', '🎉'];
const STEP_TEXTS = [
  'Use Arrow keys or WASD to move around!',
  'Walk over shiny items to pick them up! (0/3)',
  'Press Space near an NPC or object to interact!',
  'Press F to toggle your flashlight!',
  "You're ready to explore!",
];
const STEP_HINTS = [
  '<span class="tutorial-key">↑↓←→</span> or <span class="tutorial-key">WASD</span>',
  'Walk into items to auto-collect',
  '<span class="tutorial-key">Space</span> or tap <span class="tutorial-key">Action</span>',
  '<span class="tutorial-key">F</span> or tap <span class="tutorial-key">🔦</span>',
  '',
];

// ─── Module state (singleton) ────────────────────────────────

let tut: TutorialState = {
  step: TutorialStep.HIDDEN,
  active: false,
  moveDistance: 0,
  itemsCollected: 0,
  interacted: false,
  flashlightToggled: false,
  initialFlashlightState: false,
  lastX: 0,
  lastY: 0,
  initialInventoryCount: 0,
};

// Cached DOM refs (populated once in initTutorial)
let elOverlay: HTMLElement | null = null;
let elIcon: HTMLElement | null = null;
let elText: HTMLElement | null = null;
let elHint: HTMLElement | null = null;
let elProgress: HTMLElement | null = null;
let elSkip: HTMLElement | null = null;
let elComplete: HTMLElement | null = null;
let elContent: HTMLElement | null = null;

// ─── Public API ──────────────────────────────────────────────

/** Check URL params + localStorage to decide if tutorial should show */
export function shouldShowTutorial(): boolean {
  // URL override: ?tutorial=1 forces it (for tests), ?tutorial=0 forces off
  const params = new URLSearchParams(window.location.search);
  const urlParam = params.get('tutorial');
  if (urlParam === '0') return false;
  if (urlParam === '1') return true;

  // Test mode defaults to off (unless ?tutorial=1 above)
  if (isTestMode()) return false;

  // Respect user preferences
  if (localStorage.getItem(TUTORIAL_DISABLED_KEY) === '1') return false;
  if (localStorage.getItem(TUTORIAL_PREF_KEY) === '1') return false;

  return true;
}

/** Initialize and show the tutorial overlay */
export function initTutorial(): void {
  // Cache DOM refs
  elOverlay = document.getElementById('tutorialOverlay');
  elIcon = document.getElementById('tutorialIcon');
  elText = document.getElementById('tutorialText');
  elHint = document.getElementById('tutorialHint');
  elProgress = document.getElementById('tutorialProgress');
  elSkip = document.getElementById('tutorialSkip');
  elComplete = document.getElementById('tutorialComplete');
  elContent = elOverlay?.querySelector('.tutorial-content') as HTMLElement | null;

  if (!elOverlay) return;

  // Reset state
  tut.step = TutorialStep.MOVE;
  tut.active = true;
  tut.moveDistance = 0;
  tut.itemsCollected = 0;
  tut.interacted = false;
  tut.flashlightToggled = false;
  tut.initialFlashlightState = false;
  tut.lastX = 0;
  tut.lastY = 0;
  tut.initialInventoryCount = -1; // Will be set on first tick

  // Show overlay
  elOverlay.style.display = '';
  if (elComplete) elComplete.style.display = 'none';
  if (elContent) elContent.style.display = 'flex';

  // Wire buttons
  if (elSkip) {
    elSkip.onclick = () => dismissTutorial();
  }

  const startBtn = document.getElementById('tutorialStartGame');
  const repeatBtn = document.getElementById('tutorialRepeat');
  const dontShowCheck = document.getElementById('tutorialDontShow') as HTMLInputElement | null;

  if (startBtn) {
    startBtn.onclick = () => {
      if (dontShowCheck?.checked) {
        localStorage.setItem(TUTORIAL_DISABLED_KEY, '1');
      }
      localStorage.setItem(TUTORIAL_PREF_KEY, '1');
      dismissTutorial();
    };
  }
  if (repeatBtn) {
    repeatBtn.onclick = () => {
      resetTutorial();
      initTutorial();
    };
  }

  // Render initial step
  _renderStep();
}

/** Is the tutorial currently running? */
export function isTutorialActive(): boolean {
  return tut.active;
}

/**
 * Called every frame from the game loop.
 * Checks conditions and advances steps. No allocations.
 */
export function tickTutorial(
  playerX: number,
  playerY: number,
  inventoryCount: number,
  flashlightOn: boolean,
  interactPressed: boolean,
): void {
  if (!tut.active) return;

  // Initialize tracking on first tick
  if (tut.initialInventoryCount < 0) {
    tut.lastX = playerX;
    tut.lastY = playerY;
    tut.initialInventoryCount = inventoryCount;
    tut.initialFlashlightState = flashlightOn;
  }

  switch (tut.step) {
    case TutorialStep.MOVE: {
      // Accumulate Manhattan distance
      const dx = Math.abs(playerX - tut.lastX);
      const dy = Math.abs(playerY - tut.lastY);
      if (dx > 0 || dy > 0) {
        tut.moveDistance += dx + dy;
        tut.lastX = playerX;
        tut.lastY = playerY;
      }
      if (tut.moveDistance >= MOVE_THRESHOLD) {
        _advanceStep();
      }
      break;
    }
    case TutorialStep.COLLECT: {
      const delta = inventoryCount - tut.initialInventoryCount;
      if (delta !== tut.itemsCollected) {
        tut.itemsCollected = delta;
        // Update collect counter text (no allocation — reuse STEP_TEXTS index)
        if (elText) {
          elText.textContent = `Walk over shiny items to pick them up! (${Math.min(delta, COLLECT_THRESHOLD)}/${COLLECT_THRESHOLD})`;
        }
      }
      if (delta >= COLLECT_THRESHOLD) {
        _advanceStep();
      }
      break;
    }
    case TutorialStep.ACTION: {
      if (interactPressed) {
        tut.interacted = true;
        _advanceStep();
        // Capture flashlight baseline when entering FLASHLIGHT step,
        // so any toggles done BEFORE this step don't count as "the toggle"
        tut.initialFlashlightState = flashlightOn;
      }
      break;
    }
    case TutorialStep.FLASHLIGHT: {
      if (flashlightOn !== tut.initialFlashlightState) {
        tut.flashlightToggled = true;
        _advanceStep();
      }
      break;
    }
    // COMPLETE and HIDDEN: no tick logic
  }
}

/** Reset tutorial state (for replay) */
export function resetTutorial(): void {
  tut.step = TutorialStep.HIDDEN;
  tut.active = false;
  tut.moveDistance = 0;
  tut.itemsCollected = 0;
  tut.interacted = false;
  tut.flashlightToggled = false;
  tut.initialFlashlightState = false;
  tut.lastX = 0;
  tut.lastY = 0;
  tut.initialInventoryCount = -1;

  if (elOverlay) elOverlay.style.display = 'none';
  // Clear "done" pref so it can show again
  localStorage.removeItem(TUTORIAL_PREF_KEY);
}

/** Dismiss tutorial completely */
export function dismissTutorial(): void {
  tut.active = false;
  tut.step = TutorialStep.HIDDEN;
  if (elOverlay) elOverlay.style.display = 'none';
}

// ─── Internal helpers ────────────────────────────────────────

function _advanceStep(): void {
  if (tut.step < TutorialStep.COMPLETE) {
    tut.step++;
    _renderStep();
  }
}

function _renderStep(): void {
  if (!elOverlay) return;

  if (tut.step === TutorialStep.COMPLETE) {
    // Hide step bar, show completion panel
    if (elContent) elContent.style.display = 'none';
    if (elComplete) elComplete.style.display = '';
    return;
  }

  // Show step bar, hide completion
  if (elContent) elContent.style.display = 'flex';
  if (elComplete) elComplete.style.display = 'none';

  const idx = tut.step as number;
  if (elIcon) elIcon.textContent = STEP_ICONS[idx] ?? '🎯';
  if (elText) elText.textContent = STEP_TEXTS[idx] ?? '';
  if (elHint) elHint.innerHTML = STEP_HINTS[idx] ?? '';

  // Update progress dots
  if (elProgress) {
    const dots = elProgress.children;
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i] as HTMLElement;
      dot.className = 'tutorial-dot';
      if (i === idx) dot.classList.add('active');
      else if (i < idx) dot.classList.add('done');
    }
  }
}
