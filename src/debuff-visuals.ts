/**
 * debuff-visuals.ts - Visual debuff effects for survival system (#110).
 * - Blur overlay when dehydrated (CSS backdrop-filter)
 * - Fly particles when dirty (canvas-rendered, orbit player)
 * - Injury screen flash (red overlay, fades out) (#109 Phase 3)
 * TODO: DOC - debuff visual effects
 */

import { LOW_THRESHOLD, CRITICAL_THRESHOLD, type PlayerStatus } from './status';

// ─── Blur Overlay ────────────────────────────────────────────

let blurEl: HTMLElement | null = null;
let currentBlurStrength = 0;

/** Must be called once after DOM is ready. */
export function initDebuffVisuals(): void {
  blurEl = document.getElementById('dehydrationBlur');
}

/**
 * Update blur overlay based on hydration level.
 * Throttled — call every frame, internally applies only on change.
 */
export function updateBlurOverlay(status: PlayerStatus): void {
  if (!blurEl) return;

  let targetBlur = 0;
  if (status.hydration <= CRITICAL_THRESHOLD) {
    // Critical: strong blur (2-4px range, pulses)
    targetBlur = 3 + Math.sin(Date.now() * 0.003) * 1;
  } else if (status.hydration <= LOW_THRESHOLD) {
    // Low: mild blur (0.5-1.5px)
    const t = 1 - (status.hydration - CRITICAL_THRESHOLD) / (LOW_THRESHOLD - CRITICAL_THRESHOLD);
    targetBlur = 0.5 + t * 1;
  }

  // Smooth transition (lerp)
  currentBlurStrength += (targetBlur - currentBlurStrength) * 0.1;

  if (currentBlurStrength < 0.05) {
    blurEl.style.display = 'none';
    return;
  }

  blurEl.style.display = 'block';
  blurEl.style.backdropFilter = `blur(${currentBlurStrength.toFixed(1)}px)`;
  // Webkit prefix for Safari
  (blurEl.style as any).webkitBackdropFilter = `blur(${currentBlurStrength.toFixed(1)}px)`;
  // Tint slightly brown-ish for dehydration feel
  const alpha = Math.min(0.15, currentBlurStrength * 0.04);
  blurEl.style.background = `rgba(180, 140, 80, ${alpha.toFixed(3)})`;
}

// ─── Fly Particles ───────────────────────────────────────────

interface Fly {
  /** Angle around player (radians) */
  angle: number;
  /** Orbit radius in pixels */
  radius: number;
  /** Angular velocity (rad/frame) */
  speed: number;
  /** Vertical bob offset */
  bobPhase: number;
  /** Size in px */
  size: number;
}

const MAX_FLIES = 5;
const flies: Fly[] = [];
let flyTargetCount = 0;
let buzzTimer = 0;

/**
 * Update fly particle count based on cleanliness level.
 * Call every frame — internally handles spawning/despawning.
 */
export function updateFlies(status: PlayerStatus): void {
  if (status.cleanliness <= CRITICAL_THRESHOLD) {
    flyTargetCount = MAX_FLIES;
  } else if (status.cleanliness <= LOW_THRESHOLD) {
    // Scale 1-3 flies based on how dirty
    const t = 1 - (status.cleanliness - CRITICAL_THRESHOLD) / (LOW_THRESHOLD - CRITICAL_THRESHOLD);
    flyTargetCount = 1 + Math.floor(t * 2);
  } else {
    flyTargetCount = 0;
  }

  // Spawn flies
  while (flies.length < flyTargetCount) {
    flies.push({
      angle: Math.random() * Math.PI * 2,
      radius: 20 + Math.random() * 15,
      speed: 0.03 + Math.random() * 0.04,
      bobPhase: Math.random() * Math.PI * 2,
      size: 8 + Math.random() * 4,
    });
  }

  // Despawn flies
  while (flies.length > flyTargetCount) {
    flies.pop();
  }

  // Animate
  buzzTimer++;
  for (const fly of flies) {
    fly.angle += fly.speed;
    fly.bobPhase += 0.08;
  }
}

/**
 * Render flies orbiting the player's screen position.
 * Call after main render, before lighting.
 */
export function renderFlies(
  ctx: CanvasRenderingContext2D,
  playerScreenX: number,
  playerScreenY: number,
): void {
  if (flies.length === 0) return;

  // Fly emoji or simple black dot
  ctx.save();
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const fly of flies) {
    const fx = playerScreenX + Math.cos(fly.angle) * fly.radius;
    const fy = (playerScreenY - 40) + Math.sin(fly.angle) * (fly.radius * 0.5)
      + Math.sin(fly.bobPhase) * 4;

    // Tiny buzzing wings effect via opacity flicker
    const flicker = 0.6 + Math.sin(buzzTimer * 0.5 + fly.bobPhase) * 0.4;
    ctx.globalAlpha = flicker;
    ctx.fillText('🪰', fx, fy);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── Debug / Testing ─────────────────────────────────────────

/** Trigger injury screen flash. Call once when injury occurs. */
let injuryFlashAlpha = 0;
let injuryFlashEl: HTMLElement | null = null;

export function triggerInjuryFlash(): void {
  injuryFlashAlpha = 0.45;
  if (!injuryFlashEl) {
    injuryFlashEl = document.getElementById('injuryFlash');
  }
}

/**
 * Update injury flash — call every frame.
 * Fades smoothly to 0 then hides.
 */
export function updateInjuryFlash(): void {
  if (!injuryFlashEl) {
    injuryFlashEl = document.getElementById('injuryFlash');
    if (!injuryFlashEl) return;
  }
  if (injuryFlashAlpha <= 0.01) {
    injuryFlashEl.style.display = 'none';
    injuryFlashAlpha = 0;
    return;
  }
  injuryFlashEl.style.display = 'block';
  injuryFlashEl.style.background = `rgba(255, 0, 0, ${injuryFlashAlpha.toFixed(3)})`;
  injuryFlashAlpha *= 0.92; // Smooth decay
}

export function getInjuryFlashAlpha(): number { return injuryFlashAlpha; }

export function getDebuffVisualsState(): {
  blurStrength: number;
  flyCount: number;
  flyTargetCount: number;
  injuryFlashAlpha: number;
} {
  return {
    blurStrength: currentBlurStrength,
    flyCount: flies.length,
    flyTargetCount,
    injuryFlashAlpha,
  };
}
