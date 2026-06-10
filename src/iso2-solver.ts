/**
 * iso2-solver.ts — Exact walkability queries, footprint tests, and continuous-feature
 * solver metadata (bitmask connections + variant resolution).
 *
 * Ported from experiment/isometric-2.0/src/solver.ts (the source of truth during the
 * main-engine port). See that file + the Iso 2.0 Main Engine Port Instructions for
 * full contracts, proofs, and history.
 *
 * This module centralizes the "exact" sub-tile logic so players can slide along
 * walls/fences, stand on open portions of river banks, and have bridges/gates
 * correctly override never-walkable nanos.
 */

import {
  ISO_MICRO_TILE_SIZE as MICRO_TILE_SIZE,
  type IsoFeatureConnections as FeatureConnections,
  type IsoFeatureVariant as FeatureVariant,
  type IsoNanoTile as NanoTile,
} from './types/iso-renderer.types.js';

// ─── Constants (must stay in sync with wall geometry in nano-tile.ts and experiment) ──

const WALL_THICKNESS = 48;
const WALL_OFFSET = (MICRO_TILE_SIZE - WALL_THICKNESS) / 2;
const FENCE_THICKNESS = 18; // thinner footprint for fences/gates (see experiment solver)

// ─── Bitmask / Variant Resolution (for continuous features: walls, fences, rivers) ──

export function connectionsToBitmask(conn: FeatureConnections): number {
  return (conn.top ? 1 : 0) | (conn.right ? 2 : 0) | (conn.bottom ? 4 : 0) | (conn.left ? 8 : 0);
}

export function bitmaskToConnections(mask: number): FeatureConnections {
  return {
    top: (mask & 1) !== 0,
    right: (mask & 2) !== 0,
    bottom: (mask & 4) !== 0,
    left: (mask & 8) !== 0,
  };
}

export function variantFromBitmask(mask: number): FeatureVariant {
  // Canonical mapping (top=bit0, right=bit1, bottom=bit2, left=bit3).
  // Values chosen to match experiment behavior for the features we have ported (walls, fences, rivers, bridges).
  switch (mask) {
    case 0b0010: return 'straight-h';
    case 0b0101: return 'straight-v';
    case 0b1111: return 'cross';
    case 0b0011: return 'corner-tr';
    case 0b1001: return 'corner-tl';
    case 0b0110: return 'corner-br';
    case 0b1100: return 'corner-bl';
    case 0b0111: return 'tee-t';
    case 0b1011: return 'tee-r';
    case 0b1101: return 'tee-b';
    case 0b1110: return 'tee-l';
    case 0b0001: return 'end-t';
    case 0b0010: return 'end-r'; // note: may overlap in some legacy masks; callers use the resolved connections
    case 0b0100: return 'end-b';
    case 0b1000: return 'end-l';
    default: return 'isolated';
  }
}

/**
 * Resolve variants in-place for a chunk's tiles of a given continuous kind.
 * Mirrors experiment behavior for walls/fences/rivers after the bitmask refactor.
 */
export function resolveVariants(
  tiles: Array<{ kind?: string; nanos?: NanoTile[] }>,
  kind: string,
): void {
  const N = 5; // WORLD_UNIT_TILES in main iso config
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile.nanos) continue;
    for (const nano of tile.nanos) {
      if (nano.kind !== kind) continue;
      // simple neighbor inference (same-kind only, 4-dir)
      const r = Math.floor(i / N);
      const c = i % N;
      const get = (rr: number, cc: number) => {
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) return false;
        const t = tiles[rr * N + cc];
        return !!t?.nanos?.some(n => n.kind === kind);
      };
      const conn: FeatureConnections = {
        top: get(r - 1, c),
        right: get(r, c + 1),
        bottom: get(r + 1, c),
        left: get(r, c - 1),
      };
      (nano as { connections?: FeatureConnections }).connections = conn;
      (nano as { variant?: FeatureVariant }).variant = variantFromBitmask(connectionsToBitmask(conn));
    }
  }
}

// ─── Footprint Geometry (exact sub-tile blocking) ──────────────────────────────

