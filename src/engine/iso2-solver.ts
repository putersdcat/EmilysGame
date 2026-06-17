/**
 * iso2-solver.ts — Barrel re-export for the Iso 2.0 walkability solver.
 *
 * Decomposed in B9.1–B9.3 (issue #272) into focused sub-modules:
 *   - bitmask.ts     — connectionsToBitmask / bitmaskToConnections /
 *                      variantFromBitmask / resolveVariants
 *   - footprints.ts  — wallBounds / pointHitsWallFootprint /
 *                      pointHitsFenceFootprint + WALL/FENCE constants
 *   - walkability.ts — isPointWalkableInTile / buildWalkableMap /
 *                      resolveCondition
 *
 * All public API is preserved here for backward compat with existing
 * consumers (rendering/nano-tile-svgs.ts, rendering/terrain-cache.ts,
 * engine/world/ChunkGenerator.ts comments).
 *
 * Source of truth during the port: experiment/isometric-2.0/src/solver.ts
 */
export {
  connectionsToBitmask,
  bitmaskToConnections,
  variantFromBitmask,
  resolveVariants,
} from './iso2/bitmask';

export {
  WALL_THICKNESS,
  WALL_OFFSET,
  FENCE_THICKNESS,
  wallBounds,
  pointHitsWallFootprint,
  pointHitsFenceFootprint,
} from './iso2/footprints';

export {
  isPointWalkableInTile,
  buildWalkableMap,
  resolveCondition,
} from './iso2/walkability';