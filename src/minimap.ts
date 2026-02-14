/**
 * minimap.ts - Minimap rendering for explored world overview.
 * Shows bird's-eye view of explored chunks with terrain colors,
 * player position, and biome-based coloring.
 * 
 * Renders to a sidebar canvas element, throttled to ~10fps.
 * TODO: DOC - minimap rendering strategy, zoom levels, memory
 */

import { WORLD_CONFIG } from './config/game.config';
import { ASSET_DEFS } from './config/assets.config';
import { getBiome } from './config/biomes.config';
import type { ChunkData } from './gen';

// --- Config ---

/** Minimap canvas dimensions (px) */
const MAP_W = 200;
const MAP_H = 140;

/** Pixels per cell in minimap (auto-scaled, this is the max) */
const MAX_CELL_PX = 3;
const MIN_CELL_PX = 1;

/** Minimap terrain colors (simplified from tile types) */
const TERRAIN_COLORS: Record<string, string> = {
  grass: '#3CB43C',
  dirt: '#8B6914',
  rock: '#808080',
  water: '#2E6ECC',
  sand: '#D2B48C',
  stone_wall: '#606060',
  stone_floor: '#707070',
  bridge: '#8B4513',
  door_gate: '#8B4513',
  wooden_fence: '#A0522D',
};

/** Biome fallback colors for cells without a tileType */
const BIOME_COLORS: Record<string, string> = {
  meadow: '#2a8a2a',
  forest: '#1a5a1a',
  cave: '#3a3a5a',
  castle: '#5a3a3a',
};

// --- State ---

let minimapCanvas: HTMLCanvasElement | null = null;
let minimapCtx: CanvasRenderingContext2D | null = null;
let frameCounter = 0;

/** Per-chunk minimap tile data (computed once per chunk, cached) */
interface ChunkMiniData {
  /** Flat array of terrain color indices, row-major */
  colors: string[];
  biomeColor: string;
}

const chunkMiniCache = new Map<string, ChunkMiniData>();

// --- Init ---

/**
 * Initialize the minimap canvas. Call once on game start.
 */
export function initMinimap(): void {
  minimapCanvas = document.getElementById('minimapCanvas') as HTMLCanvasElement;
  if (!minimapCanvas) return;
  minimapCanvas.width = MAP_W;
  minimapCanvas.height = MAP_H;
  minimapCtx = minimapCanvas.getContext('2d');
}

// --- Chunk Data Extraction ---

/**
 * Build a simplified color grid for one chunk (cached).
 */
function buildChunkMini(key: string, chunk: ChunkData): ChunkMiniData {
  let cached = chunkMiniCache.get(key);
  if (cached) return cached;

  const size = WORLD_CONFIG.chunkSize;
  const biome = getBiome(chunk.biomeId);
  const biomeColor = BIOME_COLORS[biome.name] ?? biome.baseColor;
  const colors: string[] = new Array(size * size);

  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) {
      const cell = chunk.cells[cy][cx];
      const def = ASSET_DEFS[cell.assetKey];
      let color = biomeColor;

      if (def?.tileType) {
        color = TERRAIN_COLORS[def.tileType] ?? biomeColor;
      } else if (def?.layer !== 'base') {
        // Non-base layer objects show as slightly darker
        color = '#555555';
      }

      // Special items show as bright dots
      if (cell.itemId) {
        const itemDef = ASSET_DEFS[cell.itemId];
        if (itemDef) {
          if (cell.itemId === 'coin') color = '#FFD700';
          else if (cell.itemId === 'key') color = '#FF8C00';
          else if (cell.itemId === 'potion') color = '#FF69B4';
          else color = '#FFFFFF';
        }
      }

      // NPCs show as magenta dots
      if (cell.npcId) {
        color = '#FF00FF';
      }

      colors[cy * size + cx] = color;
    }
  }

  cached = { colors, biomeColor };
  chunkMiniCache.set(key, cached);
  return cached;
}

/**
 * Invalidate a chunk's minimap cache (when chunk content changes).
 */
export function invalidateMinimapChunk(chunkKey: string): void {
  chunkMiniCache.delete(chunkKey);
}

// --- Render ---

/**
 * Render the minimap. Call from update loop (auto-throttled to ~6fps).
 */