function rectContainsPoint(
  rect: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function wallBounds(variant: FeatureVariant): { rects: Array<{ x: number; y: number; w: number; h: number }> } {
  const W = WALL_THICKNESS;
  const off = WALL_OFFSET;
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  const arms = { top: false, right: false, bottom: false, left: false };

  switch (variant) {
    case 'straight-h': arms.left = true; arms.right = true; break;
    case 'straight-v': arms.top = true; arms.bottom = true; break;
    case 'corner-tr': arms.top = true; arms.right = true; break;
    case 'corner-tl': arms.top = true; arms.left = true; break;
    case 'corner-br': arms.bottom = true; arms.right = true; break;
    case 'corner-bl': arms.bottom = true; arms.left = true; break;
    case 'cross': arms.top = arms.right = arms.bottom = arms.left = true; break;
    case 'tee-t': arms.left = arms.right = arms.bottom = true; break;
    case 'tee-b': arms.left = arms.right = arms.top = true; break;
    case 'tee-r': arms.top = arms.bottom = arms.left = true; break;
    case 'tee-l': arms.top = arms.bottom = arms.right = true; break;
    case 'end-t': arms.top = true; break;
    case 'end-b': arms.bottom = true; break;
    case 'end-r': arms.left = true; break;
    case 'end-l': arms.right = true; break;
    default:
      rects.push({ x: off, y: off, w: W, h: W });
      return { rects };
  }

  rects.push({ x: off, y: off, w: W, h: W });
  if (arms.top) rects.push({ x: off, y: 0, w: W, h: off });
  if (arms.bottom) rects.push({ x: off, y: off + W, w: W, h: off });
  if (arms.left) rects.push({ x: 0, y: off, w: off, h: W });
  if (arms.right) rects.push({ x: off + W, y: off, w: off, h: W });
  return { rects };
}

function footprintBounds(variant: FeatureVariant, thickness: number): { rects: Array<{ x: number; y: number; w: number; h: number }> } {
  const off = (MICRO_TILE_SIZE - thickness) / 2;
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  const arms = { top: false, right: false, bottom: false, left: false };

  switch (variant) {
    case 'straight-h': arms.left = true; arms.right = true; break;
    case 'straight-v': arms.top = true; arms.bottom = true; break;
    case 'corner-tr': arms.top = true; arms.right = true; break;
    case 'corner-tl': arms.top = true; arms.left = true; break;
    case 'corner-br': arms.bottom = true; arms.right = true; break;
    case 'corner-bl': arms.bottom = true; arms.left = true; break;
    case 'cross': arms.top = arms.right = arms.bottom = arms.left = true; break;
    case 'tee-t': arms.left = arms.right = arms.bottom = true; break;
    case 'tee-b': arms.left = arms.right = arms.top = true; break;
    case 'tee-r': arms.top = arms.bottom = arms.left = true; break;
    case 'tee-l': arms.top = arms.bottom = arms.right = true; break;
    case 'end-t': arms.top = true; break;
    case 'end-b': arms.bottom = true; break;
    case 'end-r': arms.left = true; break;
    case 'end-l': arms.right = true; break;
    default:
      rects.push({ x: off, y: off, w: thickness, h: thickness });
      return { rects };
  }

  rects.push({ x: off, y: off, w: thickness, h: thickness });
  if (arms.top) rects.push({ x: off, y: 0, w: thickness, h: off });
  if (arms.bottom) rects.push({ x: off, y: off + thickness, w: thickness, h: off });
  if (arms.left) rects.push({ x: 0, y: off, w: off, h: thickness });
  if (arms.right) rects.push({ x: off + thickness, y: off, w: off, h: thickness });
  return { rects };
}

export function pointHitsWallFootprint(
  variant: FeatureVariant,
  localColFrac: number,
  localRowFrac: number,
): boolean {
  const x = Math.max(0, Math.min(MICRO_TILE_SIZE, localColFrac * MICRO_TILE_SIZE));
  const y = Math.max(0, Math.min(MICRO_TILE_SIZE, localRowFrac * MICRO_TILE_SIZE));
  return wallBounds(variant).rects.some(rect => rectContainsPoint(rect, x, y));
}

export function pointHitsFenceFootprint(
  variant: FeatureVariant,
  localColFrac: number,
  localRowFrac: number,
): boolean {
  const x = Math.max(0, Math.min(MICRO_TILE_SIZE, localColFrac * MICRO_TILE_SIZE));
  const y = Math.max(0, Math.min(MICRO_TILE_SIZE, localRowFrac * MICRO_TILE_SIZE));
  return footprintBounds(variant, FENCE_THICKNESS).rects.some(rect => rectContainsPoint(rect, x, y));
}

function nanoBlocksPoint(
  nano: NanoTile,
  activeConditions: ReadonlyMap<string, 'locked' | 'unlocked'>,
  localColFrac: number,
  localRowFrac: number,
): boolean {
  if (nano.walkable.type === 'always') return false;
  if (nano.walkable.type === 'conditional' && activeConditions.get(nano.walkable.conditionId) === 'unlocked') return false;

  if (nano.kind === 'stone-wall' || nano.kind === 'cathedral-wall' || nano.kind === 'homestead-wall') {
    return pointHitsWallFootprint(nano.variant ?? 'isolated', localColFrac, localRowFrac);
  }
  if (nano.kind === 'fence' || nano.kind === 'gate') {
    return pointHitsFenceFootprint(nano.variant ?? 'isolated', localColFrac, localRowFrac);
  }

  // river / river-bank / other 'never' or locked conditional
  return nano.walkable.type === 'never' || nano.walkable.type === 'conditional';
}

/**
 * Exact sub-tile walkability for fractional player positions.
 * Coarse walkableMap says whether a micro tile is generally blocked; this
 * narrows structural nanos to their real footprint so players can slide
 * along walls/fences and stand on open portions of the same micro tile.
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
 * Build a coarse walkable map for a 5x5 set of tiles (row-major).
 * Priority: locked conditional > unlocked/always > never.
 * Used for quick collision + the exact point query narrows further.
 */
export function buildWalkableMap(
  nanosPerTile: Array<readonly NanoTile[] | undefined>,
  activeConditions: ReadonlyMap<string, 'locked' | 'unlocked'>,
): boolean[] {
  const N = 5;
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