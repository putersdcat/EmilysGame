/**
 * ancient-stone.ts — periodic 3D rubble-stone material slices.
 *
 * This is intentionally no longer just a 2D tile. The material is a periodic
 * 3D weighted Voronoi field. Each visible face asks for a different 2D slice:
 *   - top:   XY at wall-top height
 *   - south: XZ at the wall's front/south plane, with image-v = TOP_Z - worldZ
 *   - east:  YZ at the wall's right/east plane, with image-v = TOP_Z - worldZ
 *
 * All slices come from the same 3D seed volume, so future procedural materials
 * can use this same top/south/east pattern instead of hand-pairing 2D borders.
 */

export const IMAGE_SIZE = 144;

const SIZE = IMAGE_SIZE;
const EPS = 1e-7;
const INSET = 0.54;
const GRID = 5;
const STEP = SIZE / GRID;

const TOP_Z = 48;
const SOUTH_Y = 96;
const EAST_X = 96;

const MORTAR = '#625848';
const JOINT = 'rgba(47,42,35,0.32)';
const RIM_LIGHT = 'rgba(255,248,226,0.10)';
const PIT = 'rgba(73,64,53,0.14)';

interface Pt { readonly x: number; readonly y: number; }
interface Seed3 { readonly id: number; readonly x: number; readonly y: number; readonly z: number; }
interface SliceSeed extends Pt { readonly id: number; readonly weight: number; }
type SlicePlane = 'xy' | 'xz' | 'yz';

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

function wrappedDelta(a: number, b: number): number {
  let d = a - b;
  if (d > SIZE / 2) d -= SIZE;
  if (d < -SIZE / 2) d += SIZE;
  return d;
}

function volumeSeeds(): readonly Seed3[] {
  const out: Seed3[] = [];
  let id = 1;
  for (let z = 0; z < GRID; z++) {
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const staggerX = (y + z) % 2 === 0 ? 0 : STEP * 0.34;
        const staggerY = (x + z) % 2 === 0 ? 0 : STEP * 0.22;
        const jx = (hash01(x + z * 17, y, 41) * 2 - 1) * 5.8;
        const jy = (hash01(x, y + z * 19, 43) * 2 - 1) * 5.8;
        const jz = (hash01(x + y * 13, z, 47) * 2 - 1) * 5.8;
        out.push({
          id,
          x: (x * STEP + STEP / 2 + staggerX + jx + SIZE) % SIZE,
          y: (y * STEP + STEP / 2 + staggerY + jy + SIZE) % SIZE,
          z: (z * STEP + STEP / 2 + jz + SIZE) % SIZE,
        });
        id++;
      }
    }
  }
  return out;
}

function projectSeed(seed: Seed3, plane: SlicePlane, planeCoord: number): SliceSeed {
  if (plane === 'xy') {
    const dz = wrappedDelta(seed.z, planeCoord);
    return { id: seed.id, x: seed.x, y: seed.y, weight: dz * dz };
  }
  if (plane === 'xz') {
    const dy = wrappedDelta(seed.y, planeCoord);
    return { id: seed.id, x: seed.x, y: (TOP_Z - seed.z + SIZE) % SIZE, weight: dy * dy };
  }
  const dx = wrappedDelta(seed.x, planeCoord);
  return { id: seed.id, x: seed.y, y: (TOP_Z - seed.z + SIZE) % SIZE, weight: dx * dx };
}

