/**
 * nano-tile-svgs.ts — SVG texture generators for nano tile rendering.
 * Ported from experiment/isometric-2.0/src/solver.ts SVG generation functions.
 *
 * Produces 144×144 SVG strings for:
 *  - Stone wall side texture (stoneWallSvg)
 *  - Stone wall top cap (stoneWallTopSvg)
 *  - Wooden fence side texture (woodenFenceSvg)
 *
 * All outputs are transparent-background 144×144 SVGs suitable for
 * loadSvgImage / drawExtrudedNano / drawPositiveNano render paths.
 *
 * TODO: DOC — brick course direction rationale, variant footprint math
 * @see experiment/isometric-2.0/src/solver.ts — original source
 */

import type { IsoFeatureVariant as FeatureVariant } from '../types/iso-renderer.types.js';
import { wallBounds } from '../iso2-solver.js';

// Barrel re-exports for the walkability + solver metadata port (src/iso2-solver.ts).
// Existing call sites that did `import { wallBounds } from './nano-tile-svgs'` continue to work.
export {
  wallBounds,
  pointHitsWallFootprint,
  pointHitsFenceFootprint,
  isPointWalkableInTile,
  buildWalkableMap,
  resolveCondition,
  connectionsToBitmask,
  bitmaskToConnections,
  variantFromBitmask,
  resolveVariants,
} from '../iso2-solver.js';
import { DarkCathedralStone, StoneBrick, TimberFrameWall } from '../iso2-materials.js';

const MICRO_TILE_SIZE = 144;
const LEGACY_TILE_SIZE = 128;
// (WALL_THICKNESS / footprint constants centralized in src/iso2-solver.ts with the walkability port)
// (WALL_OFFSET / footprint logic centralized in src/iso2-solver.ts after the walkability port)
const LEGACY_TO_MICRO_SCALE = MICRO_TILE_SIZE / LEGACY_TILE_SIZE;

// ─── Shared Procedural Material Helpers ─────────────────────────────────────

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
  const clean = hex.replace('#', '').trim().padEnd(6, '0').slice(0, 6);
  return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp01(alpha).toFixed(3)})`;
}

function mixHex(a: string, b: string, t: number): string {
  const aa = hexToRgb(a); const bb = hexToRgb(b); const k = clamp01(t);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${ch(aa.r, bb.r)}${ch(aa.g, bb.g)}${ch(aa.b, bb.b)}`;
}

// ─── Rustic Fence Material Factory ──────────────────────────────────────────

export type NanoFenceStyleId = 'weathered-post-rail' | 'split-rail-oak' | 'rough-picket' | 'mossy-farm-rail';

interface NanoFenceMaterial {
  readonly id: NanoFenceStyleId;
  readonly post: string;
  readonly postShadow: string;
  readonly postHighlight: string;
  readonly rail: string;
  readonly railShadow: string;
  readonly railHighlight: string;
  readonly bleach: string;
  readonly moss: string;
  readonly grime: string;
  readonly crack: string;
  readonly postWidth: number;
  readonly railThickness: number;
  readonly railCount: number;
  readonly sag: number;
  readonly roughness: number;
  readonly pickets: boolean;
}

const FENCE_MATERIALS: Record<NanoFenceStyleId, NanoFenceMaterial> = {
  'weathered-post-rail': {
    id: 'weathered-post-rail', post: '#6f5c48', postShadow: '#433528', postHighlight: '#a08f77',
    rail: '#7a6852', railShadow: '#493a2c', railHighlight: '#aa987f', bleach: '#d0c2aa',
    moss: '#536544', grime: '#3d3126', crack: '#2b2119', postWidth: 8, railThickness: 5, railCount: 2,
    sag: 0.8, roughness: 0.24, pickets: false,
  },
  'split-rail-oak': {
    id: 'split-rail-oak', post: '#665038', postShadow: '#382919', postHighlight: '#947251',
    rail: '#73583a', railShadow: '#3c2819', railHighlight: '#9f7b53', bleach: '#c5b08f',
    moss: '#546542', grime: '#34271d', crack: '#261b13', postWidth: 7, railThickness: 6, railCount: 2,
    sag: 1.8, roughness: 0.62, pickets: false,
  },
  'rough-picket': {
    id: 'rough-picket', post: '#72624b', postShadow: '#453729', postHighlight: '#a79479',
    rail: '#806b50', railShadow: '#4a3a2b', railHighlight: '#b19878', bleach: '#cfbea2',
    moss: '#556947', grime: '#3b3126', crack: '#2a2018', postWidth: 8, railThickness: 4, railCount: 2,
    sag: 0.2, roughness: 0.22, pickets: true,
  },
  'mossy-farm-rail': {
    id: 'mossy-farm-rail', post: '#645742', postShadow: '#3c3225', postHighlight: '#96886d',
    rail: '#70644e', railShadow: '#40372a', railHighlight: '#9f9279', bleach: '#bfb49f',
    moss: '#4d6a43', grime: '#372d22', crack: '#241d18', postWidth: 8, railThickness: 5, railCount: 2,
    sag: 0.9, roughness: 0.28, pickets: false,
  },
};

