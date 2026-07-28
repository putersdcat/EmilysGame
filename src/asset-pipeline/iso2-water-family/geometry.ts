/** Geometry helpers for connected river and bank SVG paths. */

import type { FeatureConnections, FeatureVariant } from './types';

export const WATER_EDGE_OVERDRAW = 34;

export function connectionsFromVariant(
  variant: FeatureVariant,
  conn?: FeatureConnections,
): FeatureConnections {
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

export function bankPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  waveSide: number,
  phase: number,
  amp: number,
): string {
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

export function connectionCount(conn: FeatureConnections): number {
  return (conn.top ? 1 : 0) + (conn.right ? 1 : 0) + (conn.bottom ? 1 : 0) + (conn.left ? 1 : 0);
}

export function edgePoint(dir: 'top' | 'right' | 'bottom' | 'left'): { x: number; y: number } {
  switch (dir) {
    case 'top': return { x: 72, y: -4 };
    case 'right': return { x: 148, y: 72 };
    case 'bottom': return { x: 72, y: 148 };
    case 'left': return { x: -4, y: 72 };
  }
}

export function isCornerConnection(conn: FeatureConnections): boolean {
  if (connectionCount(conn) !== 2) return false;
  return !((conn.top && conn.bottom) || (conn.left && conn.right));
}

export function cornerPath(conn: FeatureConnections): string {
  const dirs = (['top', 'right', 'bottom', 'left'] as const).filter((d) => conn[d]);
  const a = edgePoint(dirs[0]!);
  const b = edgePoint(dirs[1]!);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q 72 72 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export function drawRectSegments(
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
