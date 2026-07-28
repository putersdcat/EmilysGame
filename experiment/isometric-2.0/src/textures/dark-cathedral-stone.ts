/** dark-cathedral-stone.ts — dark ecclesiastical ancient-stone family variant. */

import { ANCIENT_STONE_IMAGE_SIZE, createAncientStoneMaterial, type AncientStonePaletteSpec } from './ancient-stone-family';

export const IMAGE_SIZE = ANCIENT_STONE_IMAGE_SIZE;

export const PALETTE: AncientStonePaletteSpec = {
  mortar: '#3a3634',
  joint: 'rgba(18,17,18,0.38)',
  rimLight: 'rgba(204,196,184,0.11)',
  pit: 'rgba(21,19,20,0.18)',
  rBase: 96,
  gBase: 91,
  bBase: 88,
  variance: 17,
  salt: 4407,
};

const material = createAncientStoneMaterial(PALETTE);

export const svg = material.svg;
export const svgTop = material.svgTop;
export const svgSouth = material.svgSouth;
export const svgEast = material.svgEast;
