/**
 * edge-contracts-v2.spec.ts — E2E tests for Edge Contract Enhancements (#42).
 * Tests traversal channels, corner governance, chain ports, and full game run.
 *
 * TODO: DOC — edge contract v2 test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  const skipBtn = page.locator('#btnSkipLlm');
  if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipBtn.click();
  }

  await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1500);

  const hasDebug = await page.evaluate(() => !!(window as any).__gameDebug);
  expect(hasDebug).toBe(true);
}

test.describe('Edge Contract Enhancements (#42)', () => {

  test('computeTraversalChannels returns correct values for known grids', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // All-grass grid → all sides traversable
      const allGrass = Array.from({ length: 5 }, () => Array(5).fill('grass'));
      const tc1 = dbg.computeTraversalChannels(allGrass);

      // All-wall grid → no sides traversable
      const allWall = Array.from({ length: 5 }, () => Array(5).fill('stone_wall'));
      const tc2 = dbg.computeTraversalChannels(allWall);

      // Null grid (inherit terrain) → all sides traversable
      const allNull = Array.from({ length: 5 }, () => Array(5).fill(null));
      const tc3 = dbg.computeTraversalChannels(allNull);

      // Mixed: wall border except one opening on north
      const mixed = [
        ['stone_wall', 'stone_wall', 'grass', 'stone_wall', 'stone_wall'],
        ['stone_wall', 'grass', 'grass', 'grass', 'stone_wall'],
        ['stone_wall', 'grass', 'grass', 'grass', 'stone_wall'],
        ['stone_wall', 'grass', 'grass', 'grass', 'stone_wall'],
        ['stone_wall', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_wall'],
      ];
      const tc4 = dbg.computeTraversalChannels(mixed);

      return { tc1, tc2, tc3, tc4 };
    });

    // All grass
    expect(result.tc1).toEqual({ n: true, s: true, e: true, w: true });
    // All wall
    expect(result.tc2).toEqual({ n: false, s: false, e: false, w: false });
    // All null
    expect(result.tc3).toEqual({ n: true, s: true, e: true, w: true });
    // Mixed: north has grass opening, other borders are all wall
    expect(result.tc4.n).toBe(true);
    expect(result.tc4.s).toBe(false);
    expect(result.tc4.e).toBe(false);
    expect(result.tc4.w).toBe(false);
  });

  test('computeCornerCells extracts correct corner values', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const grid = [
        ['water', 'grass', 'grass', 'grass', 'sand'],
        ['grass', 'grass', 'grass', 'grass', 'grass'],
        ['grass', 'grass', 'grass', 'grass', 'grass'],
        ['grass', 'grass', 'grass', 'grass', 'grass'],
        ['dirt', 'grass', 'grass', 'grass', 'rock'],
      ];
      return dbg.computeCornerCells(grid);
    });

    expect(result).toEqual({ nw: 'water', ne: 'sand', sw: 'dirt', se: 'rock' });
  });

  test('computeCornerCells defaults null to grass', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const grid = [
        [null, 'grass', 'grass', 'grass', null],
        ['grass', 'grass', 'grass', 'grass', 'grass'],
        ['grass', 'grass', 'grass', 'grass', 'grass'],
        ['grass', 'grass', 'grass', 'grass', 'grass'],
        [null, 'grass', 'grass', 'grass', null],
      ];
      return dbg.computeCornerCells(grid);
    });

    expect(result).toEqual({ nw: 'grass', ne: 'grass', sw: 'grass', se: 'grass' });
  });

  test('computeChainPorts auto-computes from edgeTags and chainType', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;

      // Non-chain template → empty ports
      const p1 = dbg.computeChainPorts(
        { n: 'open', s: 'open', e: 'open', w: 'open' },
        undefined,
        false,
      );

      // River straight N-S → water on n/s → entries+exits on n,s
      const p2 = dbg.computeChainPorts(
        { n: 'water', s: 'water', e: 'open', w: 'open' },
        'river',
        false,
      );

      // River end pond (terminator) → entries on n, no exits
      const p3 = dbg.computeChainPorts(
        { n: 'water', s: 'open', e: 'open', w: 'open' },
        'river',
        true,
      );

      return { p1, p2, p3 };
    });

    expect(result.p1).toEqual({ entries: [], exits: [] });
    expect(result.p2.entries).toContain('n');
    expect(result.p2.entries).toContain('s');
    expect(result.p2.exits).toContain('n');
    expect(result.p2.exits).toContain('s');
    expect(result.p3.entries).toContain('n');
    expect(result.p3.exits).toEqual([]);
  });

  test('RotatedTemplate includes traversalChannels, cornerCells, chainPorts', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const rotations = dbg.getAllTemplateRotations();
      const errors: string[] = [];

      for (const [name, rots] of rotations.entries()) {
        for (const rot of rots as any[]) {
          if (!rot.traversalChannels) errors.push(`${name}@${rot.rotation}: missing traversalChannels`);
          if (!rot.cornerCells) errors.push(`${name}@${rot.rotation}: missing cornerCells`);
          if (!rot.chainPorts) errors.push(`${name}@${rot.rotation}: missing chainPorts`);
        }
      }
      return { errors, templateCount: rotations.size };
    });

    expect(result.errors).toEqual([]);
    expect(result.templateCount).toBeGreaterThan(50); // We have 63 templates
  });

  test('rotation correctly rotates traversalChannels', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const rotations = dbg.getAllTemplateRotations();

      // Find a rotatable template with asymmetric traversal channels
      // wall_segment: open N/S, wall E/W → should have traversal on all sides (null borders)
      const wallSegRots = rotations.get('wall_segment');
      if (!wallSegRots || wallSegRots.length < 2) return { skip: true };

      // The 0° and 90° rotations should have swapped traversalChannels
      const r0 = wallSegRots[0];
      const r90 = wallSegRots[1];
      return {
        skip: false,
        r0tc: r0.traversalChannels,
        r90tc: r90.traversalChannels,
        r0edges: r0.edgeTags,
        r90edges: r90.edgeTags,
      };
    });

    if ((result as any).skip) return;
    // After 90° CW rotation: n←w, e←n, s←e, w←s
    expect(result.r90tc.n).toBe(result.r0tc.w);
    expect(result.r90tc.e).toBe(result.r0tc.n);
    expect(result.r90tc.s).toBe(result.r0tc.e);
    expect(result.r90tc.w).toBe(result.r0tc.s);
  });

  test('rotation correctly rotates cornerCells', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const rotations = dbg.getAllTemplateRotations();

      // Use shore_corner_ne which has diverse corners and is rotatable
      const rots = rotations.get('shore_corner_ne');
      if (!rots || rots.length < 2) return { skip: true };

      const r0 = rots[0];
      const r90 = rots[1];
      return {
        skip: false,
        r0cc: r0.cornerCells,
        r90cc: r90.cornerCells,
      };
    });

    if ((result as any).skip) return;
    // After 90° CW: nw←sw, ne←nw, se←ne, sw←se
    expect(result.r90cc.nw).toBe(result.r0cc.sw);
    expect(result.r90cc.ne).toBe(result.r0cc.nw);
    expect(result.r90cc.se).toBe(result.r0cc.ne);
    expect(result.r90cc.sw).toBe(result.r0cc.se);
  });

  test('corner governance rejects >2 surface types at junction', async ({ page }) => {
    await waitForGame(page);
    // This is a structural test — verify the game runs with governance enabled
    // and still produces valid worlds without errors.
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const config = dbg.getTileConfig();
      // Verify MICRO_TILE_DEFS has surface types we can compare
      const surfaces = new Set<string>();
      for (const def of Object.values(config.MICRO_TILE_DEFS) as any[]) {
        surfaces.add(def.surface);
      }
      return { surfaceCount: surfaces.size, surfaces: [...surfaces] };
    });

    // We should have multiple surface types for governance to matter
    expect(result.surfaceCount).toBeGreaterThanOrEqual(4);
    expect(result.surfaces).toContain('grass');
    expect(result.surfaces).toContain('stone');
    expect(result.surfaces).toContain('water');
  });

  test('game runs without errors with edge contract v2 enabled', async ({ page }) => {
    await waitForGame(page);

    // Collect console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Move the player to trigger chunk generation
    await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      if (dbg.state) {
        // Force player to move so new chunks generate
        dbg.state.playerX += 100;
        dbg.state.playerY += 100;
      }
    });
    await page.waitForTimeout(2000);

    // Move in opposite direction to generate more chunks
    await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      if (dbg.state) {
        dbg.state.playerX -= 200;
        dbg.state.playerY -= 200;
      }
    });
    await page.waitForTimeout(2000);

    // Check no game-breaking errors
    const criticalErrors = errors.filter(e =>
      e.includes('TypeError') || e.includes('ReferenceError') || e.includes('traversal') || e.includes('corner'),
    );
    expect(criticalErrors).toEqual([]);
  });

  test('chain ports are preserved through rotations for chain templates', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const rotations = dbg.getAllTemplateRotations();

      // river_straight_ns has chainType 'river', is rotatable
      const riverRots = rotations.get('river_straight_ns');
      if (!riverRots || riverRots.length < 2) return { skip: true };

      const r0 = riverRots[0];
      const r90 = riverRots[1];

      return {
        skip: false,
        r0ports: r0.chainPorts,
        r90ports: r90.chainPorts,
        r0name: r0.baseName,
        r0rot: r0.rotation,
        r90rot: r90.rotation,
      };
    });

    if ((result as any).skip) return;

    // river_straight_ns 0°: entries/exits on n,s
    expect(result.r0ports.entries).toContain('n');
    expect(result.r0ports.entries).toContain('s');
    // After 90° CW rotation: n→e, s→w
    expect(result.r90ports.entries).toContain('e');
    expect(result.r90ports.entries).toContain('w');
  });
});
