// filepath: src/game/player-visuals.ts
// B5 micro-slice 11.45 (#268): player visual state update extracted
// from main.ts handleMovement(). Updates:
//   - state.player.direction (left/right flip)
//   - state.player.facingDx / facingDy (2D facing for interaction)
//   - state.player.facingPose (side / front / back, based on screen-space)
//   - state.player.isMoving (true when movement vector has magnitude)
//   - state.player.animFrame (throttled to every 6th game frame)
//   - state.egoImg (reload sprite when frame or pose changes)
//
// Pure visual presentation derived from the movement vector + frameCount.
// No collision or audio logic — those stay in handleMovement.
import type { GameState } from './game-state';
import { PLAYER_CONFIG } from '../config/game.config';
import { loadCharacterSprite } from '../asset-pipeline/sprites';

/**
 * Frame-throttle constant for sprite animation (#66 perf).
 * Only advance animFrame every 6th game frame to avoid wasting CPU on
 * sprite reloads when the player is moving continuously.
 */
const ANIM_FRAME_THROTTLE = 6;

/**
 * Update the player visual state after a movement tick.
 *
 * Reads `state.player.x/y`, `state.frameCount`, and the movement vector
 * components (dx/dy/screenDx/screenDy) to update direction, facing pose,
 * isMoving, and the sprite frame. Mutates state in place.
 *
 * @param state  — the GameState (mutated)
 * @param mv     — the movement vector from input.getMovementVector()
 * @param isMoving — whether the player is currently moving (callers already check)
 */
export function updatePlayerVisuals(
  state: GameState,
  mv: { dx: number; dy: number; screenDx: number; screenDy: number },
  isMoving: boolean,
): void {
  if (!isMoving) {
    state.player.isMoving = false;
    // Idle sprite - only reload once when stopping (preserves facing pose)
    if (state.player.animFrame !== 0 || state.lastAnimFrame !== 0) {
      state.player.animFrame = 0;
      state.egoImg = loadCharacterSprite(state.playerVariation, 0, false, state.player.facingPose);
      state.lastAnimFrame = 0;
      state.lastFacingPose = state.player.facingPose;
    }
    return;
  }

  // Direction (left/right flip)
  if (mv.dx > 0) state.player.direction = 1;
  else if (mv.dx < 0) state.player.direction = -1;

  // Track full 2D facing direction for interaction
  state.player.facingDx = Math.sign(mv.dx);
  state.player.facingDy = Math.sign(mv.dy);

  // Determine facing pose from screen-space direction (what the player sees):
  // Horizontal dominance (left/right keys) → side profile sprite
  // Vertical dominance (up/down keys) → front (down) or back (up)
  // Diagonal → use vertical component for front/back
  const asx = Math.abs(mv.screenDx);
  const asy = Math.abs(mv.screenDy);
  if (asx > asy) {
    state.player.facingPose = 'side';
  } else if (mv.screenDy < 0) {
    state.player.facingPose = 'back';
  } else if (mv.screenDy > 0) {
    state.player.facingPose = 'front';
  }
  // Equal diagonal (asx === asy && both > 0) → keep current facingPose

  state.player.isMoving = true;
  // Throttle animation: only advance sprite frame every 6th game frame
  if (state.frameCount % ANIM_FRAME_THROTTLE === 0) {
    state.player.animFrame = (state.player.animFrame + 1) % PLAYER_CONFIG.animationFrames;
  }

  // Walking sprite - reload when frame or facing pose changes
  if (state.player.animFrame !== state.lastAnimFrame ||
      state.player.facingPose !== state.lastFacingPose) {
    state.egoImg = loadCharacterSprite(
      state.playerVariation, state.player.animFrame, true, state.player.facingPose,
    );
    state.lastAnimFrame = state.player.animFrame;
    state.lastFacingPose = state.player.facingPose;
  }
}