export function listNanoFenceStyles(): readonly NanoFenceStyleId[] {
  return Object.keys(FENCE_MATERIALS) as NanoFenceStyleId[];
}

function fenceMaterial(style: NanoFenceStyleId | undefined, seed: string): NanoFenceMaterial {
  const base = FENCE_MATERIALS[style ?? 'weathered-post-rail'];
  const dry = 0.12 + hash01(`${seed}:dry`) * 0.20;
  const grime = 0.08 + hash01(`${seed}:grime`) * 0.18;
  return {
    ...base,
    post: mixHex(mixHex(base.post, base.bleach, dry), base.grime, grime),
    rail: mixHex(mixHex(base.rail, base.bleach, dry * 0.9), base.grime, grime * 1.08),
    postHighlight: mixHex(base.postHighlight, base.bleach, dry * 0.42),
    railHighlight: mixHex(base.railHighlight, base.bleach, dry * 0.38),
    sag: base.sag + hash01(`${seed}:sag`) * base.roughness * 1.5,
    railThickness: Math.max(3, base.railThickness + (hash01(`${seed}:thick`) - 0.5) * 0.8),
    postWidth: Math.max(5, base.postWidth + (hash01(`${seed}:post`) - 0.5) * 0.8),
  };
}

// ─── Negative-Z Water Material Factory ──────────────────────────────────────

export type NanoWaterStyleId = 'clear-river' | 'muddy-creek' | 'deep-pond' | 'marsh-water';

interface NanoWaterMaterial {
  readonly id: NanoWaterStyleId;
  readonly bankOuter: string;
  readonly bankInner: string;
  readonly bankWet: string;
  readonly shallow: string;
  readonly mid: string;
  readonly deep: string;
  readonly foam: string;
  readonly glint: string;
  readonly channelWidth: number;
  readonly bankWidth: number;
}

const WATER_MATERIALS: Record<NanoWaterStyleId, NanoWaterMaterial> = {
  'clear-river': { id: 'clear-river', bankOuter: '#5f6530', bankInner: '#786733', bankWet: '#3f512e', shallow: '#2b86a8', mid: '#1b638f', deep: '#0d345f', foam: '#a8d9e8', glint: '#e8fff8', channelWidth: 64, bankWidth: 11 },
  'muddy-creek': { id: 'muddy-creek', bankOuter: '#6a5429', bankInner: '#806439', bankWet: '#3e3524', shallow: '#617845', mid: '#3d684f', deep: '#244b46', foam: '#b7caa6', glint: '#e4e8cf', channelWidth: 58, bankWidth: 13 },
  'deep-pond': { id: 'deep-pond', bankOuter: '#5a4a28', bankInner: '#746035', bankWet: '#303c2a', shallow: '#286b86', mid: '#174f78', deep: '#082b50', foam: '#87bfd4', glint: '#e5fff7', channelWidth: 70, bankWidth: 12 },
  'marsh-water': { id: 'marsh-water', bankOuter: '#596b32', bankInner: '#69753d', bankWet: '#344529', shallow: '#52774a', mid: '#356751', deep: '#1d4744', foam: '#a8c49d', glint: '#d9eed2', channelWidth: 62, bankWidth: 14 },
};

