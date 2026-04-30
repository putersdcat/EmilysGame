/**
 * ancient-stone.ts — Irregular natural-stone wall texture.
 *
 * Voronoi tessellation of D4-symmetric jittered points on a 48×48 torus.
 * 48 px = one nano cell = MICRO_TILE_SIZE / NANO_GRID. The texture
 * tiles 3×3 across each micro tile via createPattern.
 *
 * ─── D4 symmetry — why all four edges mate with each other ───────────
 *
 * The generator set is invariant under the dihedral group D4 (rotation
 * by 90° + reflection about both axes and both diagonals, all centered
 * on (24, 24)). Because the Voronoi diagram of a D4-invariant point set
 * is itself D4-invariant, the resulting texture has the property that
 *
 *     left edge ≡ top edge ≡ right edge ≡ bottom edge
 *
 * (each is a 90°-rotated copy of the others). So:
 *
 *   1. Standard self-tiling: left=right and top=bottom by periodicity.
 *   2. Cross-rotation seamlessness: the side faces of a wall draw the
 *      same pattern image as the top face but rotated 90° (see the
 *      pattern-transform logic in nano-tile.ts). With D4 symmetry the
 *      rotated and unrotated views are statistically indistinguishable
 *      at any edge — there is no "fold seam" at the side↔top boundary.
 *   3. Inter-tile rotation: any 48×48 nano cell can sit next to any
 *      other in any of the 4 axis-aligned rotations and the boundary
 *      remains continuous.
 *
 * ─── Tessellation construction ──────────────────────────────────────
 *
 *   1. Generators are placed in D4 orbits about the cell center (24,24):
 *        • 1 fixed center point
 *        • 1 diagonal orbit of size 4   (on the y=x lines)
 *        • 1 axis orbit of size 4       (on the x=24 / y=24 lines)
 *        • 1 generic orbit of size 8    (off all symmetry axes)
 *      Total: 17 stones per 48×48 tile, mean diameter ≈ 12 px.
 *
 *   2. To compute the Voronoi cell of any generator P, we clip a
 *      generously-oversized starting square against the perpendicular
 *      bisector of P and every OTHER generator, INCLUDING its 8
 *      periodic copies in the surrounding torus tiles. Adjacent tiles
 *      get the same set of bisectors so cells straddling a seam meet
 *      flush.
 *
 *   3. SVG's default viewport clipping trims the half of any
 *      seam-straddling polygon that pokes outside [0, 48]; the other
 *      half is drawn by the next tile. The two halves form one stone.
 *
 * ─── Visual approach ────────────────────────────────────────────────
 *
 * Single tight warm-limestone palette — no class system, no near-black
 * tones. Each stone is base ± 18 luminance, all channels shifted by the
 * same delta so the variation is grayscale (within a warm-tan family),
 * not chromatic. This is what makes mismatched-rotation tile boundaries
 * invisible: there is no green-stone-meets-red-stone failure mode
 * because every stone is the same color family.
 *
 * Per-stone speckle adds 2-3 small ellipses inside each polygon at
 * deterministic positions, all grayscale luminance shifts, for a
 * "weathered grain" look without breaking the palette.
 *
 * Mortar is a warm dark brown (#3a322a) — visible but not void-black.
 *
 * @see textures/README.md — module contract.
 * @see textures/stone-brick.ts, textures/red-clinker.ts — sibling
 *      brick textures with the same export shape.
 */

export const IMAGE_SIZE = 48;

const CENTER = IMAGE_SIZE / 2;     // 24 — D4 fixed point

const INSET   = 0.50;              // mortar half-width
const MORTAR_FILL    = '#3a322a';  // warm dark brown
const RIM_HIGHLIGHT  = 'rgba(255,240,220,0.18)';

// Single tight warm-limestone palette. All stones are within
// (BASE ± LUMA_VARIANCE) per channel, with the SAME delta applied to
// all 3 channels so variation stays grayscale (no chromatic drift).
const BASE_R = 172;
const BASE_G = 158;
const BASE_B = 134;
const LUMA_VARIANCE = 18;

interface Pt { x: number; y: number; }

/** Deterministic 0..1 hash from an integer key + salt. */
function rng01(key: number, salt: number): number {
  const h = ((key * 73856093) ^ (salt * 19349663) ^ 0x9e3779b9) >>> 0;
  return (h & 0xffff) / 0xffff;
}

