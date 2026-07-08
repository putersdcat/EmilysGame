/**
 * nano-cottage.ts — authored structure nano renderers (#277).
 *
 * Projected cottage body/roof/details backed by the shared nano-structures
 * helpers and material factories. No sprites.
 */

import { CottageStoneFoundation, PlasterWhitewashWall, ThatchRoof } from '../../asset-pipeline/iso2-materials';
import type { IsoNanoTile as NanoTile } from '../../types/iso-renderer.types';
import {
  drawFaceRectDetail,
  drawStructShadow,
  fillTexturedStructFace,
  fillTexturedStructTri,
  projectStructPoint,
  type SvgImageLoader,
} from './geometry';

const COTTAGE_WALL_Z = 30;
const COTTAGE_ROOF_Z = 56;
const COTTAGE_EAVE = 7;

export function isAuthoredStructureNanoKind(kind: NanoTile['kind']): boolean {
  return kind === 'starter-cottage';
}

function drawCottageRoofStripes(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  y0: number,
  y1: number,
  ridgeX: number,
  zBase: number,
  zRidge: number,
): void {
  ctx.strokeStyle = 'rgba(82,54,22,0.28)';
  ctx.lineWidth = 1;
  for (let y = y0 + 9; y < y1; y += 11) {
    const a = projectStructPoint(screenX, screenY, { x: 23 - COTTAGE_EAVE, y, z: zBase + 2 });
    const b = projectStructPoint(screenX, screenY, { x: ridgeX, y, z: zRidge - 2 });
    const c = projectStructPoint(screenX, screenY, { x: 113 + COTTAGE_EAVE, y, z: zBase + 2 });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }
}

function drawCottageDetails(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  wallTop: number,
): void {
  const beam = '#654326';
  const beamHi = '#9b7144';
  for (const x of [x0 + 8, x1 - 11]) {
    drawFaceRectDetail(ctx, screenX, screenY, 'south', { x, y: y1 + 0.5, z: z0 }, 4, wallTop - z0, beam);
  }
  drawFaceRectDetail(ctx, screenX, screenY, 'south', { x: x0 + 6, y: y1 + 0.9, z: wallTop - 5 }, x1 - x0 - 12, 4, beamHi);
  drawFaceRectDetail(ctx, screenX, screenY, 'east', { x: x1 + 0.5, y: y0 + 8, z: wallTop - 5 }, y1 - y0 - 16, 4, beam);

  // Door is deliberately player-scale but tightened versus the first proof.
  drawFaceRectDetail(ctx, screenX, screenY, 'south', { x: 60, y: y1 + 1.2, z: z0 }, 18, 24, '#6b3d1e');
  drawFaceRectDetail(ctx, screenX, screenY, 'south', { x: 64, y: y1 + 1.5, z: z0 + 11 }, 2.5, 2.5, '#f0c65e', 'rgba(45,30,16,0.55)');
  drawFaceRectDetail(ctx, screenX, screenY, 'south', { x: 35, y: y1 + 1.1, z: z0 + 13 }, 14, 10, '#72b8d2');
  drawFaceRectDetail(ctx, screenX, screenY, 'east', { x: x1 + 0.9, y: 63, z: z0 + 13 }, 15, 10, '#5d9fbd');
}

