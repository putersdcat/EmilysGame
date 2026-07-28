/**
 * Procedural negative-Z water SVG factory (D.6 port).
 * Source: experiment/isometric-2.0/src/textures/water-family.ts
 */

import type { FeatureConnections, FeatureVariant, WaterFactoryOptions } from './types';
import {
  bankPath,
  connectionsFromVariant,
  cornerPath,
  drawRectSegments,
  isCornerConnection,
  WATER_EDGE_OVERDRAW,
} from './geometry';
import {
  drawBankReedsAndPebbles,
  drawPond,
  drawRipples,
  drawRiverBankDetails,
  drawRoundedCornerJoin,
  waterDefs,
} from './effects';
import { chooseWaterStyle, waterStyleForTile } from './styles';
import { clamp01, hash01, mix, rgba } from './utils';

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
  const style = chooseWaterStyle(options.style, worldCol, worldRow, variant, options);
  const seed = options.seed ?? `${style.id}:${worldCol}:${worldRow}:${variant}`;
  const phase = (frame / frameCount) * Math.PI * 2 * style.flowSpeed + hash01(`${seed}:phase`) * Math.PI * 2;
  const wetness = clamp01(0.46 + (options.wetness ?? 0) + hash01(`${seed}:wet`) * 0.10);
  const turbulence = clamp01(0.12 + (options.turbulence ?? 0) + hash01(`${seed}:turb`) * 0.10);
  const chW = style.channelWidth;
  const off = (144 - chW) / 2;
  const bankW = style.bankWidth;
  const id = `water-${style.id}-${variant}-${worldCol}-${worldRow}-${frame}`.replace(/[^a-zA-Z0-9_-]/g, '');
  const parts: string[] = [];

  parts.push(waterDefs(id, style, phase, wetness));

  if (variant === 'isolated') {
    drawPond(parts, style, id, phase, wetness, turbulence, seed);
  } else {
    const minEdge = -WATER_EDGE_OVERDRAW;
    const maxEdge = 144 + WATER_EDGE_OVERDRAW;
    const isCorner = isCornerConnection(conn);

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
    parts.push('</g>');

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

    if (isCorner) drawRoundedCornerJoin(parts, style, conn, chW);
    drawRipples(parts, style, conn, off, chW, phase, turbulence, seed);
  }

  drawBankReedsAndPebbles(parts, style, seed, off, chW);

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
      const x1 = conn.left ? -WATER_EDGE_OVERDRAW : off;
      const x2 = conn.right ? 144 + WATER_EDGE_OVERDRAW : off + chW;
      parts.push(`<path d="${bankPath(x1, off, x2, off, 1, phase, bankAmp)} L ${x2.toFixed(1)} ${(off + chW + bankW * 0.35).toFixed(1)} L ${x1.toFixed(1)} ${(off + chW + bankW * 0.35).toFixed(1)} Z" fill="url(#${id}-wet-h)" opacity="0.86"/>`);
      parts.push(`<rect x="${(conn.left ? -WATER_EDGE_OVERDRAW : waterOff).toFixed(1)}" y="${(waterOff + 4).toFixed(1)}" width="${((conn.right ? 144 + WATER_EDGE_OVERDRAW : waterOff + waterW) - (conn.left ? -WATER_EDGE_OVERDRAW : waterOff)).toFixed(1)}" height="${(waterW - 8).toFixed(1)}" fill="${rgba(style.shallow, 0.32)}" rx="5"/>`);
    }
    if (conn.top || conn.bottom) {
      const y1 = conn.top ? -WATER_EDGE_OVERDRAW : off;
      const y2 = conn.bottom ? 144 + WATER_EDGE_OVERDRAW : off + chW;
      parts.push(`<path d="${bankPath(off, y1, off, y2, 1, phase + 0.7, bankAmp)} L ${(off + chW + bankW * 0.35).toFixed(1)} ${y2.toFixed(1)} L ${(off + chW + bankW * 0.35).toFixed(1)} ${y1.toFixed(1)} Z" fill="url(#${id}-wet-v)" opacity="0.86"/>`);
      parts.push(`<rect x="${(waterOff + 4).toFixed(1)}" y="${(conn.top ? -WATER_EDGE_OVERDRAW : waterOff).toFixed(1)}" width="${(waterW - 8).toFixed(1)}" height="${((conn.bottom ? 144 + WATER_EDGE_OVERDRAW : waterOff + waterW) - (conn.top ? -WATER_EDGE_OVERDRAW : waterOff)).toFixed(1)}" fill="${rgba(style.shallow, 0.32)}" rx="5"/>`);
    }
    if ((conn.top || conn.bottom) && (conn.left || conn.right)) {
      parts.push(`<circle cx="72" cy="72" r="${(waterW * 0.58).toFixed(1)}" fill="${rgba(style.shallow, 0.34)}"/>`);
    }
  }

  drawRiverBankDetails(parts, style, seed, chW, waterW);

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
