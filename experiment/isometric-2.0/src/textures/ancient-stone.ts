/**
 * ancient-stone.ts — 144×144 seamless periodic rubble-stone atlas.
 *
 * Research note: tileable procedural texture generators generally avoid
 * hand-matched borders. They build the texture on a torus instead: every
 * feature is evaluated against wrapped neighbor copies, so the left/right
 * and top/bottom boundaries are literally the same mathematical surface.
 *
 * This file uses that approach for ancient stone: a periodic Voronoi diagram
 * with warm-limestone grayscale variation. The atlas is 144px so it lines up
 * with one full micro tile (= 3 × 48px wall modules) rather than stamping the
 * same visible motif every single 48px cube face. Polygons are emitted for the
 * center tile and its wrapped copies, then SVG viewport clipping trims the
 * outside halves. Adjacent repeats draw the matching halves, eliminating the
 * hand-paired-edge seam failure.
 */

export const IMAGE_SIZE = 144;

const SIZE = IMAGE_SIZE;
const EPS = 1e-7;
const INSET = 0.56;

const MORTAR = '#625848';
const JOINT = 'rgba(47,42,35,0.32)';
const RIM_LIGHT = 'rgba(255,248,226,0.11)';
const PIT = 'rgba(73,64,53,0.15)';

interface Pt { readonly x: number; readonly y: number; }
interface Seed extends Pt { readonly id: number; }

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
  const d = (hash01(id, 0, 17) * 2 - 1) * 18;
  return `rgb(${clamp255(171 + d)},${clamp255(161 + d)},${clamp255(140 + d)})`;
}

function seeds(): readonly Seed[] {
  const out: Seed[] = [];
  let id = 1;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const stagger = row % 2 === 0 ? 0 : 12;
      const jx = Math.round((hash01(col, row, 41) * 2 - 1) * 5);
      const jy = Math.round((hash01(col, row, 43) * 2 - 1) * 5);
      out.push({
        id,
        x: (col * 24 + 12 + stagger + jx + SIZE) % SIZE,
        y: row * 24 + 12 + jy,
      });
      id++;
    }
  }
  return out;
}

function clip(poly: readonly Pt[], nx: number, ny: number, c: number): Pt[] {
  const out: Pt[] = [];
  if (poly.length === 0) return out;

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = nx * a.x + ny * a.y - c;
    const db = nx * b.x + ny * b.y - c;
    const aIn = da <= EPS;
    const bIn = db <= EPS;

    if (aIn && bIn) {
      out.push(b);
    } else if (aIn !== bIn) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      if (bIn) out.push(b);
    }
  }
  return out;
}

function torusCell(seed: Seed, all: readonly Seed[], wrapX: number, wrapY: number): Pt[] {
  const sx = seed.x + wrapX * SIZE;
  const sy = seed.y + wrapY * SIZE;
  let poly: Pt[] = [
    { x: -SIZE, y: -SIZE },
    { x: SIZE * 2, y: -SIZE },
    { x: SIZE * 2, y: SIZE * 2 },
    { x: -SIZE, y: SIZE * 2 },
  ];

  for (const other of all) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const oxp = other.x + ox * SIZE;
        const oyp = other.y + oy * SIZE;
        if (other.id === seed.id && Math.abs(oxp - sx) < EPS && Math.abs(oyp - sy) < EPS) continue;
        const nx = 2 * (oxp - sx);
        const ny = 2 * (oyp - sy);
        const c = oxp * oxp + oyp * oyp - sx * sx - sy * sy;
        poly = clip(poly, nx, ny, c);
        if (poly.length === 0) return poly;
      }
    }
  }
  return poly;
}

function inset(poly: readonly Pt[], toward: Pt): Pt[] {
  return poly.map((p) => {
    const dx = toward.x - p.x;
    const dy = toward.y - p.y;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    return { x: p.x + dx / len * INSET, y: p.y + dy / len * INSET };
  });
}

function points(poly: readonly Pt[]): string {
  return poly.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
}

function weathering(seed: Seed, wrapX: number, wrapY: number): string {
  const out: string[] = [];
  for (let i = 0; i < 2; i++) {
    const a = hash01(seed.id, i, 101) * Math.PI * 2;
    const x = seed.x + wrapX * SIZE + Math.cos(a) * (hash01(seed.id, i, 107) * 5.8);
    const y = seed.y + wrapY * SIZE + Math.sin(a) * (hash01(seed.id, i, 109) * 5.8);
    const rx = 0.62 + hash01(seed.id, i, 113) * 1.05;
    const ry = 0.26 + hash01(seed.id, i, 127) * 0.58;
    const rot = hash01(seed.id, i, 131) * 180;
    out.push(`<ellipse cx="${fmt(x)}" cy="${fmt(y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" transform="rotate(${fmt(rot)} ${fmt(x)} ${fmt(y)})" fill="${PIT}" />`);
  }
  return out.join('\n    ');
}

function rim(poly: readonly Pt[]): string {
  if (poly.length < 4) return '';
  let bestA = poly[0];
  let bestB = poly[1];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const score = a.y + b.y;
    if (score < bestScore) { bestScore = score; bestA = a; bestB = b; }
  }
  const lx1 = bestA.x * 0.72 + bestB.x * 0.28;
  const ly1 = bestA.y * 0.72 + bestB.y * 0.28;
  const lx2 = bestA.x * 0.25 + bestB.x * 0.75;
  const ly2 = bestA.y * 0.25 + bestB.y * 0.75;
  return `<line x1="${fmt(lx1)}" y1="${fmt(ly1)}" x2="${fmt(lx2)}" y2="${fmt(ly2)}" stroke="${RIM_LIGHT}" stroke-width="0.38" stroke-linecap="round" />`;
}

function stonesMarkup(): string {
  const s = seeds();
  const out: string[] = [];
  // Emit wrapped copies too. The SVG viewport clips to 0..48, and the next
  // repeated tile clips the same polygon's opposite half.
  for (let wy = -1; wy <= 1; wy++) {
    for (let wx = -1; wx <= 1; wx++) {
      for (const seed of s) {
        const center = { x: seed.x + wx * SIZE, y: seed.y + wy * SIZE };
        const poly = inset(torusCell(seed, s, wx, wy), center);
        if (poly.length < 3) continue;
        if (!poly.some((p) => p.x >= -1 && p.x <= SIZE + 1 && p.y >= -1 && p.y <= SIZE + 1)) continue;
        out.push(`<g>
    <polygon points="${points(poly)}" fill="${fill(seed.id)}" stroke="${JOINT}" stroke-width="0.38" stroke-linejoin="round" />
    ${rim(poly)}
    ${weathering(seed, wx, wy)}
  </g>`);
      }
    }
  }
  return out.join('\n    ');
}

let _cached: string | null = null;

/** The full 48×48 SVG string. Cached — same reference every call. */
export function svg(): string {
  if (_cached) return _cached;
  _cached = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" fill="${MORTAR}" />
    ${stonesMarkup()}
  </svg>`;
  return _cached;
}