// ─── D4-symmetric generator set ─────────────────────────────────────
//
// Each orbit is represented by ONE canonical point in the fundamental
// domain (the wedge x≥CENTER, y≥CENTER, x≥y); the helper functions emit
// the full orbit. Hand-tuned for visual rhythm at GRID=48.
//
// Orbit kinds:
//   FIXED:    1 point (the center itself)
//   DIAGONAL: 4 points (y=x line, C4 rotation only — reflections coincide)
//   AXIS:     4 points (on the x=CENTER / y=CENTER axes)
//   GENERIC:  8 points (full D4 orbit)

interface OrbitSeed {
  kind: 'fixed' | 'diagonal' | 'axis' | 'generic';
  /** Offset from CENTER in (x, y). For 'axis' only x is used (axis along x);
   *  the orbit places the partner along y. For 'diagonal' x==y. */
  ox: number;
  oy: number;
}

const ORBIT_SEEDS: readonly OrbitSeed[] = [
  { kind: 'fixed',    ox:  0, oy:  0 },   // center
  { kind: 'diagonal', ox: 10, oy: 10 },   // 4 stones at corners of inner square
  { kind: 'axis',     ox: 12, oy:  0 },   // 4 stones at edge midpoints (inset)
  { kind: 'generic',  ox:  8, oy:  3 },   // 8 stones, off-axis
];

function expandOrbit(seed: OrbitSeed): Pt[] {
  const c = CENTER;
  switch (seed.kind) {
    case 'fixed':
      return [{ x: c, y: c }];
    case 'diagonal': {
      const a = seed.ox;
      // y=x line, C4 orbit (reflection about y=x is identity here)
      return [
        { x: c + a, y: c + a },
        { x: c - a, y: c + a },
        { x: c - a, y: c - a },
        { x: c + a, y: c - a },
      ];
    }
    case 'axis': {
      const a = seed.ox;
      return [
        { x: c + a, y: c     },
        { x: c - a, y: c     },
        { x: c,     y: c + a },
        { x: c,     y: c - a },
      ];
    }
    case 'generic': {
      const a = seed.ox, b = seed.oy;
      return [
        { x: c + a, y: c + b },
        { x: c - a, y: c + b },
        { x: c - a, y: c - b },
        { x: c + a, y: c - b },
        { x: c + b, y: c + a },
        { x: c - b, y: c + a },
        { x: c - b, y: c - a },
        { x: c + b, y: c - a },
      ];
    }
  }
}

const GENERATORS: readonly Pt[] = (() => {
  const out: Pt[] = [];
  for (const seed of ORBIT_SEEDS) {
    for (const p of expandOrbit(seed)) out.push(p);
  }
  // Apply tiny per-generator jitter (deterministic by index) so the
  // stones don't look mathematically perfect, while preserving D4
  // symmetry as a group property of the SET (jitter is symmetric).
  // Actually — adding independent jitter per point would BREAK D4.
  // We deliberately skip jitter to keep the symmetry exact; the
  // varying orbit sizes already provide enough visual irregularity.
  return out;
})();

// ─── Voronoi machinery ─────────────────────────────────────────────

/** Sutherland-Hodgman clip of `poly` by the half-plane `closer to a
 *  than to b`. Returns the kept (a-side) portion. */
function bisectorClip(poly: Pt[], a: Pt, b: Pt): Pt[] {
  if (poly.length === 0) return poly;
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
      const t = sCur / (sCur - sNxt);
      out.push({ x: cur.x + t * (nxt.x - cur.x), y: cur.y + t * (nxt.y - cur.y) });
    }
  }
  return out;
}

/** Inset `poly` by `d` px toward its centroid. */
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

/** Voronoi cell of GENERATORS[gi], clipped against all other generators
 *  in the 3×3 torus tile neighborhood. */
