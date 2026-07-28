/**
 * debug-grid.ts — World-unit grid overlay for debugging (F3 toggle).
 *
 * Draws isometric grid lines showing:
 *   - World-unit boundaries (every worldUnitSize cells) — cyan
 *   - Chunk borders — yellow
 *   - World-unit coordinate labels (e.g. "3,4") — cyan
 *   - LOD tag per world unit (L:det / L:sta / L:sim / L:min) — color-coded
 *   - Chunk climate overlay (M:moisture T:temperature) — orange
 *
 * Lives outside the IsometricRenderer class so debug concerns stay
 * separate from the per-frame render hot path. Extracted from
 * `render.ts` in B6.5 (#269).
 */
import { WORLD_CONFIG } from '../config/game.config';
import { getTileLOD } from '../config/tiles.config';
import type { TileType } from './tiles';
import type { ChunkData, Camera } from '../types/game.types';
import { gridToScreen, isVisible } from './projection';

/** LOD → display color for the LOD tag overlay. */
const LOD_COLORS: Record<string, string> = {
  detail: '#0f0',
  standard: '#0ff',
  simplified: '#ff0',
  minimal: '#f00',
};

/** Draw world-unit grid boundaries on visible chunks. */
export function drawDebugGrid(
  ctx: CanvasRenderingContext2D,
  chunks: Map<string, ChunkData>,
  camera: Camera,
): void {
  const chunkSize = WORLD_CONFIG.chunkSize;
  const wuSize = WORLD_CONFIG.worldUnitSize;
  const camCX = Math.floor(camera.x / chunkSize);
  const camCY = Math.floor(camera.y / chunkSize);
  const buf = WORLD_CONFIG.viewportBuffer;

  ctx.save();
  ctx.globalAlpha = 0.35;

  for (let dcy = -buf; dcy <= buf; dcy++) {
    for (let dcx = -buf; dcx <= buf; dcx++) {
      const key = `${camCX + dcx},${camCY + dcy}`;
      const chunk = chunks.get(key);
      if (!chunk) continue;

      const baseGX = chunk.chunkX * chunkSize;
      const baseGY = chunk.chunkY * chunkSize;

      // Draw world unit grid lines (vertical lines in grid space = iso diagonals)
      for (let wu = 0; wu <= chunkSize; wu += wuSize) {
        const isChunkBorder = wu === 0 || wu === chunkSize;
        ctx.strokeStyle = isChunkBorder ? '#ff0' : '#0ff';
        ctx.lineWidth = isChunkBorder ? 2 : 1;

        // "Vertical" grid line at x=wu (from y=0 to y=chunkSize)
        ctx.beginPath();
        const v0 = gridToScreen(baseGX + wu, baseGY, camera);
        const v1 = gridToScreen(baseGX + wu, baseGY + chunkSize, camera);
        ctx.moveTo(v0.x, v0.y);
        ctx.lineTo(v1.x, v1.y);
        ctx.stroke();

        // "Horizontal" grid line at y=wu (from x=0 to x=chunkSize)
        ctx.beginPath();
        const h0 = gridToScreen(baseGX, baseGY + wu, camera);
        const h1 = gridToScreen(baseGX + chunkSize, baseGY + wu, camera);
        ctx.moveTo(h0.x, h0.y);
        ctx.lineTo(h1.x, h1.y);
        ctx.stroke();
      }

      // Label world units with their coordinates
      ctx.font = '10px monospace';
      ctx.fillStyle = '#0ff';
      ctx.globalAlpha = 0.6;
      const gridDim = chunkSize / wuSize;
      for (let wy = 0; wy < gridDim; wy++) {
        for (let wx = 0; wx < gridDim; wx++) {
          const centerGX = baseGX + wx * wuSize + wuSize / 2;
          const centerGY = baseGY + wy * wuSize + wuSize / 2;
          const { x: lx, y: ly } = gridToScreen(centerGX, centerGY, camera);
          if (isVisible(lx, ly)) {
            ctx.fillText(`${wx},${wy}`, lx - 8, ly + 3);
          }
        }
      }

      // #101: LOD tag overlay — show LOD level of the center cell per world unit
      ctx.font = '8px monospace';
      ctx.globalAlpha = 0.7;
      for (let wy = 0; wy < gridDim; wy++) {
        for (let wx = 0; wx < gridDim; wx++) {
          const cellX = wx * wuSize + Math.floor(wuSize / 2);
          const cellY = wy * wuSize + Math.floor(wuSize / 2);
          if (cellY < chunk.cells.length && cellX < chunk.cells[0].length) {
            const cell = chunk.cells[cellY][cellX];
            const lod = getTileLOD(cell.assetKey as TileType);
            const centerGX = baseGX + wx * wuSize + wuSize / 2;
            const centerGY = baseGY + wy * wuSize + wuSize / 2;
            const { x: lx, y: ly } = gridToScreen(centerGX, centerGY, camera);
            if (isVisible(lx, ly)) {
              ctx.fillStyle = LOD_COLORS[lod] ?? '#888';
              ctx.fillText(`L:${lod.slice(0, 3)}`, lx - 8, ly + 12);
            }
          }
        }
      }

      // #101: Chunk climate overlay — show moisture/temperature for this chunk
      if (chunk.climate) {
        const topGX = baseGX;
        const topGY = baseGY;
        const { x: cx, y: cy } = gridToScreen(topGX + chunkSize / 2, topGY + 1, camera);
        if (isVisible(cx, cy)) {
          ctx.font = '9px monospace';
          ctx.fillStyle = '#ffa';
          ctx.globalAlpha = 0.8;
          const m = chunk.climate.moisture.toFixed(2);
          const t = chunk.climate.temperature.toFixed(2);
          ctx.fillText(`M:${m} T:${t}`, cx - 25, cy - 4);
        }
      }

      ctx.globalAlpha = 0.35;
    }
  }
  ctx.restore();
}
