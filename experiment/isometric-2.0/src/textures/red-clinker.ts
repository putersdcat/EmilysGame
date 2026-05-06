/**
 * red-clinker.ts — "Red Clinker Brick" texture.
 *
 * One 128×128 self-tileable SVG. Used as a stone-wall side+top texture
 * via createPattern in nano-tile.ts (the wall renderer is texture-
 * agnostic — any module conforming to the textures/README.md contract
 * can substitute for the canonical StoneBrick).
 *
 * ─── Geometry — IDENTICAL to stone-brick ─────────────────────────────
 *
 * Same running-bond cell layout, mortar pitch, and seam-spanning
 * half-brick trick as stone-brick.ts. This is intentional: the
 * tileability proof in stone-brick.ts (see that file's header) carries
 * over verbatim, so a clinker run wraps cleanly across tile boundaries
 * and onto wall tops with the same grout-aligned pattern phase the
 * renderer relies on. Only the per-brick PALETTE differs.
 *
 * If you change BRICK_W / BRICK_H / MORTAR / COURSE_PITCH here, you
 * MUST mirror the change in stone-brick.ts, or grout will visibly
 * misalign anywhere a stone wall meets a clinker wall in a chain.
 *
 * ─── Palette — over-fired red clinker ────────────────────────────────
 *
 * Real clinker bricks are vitrified by over-firing, which produces a
 * wide, stochastic colour range from deep plum / iron-black through
 * brick red into hot orange. To reproduce that look while staying
 * deterministic per (course, idx) so adjacent tiles align:
 *
 *   • Base channel target:   r=130, g=50, b=35   (warm dark red)
 *   • Per-brick variance:    ±45 R, ±25 G, ±20 B   (much wider than
 *                            stone's tight grey ±18 — gives the
 *                            mottled fired-clay look).
 *   • Mortar:                #2a201c   (dark warm grey, slightly
 *                            redder than stone mortar so it doesn't
 *                            visually clash with the red bricks).
 *   • Edge highlight / shadow widths: same 1 px top / 1 px bottom
 *     trick used in stone-brick — keeps the carved-cell impression
 *     consistent between the two textures.
 *
 * @see textures/stone-brick.ts — the canonical sibling module; this
 *      file mirrors its geometry exactly and only diverges in colour.
 * @see textures/README.md — module contract.
 */

export const IMAGE_SIZE = 144;

const BRICK_W       = 34;
const BRICK_H       = 6;
const MORTAR        = 2;
const COURSE_PITCH  = BRICK_H + MORTAR; // 8
const BRICK_PITCH   = BRICK_W + MORTAR; // 36
const COURSE_COUNT  = IMAGE_SIZE / COURSE_PITCH; // 18
const MORTAR_FILL   = '#2a201c';
const TOP_BRICK_H      = 14;
const TOP_COURSE_PITCH = TOP_BRICK_H + MORTAR; // 16

// Channel base + per-channel variance. R is widest because clinker
// bricks vary most strongly in red intensity (cool plum → hot orange).
const R_BASE = 136, R_VAR = 26;
const G_BASE = 56,  G_VAR = 14;
const B_BASE = 28,  B_VAR = 8;

interface Brick { x: number; w: number; idx: number; }

function bricksForCourse(course: number): Brick[] {
  const isB = (course % 2) === 1;
  if (!isB) {
    // Course A — 4 full bricks, identical layout to stone-brick.ts.
    return [0, 1, 2, 3].map(i => ({ x: 1 + i * BRICK_PITCH, w: BRICK_W, idx: i }));
  }
  // Course B — half | full | full | full | half. Halves span the
  // vertical seam to form one continuous brick across adjacent images.
  return [
    { x: 0,   w: 17,      idx: 0 },
    { x: 19,  w: BRICK_W, idx: 1 },
    { x: 55,  w: BRICK_W, idx: 2 },
    { x: 91,  w: BRICK_W, idx: 3 },
    { x: 127, w: 17,      idx: 4 },
  ];
}

