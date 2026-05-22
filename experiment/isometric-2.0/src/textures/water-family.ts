/**
 * water-family.ts — procedural negative-Z water material factory.
 *
 * Produces sunken river/pond SVGs with deterministic per-tile variation and
 * frame-addressable ripple/flow overlays. Runtime can use frame 0 as a stable
 * texture; tools can request frames to validate animation strips.
 */

import type { FeatureConnections, FeatureVariant } from '../types';

export type WaterStyleId = 'clear-river' | 'muddy-creek' | 'deep-pond' | 'marsh-water';

export interface WaterStyle {
  readonly id: WaterStyleId;
  readonly bankOuter: string;
  readonly bankInner: string;
  readonly bankWet: string;
  readonly shallow: string;
  readonly mid: string;
  readonly deep: string;
  readonly foam: string;
  readonly glint: string;
  readonly vegetation: string;
  readonly pebble: string;
  readonly channelWidth: number;
  readonly bankWidth: number;
  readonly flowSpeed: number;
  readonly rippleDensity: number;
  readonly opacity: number;
}

export interface WaterFactoryOptions {
  readonly style?: WaterStyleId | WaterStyle;
  /** Animation frame index. Frame 0 is the stable default texture. */
  readonly frame?: number;
  /** Number of frames in the animation loop. */
  readonly frameCount?: number;
  /** Extra bank wetness/darkness. */
  readonly wetness?: number;
  /** Extra foam/ripple brightness. */
  readonly turbulence?: number;
  /** Extra silt/muddy bank tint, -1..1 around the style baseline. */
  readonly silt?: number;
  /** Extra reeds / shoreline vegetation, -1..1 around the style baseline. */
  readonly reeds?: number;
  /** Deterministic material seed. */
  readonly seed?: string;
}

const STYLES: Record<WaterStyleId, WaterStyle> = {
  'clear-river': {
    id: 'clear-river',
    bankOuter: '#5f6530', bankInner: '#786733', bankWet: '#3f512e',
    shallow: '#2b86a8', mid: '#1b638f', deep: '#0d345f',
    foam: '#a8d9e8', glint: '#e8fff8', vegetation: '#4e9a46', pebble: '#9b8b62',
    channelWidth: 64, bankWidth: 11, flowSpeed: 1.0, rippleDensity: 1.0, opacity: 1,
  },
  'muddy-creek': {
    id: 'muddy-creek',
    bankOuter: '#6a5429', bankInner: '#806439', bankWet: '#3e3524',
    shallow: '#617845', mid: '#3d684f', deep: '#244b46',
    foam: '#b7caa6', glint: '#e4e8cf', vegetation: '#5d8844', pebble: '#8d7650',
    channelWidth: 58, bankWidth: 13, flowSpeed: 0.65, rippleDensity: 0.72, opacity: 1,
  },
  'deep-pond': {
    id: 'deep-pond',
    bankOuter: '#5a4a28', bankInner: '#746035', bankWet: '#303c2a',
    shallow: '#286b86', mid: '#174f78', deep: '#082b50',
    foam: '#87bfd4', glint: '#e5fff7', vegetation: '#467a38', pebble: '#8b7a55',
    channelWidth: 70, bankWidth: 12, flowSpeed: 0.25, rippleDensity: 1.25, opacity: 1,
  },
  'marsh-water': {
    id: 'marsh-water',
    bankOuter: '#596b32', bankInner: '#69753d', bankWet: '#344529',
    shallow: '#52774a', mid: '#356751', deep: '#1d4744',
    foam: '#a8c49d', glint: '#d9eed2', vegetation: '#5fa047', pebble: '#7c7650',
    channelWidth: 62, bankWidth: 14, flowSpeed: 0.45, rippleDensity: 0.88, opacity: 1,
  },
};

const DEFAULT_STYLE: WaterStyleId = 'clear-river';
const EDGE_OVERDRAW = 34;

export function listWaterStyles(): readonly WaterStyleId[] {
  return Object.keys(STYLES) as WaterStyleId[];
}

export function defaultWaterStyle(): WaterStyle {
  return STYLES[DEFAULT_STYLE];
}

function resolveStyle(styleLike?: WaterStyleId | WaterStyle): WaterStyle {
  if (!styleLike) return defaultWaterStyle();
  return typeof styleLike === 'string' ? STYLES[styleLike] : styleLike;
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
}

