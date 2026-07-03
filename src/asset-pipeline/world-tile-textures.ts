/**
 * world-tile-textures.ts — D.7 seamless 144×144 world terrain textures.
 *
 * Procedural terrain faces anchored at per-tile world coordinates so adjacent
 * cells share a continuous field (no per-tile black seam band). Drawn in
 * source space then projected via the standard Iso 2.0 affine transform.
 *
 * @see experiment/isometric-2.0/src/nano-tile.ts (createPattern anchor contract)
 * @see issue #275 D.7
 */

import { RENDER_CONFIG } from '../config/game.config';

const TILE_SIZE = RENDER_CONFIG.microTileSize;

export type SeamlessTerrainType = 'grass' | 'dirt' | 'rock' | 'water' | 'sand' | 'stone_floor';

function worldHash(wx: number, wy: number, salt: number): number {
  let h = Math.imul(wx + salt * 17, 374761393) ^ Math.imul(wy + salt * 31, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function hash01(wx: number, wy: number, salt: number): number {
  return worldHash(wx, wy, salt) / 0xffffffff;
}

function clipIsoDiamond(
  ctx: CanvasRenderingContext2D,
  centerSx: number,
  centerSy: number,
  halfW: number,
  halfH: number,
): void {
  ctx.beginPath();
  ctx.moveTo(centerSx, centerSy - halfH);
  ctx.lineTo(centerSx + halfW, centerSy);
  ctx.lineTo(centerSx, centerSy + halfH);
  ctx.lineTo(centerSx - halfW, centerSy);
  ctx.closePath();
  ctx.clip();
}

function withIsoSourceSpace(
  ctx: CanvasRenderingContext2D,
  centerSx: number,
  centerSy: number,
  draw: (ctx: CanvasRenderingContext2D, tileSize: number) => void,
): void {
  const tw = RENDER_CONFIG.tileWidth;
  const th = RENDER_CONFIG.tileHeight;
  const halfW = tw / 2;
  const halfH = th / 2;
  const kx = halfW / TILE_SIZE;
  const ky = halfH / TILE_SIZE;

  ctx.save();
  clipIsoDiamond(ctx, centerSx, centerSy, halfW, halfH);
  ctx.translate(centerSx - halfW, centerSy - halfH);
  ctx.transform(kx, ky, -kx, ky, halfW, 0);
  draw(ctx, TILE_SIZE);
  ctx.restore();
}

function drawGrassFace(ctx: CanvasRenderingContext2D, wx0: number, wy0: number, size: number): void {
  // Flat mid-tone base — diagonal gradients bias iso diamond edges (seam band).
  ctx.fillStyle = '#47A84B';
  ctx.fillRect(0, 0, size, size);

  // World-continuous low-contrast speckle (no horizontal bands).
  for (let wy = wy0; wy < wy0 + size; wy += 8) {
    for (let wx = wx0; wx < wx0 + size; wx += 8) {
      const v = hash01(wx, wy, 42);
      if (v < 0.4) continue;
      const lx = wx - wx0;
      const ly = wy - wy0;
      const alpha = 0.03 + (v - 0.4) * 0.08;
      ctx.fillStyle = v > 0.72 ? `rgba(34, 139, 34, ${alpha})` : `rgba(152, 251, 152, ${alpha * 0.6})`;
      ctx.fillRect(lx, ly, 2, 2);
    }
  }

  for (let wy = wy0; wy < wy0 + size; wy += 14) {
    for (let wx = wx0; wx < wx0 + size; wx += 14) {
      if (worldHash(wx, wy, 43) % 5 !== 0) continue;
      const lx = wx - wx0;
      const ly = wy - wy0;
      const len = 6 + hash01(wx, wy, 44) * 10;
      ctx.strokeStyle = 'rgba(18, 105, 34, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(lx + len * 0.4, ly - 3, lx + len, ly);
      ctx.stroke();
    }
  }
}

function drawDirtFace(ctx: CanvasRenderingContext2D, wx0: number, wy0: number, size: number): void {
  const grad = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.75);
  grad.addColorStop(0, '#876037');
  grad.addColorStop(1, '#5E432C');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(63, 45, 29, 0.24)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const wx = wx0 + Math.floor(hash01(i, wy0, 51) * size);
    const wy = wy0 + Math.floor(hash01(wy0, i, 52) * size);
    const lx = wx - wx0;
    const ly = wy - wy0;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + 20 + hash01(wx, wy, 53) * 24, ly + 8 + hash01(wx, wy, 54) * 10);
    ctx.stroke();
  }

  for (let wy = wy0; wy < wy0 + size; wy += 16) {
    for (let wx = wx0; wx < wx0 + size; wx += 16) {
      if (worldHash(wx, wy, 55) % 5 !== 0) continue;
      const lx = wx - wx0;
      const ly = wy - wy0;
      const r = 2 + hash01(wx, wy, 56) * 5;
      ctx.fillStyle = 'rgba(82, 58, 36, 0.20)';
      ctx.beginPath();
      ctx.ellipse(lx, ly, r * 1.8, r * 0.75, -0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRockFace(ctx: CanvasRenderingContext2D, wx0: number, wy0: number, size: number): void {
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#B8B8B8');
  grad.addColorStop(1, '#606060');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(50, 50, 50, 0.35)';
  ctx.lineWidth = 1.2;
  for (let wy = wy0; wy < wy0 + size; wy += 28) {
    for (let wx = wx0; wx < wx0 + size; wx += 28) {
      const lx = wx - wx0;
      const ly = wy - wy0;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 16, ly - 6);
      ctx.lineTo(lx + 32, ly + 2);
      ctx.stroke();
    }
  }
}

function drawSandFace(ctx: CanvasRenderingContext2D, wx0: number, wy0: number, size: number): void {
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#F0D080');
  grad.addColorStop(1, '#D4B87C');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(196, 164, 108, 0.3)';
  ctx.lineWidth = 1;
  for (let wy = wy0 - (wy0 % 16); wy < wy0 + size + 16; wy += 16) {
    const ly = wy - wy0;
    ctx.beginPath();
    ctx.moveTo(0, ly);
    for (let lx = 0; lx <= size; lx += 48) {
      ctx.quadraticCurveTo(lx + 24, ly - 3, lx + 48, ly);
    }
    ctx.stroke();
  }

  for (let wy = wy0; wy < wy0 + size; wy += 14) {
    for (let wx = wx0; wx < wx0 + size; wx += 14) {
      if (worldHash(wx, wy, 61) % 4 !== 0) continue;
      const lx = wx - wx0;
      const ly = wy - wy0;
      ctx.fillStyle = 'rgba(191, 160, 106, 0.35)';
      ctx.beginPath();
      ctx.arc(lx, ly, 0.8 + hash01(wx, wy, 62) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawStoneFloorFace(ctx: CanvasRenderingContext2D, wx0: number, wy0: number, size: number): void {
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#B0A898');
  grad.addColorStop(1, '#887868');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(112, 96, 80, 0.35)';
  ctx.lineWidth = 1;
  for (let y = 0; y <= size; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  for (let x = 0; x <= size; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let wy = wy0; wy < wy0 + size; wy += 24) {
    for (let wx = wx0; wx < wx0 + size; wx += 24) {
      if (worldHash(wx, wy, 71) % 6 !== 0) continue;
      const lx = wx - wx0;
      const ly = wy - wy0;
      ctx.fillStyle = 'rgba(96, 80, 64, 0.22)';
      ctx.beginPath();
      ctx.arc(lx, ly, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWaterFace(ctx: CanvasRenderingContext2D, _wx0: number, wy0: number, size: number): void {
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#1E90FF');
  grad.addColorStop(1, '#4169E1');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1.5;
  for (let wy = wy0 - (wy0 % 20); wy < wy0 + size + 20; wy += 20) {
    const ly = wy - wy0;
    ctx.beginPath();
    ctx.moveTo(0, ly);
    for (let lx = 0; lx <= size; lx += 48) {
      ctx.quadraticCurveTo(lx + 24, ly + 4, lx + 48, ly);
    }
    ctx.stroke();
  }
}

/**
 * Draw a seamless world-terrain diamond at screen center (centerSx, centerSy).
 * World column/row anchor the procedural field so neighboring tiles align.
 */
export function drawSeamlessTerrainTile(
  ctx: CanvasRenderingContext2D,
  type: SeamlessTerrainType,
  worldCol: number,
  worldRow: number,
  centerSx: number,
  centerSy: number,
): void {
  const wx0 = worldCol * TILE_SIZE;
  const wy0 = worldRow * TILE_SIZE;

  withIsoSourceSpace(ctx, centerSx, centerSy, (sctx, size) => {
    switch (type) {
      case 'grass':
        drawGrassFace(sctx, wx0, wy0, size);
        break;
      case 'dirt':
        drawDirtFace(sctx, wx0, wy0, size);
        break;
      case 'rock':
        drawRockFace(sctx, wx0, wy0, size);
        break;
      case 'sand':
        drawSandFace(sctx, wx0, wy0, size);
        break;
      case 'stone_floor':
        drawStoneFloorFace(sctx, wx0, wy0, size);
        break;
      case 'water':
        drawWaterFace(sctx, wx0, wy0, size);
        break;
    }
  });
}