/**
 * walkability-ssot.spec.ts — PR3 Layer 4: runtime cell.walkable SSOT.
 *
 * Proves:
 *  W0 — gameplay footprint path is cell-only (no activeConditions unlock)
 *  W1 hard — four-corner water hard-fails footprint walkability
 *  W2 — locked quiz_gate / door_locked full-tile block until cell rewrite
 *  W3 — unloaded chunk samples return walkable
 *  W5 — bridge walkable; adjacent water not (neighborhood matrix)
 *  Policy — expectedWalkableDefault matches product law for water/bridge/gates
 *
 * @see memories/repo/design-play-stack-first-principles-2026-07-19.md (L4)
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test.describe('Walkability SSOT (PR3 L4)', () => {
  test('bridge walkable; 8-neighborhood water not; grass walkable (W5 matrix)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const defs = debug.getAssetDefs();
      const chunk = state.chunks.get('0,0');
      if (!chunk) throw new Error('Expected origin chunk');

      const setCell = (x: number, y: number, assetKey: string) => {
        const def = defs[assetKey];
        chunk.cells[y][x] = {
          assetKey,
          walkable: def.walkable,
          interactable: def.interactable ?? false,
        };
      };

      for (let y = 0; y < 25; y++) {
        for (let x = 0; x < 25; x++) setCell(x, y, 'grass');
      }
      // Cross of water with bridge at center
      for (let x = 9; x <= 13; x++) setCell(x, 12, 'water');
      for (let y = 9; y <= 13; y++) setCell(11, y, 'water');
      setCell(11, 12, 'bridge');

      const neighbors: Record<string, boolean> = {};
      const deltas = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [1, -1], [-1, 1], [1, 1],
      ];
      for (const [dx, dy] of deltas) {
        neighbors[`${dx},${dy}`] = debug.isFootprintWalkable(11.5 + dx, 12.5 + dy);
      }

      return {
        onBridge: debug.isFootprintWalkable(11.5, 12.5) as boolean,
        neighbors,
        grass: debug.isFootprintWalkable(5.5, 5.5) as boolean,
        bridgeCellWalkable: chunk.cells[12][11].walkable as boolean,
        waterCellWalkable: chunk.cells[12][10].walkable as boolean,
      };
    });

    expect(result.onBridge, 'bridge cell footprint must be walkable').toBe(true);
    expect(result.bridgeCellWalkable).toBe(true);
    expect(result.waterCellWalkable).toBe(false);
    expect(result.grass).toBe(true);
    for (const [key, walkable] of Object.entries(result.neighbors)) {
      expect(walkable, `neighbor offset ${key} (water) must NOT be walkable`).toBe(false);
    }
  });

  test('W1 hard: any of four footprint corners on water fails walkability', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const defs = debug.getAssetDefs();
      const chunk = state.chunks.get('0,0');
      if (!chunk) throw new Error('Expected origin chunk');

      const setCell = (x: number, y: number, assetKey: string) => {
        const def = defs[assetKey];
        chunk.cells[y][x] = {
          assetKey,
          walkable: def.walkable,
          interactable: def.interactable ?? false,
        };
      };

      for (let y = 0; y < 25; y++) {
        for (let x = 0; x < 25; x++) setCell(x, y, 'grass');
      }
      // Water cell at (12,12). Player center on grass at (11.5, 12.5) but
      // collision half-extent 0.3 reaches into water at x=11.8 corner samples
      // when standing near the edge.
      setCell(12, 12, 'water');

      // Center of water tile — all four corners on water
      const centerWater = debug.isFootprintWalkable(12.5, 12.5) as boolean;

      // Standing just west of water so +x corners clip into water (W1 hard)
      // player at x=11.75, halfW=0.3 → right corners at 12.05 → floor 12 water
      const edgeClip = debug.isFootprintWalkable(11.75, 12.5) as boolean;

      // Safe grass well away
      const safeGrass = debug.isFootprintWalkable(5.5, 5.5) as boolean;

      // Center of grass adjacent, half-extent stays inside grass (x=11.2, +0.3=11.5)
      const adjacentSafe = debug.isFootprintWalkable(11.2, 12.5) as boolean;

      return { centerWater, edgeClip, safeGrass, adjacentSafe };
    });

    expect(result.safeGrass).toBe(true);
    expect(result.adjacentSafe, 'footprint fully on grass stays walkable').toBe(true);
    expect(result.centerWater, 'center on water must hard-fail').toBe(false);
    expect(result.edgeClip, 'one corner on water must hard-fail (no half-in-river)').toBe(false);
  });

  test('locked quiz_gate blocks full tile; unlock only via cell rewrite (W2)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const defs = debug.getAssetDefs();
      const chunk = state.chunks.get('0,0');
      if (!chunk) throw new Error('Expected origin chunk');

      const setCell = (x: number, y: number, assetKey: string) => {
        const def = defs[assetKey];
        chunk.cells[y][x] = {
          assetKey,
          walkable: def.walkable,
          interactable: def.interactable ?? false,
        };
      };

      for (let y = 0; y < 25; y++) {
        for (let x = 0; x < 25; x++) setCell(x, y, 'grass');
      }
      setCell(11, 12, 'quiz_gate');
      setCell(13, 12, 'door_locked');

      // Global condition unlock must NOT open cell-SSOT gates
      state.activeConditions.set('quiz-gate', 'unlocked');
      const afterGlobalUnlock = debug.isFootprintWalkable(11.5, 12.5) as boolean;
      const lockedDoor = debug.isFootprintWalkable(13.5, 12.5) as boolean;
      const offCenterGate = debug.isFootprintWalkable(11.5, 12.8) as boolean;

      // Real unlock: cell rewrite (resolveQuizGate shape)
      chunk.cells[12][11] = {
        assetKey: 'door_open',
        walkable: true,
        interactable: false,
        resolved: true,
      };
      const afterRewrite = debug.isFootprintWalkable(11.5, 12.5) as boolean;

      return { afterGlobalUnlock, lockedDoor, offCenterGate, afterRewrite };
    });

    expect(result.afterGlobalUnlock, 'activeConditions unlock must not open quiz_gate under cell SSOT').toBe(false);
    expect(result.lockedDoor, 'door_locked must block').toBe(false);
    expect(result.offCenterGate, 'locked gate blocks full tile (not narrow post)').toBe(false);
    expect(result.afterRewrite, 'cell rewrite to door_open must pass').toBe(true);
  });

  test('unloaded chunk samples return walkable (W3)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      // Far outside loaded origin chunk (chunkSize 25 → chunk 5,5 is unloaded)
      const far = debug.isFootprintWalkable(130.5, 130.5) as boolean;
      return { far };
    });

    expect(result.far, 'unloaded chunk footprint sample must be walkable (gen-on-entry)').toBe(true);
  });

  test('expectedWalkableDefault policy matches product law (not runtime authority)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { expectedWalkableDefault } = await import('/engine/walkability-policy.ts');
      const keys = [
        'water',
        'water_clear_river',
        'water_muddy_creek',
        'bridge',
        'quiz_gate',
        'door_locked',
        'door_open',
        'grass',
        'fence',
        'wall',
        'stone_wall_red_clinker',
        'water_flask',
      ] as const;
      const out: Record<string, boolean> = {};
      for (const k of keys) out[k] = expectedWalkableDefault(k);
      return out;
    });

    expect(result.water).toBe(false);
    expect(result.water_clear_river).toBe(false);
    expect(result.water_muddy_creek).toBe(false);
    expect(result.bridge).toBe(true);
    expect(result.quiz_gate).toBe(false);
    expect(result.door_locked).toBe(false);
    expect(result.door_open).toBe(true);
    expect(result.grass).toBe(true);
    expect(result.fence).toBe(false);
    expect(result.wall).toBe(false);
    expect(result.stone_wall_red_clinker).toBe(false);
    // Collectible — catalog says walkable; policy must not treat water_* as terrain
    expect(result.water_flask).toBe(true);
  });
});
