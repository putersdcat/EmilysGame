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
 * - Solid mortar background (showing through the inset gaps), tinted a
 *   muted warm brown rather than near-black so gaps read as recessed
 *   joint, not void.
 * - Each stone is filled by picking one of several WEATHERING CLASSES
 *   (limestone / pale lime / damp / iron-stained / mossy) deterministically
 *   per lattice cell, then jittering within that class's variance band.
 *   This gives the wall the look of mixed-quarry rubble masonry where
 *   most stones share a tone but a minority of weathered, mossy, or
 *   stained stones break up the field.
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

// Lattice & jitter knobs.
//
// SCALE — sized to the game's nano-tile grid, NOT the source-image
// pixel grid. A micro tile is MICRO_TILE_SIZE=128 px subdivided into a
// 3x3 nano overlay, so one nano tile is 128/3 ≈ 42.7 px wide. We want
// roughly 4 stones across each nano unit (i.e. several stones per
// nano), which means ~12 stones across the 128 px source image.
// GRID=12 gives SPACING ≈ 10.67 px and ~144 stones per tile — small
// natural cobbles, not boulders.
//
// JITTER below half-spacing keeps cells reasonably convex (avoids
// slivers and self-intersections in the bisector clip).
const GRID    = 12;
const SPACING = IMAGE_SIZE / GRID;       // ~10.67
const JITTER  = SPACING * 0.34;          // ~3.6 px max axial jitter (slightly tighter to avoid sliver cells)
const INSET   = 0.40;                    // mortar half-width in px — narrow enough that small cells don't collapse to all-mortar voids

const MORTAR_FILL    = '#5a4f42';        // warm mid-brown joint, never reads as black
const RIM_HIGHLIGHT  = 'rgba(255,240,220,0.20)';

// Per-stone weathering classes. Each lattice cell deterministically picks
// one class via rng01(i,j,7); class probabilities sum to 1.0. The base
// limestone palette dominates so the wall reads as one material, with a
// minority of weathered stones giving the wall life.
//
// (R,G,B) base + per-channel variance. Variance is wider than the v1
// palette (which used ±22/20/18) so even "limestone" stones show
// noticeable hue spread — reads as individually quarried blocks rather
// than a tinted block of a single colour.
interface StoneClass {
  weight: number;     // selection weight (cumulative threshold below)
  rb: number; gb: number; bb: number;   // base RGB
  rv: number; gv: number; bv: number;   // per-channel variance
}
const STONE_CLASSES: readonly StoneClass[] = [
  // Warm limestone — the dominant tone (~62% of stones).
  { weight: 0.62, rb: 178, gb: 164, bb: 138, rv: 24, gv: 22, bv: 20 },
  // Pale weather-bleached lime (~16%) — sun-faded, brightest.
  { weight: 0.16, rb: 204, gb: 192, bb: 170, rv: 16, gv: 16, bv: 16 },
  // Mid-warm sandstone (~14%) — fills the role the old "damp" class played
  // but stays in the readable mid-tone band so it doesn't punch holes in
  // the wall at distance.
  { weight: 0.14, rb: 148, gb: 130, bb: 104, rv: 18, gv: 18, bv: 16 },
  // Iron-stained / rust-touched (~6%) — warm rosy ochre.
  { weight: 0.06, rb: 168, gb: 122, bb:  92, rv: 18, gv: 14, bv: 12 },
  // Mossy / lichen-greened (~2%) — olive-green tint, rare accent.
  { weight: 0.02, rb: 128, gb: 142, bb:  96, rv: 16, gv: 18, bv: 14 },
];
// Cumulative thresholds for the picker. Computed once at module load.
const STONE_CUM: readonly number[] = (() => {
  const out: number[] = [];
  let acc = 0;
  for (const c of STONE_CLASSES) { acc += c.weight; out.push(acc); }
  return out;
})();

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

/** Stone fill colour, deterministic per lattice cell. Picks one of the
 *  STONE_CLASSES weather classes, then jitters within that class's
 *  variance band. */
