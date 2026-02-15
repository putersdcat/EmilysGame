/**
 * input.ts - Keyboard input handling for ego character motion.
 * Manages WASD/Arrow keys for movement and Space for interaction.
 * Supports edge detection (justPressed) for single-fire actions.
 */

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  interact: boolean;
}

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

  constructor() {
    this.setupListeners();
  }

  /**
   * Setup keyboard event listeners.
   */
  private setupListeners(): void {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  /**
   * Handle key press events.
   */
  private handleKeyDown(event: KeyboardEvent): void {
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

  /**
   * Handle key release events.
   */
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

  /**
   * Get current input state.
   */
  public getState(): InputState {
    return { ...this.keyState };
  }

  /**
   * Returns keys that were JUST pressed this frame (rising edge).
   * Uses pressQueue to catch fast keydown→keyup between frames.
   * Use for single-fire actions like quiz navigate, dialog advance.
   */
  public justPressed(): InputState {
    return {
      up: (this.keyState.up || this.pressQueue.up) && !this.prevState.up,
      down: (this.keyState.down || this.pressQueue.down) && !this.prevState.down,
      left: (this.keyState.left || this.pressQueue.left) && !this.prevState.left,
      right: (this.keyState.right || this.pressQueue.right) && !this.prevState.right,
      interact: (this.keyState.interact || this.pressQueue.interact) && !this.prevState.interact,
    };
  }

  /**
   * Call at the END of each update frame to snapshot previous state.
   * Also clears the press queue so queued presses fire only once.
   */
  public endFrame(): void {
    // Use pressQueue OR keyState for prev — ensures edge detection
    // works even if key was released before this frame ran
    this.prevState = {
      up: this.keyState.up || this.pressQueue.up,
      down: this.keyState.down || this.pressQueue.down,
      left: this.keyState.left || this.pressQueue.left,
      right: this.keyState.right || this.pressQueue.right,
      interact: this.keyState.interact || this.pressQueue.interact,
    };
    // Clear queue — presses consumed
    this.pressQueue.up = false;
    this.pressQueue.down = false;
    this.pressQueue.left = false;
    this.pressQueue.right = false;
    this.pressQueue.interact = false;
  }

  /**
   * Check if any movement key is pressed.
   */
  public isMoving(): boolean {
    return this.keyState.up || this.keyState.down || this.keyState.left || this.keyState.right;
  }

  /**
   * Get normalized movement vector, rotated 45° for isometric alignment.
   * Pressing Up moves visually upward on screen (NW in grid).
   * Pressing Right moves visually right on screen (NE in grid).
   * Also returns raw screen-space direction for sprite pose selection.
   */
  public getMovementVector(): { dx: number; dy: number; screenDx: number; screenDy: number } {
    // Raw screen-intent input
    let sdx = 0;
    let sdy = 0;
    if (this.keyState.up) sdy -= 1;
    if (this.keyState.down) sdy += 1;
    if (this.keyState.left) sdx -= 1;
    if (this.keyState.right) sdx += 1;

    // Rotate 45° to convert screen-space intent → isometric grid-space
    // Screen Up (0,-1) → Grid (-1,-1) = visually move toward top of screen
    // Screen Right (1,0) → Grid (1,-1) = visually move toward right of screen
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
}
