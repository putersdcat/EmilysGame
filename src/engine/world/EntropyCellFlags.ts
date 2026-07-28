/**
 * EntropyCellFlags.ts — Phase 5.5 of chunk generation: LLM entropy cell flags (#4).
 *
 * Binary char code flags from entropy buffer/seed text. Per the design doc:
 * convert text chars to binary, use bits as cell property flags. This creates
 * subtle player-influenced variation: NPC chat → entropy pool → cell flags.
 *
 * B5 micro-slice 9.2 (#253): extracted from gen.ts. The function operates
 * on the already-built cells grid (after Phase 1 terrain + Phase 2 solver
 * + Phase 3 stamp + Phase 4 passability + Phase 5 population) and applies
 * entropy-derived overrides to ~10% of walkable cells.
 *
 * Invariants protected:
 *   - #4: LLM entropy → cell property variation
 *   - #265: determinism via seeded RNG (no Math.random())
 *
 * @see WorldEngine-05-PopulationAndProgression.md (Phase 5.5: entropy flags)
 */

import { ASSET_DEFS } from '../../config/assets.config';
import { type BiomeDef } from '../../config/biomes.config';
import { seededRandom } from '../utils';
import { getEntropyBuffer } from './Entropy';
import type { CellData } from '../../types/game.types';

/**
 * Apply entropy-derived flags to a small percentage of walkable cells.
 *
 * Flag source: last 256 chars of the entropy buffer (player-influenced
 * via NPC chat), or a deterministic fallback if the buffer is empty.
 *
 * Bit 0: Spawn bonus collectible (coin/flower/gem based on biome)
 * Bit 1: Mark cell as interactable (very rare — ~2% of flagged cells)
 *
 * Only ~10% of cells are processed (rng() > 0.10 skip), so the override
 * is subtle enough to not dominate the base terrain.
 */
export function applyEntropyCellFlags(
  cells: CellData[][],
  size: number,
  featureSeed: number,
  chunkX: number,
  chunkY: number,
  biome: BiomeDef,
): void {
  // Build a flag source string from entropy buffer + chunk seed
  const entropyBuffer = getEntropyBuffer();
  const flagSource = entropyBuffer.length > 0
    ? entropyBuffer.slice(-256)  // Use last 256 chars of pool
    : `fallback_${chunkX}_${chunkY}_${featureSeed}`;

  // Convert to byte array for bit extraction
  const flagBytes: number[] = [];
  for (let i = 0; i < flagSource.length; i++) {
    flagBytes.push(flagSource.charCodeAt(i));
  }
  if (flagBytes.length === 0) return;

  const rng = seededRandom(featureSeed + 777);
  let byteIdx = 0;

  // Scan cells and apply entropy-derived flags to a small percentage
  // (~10% of cells get entropy overrides - enough for subtle variation)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (rng() > 0.10) continue; // Only process ~10% of cells

      const cell = cells[y][x];
      if (!cell.walkable) continue; // Don't modify obstacles

      const byte = flagBytes[byteIdx % flagBytes.length];
      byteIdx++;

      // Bit 0: Spawn bonus collectible (coin/flower based on biome)
      if ((byte & 0x01) && !cell.itemId) {
        const collectibles = biome.id === 0 ? ['flower', 'coin'] :
                            biome.id === 1 ? ['mushroom', 'coin'] :
                            ['coin', 'gem'];
        const pick = collectibles[byte % collectibles.length];
        if (ASSET_DEFS[pick]) {
          cell.itemId = pick;
        }
      }

      // Bit 1: Mark cell as interactable (sign, decoration)
      if ((byte & 0x02) && rng() < 0.02) {
        // Very rare: entropy-placed signs with flavor text
        cell.interactable = true;
      }
    }
  }
}
