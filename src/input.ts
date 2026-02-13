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
        event.preventDefault();
        break;
      case 's':
      case 'arrowdown':
        this.keyState.down = true;
        event.preventDefault();
        break;
      case 'a':
      case 'arrowleft':
        this.keyState.left = true;
        event.preventDefault();
        break;
      case 'd':
      case 'arrowright':
        this.keyState.right = true;
        event.preventDefault();
        break;
      case ' ':
        this.keyState.interact = true;
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
   * Use for single-fire actions like quiz navigate, dialog advance.
   */
  public justPressed(): InputState {
    return {
      up: this.keyState.up && !this.prevState.up,
      down: this.keyState.down && !this.prevState.down,
      left: this.keyState.left && !this.prevState.left,
      right: this.keyState.right && !this.prevState.right,
      interact: this.keyState.interact && !this.prevState.interact,
    };
  }

  /**
   * Call at the END of each update frame to snapshot previous state.
   */
  public endFrame(): void {
    this.prevState = { ...this.keyState };
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
   */
  public getMovementVector(): { dx: number; dy: number } {
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

    return { dx, dy };
  }
}
