/** rough-wood-plank-wall.ts — first-pass rough plank cottage wall material. */

import { HOMESTEAD_IMAGE_SIZE, createHomesteadMaterial, type HomesteadPaletteSpec } from './homestead-family';

export const IMAGE_SIZE = HOMESTEAD_IMAGE_SIZE;

export const PALETTE: HomesteadPaletteSpec = {
  mode: 'planks',
  plasterBase: '#8c6b45',
  limeWash: 'rgba(255,255,255,0)',
  speck: 'rgba(0,0,0,0)',
  crack: 'rgba(0,0,0,0)',
  beamBase: '#755234',
  beamHighlight: '#aa8055',
  beamShadow: '#4b3120',
  sideBoards: ['#8a653d', '#77522e', '#9b7548', '#684626'],
  topBoards: ['#916a41', '#7f5934', '#a37d50', '#714c2b'],
  seam: '#513720',
  grain: 'rgba(44,27,15,0.28)',
  salt: 9103,
};

const material = createHomesteadMaterial(PALETTE);

export const svg = material.svg;
export const svgTop = material.svgTop;
export const svgTopV = material.svgTopV;
export const svgSouth = material.svgSouth;
export const svgEast = material.svgEast;
export const svgEnd = material.svgEnd;
