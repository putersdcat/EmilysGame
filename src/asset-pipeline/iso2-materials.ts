/**
 * iso2-materials.ts — material factories ported from experiment/isometric-2.0.
 *
 * These are the canonical 144×144 Iso 2.0 wall material sources used by the
 * main-game nano renderer. They intentionally mirror the experiment texture
 * contracts: tileable side/top slices with 48px structural modules.
 */

export { AncientStone, Limestone } from './iso2-materials-ancient-stone';

const SIZE = 144;
const MODULE = 48;
const MORTAR = 2;
const BRICK_H = 6;
const COURSE_PITCH = BRICK_H + MORTAR;
const BRICK_W = 22;
const BRICK_PITCH = BRICK_W + MORTAR;

interface BrickRun { readonly x: number; readonly w: number; readonly idx: number; }
interface BrickPaletteSpec {
  readonly mortar: string;
  readonly rBase: number; readonly gBase: number; readonly bBase: number;
  readonly rVar: number; readonly gVar: number; readonly bVar: number;
  readonly rMin: number; readonly gMin: number; readonly bMin: number;
  readonly rMax: number; readonly gMax: number; readonly bMax: number;
  readonly hi: readonly [number, number, number];
  readonly lo: readonly [number, number, number];
  readonly salt: number;
  readonly topOpacity?: number;
}

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, Math.round(v))); }
function mod(n: number, m: number): number { return ((n % m) + m) % m; }