function mix(a: string, b: string, t: number): string {
  const aa = hexToRgb(a); const bb = hexToRgb(b); const k = clamp01(t);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${ch(aa.r, bb.r)}${ch(aa.g, bb.g)}${ch(aa.b, bb.b)}`;
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp01(alpha).toFixed(3)})`;
}

function connectionsFromVariant(variant: FeatureVariant, conn?: FeatureConnections): FeatureConnections {
  if (conn) return conn;
  switch (variant) {
    case 'straight-h': return { top: false, right: true, bottom: false, left: true };
    case 'straight-v': return { top: true, right: false, bottom: true, left: false };
    case 'corner-tr': return { top: true, right: true, bottom: false, left: false };
    case 'corner-tl': return { top: true, right: false, bottom: false, left: true };
    case 'corner-br': return { top: false, right: true, bottom: true, left: false };
    case 'corner-bl': return { top: false, right: false, bottom: true, left: true };
    case 'cross': return { top: true, right: true, bottom: true, left: true };
    case 'tee-t': return { top: false, right: true, bottom: true, left: true };
    case 'tee-r': return { top: true, right: false, bottom: true, left: true };
    case 'tee-b': return { top: true, right: true, bottom: false, left: true };
    case 'tee-l': return { top: true, right: true, bottom: true, left: false };
    case 'end-t': return { top: true, right: false, bottom: false, left: false };
    case 'end-r': return { top: false, right: true, bottom: false, left: false };
    case 'end-b': return { top: false, right: false, bottom: true, left: false };
    case 'end-l': return { top: false, right: false, bottom: false, left: true };
    default: return { top: false, right: false, bottom: false, left: false };
  }
}

export function createWaterStyleVariant(styleLike?: WaterStyleId | WaterStyle, options: WaterFactoryOptions = {}): WaterStyle {
  const base = resolveStyle(styleLike);
  const seed = options.seed ?? base.id;
  const n = (slot: string) => hash01(`${seed}:${slot}`);
  const wet = clamp01(0.42 + (options.wetness ?? 0) + n('wet') * 0.18);
  const silt = clamp01(0.18 + (options.silt ?? 0) + n('silt') * 0.22);
  const reeds = clamp01(0.20 + (options.reeds ?? 0) + n('reeds') * 0.22);
  const turbulence = clamp01(0.16 + (options.turbulence ?? 0) + n('turb') * 0.20);
  return Object.freeze({
    ...base,
    bankOuter: mix(base.bankOuter, base.bankWet, wet * 0.22),
    bankInner: mix(mix(base.bankInner, base.bankWet, wet * 0.28), '#82683a', silt * 0.18),
    shallow: mix(base.shallow, base.bankWet, silt * 0.08),
    mid: mix(base.mid, base.bankWet, silt * 0.06),
    deep: mix(base.deep, '#061b34', wet * 0.06),
    vegetation: mix(base.vegetation, '#6aa84f', reeds * 0.18),
    pebble: mix(base.pebble, '#6b5635', silt * 0.24),
    rippleDensity: Math.max(0.25, base.rippleDensity + turbulence * 0.25 - 0.10),
  });
}

export function waterStyleForTile(
  styleLike: WaterStyleId | WaterStyle | undefined,
  worldCol: number,
  worldRow: number,
  variant: FeatureVariant,
  options: Omit<WaterFactoryOptions, 'style' | 'seed'> = {},
): WaterStyle {
  const base = styleLike ? resolveStyle(styleLike) : (variant === 'isolated' ? STYLES['deep-pond'] : STYLES[DEFAULT_STYLE]);
  return createWaterStyleVariant(base, { ...options, seed: `${base.id}:${worldCol}:${worldRow}:${variant}` });
}

function chooseStyle(styleId: WaterStyleId | WaterStyle | undefined, worldCol: number, worldRow: number, variant: FeatureVariant, options: WaterFactoryOptions): WaterStyle {
  if (styleId) return waterStyleForTile(styleId, worldCol, worldRow, variant, options);
  if (variant === 'isolated') return STYLES['deep-pond'];
  void worldCol; void worldRow;
  // Connected rivers must not randomly change material from tile to tile.
  // Variation belongs in bank/noise detail, not the core water color family.
  return STYLES[DEFAULT_STYLE];
}

