/**
 * iso2-continuous-feature-solver.spec.ts — Issue #219 continuous feature variant solving.
 */
import { test, expect } from '@playwright/test';

import {
  bitmaskToConnections,
  connectionsToBitmask,
  resolveVariants,
  variantFromBitmask,
  wallBounds,
} from '../../experiment/isometric-2.0/src/solver';
import { WORLD_UNIT_TILES, type MicroTile, type NanoTile, type NanoTileKind, type WorldUnitChunk } from '../../experiment/isometric-2.0/src/types';

function grassTile(nanos: readonly NanoTile[] = []): MicroTile {
  return {
    kind: 'grass',
    biomeId: 'test-grass',
    height: 0,
    walkable: true,
    edgeMasks: {
      top: { samples: [] },
      right: { samples: [] },
      bottom: { samples: [] },
      left: { samples: [] },
    },
    nanos,
  };
}

function nano(kind: NanoTileKind): NanoTile {
  return {
    kind,
    zOffset: kind === 'river' ? 2 : kind === 'fence' ? 2 : 4,
    zMode: kind === 'river' ? 'negative' : 'positive',
    svg: '',
    walkable: { type: kind === 'river' || kind === 'fence' || kind.endsWith('wall') ? 'never' : 'always' },
    blendEdges: kind === 'river',
  };
}

function chunkWith(kind: NanoTileKind, coords: readonly [number, number][]): WorldUnitChunk {
  const occupied = new Set(coords.map(([col, row]) => `${col},${row}`));
  return {
    cx: 0,
    cy: 0,
    tiles: Array.from({ length: WORLD_UNIT_TILES * WORLD_UNIT_TILES }, (_, i) => {
      const col = i % WORLD_UNIT_TILES;
      const row = Math.floor(i / WORLD_UNIT_TILES);
      return grassTile(occupied.has(`${col},${row}`) ? [nano(kind)] : []);
    }),
    cachedCanvas: null,
    dirty: false,
    activeConditions: new Map(),
    walkableMap: [],
  };
}

function variantAt(chunk: WorldUnitChunk, col: number, row: number): string | undefined {
  return chunk.tiles[row * WORLD_UNIT_TILES + col].nanos?.[0]?.variant;
}

test.describe('Iso 2.0 continuous feature solver (#219)', () => {
  test('canonical 16-entry bitmask lookup matches bit0 top, bit1 right, bit2 bottom, bit3 left', () => {
    expect(variantFromBitmask(0b0000)).toBe('isolated');
    expect(variantFromBitmask(0b0001)).toBe('end-t');
    expect(variantFromBitmask(0b0010)).toBe('end-r');
    expect(variantFromBitmask(0b0011)).toBe('corner-tr');
    expect(variantFromBitmask(0b0101)).toBe('straight-v');
    expect(variantFromBitmask(0b1010)).toBe('straight-h');
    expect(variantFromBitmask(0b0111)).toBe('tee-l');
    expect(variantFromBitmask(0b1110)).toBe('tee-t');
    expect(variantFromBitmask(0b1111)).toBe('cross');

    const conn = bitmaskToConnections(0b1010);
    expect(conn).toEqual({ top: false, right: true, bottom: false, left: true });
    expect(connectionsToBitmask(conn)).toBe(0b1010);
  });

  test('resolveVariants mutates same-kind fence corners and perimeter pieces in place', () => {
    const chunk = chunkWith('fence', [
      [1, 1], [2, 1], [3, 1],
      [1, 2],         [3, 2],
      [1, 3], [2, 3], [3, 3],
    ]);

    resolveVariants(chunk, 'fence');

    expect(variantAt(chunk, 1, 1)).toBe('corner-br');
    expect(variantAt(chunk, 3, 1)).toBe('corner-bl');
    expect(variantAt(chunk, 1, 3)).toBe('corner-tr');
    expect(variantAt(chunk, 3, 3)).toBe('corner-tl');
    expect(variantAt(chunk, 2, 1)).toBe('straight-h');
    expect(variantAt(chunk, 1, 2)).toBe('straight-v');
    expect(variantAt(chunk, 2, 3)).toBe('straight-h');
    expect(variantAt(chunk, 3, 2)).toBe('straight-v');
  });

  test('resolveVariants selects straight wall middles and river cross center', () => {
    const wall = chunkWith('stone-wall', [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]]);
    resolveVariants(wall, 'stone-wall');
    expect(variantAt(wall, 0, 2)).toBe('end-r');
    expect(variantAt(wall, 1, 2)).toBe('straight-h');
    expect(variantAt(wall, 2, 2)).toBe('straight-h');
    expect(variantAt(wall, 3, 2)).toBe('straight-h');
    expect(variantAt(wall, 4, 2)).toBe('end-l');

    const river = chunkWith('river', [[2, 1], [1, 2], [2, 2], [3, 2], [2, 3]]);
    resolveVariants(river, 'river');
    expect(variantAt(river, 2, 2)).toBe('cross');
  });

  test('wall endpoint geometry extends toward its solved neighbor', () => {
    expect(wallBounds('end-r').rects.some(rect => rect.x === 96 && rect.w === 48)).toBe(true);
    expect(wallBounds('end-l').rects.some(rect => rect.x === 0 && rect.w === 48)).toBe(true);
  });
});
