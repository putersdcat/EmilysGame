/**
 * proof-renderer.ts — Geometric proof overlays and variation sweeps.
 *
 * Provides two capabilities:
 *   1. renderGeoProof()   — canonical annotated 3D reference frame with face
 *      color-coding, compass rose, X/Y/Z axis arrows, and tile bound annotations.
 *      Use this whenever you need to visually verify face orientation, Z-height,
 *      or camera direction without running a browser.
 *   2. renderVariationSweep() — renders N variants of an SVG with one param
 *      swept (rotation, scale, zOffset, opacity) into a labelled strip PNG.
 *      Use this to quickly find the right texture param without round-trips.
 *
 * Both functions work exclusively via resvg (no browser / no Playwright).
 * TODO: DOC
 */

import { Resvg } from '@resvg/resvg-js';
import type { RenderResult } from './svg-renderer-tool.js';

// ─── Constants (mirror svg-renderer-tool.ts) ─────────────────

const MICRO_TILE = 128;
const FACE_TOP   = '#22c55e';   // lime  — TOP cap
const FACE_FRONT = '#eab308';   // yellow— FRONT (main viewer face)
const FACE_CAP   = '#06b6d4';   // cyan  — CAP (shadow/secondary face)
const FACE_EDGE  = '#ef4444';   // red   — Z-EDGE

// ─── Types ───────────────────────────────────────────────────

export type ProofVariant = 'reference' | 'overlay';
export type SweepParam = 'textureRotation' | 'textureScale' | 'zOffset' | 'opacity';

export interface GeoProofOptions {
  /** 'reference' renders a canonical labeled 3D box (ignores svg input).
   *  'overlay' applies z-pinned transform to svg and adds annotations on top.
   *  Default: 'reference' */
  variant?: ProofVariant;
  /** Show compass rose. Default: true */
  compassRose?: boolean;
  /** Show X/Y/Z axis arrows. Default: true */
  axisArrows?: boolean;
  /** Color-code and label the 3 wall faces (TOP/FRONT/CAP). Default: true */
  faceLabels?: boolean;
  /** Annotate coordinates at tile center. Default: true */
  coordLabels?: boolean;
  /** Show dashed diamond bound outline. Default: true */
  boundOutline?: boolean;
  /** Col/row for coord annotation when using overlay mode. Default: 0,0 */
  col?: number;
  row?: number;
  /** SVG string — only used in overlay mode. */
  svg?: string;
  /** Output width. Default: 520 */
  width?: number;
  /** Output height. Default: 380 */
  height?: number;
  /** Background color. Default: '#0d1117' */
  background?: string;
  /** Title text to show at top-left. */
  title?: string;
}

export interface GeoProofResult extends RenderResult {
  proofVariant: ProofVariant;
}

export interface SweepResult {
  /** Horizontal strip PNG, each frame annotated with param value. */
  stripPng: Buffer;
  stripBase64: string;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  param: SweepParam;
  values: number[];
  renderTimeMs: number;
}

// ─── Geo Proof ───────────────────────────────────────────────

/**
 * Render a geometric proof image.
 * 'reference' mode: canonical labeled isometric 3D box — no input SVG needed.
 * 'overlay' mode: z-pinned render of your SVG plus annotation overlay.
 */
