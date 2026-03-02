/**
 * renderer.ts — 2.0 Experiment: Advanced rendering features.
 * Manages sun state, path-based shadows, rim lighting, and parallax layers.
 * TODO: DOC — sun angle system, shadow projection math, rim gradient pipeline
 */

import {
  type SunState,
  type ParallaxLayer,
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
} from './types';
import { Z_PX_PER_LEVEL } from './tile';

// ─── Sun State ───────────────────────────────────────────────

/** Default sun state: morning light from upper-right. */
export function createDefaultSunState(): SunState {
  return {
    azimuth: Math.PI * 0.25,       // 45° = from upper-right
    elevation: Math.PI * 0.35,      // ~63° above horizon
    shadowLength: 1.2,
    shadowAlpha: 0.35,
    rimIntensity: 0.5,
  };
}

/**
 * Compute sun state from time-of-day (0–1, where 0.5 = noon).
 * Returns sensible shadow/rim values for the given time.
 */
export function sunStateFromTime(time: number): SunState {
  // Sun rotates from east (0) to west (π) over the day
  const azimuth = Math.PI * time;
  // Elevation peaks at noon, low at dawn/dusk
  const noon = 0.5;
  const distFromNoon = Math.abs(time - noon);
  const elevation = Math.PI * 0.45 * (1 - distFromNoon * 1.8);
  // Shadows longer when sun is low
  const shadowLength = 0.5 + 2.0 * distFromNoon;
  const shadowAlpha = 0.2 + 0.3 * distFromNoon;
  const rimIntensity = 0.3 + 0.4 * Math.max(0, 1 - distFromNoon * 3);

  return {
    azimuth: Math.max(0, azimuth),
    elevation: Math.max(0.1, elevation),
    shadowLength,
    shadowAlpha: Math.min(0.6, shadowAlpha),
    rimIntensity: Math.min(0.7, rimIntensity),
  };
}

// ─── Shadow Projection ──────────────────────────────────────

/** Reusable 2D offset for shadow projection (avoid alloc in hot path). */
const _shadowOffset = { dx: 0, dy: 0 };

/** Compute shadow pixel offset from sun state and tile Z-height. */
export function computeShadowOffset(sun: SunState, z: number): { dx: number; dy: number } {
  const zPx = z * Z_PX_PER_LEVEL;
  const len = zPx * sun.shadowLength;
  // Shadow falls opposite to sun direction
  _shadowOffset.dx = -Math.cos(sun.azimuth) * len;
  _shadowOffset.dy = -Math.sin(sun.azimuth) * len * 0.5; // foreshorten for iso
  return _shadowOffset;
}

/**
 * Parse an SVG path "d" string into a simplified point array.
 * Handles M, L, Z commands (absolute only). Returns screen-space points.
 * For complex paths, this is approximate but sufficient for shadow silhouettes.
 */
export function parseSvgPathToPoints(pathD: string): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  // Match coordinate pairs after M/L commands
  const re = /([MLZ])\s*([-\d.]+)?\s*([-\d.]+)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(pathD)) !== null) {
    const cmd = match[1].toUpperCase();
    if (cmd === 'Z') continue;
    const x = parseFloat(match[2]);
    const y = parseFloat(match[3]);
    if (!isNaN(x) && !isNaN(y)) {
      points.push({ x, y });
    }
  }
  return points;
}

/**
 * Draw a path-based shadow for a tile onto the chunk bake canvas.
 * Projects the tile's shadowPath SVG data at the given sun angle.
 */
export function drawTileShadow(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  shadowPath: string,
  z: number,
  sun: SunState,
): void {
  const points = parseSvgPathToPoints(shadowPath);
  if (points.length < 3) return;

  const offset = computeShadowOffset(sun, z);
  const scaleX = ISO_TILE_WIDTH / 128;  // SVG 128 → ISO 256
  const scaleY = ISO_TILE_HEIGHT / 128; // SVG 128 → ISO 128

  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${sun.shadowAlpha})`;
  ctx.beginPath();

  for (let i = 0; i < points.length; i++) {
    // Transform SVG coordinates to isometric screen space + shadow offset
    const isoX = screenX + points[i].x * scaleX + offset.dx;
    const isoY = screenY + points[i].y * scaleY + offset.dy;
    if (i === 0) ctx.moveTo(isoX, isoY);
    else ctx.lineTo(isoX, isoY);
  }

  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draw a simple diamond shadow for tiles without explicit shadow paths.
 * Projects a diamond silhouette based on tile Z-height.
 */
export function drawDefaultShadow(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  z: number,
  sun: SunState,
): void {
  if (z <= 0) return; // No shadow for ground-level tiles

  const offset = computeShadowOffset(sun, z);
  const hw = ISO_TILE_WIDTH / 2;
  const hh = ISO_TILE_HEIGHT / 2;
  const cx = screenX + hw + offset.dx;
  const cy = screenY + hh + offset.dy;

  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${sun.shadowAlpha * 0.7})`;
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);       // top
  ctx.lineTo(cx + hw, cy);       // right
  ctx.lineTo(cx, cy + hh);       // bottom
  ctx.lineTo(cx - hw, cy);       // left
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ─── Rim Lighting ────────────────────────────────────────────

/**
 * Draw rim lighting on the sun-facing edges of a tile's diamond.
 * Creates a subtle glow on edges that face toward the sun.
 */
