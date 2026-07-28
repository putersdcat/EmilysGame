/**
 * roof-family.ts — reusable roof material primitives.
 *
 * This first slice produces SVG source textures for roof nano primitives:
 * slope-left, slope-right, and ridge. The renderer clips these textures into
 * sloped isometric roof geometry rather than treating them as wall faces.
 */

export const ROOF_IMAGE_SIZE = 144;

const SIZE = ROOF_IMAGE_SIZE;

export type RoofPrimitiveKind = 'roof-slope-left' | 'roof-slope-right' | 'roof-ridge';

export interface RoofPaletteSpec {
  readonly base: string;
  readonly dark: string;
  readonly light: string;
  readonly straw: readonly string[];
  readonly ridge: string;
  readonly ridgeDark: string;
  readonly gableBase: string;
  readonly gableTrim: string;
  readonly gableShadow: string;
  readonly salt: number;
}

export interface RoofMaterial {
  readonly IMAGE_SIZE: typeof ROOF_IMAGE_SIZE;
  svgSlopeLeft(): string;
  svgSlopeRight(): string;
  svgRidge(): string;
  svgGable(): string;
  svgFor(kind: RoofPrimitiveKind): string;
}

function hash01(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function wrap(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    ${body}
  </svg>`;
}

function strawField(spec: RoofPaletteSpec, dir: 'left' | 'right'): string {
  const parts: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${spec.base}" />`];
  const slope = dir === 'left' ? 0.46 : -0.46;

  for (let i = -8; i < 28; i++) {
    const y = i * 7 + Math.floor(hash01(i, spec.salt, 11) * 3);
    const color = spec.straw[Math.abs(i + spec.salt) % spec.straw.length]!;
    const x1 = -18;
    const x2 = SIZE + 18;
    const y1 = y;
    const y2 = y + slope * (x2 - x1);
    parts.push(`<path d="M ${x1} ${y1.toFixed(1)} L ${x2} ${y2.toFixed(1)}" stroke="${color}" stroke-width="${(1.0 + hash01(i, spec.salt, 17) * 1.8).toFixed(1)}" opacity="${(0.38 + hash01(i, spec.salt, 19) * 0.42).toFixed(2)}" />`);
  }

  for (let i = 0; i < 54; i++) {
    const x = hash01(i, spec.salt, 31) * SIZE;
    const y = hash01(i, spec.salt, 37) * SIZE;
    const len = 5 + hash01(i, spec.salt, 41) * 14;
    const dx = dir === 'left' ? len : -len;
    const dy = len * 0.35;
    parts.push(`<path d="M ${x.toFixed(1)} ${y.toFixed(1)} l ${dx.toFixed(1)} ${dy.toFixed(1)}" stroke="${spec.dark}" stroke-width="1" opacity="${(0.12 + hash01(i, spec.salt, 43) * 0.20).toFixed(2)}" />`);
  }

  // Eave shadow strip; clipped by the renderer into the roof plane.
  parts.push(`<rect x="0" y="${SIZE - 14}" width="${SIZE}" height="14" fill="${spec.dark}" opacity="0.18" />`);
  parts.push(`<rect x="0" y="0" width="${SIZE}" height="8" fill="${spec.light}" opacity="0.16" />`);
  return parts.join('\n    ');
}

function ridgeField(spec: RoofPaletteSpec): string {
  const parts: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${spec.ridge}" />`];
  for (let y = 4; y < SIZE; y += 10) {
    parts.push(`<path d="M 0 ${y} C 28 ${y + 5}, 54 ${y - 5}, 82 ${y + 2} S 126 ${y + 2}, 144 ${y - 2}" stroke="${spec.ridgeDark}" stroke-width="3" fill="none" opacity="0.35" />`);
    parts.push(`<path d="M 0 ${y + 2} C 30 ${y + 6}, 62 ${y - 3}, 94 ${y + 4} S 132 ${y + 1}, 144 ${y + 3}" stroke="${spec.light}" stroke-width="1.5" fill="none" opacity="0.28" />`);
  }
  return parts.join('\n    ');
}

function gableField(spec: RoofPaletteSpec): string {
  const parts: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${spec.gableBase}" />`];
  parts.push(`<path d="M 0 0 L ${SIZE} ${SIZE}" stroke="${spec.gableTrim}" stroke-width="8" opacity="0.92" />`);
  parts.push(`<path d="M ${SIZE} 0 L 0 ${SIZE}" stroke="${spec.gableTrim}" stroke-width="5" opacity="0.62" />`);
  for (let y = 10; y < SIZE; y += 18) {
    parts.push(`<path d="M 0 ${y} H ${SIZE}" stroke="${spec.gableShadow}" stroke-width="2" opacity="0.18" />`);
  }
  for (let x = 12; x < SIZE; x += 24) {
    const wobble = (hash01(x, spec.salt, 71) - 0.5) * 5;
    parts.push(`<path d="M ${(x + wobble).toFixed(1)} 0 V ${SIZE}" stroke="${spec.gableTrim}" stroke-width="2.4" opacity="0.22" />`);
  }
  return parts.join('\n    ');
}

export function createRoofMaterial(spec: RoofPaletteSpec): RoofMaterial {
  let left: string | null = null;
  let right: string | null = null;
  let ridge: string | null = null;
  let gable: string | null = null;

  return {
    IMAGE_SIZE: ROOF_IMAGE_SIZE,
    svgSlopeLeft(): string {
      left ??= wrap(strawField(spec, 'left'));
      return left;
    },
    svgSlopeRight(): string {
      right ??= wrap(strawField(spec, 'right'));
      return right;
    },
    svgRidge(): string {
      ridge ??= wrap(ridgeField(spec));
      return ridge;
    },
    svgGable(): string {
      gable ??= wrap(gableField(spec));
      return gable;
    },
    svgFor(kind: RoofPrimitiveKind): string {
      if (kind === 'roof-slope-left') return this.svgSlopeLeft();
      if (kind === 'roof-slope-right') return this.svgSlopeRight();
      return this.svgRidge();
    },
  };
}