export function listNanoWaterStyles(): readonly NanoWaterStyleId[] {
  return Object.keys(WATER_MATERIALS) as NanoWaterStyleId[];
}

function connectionsForVariant(variant: FeatureVariant): { top: boolean; right: boolean; bottom: boolean; left: boolean } {
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

function edgePoint(dir: 'top' | 'right' | 'bottom' | 'left'): { x: number; y: number } {
  switch (dir) {
    case 'top': return { x: 72, y: -34 };
    case 'right': return { x: 178, y: 72 };
    case 'bottom': return { x: 72, y: 178 };
    case 'left': return { x: -34, y: 72 };
  }
}

function waterCornerPath(conn: { top: boolean; right: boolean; bottom: boolean; left: boolean }): string {
  const dirs = (['top', 'right', 'bottom', 'left'] as const).filter((d) => conn[d]);
  const a = edgePoint(dirs[0]); const b = edgePoint(dirs[1]);
  return `M ${a.x} ${a.y} Q 72 72 ${b.x} ${b.y}`;
}

/** Procedural negative-Z water SVG. Transparent outside banks; river edges overdraw so adjacent nanos tile. */
export function waterNanoSvg(variant: FeatureVariant = 'straight-h', styleId: NanoWaterStyleId = 'clear-river', frame = 0): string {
  const style = WATER_MATERIALS[variant === 'isolated' ? 'deep-pond' : styleId];
  const conn = connectionsForVariant(variant);
  const count = (conn.top ? 1 : 0) + (conn.right ? 1 : 0) + (conn.bottom ? 1 : 0) + (conn.left ? 1 : 0);
  const isCorner = count === 2 && !((conn.top && conn.bottom) || (conn.left && conn.right));
  const chW = style.channelWidth;
  const off = (144 - chW) / 2;
  const min = -34;
  const max = 178;
  const id = `mw-${style.id}-${variant}-${frame}`.replace(/[^a-zA-Z0-9_-]/g, '');
  const phase = (frame % 8) / 8 * Math.PI * 2;
  const parts: string[] = [
    `<defs><linearGradient id="${id}-h" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${style.bankWet}"/><stop offset="18%" stop-color="${style.shallow}"/><stop offset="50%" stop-color="${style.deep}"/><stop offset="82%" stop-color="${style.mid}"/><stop offset="100%" stop-color="${style.bankWet}"/></linearGradient><linearGradient id="${id}-v" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${style.bankWet}"/><stop offset="18%" stop-color="${style.shallow}"/><stop offset="50%" stop-color="${style.deep}"/><stop offset="82%" stop-color="${style.mid}"/><stop offset="100%" stop-color="${style.bankWet}"/></linearGradient><radialGradient id="${id}-pond" cx="45%" cy="42%" r="64%"><stop offset="0%" stop-color="${style.shallow}"/><stop offset="50%" stop-color="${style.mid}"/><stop offset="100%" stop-color="${style.deep}"/></radialGradient></defs>`,
  ];

  if (variant === 'isolated') {
    parts.push(`<ellipse cx="72" cy="72" rx="48" ry="39" fill="${style.bankOuter}"/>`);
    parts.push(`<ellipse cx="72" cy="72" rx="41" ry="32" fill="${style.bankInner}"/>`);
    parts.push(`<ellipse cx="72" cy="72" rx="35" ry="27" fill="url(#${id}-pond)"/>`);
    parts.push(`<ellipse cx="66" cy="64" rx="18" ry="8" fill="${rgba(style.glint, 0.16)}"/>`);
    for (let i = 0; i < 4; i++) parts.push(`<ellipse cx="${66 + i * 5}" cy="${70 + Math.sin(phase + i) * 3}" rx="${12 + i * 4}" ry="${4 + i}" fill="none" stroke="${rgba(style.foam, 0.20)}" stroke-width="1"/>`);
  } else {
    parts.push(`<g opacity="0.30" fill="rgba(0,0,0,0.65)">`);
    if (isCorner) parts.push(`<path d="${waterCornerPath(conn)}" stroke="rgba(0,0,0,0.85)" stroke-width="${chW + 20}" fill="none" stroke-linecap="butt" stroke-linejoin="round"/>`);
    else {
      if (conn.top || conn.bottom) parts.push(`<rect x="${off - 10}" y="${conn.top ? min : off - 4}" width="${chW + 20}" height="${(conn.bottom ? max : off + chW + 4) - (conn.top ? min : off - 4)}" rx="5"/>`);
      if (conn.left || conn.right) parts.push(`<rect x="${conn.left ? min : off - 4}" y="${off - 10}" width="${(conn.right ? max : off + chW + 4) - (conn.left ? min : off - 4)}" height="${chW + 20}" rx="5"/>`);
    }
    parts.push(`</g>`);
    if (isCorner) {
      const d = waterCornerPath(conn);
      parts.push(`<path d="${d}" stroke="${style.mid}" stroke-width="${chW + 8}" fill="none" stroke-linecap="butt" stroke-linejoin="round"/>`);
      parts.push(`<path d="${d}" stroke="${style.deep}" stroke-width="${Math.max(18, chW - 30)}" fill="none" stroke-linecap="butt" stroke-linejoin="round"/>`);
    } else {
      if (conn.top || conn.bottom) parts.push(`<rect x="${off - 4}" y="${conn.top ? min : off}" width="${chW + 8}" height="${(conn.bottom ? max : off + chW) - (conn.top ? min : off)}" fill="url(#${id}-v)"/>`, `<rect x="${off + 15}" y="${conn.top ? min : off + 10}" width="${Math.max(10, chW - 30)}" height="${(conn.bottom ? max : off + chW - 10) - (conn.top ? min : off + 10)}" fill="${style.deep}" rx="4" opacity="0.92"/>`);
      if (conn.left || conn.right) parts.push(`<rect x="${conn.left ? min : off}" y="${off - 4}" width="${(conn.right ? max : off + chW) - (conn.left ? min : off)}" height="${chW + 8}" fill="url(#${id}-h)"/>`, `<rect x="${conn.left ? min : off + 10}" y="${off + 15}" width="${(conn.right ? max : off + chW - 10) - (conn.left ? min : off + 10)}" height="${Math.max(10, chW - 30)}" fill="${style.deep}" rx="4" opacity="0.92"/>`);
      if ((conn.top || conn.bottom) && (conn.left || conn.right)) parts.push(`<circle cx="72" cy="72" r="${chW * 0.45}" fill="${style.mid}"/>`, `<circle cx="72" cy="72" r="${chW * 0.25}" fill="${style.deep}" opacity="0.92"/>`);
    }
    if (!conn.top) parts.push(`<rect x="${conn.left ? 0 : off - 8}" y="${off - 9}" width="${(conn.right ? 144 : off + chW + 8) - (conn.left ? 0 : off - 8)}" height="${style.bankWidth}" fill="${style.bankOuter}" opacity="0.86"/>`);
    if (!conn.bottom) parts.push(`<rect x="${conn.left ? 0 : off - 8}" y="${off + chW - 2}" width="${(conn.right ? 144 : off + chW + 8) - (conn.left ? 0 : off - 8)}" height="${style.bankWidth}" fill="${style.bankInner}" opacity="0.86"/>`);
    if (!conn.left) parts.push(`<rect x="${off - 9}" y="${conn.top ? 0 : off - 8}" width="${style.bankWidth}" height="${(conn.bottom ? 144 : off + chW + 8) - (conn.top ? 0 : off - 8)}" fill="${style.bankInner}" opacity="0.82"/>`);
    if (!conn.right) parts.push(`<rect x="${off + chW - 2}" y="${conn.top ? 0 : off - 8}" width="${style.bankWidth}" height="${(conn.bottom ? 144 : off + chW + 8) - (conn.top ? 0 : off - 8)}" fill="${style.bankOuter}" opacity="0.82"/>`);
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      parts.push(`<path d="M ${10 + t * 120} ${65 + Math.sin(phase + i) * 4} q 10 ${2 + Math.cos(phase + i) * 2} 20 0" stroke="${rgba(style.foam, 0.16)}" stroke-width="1" fill="none" stroke-linecap="round"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">\n    ${parts.join('\n    ')}\n  </svg>`;
}

// wallBounds (and the rest of the walkability/solver APIs) now come from the iso2-solver port.
// The local definition was removed to centralize after landing the walkability vertical slice.
// Internal callers in this file (footprintTopSvg etc.) use the imported wallBounds from the top of the file.

// ─── Public SVG Generators ────────────────────────────────────────────────────

/**
 * Side/front face texture SVG for a stone wall tile.
 * 144×144, transparent background. Used as `sideTextureSvg` in IsoNanoTile.
 * Variant seeds block variation so adjacent tiles look different.
 */
export function stoneWallSvg(variant: FeatureVariant): string {
  void variant;
  return StoneBrick.svg();
}

export function homesteadWallSvg(_variant: FeatureVariant = 'straight-h'): string {
  return TimberFrameWall.svg();
}

export function cathedralWallSvg(_variant: FeatureVariant = 'straight-h'): string {
  return DarkCathedralStone.svg();
}

function footprintTopSvg(
  variant: FeatureVariant,
  sourceSvg: string,
  outlineAlpha = 0.30,
): string {
  const { rects } = wallBounds(variant);
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(sourceSvg)}`;
  const parts: string[] = [`<defs><pattern id="matP" patternUnits="userSpaceOnUse" width="${MICRO_TILE_SIZE}" height="${MICRO_TILE_SIZE}"><image href="${dataUrl}" width="${MICRO_TILE_SIZE}" height="${MICRO_TILE_SIZE}"/></pattern></defs>`];
  for (const r of rects) {
    parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#matP)"/>`);
    if (outlineAlpha > 0) parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="rgba(0,0,0,${outlineAlpha})" stroke-width="0.8"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MICRO_TILE_SIZE}" height="${MICRO_TILE_SIZE}" viewBox="0 0 ${MICRO_TILE_SIZE} ${MICRO_TILE_SIZE}">\n    ${parts.join('\n    ')}\n  </svg>`;
}

