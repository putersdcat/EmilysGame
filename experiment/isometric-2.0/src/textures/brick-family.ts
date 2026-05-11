/**
 * brick-family.ts — reusable 48×48 modular brick material factory.
 *
 * This centralizes the red-clinker brick geometry contract so other brick
 * palettes can reuse the same top/south/east/end face-slice behavior without
 * forking solver/render paths.
 */

export const BRICK_IMAGE_SIZE = 144;

const SIZE = BRICK_IMAGE_SIZE;
const MODULE = 48;
const MORTAR = 2;
const BRICK_H = 6;
const COURSE_PITCH = BRICK_H + MORTAR; // 8px, six courses per 48px module
const BRICK_W = 22;
const BRICK_PITCH = BRICK_W + MORTAR; // 24px, two bricks per 48px module

interface BrickRun { readonly x: number; readonly w: number; readonly idx: number; }

export interface BrickPaletteSpec {
  readonly mortar: string;
  readonly rBase: number;
  readonly gBase: number;
  readonly bBase: number;
  readonly rVar: number;
  readonly gVar: number;
  readonly bVar: number;
  readonly rMin: number;
  readonly gMin: number;
  readonly bMin: number;
  readonly rMax: number;
  readonly gMax: number;
  readonly bMax: number;
  readonly hi: readonly [number, number, number];
  readonly lo: readonly [number, number, number];
  readonly salt: number;
  readonly topOpacity?: number;
}

export interface BrickMaterial {
  readonly IMAGE_SIZE: typeof BRICK_IMAGE_SIZE;
  svg(): string;
  svgTop(): string;
  svgTopV(): string;
  svgSouth(edgeCoord?: number): string;
  svgEast(edgeCoord?: number): string;
  svgEnd(edgeCoord?: number): string;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
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

export function createBrickMaterial(spec: BrickPaletteSpec): BrickMaterial {
  let cached: string | null = null;
  let cachedTop: string | null = null;
  let cachedTopV: string | null = null;
  const cachedSouth = new Map<number, string>();
  const cachedEast = new Map<number, string>();
  const cachedEnd = new Map<number, string>();

  function brickShade(course: number, idx: number): { fill: string; hi: string; lo: string } {
    const c = mod(course, MODULE / COURSE_PITCH); // 0..5
    const i = mod(idx, MODULE / BRICK_PITCH);     // 0..1
    const hash = ((c * 7411) ^ (i * 5237) ^ spec.salt) >>> 0;
    const fr = ((hash      ) & 0xff) / 255 * 2 - 1;
    const fg = ((hash >>  8) & 0xff) / 255 * 2 - 1;
    const fb = ((hash >> 16) & 0xff) / 255 * 2 - 1;
    const r = clamp(spec.rBase + fr * spec.rVar, spec.rMin, spec.rMax);
    const g = clamp(spec.gBase + fg * spec.gVar, spec.gMin, spec.gMax);
    const b = clamp(spec.bBase + fb * spec.bVar, spec.bMin, spec.bMax);
    return {
      fill: `rgb(${r},${g},${b})`,
      hi: `rgb(${clamp(r + spec.hi[0], 0, 255)},${clamp(g + spec.hi[1], 0, 255)},${clamp(b + spec.hi[2], 0, 255)})`,
      lo: `rgb(${clamp(r - spec.lo[0], 0, 255)},${clamp(g - spec.lo[1], 0, 255)},${clamp(b - spec.lo[2], 0, 255)})`,
    };
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
    const out: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${spec.mortar}" />`];
    const opacity = topCap ? spec.topOpacity ?? 1 : 1;
    for (let y = 0; y < SIZE; y += COURSE_PITCH) drawCourse(out, y, startCoord + y, opacity);
    return out.join('\n    ');
  }

  function drawEndTopCourse(out: string[], courseCoord: number): void {
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
    const out: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${spec.mortar}" />`];
    drawEndTopCourse(out, startCoord);
    for (let y = COURSE_PITCH; y < SIZE; y += COURSE_PITCH) drawCourse(out, y, startCoord + y);
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
    const out: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${spec.mortar}" />`];
    const opacity = topCap ? spec.topOpacity ?? 1 : 1;
    for (let x = 0; x < SIZE; x += COURSE_PITCH) drawCourseV(out, x, startCoord + x, opacity);
    return out.join('\n    ');
  }

  function wrap(body: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">
    ${body}
  </svg>`;
  }

  return {
    IMAGE_SIZE: BRICK_IMAGE_SIZE,
    svg(): string {
      cached ??= wrap(faceRows(0));
      return cached;
    },
    svgTop(): string {
      cachedTop ??= wrap(faceRows(0, true));
      return cachedTop;
    },
    svgTopV(): string {
      cachedTopV ??= wrap(faceCols(0, true));
      return cachedTopV;
    },
    svgSouth(edgeCoord = 96): string {
      const cachedValue = cachedSouth.get(edgeCoord);
      if (cachedValue) return cachedValue;
      const out = wrap(faceRows(Math.max(0, edgeCoord - COURSE_PITCH)));
      cachedSouth.set(edgeCoord, out);
      return out;
    },
    svgEast(edgeCoord = 96): string {
      const cachedValue = cachedEast.get(edgeCoord);
      if (cachedValue) return cachedValue;
      const out = wrap(faceRows(Math.max(0, edgeCoord - COURSE_PITCH)));
      cachedEast.set(edgeCoord, out);
      return out;
    },
    svgEnd(edgeCoord = 96): string {
      const cachedValue = cachedEnd.get(edgeCoord);
      if (cachedValue) return cachedValue;
      const out = wrap(endRows(Math.max(0, edgeCoord - COURSE_PITCH)));
      cachedEnd.set(edgeCoord, out);
      return out;
    },
  };
}
