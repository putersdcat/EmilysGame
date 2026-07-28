/**
 * nano-castle.ts — authored stone structure nano renderers (#277).
 *
 * Uses the same nano-structures projected-face helpers as the cottage renderer,
 * but with DarkCathedralStone/Limestone-ish massing: keeps, battlements, chapel
 * gables, arched doors, and stained-glass slits. No sprites.
 */

import { DarkCathedralStone, Limestone } from '../../asset-pipeline/iso2-materials';
import type { IsoNanoTile as NanoTile } from '../../types/iso-renderer.types';
import {
  drawFaceRectDetail,
  drawStructShadow,
  fillStructTri,
  fillTexturedStructFace,
  projectStructPoint,
  type SvgImageLoader,
} from './geometry';

function drawBattlement(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  x: number,
  y: number,
  z: number,
  w: number,
  axis: 'south' | 'east',
): void {
  drawFaceRectDetail(ctx, screenX, screenY, axis, { x, y, z }, w, 8, '#77716b', 'rgba(29,26,25,0.62)');
}

/** First reusable castle/cathedral proof: one-cell stone keep with battlements. */
export function drawCastleKeepNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
  loadSvgImage: SvgImageLoader,
): boolean {
  let allLoaded = true;
  const zLift = Math.max(0, (nano.zOffset - 7) * 2.5);
  const x0 = 30;
  const x1 = 114;
  const y0 = 30;
  const y1 = 114;
  const z0 = 3 + zLift;
  const zTop = 58 + zLift;
  const towerTop = 76 + zLift;

  ctx.save();
  ctx.lineJoin = 'round';
  drawStructShadow(ctx, screenX, screenY, 72, 80, 48, 16, 0.19);

  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x0, y: y1, z: z0 },
    { x: x1, y: y1, z: z0 },
    { x: x1, y: y1, z: zTop },
    { x: x0, y: y1, z: zTop },
  ], DarkCathedralStone.svgSouth(), loadSvgImage, '#6f6963') && allLoaded;
  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x1, y: y0, z: z0 },
    { x: x1, y: y1, z: z0 },
    { x: x1, y: y1, z: zTop },
    { x: x1, y: y0, z: zTop },
  ], DarkCathedralStone.svgEast(), loadSvgImage, '#5f5a56') && allLoaded;
  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x0, y: y0, z: zTop },
    { x: x0, y: y1, z: zTop },
    { x: x1, y: y1, z: zTop },
    { x: x1, y: y0, z: zTop },
  ], DarkCathedralStone.svgTop(), loadSvgImage, '#78736d') && allLoaded;

  for (const x of [x0 + 6, x0 + 28, x0 + 50, x0 + 72]) drawBattlement(ctx, screenX, screenY, x, y1 + 0.6, zTop, 10, 'south');
  for (const y of [y0 + 6, y0 + 28, y0 + 50, y0 + 72]) drawBattlement(ctx, screenX, screenY, x1 + 0.6, y, zTop, 10, 'east');

  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x1 - 24, y: y1 - 8, z: zTop },
    { x: x1 + 2, y: y1 - 8, z: zTop },
    { x: x1 + 2, y: y1 - 8, z: towerTop },
    { x: x1 - 24, y: y1 - 8, z: towerTop },
  ], DarkCathedralStone.svgSouth(), loadSvgImage, '#625d59') && allLoaded;
  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x1 + 2, y: y1 - 34, z: zTop },
    { x: x1 + 2, y: y1 - 8, z: zTop },
    { x: x1 + 2, y: y1 - 8, z: towerTop },
    { x: x1 + 2, y: y1 - 34, z: towerTop },
  ], DarkCathedralStone.svgEast(), loadSvgImage, '#56524f') && allLoaded;
  fillStructTri(ctx, screenX, screenY, [
    { x: 55, y: y1 + 1.2, z: z0 },
    { x: 78, y: y1 + 1.2, z: z0 },
    { x: 66.5, y: y1 + 1.2, z: z0 + 30 },
  ], '#2f2924', 'rgba(14,12,10,0.84)');
  drawFaceRectDetail(ctx, screenX, screenY, 'south', { x: 40, y: y1 + 1.4, z: z0 + 25 }, 11, 15, '#43687b');
  drawFaceRectDetail(ctx, screenX, screenY, 'east', { x: x1 + 1.2, y: 53, z: z0 + 25 }, 11, 15, '#375667');

  ctx.restore();
  return allLoaded;
}

