/**
 * walkability.ts — Coarse + exact sub-tile walkability queries.
 *
 * Two layers:
 *   - `buildWalkableMap` / `resolveCondition` — coarse 5×5 boolean map
 *     per world-unit. Cheap, used for pathfinding + chunk-level collisions.
 *   - `isPointWalkableInTile` — exact query for a fractional player
 *     position. Uses the per-nano footprint from `footprints.ts` so
 *     players can slide along walls and stand on open portions of
 *     rivers / fences / gates.
 *
 * Bridges and unlocked gates intentionally override a river's
 * `never`-walkable rule for the whole tile (matching the coarse map).
 */
import type { IsoNanoTile as NanoTile } from '../../types/iso-renderer.types.js';
// Footprint geometry stays in footprints.ts (render/tools + future sub-tile
// collision restore). Gameplay collision for structures is full-tile now
// (see nanoBlocksPoint). Consumers import footprints via iso2-solver barrel.

/** Default world-unit dimension (5 in main iso config). */
const N = 5;

/**
 * Test whether a single nano blocks a fractional point inside its tile.
 * Already-unlocked nanos (conditional+unlocked or always) never block.
 *
 * Functional-first (2026-07-15): walls, fences, and locked gates block the
 * **entire** micro tile — same as Minecraft-style solid cells. Sub-tile
 * footprints (pointHitsWallFootprint / pointHitsFenceFootprint) looked
 * correct for sliding along rails, but in live play they produced
 * "random" snags and walk-pasts near posts/gates that did not match what
 * the player expected from a solid obstacle. Visual/iso2 polish can restore
 * thin footprints later; rivers still need non-full-tile rules only when
 * a bridge/unlocked overlay is present (handled in isPointWalkableInTile).
 */
function nanoBlocksPoint(
  nano: NanoTile,
  activeConditions: ReadonlyMap<string, 'locked' | 'unlocked'>,
  _localColFrac: number,
  _localRowFrac: number,
): boolean {
  if (nano.walkable.type === 'always') return false;
  if (nano.walkable.type === 'conditional' && activeConditions.get(nano.walkable.conditionId) === 'unlocked') return false;

  // Structural solids + locked conditionals: full tile.
  // River 'never' without bridge: full tile (bridge/always short-circuits above).
  return nano.walkable.type === 'never' || nano.walkable.type === 'conditional';
}

/**
 * Sub-tile walkability for fractional player positions.
 * Structural walls/fences/gates are full-tile when locked (see nanoBlocksPoint).
 * Bridges / unlocked conditionals still open the whole tile.
 */
export function isPointWalkableInTile(
  nanos: readonly NanoTile[] | undefined,
  activeConditions: ReadonlyMap<string, 'locked' | 'unlocked'>,
  localColFrac: number,
  localRowFrac: number,
): boolean {
  if (!nanos || nanos.length === 0) return true;

  // Bridges / unlocked gates intentionally override a river's never-walkable
  // rule for the whole tile (matching buildWalkableMap coarse semantics).
  if (nanos.some(nano =>
    nano.walkable.type === 'always' ||
    (nano.walkable.type === 'conditional' && activeConditions.get(nano.walkable.conditionId) === 'unlocked')
  )) {
    return true;
  }

  return !nanos.some(nano => nanoBlocksPoint(nano, activeConditions, localColFrac, localRowFrac));
}

/**
 * Build a coarse walkable map for a 5×5 set of tiles (row-major).
 * Priority: locked conditional > unlocked/always > never.
 * Used for quick collision + the exact point query narrows further.
 */
export function buildWalkableMap(
  nanosPerTile: Array<readonly NanoTile[] | undefined>,
  activeConditions: ReadonlyMap<string, 'locked' | 'unlocked'>,
): boolean[] {
  const map: boolean[] = new Array(N * N).fill(true);

  for (let i = 0; i < N * N; i++) {
    const nanos = nanosPerTile[i];
    if (!nanos || nanos.length === 0) continue;

    let hasNeverBlock = false;
    let hasAlwaysPass = false;
    let hasConditionalUnlocked = false;
    let hasConditionalLocked = false;

    for (const nano of nanos) {
      switch (nano.walkable.type) {
        case 'never':
          hasNeverBlock = true;
          break;
        case 'always':
          hasAlwaysPass = true;
          break;
        case 'conditional': {
          const state = activeConditions.get(nano.walkable.conditionId);
          if (state === 'unlocked') hasConditionalUnlocked = true;
          else hasConditionalLocked = true;
          break;
        }
      }
    }

    if (hasConditionalLocked) {
      map[i] = false;
    } else if (hasConditionalUnlocked || hasAlwaysPass) {
      map[i] = true;
    } else if (hasNeverBlock) {
      map[i] = false;
    }
  }

  return map;
}

/**
 * Unlock a condition (e.g. gate/quiz answer) and rebuild the walk map.
 * Callers must also mark the chunk dirty for re-bake.
 */
export function resolveCondition(
  walkableMap: boolean[],
  nanosPerTile: Array<readonly NanoTile[] | undefined>,
  activeConditions: Map<string, 'locked' | 'unlocked'>,
  conditionId: string,
): void {
  if (!activeConditions.has(conditionId)) return;
  activeConditions.set(conditionId, 'unlocked');
  const newMap = buildWalkableMap(nanosPerTile, activeConditions);
  walkableMap.length = 0;
  walkableMap.push(...newMap);
}