export function renderGeoProof(options: GeoProofOptions = {}): GeoProofResult {
  const t0 = performance.now();
  const w = options.width ?? 520;
  const h = options.height ?? 380;
  const bg = options.background ?? '#0d1117';
  const variant = options.variant ?? 'reference';
  const compassRose = options.compassRose ?? true;
  const axisArrows  = options.axisArrows  ?? true;
  const faceLabels  = options.faceLabels  ?? true;
  const coordLabels = options.coordLabels ?? true;
  const boundOutline= options.boundOutline?? true;

  let svgBody = '';

  if (variant === 'reference') {
    svgBody = buildReferenceSvgBody(w, h, { compassRose, axisArrows, faceLabels, coordLabels, boundOutline, title: options.title });
  } else {
    // overlay mode: z-pinned wrap of user SVG + overlay
    const inner = options.svg ?? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#6a6a6a"/></svg>';
    svgBody = buildOverlaySvgBody(inner, w, h, { compassRose, axisArrows, faceLabels, coordLabels, boundOutline, col: options.col ?? 0, row: options.row ?? 0, title: options.title });
  }

  const finalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${svgBody}</svg>`;

  const resvg = new Resvg(finalSvg, {
    fitTo: { mode: 'width', value: w },
    background: bg,
    dpi: 96,
  });
  const rendered = resvg.render();
  const png = Buffer.from(rendered.asPng());
  const renderTimeMs = Math.round((performance.now() - t0) * 100) / 100;

  return {
    png,
    base64: png.toString('base64'),
    width: rendered.width,
    height: rendered.height,
    mode: 'flat',
    renderTimeMs,
    proofVariant: variant,
  };
}

// ─── Reference Mode ──────────────────────────────────────────

interface OverlayFlags {
  compassRose: boolean;
  axisArrows: boolean;
  faceLabels: boolean;
  coordLabels: boolean;
  boundOutline: boolean;
  title?: string;
}

/**
 * Builds the SVG body for the canonical reference box proof.
 *
 * Geometry uses the engine's 2:1 ratio (arctan(0.5) ≈ 26.6°):
 *   East step  → screen (+1, +0.5)  per tile unit
 *   South step → screen (-1, +0.5)  per tile unit  (going "away" from viewer)
 *   Z step     → screen ( 0, -1)    per unit up
 *
 * Box anchored at near-bottom corner (260, 330) in a 520×380 canvas.
 * Width=200px, Depth=100px, Height=90px.
 */
function buildReferenceSvgBody(w: number, h: number, flags: OverlayFlags): string {
  // Scale the box to fit the canvas
  const scaleX = w / 520;
  const scaleY = h / 380;

  // Near corner (bottom-front closest to viewer)
  const nearX = Math.round(260 * scaleX);
  const nearY = Math.round(330 * scaleY);

  // Box dimensions in screen pixels
  const bw = Math.round(200 * scaleX);  // width (east direction)
  const bd = Math.round(100 * scaleX);  // depth (south→north, goes upper-left)
  const bh = Math.round(90  * scaleY);  // height (Z, goes straight up)

  // 8 box vertices in screen space
  // Bottom face (y):
  const bnear  = pt(nearX,           nearY);
  const bright = pt(nearX + bw,       nearY - Math.round(bw * 0.5));
  const bleft  = pt(nearX - bd,       nearY - Math.round(bd * 0.5));
  const bback  = pt(nearX + bw - bd,  nearY - Math.round((bw + bd) * 0.5));

  // Top face (raised by bh):
  const tnear  = pt(bnear.x,  bnear.y  - bh);
  const tright = pt(bright.x, bright.y - bh);
  const tleft  = pt(bleft.x,  bleft.y  - bh);
  const tback  = pt(bback.x,  bback.y  - bh);

  let out = '';

  // ── Dashed diamond ground outline ────────────────────────
  if (flags.boundOutline) {
    out += `<polygon points="${poly([bnear, bright, bback, bleft])}"
      fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1" stroke-dasharray="5,3"/>`;
  }

  // ── Face fills ────────────────────────────────────────────
  // Draw order: back faces first, then visible front faces

  // FRONT face (near left→right visible face, camera-facing south surface)
  out += `<polygon points="${poly([bnear, bright, tright, tnear])}"
    fill="${FACE_FRONT}" fill-opacity="0.75" stroke="${FACE_FRONT}" stroke-width="1"/>`;

  // CAP face (right-side depth face, east-facing)
  out += `<polygon points="${poly([bright, bback, tback, tright])}"
    fill="${FACE_CAP}" fill-opacity="0.65" stroke="${FACE_CAP}" stroke-width="1"/>`;

  // TOP face
  out += `<polygon points="${poly([tnear, tright, tback, tleft])}"
    fill="${FACE_TOP}" fill-opacity="0.8" stroke="${FACE_TOP}" stroke-width="1"/>`;

  // ── Z-EDGE line (right-front vertical — nearest high-contrast edge) ──
  out += `<line x1="${tright.x}" y1="${tright.y}" x2="${bright.x}" y2="${bright.y}"
    stroke="${FACE_EDGE}" stroke-width="3"/>`;
  // Z-edge annotation
  out += label(bright.x + 10, bright.y + 4, `Z(${bright.x},${bright.y})`, FACE_EDGE, 8.5);
  out += label(tright.x + 10, tright.y - 6, 'Z-EDGE', FACE_EDGE, 8.5);

  // ── Face labels ───────────────────────────────────────────
  if (flags.faceLabels) {
    const frontCX = Math.round((bnear.x + bright.x + tright.x + tnear.x) / 4);
    const frontCY = Math.round((bnear.y + bright.y + tright.y + tnear.y) / 4);
    const capCX   = Math.round((bright.x + bback.x + tback.x + tright.x) / 4);
    const capCY   = Math.round((bright.y + bback.y + tback.y + tright.y) / 4);
    const topCX   = Math.round((tnear.x + tright.x + tback.x + tleft.x) / 4);
    const topCY   = Math.round((tnear.y + tright.y + tback.y + tleft.y) / 4);

    out += bigLabel(frontCX, frontCY, 'FRONT', FACE_FRONT);
    out += bigLabel(capCX, capCY, 'CAP', FACE_CAP);
    out += bigLabel(topCX, topCY, 'TOP', FACE_TOP);

    // Sub-annotations
    out += label(bnear.x - 60, bnear.y + 5, `front anchor(${bnear.x},${bnear.y})`, FACE_FRONT, 7.5);
    out += label(bback.x + 8, bback.y - 4, `cap anchor(${bback.x},${bback.y})`, FACE_CAP, 7.5);
  }

  // ── Axis arrows from near-bottom corner ──────────────────
  if (flags.axisArrows) {
    const ax = bnear.x;
    const ay = bnear.y;
    const arrowLen = Math.round(40 * scaleX);
    // X axis → east (+1, -0.5)
    const xEx = ax + arrowLen;
    const xEy = ay - Math.round(arrowLen * 0.5);
    out += arrow(ax, ay, xEx, xEy, '#f97316', 'X'); // orange
    // Z axis → straight up
    const zEy = ay - arrowLen;
    out += arrow(ax, ay, ax, zEy, '#a855f7', 'Z');  // purple
    // Y axis → south/depth (−1, +0.5) — shows direction going "into" screen
    const yEx = ax - Math.round(arrowLen * 0.7);
    const yEy = ay - Math.round(arrowLen * 0.35);
    out += arrow(ax, ay, yEx, yEy, '#64748b', 'Y'); // gray — goes away
  }

  // ── Compass rose ─────────────────────────────────────────
  if (flags.compassRose) {
    const cx = w - 60;
    const cy = 55;
    const cr = 24;
    out += compassRoseSvg(cx, cy, cr);
  }

  // ── Camera note ───────────────────────────────────────────
  out += label(8, h - 14, '↗ Camera (south-east, looks NW)', 'rgba(255,255,255,0.45)', 8);
  out += label(8, h - 24, 'V opens UP/AWAY → solid faces player ✓', 'rgba(255,255,255,0.35)', 7.5);
  out += label(8, h - 34, 'Draw: 1.cap(cyan) → 2.front(yellow) → 3.top(lime)', 'rgba(255,255,255,0.35)', 7.5);

  // ── Title ─────────────────────────────────────────────────
  const titleText = flags.title ?? '3-Face Wall Extrusion — v2 (180° fix)';
  out += `<text x="12" y="20" font-family="monospace" font-size="11" fill="rgba(255,255,255,0.8)">${escapeXml(titleText)}</text>`;
  out += label(12, 34, 'Draw: 1.cap(cyan) → 2.front(yellow) → 3.top(lime)', 'rgba(255,255,255,0.4)', 8);

  return out;
}

