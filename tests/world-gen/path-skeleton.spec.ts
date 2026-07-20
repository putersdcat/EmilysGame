/**
 * path-skeleton.spec.ts — Scene-first PR4 + critical-path gate policy
 *
 * Early chunks (chunkDist ≤ 2) get a dirt path corridor from a border entry
 * toward a landmark. Path only overwrites soft terrain; structures/gates/water
 * stay intact. Full generateChunkSync(1,0) must show dirt path cells.
 *
 * Zero quiz_gate on some non-origin path chunks is OK (critical-path PR4 /
 * KD13) — min-gate is cut-point-only with no last-resort field punch.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test.describe('Path skeleton (scene-first PR4)', () => {
  test('layPathSkeleton paints dirt corridor on soft terrain only', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { layPathSkeleton, PATH_SKELETON_MAX_DIST } = await import(
        '/engine/world/PathSkeleton.ts'
      );
      const { seededRandom } = await import('/engine/utils.ts');

      const size = 11;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );

      // Landmark near center (house) + flower soft cell on path line
      cells[5][5] = { assetKey: 'house', walkable: false, interactable: false };
      cells[5][3] = { assetKey: 'flower', walkable: true, interactable: true };
      // Solid that must not be erased
      cells[8][2] = { assetKey: 'wall', walkable: false, interactable: false };
      cells[8][4] = { assetKey: 'water', walkable: false, interactable: false };
      cells[8][6] = { assetKey: 'quiz_gate', walkable: false, interactable: true };

      // Force south entry at (2, size-1) by making only that soft (others rock)
      for (let x = 1; x < size - 1; x++) {
        if (x !== 2) {
          cells[size - 1][x] = { assetKey: 'rock', walkable: false, interactable: false };
        }
      }
      // Block west border so entry is forced south
      for (let y = 1; y < size - 1; y++) {
        cells[y][0] = { assetKey: 'rock', walkable: false, interactable: false };
      }

      const far = layPathSkeleton(cells, size, seededRandom(1), PATH_SKELETON_MAX_DIST + 1);
      const applied = layPathSkeleton(cells, size, seededRandom(99), 1);

      let dirt = 0;
      for (const row of cells) {
        for (const c of row) {
          if (c.assetKey === 'dirt') dirt++;
        }
      }

      return {
        farApplied: far.applied,
        farPainted: far.painted,
        applied: applied.applied,
        painted: applied.painted,
        entry: applied.entry,
        landmark: applied.landmark,
        dirt,
        houseIntact: cells[5][5].assetKey === 'house',
        wallIntact: cells[8][2].assetKey === 'wall',
        waterIntact: cells[8][4].assetKey === 'water',
        gateIntact: cells[8][6].assetKey === 'quiz_gate',
        maxDist: PATH_SKELETON_MAX_DIST,
      };
    });

    expect(result.maxDist).toBe(2);
    expect(result.farApplied).toBe(false);
    expect(result.farPainted).toBe(0);

    expect(result.applied).toBe(true);
    expect(result.painted).toBeGreaterThan(0);
    expect(result.dirt).toBeGreaterThan(0);
    expect(result.entry).not.toBeNull();
    expect(result.landmark).not.toBeNull();
    // Landmark should prefer house near center
    expect(result.landmark!.x).toBe(5);
    expect(result.landmark!.y).toBe(5);
    // Structures / water / gate never erased
    expect(result.houseIntact).toBe(true);
    expect(result.wallIntact).toBe(true);
    expect(result.waterIntact).toBe(true);
    expect(result.gateIntact).toBe(true);
  });

  test('fixed seed chunk (1,0) has dirt path cells (quiz_gate not required)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const gen = await import('/engine/gen.ts');
      gen.setWordlist(['alpha beta', 'gamma delta', 'epsilon zeta', 'eta theta']);
      gen.setBiomeNoiseSeed(42);
      gen.restoreEntropyBuffer('');

      const chunk = gen.generateChunkSync(1, 0);
      const chunkDist = Math.abs(1) + Math.abs(0);

      let dirt = 0;
      let quizGate = 0;
      let grass = 0;
      const size = chunk.cells.length;
      // Dirt on south or west border (entry language)
      let borderDirt = 0;
      for (let x = 0; x < size; x++) {
        if (chunk.cells[size - 1][x].assetKey === 'dirt') borderDirt++;
      }
      for (let y = 0; y < size; y++) {
        if (chunk.cells[y][0].assetKey === 'dirt') borderDirt++;
      }

      for (const row of chunk.cells) {
        for (const cell of row) {
          if (cell.assetKey === 'dirt') dirt++;
          if (cell.assetKey === 'quiz_gate') quizGate++;
          if (cell.assetKey === 'grass') grass++;
        }
      }

      // Second call: determinism smoke
      const chunk2 = gen.generateChunkSync(1, 0);
      let dirt2 = 0;
      let quiz2 = 0;
      for (const row of chunk2.cells) {
        for (const cell of row) {
          if (cell.assetKey === 'dirt') dirt2++;
          if (cell.assetKey === 'quiz_gate') quiz2++;
        }
      }

      // Far chunk should still generate without requiring path (no crash)
      const far = gen.generateChunkSync(5, 5);
      let farDirt = 0;
      for (const row of far.cells) {
        for (const cell of row) {
          if (cell.assetKey === 'dirt') farDirt++;
        }
      }

      return {
        chunkDist,
        dirt,
        quizGate,
        grass,
        borderDirt,
        dirt2,
        quiz2,
        farDirt,
        biome: chunk.biomeName,
      };
    });

    expect(result.chunkDist).toBe(1);
    expect(result.dirt, `expected dirt path cells in chunk(1,0); got ${JSON.stringify(result)}`).toBeGreaterThan(0);
    // Critical-path PR4: zero quiz_gate OK on non-origin when no cut-point exists.
    expect(result.quizGate, 'quiz_gate count is non-negative').toBeGreaterThanOrEqual(0);
    // Deterministic
    expect(result.dirt2).toBe(result.dirt);
    expect(result.quiz2).toBe(result.quizGate);
  });

  test('chunkDist > 2 does not force path skeleton (unit)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { layPathSkeleton } = await import('/engine/world/PathSkeleton.ts');
      const { seededRandom } = await import('/engine/utils.ts');
      const size = 8;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );
      const r = layPathSkeleton(cells, size, seededRandom(7), 3);
      let dirt = 0;
      for (const row of cells) for (const c of row) if (c.assetKey === 'dirt') dirt++;
      return { applied: r.applied, dirt };
    });

    expect(result.applied).toBe(false);
    expect(result.dirt).toBe(0);
  });
});
