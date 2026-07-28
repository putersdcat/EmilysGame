/**
 * stone-brick.ts — factory-backed gray masonry brick material.
 *
 * First consumer of brick-family.ts. It reuses the same 48×48 modular
 * running-bond geometry and top/south/east/end face-slice contract proven by
 * red-clinker, but swaps in a neutral stone palette.
 */

import { BRICK_IMAGE_SIZE, createBrickMaterial, type BrickPaletteSpec } from './brick-family';

export const IMAGE_SIZE = BRICK_IMAGE_SIZE;

export const PALETTE: BrickPaletteSpec = {
  mortar: '#3a3835',
  rBase: 158,
  gBase: 158,
  bBase: 154,
  rVar: 18,
  gVar: 18,
  bVar: 16,
  rMin: 104,
  gMin: 104,
  bMin: 100,
  rMax: 204,
  gMax: 204,
  bMax: 200,
  hi: [22, 22, 22],
  lo: [26, 26, 26],
  salt: 0x570A3,
};

const material = createBrickMaterial(PALETTE);

export const svg = material.svg;
export const svgTop = material.svgTop;
export const svgTopV = material.svgTopV;
export const svgSouth = material.svgSouth;
export const svgEast = material.svgEast;
export const svgEnd = material.svgEnd;