// ─── Overlay Mode ────────────────────────────────────────────

interface OverlayFlagsExt extends OverlayFlags {
  col: number;
  row: number;
}

/**
 * Builds the SVG body for overlay mode: z-pinned render of user SVG
 * with compass, axis, and face annotation overlay.
 */
function buildOverlaySvgBody(innerSvg: string, w: number, h: number, flags: OverlayFlagsExt): string {
  const anchorX = Math.round(w / 2 - 64);
  const anchorY = Math.round(h * 0.75);

  // Strip outer <svg> tags
  const stripped = innerSvg.replace(/^\s*<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '').trim();

  let out = '';

  // ── Base diamond outline ──────────────────────────────────
  if (flags.boundOutline) {
    out += `<g transform="translate(${anchorX},${anchorY})">
      <polygon points="0,0 64,32 128,0 64,-32"
        fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="5,3"/>
    </g>`;
  }

  // ── Render the z-pinned SVG ───────────────────────────────
  out += `<g transform="translate(${anchorX},${anchorY})">
    <g transform="matrix(1, 0.5, 0, 1, 0, 0)">
      <g transform="translate(0, -${MICRO_TILE})">
        <svg width="${MICRO_TILE}" height="${MICRO_TILE}" viewBox="0 0 128 128">
          ${stripped}
        </svg>
      </g>
    </g>
  </g>`;

  // ── Compass rose ─────────────────────────────────────────
  if (flags.compassRose) {
    out += compassRoseSvg(w - 56, 52, 22);
  }

  // ── Axis arrows from left-vertex of diamond ───────────────
  if (flags.axisArrows) {
    const ax = anchorX;
    const ay = anchorY;
    out += arrow(ax, ay, ax + 40, ay - 20, '#f97316', 'X');  // east
    out += arrow(ax, ay, ax,       ay - 40, '#a855f7', 'Z'); // up
    out += arrow(ax, ay, ax - 28, ay - 14, '#64748b', 'Y'); // south/depth
  }

  // ── Coord label ───────────────────────────────────────────
  if (flags.coordLabels) {
    const cx = anchorX + 64;
    const cy = anchorY - 8;
    out += label(cx - 20, cy, `(${flags.col}, ${flags.row})`, 'rgba(255,255,255,0.6)', 9);
  }

  // ── Face labels (approximated positions for overlay) ──────
  if (flags.faceLabels) {
    // FRONT face center ≈ (anchorX + 32, anchorY - 48)
    out += bigLabel(anchorX + 32, anchorY - 48, 'FRONT', FACE_FRONT);
    // CAP face center ≈ (anchorX + 96, anchorY - 32)
    out += bigLabel(anchorX + 96, anchorY - 32, 'CAP', FACE_CAP);
    // TOP center ≈ (anchorX + 64, anchorY - 90)
    out += bigLabel(anchorX + 64, anchorY - 90, 'TOP', FACE_TOP);
  }

  const titleText = flags.title ?? 'Overlay Proof';
  out += `<text x="10" y="18" font-family="monospace" font-size="11" fill="rgba(255,255,255,0.8)">${escapeXml(titleText)}</text>`;
  out += label(10, h - 10, '↗ Camera (south-east, looks NW)', 'rgba(255,255,255,0.4)', 8);

  return out;
}

