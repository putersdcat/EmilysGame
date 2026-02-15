/**
 * particles.ts - Ambient particle system for atmospheric effects.
 * Renders butterflies, water sparkles, drifting leaves, and birds
 * as lightweight screen-space overlays. Grid-position-aware spawning.
 * TODO: DOC - particle system overview, spawning rules, performance notes
 */

import { RENDER_CONFIG, WORLD_CONFIG } from './config/game.config';
import type { Camera } from './render';
import type { ChunkData } from './gen';

// ─── Config ─────────────────────────────────────────────────

const PARTICLE_CONFIG = {
  maxParticles: 80,        // Hard cap to prevent perf degradation
  spawnInterval: 5,        // Frames between spawn attempts
  despawnMargin: 120,      // px beyond screen edge before killing
  /** Per-type spawn chances (0-1, checked each spawnInterval) */
  spawnRates: {
    butterfly: 0.4,   // Near flowers
    sparkle: 0.5,     // Near water edges
    leaf: 0.2,        // Near trees
    bird: 0.04,       // Rare flyover
  },
} as const;

// ─── Types ──────────────────────────────────────────────────

type ParticleKind = 'butterfly' | 'sparkle' | 'leaf' | 'bird';

interface Particle {
  kind: ParticleKind;
  // Screen-space position (px)
  sx: number;
  sy: number;
  // Velocity (px/frame)
  vx: number;
  vy: number;
  // Lifecycle
  life: number;     // Remaining frames
  maxLife: number;
  // Visual
  opacity: number;
  size: number;     // px
  phase: number;    // Animation phase offset (radians)
  color: string;
  emoji: string;
  // Flutter amplitude (for butterflies/leaves)
  flutter: number;
}

// ─── Pool ───────────────────────────────────────────────────

const particles: Particle[] = [];
let spawnTimer = 0;

// ─── Emoji choices ──────────────────────────────────────────

const BUTTERFLY_EMOJIS = ['🦋'];
const LEAF_EMOJIS = ['🍃', '🍂'];
const BIRD_EMOJIS = ['🐦', '🕊️'];
const SPARKLE_COLORS = ['#fff', '#aee', '#cdf', '#eff'];

// ─── Spawn Logic ────────────────────────────────────────────

function findSpawnSources(
  chunks: Map<string, ChunkData>,
  camera: Camera,
): { flowers: number; waterEdges: number; trees: number } {
  // Quick scan of center chunk to gauge what's nearby
  const size = WORLD_CONFIG.chunkSize;
  const cx = Math.floor(camera.x / size);
  const cy = Math.floor(camera.y / size);
  const key = `${cx},${cy}`;
  const chunk = chunks.get(key);
  if (!chunk) return { flowers: 0, waterEdges: 0, trees: 0 };

  let flowers = 0, waterEdges = 0, trees = 0;

  // Sample a subset of cells (every 3rd cell for perf)
  for (let y = 0; y < size; y += 3) {
    for (let x = 0; x < size; x += 3) {
      const cell = chunk.cells[y][x];
      const ak = cell.assetKey;
      if (ak === 'flower' || ak === 'rose' || ak === 'tulip' || ak === 'lavender') flowers++;
      if (ak === 'water') waterEdges++;
      if (ak === 'tree' || ak === 'pine_tree' || ak === 'oak' || ak === 'willow') trees++;
    }
  }

  return { flowers, waterEdges, trees };
}

function spawnParticle(
  kind: ParticleKind,
  canvasW: number,
  canvasH: number,
): Particle {
  const halfW = canvasW / 2;
  const halfH = canvasH / 2;

  switch (kind) {
    case 'butterfly': {
      return {
        kind,
        sx: halfW + (Math.random() - 0.5) * canvasW * 0.8,
        sy: halfH + (Math.random() - 0.5) * canvasH * 0.6,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.3,
        life: 180 + Math.random() * 120,
        maxLife: 300,
        opacity: 0,
        size: 18 + Math.random() * 8,
        phase: Math.random() * Math.PI * 2,
        color: '',
        emoji: BUTTERFLY_EMOJIS[0],
        flutter: 2 + Math.random() * 2,
      };
    }
    case 'sparkle': {
      return {
        kind,
        sx: halfW + (Math.random() - 0.5) * canvasW * 0.6,
        sy: halfH + (Math.random() - 0.3) * canvasH * 0.6,
        vx: 0,
        vy: -0.1 - Math.random() * 0.2,
        life: 40 + Math.random() * 40,
        maxLife: 80,
        opacity: 0,
        size: 3 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
        color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
        emoji: '',
        flutter: 0.5 + Math.random(),
      };
    }
    case 'leaf': {
      // Start from upper portion, drift down
      return {
        kind,
        sx: Math.random() * canvasW,
        sy: -10 - Math.random() * 40,
        vx: 0.3 + Math.random() * 0.5,
        vy: 0.4 + Math.random() * 0.3,
        life: 200 + Math.random() * 150,
        maxLife: 350,
        opacity: 0,
        size: 16 + Math.random() * 6,
        phase: Math.random() * Math.PI * 2,
        color: '',
        emoji: LEAF_EMOJIS[Math.floor(Math.random() * LEAF_EMOJIS.length)],
        flutter: 3 + Math.random() * 3,
      };
    }
    case 'bird': {
      // Fly across screen from left or right
      const fromLeft = Math.random() > 0.5;
      return {
        kind,
        sx: fromLeft ? -20 : canvasW + 20,
        sy: 20 + Math.random() * canvasH * 0.3,
        vx: fromLeft ? 2 + Math.random() * 1.5 : -(2 + Math.random() * 1.5),
        vy: (Math.random() - 0.5) * 0.5,
        life: 200 + Math.random() * 100,
        maxLife: 300,
        opacity: 0,
        size: 20 + Math.random() * 8,
        phase: Math.random() * Math.PI * 2,
        color: '',
        emoji: BIRD_EMOJIS[Math.floor(Math.random() * BIRD_EMOJIS.length)],
        flutter: 1 + Math.random(),
      };
    }
  }
}

