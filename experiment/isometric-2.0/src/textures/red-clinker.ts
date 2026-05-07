/**
 * red-clinker.ts — 48×48 modular red brick face slices.
 *
 * This intentionally mirrors the older gray-brick visual grammar the user
 * approved: small running-bond bricks, horizontal side courses, and brick
 * rows that tile cleanly through 48px nano/micro subdivisions. The visible
 * wall geometry is 144px, so each face is exactly 3×3 copies of the 48px
 * brick module.
 *
 * Face-slice contract:
 *   - svgTop() is the horizontal cap material (XY).
 *   - svgSouth(edgeY) is a vertical XZ side slice whose top row is sampled
 *     from the top-cap row immediately inside the south edge.
 *   - svgEast(edgeX) is a vertical YZ side slice with the same rule.
 */

export const IMAGE_SIZE = 144;

const SIZE = IMAGE_SIZE;
const MODULE = 48;
const MORTAR = 2;
const BRICK_H = 6;
const COURSE_PITCH = BRICK_H + MORTAR; // 8px, six courses per 48px module
const BRICK_W = 22;
const BRICK_PITCH = BRICK_W + MORTAR; // 24px, two bricks per 48px module
const MORTAR_FILL = '#2a201c';

const R_BASE = 136, R_VAR = 24;
const G_BASE = 55,  G_VAR = 14;
const B_BASE = 29,  B_VAR = 9;

interface BrickRun { readonly x: number; readonly w: number; readonly idx: number; }

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function brickShade(course: number, idx: number): { fill: string; hi: string; lo: string } {
  // Repeat colours on a 48px module so seam-split half bricks keep the
  // same colour when a 144 face repeats or crosses a tile boundary.
  const c = mod(course, MODULE / COURSE_PITCH); // 0..5
  const i = mod(idx, MODULE / BRICK_PITCH);     // 0..1
  const hash = ((c * 7411) ^ (i * 5237) ^ 0xC11A) >>> 0;
  const fr = ((hash      ) & 0xff) / 255 * 2 - 1;
  const fg = ((hash >>  8) & 0xff) / 255 * 2 - 1;
  const fb = ((hash >> 16) & 0xff) / 255 * 2 - 1;
  const r = clamp(R_BASE + fr * R_VAR, 84, 188);
  const g = clamp(G_BASE + fg * G_VAR, 30, 88);
  const b = clamp(B_BASE + fb * B_VAR, 16, 52);
  return {
    fill: `rgb(${r},${g},${b})`,
    hi: `rgb(${clamp(r + 28, 0, 255)},${clamp(g + 20, 0, 255)},${clamp(b + 12, 0, 255)})`,
    lo: `rgb(${clamp(r - 28, 0, 255)},${clamp(g - 20, 0, 255)},${clamp(b - 14, 0, 255)})`,
  };
}

function runsForCourse(courseCoord: number): BrickRun[] {
  const course = Math.floor(courseCoord / COURSE_PITCH);
  const rowOffset = (course & 1) ? -BRICK_PITCH / 2 : 0;
  const runs: BrickRun[] = [];

  for (let i = -2; i <= 10; i++) {
    const start = rowOffset + i * BRICK_PITCH + MORTAR / 2;
    const end = start + BRICK_W;
    const x = Math.max(0, start);
    const w = Math.min(SIZE, end) - x;
    if (w > 0) runs.push({ x, w, idx: i });
  }
  return runs;
}

function drawCourse(out: string[], y: number, courseCoord: number, opacity = 1): void {
  const cy = y + 1;
  const course = Math.floor(courseCoord / COURSE_PITCH);
  for (const b of runsForCourse(courseCoord)) {
    const sh = brickShade(course, b.idx);
    const op = opacity < 1 ? ` opacity="${opacity}"` : '';
    out.push(`<rect x="${b.x}" y="${cy}" width="${b.w}" height="${BRICK_H}" fill="${sh.fill}"${op} />`);
    out.push(`<rect x="${b.x}" y="${cy}" width="${b.w}" height="1" fill="${sh.hi}"${op} />`);
    out.push(`<rect x="${b.x}" y="${cy + BRICK_H - 1}" width="${b.w}" height="1" fill="${sh.lo}"${op} />`);
  }
}

function faceRows(startCoord: number, topCap = false): string {
  const out: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${MORTAR_FILL}" />`];
  for (let y = 0; y < SIZE; y += COURSE_PITCH) {
    // For top caps, keep the same small-brick grammar as the reference but
    // slightly soften internal contrast so side courses remain dominant.
    drawCourse(out, y, startCoord + y, topCap ? 0.92 : 1);
  }
  return out.join('\n    ');
}

