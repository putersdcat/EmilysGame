/**
 * place-coherence-homestead.spec.ts — P6 regression lock (Place Coherence PR1).
 *
 * Homestead south perimeter facts (starter-homestead.ts):
 *   STARTER_HOMESTEAD_ORIGIN = { x: 9, y: 8 }
 *   Size 7×7
 *   STARTER_HOMESTEAD_OPENINGS = [{ x: 3, y: 6, kind: 'quiz_gate' }] only
 *   South row y=6 relative: fence at x=0,1,2,4,5,6; quiz_gate at x=3
 *   Absolute gate cell: (12, 14)
 *   No dirt flanks at relative (2,6) and (4,6)
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
  test('stampStarterHomestead: closed south fence + sole quiz_gate at (12,14)', async ({
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

      // Flanks of the gate (relative 2,6 and 4,6) must be fence, not dirt.
      const flankLeft = cells[oy + 6][ox + 2];
      const flankRight = cells[oy + 6][ox + 4];
      const gate = cells[HOMESTEAD_SOUTH_GATE_ABS.y][HOMESTEAD_SOUTH_GATE_ABS.x];

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
      };
    });

    // Openings contract: sole quiz_gate
    expect(result.openingsCount, 'only one declared opening').toBe(1);
    expect(result.openings[0]).toEqual({ x: 3, y: 6, kind: 'quiz_gate' });
    expect(result.origin).toEqual({ x: 9, y: 8 });
    expect(result.gateAbs).toEqual({ x: 12, y: 14 });

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
    expect(result.flankLeft, 'no dirt flank left of gate (rel 2,6)').toBe('fence');
    expect(result.flankRight, 'no dirt flank right of gate (rel 4,6)').toBe('fence');
    expect(result.dirtOnSouth, 'south row has no dirt walk-arounds').toBe(0);
    expect(result.fenceOnSouth).toBe(6);
    expect(result.quizOnSouth).toBe(1);

    for (const cell of result.southRow) {
      expect(cell.actual, `(${cell.x},${cell.y})`).toBe(cell.expected);
    }
  });

  test('full origin chunk gen: audit reports P6 if late phases clobber homestead', async ({
    page,
  }) => {
    /**
     * PR1 audit only: stampStarterHomestead is hard-locked above.
     * Full `generateChunkSync(0,0)` runs many phases AFTER the homestead stamp
     * (path skeleton, population, entropy, cohere, orphan strip, passability).
     * Those may clobber south fence/gate — document as P6 violations for PR2
     * PlaceCoherencePass (re-stamp / re-validate after final phases).
     */
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const gen = await import('/engine/gen.ts');
      const {
        STARTER_HOMESTEAD_RECIPE,
        STARTER_HOMESTEAD_ORIGIN,
        validateSceneOpenings,
      } = await import('/engine/iso2-assemblies.ts');
      const {
        auditHomesteadSouth,
        auditPlaceCoherence,
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

      const southKeys: string[] = [];
      for (let rx = 0; rx < 7; rx++) {
        southKeys.push(cells[oy + 6][ox + rx].assetKey);
      }

      return {
        biomeName: chunk.biomeName,
        validationOk: validation.ok,
        validationViolations: validation.violations,
        p6Count: p6.length,
        p6Violations: p6,
        gateAsset: gate.assetKey,
        southKeys,
        auditCounts: audit.counts,
      };
    });

    // Audit harness runs and returns structured results (no throw / no mutate contract).
    expect(Array.isArray(result.p6Violations)).toBe(true);
    expect(result.southKeys).toHaveLength(7);
    expect(typeof result.gateAsset).toBe('string');
    expect(result.auditCounts.total).toBeGreaterThanOrEqual(0);

    // Soft document full-pipeline P6 state for implementer summary / PR2.
    // eslint-disable-next-line no-console
    console.log(
      `[place-coherence full-gen origin] validationOk=${result.validationOk} ` +
        `p6Count=${result.p6Count} gate=${result.gateAsset} ` +
        `south=${result.southKeys.join(',')} counts=${JSON.stringify(result.auditCounts)}`,
    );

    // When pipeline already preserves homestead, hard-lock it (future green tip).
    if (result.p6Count === 0) {
      expect(result.validationOk).toBe(true);
      expect(result.gateAsset).toBe('quiz_gate');
      expect(result.southKeys).toEqual([
        'fence',
        'fence',
        'fence',
        'quiz_gate',
        'fence',
        'fence',
        'fence',
      ]);
    }
  });
});
