/** plaster-whitewash-wall.ts — first-pass limewashed cottage wall material. */

import { HOMESTEAD_IMAGE_SIZE, createHomesteadMaterial, type HomesteadPaletteSpec } from './homestead-family';

export const IMAGE_SIZE = HOMESTEAD_IMAGE_SIZE;

export const PALETTE: HomesteadPaletteSpec = {
  mode: 'plaster',
  plasterBase: '#e2dbcf',
  limeWash: 'rgba(255,255,248,0.30)',
  speck: 'rgba(126,118,101,0.12)',
  crack: 'rgba(113,103,88,0.18)',
  beamBase: '#755234',
  beamHighlight: '#aa8055',
  beamShadow: '#4b3120',
  sideBoards: ['#88613b', '#7a5532', '#967049'],
  topBoards: ['#866039', '#78552f', '#96704a'],
  seam: '#5f4228',
  grain: 'rgba(52,33,18,0.20)',
  salt: 9102,
};

const material = createHomesteadMaterial(PALETTE);

export const svg = material.svg;
export const svgTop = material.svgTop;
export const svgTopV = material.svgTopV;
export const svgSouth = material.svgSouth;
export const svgEast = material.svgEast;
export const svgEnd = material.svgEnd;