function stoneFill(i: number, j: number): string {
  // Class pick: deterministic 0..1 against the cumulative weights.
  const pick = rng01(i, j, 7);
  let cls = STONE_CLASSES[STONE_CLASSES.length - 1];
  for (let k = 0; k < STONE_CUM.length; k++) {
    if (pick < STONE_CUM[k]) { cls = STONE_CLASSES[k]; break; }
  }
  const fr = rng01(i, j, 11) * 2 - 1;
  const fg = rng01(i, j, 13) * 2 - 1;
  const fb = rng01(i, j, 17) * 2 - 1;
  const r = Math.max(0, Math.min(255, cls.rb + Math.round(fr * cls.rv)));
  const g = Math.max(0, Math.min(255, cls.gb + Math.round(fg * cls.gv)));
  const b = Math.max(0, Math.min(255, cls.bb + Math.round(fb * cls.bv)));
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

/** Centroid of a polygon (vertex average — sufficient for the modestly
 *  jittered convex cells we produce here). */
function centroid(poly: Pt[]): Pt {
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p.x; cy += p.y; }
  return { x: cx / poly.length, y: cy / poly.length };
}

/** Approximate inscribed-circle radius for spec placement: half the
 *  shortest centroid-to-vertex distance. Conservative — keeps specks
 *  well inside the inset polygon so they never spill onto mortar. */
function safeRadius(poly: Pt[], c: Pt): number {
  let minD = Infinity;
  for (const p of poly) {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < minD) minD = d;
  }
  return minD * 0.55;
}

/** Per-stone surface flecks (chips, mineral inclusions, weather pits).
 *  Adds 2-4 small ellipses inside the polygon at deterministic positions,
 *  each shaded slightly darker or lighter than the base fill. Renders as
 *  ~2-3 px features that read as stone grain at the texture's natural
 *  scale, without pushing the file size or path count up much. */
function speckMarkup(i: number, j: number, poly: Pt[], baseFill: string): string {
  if (poly.length < 3) return '';
  const c = centroid(poly);
  const rMax = safeRadius(poly, c);
  if (rMax < 1.2) return '';   // cell too small to host visible specks

  // Parse base fill back to RGB so we can shift it by a small delta.
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(baseFill);
  if (!m) return '';
  const baseR = +m[1], baseG = +m[2], baseB = +m[3];

  // Speck count: 2-4 specks per stone, more on bigger stones.
  const count = 2 + Math.floor(rng01(i, j, 31) * (rMax > 3 ? 3 : 2));

  let out = '';
  for (let k = 0; k < count; k++) {
    // Polar offset within safe radius. Independent rngs for r, theta, shade.
    const r     = Math.sqrt(rng01(i, j, 41 + k)) * rMax;     // sqrt → uniform-area distribution
    const theta = rng01(i, j, 53 + k) * Math.PI * 2;
    const sx = c.x + Math.cos(theta) * r;
    const sy = c.y + Math.sin(theta) * r;

    // Speck size: 0.4..1.1 px radius — small enough to read as grain
    // not as another stone.
    const sr = 0.4 + rng01(i, j, 67 + k) * 0.7;

    // Shade delta: ±18 luminance shift, deterministic. Slightly biased
    // dark (brighter k=0) so the average stone looks "specked with
    // pepper" rather than pure salt+pepper noise.
    const shadeRaw = rng01(i, j, 79 + k);
    const delta = (shadeRaw - 0.55) * 36;     // [-19.8 .. +16.2]
    const sR = Math.max(0, Math.min(255, baseR + delta));
    const sG = Math.max(0, Math.min(255, baseG + delta));
    const sB = Math.max(0, Math.min(255, baseB + delta));
    const opacity = 0.55 + rng01(i, j, 89 + k) * 0.35;       // 0.55..0.90

    out += `<circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="${fmt(sr)}" fill="rgb(${Math.round(sR)},${Math.round(sG)},${Math.round(sB)})" fill-opacity="${opacity.toFixed(2)}" />`;
  }
  return out;
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
      // Stroke width scaled to stone size so it reads as a thin rim,
      // not a thick outline that swallows tiny cells.
      out.push(`<polygon points="${pts}" fill="${fill}" stroke="${RIM_HIGHLIGHT}" stroke-width="0.25" />`);
      // Per-stone specks layered ON TOP of the polygon fill so they sit
      // inside the stone face. They never spill onto mortar because
      // safeRadius() keeps them inside the polygon's inscribed circle.
      const specks = speckMarkup(i, j, inset, fill);
      if (specks) out.push(specks);
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
