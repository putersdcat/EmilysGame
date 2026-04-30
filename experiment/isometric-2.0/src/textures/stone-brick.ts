/**
 * stone-brick.ts — canonical "Stone Brick" texture.
 *
 * One 128×128 self-tileable SVG. Used by stone-wall nanos for BOTH the
 * side faces AND the top face (via createPattern in nano-tile.ts), so
 * brick scale is identical on every face and mortar lines wrap from
 * side to top continuously.
 *
 * ─── Geometry (running-bond) ─────────────────────────────────────────
 *
 *   • Image is 128×128 px, exactly 8 brick courses.
 *   • Course pitch    = 16 px (14 brick + 2 mortar)  → 8 courses
 *   • Brick pitch     = 32 px (30 brick + 2 mortar)  → 4 bricks per row
 *   • Mortar everywhere a brick is not (solid #3a3835 — no transparency).
 *
 * ─── Self-tileability ────────────────────────────────────────────────
 *
 * Vertical seams (right edge of image == left edge):
 *
 *   COURSE A (even courses, e.g. y=1..15):
 *     4 full bricks at x = 1..31, 33..63, 65..95, 97..127
 *     Mortar gap straddles x=127..128 | 0..1 (2 px), so adjacent images
 *     join with one continuous 2 px mortar line.
 *
 *   COURSE B (odd courses, staggered by 16 px, e.g. y=17..31):
 *     A 30-px brick is split across the seam:
 *       x = 113..127 in image N (15 px)
 *       x = 0..14   in image N+1 (15 px)
 *     Plus 3 full bricks at x = 17..47, 49..79, 81..111.
 *     Half-bricks are visually one continuous brick when tiled. ✓
 *
 * Horizontal seams (bottom edge == top edge):
 *
 *   • Top mortar at y=0..1, bottom mortar at y=127..128.
 *   • When stacked, these meet to form a 2 px continuous mortar joint.
 *
 * ─── Per-brick variation ─────────────────────────────────────────────
 *
 * Deterministic (course, brick-index) → grey ± BRICK_VARIANCE so the
 * texture looks hand-laid without breaking tileability.
 *
 *   • 1 px lighter highlight along the top edge of every brick.
 *   • 1 px darker shadow along the bottom edge of every brick.
 *
 * @see textures/README.md for the texture-module contract.
 * @see nano-tile.ts drawExtrudedNano for the pattern-anchoring contract.
 */

export const IMAGE_SIZE = 128;

const BRICK_W       = 30;
const BRICK_H       = 6;   // ITER: was 14 — too few visible courses on side faces
const MORTAR        = 2;
const COURSE_PITCH  = BRICK_H + MORTAR; // 8
const BRICK_PITCH   = BRICK_W + MORTAR; // 32
const COURSE_COUNT  = IMAGE_SIZE / COURSE_PITCH; // 16
const MORTAR_FILL   = '#3a3835';
const BRICK_BASE    = 168;
const BRICK_VARIANCE = 18;

interface Brick { x: number; w: number; idx: number; }

function bricksForCourse(course: number): Brick[] {
  const isB = (course % 2) === 1;
  if (!isB) {
    // Course A — 4 full bricks
    return [0, 1, 2, 3].map(i => ({ x: 1 + i * BRICK_PITCH, w: BRICK_W, idx: i }));
  }
  // Course B — half | full | full | full | half (halves span vertical seam)
  return [
    { x: 0,   w: 17,      idx: 0 },
    { x: 19,  w: BRICK_W, idx: 1 },
    { x: 55,  w: BRICK_W, idx: 2 },
    { x: 91,  w: BRICK_W, idx: 3 },
    { x: 127, w: 17,      idx: 4 },
  ];
}

function brickShade(course: number, idx: number): { fill: string; hi: string; lo: string } {
  const hash = ((course * 9173) ^ (idx * 6491)) >>> 0;
  const v = ((hash & 0xff) / 255) * 2 - 1; // -1..+1
  const base = BRICK_BASE + Math.round(v * BRICK_VARIANCE);
  const r  = Math.max(0, Math.min(255, base + ((hash >> 8)  & 7) - 3));
  const g  = Math.max(0, Math.min(255, base + ((hash >> 12) & 7) - 3));
  const b  = Math.max(0, Math.min(255, base + ((hash >> 16) & 7) - 3));
  return {
    fill: `rgb(${r},${g},${b})`,
    hi:   `rgb(${Math.min(255, r + 22)},${Math.min(255, g + 22)},${Math.min(255, b + 22)})`,
    lo:   `rgb(${Math.max(0,   r - 26)},${Math.max(0,   g - 26)},${Math.max(0,   b - 26)})`,
  };
}

function brickRects(): string {
  const out: string[] = [];
  // Solid mortar background — no transparency anywhere.
  out.push(`<rect width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" fill="${MORTAR_FILL}" />`);

  for (let course = 0; course < COURSE_COUNT; course++) {
    const cy = 1 + course * COURSE_PITCH; // brick top y
    for (const b of bricksForCourse(course)) {
      const sh = brickShade(course, b.idx);
      out.push(`<rect x="${b.x}" y="${cy}" width="${b.w}" height="${BRICK_H}" fill="${sh.fill}" />`);
      out.push(`<rect x="${b.x}" y="${cy}" width="${b.w}" height="1" fill="${sh.hi}" />`);
      out.push(`<rect x="${b.x}" y="${cy + BRICK_H - 1}" width="${b.w}" height="1" fill="${sh.lo}" />`);
    }
  }
  return out.join('\n    ');
}

let _cached: string | null = null;

/** The full 144×144 SVG string. Cached — same reference every call. */
export function svg(): string {
  if (_cached) return _cached;
  _cached = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}" shape-rendering="crispEdges">
    ${brickRects()}
  </svg>`;
  return _cached;
}