// ─── Variation Sweep ─────────────────────────────────────────

/**
 * Render N variants of an SVG with one parameter swept across given values.
 * Each frame is annotated with the param name and value in a footer strip.
 * Returns a horizontal sprite strip PNG.
 *
 * Supported params:
 *   textureRotation — CSS rotate(Ndeg) applied to SVG content (0/90/180/270)
 *   textureScale    — SVG content scaled (0.5/1/1.5/2)
 *   zOffset         — rendered with increasing zOffset in z-pinned mode
 *   opacity         — SVG content opacity
 */
export function renderVariationSweep(
  svgTemplate: string,
  param: SweepParam,
  values: number[],
  options: { background?: string; frameSize?: number } = {},
): SweepResult {
  const t0 = performance.now();
  const frameSize = options.frameSize ?? 200;
  const footerH = 32;
  const totalW = frameSize * values.length;
  const totalH = frameSize + footerH;

  const frames: string[] = values.map((val) => buildVariantFrame(svgTemplate, param, val, frameSize));

  const stripSvg = buildSweepStrip(frames, values, param, frameSize, footerH, totalW, totalH);

  const resvg = new Resvg(stripSvg, {
    fitTo: { mode: 'width', value: totalW },
    background: options.background ?? '#0d1117',
    dpi: 96,
  });
  const rendered = resvg.render();
  const png = Buffer.from(rendered.asPng());
  const renderTimeMs = Math.round((performance.now() - t0) * 100) / 100;

  return {
    stripPng: png,
    stripBase64: png.toString('base64'),
    frameCount: values.length,
    frameWidth: frameSize,
    frameHeight: totalH,
    param,
    values,
    renderTimeMs,
  };
}

