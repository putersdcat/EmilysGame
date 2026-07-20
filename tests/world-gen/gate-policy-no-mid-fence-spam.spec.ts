/**
 * gate-policy-no-mid-fence-spam.spec.ts — Critical-path PR4
 *
 * Gate policy: functional openings ≠ structural seal.
 * - Illegal linear fence/wall dirt gaps seal with matching barrier, not quiz_gate.
 * - Declared recipe openings remain functional.
 * - placeGatesInFenceRuns is ranked (≤1 cut-point or skip); no mid-run spam.
 * - Exactly one ensureMinimumQuizGates call site in ChunkGenerator; no last-resort punch.
 * - Origin exempt from random quiz density (homestead teaching gate only).
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test.describe('Gate policy — barrier seal + no mid-fence spam (critical-path PR4)', () => {
  test('source: exactly one ensureMinimumQuizGates call in ChunkGenerator', async () => {
    const cgPath = path.resolve('src/engine/world/ChunkGenerator.ts');
    const src = fs.readFileSync(cgPath, 'utf8');
    // Strip line + block comments so docstrings do not count as call sites
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const callMatches = code.match(/\bensureMinimumQuizGates\s*\(/g) ?? [];
    // Import is `ensureMinimumQuizGates,` without paren; only the invoke remains.
    expect(
      callMatches.length,
      'exactly one ensureMinimumQuizGates(...) call site in ChunkGenerator',
    ).toBe(1);
    // Must not reappear as a 7.8 final pass
    expect(src).not.toMatch(/Phase 7\.8/);
    expect(code).toMatch(/placeGatesInFenceRuns\s*\(/);
    // fence-run appears after modular (post-modular phase order)
    const modularIdx = code.indexOf('maybePlaceModularScenes');
    const fenceRunIdx = code.indexOf('placeGatesInFenceRuns(');
    const minGateIdx = code.indexOf('ensureMinimumQuizGates(');
    expect(modularIdx).toBeGreaterThan(0);
    expect(fenceRunIdx).toBeGreaterThan(modularIdx);
    expect(minGateIdx).toBeGreaterThan(fenceRunIdx);
  });

  test('linear illegal gap seals with barrier, not quiz_gate', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const {
        scanAndRepairFenceGaps,
        isIllegalFenceGapCandidate,
        pickDominantBarrierSealAsset,
      } = await import('/engine/iso2-assemblies/scene-invariants.ts');
      const { runPlaceCoherencePass, findIllegalFenceGaps } = await import(
        '/engine/world/PlaceCoherence.ts'
      );

      const size = 9;
      const makeGrid = () =>
        Array.from({ length: size }, () =>
          Array.from({ length: size }, () => ({
            assetKey: 'grass',
            walkable: true,
            interactable: false,
          })),
        );

      // Horizontal fence run with single dirt punch-through
      const cells = makeGrid();
      for (const x of [1, 2, 4, 5, 6]) {
        cells[4][x] = { assetKey: 'fence', walkable: false, interactable: false };
      }
      cells[4][3] = { assetKey: 'dirt', walkable: true, interactable: false };

      const isCandidate = isIllegalFenceGapCandidate(cells, 3, 4);
      const sealKey = pickDominantBarrierSealAsset(cells, 3, 4);
      const sealed = scanAndRepairFenceGaps(cells, size);
      const after = cells[4][3];
      const quizCount = cells.flat().filter((c) => c.assetKey === 'quiz_gate').length;

      // PlaceCoherence pass also barrier-seals
      const cells2 = makeGrid();
      for (const x of [1, 2, 4, 5, 6]) {
        cells2[4][x] = { assetKey: 'fence', walkable: false, interactable: false };
      }
      cells2[4][3] = { assetKey: 'dirt', walkable: true, interactable: false };
      const gapsBefore = findIllegalFenceGaps(cells2, size).length;
      runPlaceCoherencePass(cells2, { chunkX: 1, chunkY: 0 });
      const sealed2 = cells2[4][3];
      const gapsAfter = findIllegalFenceGaps(cells2, size).length;
      const quiz2 = cells2.flat().filter((c) => c.assetKey === 'quiz_gate').length;

      return {
        isCandidate,
        sealKey,
        sealed,
        afterKey: after.assetKey,
        afterWalkable: after.walkable,
        afterInteractable: after.interactable,
        quizCount,
        gapsBefore,
        sealed2Key: sealed2.assetKey,
        sealed2Walkable: sealed2.walkable,
        gapsAfter,
        quiz2,
      };
    });

    expect(result.isCandidate).toBe(true);
    expect(result.sealKey).toBe('fence');
    expect(result.sealed).toBeGreaterThanOrEqual(1);
    expect(result.afterKey).toBe('fence');
    expect(result.afterWalkable).toBe(false);
    expect(result.afterInteractable).toBe(false);
    expect(result.quizCount).toBe(0);

    expect(result.gapsBefore).toBeGreaterThanOrEqual(1);
    expect(result.sealed2Key).toBe('fence');
    expect(result.sealed2Walkable).toBe(false);
    expect(result.gapsAfter).toBe(0);
    expect(result.quiz2).toBe(0);
  });

  test('declared openings stay functional after seal + PC pass', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { stampAssemblyOntoCells, validateSceneOpenings, ASSEMBLY_RECIPES } =
        await import('/engine/iso2-assemblies.ts');
      const { runPlaceCoherencePass } = await import('/engine/world/PlaceCoherence.ts');
      const { scanAndRepairFenceGaps } = await import(
        '/engine/iso2-assemblies/scene-invariants.ts'
      );

      const recipe = ASSEMBLY_RECIPES['fenced-farm'];
      const size = 12;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );
      const ox = 2;
      const oy = 2;
      stampAssemblyOntoCells(cells, 'fenced-farm', ox, oy);

      const before = validateSceneOpenings(cells, ox, oy, recipe);
      const gateBefore = cells[oy + 4][ox + 2].assetKey;

      // Barrier seal must not convert declared quiz_gate openings
      const declared = new Set(
        (recipe.openings ?? []).map((o) => `${ox + o.x},${oy + o.y}`),
      );
      scanAndRepairFenceGaps(cells, size, declared);
      runPlaceCoherencePass(cells, {
        chunkX: 2,
        chunkY: 0,
        recipes: [{ recipe, originX: ox, originY: oy }],
      });

      const after = validateSceneOpenings(cells, ox, oy, recipe);
      const gateAfter = cells[oy + 4][ox + 2].assetKey;

      return {
        beforeOk: before.ok,
        afterOk: after.ok,
        gateBefore,
        gateAfter,
        violations: after.violations,
      };
    });

    expect(result.beforeOk).toBe(true);
    expect(result.gateBefore).toBe('quiz_gate');
    expect(result.afterOk, JSON.stringify(result.violations)).toBe(true);
    expect(result.gateAfter).toBe('quiz_gate');
  });

  test('ranked placeGatesInFenceRuns: skip if openings; else ≤1 cut gate', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { placeGatesInFenceRuns } = await import('/engine/world/ObstacleSolver.ts');
      const { seededRandom } = await import('/engine/utils.ts');
      const { BIOME_DEFS } = await import('/config/biomes.config.ts');

      const meadow =
        BIOME_DEFS.find((b: { name: string }) => b.name === 'meadow') ?? BIOME_DEFS[0];
      const size = 11;

      const makeFenceGrid = () => {
        const cells = Array.from({ length: size }, () =>
          Array.from({ length: size }, () => ({
            assetKey: 'grass',
            walkable: true,
            interactable: false,
          })),
        );
        // Two long horizontal fence runs (would spam under old policy)
        for (let x = 1; x <= 8; x++) {
          cells[2][x] = { assetKey: 'fence', walkable: false, interactable: false };
          cells[8][x] = { assetKey: 'fence', walkable: false, interactable: false };
        }
        return cells;
      };

      const countQuiz = (cells: { assetKey: string }[][]) =>
        cells.flat().filter((c) => c.assetKey === 'quiz_gate').length;

      // Case A: existing functional opening → skip entire phase
      const cellsA = makeFenceGrid();
      cellsA[5][5] = { assetKey: 'quiz_gate', walkable: false, interactable: true };
      placeGatesInFenceRuns(cellsA, size, seededRandom(1), meadow, {
        hasDeclaredOpenings: false,
      });
      const quizA = countQuiz(cellsA);
      // Only the pre-existing gate
      let fenceGatesA = 0;
      for (let x = 1; x <= 8; x++) {
        if (cellsA[2][x].assetKey === 'quiz_gate') fenceGatesA++;
        if (cellsA[8][x].assetKey === 'quiz_gate') fenceGatesA++;
      }

      // Case B: declared openings flag → skip
      const cellsB = makeFenceGrid();
      placeGatesInFenceRuns(cellsB, size, seededRandom(2), meadow, {
        hasDeclaredOpenings: true,
      });
      const quizB = countQuiz(cellsB);

      // Case C: no openings — at most one gate total from this phase
      const cellsC = makeFenceGrid();
      placeGatesInFenceRuns(cellsC, size, seededRandom(3), meadow, {
        hasDeclaredOpenings: false,
      });
      const quizC = countQuiz(cellsC);

      return { quizA, fenceGatesA, quizB, quizC };
    });

    expect(result.quizA).toBe(1);
    expect(result.fenceGatesA, 'must not punch fence runs when openings exist').toBe(0);
    expect(result.quizB, 'declared openings skip fence-run phase').toBe(0);
    expect(result.quizC, 'ranked fence-run places at most one gate').toBeLessThanOrEqual(1);
  });

  test('ensureMinimumQuizGates: cut-point only, no last-resort field punch', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { ensureMinimumQuizGates } = await import('/engine/world/ObstacleSolver.ts');
      const { seededRandom } = await import('/engine/utils.ts');
      const { BIOME_DEFS } = await import('/config/biomes.config.ts');

      const meadow =
        BIOME_DEFS.find((b: { name: string }) => b.name === 'meadow') ?? BIOME_DEFS[0];
      const size = 10;

      // Open field — no corridor cut-points; must stay at zero gates
      const open = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );
      ensureMinimumQuizGates(open, size, meadow, seededRandom(99), 1);
      const openQuiz = open.flat().filter((c) => c.assetKey === 'quiz_gate').length;

      // Narrow corridor cut-point: walls create a 1-wide dirt hallway
      const corridor = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );
      for (let y = 1; y < size - 1; y++) {
        corridor[y][3] = { assetKey: 'wall', walkable: false, interactable: false };
        corridor[y][5] = { assetKey: 'wall', walkable: false, interactable: false };
        corridor[y][4] = { assetKey: 'dirt', walkable: true, interactable: false };
      }
      ensureMinimumQuizGates(corridor, size, meadow, seededRandom(7), 1);
      const corridorQuiz = corridor.flat().filter((c) => c.assetKey === 'quiz_gate').length;
      // Any gate must sit on the corridor column
      let offCorridor = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (corridor[y][x].assetKey === 'quiz_gate' && x !== 4) offCorridor++;
        }
      }

      return { openQuiz, corridorQuiz, offCorridor };
    });

    expect(result.openQuiz, 'open field must not get last-resort quiz_gate').toBe(0);
    expect(result.corridorQuiz, 'corridor cut-point may receive a min gate').toBeLessThanOrEqual(1);
    expect(result.offCorridor, 'min-gate must not punch arbitrary field cells').toBe(0);
  });

  test('full-gen non-origin: barrier seals do not inject mid-fence quiz spam', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const gen = await import('/engine/gen.ts');
      gen.setWordlist([
        'alpha beta',
        'gamma delta',
        'epsilon zeta',
        'eta theta',
        'iota kappa',
        'lambda mu',
        'nu xi',
        'omicron pi',
      ]);
      gen.setBiomeNoiseSeed(42);
      gen.restoreEntropyBuffer('');

      // Sample a ring of non-origin chunks
      const coords: Array<[number, number]> = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
        [2, 0],
        [1, 1],
        [3, 1],
        [2, 2],
      ];

      let totalQuiz = 0;
      let zeroQuizChunks = 0;
      let maxQuiz = 0;
      // Count quiz_gates that sit with fence on both sides of one axis (mid-fence)
      let midFenceQuiz = 0;

      for (const [cx, cy] of coords) {
        const chunk = gen.generateChunkSync(cx, cy);
        let q = 0;
        const size = chunk.cells.length;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (chunk.cells[y][x].assetKey !== 'quiz_gate') continue;
            q++;
            const left = chunk.cells[y][x - 1]?.assetKey ?? '';
            const right = chunk.cells[y][x + 1]?.assetKey ?? '';
            const up = chunk.cells[y - 1]?.[x]?.assetKey ?? '';
            const down = chunk.cells[y + 1]?.[x]?.assetKey ?? '';
            const isFence = (k: string) =>
              k === 'fence' || k === 'wooden_fence' || k === 'barricade';
            if ((isFence(left) && isFence(right)) || (isFence(up) && isFence(down))) {
              midFenceQuiz++;
            }
          }
        }
        totalQuiz += q;
        maxQuiz = Math.max(maxQuiz, q);
        if (q === 0) zeroQuizChunks++;
      }

      // Origin still has teaching gate
      const origin = gen.generateChunkSync(0, 0);
      let originQuiz = 0;
      for (const row of origin.cells) {
        for (const c of row) {
          if (c.assetKey === 'quiz_gate') originQuiz++;
        }
      }
      // Homestead south sole gate at (13,16) — 9×9 PR6
      const southGate = origin.cells[16]?.[13]?.assetKey;

      return {
        totalQuiz,
        zeroQuizChunks,
        maxQuiz,
        midFenceQuiz,
        originQuiz,
        southGate,
        sampled: coords.length,
      };
    });

    // eslint-disable-next-line no-console
    console.log('[PR7 gate-policy full-gen]', result);

    // Origin teaching gate preserved
    expect(result.southGate).toBe('quiz_gate');
    expect(result.originQuiz).toBeGreaterThanOrEqual(1);

    // Zero-quiz non-origin chunks are allowed (KD13)
    expect(result.zeroQuizChunks).toBeGreaterThanOrEqual(0);

    // PR7 proof bar: mid-fence spam bound hardened from 2× sample to ≤ sample.
    // Ranked fence-run places ≤1 cut-point gate per chunk; modular openings can
    // legitimately sit mid-fence (declared). ≤1 average per sampled chunk is the
    // regression lock — unit cases above already hard-assert barrier seal + ranked ≤1.
    expect(
      result.midFenceQuiz,
      `mid-fence quiz_gates across sample: ${JSON.stringify(result)}`,
    ).toBeLessThanOrEqual(result.sampled);
    // Per-chunk density: no single non-origin chunk should be a quiz wall of spam.
    expect(
      result.maxQuiz,
      `max quiz_gates in one non-origin sample chunk: ${JSON.stringify(result)}`,
    ).toBeLessThanOrEqual(12);
  });
});