function drawEndTopCourse(out: string[], courseCoord: number): void {
  // Exposed end-cap top row: header bricks are short in the run direction,
  // so vertical grout spacing must match the 8px top-surface course rhythm,
  // not the side-face 24px stretcher rhythm.
  const course = Math.floor(courseCoord / COURSE_PITCH);
  for (let x = 1, idx = 0; x < SIZE; x += COURSE_PITCH, idx++) {
    const w = Math.min(BRICK_H, SIZE - x);
    const sh = brickShade(course, idx);
    out.push(`<rect x="${x}" y="1" width="${w}" height="${BRICK_H}" fill="${sh.fill}" />`);
    out.push(`<rect x="${x}" y="1" width="${w}" height="1" fill="${sh.hi}" />`);
    out.push(`<rect x="${x}" y="${BRICK_H}" width="${w}" height="1" fill="${sh.lo}" />`);
  }
}

function endRows(startCoord: number): string {
  const out: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${MORTAR_FILL}" />`];
  drawEndTopCourse(out, startCoord);
  for (let y = COURSE_PITCH; y < SIZE; y += COURSE_PITCH) {
    drawCourse(out, y, startCoord + y);
  }
  return out.join('\n    ');
}

function drawCourseV(out: string[], x: number, courseCoord: number, opacity = 1): void {
  const cx = x + 1;
  const course = Math.floor(courseCoord / COURSE_PITCH);
  for (const b of runsForCourse(courseCoord)) {
    const sh = brickShade(course, b.idx);
    const op = opacity < 1 ? ` opacity="${opacity}"` : '';
    out.push(`<rect x="${cx}" y="${b.x}" width="${BRICK_H}" height="${b.w}" fill="${sh.fill}"${op} />`);
    out.push(`<rect x="${cx}" y="${b.x}" width="1" height="${b.w}" fill="${sh.hi}"${op} />`);
    out.push(`<rect x="${cx + BRICK_H - 1}" y="${b.x}" width="1" height="${b.w}" fill="${sh.lo}"${op} />`);
  }
}

function faceCols(startCoord: number, topCap = false): string {
  const out: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${MORTAR_FILL}" />`];
  for (let x = 0; x < SIZE; x += COURSE_PITCH) {
    drawCourseV(out, x, startCoord + x, topCap ? 0.92 : 1);
  }
  return out.join('\n    ');
}

let _cached: string | null = null;
let _cachedTop: string | null = null;
let _cachedTopV: string | null = null;
const _cachedSouth = new Map<number, string>();
const _cachedEast = new Map<number, string>();
const _cachedEnd = new Map<number, string>();

/** Legacy/default 144px running-bond tile. */
export function svg(): string {
  if (_cached) return _cached;
  _cached = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">
    ${faceRows(0)}
  </svg>`;
  return _cached;
}

/** Top/XY face: 48px modular small-brick cap rows. */
export function svgTop(): string {
  if (_cachedTop) return _cachedTop;
  _cachedTop = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">
    ${faceRows(0, true)}
  </svg>`;
  return _cachedTop;
}

/** V-axis top/XY face: transposed cap rows so bricks run along world-Y. */
export function svgTopV(): string {
  if (_cachedTopV) return _cachedTopV;
  _cachedTopV = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">
    ${faceCols(0, true)}
  </svg>`;
  return _cachedTopV;
}

/** South/front XZ side slice. `edgeCoord` is the wall's world-y plane. */
export function svgSouth(edgeCoord = 96): string {
  const cached = _cachedSouth.get(edgeCoord);
  if (cached) return cached;
  // Use the top course immediately inside the edge for y=0 on the side,
  // so grout/half-brick phase carries over onto the end cap/top row.
  const startCoord = Math.max(0, edgeCoord - COURSE_PITCH);
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">
    ${faceRows(startCoord)}
  </svg>`;
  _cachedSouth.set(edgeCoord, out);
  return out;
}

/** East/right YZ side slice. `edgeCoord` is the wall's world-x plane. */
export function svgEast(edgeCoord = 96): string {
  const cached = _cachedEast.get(edgeCoord);
  if (cached) return cached;
  const startCoord = Math.max(0, edgeCoord - COURSE_PITCH);
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">
    ${faceRows(startCoord)}
  </svg>`;
  _cachedEast.set(edgeCoord, out);
  return out;
}

/** Exposed end-cap slice with a purpose-authored top/header row. */
export function svgEnd(edgeCoord = 96): string {
  const cached = _cachedEnd.get(edgeCoord);
  if (cached) return cached;
  const startCoord = Math.max(0, edgeCoord - COURSE_PITCH);
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">
    ${endRows(startCoord)}
  </svg>`;
  _cachedEnd.set(edgeCoord, out);
  return out;
}