function wrapCrisp(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">\n    ${body}\n  </svg>`;
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

function createBrickMaterial(spec: BrickPaletteSpec) {
  let cached = '';
  let cachedTop = '';
  let cachedTopV = '';
  let cachedEnd = '';

  function brickShade(course: number, idx: number): { fill: string; hi: string; lo: string } {
    const c = mod(course, MODULE / COURSE_PITCH);
    const i = mod(idx, MODULE / BRICK_PITCH);
    const hash = ((c * 7411) ^ (i * 5237) ^ spec.salt) >>> 0;
    const fr = ((hash) & 0xff) / 255 * 2 - 1;
    const fg = ((hash >> 8) & 0xff) / 255 * 2 - 1;
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
    const op = opacity < 1 ? ` opacity="${opacity}"` : '';
    for (const b of runsForCourse(courseCoord)) {
      const sh = brickShade(course, b.idx);
      out.push(`<rect x="${b.x}" y="${cy}" width="${b.w}" height="${BRICK_H}" fill="${sh.fill}"${op}/>`);
      out.push(`<rect x="${b.x}" y="${cy}" width="${b.w}" height="1" fill="${sh.hi}"${op}/>`);
      out.push(`<rect x="${b.x}" y="${cy + BRICK_H - 1}" width="${b.w}" height="1" fill="${sh.lo}"${op}/>`);
    }
  }

  function drawCourseV(out: string[], x: number, courseCoord: number, opacity = 1): void {
    const cx = x + 1;
    const course = Math.floor(courseCoord / COURSE_PITCH);
    const op = opacity < 1 ? ` opacity="${opacity}"` : '';
    for (const b of runsForCourse(courseCoord)) {
      const sh = brickShade(course, b.idx);
      out.push(`<rect x="${cx}" y="${b.x}" width="${BRICK_H}" height="${b.w}" fill="${sh.fill}"${op}/>`);
      out.push(`<rect x="${cx}" y="${b.x}" width="1" height="${b.w}" fill="${sh.hi}"${op}/>`);
      out.push(`<rect x="${cx + BRICK_H - 1}" y="${b.x}" width="1" height="${b.w}" fill="${sh.lo}"${op}/>`);
    }
  }

  function faceRows(startCoord: number, topCap = false): string {
    const out: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${spec.mortar}"/>`];
    const opacity = topCap ? spec.topOpacity ?? 1 : 1;
    for (let y = 0; y < SIZE; y += COURSE_PITCH) drawCourse(out, y, startCoord + y, opacity);
    return out.join('\n    ');
  }

  function faceCols(startCoord: number, topCap = false): string {
    const out: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${spec.mortar}"/>`];
    const opacity = topCap ? spec.topOpacity ?? 1 : 1;
    for (let x = 0; x < SIZE; x += COURSE_PITCH) drawCourseV(out, x, startCoord + x, opacity);
    return out.join('\n    ');
  }

  function endRows(startCoord: number): string {
    const out: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${spec.mortar}"/>`];
    for (let x = 1, idx = 0; x < SIZE; x += COURSE_PITCH, idx++) {
      const w = Math.min(BRICK_H, SIZE - x);
      const sh = brickShade(Math.floor(startCoord / COURSE_PITCH), idx);
      out.push(`<rect x="${x}" y="1" width="${w}" height="${BRICK_H}" fill="${sh.fill}"/>`);
      out.push(`<rect x="${x}" y="1" width="${w}" height="1" fill="${sh.hi}"/>`);
      out.push(`<rect x="${x}" y="${BRICK_H}" width="${w}" height="1" fill="${sh.lo}"/>`);
    }
    for (let y = COURSE_PITCH; y < SIZE; y += COURSE_PITCH) drawCourse(out, y, startCoord + y);
    return out.join('\n    ');
  }

  return {
    svg: () => cached || (cached = wrapCrisp(faceRows(0))),
    svgTop: () => cachedTop || (cachedTop = wrapCrisp(faceRows(0, true))),
    svgTopV: () => cachedTopV || (cachedTopV = wrapCrisp(faceCols(0, true))),
    svgSouth: () => wrapCrisp(faceRows(88)),
    svgEast: () => wrapCrisp(faceRows(88)),
    svgEnd: () => cachedEnd || (cachedEnd = wrapCrisp(endRows(88))),
  };
}

export const StoneBrick = createBrickMaterial({
  mortar: '#3a3835', rBase: 158, gBase: 158, bBase: 154,
  rVar: 18, gVar: 18, bVar: 16, rMin: 104, gMin: 104, bMin: 100,
  rMax: 204, gMax: 204, bMax: 200, hi: [22, 22, 22], lo: [26, 26, 26], salt: 0x570A3,
});

/** Red clinker — furnaces, brick ovens (experiment red-clinker.ts). */
export const RedClinker = createBrickMaterial({
  mortar: '#2a201c', rBase: 136, gBase: 55, bBase: 29,
  rVar: 24, gVar: 14, bVar: 9, rMin: 84, gMin: 30, bMin: 16,
  rMax: 188, gMax: 88, bMax: 52, hi: [28, 20, 12], lo: [28, 20, 14], salt: 0xC11A,
  topOpacity: 0.92,
});

/** Mud brick — huts, rural structures (experiment mud-brick.ts). */
export const MudBrick = createBrickMaterial({
  mortar: '#4a3325', rBase: 142, gBase: 92, bBase: 58,
  rVar: 22, gVar: 16, bVar: 12, rMin: 88, gMin: 54, bMin: 34,
  rMax: 188, gMax: 130, bMax: 88, hi: [24, 18, 12], lo: [24, 18, 12], salt: 0xAD0BE,
});

/** Sandstone brick — desert / arid biomes (experiment sandstone-brick.ts). */
export const SandstoneBrick = createBrickMaterial({
  mortar: '#6f5d3a', rBase: 188, gBase: 151, bBase: 86,
  rVar: 20, gVar: 18, bVar: 14, rMin: 132, gMin: 104, bMin: 58,
  rMax: 226, gMax: 196, bMax: 126, hi: [28, 24, 16], lo: [24, 22, 16], salt: 0x5A9D51,
});

function hash01(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function boardField(palette: readonly string[], seam: string, grain: string, salt: number, vertical: boolean): string {
  const parts: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${seam}"/>`];
  let pos = 0; let idx = 0;
  while (pos < SIZE) {
    const span = Math.min(SIZE - pos, 14 + Math.floor(hash01(idx, vertical ? 17 : 23, salt) * 10));
    const fill = palette[(idx + Math.floor(hash01(idx, salt, 91) * palette.length)) % palette.length]!;
    if (vertical) {
      parts.push(`<rect x="${pos + 1}" y="0" width="${Math.max(1, span - 2)}" height="${SIZE}" fill="${fill}"/>`);
      parts.push(`<rect x="${pos + 2}" y="0" width="1" height="${SIZE}" fill="rgba(255,255,255,0.14)"/>`);
      parts.push(`<rect x="${pos + span - 2}" y="0" width="1" height="${SIZE}" fill="rgba(0,0,0,0.16)"/>`);
    } else {
      parts.push(`<rect x="0" y="${pos + 1}" width="${SIZE}" height="${Math.max(1, span - 2)}" fill="${fill}"/>`);
      parts.push(`<rect x="0" y="${pos + 2}" width="${SIZE}" height="1" fill="rgba(255,255,255,0.14)"/>`);
      parts.push(`<rect x="0" y="${pos + span - 2}" width="${SIZE}" height="1" fill="rgba(0,0,0,0.16)"/>`);
    }
    for (let g = 0; g < 2; g++) {
      const p = pos + 3 + Math.floor(hash01(idx, g, salt + 101) * Math.max(2, span - 6));
      parts.push(vertical
        ? `<rect x="${p}" y="0" width="1" height="${SIZE}" fill="${grain}" opacity="0.18"/>`
        : `<rect x="0" y="${p}" width="${SIZE}" height="1" fill="${grain}" opacity="0.18"/>`);
    }
    pos += span; idx++;
  }
  return parts.join('\n    ');
}

function timberPanelField(): string {
  const parts: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="#d3c8b5"/>`];
  for (let y = 0; y < SIZE; y += 48) {
    for (let x = 0; x < SIZE; x += 48) {
      const beam = 5; const inset = 3; const panelX = x + inset; const panelY = y + inset;
      const panelW = 48 - inset * 2; const panelH = 48 - inset * 2;
      parts.push(`<rect x="${panelX + beam}" y="${panelY + beam}" width="${panelW - beam * 2}" height="${panelH - beam * 2}" fill="#d3c8b5"/>`);
      parts.push(`<rect x="${panelX}" y="${panelY}" width="${beam}" height="${panelH}" fill="#6f4c32"/>`);
      parts.push(`<rect x="${panelX + panelW - beam}" y="${panelY}" width="${beam}" height="${panelH}" fill="#6f4c32"/>`);
      parts.push(`<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${beam}" fill="#6f4c32"/>`);
      parts.push(`<rect x="${panelX}" y="${panelY + panelH - beam}" width="${panelW}" height="${beam}" fill="#6f4c32"/>`);
      const flip = ((x / 48 + y / 48) & 1) === 0;
      parts.push(`<line x1="${flip ? panelX + beam : panelX + panelW - beam}" y1="${panelY + panelH - beam}" x2="${flip ? panelX + panelW - beam : panelX + beam}" y2="${panelY + beam}" stroke="#6f4c32" stroke-width="4"/>`);
      parts.push(`<rect x="${panelX}" y="${panelY}" width="${panelW}" height="1" fill="#a57a53" opacity="0.5"/>`);
    }
  }
  return parts.join('\n    ');
}

