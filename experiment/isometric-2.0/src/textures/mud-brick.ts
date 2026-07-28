/** mud-brick.ts — factory-backed warm adobe / packed mud brick material. */

import { BRICK_IMAGE_SIZE, createBrickMaterial, type BrickPaletteSpec } from './brick-family';

export const IMAGE_SIZE = BRICK_IMAGE_SIZE;

export const PALETTE: BrickPaletteSpec = {
  mortar: '#4a3325',
  rBase: 142,
  gBase: 92,
  bBase: 58,
  rVar: 22,
  gVar: 16,
  bVar: 12,
  rMin: 88,
  gMin: 54,
  bMin: 34,
  rMax: 188,
  gMax: 130,
  bMax: 88,
  hi: [24, 18, 12],
  lo: [24, 18, 12],
  salt: 0xAD0BE,
};

const material = createBrickMaterial(PALETTE);

export const svg = material.svg;
export const svgTop = material.svgTop;
export const svgTopV = material.svgTopV;
export const svgSouth = material.svgSouth;
export const svgEast = material.svgEast;
export const svgEnd = material.svgEnd;
