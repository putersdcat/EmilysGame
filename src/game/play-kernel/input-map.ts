/**
 * input-map.ts — pure screen-intent → isometric grid transform (PR2).
 *
 * Sole definition of screenIntentToGrid under src/. InputManager and tests
 * import this (or re-export shim from input.ts).
 *
 * @see memories/repo/design-play-kernel-2026-07-19.md §4 Screen-true WASD
 */

/**
 * Map screen-space movement intent → isometric grid-space (unnormalized).
 *
 * **Player-facing contract (WASD = arrow keys):**
 *   W / ↑  → move **up the screen**
 *   S / ↓  → move **down the screen**
 *   A / ←  → move **left on the screen**
 *   D / →  → move **right on the screen**
 *
 * Screen axes: +sdx = right, +sdy = down (DOM/canvas).
 * Grid axes: `player.x/y` integrated by the motor.
 *
 * Projection (`projection.ts`): screenX ∝ (x−y), screenY ∝ (x+y).
 * Inverse (direction only; normalize after):
 *   dx =  sdx + sdy
 *   dy = −sdx + sdy
 *
 * Same law for WASD and arrows — both feed the same up/down/left/right bits.
 */
export function screenIntentToGrid(sdx: number, sdy: number): { dx: number; dy: number } {
  return {
    dx: sdx + sdy,
    dy: -sdx + sdy,
  };
}