export function renderMinimap(
  chunks: Map<string, ChunkData>,
  playerX: number,
  playerY: number,
): void {
  if (!minimapCtx || !minimapCanvas) return;

  // Throttle: render every 10th frame
  frameCounter++;
  if (frameCounter % 10 !== 0) return;

  const ctx = minimapCtx;
  const size = WORLD_CONFIG.chunkSize;

  // Find bounds of all loaded chunks
  let minCX = Infinity, maxCX = -Infinity;
  let minCY = Infinity, maxCY = -Infinity;
  chunks.forEach((_chunk, key) => {
    const [cx, cy] = key.split(',').map(Number);
    if (cx < minCX) minCX = cx;
    if (cx > maxCX) maxCX = cx;
    if (cy < minCY) minCY = cy;
    if (cy > maxCY) maxCY = cy;
  });

  if (minCX > maxCX) return; // no chunks

  const spanCX = maxCX - minCX + 1;
  const spanCY = maxCY - minCY + 1;
  const totalCellsX = spanCX * size;
  const totalCellsY = spanCY * size;

  // Compute pixel scale to fit all chunks in minimap
  const scaleX = MAP_W / totalCellsX;
  const scaleY = MAP_H / totalCellsY;
  let cellPx = Math.min(scaleX, scaleY, MAX_CELL_PX);
  cellPx = Math.max(cellPx, MIN_CELL_PX);

  // Compute rendered map dimensions
  const renderW = totalCellsX * cellPx;
  const renderH = totalCellsY * cellPx;

  // Center the map in the canvas
  const offX = Math.floor((MAP_W - renderW) / 2);
  const offY = Math.floor((MAP_H - renderH) / 2);

  // Clear
  ctx.fillStyle = '#0d0d14';
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  // Draw each chunk as a colored block grid
  // For performance, batch by color using fillRect
  const colorBatch = new Map<string, Array<{ x: number; y: number }>>();

  chunks.forEach((chunk, key) => {
    const [cx, cy] = key.split(',').map(Number);
    const mini = buildChunkMini(key, chunk);

    const chunkOffX = (cx - minCX) * size;
    const chunkOffY = (cy - minCY) * size;

    for (let ly = 0; ly < size; ly++) {
      for (let lx = 0; lx < size; lx++) {
        const color = mini.colors[ly * size + lx];
        let batch = colorBatch.get(color);
        if (!batch) {
          batch = [];
          colorBatch.set(color, batch);
        }
        batch.push({
          x: offX + (chunkOffX + lx) * cellPx,
          y: offY + (chunkOffY + ly) * cellPx,
        });
      }
    }
  });

  // Batch-draw by color
  colorBatch.forEach((positions, color) => {
    ctx.fillStyle = color;
    for (let i = 0; i < positions.length; i++) {
      ctx.fillRect(positions[i].x, positions[i].y, cellPx, cellPx);
    }
  });

  // Draw chunk borders (subtle lines)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let cx = minCX; cx <= maxCX + 1; cx++) {
    const px = offX + (cx - minCX) * size * cellPx;
    ctx.beginPath();
    ctx.moveTo(px, offY);
    ctx.lineTo(px, offY + renderH);
    ctx.stroke();
  }
  for (let cy = minCY; cy <= maxCY + 1; cy++) {
    const py = offY + (cy - minCY) * size * cellPx;
    ctx.beginPath();
    ctx.moveTo(offX, py);
    ctx.lineTo(offX + renderW, py);
    ctx.stroke();
  }

  // Draw player position as a bright dot
  const playerCellX = playerX - minCX * size;
  const playerCellY = playerY - minCY * size;
  const ppx = offX + playerCellX * cellPx;
  const ppy = offY + playerCellY * cellPx;

  // Player dot with glow
  const dotSize = Math.max(3, cellPx * 2);
  ctx.fillStyle = 'rgba(255, 255, 100, 0.4)';
  ctx.beginPath();
  ctx.arc(ppx, ppy, dotSize + 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(ppx, ppy, dotSize, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(ppx, ppy, dotSize - 1, 0, Math.PI * 2);
  ctx.fill();

  // Border around minimap
  ctx.strokeStyle = 'rgba(100,100,140,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, MAP_W, MAP_H);
}
