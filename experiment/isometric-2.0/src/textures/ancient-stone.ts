/**
 * ancient-stone.ts — periodic 3D rubble-stone material slices.
 *
 * This is intentionally no longer just a 2D tile. The material is a periodic
 * 3D weighted Voronoi field. Each visible face asks for a different 2D slice:
 *   - top:   XY at wall-top height
 *   - south: XZ at the wall's front/south plane, with image-v = TOP_Z - worldZ
 *   - east:  YZ at the wall's right/east plane, with image-v = TOP_Z - worldZ
 *
 * All slices come from the same surface-coherent 3D seed set: stones are laid
 * out in periodic X/Y and given only shallow Z jitter near the wall top. That
 * makes a stone visible on the top face remain the same nearest seed as you
 * move down the adjacent side face, so ridges read as one rock wrapping around
 * the corner instead of unrelated interior stones taking over immediately.
 */

export const IMAGE_SIZE = 144;

const SIZE = IMAGE_SIZE;
const EPS = 1e-7;
const INSET = 0.54;
const GRID = 6;
const STEP = SIZE / GRID;

const TOP_Z = 48;
const SOUTH_Y = 96;
const EAST_X = 96;

const MORTAR = '#625848';
const JOINT = 'rgba(47,42,35,0.32)';
const SIDE_JOINT = 'rgba(52,46,38,0.20)';
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
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const staggerX = y % 2 === 0 ? 0 : STEP * 0.34;
      const staggerY = x % 2 === 0 ? 0 : STEP * 0.18;
      const jx = (hash01(x, y, 41) * 2 - 1) * 5.2;
      const jy = (hash01(x, y, 43) * 2 - 1) * 5.2;
      const jz = (hash01(x, y, 47) * 2 - 1) * 7.0;
      out.push({
        id,
        x: (x * STEP + STEP / 2 + staggerX + jx + SIZE) % SIZE,
        y: (y * STEP + STEP / 2 + staggerY + jy + SIZE) % SIZE,
        z: (TOP_Z + jz + SIZE) % SIZE,
      });
      id++;
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

function sideFill(id: number, course: number): string {
  const d = (hash01(id, course, 37) * 2 - 1) * (course === 0 ? 14 : 8);
  const shade = course === 0 ? 0 : -4;
  return `rgb(${clamp255(168 + shade + d)},${clamp255(158 + shade + d)},${clamp255(138 + shade + d)})`;
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

function nearestTopSeedId(u: number, plane: SlicePlane, planeCoord: number): number {
  const x = plane === 'xz' ? u : planeCoord;
  const y = plane === 'xz' ? planeCoord : u;
  let bestId = 1;
  let best = Number.POSITIVE_INFINITY;
  for (const seed of volumeSeeds()) {
    const dx = wrappedDelta(seed.x, x);
    const dy = wrappedDelta(seed.y, y);
    const dz = wrappedDelta(seed.z, TOP_Z);
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) { best = d; bestId = seed.id; }
  }
  return bestId;
}

interface Run { readonly id: number; readonly a: number; readonly b: number; }

function ridgeRuns(plane: SlicePlane, planeCoord: number): readonly Run[] {
  const raw: Run[] = [];
  let start = 0;
  let id = nearestTopSeedId(0, plane, planeCoord);
  for (let u = 1; u <= SIZE; u++) {
    const next = u === SIZE ? id : nearestTopSeedId(u, plane, planeCoord);
    if (next !== id || u === SIZE) {
      raw.push({ id, a: start, b: u });
      start = u;
      id = next;
    }
  }

  const merged: Run[] = [];
  for (const run of raw) {
    const prev = merged[merged.length - 1];
    if (prev && run.b - run.a < 7) {
      merged[merged.length - 1] = { id: prev.id, a: prev.a, b: run.b };
    } else {
      merged.push(run);
    }
  }
  return merged;
}