/** Draw a compact one-cell cottage built from projected, material-backed nano geometry. */
export function drawStarterCottageNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
  loadSvgImage: SvgImageLoader,
): boolean {
  let allLoaded = true;
  const zLift = Math.max(0, (nano.zOffset - 4) * 2.5);
  const x0 = 26;
  const x1 = 113;
  const y0 = 36;
  const y1 = 111;
  const z0 = 4 + zLift;
  const wallTop = COTTAGE_WALL_Z + zLift;
  const roofPeak = COTTAGE_ROOF_Z + zLift;
  const ridgeX = (x0 + x1) / 2;

  ctx.save();
  ctx.lineJoin = 'round';

  drawStructShadow(ctx, screenX, screenY, 70, 78, 43, 14, 0.16);

  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x0 - 4, y: y1 + 2, z: 0 },
    { x: x1 + 4, y: y1 + 2, z: 0 },
    { x: x1 + 4, y: y1 + 2, z: z0 },
    { x: x0 - 4, y: y1 + 2, z: z0 },
  ], CottageStoneFoundation.svgSouth(), loadSvgImage, '#756b5e') && allLoaded;
  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x1 + 4, y: y0 - 2, z: 0 },
    { x: x1 + 4, y: y1 + 2, z: 0 },
    { x: x1 + 4, y: y1 + 2, z: z0 },
    { x: x1 + 4, y: y0 - 2, z: z0 },
  ], CottageStoneFoundation.svgEast(), loadSvgImage, '#665f55') && allLoaded;

  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x0, y: y1, z: z0 },
    { x: x1, y: y1, z: z0 },
    { x: x1, y: y1, z: wallTop },
    { x: x0, y: y1, z: wallTop },
  ], PlasterWhitewashWall.svgSouth(), loadSvgImage, '#e2dbcf') && allLoaded;
  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x1, y: y0, z: z0 },
    { x: x1, y: y1, z: z0 },
    { x: x1, y: y1, z: wallTop },
    { x: x1, y: y0, z: wallTop },
  ], PlasterWhitewashWall.svgEast(), loadSvgImage, '#d6cbbb') && allLoaded;

  drawCottageDetails(ctx, screenX, screenY, x0, x1, y0, y1, z0, wallTop);

  allLoaded = fillTexturedStructTri(ctx, screenX, screenY, [
    { x: x0 - COTTAGE_EAVE, y: y1 + COTTAGE_EAVE, z: wallTop },
    { x: x1 + COTTAGE_EAVE, y: y1 + COTTAGE_EAVE, z: wallTop },
    { x: ridgeX, y: y1 + COTTAGE_EAVE, z: roofPeak },
  ], ThatchRoof.svgGable(), loadSvgImage, '#b68b43') && allLoaded;
  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: x0 - COTTAGE_EAVE, y: y0 - COTTAGE_EAVE, z: wallTop },
    { x: x0 - COTTAGE_EAVE, y: y1 + COTTAGE_EAVE, z: wallTop },
    { x: ridgeX, y: y1 + COTTAGE_EAVE, z: roofPeak },
    { x: ridgeX, y: y0 - COTTAGE_EAVE, z: roofPeak },
  ], ThatchRoof.svgSlopeLeft(), loadSvgImage, '#c99a45') && allLoaded;
  allLoaded = fillTexturedStructFace(ctx, screenX, screenY, [
    { x: ridgeX, y: y0 - COTTAGE_EAVE, z: roofPeak },
    { x: ridgeX, y: y1 + COTTAGE_EAVE, z: roofPeak },
    { x: x1 + COTTAGE_EAVE, y: y1 + COTTAGE_EAVE, z: wallTop },
    { x: x1 + COTTAGE_EAVE, y: y0 - COTTAGE_EAVE, z: wallTop },
  ], ThatchRoof.svgSlopeRight(), loadSvgImage, '#a97632') && allLoaded;
  drawCottageRoofStripes(ctx, screenX, screenY, y0 - COTTAGE_EAVE, y1 + COTTAGE_EAVE, ridgeX, wallTop, roofPeak);

  const ridgeA = projectStructPoint(screenX, screenY, { x: ridgeX, y: y0 - COTTAGE_EAVE, z: roofPeak + 1 });
  const ridgeB = projectStructPoint(screenX, screenY, { x: ridgeX, y: y1 + COTTAGE_EAVE, z: roofPeak + 1 });
  ctx.beginPath();
  ctx.moveTo(ridgeA.x, ridgeA.y);
  ctx.lineTo(ridgeB.x, ridgeB.y);
  ctx.strokeStyle = '#6d451b';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(245,212,126,0.42)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
  return allLoaded;
}
