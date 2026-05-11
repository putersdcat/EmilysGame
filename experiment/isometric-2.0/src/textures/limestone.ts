/** limestone.ts — pale factory-backed ancient-stone family variant. */

import { ANCIENT_STONE_IMAGE_SIZE, createAncientStoneMaterial, type AncientStonePaletteSpec } from './ancient-stone-family';

export const IMAGE_SIZE = ANCIENT_STONE_IMAGE_SIZE;

export const PALETTE: AncientStonePaletteSpec = {
  mortar: '#706c5d',
  joint: 'rgba(58,55,47,0.30)',
  rimLight: 'rgba(255,252,228,0.14)',
  pit: 'rgba(92,86,70,0.12)',
  rBase: 190,
  gBase: 184,
  bBase: 158,
  variance: 15,
  salt: 2301,
};

const material = createAncientStoneMaterial(PALETTE);

export const svg = material.svg;
export const svgTop = material.svgTop;
export const svgSouth = material.svgSouth;
export const svgEast = material.svgEast;
