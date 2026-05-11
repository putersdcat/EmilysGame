/** thatch-roof.ts — warm straw roof material for cottage proofs. */

import { ROOF_IMAGE_SIZE, createRoofMaterial, type RoofPaletteSpec, type RoofPrimitiveKind } from './roof-family';

export const IMAGE_SIZE = ROOF_IMAGE_SIZE;

export const PALETTE: RoofPaletteSpec = {
  base: '#a98a38',
  dark: '#5f4b22',
  light: '#e2c766',
  straw: ['#c7aa4f', '#b9963d', '#d4b95b', '#9d7f33', '#e0c66a'],
  ridge: '#80652d',
  ridgeDark: '#493515',
  gableBase: '#ded0b1',
  gableTrim: '#76512d',
  gableShadow: '#6b563d',
  salt: 12011,
};

const material = createRoofMaterial(PALETTE);

export const svgSlopeLeft = material.svgSlopeLeft;
export const svgSlopeRight = material.svgSlopeRight;
export const svgRidge = material.svgRidge;
export const svgGable = material.svgGable;
export const svgFor = (kind: RoofPrimitiveKind): string => material.svgFor(kind);