/**
 * Build a single frame SVG with param variant applied.
 * Wraps the SVG content in the iso z-pinned transform with param tweaks.
 */
function buildVariantFrame(svgTemplate: string, param: SweepParam, val: number, size: number): string {
  const stripped = svgTemplate.replace(/^\s*<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '').trim();
  const anchorX = size / 2 - 64;
  const anchorY = size * 0.75;

  let contentTransform = '';
  let zOffsetPx = 0;
  let opacityAttr = '';

  switch (param) {
    case 'textureRotation':
      contentTransform = `rotate(${val} 64 64)`;
      break;
    case 'textureScale': {
      const offset = 64 * (1 - val);
      contentTransform = `translate(${offset} ${offset}) scale(${val})`;
      break;
    }
    case 'zOffset':
      zOffsetPx = val * 8;
      break;
    case 'opacity':
      opacityAttr = `opacity="${val}"`;
      break;
  }

  const transformAttr = contentTransform ? `transform="${contentTransform}"` : '';
  const translateUp = MICRO_TILE + zOffsetPx;

  return `<g transform="translate(${anchorX}, ${anchorY})">
    <polygon points="0,0 64,32 128,0 64,-32" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)"/>
    <g transform="matrix(1, 0.5, 0, 1, 0, 0)">
      <g transform="translate(0, -${translateUp})">
        <svg width="${MICRO_TILE}" height="${MICRO_TILE}" viewBox="0 0 128 128" ${opacityAttr}>
          <g ${transformAttr}>
            ${stripped}
          </g>
        </svg>
      </g>
    </g>
  </g>`;
}