// ─── Update & Render ────────────────────────────────────────

/**
 * Tick and render ambient particles. Called once per frame after scene render.
 * @param ctx - Canvas 2D context to draw on
 * @param chunks - Current loaded chunks (for spawn source detection)
 * @param camera - Current camera position
 */
export function updateAndRenderParticles(
  ctx: CanvasRenderingContext2D,
  chunks: Map<string, ChunkData>,
  camera: Camera,
): void {
  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;
  const margin = PARTICLE_CONFIG.despawnMargin;

  // --- Spawn new particles periodically ---
  spawnTimer++;
  if (spawnTimer >= PARTICLE_CONFIG.spawnInterval && particles.length < PARTICLE_CONFIG.maxParticles) {
    spawnTimer = 0;
    const sources = findSpawnSources(chunks, camera);
    const rates = PARTICLE_CONFIG.spawnRates;

    // Spawn based on nearby terrain
    if (sources.flowers > 0 && Math.random() < rates.butterfly) {
      particles.push(spawnParticle('butterfly', cw, ch));
    }
    if (sources.waterEdges > 2 && Math.random() < rates.sparkle) {
      particles.push(spawnParticle('sparkle', cw, ch));
    }
    if (sources.trees > 0 && Math.random() < rates.leaf) {
      particles.push(spawnParticle('leaf', cw, ch));
    }
    if (Math.random() < rates.bird) {
      particles.push(spawnParticle('bird', cw, ch));
    }
  }

  // --- Update & render each particle, write-compaction for dead particles (#79) ---
  ctx.save();
  let writeIdx = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // Lifecycle
    p.life--;
    const lifeRatio = p.life / p.maxLife;

    // Fade in/out: first 20% fade in, last 20% fade out
    if (lifeRatio > 0.8) {
      p.opacity = Math.min(1, p.opacity + 0.05);
    } else if (lifeRatio < 0.2) {
      p.opacity = Math.max(0, lifeRatio / 0.2);
    } else {
      p.opacity = Math.min(1, p.opacity + 0.05);
    }

    // Movement
    p.sx += p.vx;
    p.sy += p.vy;

    // Kind-specific motion
    const t = (p.maxLife - p.life) * 0.05 + p.phase;

    switch (p.kind) {
      case 'butterfly':
        // Gentle zigzag flutter
        p.sx += Math.sin(t * 1.7) * p.flutter * 0.3;
        p.sy += Math.cos(t * 1.3) * p.flutter * 0.2;
        // Occasional direction change
        if (Math.random() < 0.01) {
          p.vx = (Math.random() - 0.5) * 0.5;
          p.vy = (Math.random() - 0.5) * 0.4;
        }
        break;
      case 'sparkle':
        // Twinkle effect via opacity modulation
        p.opacity *= 0.5 + 0.5 * Math.abs(Math.sin(t * 3));
        p.sx += Math.sin(t * 2) * p.flutter * 0.3;
        break;
      case 'leaf':
        // Sinusoidal sway while falling
        p.sx += Math.sin(t * 0.8) * p.flutter * 0.2;
        // Slow rotation simulated by size wobble
        p.size += Math.sin(t * 1.5) * 0.3;
        break;
      case 'bird':
        // Gentle wave up/down
        p.sy += Math.sin(t * 0.7) * 0.5;
        break;
    }

    // Kill if off-screen or expired
    if (p.life <= 0 || p.sx < -margin || p.sx > cw + margin || p.sy < -margin || p.sy > ch + margin) {
      continue; // Skip dead particles (write-compaction)
    }

    // Keep alive — compact
    particles[writeIdx++] = p;

    // --- Render ---
    ctx.globalAlpha = p.opacity * 0.85; // Overall particle opacity

    if (p.kind === 'sparkle') {
      // Draw sparkle as a small glowing dot
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.size, 0, Math.PI * 2);
      ctx.fill();
      // Cross sparkle
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 0.5;
      const s2 = p.size * 1.5;
      ctx.beginPath();
      ctx.moveTo(p.sx - s2, p.sy);
      ctx.lineTo(p.sx + s2, p.sy);
      ctx.moveTo(p.sx, p.sy - s2);
      ctx.lineTo(p.sx, p.sy + s2);
      ctx.stroke();
    } else {
      // Draw emoji particle
      ctx.font = `${Math.round(p.size)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, p.sx, p.sy);
    }
  }
  particles.length = writeIdx; // Trim dead particles
  ctx.restore();
}

/** Clear all active particles (e.g. on chunk reset or game reload). */
export function clearParticles(): void {
  particles.length = 0;
  spawnTimer = 0;
}
