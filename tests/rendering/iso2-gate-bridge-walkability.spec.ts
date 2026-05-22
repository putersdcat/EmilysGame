/**
 * iso2-gate-bridge-walkability.spec.ts — Issue #223 gate / bridge walkability semantics.
 *
 * Uses the Iso 2.0 solver walkable-map API directly so locked/unlocked gate
 * behavior is deterministic and does not depend on browser timing or quiz UI.
 */
import { test, expect } from '@playwright/test';

import { buildWalkableMap, gateSvg, trollBridgeSvg } from '../../experiment/isometric-2.0/src/solver';
import type { MicroTile, NanoTile, WorldUnitChunk } from '../../experiment/isometric-2.0/src/types';
import { WORLD_UNIT_TILES } from '../../experiment/isometric-2.0/src/types';

const GATE_CONDITION_ID = 'quiz:test-gate';

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

function fenceNano(): NanoTile {
  return {
    kind: 'fence',
    zOffset: 2,
    zMode: 'positive',
    svg: '',
    walkable: { type: 'never' },
    blendEdges: false,
  };
}

function gateNano(): NanoTile {
  return {
    kind: 'gate',
    zOffset: 2,
    zMode: 'positive',
    svg: gateSvg(false),
    walkable: { type: 'conditional', conditionId: GATE_CONDITION_ID },
    blendEdges: false,
  };
}

function riverNano(): NanoTile {
  return {
    kind: 'river',
    zOffset: 2,
    zMode: 'negative',
    svg: '',
    walkable: { type: 'never' },
    blendEdges: true,
  };
}

function trollBridgeNano(): NanoTile {
  return {
    kind: 'troll-bridge',
    zOffset: 0,
    zMode: 'flat',
    svg: trollBridgeSvg(false),
    walkable: { type: 'always' },
    blendEdges: false,
  };
}

function makeFenceChunk(gateState: 'locked' | 'unlocked'): WorldUnitChunk {
  const tiles = Array.from({ length: WORLD_UNIT_TILES * WORLD_UNIT_TILES }, () => grassTile());

  for (let row = 0; row < WORLD_UNIT_TILES; row++) {
    for (let col = 0; col < WORLD_UNIT_TILES; col++) {
      const edge = row === 0 || row === WORLD_UNIT_TILES - 1 || col === 0 || col === WORLD_UNIT_TILES - 1;
      if (!edge) continue;
      const isSouthGate = col === 2 && row === WORLD_UNIT_TILES - 1;
      tiles[row * WORLD_UNIT_TILES + col] = grassTile([isSouthGate ? gateNano() : fenceNano()]);
    }
  }

  return {
    cx: 0,
    cy: 0,
    tiles,
    cachedCanvas: null,
    dirty: true,
    activeConditions: new Map([[GATE_CONDITION_ID, gateState]]),
    walkableMap: [],
  };
}

function findPath(map: readonly boolean[], start: number, goal: number): number[] | null {
  const queue: number[][] = [[start]];
  const seen = new Set<number>([start]);
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    if (current === goal) return path;

    const col = current % WORLD_UNIT_TILES;
    const row = Math.floor(current / WORLD_UNIT_TILES);
    for (const [dc, dr] of directions) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (nextCol < 0 || nextCol >= WORLD_UNIT_TILES || nextRow < 0 || nextRow >= WORLD_UNIT_TILES) continue;
      const next = nextRow * WORLD_UNIT_TILES + nextCol;
      if (!map[next] || seen.has(next)) continue;
      seen.add(next);
      queue.push([...path, next]);
    }
  }

  return null;
}

test.describe('Iso 2.0 gate / bridge walkability (#223)', () => {
  test('locked gate blocks BFS out of a fence perimeter, unlocked gate opens it', () => {
    const start = 2 * WORLD_UNIT_TILES + 2;
    const southGate = 4 * WORLD_UNIT_TILES + 2;

    const lockedMap = buildWalkableMap(makeFenceChunk('locked'));
    expect(lockedMap[southGate]).toBe(false);
    expect(findPath(lockedMap, start, southGate)).toBeNull();

    const unlockedMap = buildWalkableMap(makeFenceChunk('unlocked'));
    expect(unlockedMap[southGate]).toBe(true);
    expect(findPath(unlockedMap, start, southGate)).toEqual([start, 3 * WORLD_UNIT_TILES + 2, southGate]);
  });

  test('troll-bridge is walkable over a negative-Z river tile', () => {
    const chunk: WorldUnitChunk = {
      cx: 0,
      cy: 0,
      tiles: [grassTile([riverNano(), trollBridgeNano()]), ...Array.from({ length: WORLD_UNIT_TILES * WORLD_UNIT_TILES - 1 }, () => grassTile())],
      cachedCanvas: null,
      dirty: true,
      activeConditions: new Map(),
      walkableMap: [],
    };

    expect(buildWalkableMap(chunk)[0]).toBe(true);
  });
});