function bankPath(x1: number, y1: number, x2: number, y2: number, waveSide: number, phase: number, amp: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const steps = Math.max(4, Math.floor(len / 14));
  let d = `M ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mx = x1 + dx * t;
    const my = y1 + dy * t;
    const wave = Math.sin(t * Math.PI * 3 + phase) * amp * waveSide;
    const nx = -dy / len * wave;
    const ny = dx / len * wave;
    d += ` L ${(mx + nx).toFixed(1)} ${(my + ny).toFixed(1)}`;
  }
  return d;
}

function defs(id: string, style: WaterStyle, phase: number, wetness: number): string {
  const wetShallow = mix(style.shallow, style.bankWet, wetness * 0.10);
  const wetMid = mix(style.mid, style.bankWet, wetness * 0.07);
  return `<defs>
    <linearGradient id="${id}-h" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${style.bankWet}"/>
      <stop offset="16%" stop-color="${wetShallow}"/>
      <stop offset="50%" stop-color="${style.deep}"/>
      <stop offset="84%" stop-color="${wetMid}"/>
      <stop offset="100%" stop-color="${style.bankWet}"/>
    </linearGradient>
    <linearGradient id="${id}-v" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${style.bankWet}"/>
      <stop offset="16%" stop-color="${wetShallow}"/>
      <stop offset="50%" stop-color="${style.deep}"/>
      <stop offset="84%" stop-color="${wetMid}"/>
      <stop offset="100%" stop-color="${style.bankWet}"/>
    </linearGradient>
    <radialGradient id="${id}-pond" cx="${48 + Math.sin(phase) * 6}%" cy="${42 + Math.cos(phase * 0.7) * 5}%" r="62%">
      <stop offset="0%" stop-color="${style.shallow}"/>
      <stop offset="48%" stop-color="${style.mid}"/>
      <stop offset="100%" stop-color="${style.deep}"/>
    </radialGradient>
  </defs>`;
}

function drawRipples(
  parts: string[],
  style: WaterStyle,
  conn: FeatureConnections,
  off: number,
  chW: number,
  phase: number,
  turbulence: number,
  seed: string,
): void {
  const alpha = 0.12 + turbulence * 0.10;
  const countMul = style.rippleDensity * 0.55 + turbulence * 0.15;
  parts.push(`<g opacity="${alpha.toFixed(2)}" stroke-linecap="round" fill="none">`);
  if (conn.top || conn.bottom) {
    const yStart = conn.top ? -EDGE_OVERDRAW : off + 8;
    const yEnd = conn.bottom ? 144 + EDGE_OVERDRAW : off + chW - 8;
    const step = Math.max(24, 34 - countMul * 5);
    for (let y = yStart; y < yEnd; y += step) {
      const k = y + phase * 11;
      const x1 = off + 10 + Math.sin(k * 0.11) * 5;
      const x2 = off + chW - 10 + Math.sin(k * 0.13 + 1.7) * 5;
      parts.push(`<path d="M ${x1.toFixed(1)} ${y.toFixed(1)} Q ${(off + chW / 2 + Math.sin(k * 0.08) * 5).toFixed(1)} ${(y + 3 + Math.cos(k * 0.07) * 1.4).toFixed(1)} ${x2.toFixed(1)} ${y.toFixed(1)}" stroke="${rgba(style.foam, 0.55)}" stroke-width="0.9"/>`);
    }
  }
  if (conn.left || conn.right) {
    const xStart = conn.left ? -EDGE_OVERDRAW : off + 8;
    const xEnd = conn.right ? 144 + EDGE_OVERDRAW : off + chW - 8;
    const step = Math.max(24, 34 - countMul * 5);
    for (let x = xStart; x < xEnd; x += step) {
      const k = x + phase * 11;
      const y1 = off + 10 + Math.sin(k * 0.11) * 5;
      const y2 = off + chW - 10 + Math.sin(k * 0.13 + 1.7) * 5;
      parts.push(`<path d="M ${x.toFixed(1)} ${y1.toFixed(1)} Q ${(x + 3 + Math.cos(k * 0.07) * 1.4).toFixed(1)} ${(off + chW / 2 + Math.sin(k * 0.08) * 5).toFixed(1)} ${x.toFixed(1)} ${y2.toFixed(1)}" stroke="${rgba(style.foam, 0.55)}" stroke-width="0.9"/>`);
    }
  }

  for (let i = 0; i < 2; i++) {
    const h = hash01(`${seed}:glint:${i}`);
    const gx = off + 10 + ((h * 997 + phase * 18 + i * 21) % Math.max(1, chW - 20));
    const gy = off + 10 + ((h * 571 + Math.sin(phase + i) * 13 + i * 15) % Math.max(1, chW - 20));
    parts.push(`<ellipse cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" rx="${(3 + h * 4).toFixed(1)}" ry="${(1.0 + h * 1.2).toFixed(1)}" fill="${rgba(style.glint, 0.13 + turbulence * 0.08)}" stroke="none"/>`);
  }
  parts.push('</g>');
}