function fill(id: number): string {
  const d = (hash01(id, 0, 17) * 2 - 1) * 18;
  return `rgb(${clamp255(171 + d)},${clamp255(161 + d)},${clamp255(140 + d)})`;
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

function sliceCell(seed: SliceSeed, all: readonly SliceSeed[], wrapX: number, wrapY: number): Pt[] {
  const sx = seed.x + wrapX * SIZE;
  const sy = seed.y + wrapY * SIZE;
  let poly: Pt[] = [
    { x: -SIZE, y: -SIZE },
    { x: SIZE * 2, y: -SIZE },
    { x: SIZE * 2, y: SIZE * 2 },
    { x: -SIZE, y: SIZE * 2 },
  ];

  const selfPower = sx * sx + sy * sy + seed.weight;
  for (const other of all) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const oxp = other.x + ox * SIZE;
        const oyp = other.y + oy * SIZE;
        if (other.id === seed.id && Math.abs(oxp - sx) < EPS && Math.abs(oyp - sy) < EPS) continue;
        const nx = 2 * (oxp - sx);
        const ny = 2 * (oyp - sy);
        const c = oxp * oxp + oyp * oyp + other.weight - selfPower;
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

function weathering(seed: SliceSeed, wrapX: number, wrapY: number): string {
  const out: string[] = [];
  for (let i = 0; i < 2; i++) {
    const a = hash01(seed.id, i, 101) * Math.PI * 2;
    const x = seed.x + wrapX * SIZE + Math.cos(a) * (hash01(seed.id, i, 107) * 5.2);
    const y = seed.y + wrapY * SIZE + Math.sin(a) * (hash01(seed.id, i, 109) * 5.2);
    const rx = 0.58 + hash01(seed.id, i, 113) * 0.95;
    const ry = 0.24 + hash01(seed.id, i, 127) * 0.54;
    const rot = hash01(seed.id, i, 131) * 180;
    out.push(`<ellipse cx="${fmt(x)}" cy="${fmt(y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" transform="rotate(${fmt(rot)} ${fmt(x)} ${fmt(y)})" fill="${PIT}" />`);
  }
  return out.join('\n    ');
}

function rim(poly: readonly Pt[]): string {
  if (poly.length < 4) return '';
  let a = poly[0];
  let b = poly[1];
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const score = p.y + q.y;
    if (score < best) { best = score; a = p; b = q; }
  }
  const x1 = a.x * 0.72 + b.x * 0.28;
  const y1 = a.y * 0.72 + b.y * 0.28;
  const x2 = a.x * 0.25 + b.x * 0.75;
  const y2 = a.y * 0.25 + b.y * 0.75;
  return `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${RIM_LIGHT}" stroke-width="0.36" stroke-linecap="round" />`;
}

const _cache = new Map<string, string>();

function svgSlice(plane: SlicePlane, planeCoord: number): string {
  const key = `${plane}:${planeCoord}`;
  const cached = _cache.get(key);
  if (cached) return cached;

  const seeds = volumeSeeds().map((s) => projectSeed(s, plane, planeCoord));
  const out: string[] = [];

  for (let wy = -1; wy <= 1; wy++) {
    for (let wx = -1; wx <= 1; wx++) {
      for (const seed of seeds) {
        const center = { x: seed.x + wx * SIZE, y: seed.y + wy * SIZE };
        const poly = inset(sliceCell(seed, seeds, wx, wy), center);
        if (poly.length < 3) continue;
        if (!poly.some((p) => p.x >= -1 && p.x <= SIZE + 1 && p.y >= -1 && p.y <= SIZE + 1)) continue;
        out.push(`<g>
    <polygon points="${points(poly)}" fill="${fill(seed.id)}" stroke="${JOINT}" stroke-width="0.34" stroke-linejoin="round" />
    ${rim(poly)}
    ${weathering(seed, wx, wy)}
  </g>`);
      }
    }
  }

  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" fill="${MORTAR}" />
    ${out.join('\n    ')}
  </svg>`;
  _cache.set(key, svgText);
  return svgText;
}

/** Top horizontal face: world X/Y slice at wall-top height. */
export function svgTop(): string {
  return svgSlice('xy', TOP_Z);
}

/** South/front vertical face: world X/Z slice at the nominal south wall plane. */
export function svgSouth(): string {
  return svgSlice('xz', SOUTH_Y);
}

/** East/right vertical face: world Y/Z slice at the nominal east wall plane. */
export function svgEast(): string {
  return svgSlice('yz', EAST_X);
}

/** Legacy/default texture entrypoint: top slice. */
export function svg(): string {
  return svgTop();
}