export const TimberFrameWall = {
  svg: () => wrapCrisp(timberPanelField()),
  svgTop: () => wrapCrisp(boardField(['#8d633b', '#7d5632', '#9d7348'], '#5b3f27', 'rgba(54,35,21,0.22)', 9502, false)),
  svgTopV: () => wrapCrisp(boardField(['#8d633b', '#7d5632', '#9d7348'], '#5b3f27', 'rgba(54,35,21,0.22)', 9503, true)),
  svgSouth: () => wrapCrisp(timberPanelField()),
  svgEast: () => wrapCrisp(timberPanelField()),
  svgEnd: () => wrapCrisp(boardField(['#88613b', '#7a5532', '#967049'], '#5b3f27', 'rgba(54,35,21,0.22)', 9701, true)),
};

function ancientStoneBody(): string {
  const parts: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="#3a3634"/>`];
  for (let y = 0; y < SIZE; y += 28) {
    for (let x = 0; x < SIZE; x += 28) {
      const jx = (hash01(x, y, 4407) * 2 - 1) * 4;
      const jy = (hash01(y, x, 4411) * 2 - 1) * 4;
      const w = 22 + hash01(x, y, 4417) * 14;
      const h = 20 + hash01(y, x, 4421) * 16;
      const shade = 76 + Math.floor(hash01(x, y, 4427) * 36);
      parts.push(`<rect x="${(x + jx).toFixed(1)}" y="${(y + jy).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="rgb(${shade},${shade - 4},${shade - 7})" stroke="rgba(18,17,18,0.42)" stroke-width="1.1"/>`);
      parts.push(`<path d="M ${(x + jx + 3).toFixed(1)} ${(y + jy + 3).toFixed(1)} h ${(w * 0.45).toFixed(1)}" stroke="rgba(204,196,184,0.16)" stroke-width="1"/>`);
    }
  }
  return parts.join('\n    ');
}

export const DarkCathedralStone = {
  svg: () => wrapCrisp(ancientStoneBody()),
  svgTop: () => wrapCrisp(ancientStoneBody()),
  svgSouth: () => wrapCrisp(ancientStoneBody()),
  svgEast: () => wrapCrisp(ancientStoneBody()),
  svgEnd: () => wrapCrisp(ancientStoneBody()),
};