/** Cathedral/chapel extrapolation: pale nave + dark roof line + arched stained glass. */
export function drawCathedralChapelNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
  loadSvgImage: SvgImageLoader,
): boolean {
  let allLoaded = true;
  const zLift = Math.max(0, (nano.zOffset - 7) * 2.4);
  const x0 = 24;
  const x1 = 120;
  const y0 = 42;
  const y1 = 112;
  const z0 = 3 + zLift;
  const naveTop = 48 + zLift;
  const ridgeX = 72;
  const ridgeZ = 75 + zLift;

  ctx.save();
  ctx.lineJoin = 'round';
  drawStructShadow(ctx, screenX, screenY, 73, 82, 52, 15, 0.17);

  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x0, y: y1, z: z0 },
    { x: x1, y: y1, z: z0 },
    { x: x1, y: y1, z: naveTop },
    { x: x0, y: y1, z: naveTop },
  ], Limestone.svgSouth(), loadSvgImage, '#bdb79f') && allLoaded;
  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x1, y: y0, z: z0 },
    { x: x1, y: y1, z: z0 },
    { x: x1, y: y1, z: naveTop },
    { x: x1, y: y0, z: naveTop },
  ], Limestone.svgEast(), loadSvgImage, '#a9a38d') && allLoaded;

  // Stone gable roof: same projected face helper, different material family.
  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x0 - 5, y: y0 - 5, z: naveTop },
    { x: x0 - 5, y: y1 + 5, z: naveTop },
    { x: ridgeX, y: y1 + 5, z: ridgeZ },
    { x: ridgeX, y: y0 - 5, z: ridgeZ },
  ], DarkCathedralStone.svgTop(), loadSvgImage, '#6f6a65') && allLoaded;
  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: ridgeX, y: y0 - 5, z: ridgeZ },
    { x: ridgeX, y: y1 + 5, z: ridgeZ },
    { x: x1 + 5, y: y1 + 5, z: naveTop },
    { x: x1 + 5, y: y0 - 5, z: naveTop },
  ], DarkCathedralStone.svgTop(), loadSvgImage, '#595552') && allLoaded;

  fillStructTri(ctx, screenX, screenY, [
    { x: x0 - 5, y: y1 + 5, z: naveTop },
    { x: x1 + 5, y: y1 + 5, z: naveTop },
    { x: ridgeX, y: y1 + 5, z: ridgeZ },
  ], '#9d9681', 'rgba(42,38,33,0.70)');
  drawFaceRectDetail(ctx, screenX, screenY, 'south', { x: 62, y: y1 + 1.2, z: z0 }, 18, 26, '#26211f');
  drawFaceRectDetail(ctx, screenX, screenY, 'south', { x: 36, y: y1 + 1.3, z: z0 + 20 }, 10, 18, '#4c85a0');
  drawFaceRectDetail(ctx, screenX, screenY, 'south', { x: 92, y: y1 + 1.3, z: z0 + 20 }, 10, 18, '#4c85a0');
  drawFaceRectDetail(ctx, screenX, screenY, 'east', { x: x1 + 1.2, y: 63, z: z0 + 20 }, 10, 18, '#426e86');

  const spireBase = projectStructPoint(screenX, screenY, { x: ridgeX, y: y1 + 5, z: ridgeZ });
  const spireTop = projectStructPoint(screenX, screenY, { x: ridgeX, y: y1 + 5, z: ridgeZ + 22 });
  ctx.beginPath();
  ctx.moveTo(spireBase.x - 7, spireBase.y + 2);
  ctx.lineTo(spireBase.x + 7, spireBase.y + 2);
  ctx.lineTo(spireTop.x, spireTop.y);
  ctx.closePath();
  ctx.fillStyle = '#4a4541';
  ctx.fill();
  ctx.strokeStyle = 'rgba(21,19,18,0.72)';
  ctx.stroke();

  ctx.restore();
  return allLoaded;
}
