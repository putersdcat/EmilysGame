/** SVG effect helpers for the Iso 2.0 water family. */

import type { FeatureConnections, WaterStyle } from './types';
import { bankPath, cornerPath, isCornerConnection } from './geometry';
import { hash01, mix, rgba } from './utils';

export function waterDefs(id: string, style: WaterStyle, phase: number, wetness: number): string {
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

export function drawRipples(
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
    const yStart = conn.top ? -34 : off + 8;
    const yEnd = conn.bottom ? 178 : off + chW - 8;
    const step = Math.max(24, 34 - countMul * 5);
    for (let y = yStart; y < yEnd; y += step) {
      const k = y + phase * 11;
      const x1 = off + 10 + Math.sin(k * 0.11) * 5;
      const x2 = off + chW - 10 + Math.sin(k * 0.13 + 1.7) * 5;
      parts.push(`<path d="M ${x1.toFixed(1)} ${y.toFixed(1)} Q ${(off + chW / 2 + Math.sin(k * 0.08) * 5).toFixed(1)} ${(y + 3 + Math.cos(k * 0.07) * 1.4).toFixed(1)} ${x2.toFixed(1)} ${y.toFixed(1)}" stroke="${rgba(style.foam, 0.55)}" stroke-width="0.9"/>`);
    }
  }
  if (conn.left || conn.right) {
    const xStart = conn.left ? -34 : off + 8;
    const xEnd = conn.right ? 178 : off + chW - 8;
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

export function drawPond(
  parts: string[],
  style: WaterStyle,
  id: string,
  phase: number,
  wetness: number,
  turbulence: number,
  seed: string,
): void {
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

export function drawRoundedCornerJoin(parts: string[], style: WaterStyle, conn: FeatureConnections, chW: number): void {
  if (!isCornerConnection(conn)) return;
  const d = cornerPath(conn);
  parts.push(`<path d="${d}" stroke="${style.mid}" stroke-width="${(chW + 8).toFixed(1)}" fill="none" stroke-linecap="butt" stroke-linejoin="round"/>`);
  parts.push(`<path d="${d}" stroke="${rgba(style.deep, 0.45)}" stroke-width="${(chW - 26).toFixed(1)}" fill="none" stroke-linecap="butt" stroke-linejoin="round"/>`);
}

export function drawBankReedsAndPebbles(
  parts: string[],
  style: WaterStyle,
  seed: string,
  off: number,
  chW: number,
): void {
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
}

export function drawRiverBankDetails(
  parts: string[],
  style: WaterStyle,
  seed: string,
  chW: number,
  waterW: number,
): void {
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
}

export { bankPath };