export function drawRimLighting(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  sun: SunState,
): void {
  const hw = ISO_TILE_WIDTH / 2;
  const hh = ISO_TILE_HEIGHT / 2;
  const cx = screenX + hw;
  const cy = screenY + hh;
  const intensity = sun.rimIntensity;

  if (intensity < 0.05) return;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  // Sun from azimuth angle — determine which edges face the sun
  const sunNormX = Math.cos(sun.azimuth);
  const sunNormY = Math.sin(sun.azimuth);

  // Top-right edge: diamond top → right
  // Edge normal points upper-right (~45° = NE)
  const trDot = sunNormX * 0.707 + sunNormY * (-0.707);
  if (trDot > 0) {
    const alpha = trDot * intensity;
    const grad = ctx.createLinearGradient(cx, cy - hh, cx + hw, cy);
    grad.addColorStop(0, `rgba(255, 255, 220, ${alpha * 0.8})`);
    grad.addColorStop(0.5, `rgba(255, 255, 220, ${alpha})`);
    grad.addColorStop(1, `rgba(255, 255, 220, ${alpha * 0.3})`);
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.stroke();
  }

  // Top-left edge: diamond left → top
  // Edge normal points upper-left (~135° = NW)
  const tlDot = sunNormX * (-0.707) + sunNormY * (-0.707);
  if (tlDot > 0) {
    const alpha = tlDot * intensity;
    const grad = ctx.createLinearGradient(cx - hw, cy, cx, cy - hh);
    grad.addColorStop(0, `rgba(255, 255, 220, ${alpha * 0.3})`);
    grad.addColorStop(0.5, `rgba(255, 255, 220, ${alpha})`);
    grad.addColorStop(1, `rgba(255, 255, 220, ${alpha * 0.8})`);
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.lineTo(cx, cy - hh);
    ctx.stroke();
  }

  // Bottom-right edge: diamond right → bottom
  const brDot = sunNormX * 0.707 + sunNormY * 0.707;
  if (brDot > 0) {
    const alpha = brDot * intensity * 0.5; // less intense on bottom edges
    ctx.strokeStyle = `rgba(255, 255, 220, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Parallax Layer Factories ────────────────────────────────

/** Create sky gradient background layer (stationary). */
export function createSkyLayer(): ParallaxLayer {
  return {
    depth: 0,
    render(ctx, _offsetX, _offsetY, w, h) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0a0a2e');   // Dark sky top
      grad.addColorStop(0.3, '#1a1a4e'); // Deep blue
      grad.addColorStop(0.6, '#2a3a5e'); // Medium blue
      grad.addColorStop(1, '#3a4a6a');   // Lighter horizon
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
  };
}

/** Create distant mountain silhouette layer. */
export function createMountainLayer(): ParallaxLayer {
  return {
    depth: 0.15,
    render(ctx, offsetX, _offsetY, w, h) {
      const baseY = h * 0.55;
      ctx.save();
      ctx.fillStyle = '#1a2a3a';

      ctx.beginPath();
      ctx.moveTo(0, h);

      // Procedural mountain ridge
      const peaks = 8;
      const segW = (w + 200) / peaks;
      for (let i = 0; i <= peaks; i++) {
        const x = i * segW + offsetX * 0.15;
        const xMod = ((x % (w + 200)) + (w + 200)) % (w + 200) - 100;
        const peakH = 60 + Math.sin(i * 1.7 + 0.5) * 40 + Math.cos(i * 0.8) * 25;
        ctx.lineTo(xMod, baseY - peakH);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}

/** Create closer hill silhouette layer. */
export function createHillLayer(): ParallaxLayer {
  return {
    depth: 0.3,
    render(ctx, offsetX, _offsetY, w, h) {
      const baseY = h * 0.65;
      ctx.save();
      ctx.fillStyle = '#1e2e3e';

      ctx.beginPath();
      ctx.moveTo(0, h);

      const hills = 12;
      const segW = (w + 300) / hills;
      for (let i = 0; i <= hills; i++) {
        const x = i * segW + offsetX * 0.3;
        const xMod = ((x % (w + 300)) + (w + 300)) % (w + 300) - 150;
        const hillH = 30 + Math.sin(i * 2.1 + 1.2) * 20 + Math.cos(i * 1.3) * 15;
        ctx.lineTo(xMod, baseY - hillH);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}

/** Create cloud overlay layer. */
export function createCloudLayer(): ParallaxLayer {
  return {
    depth: 0.5,
    render(ctx, offsetX, offsetY, w, h) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#ffffff';

      // Drifting cloud blobs
      const clouds = [
        { bx: 100, by: 80, rx: 80, ry: 25 },
        { bx: 400, by: 120, rx: 100, ry: 30 },
        { bx: 700, by: 60, rx: 70, ry: 20 },
        { bx: 250, by: 200, rx: 90, ry: 28 },
        { bx: 550, by: 150, rx: 75, ry: 22 },
      ];

      for (const c of clouds) {
        const cx = ((c.bx + offsetX * 0.5) % (w + 200)) - 100;
        const cy = ((c.by + offsetY * 0.2) % (h * 0.5));
        ctx.beginPath();
        ctx.ellipse(cx, cy, c.rx, c.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },
  };
}

// ─── Parallax Rendering ──────────────────────────────────────

/**
 * Render all parallax layers behind the tile world.
 * Each layer scrolls at camera_speed * (1 - depth).
 */
export function renderParallaxLayers(
  ctx: CanvasRenderingContext2D,
  camScreenX: number,
  camScreenY: number,
  w: number,
  h: number,
  layers: readonly ParallaxLayer[],
): void {
  for (const layer of layers) {
    const offsetX = camScreenX * (1 - layer.depth);
    const offsetY = camScreenY * (1 - layer.depth);
    layer.render(ctx, offsetX, offsetY, w, h);
  }
}
