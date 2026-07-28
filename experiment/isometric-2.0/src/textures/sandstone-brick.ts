/** sandstone-brick.ts — factory-backed pale desert sandstone brick material. */

import { BRICK_IMAGE_SIZE, createBrickMaterial, type BrickPaletteSpec } from './brick-family';

export const IMAGE_SIZE = BRICK_IMAGE_SIZE;

export const PALETTE: BrickPaletteSpec = {
  mortar: '#6f5d3a',
  rBase: 188,
  gBase: 151,
  bBase: 86,
  rVar: 20,
  gVar: 18,
  bVar: 14,
  rMin: 132,
  gMin: 104,
  bMin: 58,
  rMax: 226,
  gMax: 196,
  bMax: 126,
  hi: [28, 24, 16],
  lo: [24, 22, 16],
  salt: 0x5A9D51,
};

const material = createBrickMaterial(PALETTE);

export const svg = material.svg;
export const svgTop = material.svgTop;
export const svgTopV = material.svgTopV;
export const svgSouth = material.svgSouth;
export const svgEast = material.svgEast;
export const svgEnd = material.svgEnd;