function brickShade(course: number, idx: number): { fill: string; hi: string; lo: string } {
  // Deterministic hash → per-channel offset. Different prime triples
  // than stone-brick so a clinker tile never accidentally produces the
  // same colour sequence a stone tile does at the same (course, idx).
  const hash = ((course * 7411) ^ (idx * 5237) ^ 0xC11A) >>> 0;
  const fr = ((hash      ) & 0xff) / 255 * 2 - 1; // -1..+1
  const fg = ((hash >>  8) & 0xff) / 255 * 2 - 1;
  const fb = ((hash >> 16) & 0xff) / 255 * 2 - 1;
  const r = Math.max(80, Math.min(190, R_BASE + Math.round(fr * R_VAR)));
  const g = Math.max(28, Math.min(90,  G_BASE + Math.round(fg * G_VAR)));
  const b = Math.max(16, Math.min(52,  B_BASE + Math.round(fb * B_VAR)));
  return {
    fill: `rgb(${r},${g},${b})`,
    // Highlight: warm-shifted brighter (more orange — fired-clay catches
    // light with a yellow-orange sheen, not a pure white).
    hi:   `rgb(${Math.min(255, r + 30)},${Math.min(255, g + 22)},${Math.min(255, b + 14)})`,
    // Shadow: cool-shifted darker (the under-shadow of a fired brick
    // reads slightly purple, never neutral grey).
    lo:   `rgb(${Math.max(0,   r - 32)},${Math.max(0,   g - 22)},${Math.max(0,   b - 16)})`,
  };
}

