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
   * Get normalized movement vector.
   */
  public getMovementVector(): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;

    // In isometric, diagonal movement maps differently than cardinal
    // Up-Left = (-x, -y), Up-Right = (+x, -y)
    // Down-Right = (+x, +y), Down-Left = (-x, +y)

    if (this.keyState.up) dy -= 1;
    if (this.keyState.down) dy += 1;
    if (this.keyState.left) dx -= 1;
    if (this.keyState.right) dx += 1;

    // Normalize diagonal movement to avoid faster speed
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude > 0) {
      dx /= magnitude;
      dy /= magnitude;
    }

    return { dx, dy };
  }
}
