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
  // Flat mid-tone base. Diamond clipping in withIsoSourceSpace keeps this
  // contained to the iso cell; the texture detail below reads as grass.
  ctx.fillStyle = '#4FAE53';
  ctx.fillRect(0, 0, size, size);

  // Fine high-frequency speckle (3-4px, varied alpha + color) — reads as grass
  // texture instead of a flat color block when projected to the iso diamond.
  for (let wy = wy0; wy < wy0 + size; wy += 4) {
    for (let wx = wx0; wx < wx0 + size; wx += 4) {
      const v = hash01(wx, wy, 42);
      if (v < 0.25) continue;
      const lx = wx - wx0;
      const ly = wy - wy0;
      const a = 0.10 + v * 0.18;
      if (v > 0.78) {
        ctx.fillStyle = `rgba(30, 110, 30, ${a})`;
        ctx.fillRect(lx, ly, 2, 2);
      } else if (v > 0.55) {
        ctx.fillStyle = `rgba(140, 220, 100, ${a * 0.85})`;
        ctx.fillRect(lx, ly, 2, 2);
      } else {
        ctx.fillStyle = `rgba(70, 160, 70, ${a * 0.6})`;
        ctx.fillRect(lx, ly, 2, 1);
      }
    }
  }

  // Grass-blade tufts (short diagonal strokes) — adds organic detail
  // without crossing the iso diamond seam.
  for (let wy = wy0; wy < wy0 + size; wy += 7) {
    for (let wx = wx0; wx < wx0 + size; wx += 7) {
      if (worldHash(wx, wy, 43) % 3 !== 0) continue;
      const lx = wx - wx0;
      const ly = wy - wy0;
      const len = 4 + hash01(wx, wy, 44) * 6;
      const a = 0.15 + hash01(wx, wy, 45) * 0.20;
      ctx.strokeStyle = `rgba(20, 90, 30, ${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(lx + len * 0.4, ly - 2, lx + len, ly);
      ctx.stroke();
    }
  }

  // Soft moss patches — slightly larger, lower-contrast blobs that read as
  // ground variation rather than overlay.
  for (let i = 0; i < 5; i++) {
    const cx = hash01(wx0, wy0 + i, 46) * size;
    const cy = hash01(wx0 + i, wy0, 47) * size;
    const r = 6 + hash01(wx0, wy0 + i + 100, 48) * 8;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(80, 170, 80, 0.18)');
    g.addColorStop(1, 'rgba(80, 170, 80, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDirtFace(ctx: CanvasRenderingContext2D, wx0: number, wy0: number, size: number): void {
  // Layered base — diagonal earth gradient (two warm browns) to break the
  // flat radial look that was reading as a uniform color overlay.
  const baseGrad = ctx.createLinearGradient(0, 0, size, size);
  baseGrad.addColorStop(0, '#7E582C');
  baseGrad.addColorStop(0.5, '#946A3A');
  baseGrad.addColorStop(1, '#6A4A26');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // Fine high-frequency speckle — pebble/soil grain
  for (let wy = wy0; wy < wy0 + size; wy += 4) {
    for (let wx = wx0; wx < wx0 + size; wx += 4) {
      const v = hash01(wx, wy, 57);
      if (v < 0.25) continue;
      const lx = wx - wx0;
      const ly = wy - wy0;
      const a = 0.12 + v * 0.22;
      if (v > 0.80) {
        ctx.fillStyle = `rgba(45, 30, 18, ${a})`;
        ctx.fillRect(lx, ly, 2, 2);
      } else if (v > 0.55) {
        ctx.fillStyle = `rgba(160, 120, 80, ${a * 0.85})`;
        ctx.fillRect(lx, ly, 2, 1);
      } else {
        ctx.fillStyle = `rgba(105, 75, 45, ${a * 0.6})`;
        ctx.fillRect(lx, ly, 1, 1);
      }
    }
  }

  // Crack/line detail — short diagonal strokes for natural earth fissures
  ctx.strokeStyle = 'rgba(55, 38, 24, 0.30)';
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

  // Pebbles — small ellipses scattered across the surface
  for (let wy = wy0; wy < wy0 + size; wy += 14) {
    for (let wx = wx0; wx < wx0 + size; wx += 14) {
      if (worldHash(wx, wy, 55) % 4 !== 0) continue;
      const lx = wx - wx0;
      const ly = wy - wy0;
      const r = 2 + hash01(wx, wy, 56) * 4;
      const shade = hash01(wx, wy, 58) > 0.5 ? 'rgba(45, 30, 18, 0.32)' : 'rgba(170, 130, 90, 0.28)';
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.ellipse(lx, ly, r * 1.6, r * 0.75, -0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Soft tonal variation patches
  for (let i = 0; i < 4; i++) {
    const cx = hash01(wx0, wy0 + i, 59) * size;
    const cy = hash01(wx0 + i, wy0, 60) * size;
    const r = 10 + hash01(wx0, wy0 + i + 100, 61) * 12;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(130, 95, 60, 0.20)');
    g.addColorStop(1, 'rgba(130, 95, 60, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
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