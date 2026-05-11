/** cottage-stone-foundation.ts — light rural foundation stone using ancient-stone geometry. */

import { ANCIENT_STONE_IMAGE_SIZE, createAncientStoneMaterial, type AncientStonePaletteSpec } from './ancient-stone-family';

export const IMAGE_SIZE = ANCIENT_STONE_IMAGE_SIZE;

export const PALETTE: AncientStonePaletteSpec = {
  mortar: '#6d6458',
  joint: 'rgba(78,70,60,0.28)',
  rimLight: 'rgba(255,247,228,0.12)',
  pit: 'rgba(84,74,65,0.12)',
  rBase: 160,
  gBase: 151,
  bBase: 136,
  variance: 14,
  salt: 6205,
};

const material = createAncientStoneMaterial(PALETTE);

export const svg = material.svg;
export const svgTop = material.svgTop;
export const svgSouth = material.svgSouth;
export const svgEast = material.svgEast;
