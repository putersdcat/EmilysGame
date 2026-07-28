/**
 * place-coherence-homestead.spec.ts — P6 regression lock (Place Coherence PR1).
 *
 * Homestead south perimeter facts (starter-homestead.ts) — critical-path PR6 9×9:
 *   STARTER_HOMESTEAD_ORIGIN = { x: 9, y: 8 }
 *   Size 9×9
 *   STARTER_HOMESTEAD_OPENINGS = [{ x: 4, y: 8, kind: 'quiz_gate' }] only
 *   South row y=8 relative: fence at x≠4; quiz_gate at x=4
 *   Absolute gate cell: (13, 16)
 *   Cottage mass abs (12–13,10–11); spawn abs (12,12) walkable
 *   No dirt flanks on south fence
 *
 * Run: npx playwright test tests/world-gen/place-coherence-homestead --reporter=line
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test.describe('P6 Homestead south perimeter (regression-locked)', () => {
  test('stampStarterHomestead: closed south fence + sole quiz_gate at (13,16)', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const {
        stampStarterHomestead,
        validateSceneOpenings,
        STARTER_HOMESTEAD_RECIPE,
        STARTER_HOMESTEAD_ORIGIN,
        STARTER_HOMESTEAD_OPENINGS,
        HOMESTEAD_SIZE,
      } = await import('/engine/iso2-assemblies.ts');
      const {
        auditHomesteadSouth,
        expectedHomesteadSouthRow,
        HOMESTEAD_SOUTH_GATE_ABS,
      } = await import('/engine/world/PlaceCoherence.ts');

      const size = 32;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );

      stampStarterHomestead(cells);

      const ox = STARTER_HOMESTEAD_ORIGIN.x;
      const oy = STARTER_HOMESTEAD_ORIGIN.y;
      const validation = validateSceneOpenings(cells, ox, oy, STARTER_HOMESTEAD_RECIPE);
      const p6 = auditHomesteadSouth(cells, ox, oy);
      const southExpected = expectedHomesteadSouthRow(ox, oy);

      const southRow = southExpected.map((e) => ({
        x: e.x,
        y: e.y,
        expected: e.assetKey,
        actual: cells[e.y][e.x].assetKey,
        walkable: cells[e.y][e.x].walkable,
      }));

      // Flanks of the gate (relative 3,8 and 5,8) must be fence, not dirt.
      const flankLeft = cells[oy + 8][ox + 3];
      const flankRight = cells[oy + 8][ox + 5];
      const gate = cells[HOMESTEAD_SOUTH_GATE_ABS.y][HOMESTEAD_SOUTH_GATE_ABS.x];

      // Spawn + cottage mass invariants (I13)
      const spawn = cells[12][12];
      const cottageMass = [
        cells[10][12].assetKey,
        cells[10][13].assetKey,
        cells[11][12].assetKey,
        cells[11][13].assetKey,
      ];
      const cottageIsStarter = cottageMass.every((k) => k.startsWith('starter_'));
      const cottageWalkable = [
        cells[10][12].walkable,
        cells[10][13].walkable,
        cells[11][12].walkable,
        cells[11][13].walkable,
      ];

      return {
        openingsCount: STARTER_HOMESTEAD_OPENINGS.length,
        openings: STARTER_HOMESTEAD_OPENINGS.map((o) => ({ ...o })),
        validationOk: validation.ok,
        validationViolations: validation.violations,
        p6Violations: p6,
        southRow,
        gateAsset: gate.assetKey,
        gateWalkable: gate.walkable,
        flankLeft: flankLeft.assetKey,
        flankRight: flankRight.assetKey,
        dirtOnSouth: southRow.filter((c) => c.actual === 'dirt').length,
        fenceOnSouth: southRow.filter((c) => c.actual === 'fence').length,
        quizOnSouth: southRow.filter((c) => c.actual === 'quiz_gate').length,
        origin: { x: ox, y: oy },
        gateAbs: { ...HOMESTEAD_SOUTH_GATE_ABS },
        homesteadSize: HOMESTEAD_SIZE,
        recipeSize: STARTER_HOMESTEAD_RECIPE.width,
        spawnKey: spawn.assetKey,
        spawnWalkable: spawn.walkable,
        cottageMass,
        cottageIsStarter,
        cottageWalkable,
        hasStarterCottage: cottageMass.includes('starter_cottage'),
      };
    });

    // Openings contract: sole quiz_gate
    expect(result.openingsCount, 'only one declared opening').toBe(1);
    expect(result.openings[0]).toEqual({ x: 4, y: 8, kind: 'quiz_gate' });
    expect(result.origin).toEqual({ x: 9, y: 8 });
    expect(result.gateAbs).toEqual({ x: 13, y: 16 });
    expect(result.homesteadSize).toBe(9);
    expect(result.recipeSize).toBe(9);

    // P2 via validateSceneOpenings
    expect(
      result.validationOk,
      `openings validate: ${JSON.stringify(result.validationViolations)}`,
    ).toBe(true);

    // P6 hard
    expect(
      result.p6Violations,
      `P6 violations: ${JSON.stringify(result.p6Violations)}`,
    ).toEqual([]);
    expect(result.gateAsset).toBe('quiz_gate');
    expect(result.gateWalkable, 'quiz_gate is non-walkable until opened').toBe(false);
    expect(result.flankLeft, 'no dirt flank left of gate (rel 3,8)').toBe('fence');
    expect(result.flankRight, 'no dirt flank right of gate (rel 5,8)').toBe('fence');
    expect(result.dirtOnSouth, 'south row has no dirt walk-arounds').toBe(0);
    expect(result.fenceOnSouth).toBe(8);
    expect(result.quizOnSouth).toBe(1);

    for (const cell of result.southRow) {
      expect(cell.actual, `(${cell.x},${cell.y})`).toBe(cell.expected);
    }

    // Spawn walkable and not cottage mass; cottage mass north of spawn
    expect(result.spawnWalkable, 'spawn (12,12) walkable').toBe(true);
    expect(result.spawnKey.startsWith('starter_'), 'spawn is not cottage mass').toBe(false);
    expect(result.cottageIsStarter, 'cottage mass uses starter_* assets').toBe(true);
    expect(result.hasStarterCottage).toBe(true);
    expect(result.cottageWalkable.every((w) => w === false), 'cottage mass non-walkable').toBe(true);
  });

  test('ensureSpawnClearance never destroys starter_* cottage mass', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const {
        stampStarterHomestead,
        ensureSpawnClearance,
      } = await import('/engine/iso2-assemblies.ts');

      const size = 32;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );

      stampStarterHomestead(cells);
      // Soft-block spawn plus-shape with a rock (should clear), leave cottage
      cells[12][11] = { assetKey: 'rock', walkable: false, interactable: false };
      cells[12][13] = { assetKey: 'rock', walkable: false, interactable: false };

      ensureSpawnClearance(cells);

      return {
        spawn: { key: cells[12][12].assetKey, walkable: cells[12][12].walkable },
        west: { key: cells[12][11].assetKey, walkable: cells[12][11].walkable },
        east: { key: cells[12][13].assetKey, walkable: cells[12][13].walkable },
        northCottage: {
          key: cells[11][12].assetKey,
          walkable: cells[11][12].walkable,
        },
        cottageSE: {
          key: cells[11][13].assetKey,
          walkable: cells[11][13].walkable,
        },
      };
    });

    expect(result.spawn.walkable).toBe(true);
    expect(result.west.walkable, 'soft rock west of spawn cleared').toBe(true);
    expect(result.east.walkable, 'soft rock east of spawn cleared').toBe(true);
    expect(result.northCottage.key.startsWith('starter_'), 'N cottage mass preserved').toBe(true);
    expect(result.northCottage.walkable, 'N cottage stays non-walkable').toBe(false);
    expect(result.cottageSE.key).toBe('starter_cottage');
    expect(result.cottageSE.walkable).toBe(false);
  });

  test('full origin chunk gen: P6 hard green after PlaceCoherencePass', async ({ page }) => {
    /**
     * PR2: `runPlaceCoherencePass` re-asserts homestead south after late phases
     * that previously clobbered the stamp (path skeleton / cohere / orphan strip).
     * Full `generateChunkSync(0,0)` must leave closed south + sole quiz_gate.
     */
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const gen = await import('/engine/gen.ts');
      const {
        STARTER_HOMESTEAD_RECIPE,
        STARTER_HOMESTEAD_ORIGIN,
        validateSceneOpenings,
        HOMESTEAD_SIZE,
      } = await import('/engine/iso2-assemblies.ts');
      const {
        auditHomesteadSouth,
        auditPlaceCoherence,
        getPlaceCoherenceStats,
        HOMESTEAD_SOUTH_GATE_ABS,
      } = await import('/engine/world/PlaceCoherence.ts');

      const FIXED_WORDLIST = [
        'alpha beta',
        'gamma delta',
        'epsilon zeta',
        'eta theta',
        'iota kappa',
        'lambda mu',
        'nu xi',
        'omicron pi',
      ];
      gen.setWordlist(FIXED_WORDLIST);
      gen.setBiomeNoiseSeed(42);
      gen.restoreEntropyBuffer('');

      const chunk = gen.generateChunkSync(0, 0);
      const cells = chunk.cells;
      const ox = STARTER_HOMESTEAD_ORIGIN.x;
      const oy = STARTER_HOMESTEAD_ORIGIN.y;

      const validation = validateSceneOpenings(cells, ox, oy, STARTER_HOMESTEAD_RECIPE);
      const p6 = auditHomesteadSouth(cells, ox, oy);
      const audit = auditPlaceCoherence(cells, {
        chunkX: 0,
        chunkY: 0,
        recipes: [{ recipe: STARTER_HOMESTEAD_RECIPE, originX: ox, originY: oy }],
      });
      const gate = cells[HOMESTEAD_SOUTH_GATE_ABS.y][HOMESTEAD_SOUTH_GATE_ABS.x];
      const stats = getPlaceCoherenceStats();

      const southKeys: string[] = [];
      for (let rx = 0; rx < HOMESTEAD_SIZE; rx++) {
        southKeys.push(cells[oy + 8][ox + rx].assetKey);
      }

      const spawn = cells[12][12];
      const cottageMass = [
        cells[10][12].assetKey,
        cells[10][13].assetKey,
        cells[11][12].assetKey,
        cells[11][13].assetKey,
      ];

      return {
        biomeName: chunk.biomeName,
        validationOk: validation.ok,
        validationViolations: validation.violations,
        p6Count: p6.length,
        p6Violations: p6,
        gateAsset: gate.assetKey,
        gateWalkable: gate.walkable,
        southKeys,
        auditCounts: audit.counts,
        coherenceRepairs: stats.coherenceRepairs,
        coherenceViolations: stats.coherenceViolations,
        spawnWalkable: spawn.walkable,
        spawnIsStarter: spawn.assetKey.startsWith('starter_'),
        cottageMass,
        hasStarterCottage: cottageMass.includes('starter_cottage'),
        cottageAllStarter: cottageMass.every((k) => k.startsWith('starter_')),
      };
    });

    // eslint-disable-next-line no-console
    console.log(
      `[place-coherence full-gen origin] validationOk=${result.validationOk} ` +
        `p6Count=${result.p6Count} gate=${result.gateAsset} ` +
        `south=${result.southKeys.join(',')} repairs=${result.coherenceRepairs} ` +
        `counts=${JSON.stringify(result.auditCounts)}`,
    );

    // Hard P6: closed south fence, sole quiz_gate (regression-locked).
    expect(
      result.p6Violations,
      `P6 violations after full gen: ${JSON.stringify(result.p6Violations)}`,
    ).toEqual([]);
    expect(result.p6Count).toBe(0);
    expect(result.validationOk, JSON.stringify(result.validationViolations)).toBe(true);
    expect(result.gateAsset).toBe('quiz_gate');
    expect(result.gateWalkable, 'quiz_gate non-walkable until opened').toBe(false);
    expect(result.southKeys).toEqual([
      'fence',
      'fence',
      'fence',
      'fence',
      'quiz_gate',
      'fence',
      'fence',
      'fence',
      'fence',
    ]);
    expect(result.auditCounts.openingMismatches).toBe(0);
    // Residual P4 on origin after pass should be clear (structural lock).
    expect(result.coherenceViolations, 'post-pass residual violations').toBe(0);

    // Spawn + cottage mass survive full gen (spawn cleanup / orphan / PC)
    expect(result.spawnWalkable, 'full-gen spawn walkable').toBe(true);
    expect(result.spawnIsStarter, 'full-gen spawn not cottage').toBe(false);
    expect(result.hasStarterCottage, 'full-gen keeps starter_cottage').toBe(true);
    expect(result.cottageAllStarter, 'full-gen keeps cottage mass').toBe(true);
    // eslint-disable-next-line no-console
    console.log(`[place-coherence full-gen] coherenceRepairs=${result.coherenceRepairs}`);
  });
});
