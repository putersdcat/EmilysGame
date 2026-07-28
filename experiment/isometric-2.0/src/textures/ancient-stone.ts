/** ancient-stone.ts — default factory-backed ancient rubble stone material. */

import { ANCIENT_STONE_IMAGE_SIZE, createAncientStoneMaterial, type AncientStonePaletteSpec } from './ancient-stone-family';

export const IMAGE_SIZE = ANCIENT_STONE_IMAGE_SIZE;

export const PALETTE: AncientStonePaletteSpec = {
  mortar: '#625848',
  joint: 'rgba(47,42,35,0.32)',
  rimLight: 'rgba(255,248,226,0.10)',
  pit: 'rgba(73,64,53,0.14)',
  rBase: 171,
  gBase: 161,
  bBase: 140,
  variance: 18,
  salt: 0,
};

const material = createAncientStoneMaterial(PALETTE);

export const svg = material.svg;
export const svgTop = material.svgTop;
export const svgSouth = material.svgSouth;
export const svgEast = material.svgEast;