/**
 * Top cap texture SVG for a stone wall tile.
 * 144×144, transparent background. Used as `topTextureSvg` in IsoNanoTile.
 * Only the wall footprint strip is filled; surrounding area is transparent.
 *
 * Brick course direction is matched to wall orientation:
 *  - N/S arms → vertical courses (/ direction on screen)
 *  - E/W arms + center → horizontal courses (\ direction on screen)
 */
export function stoneWallTopSvg(variant: FeatureVariant): string {
  return footprintTopSvg(variant, StoneBrick.svg(), 0.30);
}

export function homesteadWallTopSvg(variant: FeatureVariant): string {
  return footprintTopSvg(variant, TimberFrameWall.svgTop(), 0.18);
}

export function cathedralWallTopSvg(variant: FeatureVariant): string {
  return footprintTopSvg(variant, DarkCathedralStone.svgTop(), 0.12);
}

/**
 * Side-view fence SVG for a wooden fence tile.
 * 144×144, transparent background. Used as `svg` in IsoNanoTile.
 * Posts and rails visible from the front (iso billboarded via drawPositiveNano).
 */
export function woodenFenceSvg(variant: FeatureVariant, styleId: NanoFenceStyleId = 'weathered-post-rail'): string {
  const material = fenceMaterial(styleId, `${styleId}:${variant}`);
  const parts: string[] = [];
  const postW = material.postWidth;
  const railH = material.railThickness;
  const capRy = 3;
  const postTopY = 10;
  const topRailY = 30;
  const botRailY = 80;

  function sidePost(cx: number, topY: number): string {
    const px = cx - postW / 2;
    const h = 128 - topY;
    return [
      `<rect x="${px + 2}" y="${topY + 3}" width="${postW}" height="${h}" rx="1.5" fill="rgba(0,0,0,0.15)" />`,
      `<rect x="${px}" y="${topY}" width="${postW}" height="${h}" rx="2" fill="${material.post}" />`,
      `<rect x="${px + 2}" y="${topY}" width="3" height="${h}" fill="${material.postHighlight}" opacity="0.42" />`,
      `<rect x="${px + postW - 2}" y="${topY}" width="2" height="${h}" fill="${material.postShadow}" opacity="0.45" />`,
      `<rect x="${px + 1}" y="${topY + h * 0.68}" width="${postW - 2}" height="${h * 0.20}" fill="${rgba(material.grime, 0.20)}" />`,
      `<ellipse cx="${cx}" cy="${topY}" rx="${postW / 2}" ry="${capRy}" fill="${mixHex(material.postHighlight, material.bleach, 0.25)}" />`,
      `<path d="M ${px + postW * 0.55} ${topY + 8} l -1 ${h * 0.32} l 1 ${h * 0.18}" stroke="${rgba(material.crack, 0.45)}" stroke-width="0.9" fill="none" />`,
      `<ellipse cx="${cx - 1}" cy="${topY + h * 0.78}" rx="${postW * 0.42}" ry="2" fill="${rgba(material.moss, 0.20)}" />`,
    ].join('\n    ');
  }

  function sideRail(x1: number, x2: number, y: number, lighter: boolean): string {
    const fill = lighter ? material.railHighlight : material.rail;
    const high = lighter ? material.bleach : material.railHighlight;
    const sag = material.sag;
    const path = `M ${x1} ${y} Q ${(x1 + x2) / 2} ${y + sag} ${x2} ${y}`;
    return [
      `<path d="${path}" stroke="rgba(0,0,0,0.13)" stroke-width="${railH + 3}" fill="none" stroke-linecap="round" />`,
      `<path d="${path}" stroke="${material.railShadow}" stroke-width="${railH + 1}" fill="none" stroke-linecap="round" />`,
      `<path d="${path}" stroke="${fill}" stroke-width="${railH}" fill="none" stroke-linecap="round" />`,
      `<path d="M ${x1 + 2} ${y - 1} Q ${(x1 + x2) / 2} ${y + sag * 0.4 - 1} ${x2 - 2} ${y - 1}" stroke="${high}" stroke-width="1.2" opacity="0.32" fill="none" stroke-linecap="round" />`,
    ].join('\n    ');
  }

  // Diagonal / vertex variants
  if (variant === 'diagonal-right' || variant === 'diagonal-left' || variant === 'vertex') {
    const diagParts: string[] = [];
    if (variant === 'vertex') {
      diagParts.push(sidePost(64, postTopY));
    } else {
      const [yL, yR]  = variant === 'diagonal-right' ? [topRailY + 22, topRailY - 8]  : [topRailY - 8,  topRailY + 22];
      const [yL2, yR2] = variant === 'diagonal-right' ? [botRailY + 18, botRailY - 8] : [botRailY - 8, botRailY + 18];
      diagParts.push(
        `<polygon points="0,${yL + railH} 128,${yR + railH} 128,${yR} 0,${yL}" fill="#9a7018" />`,
        `<polygon points="0,${yL + 2} 128,${yR + 2} 128,${yR} 0,${yL}" fill="#b08828" opacity="0.3" />`,
        `<polygon points="0,${yL2 + railH} 128,${yR2 + railH} 128,${yR2} 0,${yL2}" fill="#8B6914" />`,
        `<polygon points="0,${yL2 + 2} 128,${yR2 + 2} 128,${yR2} 0,${yL2}" fill="#a07820" opacity="0.3" />`,
      );
      diagParts.push(sidePost(6,   Math.min(yL,  yL2)  - 6));
      diagParts.push(sidePost(122, Math.min(yR,  yR2) - 6));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${MICRO_TILE_SIZE}" height="${MICRO_TILE_SIZE}" viewBox="0 0 ${MICRO_TILE_SIZE} ${MICRO_TILE_SIZE}">\n    <g transform="scale(${LEGACY_TO_MICRO_SCALE})">${diagParts.join('\n    ')}</g>\n  </svg>`;
  }

  // Orthogonal arm presence
  const arms = { left: false, right: false };
  switch (variant) {
    case 'straight-h': case 'cross': case 'tee-t': case 'tee-b':
    case 'straight-v': case 'end-t': case 'end-b':
      arms.left = arms.right = true; break;
    case 'corner-tr': case 'end-r': case 'tee-l': case 'corner-br':
      arms.right = true; break;
    case 'corner-tl': case 'end-l': case 'tee-r': case 'corner-bl':
      arms.left = true; break;
    default:
      arms.left = arms.right = true; break;
  }

  // Rails behind posts
  if (arms.left && arms.right) {
    parts.push(sideRail(0, 128, topRailY, true));
    parts.push(sideRail(0, 128, botRailY, false));
  } else if (arms.right) {
    parts.push(sideRail(64, 128, topRailY, true));
    parts.push(sideRail(64, 128, botRailY, false));
  } else if (arms.left) {
    parts.push(sideRail(0, 64, topRailY, true));
    parts.push(sideRail(0, 64, botRailY, false));
  }

  // Posts in front of rails
  if (arms.left && arms.right) {
    parts.push(sidePost(6, postTopY));
    parts.push(sidePost(64, postTopY));
    parts.push(sidePost(122, postTopY));
  } else if (arms.right) {
    parts.push(sidePost(64, postTopY));
    parts.push(sidePost(122, postTopY));
  } else if (arms.left) {
    parts.push(sidePost(6, postTopY));
    parts.push(sidePost(64, postTopY));
  } else {
    parts.push(sidePost(64, postTopY));
  }

  if (material.pickets && arms.left && arms.right) {
    for (let x = 18; x <= 110; x += 18) {
      parts.push(`<rect x="${x}" y="22" width="4" height="96" rx="1" fill="${mixHex(material.post, material.rail, 0.35)}" opacity="0.82"/>`);
      parts.push(`<polygon points="${x},22 ${x + 2},17 ${x + 4},22" fill="${material.postHighlight}" opacity="0.8"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MICRO_TILE_SIZE}" height="${MICRO_TILE_SIZE}" viewBox="0 0 ${MICRO_TILE_SIZE} ${MICRO_TILE_SIZE}">\n    <g transform="scale(${LEGACY_TO_MICRO_SCALE})">${parts.join('\n    ')}</g>\n  </svg>`;
}

/** Rustic progression gate SVG for door/quiz gates in the v1 bridge. */
export function woodenGateSvg(unlocked = false, styleId: NanoFenceStyleId = 'weathered-post-rail'): string {
  const material = fenceMaterial(styleId, `${styleId}:gate:${unlocked ? 'open' : 'closed'}`);
  const swingL = unlocked ? -16 : 0;
  const swingR = unlocked ? 16 : 0;
  const rail = (x1: number, x2: number, y: number) => `<path d="M ${x1} ${y} Q ${(x1 + x2) / 2} ${y + material.sag} ${x2} ${y}" stroke="${material.rail}" stroke-width="${material.railThickness}" fill="none" stroke-linecap="round"/>`;
  const leaf = (x: number, w: number, swing: number) => `<g transform="rotate(${swing} ${x} 118)">${rail(x + 4, x + w - 4, 44)}${rail(x + 4, x + w - 4, 82)}<path d="M ${x + 6} 112 L ${x + w - 6} 34" stroke="${material.railShadow}" stroke-width="${Math.max(3, material.railThickness - 1)}" stroke-linecap="round"/><rect x="${x + 2}" y="30" width="3" height="88" fill="${rgba('#25231f', 0.58)}"/></g>`;
  const post = (x: number) => `<rect x="${x - 5}" y="14" width="10" height="110" rx="2" fill="${material.post}"/><rect x="${x - 4}" y="12" width="8" height="5" rx="1" fill="${material.postHighlight}"/><rect x="${x + 2}" y="14" width="2" height="110" fill="${material.postShadow}" opacity="0.45"/>`;
  const lock = unlocked ? '' : `<rect x="58" y="61" width="12" height="9" rx="2" fill="#3f403d"/><path d="M 61 61 Q 61 54 64 54 Q 67 54 67 61" fill="none" stroke="#3f403d" stroke-width="2"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MICRO_TILE_SIZE}" height="${MICRO_TILE_SIZE}" viewBox="0 0 ${MICRO_TILE_SIZE} ${MICRO_TILE_SIZE}">\n    <g transform="scale(${LEGACY_TO_MICRO_SCALE})">${post(10)}${post(118)}${leaf(18, 42, swingL)}${leaf(68, 42, swingR)}${lock}</g>\n  </svg>`;
}

/** Simple plank bridge deck for the transitional main-game nano bridge path. */
export function woodenBridgeSvg(variant: FeatureVariant = 'straight-h'): string {
  const vertical = variant === 'straight-v' || variant === 'end-t' || variant === 'end-b';
  const parts: string[] = [
    `<rect x="4" y="36" width="120" height="56" rx="4" fill="#2d1b10" opacity="0.72"/>`,
    `<rect x="8" y="40" width="112" height="48" rx="3" fill="#7b5635"/>`,
    `<rect x="8" y="40" width="112" height="6" fill="#c19762" opacity="0.48"/>`,
  ];
  if (vertical) {
    for (let x = 12; x <= 108; x += 14) parts.push(`<rect x="${x}" y="38" width="9" height="52" rx="1" fill="#966c42"/><line x1="${x + 8}" y1="41" x2="${x + 8}" y2="87" stroke="#3b2417" stroke-width="1.2" opacity="0.6"/>`);
    parts.push(`<path d="M 8 43 H 120 M 8 86 H 120" stroke="#2f1d13" stroke-width="4" stroke-linecap="round" opacity="0.82"/>`);
  } else {
    for (let y = 44; y <= 80; y += 9) parts.push(`<rect x="10" y="${y}" width="108" height="7" rx="1" fill="#966c42"/><line x1="13" y1="${y + 6}" x2="115" y2="${y + 6}" stroke="#3b2417" stroke-width="1.2" opacity="0.55"/>`);
    parts.push(`<path d="M 13 42 V 88 M 115 42 V 88" stroke="#2f1d13" stroke-width="4" stroke-linecap="round" opacity="0.82"/>`);
  }
  parts.push(`<circle cx="20" cy="56" r="2.2" fill="#20150e" opacity="0.75"/><circle cx="108" cy="74" r="1.8" fill="#20150e" opacity="0.68"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MICRO_TILE_SIZE}" height="${MICRO_TILE_SIZE}" viewBox="0 0 ${MICRO_TILE_SIZE} ${MICRO_TILE_SIZE}">\n    <g transform="scale(${LEGACY_TO_MICRO_SCALE})">${parts.join('\n    ')}</g>\n  </svg>`;
}

export function trollBridgeSvg(unlocked = false): string {
  const parts: string[] = [];
  parts.push(`<rect width="144" height="144" fill="#153f68"/>`);
  parts.push(`<rect x="0" y="32" width="144" height="64" fill="#082f59"/>`);
  const roughColors = ['#6a4a10', '#8B6014', '#5a3a08', '#7a5518'];
  for (let i = 0; i < 5; i++) {
    const py = 38 + i * 11;
    parts.push(`<rect x="18" y="${py}" width="94" height="7" rx="0.5" fill="${roughColors[i % roughColors.length]}"/>`);
    if (i === 1 || i === 3) parts.push(`<rect x="55" y="${py}" width="4" height="7" fill="#2a1a04" opacity="0.5"/>`);
  }
  parts.push(`<rect x="14" y="32" width="7" height="64" rx="1" fill="#5a3a08"/>`);
  parts.push(`<rect x="107" y="32" width="7" height="64" rx="1" fill="#5a3a08"/>`);
  if (!unlocked) {
    parts.push(`<rect x="44" y="14" width="40" height="24" rx="2" fill="#8B4513" stroke="#6a3010" stroke-width="1.5"/>`);
    parts.push(`<text x="64" y="23" text-anchor="middle" font-size="6" font-family="monospace" fill="#ffd700">TROLL</text>`);
    parts.push(`<text x="64" y="31" text-anchor="middle" font-size="5" font-family="monospace" fill="#ffa500">TOLL</text>`);
    parts.push(`<line x1="28" y1="38" x2="44" y2="26" stroke="#888" stroke-width="2"/>`);
    parts.push(`<line x1="84" y1="26" x2="100" y2="38" stroke="#888" stroke-width="2"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">\n    ${parts.join('\n    ')}\n  </svg>`;
}

// Note: wallBounds and the new walkability/solver functions are re-exported at the top
// of this file from '../iso2-solver.js' (the canonical port of the experiment solver).
