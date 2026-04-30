/**
 * ancient-stone.ts — Irregular natural-stone wall texture.
 *
 * This is a **Voronoi tessellation** of jittered points on a torus,
 * not a brick grid. Stones are non-uniform polygons of varying shapes
 * and sizes, packed without gaps, with a thin dark mortar joint
 * between every pair of adjacent stones.
 *
 * ─── Why this still self-tiles (the hard part) ───────────────────────
 *
 * The texture must repeat seamlessly under createPattern (textures/
 * README.md). For a brick texture, that's easy — the brick rows are
 * placed at integer multiples of a known pitch and the seam-spanning
 * half-brick trick handles the rest.
 *
 * For irregular polygons there is no row pitch to align. The fix:
 *
 *   1. Generator points live on a regular GRID×GRID lattice indexed by
 *      (i, j) ∈ [0, GRID). Each point's jitter is a deterministic hash
 *      of (i mod GRID, j mod GRID), so the lattice is *periodic* — the
 *      adjacent tile's point at index (0, j) sits at the same world
 *      position as this tile's wrapped (GRID, j).
 *
 *   2. To compute the Voronoi cell of any generator P, we clip the
 *      128×128 square against the perpendicular bisector of P and
 *      every OTHER generator, INCLUDING its 8 periodic copies in the
 *      surrounding torus tiles. So a cell on the right edge of this
 *      tile and the partner cell on the left edge of the next tile
 *      were both clipped against the same set of bisectors and meet
 *      flush along the same line.
 *
 *   3. SVG's default `overflow:hidden` on the root <svg> clips the
 *      half of any seam-straddling polygon that pokes out of [0,128].
 *      The other half is drawn by the adjacent tile as part of its
 *      own (in-view) polygon. The two halves together form one stone
 *      with no double-draw and no visible seam line.
 *
 * ─── Visual approach ────────────────────────────────────────────────
 *
 * - Solid dark mortar background (showing through the inset gaps).
 * - Each stone filled with a deterministic grey-tan in the ancient-
 *   limestone family; per-stone hue jitter is wide enough to read as
 *   "individually quarried blocks" rather than a tinted palette.
 * - A subtle 0.5 px highlight stroke on the polygon perimeter gives
 *   each stone a chiseled rim. (Top-light fakery via per-edge
 *   shading was considered and skipped — Voronoi polygons have many
 *   short edges and the per-edge brightness becomes noisy. The flat
 *   rim plus mortar shadow reads as carved well enough.)
 * - Polygons are inset by INSET px toward their centroid, which
 *   creates the mortar gap. Because cells are convex and the inset
 *   is small relative to the average edge length, this is visually
 *   indistinguishable from a true skeletal-offset inset.
 *
 * @see textures/README.md — module contract.
 * @see textures/stone-brick.ts, textures/red-clinker.ts — sibling
 *      brick textures with the same export shape.
 */

export const IMAGE_SIZE = 128;

// Lattice & jitter knobs. 5×5 = 25 stones at ~25.6 px spacing reads as
// chunky-but-not-cartoonish ancient masonry. JITTER below half-spacing
// keeps cells reasonably convex (avoids slivers and self-intersections).
const GRID    = 5;
const SPACING = IMAGE_SIZE / GRID;       // 25.6
const JITTER  = SPACING * 0.38;          // ~9.7 px max axial jitter
const INSET   = 1.1;                     // mortar half-width in px

const MORTAR_FILL    = '#262019';
const RIM_HIGHLIGHT  = 'rgba(255,240,220,0.18)';

// Per-channel base + variance for the stone fill. Warm limestone
// greys with a tan tint — neither cold-grey concrete nor brick-red.
const R_BASE = 158, R_VAR = 22;
const G_BASE = 148, G_VAR = 20;
const B_BASE = 128, B_VAR = 18;

interface Pt { x: number; y: number; }

/** Deterministic 0..1 hash. Inputs reduced mod GRID before hashing so
 *  periodic copies of the same lattice cell map to the same value. */
function rng01(i: number, j: number, salt: number): number {
  const ii = ((i % GRID) + GRID) % GRID;
  const jj = ((j % GRID) + GRID) % GRID;
  const h = ((ii * 73856093) ^ (jj * 19349663) ^ (salt * 83492791)) >>> 0;
  return (h & 0xffff) / 0xffff;
}

/** Lattice generator point at index (i, j). Periodic in both axes. */
function point(i: number, j: number): Pt {
  const x = (i + 0.5) * SPACING + (rng01(i, j, 1) - 0.5) * 2 * JITTER;
  const y = (j + 0.5) * SPACING + (rng01(i, j, 2) - 0.5) * 2 * JITTER;
  return { x, y };
}

