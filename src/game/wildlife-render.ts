/**
 * wildlife-render.ts — Render wildlife entities on the iso canvas.
 *
 * B5 micro-slice 11.13 (#268): extracted from main.ts. `renderWildlife`
 * was a 140-line god-function inside `main.ts` that did:
 *   1. Get visible wildlife from the camera
 *   2. Cull off-screen entities
 *   3. Render glowing eyes for nocturnal creatures at night (#114)
 *   4. Animate the eye sway/blink timer
 *   5. Render directional sprites with behavior indicators (#142)
 *
 * Module-level state it owned (moved here from main.ts):
 *   - `_revealedCreatures` — Set<string> tracking which nocturnal
 *     creatures have been revealed by the flashlight
 *   - `_eyeBlinkTimer` / `_eyeSwayPhase` — frame counters for eye
 *     animation (local to this function, no cross-module callers)
 *
 * Why this lives in `src/game/`:
 *   - It's gameplay-domain rendering (not pure rendering pipeline)
 *   - It mutates `state.ui` (via addToast) when a creature is revealed
 *   - It's tightly coupled to `wildlife.ts` (read) and
 *     `rendering/render.ts` (write via IsometricRenderer)
 *
 * Public API:
 *   - renderWildlife(renderer, state) — per-frame render pass
 *   - getRevealedCreatures() — accessor for the __gameDebug surface
 *
 * @see issue #114 — Glowing Eyes mechanic
 * @see issue #80 — Directional wildlife sprites
 * @see issue #142 — Cat NPC behavior system
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { RENDER_CONFIG } from '../config/game.config';
import { addToast } from '../ui/ui';
import { getVisibleWildlife, getAnimationOffset, getTimeSlot } from './wildlife';
import { getSpecies } from '../config/wildlife.config';
import { getEmojiSprite } from '../asset-pipeline/emoji-cache';
import { isInFlashlightCone } from '../rendering/local-lights';
import { type GameState } from './game-state';
import { type IsometricRenderer } from '../rendering/render';

// ─── Module-level state ───────────────────────────────────────

/** Set of "chunkKey_localId" strings — creatures revealed by flashlight at night. */
const _revealedCreatures = new Set<string>();

// Glowing eyes animation state (avoids per-frame allocations)
let _eyeBlinkTimer = 0;
let _eyeSwayPhase = 0;

/** Debug accessor — exported so `__gameDebug` can report revealed-creature count. */
export function getRevealedCreatures(): Set<string> {
  return _revealedCreatures;
}

/** Debug accessor — exposed for unit tests. */
export function resetRevealedCreaturesForTests(): void {
  _revealedCreatures.clear();
}

// ─── Render ──────────────────────────────────────────────────

/**
 * Render all visible wildlife entities onto the iso canvas.
 * Includes the glowing-eyes mechanic (nocturnal creatures at night,
 * revealed by flashlight) and behavior indicators (sparkle for
 * grooming, "z" for sitting).
 *
 * Called once per frame from `renderFrame()` after the world + player
 * + entities are drawn but before the HUD overlay.
 */