function drawPond(parts: string[], style: WaterStyle, id: string, phase: number, wetness: number, turbulence: number, seed: string): void {
  const ringAmp = 2 + turbulence * 2;
  const edge = (r: number, n: number): string => {
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const rr = r + Math.sin(a * 5 + phase) * ringAmp + Math.cos(a * 3 + phase * 0.6) * 1.4;
      pts.push(`${(72 + Math.cos(a) * rr).toFixed(1)},${(72 + Math.sin(a) * rr * 0.78).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  parts.push(`<ellipse cx="72" cy="72" rx="48" ry="39" fill="${style.bankOuter}"/>`);
  parts.push(`<polygon points="${edge(46, 34)}" fill="${mix(style.bankInner, style.bankWet, wetness * 0.25)}"/>`);
  parts.push(`<polygon points="${edge(39, 34)}" fill="url(#${id}-pond)"/>`);
  parts.push(`<ellipse cx="68" cy="65" rx="21" ry="11" fill="${rgba(style.glint, 0.10 + turbulence * 0.12)}"/>`);
  for (let i = 0; i < 5; i++) {
    const h = hash01(`${seed}:pond-ripple:${i}`);
    const rx = 10 + i * 5 + Math.sin(phase + i) * 2;
    const ry = rx * (0.34 + h * 0.10);
    parts.push(`<ellipse cx="${(68 + Math.sin(h * 10 + phase) * 16).toFixed(1)}" cy="${(70 + Math.cos(h * 8 + phase) * 10).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="none" stroke="${rgba(style.foam, 0.22)}" stroke-width="1"/>`);
  }
}

function connectionCount(conn: FeatureConnections): number {
  return (conn.top ? 1 : 0) + (conn.right ? 1 : 0) + (conn.bottom ? 1 : 0) + (conn.left ? 1 : 0);
}

function edgePoint(dir: 'top' | 'right' | 'bottom' | 'left'): { x: number; y: number } {
  switch (dir) {
    case 'top': return { x: 72, y: -4 };
    case 'right': return { x: 148, y: 72 };
    case 'bottom': return { x: 72, y: 148 };
    case 'left': return { x: -4, y: 72 };
  }
}

function isCornerConnection(conn: FeatureConnections): boolean {
  if (connectionCount(conn) !== 2) return false;
  return !((conn.top && conn.bottom) || (conn.left && conn.right));
}

function cornerPath(conn: FeatureConnections): string {
  const dirs = (['top', 'right', 'bottom', 'left'] as const).filter(d => conn[d]);
  const a = edgePoint(dirs[0]);
  const b = edgePoint(dirs[1]);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q 72 72 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

function drawRoundedCornerJoin(parts: string[], style: WaterStyle, conn: FeatureConnections, chW: number): void {
  if (!isCornerConnection(conn)) return;
  const d = cornerPath(conn);
  parts.push(`<path d="${d}" stroke="${style.mid}" stroke-width="${(chW + 8).toFixed(1)}" fill="none" stroke-linecap="butt" stroke-linejoin="round"/>`);
  parts.push(`<path d="${d}" stroke="${rgba(style.deep, 0.45)}" stroke-width="${(chW - 26).toFixed(1)}" fill="none" stroke-linecap="butt" stroke-linejoin="round"/>`);
}

function drawRectSegments(
  parts: string[],
  horizontal: boolean,
  fixed: number,
  thickness: number,
  start: number,
  end: number,
  gapStart: number | null,
  gapEnd: number | null,
  fill: string,
  rx = 4,
): void {
  const draw = (a: number, b: number) => {
    if (b - a < 2) return;
    if (horizontal) {
      parts.push(`<rect x="${a.toFixed(1)}" y="${fixed.toFixed(1)}" width="${(b - a).toFixed(1)}" height="${thickness.toFixed(1)}" fill="${fill}" rx="${rx}"/>`);
    } else {
      parts.push(`<rect x="${fixed.toFixed(1)}" y="${a.toFixed(1)}" width="${thickness.toFixed(1)}" height="${(b - a).toFixed(1)}" fill="${fill}" rx="${rx}"/>`);
    }
  };

  if (gapStart === null || gapEnd === null) {
    draw(start, end);
    return;
  }

  draw(start, Math.max(start, gapStart));
  draw(Math.min(end, gapEnd), end);
}

export function svgWater(
  variant: FeatureVariant,
  connections?: FeatureConnections,
  worldCol = 0,
  worldRow = 0,
  options: WaterFactoryOptions = {},
): string {
  const conn = connectionsFromVariant(variant, connections);
  const frameCount = Math.max(1, options.frameCount ?? 8);
  const frame = ((options.frame ?? 0) % frameCount + frameCount) % frameCount;
  const style = chooseStyle(options.style, worldCol, worldRow, variant, options);
  const seed = options.seed ?? `${style.id}:${worldCol}:${worldRow}:${variant}`;
  const phase = (frame / frameCount) * Math.PI * 2 * style.flowSpeed + hash01(`${seed}:phase`) * Math.PI * 2;
  const wetness = clamp01(0.46 + (options.wetness ?? 0) + hash01(`${seed}:wet`) * 0.10);
  const turbulence = clamp01(0.12 + (options.turbulence ?? 0) + hash01(`${seed}:turb`) * 0.10);
  const chW = style.channelWidth;
  const off = (144 - chW) / 2;
  const bankW = style.bankWidth;
  const id = `water-${style.id}-${variant}-${worldCol}-${worldRow}-${frame}`.replace(/[^a-zA-Z0-9_-]/g, '');
  const parts: string[] = [];

  parts.push(defs(id, style, phase, wetness));
  // Important: outside the water/banks is transparent. The negative-Z
  // renderer already drew the terrain below; repainting a grass square here
  // made rivers look like flat decals instead of carved channels.

  if (variant === 'isolated') {
    drawPond(parts, style, id, phase, wetness, turbulence, seed);
  } else {
    const minEdge = -EDGE_OVERDRAW;
    const maxEdge = 144 + EDGE_OVERDRAW;
    const isCorner = isCornerConnection(conn);
    // Submerged trench shadow, drawn underneath all water/bank color. This
    // makes the negative-Z plane read as carved down, not just blue paint.
    parts.push(`<g opacity="0.30" fill="rgba(0,0,0,0.55)">`);
    if (isCorner) {
      parts.push(`<path d="${cornerPath(conn)}" stroke="rgba(0,0,0,0.80)" stroke-width="${(chW + 18).toFixed(1)}" fill="none" stroke-linecap="butt" stroke-linejoin="round"/>`);
    } else if (conn.top || conn.bottom) {
      const y1 = conn.top ? minEdge : off - 4;
      const y2 = conn.bottom ? maxEdge : off + chW + 4;
      parts.push(`<rect x="${(off - 9).toFixed(1)}" y="${y1.toFixed(1)}" width="${(chW + 18).toFixed(1)}" height="${(y2 - y1).toFixed(1)}" rx="5"/>`);
    }
    if (!isCorner && (conn.left || conn.right)) {
      const x1 = conn.left ? minEdge : off - 4;
      const x2 = conn.right ? maxEdge : off + chW + 4;
      parts.push(`<rect x="${x1.toFixed(1)}" y="${(off - 9).toFixed(1)}" width="${(x2 - x1).toFixed(1)}" height="${(chW + 18).toFixed(1)}" rx="5"/>`);
    }
    parts.push(`</g>`);

    if (isCorner) {
      drawRoundedCornerJoin(parts, style, conn, chW);
    } else if (conn.top || conn.bottom) {
      const y1 = conn.top ? minEdge : off;
      const y2 = conn.bottom ? maxEdge : off + chW;
      parts.push(`<rect x="${(off - 4).toFixed(1)}" y="${y1.toFixed(1)}" width="${(chW + 8).toFixed(1)}" height="${(y2 - y1).toFixed(1)}" fill="url(#${id}-v)"/>`);
      drawRectSegments(
        parts,
        false,
        off + 13,
        chW - 26,
        conn.top ? minEdge : off + 8,
        conn.bottom ? maxEdge : off + chW - 8,
        (conn.left || conn.right) ? off + 13 : null,
        (conn.left || conn.right) ? off + chW - 13 : null,
        rgba(style.deep, 0.28),
      );
    }
    if (!isCorner && (conn.left || conn.right)) {
      const x1 = conn.left ? minEdge : off;
      const x2 = conn.right ? maxEdge : off + chW;
      parts.push(`<rect x="${x1.toFixed(1)}" y="${(off - 4).toFixed(1)}" width="${(x2 - x1).toFixed(1)}" height="${(chW + 8).toFixed(1)}" fill="url(#${id}-h)"/>`);
      drawRectSegments(
        parts,
        true,
        off + 13,
        chW - 26,
        conn.left ? minEdge : off + 8,
        conn.right ? maxEdge : off + chW - 8,
        (conn.top || conn.bottom) ? off + 13 : null,
        (conn.top || conn.bottom) ? off + chW - 13 : null,
        rgba(style.deep, 0.28),
      );
    }

    const bankAmp = 2.3 + hash01(`${seed}:bank-amp`) * 1.9;
    if (!conn.top) {
      const by = off - 4;
      const x1 = conn.left ? 0 : off - 8;
      const x2 = conn.right ? 144 : off + chW + 8;
      parts.push(`<path d="${bankPath(x1, by, x2, by, 1, phase, bankAmp)} L ${x2.toFixed(1)} ${(by + bankW).toFixed(1)} L ${x1.toFixed(1)} ${(by + bankW).toFixed(1)} Z" fill="${mix(style.bankOuter, style.bankWet, wetness * 0.25)}"/>`);
    }
    if (!conn.bottom) {
      const by = off + chW + 4;
      const x1 = conn.left ? 0 : off - 8;
      const x2 = conn.right ? 144 : off + chW + 8;
      parts.push(`<path d="${bankPath(x1, by, x2, by, -1, phase + 1.7, bankAmp)} L ${x2.toFixed(1)} ${(by - bankW).toFixed(1)} L ${x1.toFixed(1)} ${(by - bankW).toFixed(1)} Z" fill="${mix(style.bankInner, style.bankWet, wetness * 0.34)}"/>`);
    }
    if (!conn.left) {
      const bx = off - 4;
      const y1 = conn.top ? 0 : off - 8;
      const y2 = conn.bottom ? 144 : off + chW + 8;
      parts.push(`<path d="${bankPath(bx, y1, bx, y2, 1, phase + 0.8, bankAmp)} L ${(bx + bankW).toFixed(1)} ${y2.toFixed(1)} L ${(bx + bankW).toFixed(1)} ${y1.toFixed(1)} Z" fill="${mix(style.bankInner, style.bankWet, wetness * 0.22)}"/>`);
    }
    if (!conn.right) {
      const bx = off + chW + 4;
      const y1 = conn.top ? 0 : off - 8;
      const y2 = conn.bottom ? 144 : off + chW + 8;
      parts.push(`<path d="${bankPath(bx, y1, bx, y2, -1, phase + 2.2, bankAmp)} L ${(bx - bankW).toFixed(1)} ${y2.toFixed(1)} L ${(bx - bankW).toFixed(1)} ${y1.toFixed(1)} Z" fill="${mix(style.bankOuter, style.bankWet, wetness * 0.28)}"/>`);
    }

    // Corner banks intentionally overlap into the channel to make a carved
    // shore. Repaint the curved water path on top so the bend stays visually
    // continuous with its neighbouring straight river tiles.
    if (isCorner) {
      drawRoundedCornerJoin(parts, style, conn, chW);
    }
    drawRipples(parts, style, conn, off, chW, phase, turbulence, seed);
  }

  parts.push(`<g fill="${style.pebble}" opacity="0.34">`);
  for (let i = 0; i < 7; i++) {
    const h = hash01(`${seed}:pebble:${i}`);
    const nearX = h > 0.5 ? off - 7 + h * 8 : off + chW + 2 + h * 8;
    const nearY = 12 + hash01(`${seed}:pebble-y:${i}`) * 118;
    parts.push(`<circle cx="${nearX.toFixed(1)}" cy="${nearY.toFixed(1)}" r="${(1 + h * 1.8).toFixed(1)}"/>`);
  }
  parts.push('</g>');
  parts.push(`<g stroke="${style.vegetation}" stroke-width="1.2" stroke-linecap="round" opacity="0.48">`);
  for (let i = 0; i < 8; i++) {
    const h = hash01(`${seed}:reed:${i}`);
    const x = h > 0.5 ? off - 3 + h * 7 : off + chW - h * 7;
    const y = 10 + hash01(`${seed}:reed-y:${i}`) * 124;
    parts.push(`<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + (h - 0.5) * 8).toFixed(1)}" y2="${(y - 7 - h * 4).toFixed(1)}"/>`);
  }
  parts.push('</g>');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    ${parts.join('\n    ')}
  </svg>`;
}

export function svgRiverBank(
  variant: FeatureVariant,
  connections?: FeatureConnections,
  worldCol = 0,
  worldRow = 0,
  options: WaterFactoryOptions = {},
): string {
  const conn = connectionsFromVariant(variant, connections);
  const style = waterStyleForTile(options.style, worldCol, worldRow, variant, options);
  const seed = options.seed ?? `${style.id}:bank:${worldCol}:${worldRow}:${variant}`;
  const frameCount = Math.max(1, options.frameCount ?? 8);
  const frame = ((options.frame ?? 0) % frameCount + frameCount) % frameCount;
  const phase = (frame / frameCount) * Math.PI * 2 * style.flowSpeed + hash01(`${seed}:phase`) * Math.PI * 2;
  const wetness = clamp01(0.42 + (options.wetness ?? 0) + hash01(`${seed}:wet`) * 0.12);
  const chW = Math.max(42, style.channelWidth * 0.62);
  const off = (144 - chW) / 2;
  const bankW = style.bankWidth + 5;
  const waterW = Math.max(18, chW * 0.42);
  const waterOff = (144 - waterW) / 2;
  const isCorner = isCornerConnection(conn);
  const bankAmp = 1.8 + hash01(`${seed}:bank-amp`) * 1.4;
  const id = `river-bank-${style.id}-${variant}-${worldCol}-${worldRow}-${frame}`.replace(/[^a-zA-Z0-9_-]/g, '');
  const parts: string[] = [];

  parts.push(`<defs>
    <linearGradient id="${id}-wet-h" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${mix(style.bankOuter, style.bankWet, wetness * 0.30)}"/>
      <stop offset="48%" stop-color="${mix(style.bankInner, style.bankWet, wetness * 0.45)}"/>
      <stop offset="100%" stop-color="${rgba(style.shallow, 0.58)}"/>
    </linearGradient>
    <linearGradient id="${id}-wet-v" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${mix(style.bankOuter, style.bankWet, wetness * 0.30)}"/>
      <stop offset="48%" stop-color="${mix(style.bankInner, style.bankWet, wetness * 0.45)}"/>
      <stop offset="100%" stop-color="${rgba(style.shallow, 0.58)}"/>
    </linearGradient>
  </defs>`);

  if (variant === 'isolated') {
    parts.push(`<ellipse cx="72" cy="72" rx="45" ry="35" fill="${rgba(style.bankWet, 0.68)}"/>`);
    parts.push(`<ellipse cx="72" cy="72" rx="31" ry="23" fill="${rgba(style.shallow, 0.42)}"/>`);
  } else if (isCorner) {
    const d = cornerPath(conn);
    parts.push(`<path d="${d}" stroke="${mix(style.bankOuter, style.bankWet, wetness * 0.28)}" stroke-width="${(chW + bankW).toFixed(1)}" fill="none" stroke-linecap="butt" stroke-linejoin="round"/>`);
    parts.push(`<path d="${d}" stroke="${rgba(style.shallow, 0.54)}" stroke-width="${waterW.toFixed(1)}" fill="none" stroke-linecap="butt" stroke-linejoin="round"/>`);
  } else {
    if (conn.left || conn.right) {
      const x1 = conn.left ? -EDGE_OVERDRAW : off;
      const x2 = conn.right ? 144 + EDGE_OVERDRAW : off + chW;
      parts.push(`<path d="${bankPath(x1, off, x2, off, 1, phase, bankAmp)} L ${x2.toFixed(1)} ${(off + chW + bankW * 0.35).toFixed(1)} L ${x1.toFixed(1)} ${(off + chW + bankW * 0.35).toFixed(1)} Z" fill="url(#${id}-wet-h)" opacity="0.86"/>`);
      parts.push(`<rect x="${(conn.left ? -EDGE_OVERDRAW : waterOff).toFixed(1)}" y="${(waterOff + 4).toFixed(1)}" width="${((conn.right ? 144 + EDGE_OVERDRAW : waterOff + waterW) - (conn.left ? -EDGE_OVERDRAW : waterOff)).toFixed(1)}" height="${(waterW - 8).toFixed(1)}" fill="${rgba(style.shallow, 0.32)}" rx="5"/>`);
    }
    if (conn.top || conn.bottom) {
      const y1 = conn.top ? -EDGE_OVERDRAW : off;
      const y2 = conn.bottom ? 144 + EDGE_OVERDRAW : off + chW;
      parts.push(`<path d="${bankPath(off, y1, off, y2, 1, phase + 0.7, bankAmp)} L ${(off + chW + bankW * 0.35).toFixed(1)} ${y2.toFixed(1)} L ${(off + chW + bankW * 0.35).toFixed(1)} ${y1.toFixed(1)} Z" fill="url(#${id}-wet-v)" opacity="0.86"/>`);
      parts.push(`<rect x="${(waterOff + 4).toFixed(1)}" y="${(conn.top ? -EDGE_OVERDRAW : waterOff).toFixed(1)}" width="${(waterW - 8).toFixed(1)}" height="${((conn.bottom ? 144 + EDGE_OVERDRAW : waterOff + waterW) - (conn.top ? -EDGE_OVERDRAW : waterOff)).toFixed(1)}" fill="${rgba(style.shallow, 0.32)}" rx="5"/>`);
    }
    if ((conn.top || conn.bottom) && (conn.left || conn.right)) {
      parts.push(`<circle cx="72" cy="72" r="${(waterW * 0.58).toFixed(1)}" fill="${rgba(style.shallow, 0.34)}"/>`);
    }
  }

  parts.push(`<g fill="${style.pebble}" opacity="0.32">`);
  for (let i = 0; i < 9; i++) {
    const h = hash01(`${seed}:pebble:${i}`);
    const x = 12 + hash01(`${seed}:px:${i}`) * 120;
    const y = 12 + hash01(`${seed}:py:${i}`) * 120;
    if (Math.abs(x - 72) < waterW * 0.24 && Math.abs(y - 72) < waterW * 0.24) continue;
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.9 + h * 1.6).toFixed(1)}"/>`);
  }
  parts.push('</g>');
  parts.push(`<g stroke="${style.vegetation}" stroke-width="1.2" stroke-linecap="round" opacity="0.42">`);
  for (let i = 0; i < 10; i++) {
    const h = hash01(`${seed}:reed:${i}`);
    const side = h > 0.5 ? -1 : 1;
    const x = 72 + side * (chW * 0.42 + h * 14);
    const y = 12 + hash01(`${seed}:reed-y:${i}`) * 120;
    parts.push(`<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + (h - 0.5) * 7).toFixed(1)}" y2="${(y - 6 - h * 4).toFixed(1)}"/>`);
  }
  parts.push('</g>');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    ${parts.join('\n    ')}
  </svg>`;
}

export function svgWaterFrameStrip(
  variant: FeatureVariant,
  connections: FeatureConnections | undefined,
  worldCol: number,
  worldRow: number,
  frameCount = 6,
  options: Omit<WaterFactoryOptions, 'frame' | 'frameCount'> = {},
): string {
  const frames: string[] = [];
  for (let frame = 0; frame < frameCount; frame++) {
    const inner = svgWater(variant, connections, worldCol, worldRow, { ...options, frame, frameCount })
      .replace(/^\s*<svg[^>]*>/i, '')
      .replace(/<\/svg>\s*$/i, '')
      .trim();
    frames.push(`<g transform="translate(${frame * 144},0)"><svg width="144" height="144" viewBox="0 0 144 144">${inner}</svg></g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${144 * frameCount}" height="144" viewBox="0 0 ${144 * frameCount} 144">${frames.join('\n')}</svg>`;
}
