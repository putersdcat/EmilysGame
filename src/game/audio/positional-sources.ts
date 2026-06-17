/**
 * positional-sources.ts — Positional audio source registry + scanner (#108).
 *
 * B5 micro-slice 11.9 (#268): extracted from main.ts. Co-locates the
 * static registry of asset keys that emit positional audio (campfire,
 * water) and the per-frame scanner that walks the player's 3×3 chunk
 * neighborhood to start positional SFX loops.
 *
 * Why this lives in `src/game/audio/`:
 *   - It's pure audio-domain logic
 *   - It uses `playPositionalSfx` from `./sfx` (sibling module)
 *   - It mutates no canvas/DOM state (renderer-safe)
 *
 * Public API:
 *   - POSITIONAL_AUDIO_ASSETS — registry: assetKey → { sampleId, maxDist, volume }
 *   - scanPositionalAudioSources(state) — call once per frame to start
 *     positional SFX for any new asset cells in the player's vicinity
 *
 * @see issue #108 — Positional audio
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { WORLD_CONFIG } from '../../config/game.config';
import { type GameState } from '../game-state';
import { playPositionalSfx } from './sfx';

// ─── Registry ────────────────────────────────────────────────

/** Asset keys that emit positional audio + their playback config. */
export const POSITIONAL_AUDIO_ASSETS: Record<string, { sampleId: string; maxDist: number; volume: number }> = {
  campfire:    { sampleId: 'campfire_loop', maxDist: 8,  volume: 0.5 },
  water:       { sampleId: 'waterfall_loop', maxDist: 12, volume: 0.3 },
};

// ─── Scanned-id tracking ─────────────────────────────────────

/** Track which positional IDs we've attempted so we don't spam attempts. */
const _positionalScanned = new Set<string>();

// ─── Scanner ─────────────────────────────────────────────────

/**
 * Scan the player's current chunk and 8 neighbors (3×3 grid) for cells
 * whose `assetKey` matches `POSITIONAL_AUDIO_ASSETS`, and start a
 * positional SFX loop for any new ones. Idempotent: a Set tracks IDs
 * we've already attempted so we don't spam `playPositionalSfx` calls.
 *
 * To avoid unbounded Set growth as the player explores, the Set is
 * cleared every 500 entries (effectively rolling the "already scanned"
 * memory — at 500 cells × ~25 tiles-per-chunk radius ≈ 20 chunks
 * worth of history, which is far more than the 3×3 = 9 chunks the
 * scanner itself visits per frame).
 *
 * Should be called once per game frame from `update()` after the
 * player's chunk has loaded.
 */
export function scanPositionalAudioSources(state: GameState): void {
  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(state.player.x / size);
  const pcy = Math.floor(state.player.y / size);

  // Scan player's chunk and immediate neighbors (3x3 grid)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${pcx + dx},${pcy + dy}`;
      const chunk = state.chunks.get(key);
      if (!chunk) continue;

      const baseX = (pcx + dx) * size;
      const baseY = (pcy + dy) * size;

      for (let ly = 0; ly < size; ly++) {
        for (let lx = 0; lx < size; lx++) {
          const cell = chunk.cells[ly][lx];
          const audioDef = POSITIONAL_AUDIO_ASSETS[cell.assetKey];
          if (!audioDef) continue;

          const wx = baseX + lx;
          const wy = baseY + ly;
          const id = `pos_${audioDef.sampleId}_${wx}_${wy}`;

          // Skip if already started or attempted
          if (_positionalScanned.has(id)) continue;
          _positionalScanned.add(id);

          playPositionalSfx(state.sfx, audioDef.sampleId, wx, wy, audioDef.maxDist, audioDef.volume);
        }
      }
    }
  }

  // Clean up scanned set for distant chunks (avoid unbounded growth)
  if (_positionalScanned.size > 500) {
    _positionalScanned.clear();
  }
}
