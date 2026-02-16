/**
 * input.ts - Unified input handling: keyboard, touch, and gamepad.
 * Manages WASD/Arrow keys, virtual touch D-pad, and Gamepad API.
 * Supports edge detection (justPressed) for single-fire actions.
 * TODO: DOC - touch overlay layout, gamepad button mapping, input unification
 */

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  interact: boolean;
}

/** Which input device is currently dominant */
export type InputDevice = 'keyboard' | 'touch' | 'gamepad';

// Gamepad axis deadzone
const GP_DEADZONE = 0.3;

export class InputManager {
  private keyState: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    interact: false,
  };

  /** Previous frame's key state for edge detection */
  private prevState: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    interact: false,
  };

  /**
   * Queued presses: set on keydown, cleared only by endFrame().
   * Prevents fast keydown→keyup between frames from being missed.
   */
  private pressQueue: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    interact: false,
  };

  // ── Touch state ──
  private touchState: InputState = { up: false, down: false, left: false, right: false, interact: false };
  private touchOverlay: HTMLElement | null = null;
  private _touchEnabled = false;
  /** Active touch identifier for joystick tracking */
  private joystickTouchId: number | null = null;
  private joystickOriginX = 0;
  private joystickOriginY = 0;
  private joystickKnob: HTMLElement | null = null;

  // ── Gamepad state ──
  private gamepadState: InputState = { up: false, down: false, left: false, right: false, interact: false };
  private _gamepadConnected = false;
  /** Raw gamepad analog values for smooth movement */
  private gpAnalogX = 0;
  private gpAnalogY = 0;
  /** Raw touch analog values */
  private touchAnalogX = 0;
  private touchAnalogY = 0;

  /** Currently active input device */
  private _activeDevice: InputDevice = 'keyboard';

  constructor() {
    this.setupListeners();
    this.setupGamepad();
    // Auto-detect touch device and show overlay if appropriate
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      this.enableTouchControls();
    }
  }

  /** Current active input device */
  get activeDevice(): InputDevice { return this._activeDevice; }

  /** Whether touch controls are visible */
  get touchEnabled(): boolean { return this._touchEnabled; }

  /** Whether a gamepad is connected */
  get gamepadConnected(): boolean { return this._gamepadConnected; }

  // ═══════════════════════════════════════════════════════════════
  //  KEYBOARD
  // ═══════════════════════════════════════════════════════════════

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  private handleKeyDown(event: KeyboardEvent): void {
    this._activeDevice = 'keyboard';
    const key = event.key.toLowerCase();

    switch (key) {
      case 'w':
      case 'arrowup':
        this.keyState.up = true;
        this.pressQueue.up = true;
        event.preventDefault();
        break;
      case 's':
      case 'arrowdown':
        this.keyState.down = true;
        this.pressQueue.down = true;
        event.preventDefault();
        break;
      case 'a':
      case 'arrowleft':
        this.keyState.left = true;
        this.pressQueue.left = true;
        event.preventDefault();
        break;
      case 'd':
      case 'arrowright':
        this.keyState.right = true;
        this.pressQueue.right = true;
        event.preventDefault();
        break;
      case ' ':
        this.keyState.interact = true;
        this.pressQueue.interact = true;
        event.preventDefault();
        break;
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    switch (key) {
      case 'w':
      case 'arrowup':
        this.keyState.up = false;
        event.preventDefault();
        break;
      case 's':
      case 'arrowdown':
        this.keyState.down = false;
        event.preventDefault();
        break;
      case 'a':
      case 'arrowleft':
        this.keyState.left = false;
        event.preventDefault();
        break;
      case 'd':
      case 'arrowright':
        this.keyState.right = false;
        event.preventDefault();
        break;
      case ' ':
        this.keyState.interact = false;
        event.preventDefault();
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  TOUCH CONTROLS — Virtual joystick + action button
  // ═══════════════════════════════════════════════════════════════

  /** Create and show touch overlay with joystick + action button */
  enableTouchControls(): void {
    if (this._touchEnabled) return;
    this._touchEnabled = true;

    // Hide on keyboard activity auto (user can re-enable via options)
    const overlay = document.createElement('div');
    overlay.id = 'touchControlsOverlay';
    overlay.innerHTML = `
      <div class="touch-joystick-zone" id="touchJoystickZone">
        <div class="touch-joystick-ring">
          <div class="touch-joystick-knob" id="touchJoystickKnob"></div>
        </div>
      </div>
      <div class="touch-action-zone">
        <button class="touch-action-btn" id="touchActionBtn">✋</button>
        <button class="touch-menu-btn" id="touchMenuBtn">☰</button>
      </div>
    `;
    document.body.appendChild(overlay);
    this.touchOverlay = overlay;
    this.joystickKnob = document.getElementById('touchJoystickKnob');

    // Joystick zone
    const jzone = document.getElementById('touchJoystickZone')!;
    jzone.addEventListener('touchstart', (e) => this.onJoystickStart(e), { passive: false });
    jzone.addEventListener('touchmove', (e) => this.onJoystickMove(e), { passive: false });
    jzone.addEventListener('touchend', (e) => this.onJoystickEnd(e), { passive: false });
    jzone.addEventListener('touchcancel', (e) => this.onJoystickEnd(e), { passive: false });

    // Action button
    const actionBtn = document.getElementById('touchActionBtn')!;
    actionBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._activeDevice = 'touch';
      this.touchState.interact = true;
      this.pressQueue.interact = true;
      actionBtn.classList.add('active');
    }, { passive: false });
    actionBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.touchState.interact = false;
      actionBtn.classList.remove('active');
    }, { passive: false });

    // Menu button → trigger Escape
    const menuBtn = document.getElementById('touchMenuBtn')!;
    menuBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }, { passive: false });
  }

  /** Remove touch overlay */
  disableTouchControls(): void {
    if (!this._touchEnabled) return;
    this._touchEnabled = false;
    this.touchOverlay?.remove();
    this.touchOverlay = null;
    this.joystickKnob = null;
    this.resetInput(this.touchState);
    this.touchAnalogX = 0;
    this.touchAnalogY = 0;
  }

  private onJoystickStart(e: TouchEvent): void {
    e.preventDefault();
    this._activeDevice = 'touch';
    const touch = e.changedTouches[0];
    this.joystickTouchId = touch.identifier;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.joystickOriginX = rect.left + rect.width / 2;
    this.joystickOriginY = rect.top + rect.height / 2;
    this.updateJoystickFromTouch(touch.clientX, touch.clientY);
  }

  private onJoystickMove(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.joystickTouchId) {
        this.updateJoystickFromTouch(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
        return;
      }
    }
  }

  private onJoystickEnd(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.joystickTouchId) {
        this.joystickTouchId = null;
        this.resetInput(this.touchState);
        this.touchAnalogX = 0;
        this.touchAnalogY = 0;
        if (this.joystickKnob) {
          this.joystickKnob.style.transform = 'translate(-50%, -50%)';
        }
        return;
      }
    }
  }

  private updateJoystickFromTouch(cx: number, cy: number): void {
    const dx = cx - this.joystickOriginX;
    const dy = cy - this.joystickOriginY;
    const maxRadius = 40; // pixels
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const normX = (clamped / maxRadius) * Math.cos(angle);
    const normY = (clamped / maxRadius) * Math.sin(angle);

    // Move knob visually
    if (this.joystickKnob) {
      const kx = normX * maxRadius;
      const ky = normY * maxRadius;
      this.joystickKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    }

    // Store analog values
    this.touchAnalogX = normX;
    this.touchAnalogY = normY;

    // Set digital state from analog (threshold 0.3)
    this.touchState.up = normY < -0.3;
    this.touchState.down = normY > 0.3;
    this.touchState.left = normX < -0.3;
    this.touchState.right = normX > 0.3;

    // Queue presses for edge detection
    if (this.touchState.up) this.pressQueue.up = true;
    if (this.touchState.down) this.pressQueue.down = true;
    if (this.touchState.left) this.pressQueue.left = true;
    if (this.touchState.right) this.pressQueue.right = true;
  }

  // ═══════════════════════════════════════════════════════════════
  //  GAMEPAD
  // ═══════════════════════════════════════════════════════════════

  private setupGamepad(): void {
    window.addEventListener('gamepadconnected', (e) => {
      this._gamepadConnected = true;
      this._activeDevice = 'gamepad';
      console.log(`🎮 Gamepad connected: ${(e as GamepadEvent).gamepad.id}`);
      // Auto-hide touch controls when gamepad connects
      if (this._touchEnabled) this.disableTouchControls();
    });
    window.addEventListener('gamepaddisconnected', () => {
      this._gamepadConnected = false;
      console.log('🎮 Gamepad disconnected');
      this.resetInput(this.gamepadState);
      this.gpAnalogX = 0;
      this.gpAnalogY = 0;
      // Re-show touch controls on touch device
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        this.enableTouchControls();
      }
    });
  }

  /** Poll gamepad state — call once per frame before reading input */
  pollGamepad(): void {
    const gamepads = navigator.getGamepads?.();
    if (!gamepads) return;

    let gp: Gamepad | null = null;
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) { gp = gamepads[i]; break; }
    }
    if (!gp) return;

    this._gamepadConnected = true;

    // Left stick / D-pad
    const lx = gp.axes[0] ?? 0;
    const ly = gp.axes[1] ?? 0;

    // D-pad buttons (standard mapping: 12=up, 13=down, 14=left, 15=right)
    const dUp = gp.buttons[12]?.pressed ?? false;
    const dDown = gp.buttons[13]?.pressed ?? false;
    const dLeft = gp.buttons[14]?.pressed ?? false;
    const dRight = gp.buttons[15]?.pressed ?? false;

    const prevGP = { ...this.gamepadState };

    // Combine stick + d-pad
    this.gamepadState.up = ly < -GP_DEADZONE || dUp;
    this.gamepadState.down = ly > GP_DEADZONE || dDown;
    this.gamepadState.left = lx < -GP_DEADZONE || dLeft;
    this.gamepadState.right = lx > GP_DEADZONE || dRight;

    // A button (0) = interact, B (1) = back/cancel, Start (9) = pause
    this.gamepadState.interact = gp.buttons[0]?.pressed ?? false;

    // B / Start fire Escape
    if ((gp.buttons[1]?.pressed || gp.buttons[9]?.pressed) &&
        !(gp.buttons[1]?.pressed && gp.buttons[9]?.pressed)) {
      // Only fire once per press via edge detect
      const bWasPressed = (this as any)._gpBprev ?? false;
      const bNow = gp.buttons[1]?.pressed || gp.buttons[9]?.pressed;
      if (bNow && !bWasPressed) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      (this as any)._gpBprev = bNow;
    } else {
      (this as any)._gpBprev = false;
    }

    // Store analog for smooth movement
    this.gpAnalogX = Math.abs(lx) > GP_DEADZONE ? lx : (dRight ? 1 : dLeft ? -1 : 0);
    this.gpAnalogY = Math.abs(ly) > GP_DEADZONE ? ly : (dDown ? 1 : dUp ? -1 : 0);

    // Queue presses for edge detection (rising edge)
    if (this.gamepadState.up && !prevGP.up) this.pressQueue.up = true;
    if (this.gamepadState.down && !prevGP.down) this.pressQueue.down = true;
    if (this.gamepadState.left && !prevGP.left) this.pressQueue.left = true;
    if (this.gamepadState.right && !prevGP.right) this.pressQueue.right = true;
    if (this.gamepadState.interact && !prevGP.interact) this.pressQueue.interact = true;

    // Track active device
    if (this.gamepadState.up || this.gamepadState.down || this.gamepadState.left ||
        this.gamepadState.right || this.gamepadState.interact) {
      this._activeDevice = 'gamepad';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  UNIFIED STATE
  // ═══════════════════════════════════════════════════════════════

  /** Get merged input state from all sources (keyboard OR touch OR gamepad) */
  public getState(): InputState {
    return {
      up: this.keyState.up || this.touchState.up || this.gamepadState.up,
      down: this.keyState.down || this.touchState.down || this.gamepadState.down,
      left: this.keyState.left || this.touchState.left || this.gamepadState.left,
      right: this.keyState.right || this.touchState.right || this.gamepadState.right,
      interact: this.keyState.interact || this.touchState.interact || this.gamepadState.interact,
    };
  }

  /**
   * Returns keys that were JUST pressed this frame (rising edge).
   * Uses pressQueue to catch fast keydown→keyup between frames.
   * Works across keyboard, touch, and gamepad.
   */
  public justPressed(): InputState {
    const merged = this.getState();
    return {
      up: (merged.up || this.pressQueue.up) && !this.prevState.up,
      down: (merged.down || this.pressQueue.down) && !this.prevState.down,
      left: (merged.left || this.pressQueue.left) && !this.prevState.left,
      right: (merged.right || this.pressQueue.right) && !this.prevState.right,
      interact: (merged.interact || this.pressQueue.interact) && !this.prevState.interact,
    };
  }

  /**
   * Call at the END of each update frame to snapshot previous state.
   * Also clears the press queue so queued presses fire only once.
   */
  public endFrame(): void {
    const merged = this.getState();
    this.prevState = {
      up: merged.up || this.pressQueue.up,
      down: merged.down || this.pressQueue.down,
      left: merged.left || this.pressQueue.left,
      right: merged.right || this.pressQueue.right,
      interact: merged.interact || this.pressQueue.interact,
    };
    this.pressQueue.up = false;
    this.pressQueue.down = false;
    this.pressQueue.left = false;
    this.pressQueue.right = false;
    this.pressQueue.interact = false;
  }

  /** Check if any movement input is active from any source */
  public isMoving(): boolean {
    const s = this.getState();
    return s.up || s.down || s.left || s.right;
  }

  /**
   * Get normalized movement vector, rotated 45° for isometric alignment.
   * Uses analog values from touch/gamepad when available for smooth movement.
   */
  public getMovementVector(): { dx: number; dy: number; screenDx: number; screenDy: number } {
    let sdx = 0;
    let sdy = 0;

    // Prefer analog source if active
    if (this._activeDevice === 'gamepad' && (Math.abs(this.gpAnalogX) > GP_DEADZONE || Math.abs(this.gpAnalogY) > GP_DEADZONE)) {
      sdx = this.gpAnalogX;
      sdy = this.gpAnalogY;
    } else if (this._activeDevice === 'touch' && (Math.abs(this.touchAnalogX) > 0.1 || Math.abs(this.touchAnalogY) > 0.1)) {
      sdx = this.touchAnalogX;
      sdy = this.touchAnalogY;
    } else {
      // Digital input from any source
      const state = this.getState();
      if (state.up) sdy -= 1;
      if (state.down) sdy += 1;
      if (state.left) sdx -= 1;
      if (state.right) sdx += 1;
    }

    // Rotate 45° to convert screen-space intent → isometric grid-space
    let dx = sdx + sdy;
    let dy = -sdx + sdy;

    // Normalize to constant speed regardless of direction
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude > 0) {
      dx /= magnitude;
      dy /= magnitude;
    }

    return { dx, dy, screenDx: sdx, screenDy: sdy };
  }

  // ── Helpers ──

  private resetInput(state: InputState): void {
    state.up = false;
    state.down = false;
    state.left = false;
    state.right = false;
    state.interact = false;
  }
}