function brickRects(): string {
  const out: string[] = [];
  // Solid mortar background — no transparency anywhere (textures/README.md).
  out.push(`<rect width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" fill="${MORTAR_FILL}" />`);

  for (let course = 0; course < COURSE_COUNT; course++) {
    const cy = 1 + course * COURSE_PITCH; // brick top y (1 px top mortar)
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
let _cachedTop: string | null = null;
const _cachedSouth = new Map<number, string>();
const _cachedEast = new Map<number, string>();

/** The full 128×128 SVG string. Cached — same reference every call. */
export function svg(): string {
  if (_cached) return _cached;
  _cached = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}" shape-rendering="crispEdges">
    ${brickRects()}
  </svg>`;
  return _cached;
}

function brickRunsForPitch(axis: 'x' | 'y', coord: number, pitch: number): Brick[] {
  const course = Math.floor(coord / pitch);
  const rowOffset = (course % 2) === 1 ? BRICK_PITCH / 2 : 0;
  const out: Brick[] = [];
  let idx = -2;
  for (let x = -BRICK_PITCH * 2 + rowOffset; x < IMAGE_SIZE + BRICK_PITCH * 2; x += BRICK_PITCH) {
    const a = x + MORTAR / 2;
    const b = x + BRICK_W + MORTAR / 2;
    const left = Math.max(0, a);
    const right = Math.min(IMAGE_SIZE, b);
    if (right > left) out.push({ x: left, w: right - left, idx: axis === 'x' ? idx : idx + 17 });
    idx++;
  }
  return out;
}

function worldBrickRuns(axis: 'x' | 'y', coord: number): Brick[] {
  return brickRunsForPitch(axis, coord, COURSE_PITCH);
}

function topBrickRuns(axis: 'x' | 'y', coord: number): Brick[] {
  return brickRunsForPitch(axis, coord, TOP_COURSE_PITCH);
}

function faceBrickShade(coord: number, idx: number): { fill: string; hi: string; lo: string } {
  const course = Math.floor(coord / COURSE_PITCH);
  // Face slices must agree at top/side ridges. Use the same deterministic
  // colour family for both axes so a brick that crosses an edge keeps its
  // visible fired-clay colour instead of becoming a different random brick.
  return brickShade(course % 2, idx);
}

function topBrickShade(coord: number, idx: number): { fill: string; hi: string; lo: string } {
  return brickShade(Math.floor(coord / TOP_COURSE_PITCH) % 2, idx);
}

function topRects(): string {
  const out: string[] = [`<rect width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" fill="${MORTAR_FILL}" />`];
  for (let y = 0; y < IMAGE_SIZE; y += TOP_COURSE_PITCH) {
    const cy = y + 1;
    for (const b of topBrickRuns('x', y)) {
      const sh = topBrickShade(y, b.idx);
      out.push(`<rect x="${b.x}" y="${cy}" width="${b.w}" height="${TOP_BRICK_H}" fill="${sh.fill}" />`);
      out.push(`<rect x="${b.x}" y="${cy}" width="${b.w}" height="1" fill="${sh.hi}" opacity="0.65" />`);
      out.push(`<rect x="${b.x}" y="${cy + TOP_BRICK_H - 1}" width="${b.w}" height="1" fill="${sh.lo}" opacity="0.45" />`);
    }
  }
  return out.join('\n    ');
}

function sideRects(axis: 'x' | 'y', edgeCoord: number): string {
  const out: string[] = [`<rect width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" fill="${MORTAR_FILL}" />`];
  const topEdgeCoord = Math.max(0, edgeCoord - TOP_COURSE_PITCH);

  // Top cap course: same brick run IDs/colors as the top face along the
  // shared edge. This is the critical edge-continuity contract.
  for (const b of topBrickRuns(axis, topEdgeCoord)) {
    const sh = topBrickShade(topEdgeCoord, b.idx);
    out.push(`<rect x="${b.x}" y="1" width="${b.w}" height="${BRICK_H}" fill="${sh.fill}" />`);
    out.push(`<rect x="${b.x}" y="1" width="${b.w}" height="1" fill="${sh.hi}" />`);
    out.push(`<rect x="${b.x}" y="${BRICK_H}" width="${b.w}" height="1" fill="${sh.lo}" />`);
  }

  // Lower courses: normal horizontal courses, offset by depth but using
  // the same axis palette so exposed end/course lines stay horizontal.
  for (let y = COURSE_PITCH; y < IMAGE_SIZE; y += COURSE_PITCH) {
    const coord = topEdgeCoord + y;
    const cy = y + 1;
    for (const b of worldBrickRuns(axis, coord)) {
      const sh = faceBrickShade(coord, b.idx);
      out.push(`<rect x="${b.x}" y="${cy}" width="${b.w}" height="${BRICK_H}" fill="${sh.fill}" />`);
      out.push(`<rect x="${b.x}" y="${cy}" width="${b.w}" height="1" fill="${sh.hi}" />`);
      out.push(`<rect x="${b.x}" y="${cy + BRICK_H - 1}" width="${b.w}" height="1" fill="${sh.lo}" />`);
    }
  }
  return out.join('\n    ');
}

/** Top/XY face slice for extrusion rendering. */
export function svgTop(): string {
  if (_cachedTop) return _cachedTop;
  _cachedTop = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}" shape-rendering="crispEdges">
    ${topRects()}
  </svg>`;
  return _cachedTop;
}

/** South/front XZ side slice. y=0 is the top edge of the side face. */
export function svgSouth(edgeCoord = 96): string {
  const cached = _cachedSouth.get(edgeCoord);
  if (cached) return cached;
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}" shape-rendering="crispEdges">
    ${sideRects('x', edgeCoord)}
  </svg>`;
  _cachedSouth.set(edgeCoord, out);
  return out;
}

/** East/right YZ side slice. y=0 is the top edge of the side face. */
export function svgEast(edgeCoord = 96): string {
  const cached = _cachedEast.get(edgeCoord);
  if (cached) return cached;
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}" shape-rendering="crispEdges">
    ${sideRects('y', edgeCoord)}
  </svg>`;
  _cachedEast.set(edgeCoord, out);
  return out;
}
