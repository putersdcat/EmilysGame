/**
 * ancient-stone.ts — 48×48 seamless low-density rubble-stone texture.
 *
 * Contract:
 *   - IMAGE_SIZE = 48: one nominal nano-cube face after the 144 source-space refactor.
 *   - Opposite edge fragments are paired so a 48px repeat has no hard cut.
 *   - Tight warm-limestone palette only; variation is luminance/weathering, not chroma.
 *   - Low stone density: each 48px cell is a small patch of wall stone, not pebble wallpaper.
 */

export const IMAGE_SIZE = 48;

const MORTAR = '#675d4e';
const JOINT = 'rgba(48,43,36,0.30)';
const RIM_LIGHT = 'rgba(255,248,226,0.12)';
const RIM_DARK = 'rgba(45,40,34,0.12)';
const PIT = 'rgba(74,65,54,0.15)';

interface Stone {
  readonly id: number;
  readonly d: string;
  readonly cx: number;
  readonly cy: number;
  readonly sx: number;
  readonly sy: number;
}

function hash01(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt * 1442695041) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function fmt(v: number): string {
  return v.toFixed(2);
}

function fill(id: number): string {
  const d = (hash01(id, 0, 17) * 2 - 1) * 17;
  return `rgb(${clamp255(170 + d)},${clamp255(160 + d)},${clamp255(140 + d)})`;
}

function stones(): readonly Stone[] {
  return [
    // Five large interior/edge stones per 48px cell. At wall scale this gives
    // a natural rubble rhythm without collapsing into either brick courses or pebbles.
    { id: 1, cx: 13, cy: 11, sx: 14, sy: 11, d: 'M0,5 L12,1 L26,7 L24,18 L11,22 L0,17 Z' },
    { id: 2, cx: 36, cy: 12, sx: 13, sy: 11, d: 'M25,7 L38,2 L48,7 L48,20 L37,23 L26,18 Z' },
    { id: 3, cx: 23, cy: 27, sx: 17, sy: 13, d: 'M8,21 L23,16 L40,23 L36,36 L20,40 L7,32 Z' },
    { id: 4, cx: 6,  cy: 38, sx: 10, sy: 10, d: 'M0,31 L9,29 L18,36 L14,48 L0,48 Z' },
    { id: 5, cx: 38, cy: 40, sx: 13, sy: 10, d: 'M25,37 L40,31 L48,36 L48,48 L25,48 Z' },

    // Paired wrap fragments: left/right and top/bottom repeat calmly.
    { id: 6, cx: 0,  cy: 24, sx: 6, sy: 7, d: 'M0,19 L5,21 L7,27 L2,31 L0,31 Z' },
    { id: 7, cx: 48, cy: 24, sx: 6, sy: 7, d: 'M48,19 L43,21 L41,27 L46,31 L48,31 Z' },
    { id: 8, cx: 24, cy: 0,  sx: 8, sy: 4, d: 'M15,0 L22,5 L31,4 L36,0 Z' },
    { id: 9, cx: 24, cy: 48, sx: 8, sy: 4, d: 'M15,48 L22,43 L31,44 L36,48 Z' },
  ];
}

function weathering(s: Stone): string {
  const marks: string[] = [];
  for (let i = 0; i < 3; i++) {
    const a = hash01(s.id, i, 101) * Math.PI * 2;
    const x = s.cx + Math.cos(a) * s.sx * (hash01(s.id, i, 107) * 0.34);
    const y = s.cy + Math.sin(a) * s.sy * (hash01(s.id, i, 109) * 0.34);
    const rx = 0.72 + hash01(s.id, i, 113) * 1.10;
    const ry = 0.28 + hash01(s.id, i, 127) * 0.58;
    const rot = hash01(s.id, i, 131) * 180;
    marks.push(`<ellipse cx="${fmt(x)}" cy="${fmt(y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" transform="rotate(${fmt(rot)} ${fmt(x)} ${fmt(y)})" fill="${PIT}" />`);
  }
  return marks.join('\n    ');
}

function rim(s: Stone): string {
  const x1 = s.cx - s.sx * 0.36;
  const x2 = s.cx + s.sx * 0.32;
  const y = s.cy - s.sy * 0.40;
  const bottomY = s.cy + s.sy * 0.40;
  return `<path d="M${fmt(x1)},${fmt(y)} C${fmt(s.cx - s.sx * 0.08)},${fmt(y - 0.8)} ${fmt(s.cx + s.sx * 0.10)},${fmt(y - 0.7)} ${fmt(x2)},${fmt(y)}" fill="none" stroke="${RIM_LIGHT}" stroke-width="0.46" stroke-linecap="round" />
    <path d="M${fmt(x1 + 0.8)},${fmt(bottomY)} C${fmt(s.cx)},${fmt(bottomY + 0.6)} ${fmt(x2)},${fmt(bottomY + 0.3)} ${fmt(x2 + 1)},${fmt(bottomY)}" fill="none" stroke="${RIM_DARK}" stroke-width="0.36" stroke-linecap="round" />`;
}

function stonesMarkup(): string {
  return stones().map((s) => `<g>
    <path d="${s.d}" fill="${fill(s.id)}" stroke="${JOINT}" stroke-width="0.42" stroke-linejoin="round" />
    ${rim(s)}
    ${weathering(s)}
  </g>`).join('\n    ');
}

let _cached: string | null = null;

/** The full 48×48 SVG string. Cached — same reference every call. */
export function svg(): string {
  if (_cached) return _cached;
  _cached = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}">
    <rect width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" fill="${MORTAR}" />
    ${stonesMarkup()}
  </svg>`;
  return _cached;
}