function buildSweepStrip(
  frames: string[],
  values: number[],
  param: SweepParam,
  frameW: number,
  footerH: number,
  totalW: number,
  totalH: number,
): string {
  let content = '';
  frames.forEach((frame, i) => {
    const x = i * frameW;
    content += `<g transform="translate(${x}, 0)">${frame}</g>`;
    // Vertical separator
    if (i > 0) {
      content += `<line x1="${x}" y1="0" x2="${x}" y2="${totalH}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
    }
    // Footer label
    const labelVal = param === 'textureRotation' ? `${val(values[i])}°`
      : param === 'textureScale' ? `×${val(values[i])}`
      : param === 'opacity' ? `α${val(values[i])}`
      : `z+${val(values[i])}`;
    const labelX = x + frameW / 2;
    const labelY = totalH - footerH / 2 + 4;
    content += `<rect x="${x}" y="${totalH - footerH}" width="${frameW}" height="${footerH}" fill="rgba(0,0,0,0.5)"/>`;
    content += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-family="monospace" font-size="10" fill="rgba(255,255,255,0.8)">${param}: ${labelVal}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
  ${content}
</svg>`;
}

function val(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

// ─── SVG Helpers ─────────────────────────────────────────────

interface Pt { x: number; y: number }
function pt(x: number, y: number): Pt { return { x, y }; }

function poly(pts: Pt[]): string {
  return pts.map(p => `${p.x},${p.y}`).join(' ');
}

function label(x: number, y: number, text: string, fill: string, fontSize = 9): string {
  return `<text x="${x}" y="${y}" font-family="monospace" font-size="${fontSize}" fill="${fill}">${escapeXml(text)}</text>`;
}

function bigLabel(cx: number, cy: number, text: string, fill: string): string {
  return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
    font-family="monospace" font-size="13" font-weight="bold"
    fill="${fill}" stroke="#0d1117" stroke-width="3" paint-order="stroke">${escapeXml(text)}</text>`;
}

function arrow(x1: number, y1: number, x2: number, y2: number, color: string, labelText: string): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return '';
  // Arrowhead: small triangle at endpoint
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const ah = 7;
  const ax = x2 - ux * ah;
  const ay = y2 - uy * ah;
  const pts = [
    `${x2},${y2}`,
    `${Math.round(ax + px * 3)},${Math.round(ay + py * 3)}`,
    `${Math.round(ax - px * 3)},${Math.round(ay - py * 3)}`,
  ].join(' ');

  const lx = Math.round(x2 + ux * 10);
  const ly = Math.round(y2 + uy * 10);

  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"/>
<polygon points="${pts}" fill="${color}"/>
<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
  font-family="monospace" font-size="9" font-weight="bold" fill="${color}">${escapeXml(labelText)}</text>`;
}

/**
 * Compass rose for the iso 2.0 camera (SE viewpoint, looks NW).
 * N=upper-left, E=upper-right, S=lower-right, W=lower-left.
 */
function compassRoseSvg(cx: number, cy: number, r: number): string {
  // Arrow directions in screen space:
  // N → screen upper-left: (-0.7, -0.7)
  // E → screen upper-right: (+0.7, -0.35)
  // S → screen lower-right: (+0.7, +0.7) [viewer direction, dimmed]
  // W → screen lower-left: (-0.7, +0.35) [away, dimmed]
  const dirs = [
    { dx: -0.7,  dy: -0.7,  label: 'N', color: 'rgba(255,255,255,0.9)', dim: false },
    { dx:  0.7,  dy: -0.35, label: 'E', color: 'rgba(255,255,255,0.9)', dim: false },
    { dx:  0.7,  dy:  0.7,  label: 'S', color: 'rgba(255,255,255,0.4)', dim: true },
    { dx: -0.7,  dy:  0.35, label: 'W', color: 'rgba(255,255,255,0.4)', dim: true },
  ];

  let out = `<circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`;
  out += `<text x="${cx}" y="${cy - r - 8}" text-anchor="middle" font-family="monospace" font-size="7.5" fill="rgba(255,255,255,0.45)">compass</text>`;

  for (const d of dirs) {
    const len = Math.sqrt(d.dx * d.dx + d.dy * d.dy);
    const ex = cx + (d.dx / len) * r;
    const ey = cy + (d.dy / len) * r;
    if (!d.dim) {
      out += arrow(cx, cy, Math.round(ex), Math.round(ey), d.color, d.label);
    } else {
      // Dimmed direction — just a short line
      out += `<line x1="${cx}" y1="${cy}" x2="${Math.round(ex * 0.7 + cx * 0.3)}" y2="${Math.round(ey * 0.7 + cy * 0.3)}"
        stroke="${d.color}" stroke-width="1" stroke-dasharray="3,2"/>`;
      out += `<text x="${Math.round(ex)}" y="${Math.round(ey)}" text-anchor="middle" dominant-baseline="middle"
        font-family="monospace" font-size="8" fill="${d.color}">${d.label}</text>`;
    }
  }
  return out;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