function blockPath(a: number, b: number, top: number, bottom: number, id: number, course: number): string {
  const jag = course === 0 ? 1.8 : 1.0;
  const n1 = (hash01(id, course, 401) * 2 - 1) * jag;
  const n2 = (hash01(id, course, 409) * 2 - 1) * jag;
  const n3 = (hash01(id, course, 419) * 2 - 1) * 1.4;
  const n4 = (hash01(id, course, 421) * 2 - 1) * 1.4;
  const mid = (a + b) / 2 + (hash01(id, course, 423) * 2 - 1) * Math.min(4.5, (b - a) * 0.18);
  if (course === 0 && b - a > 14) {
    return `M${fmt(a)},${fmt(top + n1)} L${fmt(mid)},${fmt(top + (hash01(id, course, 425) * 2 - 1) * jag)} L${fmt(b)},${fmt(top + n2)} L${fmt(b - 1.5)},${fmt(bottom + n3)} L${fmt(a + 1.2)},${fmt(bottom + n4)} Z`;
  }
  return `M${fmt(a)},${fmt(top + n1)} L${fmt(b)},${fmt(top + n2)} L${fmt(b - 1.2)},${fmt(bottom + n3)} L${fmt(a + 1.0)},${fmt(bottom + n4)} Z`;
}

function rubbleSideBlocks(planeCoord: number): readonly { id: number; a: number; b: number; top: number; bottom: number; course: number }[] {
  const out: { id: number; a: number; b: number; top: number; bottom: number; course: number }[] = [];
  const bands = [
    { course: 1, nominalTop: 18, nominalBottom: 33, widthSalt: 431 },
    { course: 2, nominalTop: 32, nominalBottom: 49, widthSalt: 457 },
  ];
  for (const band of bands) {
    let cursor = -((band.course * 17 + Math.round(planeCoord / 5)) % 29);
    let id = 700 + band.course * 100 + Math.round(planeCoord);
    while (cursor < SIZE) {
      const width = 15 + Math.floor(hash01(id, band.course, band.widthSalt) * 22);
      const a = Math.max(0, cursor + (hash01(id, band.course, 461) * 2 - 1) * 2.4);
      const b = Math.min(SIZE, cursor + width + (hash01(id, band.course, 463) * 2 - 1) * 2.4);
      const top = band.nominalTop + (hash01(id, band.course, 467) * 2 - 1) * 5.2;
      const bottom = band.nominalBottom + (hash01(id, band.course, 479) * 2 - 1) * 5.0;
      if (b - a > 7 && bottom - top > 8) out.push({ id, a, b, top, bottom, course: band.course });
      cursor += width * (0.80 + hash01(id, band.course, 487) * 0.22);
      id++;
    }
  }
  return out;
}

function sideSliceMarkup(plane: SlicePlane, planeCoord: number): string {
  const out: string[] = [];
  const topRuns = ridgeRuns(plane, planeCoord);
  for (const run of topRuns) {
    const bottom = 18 + hash01(run.id, 0, 443) * 8;
    out.push(`<path d="${blockPath(run.a, run.b, 0, bottom, run.id, 0)}" fill="${sideFill(run.id, 0)}" stroke="${JOINT}" stroke-width="0.34" stroke-linejoin="round" />`);
  }

  for (const block of rubbleSideBlocks(planeCoord)) {
    out.push(`<path d="${blockPath(block.a, block.b, block.top, block.bottom, block.id, block.course)}" fill="${sideFill(block.id, block.course)}" stroke="${SIDE_JOINT}" stroke-width="0.22" stroke-linejoin="round" />`);
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

  if (plane !== 'xy') {
    out.push(sideSliceMarkup(plane, planeCoord));

    const sideSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" fill="${MORTAR}" />
    ${out.join('\n    ')}
  </svg>`;
    _cache.set(key, sideSvg);
    return sideSvg;
  }

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

/** South/front vertical face: world X/Z slice at a wall-y plane. */
export function svgSouth(planeY: number = SOUTH_Y): string {
  return svgSlice('xz', planeY);
}

/** East/right vertical face: world Y/Z slice at a wall-x plane. */
export function svgEast(planeX: number = EAST_X): string {
  return svgSlice('yz', planeX);
}

/** Legacy/default texture entrypoint: top slice. */
export function svg(): string {
  return svgTop();
}