function cellPolygon(gi: number): Pt[] {
  const a = GENERATORS[gi];
  // Start polygon: padded square around the unit cell.
  let poly: Pt[] = [
    { x: -IMAGE_SIZE,        y: -IMAGE_SIZE },
    { x:  2 * IMAGE_SIZE,    y: -IMAGE_SIZE },
    { x:  2 * IMAGE_SIZE,    y:  2 * IMAGE_SIZE },
    { x: -IMAGE_SIZE,        y:  2 * IMAGE_SIZE },
  ];
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      for (let bk = 0; bk < GENERATORS.length; bk++) {
        if (di === 0 && dj === 0 && bk === gi) continue;
        const base = GENERATORS[bk];
        const b: Pt = { x: base.x + di * IMAGE_SIZE, y: base.y + dj * IMAGE_SIZE };
        poly = bisectorClip(poly, a, b);
        if (poly.length === 0) return poly;
      }
    }
  }
  return poly;
}

// ─── Color & speckle ───────────────────────────────────────────────

/** Single-palette warm-stone fill. ALL channels shifted by the SAME
 *  delta so the variation is grayscale (within a warm-tan family),
 *  never chromatic. */
function stoneFill(gi: number): { fill: string; baseR: number; baseG: number; baseB: number } {
  const delta = (rng01(gi, 11) * 2 - 1) * LUMA_VARIANCE;
  const r = Math.max(0, Math.min(255, BASE_R + delta));
  const g = Math.max(0, Math.min(255, BASE_G + delta));
  const b = Math.max(0, Math.min(255, BASE_B + delta));
  const rR = Math.round(r), rG = Math.round(g), rB = Math.round(b);
  return { fill: `rgb(${rR},${rG},${rB})`, baseR: rR, baseG: rG, baseB: rB };
}

function fmt(v: number): string {
  return v.toFixed(2);
}

function centroid(poly: Pt[]): Pt {
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p.x; cy += p.y; }
  return { x: cx / poly.length, y: cy / poly.length };
}

function safeRadius(poly: Pt[], c: Pt): number {
  let minD = Infinity;
  for (const p of poly) {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < minD) minD = d;
  }
  return minD * 0.55;
}

/** Per-stone surface flecks: grayscale luminance shifts only. */
function speckMarkup(gi: number, poly: Pt[], baseR: number, baseG: number, baseB: number): string {
  if (poly.length < 3) return '';
  const c = centroid(poly);
  const rMax = safeRadius(poly, c);
  if (rMax < 1.0) return '';

  const count = 2 + Math.floor(rng01(gi, 31) * 2);   // 2 or 3 specks

  let out = '';
  for (let k = 0; k < count; k++) {
    const r     = Math.sqrt(rng01(gi, 41 + k)) * rMax;
    const theta = rng01(gi, 53 + k) * Math.PI * 2;
    const sx = c.x + Math.cos(theta) * r;
    const sy = c.y + Math.sin(theta) * r;

    const sr = 0.4 + rng01(gi, 67 + k) * 0.6;        // 0.4..1.0 px

    // Pure grayscale luminance shift.
    const delta = (rng01(gi, 79 + k) - 0.55) * 32;   // [-17.6 .. +14.4]
    const sR = Math.max(0, Math.min(255, baseR + delta));
    const sG = Math.max(0, Math.min(255, baseG + delta));
    const sB = Math.max(0, Math.min(255, baseB + delta));
    const opacity = 0.55 + rng01(gi, 89 + k) * 0.35;

    out += `<circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="${fmt(sr)}" fill="rgb(${Math.round(sR)},${Math.round(sG)},${Math.round(sB)})" fill-opacity="${opacity.toFixed(2)}" />`;
  }
  return out;
}

function polygonsMarkup(): string {
  const out: string[] = [];
  for (let gi = 0; gi < GENERATORS.length; gi++) {
    const raw = cellPolygon(gi);
    if (raw.length < 3) continue;
    const inset = insetPoly(raw, INSET);
    if (inset.length < 3) continue;
    const pts = inset.map(p => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
    const { fill, baseR, baseG, baseB } = stoneFill(gi);
    out.push(`<polygon points="${pts}" fill="${fill}" stroke="${RIM_HIGHLIGHT}" stroke-width="0.20" />`);
    const specks = speckMarkup(gi, inset, baseR, baseG, baseB);
    if (specks) out.push(specks);
  }
  return out.join('\n    ');
}

let _cached: string | null = null;

/** The full 48×48 SVG string. Cached — same reference every call. */
export function svg(): string {
  if (_cached) return _cached;
  _cached = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}">
    <rect width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" fill="${MORTAR_FILL}" />
    ${polygonsMarkup()}
  </svg>`;
  return _cached;
}
