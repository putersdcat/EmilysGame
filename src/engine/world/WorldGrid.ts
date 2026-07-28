/**
 * WorldGrid.ts — Single source of truth for world unit grid dimensions.
 *
 * B3 micro-slice 8.6 (#253): the world-unit constants WU_SIZE and
 * GRID_DIM were previously duplicated as local `const`s in:
 *   - src/engine/gen.ts              (orchestrator)
 *   - src/engine/world/WorldUnitSolver.ts  (solver)
 *   - src/engine/world/Populator.ts  (content population)
 *   - src/rendering/terrain-cache.ts (rendering cache)
 *
 * Centralizing them here removes 4-way duplication and gives the engine
 * a single import path. The constants are still derived from
 * WORLD_CONFIG at module-load time, so any change to worldUnitSize or
 * chunkSize still propagates everywhere automatically.
 *
 * Why these constants are not in WORLD_CONFIG directly:
 *   GRID_DIM is derived (chunkSize / worldUnitSize), not a config value.
 *   Keeping it as a const here avoids forcing every consumer to compute
 *   the division and risks of off-by-one or rounding errors.
 *
 * Why a separate module (not a barrel re-export from gen.ts):
 *   gen.ts is a "facade" for the old world-gen surface; consumers
 *   historically imported many things from it. Importing WU_SIZE from
 *   gen.ts would make the layering circular (gen.ts depends on the
 *   world/ modules, the world/ modules would depend on gen.ts).
 *   WorldGrid.ts sits at the bottom of the world/ layer and has no
 *   dependencies on the rest of the world-gen system.
 */

import { WORLD_CONFIG } from '../../config/game.config';

/**
 * World unit size — the number of cells along one edge of a world
 * unit (the base block the AC-3 solver places). Typically 5.
 */
export const WU_SIZE = WORLD_CONFIG.worldUnitSize;

/**
 * Number of world units along one edge of a chunk. Typically 5
 * (yielding a 5×5 = 25 world unit grid, which stamps into a 25×25
 * cell chunk when worldUnitSize == 5).
 */
export const GRID_DIM = WORLD_CONFIG.chunkSize / WU_SIZE;