export function renderWildlife(renderer: IsometricRenderer, state: GameState): void {
  const wildlife = getVisibleWildlife(state.camera, state.player.x, state.player.y);
  if (wildlife.length === 0) return;

  const ctx = renderer.getCtx();
  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;
  const timeSlot = getTimeSlot();
  const isNight = timeSlot === 'night';

  // Advance eye animation
  _eyeBlinkTimer = (_eyeBlinkTimer + 1) % 240; // blink every ~4s at 60fps
  _eyeSwayPhase += 0.03;

  for (const entity of wildlife) {
    const species = getSpecies(entity.speciesId);
    if (!species) continue;

    const anim = getAnimationOffset(entity);
    const { x: sx, y: sy } = renderer.gridToScreen(entity.worldX, entity.worldY, state.camera);

    // Viewport cull
    if (sx < -64 || sx > cw + 64 || sy < -64 || sy > ch + 64) continue;

    // Glowing eyes mechanic: nocturnal creatures at night (#114)
    const isNocturnal = species.time.includes('night');
    const entityKey = `${entity.chunkKey}_${entity.localId}`;
    const wasRevealed = _revealedCreatures.has(entityKey);

    if (isNight && isNocturnal && !wasRevealed) {
      // Check if flashlight is revealing this creature
      const inCone = isInFlashlightCone(
        entity.worldX, entity.worldY,
        state.player.x, state.player.y,
        state.player.facingDx, state.player.facingDy,
      );

      if (inCone) {
        // Reveal! Flash of discovery
        _revealedCreatures.add(entityKey);
        // Brief bright aura
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#ffffaa';
        ctx.beginPath();
        ctx.arc(sx, sy, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Show discovery toast
        addToast(state.ui, `👀 You spotted a ${species.name}! ${species.emoji}`, '#ffee44', 3000);
      } else {
        // Draw glowing eyes (two small dots)
        const eyeSize = 2.5;
        const eyeSpacing = 5;
        const eyeY = sy + anim.dy - 4;
        const eyeX = sx + anim.dx;
        // Slight sway
        const sway = Math.sin(_eyeSwayPhase + entity.localId * 1.7) * 1.2;
        // Blink: briefly close eyes (~12 frames every ~240 frames)
        const blinkOffset = (entity.localId * 37) % 240;
        const blinkPhase = (_eyeBlinkTimer + blinkOffset) % 240;
        const isBlinking = blinkPhase > 228;

        if (!isBlinking) {
          ctx.save();
          // Additive blend for glow effect
          ctx.globalCompositeOperation = 'lighter';
          // Outer glow
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#ffdd44';
          ctx.beginPath();
          ctx.arc(eyeX - eyeSpacing + sway, eyeY, eyeSize + 2, 0, Math.PI * 2);
          ctx.arc(eyeX + eyeSpacing + sway, eyeY, eyeSize + 2, 0, Math.PI * 2);
          ctx.fill();
          // Inner bright
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#ffff88';
          ctx.beginPath();
          ctx.arc(eyeX - eyeSpacing + sway, eyeY, eyeSize, 0, Math.PI * 2);
          ctx.arc(eyeX + eyeSpacing + sway, eyeY, eyeSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        continue; // Don't render full sprite
      }
    }

    // Normal sprite rendering (day, or revealed creatures)
    const sprite = getEmojiSprite(species.emoji, 0);
    const size = sprite.width * species.scale;
    const drawX = sx + anim.dx - size / 2;
    const drawY = sy + anim.dy - size / 2;

    // Fleeing creatures fade out
    if (entity.behavior === 'flee') {
      const fadeT = entity.fleeCooldown / 120;
      ctx.globalAlpha = Math.max(0.15, fadeT);
    }

    // Directional flip based on facingDir (#80)
    if (entity.facingDir === -1) {
      ctx.save();
      ctx.translate(drawX + size, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, drawX, drawY, size, size);
    }

    // Behavior indicator particles (#142: visual cues for sit/groom)
    if (entity.behavior === 'groom') {
      // Tiny sparkle dots for grooming
      const sparkT = entity.animPhase * 4;
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(sparkT) * 0.3;
      ctx.fillStyle = '#fff8e0';
      for (let i = 0; i < 3; i++) {
        const px = sx + Math.sin(sparkT + i * 2.1) * 6;
        const py = sy + anim.dy - 8 + Math.cos(sparkT + i * 1.7) * 4;
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
      ctx.restore();
    } else if (entity.behavior === 'sit') {
      // Tiny "Zzz" indicator when sitting still long enough
      if (entity.behaviorTimer < 60) { // last second of sitting
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.font = '8px sans-serif';
        ctx.fillStyle = '#aaccff';
        ctx.fillText('z', sx + 8, sy + anim.dy - 12 + Math.sin(entity.animPhase * 2) * 2);
        ctx.restore();
      }
    }

    if (entity.behavior === 'flee') {
      ctx.globalAlpha = 1.0;
    }
  }
}