/**
 * red-clinker.ts — factory-backed red clinker brick material.
 *
 * Keeps the proven 48×48 modular brick geometry / face-slice contract, now
 * supplied by brick-family.ts so sibling palettes share the exact same rules.
 */

import { BRICK_IMAGE_SIZE, createBrickMaterial, type BrickPaletteSpec } from './brick-family';

export const IMAGE_SIZE = BRICK_IMAGE_SIZE;

export const PALETTE: BrickPaletteSpec = {
  mortar: '#2a201c',
  rBase: 136,
  gBase: 55,
  bBase: 29,
  rVar: 24,
  gVar: 14,
  bVar: 9,
  rMin: 84,
  gMin: 30,
  bMin: 16,
  rMax: 188,
  gMax: 88,
  bMax: 52,
  hi: [28, 20, 12],
  lo: [28, 20, 14],
  salt: 0xC11A,
  topOpacity: 0.92,
};

const material = createBrickMaterial(PALETTE);

export const svg = material.svg;
export const svgTop = material.svgTop;
export const svgTopV = material.svgTopV;
export const svgSouth = material.svgSouth;
export const svgEast = material.svgEast;
export const svgEnd = material.svgEnd;
