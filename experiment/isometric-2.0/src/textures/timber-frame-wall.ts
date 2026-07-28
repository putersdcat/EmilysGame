/** timber-frame-wall.ts — first-pass rural timber-frame wall material. */

import { HOMESTEAD_IMAGE_SIZE, createHomesteadMaterial, type HomesteadPaletteSpec } from './homestead-family';

export const IMAGE_SIZE = HOMESTEAD_IMAGE_SIZE;

export const PALETTE: HomesteadPaletteSpec = {
  mode: 'timber-frame',
  plasterBase: '#d3c8b5',
  limeWash: 'rgba(255,250,236,0.24)',
  speck: 'rgba(116,104,88,0.14)',
  crack: 'rgba(96,82,65,0.18)',
  beamBase: '#6f4c32',
  beamHighlight: '#a57a53',
  beamShadow: '#452d1d',
  sideBoards: ['#88613b', '#7a5532', '#967049'],
  topBoards: ['#8d633b', '#7d5632', '#9d7348'],
  seam: '#5b3f27',
  grain: 'rgba(54,35,21,0.22)',
  salt: 9101,
};

const material = createHomesteadMaterial(PALETTE);

export const svg = material.svg;
export const svgTop = material.svgTop;
export const svgTopV = material.svgTopV;
export const svgSouth = material.svgSouth;
export const svgEast = material.svgEast;
export const svgEnd = material.svgEnd;