/** Sutherland-Hodgman clip of `poly` by the half-plane `closer to a
 *  than to b`. Returns the kept (a-side) portion. */
function bisectorClip(poly: Pt[], a: Pt, b: Pt): Pt[] {
  if (poly.length === 0) return poly;
  // The bisector is the set of points equidistant to a and b.
  // A point p is on a's side iff (p - mid) · (a - b) >= 0.
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = a.x - b.x, dy = a.y - b.y;
  const sideOf = (p: Pt) => (p.x - mx) * dx + (p.y - my) * dy;

  const out: Pt[] = [];
  for (let k = 0; k < poly.length; k++) {
    const cur = poly[k];
    const nxt = poly[(k + 1) % poly.length];
    const sCur = sideOf(cur);
    const sNxt = sideOf(nxt);
    if (sCur >= 0) out.push(cur);
    if ((sCur >= 0) !== (sNxt >= 0)) {
      // Edge crosses the bisector — emit the intersection point.
      const t = sCur / (sCur - sNxt);
      out.push({ x: cur.x + t * (nxt.x - cur.x), y: cur.y + t * (nxt.y - cur.y) });
    }
  }
  return out;
}

/** Inset `poly` by `d` px toward its centroid. Centroid-inset is an
 *  approximation of the true skeletal offset; it is exact for regular
 *  polygons and near-exact for the modestly-jittered convex cells we
 *  produce here. */
function insetPoly(poly: Pt[], d: number): Pt[] {
  if (poly.length < 3) return poly;
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p.x; cy += p.y; }
  cx /= poly.length; cy /= poly.length;
  return poly.map(p => {
    const vx = cx - p.x, vy = cy - p.y;
    const len = Math.hypot(vx, vy) || 1;
    return { x: p.x + (vx / len) * d, y: p.y + (vy / len) * d };
  });
}

/** Stone fill colour, deterministic per lattice cell. */
function stoneFill(i: number, j: number): string {
  const fr = rng01(i, j, 11) * 2 - 1;
  const fg = rng01(i, j, 13) * 2 - 1;
  const fb = rng01(i, j, 17) * 2 - 1;
  const r = Math.max(0, Math.min(255, R_BASE + Math.round(fr * R_VAR)));
  const g = Math.max(0, Math.min(255, G_BASE + Math.round(fg * G_VAR)));
  const b = Math.max(0, Math.min(255, B_BASE + Math.round(fb * B_VAR)));
  return `rgb(${r},${g},${b})`;
}

/** Build the Voronoi cell polygon for lattice cell (i, j) by clipping
 *  the [0, IMAGE_SIZE]² square against the perpendicular bisector of
 *  this cell's generator and EVERY other generator's 9 periodic copies. */
function cellPolygon(i: number, j: number): Pt[] {
  const a = point(i, j);
  // Start with a square slightly larger than the tile so cells that
  // would extend past the seam still get computed correctly; the SVG
  // viewBox crop trims the visible portion.
  let poly: Pt[] = [
    { x: -SPACING, y: -SPACING },
    { x: IMAGE_SIZE + SPACING, y: -SPACING },
    { x: IMAGE_SIZE + SPACING, y: IMAGE_SIZE + SPACING },
    { x: -SPACING, y: IMAGE_SIZE + SPACING },
  ];
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      for (let bj = 0; bj < GRID; bj++) {
        for (let bi = 0; bi < GRID; bi++) {
          if (di === 0 && dj === 0 && bi === i && bj === j) continue;
          // Periodic image of generator (bi, bj) shifted by (di, dj) tiles.
          const base = point(bi, bj);
          const b: Pt = { x: base.x + di * IMAGE_SIZE, y: base.y + dj * IMAGE_SIZE };
          poly = bisectorClip(poly, a, b);
          if (poly.length === 0) return poly;
        }
      }
    }
  }
  return poly;
}

function fmt(v: number): string {
  // 2-decimal floats keep the SVG compact and well within sub-pixel
  // accuracy for a 128 px raster.
  return v.toFixed(2);
}

function polygonsMarkup(): string {
  const out: string[] = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const raw = cellPolygon(i, j);
      if (raw.length < 3) continue;
      const inset = insetPoly(raw, INSET);
      const pts = inset.map(p => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
      const fill = stoneFill(i, j);
      out.push(`<polygon points="${pts}" fill="${fill}" stroke="${RIM_HIGHLIGHT}" stroke-width="0.5" />`);
    }
  }
  return out.join('\n    ');
}

let _cached: string | null = null;

/** The full 128×128 SVG string. Cached — same reference every call. */
export function svg(): string {
  if (_cached) return _cached;
  _cached = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}">
    <rect width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" fill="${MORTAR_FILL}" />
    ${polygonsMarkup()}
  </svg>`;
  return _cached;
}
