/**
 * debuff-visuals.ts - Visual debuff effects for survival system (#110).
 * - Blur overlay when dehydrated (CSS backdrop-filter)
 * - Fly particles when dirty (canvas-rendered, orbit player)
 * - Injury screen flash (red overlay, fades out) (#109 Phase 3)
 * - Diarrhea green illness overlay + poop particle burst (#133)
 * TODO: DOC - debuff visual effects
 */

import { LOW_THRESHOLD, CRITICAL_THRESHOLD, type PlayerStatus } from '../game/status';

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
  diarrheaOverlayActive: boolean;
  poopParticleCount: number;
} {
  return {
    blurStrength: currentBlurStrength,
    flyCount: flies.length,
    flyTargetCount,
    injuryFlashAlpha,
    diarrheaOverlayActive: _diarrheaOverlayActive,
    poopParticleCount: _poopParticles.length,
  };
}

// ─── Diarrhea Illness Overlay (#133) ─────────────────────────

let _diarrheaOverlayEl: HTMLElement | null = null;
let _diarrheaOverlayActive = false;
let _diarrheaTargetAlpha = 0;
let _diarrheaCurrentAlpha = 0;

/** Show or hide the diarrhea green illness overlay. */
export function setDiarrheaOverlay(active: boolean): void {
  _diarrheaOverlayActive = active;
  _diarrheaTargetAlpha = active ? 0.18 : 0;
}

/** Update diarrhea overlay — call every frame. Smooth in/out. */
export function updateDiarrheaOverlay(): void {
  if (!_diarrheaOverlayEl) {
    _diarrheaOverlayEl = document.getElementById('diarrheaOverlay');
    if (!_diarrheaOverlayEl) return;
  }
  _diarrheaCurrentAlpha += (_diarrheaTargetAlpha - _diarrheaCurrentAlpha) * 0.08;
  if (_diarrheaCurrentAlpha < 0.005) {
    _diarrheaOverlayEl.style.display = 'none';
    _diarrheaCurrentAlpha = 0;
    return;
  }
  _diarrheaOverlayEl.style.display = 'block';
  // Pulsing green tint for nausea feel
  const pulse = 0.85 + Math.sin(Date.now() * 0.004) * 0.15;
  const alpha = _diarrheaCurrentAlpha * pulse;
  _diarrheaOverlayEl.style.background = `rgba(60, 120, 30, ${alpha.toFixed(3)})`;
}

// ─── Poop Particle Burst (#133) ────────────────────────────

interface PoopParticle {
  sx: number; sy: number;   // Screen position
  vx: number; vy: number;   // Velocity
  life: number;
  maxLife: number;
  size: number;
  emoji: boolean;  // true = 💩 emoji, false = brown dot
}

const _poopParticles: PoopParticle[] = [];
const POOP_EMOJIS = ['\u{1F4A9}'];
const POOP_DOT_COLORS = ['#8B4513', '#6B3410', '#A0522D', '#5C3317', '#4E2A0E'];

/** Spawn a burst of poop particles at the given screen position. */
export function spawnPoopBurst(screenX: number, screenY: number, count: number = 18): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 1.5 + Math.random() * 3;
    const isEmoji = i % 4 === 0; // ~25% emoji, 75% dots
    _poopParticles.push({
      sx: screenX + (Math.random() - 0.5) * 10,
      sy: screenY + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5, // slight upward bias
      life: 50 + Math.random() * 40,
      maxLife: 90,
      size: isEmoji ? (10 + Math.random() * 6) : (3 + Math.random() * 4),
      emoji: isEmoji,
    });
  }
}

/** Update and render poop particles. Call every frame after main render. */
export function updateAndRenderPoopParticles(ctx: CanvasRenderingContext2D): void {
  if (_poopParticles.length === 0) return;
  ctx.save();
  let w = 0;
  for (let i = 0; i < _poopParticles.length; i++) {
    const p = _poopParticles[i];
    p.life--;
    p.sx += p.vx;
    p.sy += p.vy;
    p.vy += 0.08; // gravity
    p.vx *= 0.97;  // drag

    if (p.life <= 0) continue;
    _poopParticles[w++] = p;

    const alpha = Math.min(1, p.life / (p.maxLife * 0.3));
    ctx.globalAlpha = alpha * 0.9;

    if (p.emoji) {
      ctx.font = `${Math.round(p.size)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(POOP_EMOJIS[0], p.sx, p.sy);
    } else {
      ctx.fillStyle = POOP_DOT_COLORS[Math.floor(Math.random() * POOP_DOT_COLORS.length)];
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  _poopParticles.length = w;
  ctx.restore();
}

// ─── Poop Marker Rendering (#133) ─────────────────────────

/**
 * Render poop markers (💩) in world space. Call during the render pass.
 * Markers fade out over their last 300 frames (~5s).
 */
export function renderPoopMarkers(
  ctx: CanvasRenderingContext2D,
  markers: { x: number; y: number; placedAt: number }[],
  frameCount: number,
  markerDuration: number,
  gridToScreen: (gx: number, gy: number) => { x: number; y: number },
): void {
  if (markers.length === 0) return;
  ctx.save();
  ctx.font = '22px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i];
    const age = frameCount - m.placedAt;
    if (age >= markerDuration) {
      markers.splice(i, 1);
      continue;
    }
    const fadeStart = markerDuration - 300; // Start fading 5s before expiry
    const alpha = age > fadeStart ? 1 - (age - fadeStart) / 300 : 1;
    const { x: sx, y: sy } = gridToScreen(m.x, m.y);
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillText('\u{1F4A9}', sx, sy);
  }
  ctx.restore();
}
