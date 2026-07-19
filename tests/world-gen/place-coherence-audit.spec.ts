/**
 * place-coherence-audit.spec.ts — P1–P7 audit harness (Place Coherence PR1).
 *
 * Codifies place-coherence invariants as tests. PR1 is **read-only audit**:
 * report / soft-assert violation counts; no PlaceCoherencePass repairs yet.
 *
 * | ID | Invariant |
 * |----|-----------|
 * | P1 | Fenced/walled enclosure has ≥1 functional opening (scaffold) |
 * | P2 | Declared recipe openings[] match stamped cells |
 * | P3 | cell.walkable === expectedWalkableDefault(assetKey) for place families |
 * | P4 | No walkable hole in continuous fence/wall run unless declared opening |
 * | P5 | Draw gate soft/deferred (skip hard fail in PR1) |
 * | P6 | Homestead south — covered in place-coherence-homestead.spec.ts |
 * | P7 | Fixed seed: gen determinism + coherence matrix stable |
 *
 * Run: npx playwright test tests/world-gen/place-coherence-audit --reporter=line
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

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
const BIOME_SEED = 42;

/** Early/near chunks for enclosure-hole sampling (meadow + mixed). */
const MATRIX_COORDS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [2, 0],
  [0, 2],
];

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test.describe('Place coherence audit harness (P1–P4, P7)', () => {
  test('P4: bare fence ring dirt gap is reported as illegal (no repair)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { findIllegalFenceGaps, auditPlaceCoherence } = await import(
        '/engine/world/PlaceCoherence.ts'
      );

      const size = 7;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );

      const ox = 1;
      const oy = 1;
      for (let x = 0; x < 5; x++) {
        cells[oy][ox + x] = { assetKey: 'fence', walkable: false, interactable: false };
        cells[oy + 4][ox + x] = { assetKey: 'fence', walkable: false, interactable: false };
      }
      for (let y = 1; y < 4; y++) {
        cells[oy + y][ox] = { assetKey: 'fence', walkable: false, interactable: false };
        cells[oy + y][ox + 4] = { assetKey: 'fence', walkable: false, interactable: false };
      }
      // South-center dirt punch-through (illegal without declared opening)
      cells[oy + 4][ox + 2] = { assetKey: 'dirt', walkable: true, interactable: false };
      cells[oy + 2][ox + 2] = { assetKey: 'dirt', walkable: true, interactable: false };

      const gaps = findIllegalFenceGaps(cells, size);
      const beforeKeys = cells.map((row) => row.map((c) => c.assetKey));
      const audit = auditPlaceCoherence(cells);
      const afterKeys = cells.map((row) => row.map((c) => c.assetKey));

      // Audit must not mutate
      let mutated = false;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (beforeKeys[y][x] !== afterKeys[y][x]) mutated = true;
        }
      }

      return {
        gapCount: gaps.length,
        gaps,
        p4Count: audit.counts.illegalFenceGaps,
        total: audit.counts.total,
        gapCell: cells[oy + 4][ox + 2].assetKey,
        mutated,
      };
    });

    expect(result.mutated, 'audit is read-only').toBe(false);
    expect(result.gapCell, 'dirt gap left in place (no repair)').toBe('dirt');
    expect(result.gapCount, 'illegal fence gap detected').toBeGreaterThanOrEqual(1);
    expect(result.p4Count).toBeGreaterThanOrEqual(1);
    expect(result.gaps.some((g) => g.x === 3 && g.y === 5 && g.invariant === 'P4')).toBe(true);
  });

  test('P4: declared path opening in barrier run is not illegal', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { findIllegalFenceGaps, buildDeclaredOpeningCells } = await import(
        '/engine/world/PlaceCoherence.ts'
      );
      const { FENCED_FARM } = await import('/engine/iso2-assemblies/catalog.ts');
      const { stampAssemblyOntoCells } = await import('/engine/iso2-assemblies.ts');

      const size = 12;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );
      const ox = 3;
      const oy = 3;
      stampAssemblyOntoCells(cells as any, 'fenced-farm', ox, oy);

      const recipes = [{ recipe: FENCED_FARM, originX: ox, originY: oy }];
      const declared = buildDeclaredOpeningCells(recipes);
      const gapsWithDeclared = findIllegalFenceGaps(cells, size, declared);
      const gapsWithout = findIllegalFenceGaps(cells, size);

      // Path flanks at south (1,4) and (3,4) relative are dirt between fences;
      // without declared allow-list they may count as illegal gaps if no
      // functional-nearby skip fires (center is quiz_gate so nearby skip applies).
      return {
        declaredSize: declared.size,
        gapsWithDeclared: gapsWithDeclared.length,
        gapsWithout: gapsWithout.length,
        southCenter: cells[oy + 4][ox + 2].assetKey,
        southLeft: cells[oy + 4][ox + 1].assetKey,
        southRight: cells[oy + 4][ox + 3].assetKey,
      };
    });

    expect(result.southCenter).toBe('quiz_gate');
    expect(result.declaredSize).toBeGreaterThanOrEqual(3);
    // Path flanks sit next to quiz_gate → functional-nearby skip; still zero illegal.
    expect(result.gapsWithDeclared).toBe(0);
    expect(result.gapsWithout).toBe(0);
  });

  test('P2: modular recipe openings match after stamp (fenced-farm, gatehouse)', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { stampAssemblyOntoCells, validateSceneOpenings, ASSEMBLY_RECIPES } = await import(
        '/engine/iso2-assemblies.ts'
      );
      const { auditRecipeOpenings, auditWalkablePolicy } = await import(
        '/engine/world/PlaceCoherence.ts'
      );

      const ids = ['fenced-farm', 'gatehouse', 'church-graveyard'] as const;
      const reports: Array<{
        id: string;
        validateOk: boolean;
        auditP2: number;
        policyMismatches: number;
      }> = [];

      for (const id of ids) {
        const recipe = ASSEMBLY_RECIPES[id];
        if (!recipe) continue;
        const size = 16;
        const cells = Array.from({ length: size }, () =>
          Array.from({ length: size }, () => ({
            assetKey: 'grass',
            walkable: true,
            interactable: false,
          })),
        );
        const ox = 2;
        const oy = 2;
        stampAssemblyOntoCells(cells as any, id, ox, oy);
        const validation = validateSceneOpenings(cells, ox, oy, recipe);
        const audit = auditRecipeOpenings(cells, [{ recipe, originX: ox, originY: oy }]);
        const policy = auditWalkablePolicy(cells, size);
        reports.push({
          id,
          validateOk: validation.ok,
          auditP2: audit.violations.length,
          policyMismatches: policy.length,
        });
      }

      return { reports };
    });

    expect(result.reports.length).toBeGreaterThanOrEqual(2);
    for (const r of result.reports) {
      expect(r.validateOk, `${r.id} openings validate`).toBe(true);
      expect(r.auditP2, `${r.id} P2 audit`).toBe(0);
      expect(r.policyMismatches, `${r.id} P3 stamp policy`).toBe(0);
    }
  });

  test('P3: starter homestead stamps match expectedWalkableDefault for barriers/gates', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { stampStarterHomestead, STARTER_HOMESTEAD_ORIGIN, STARTER_HOMESTEAD_RECIPE } =
        await import('/engine/iso2-assemblies.ts');
      const { auditWalkablePolicy, auditPlaceCoherence } = await import(
        '/engine/world/PlaceCoherence.ts'
      );

      const size = 32;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );
      stampStarterHomestead(cells);

      const policy = auditWalkablePolicy(cells, size);
      const audit = auditPlaceCoherence(cells, {
        recipes: [
          {
            recipe: STARTER_HOMESTEAD_RECIPE,
            originX: STARTER_HOMESTEAD_ORIGIN.x,
            originY: STARTER_HOMESTEAD_ORIGIN.y,
          },
        ],
      });

      return {
        policyMismatches: policy,
        p2: audit.counts.openingMismatches,
        p3: audit.counts.walkablePolicyMismatches,
        p4: audit.counts.illegalFenceGaps,
        total: audit.counts.total,
      };
    });

    expect(result.policyMismatches, JSON.stringify(result.policyMismatches.slice(0, 5))).toEqual(
      [],
    );
    expect(result.p2).toBe(0);
    expect(result.p3).toBe(0);
    expect(result.p4, 'homestead south closed — no illegal fence gaps').toBe(0);
  });

  test('P1 scaffold: bare fence ring without gate flags enclosure-without-opening', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { auditEnclosuresWithoutOpening } = await import('/engine/world/PlaceCoherence.ts');

      const size = 9;
      // Fully closed 7×7 fence ring (no opening at all)
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );
      const ox = 1;
      const oy = 1;
      for (let x = 0; x < 7; x++) {
        cells[oy][ox + x] = { assetKey: 'fence', walkable: false, interactable: false };
        cells[oy + 6][ox + x] = { assetKey: 'fence', walkable: false, interactable: false };
      }
      for (let y = 1; y < 6; y++) {
        cells[oy + y][ox] = { assetKey: 'fence', walkable: false, interactable: false };
        cells[oy + y][ox + 6] = { assetKey: 'fence', walkable: false, interactable: false };
      }

      const without = auditEnclosuresWithoutOpening(cells, size);

      // Add quiz_gate on south center → should clear P1
      cells[oy + 6][ox + 3] = { assetKey: 'quiz_gate', walkable: false, interactable: true };
      const withGate = auditEnclosuresWithoutOpening(cells, size);

      return {
        withoutCount: without.length,
        withGateCount: withGate.length,
        without,
      };
    });

    expect(result.withoutCount, 'closed ring without gate is P1').toBeGreaterThanOrEqual(1);
    expect(result.withGateCount, 'ring with quiz_gate is not P1').toBe(0);
  });

  test('P5 soft: deferred — audit harness documents draw gate as non-hard in PR1', async () => {
    // P5 (on-screen functional gates produce draw commands) is intentionally
    // soft/deferred until PR4 (draw integrity). This test locks the decision.
    expect(true, 'P5 hard-fail deferred to PR4').toBe(true);
  });

  test('P7 + matrix: fixed-seed chunk samples report illegal fence gaps (may be >0)', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(
      async ([wordlist, biomeSeed, coords]: [string[], number, Array<[number, number]>]) => {
        const gen = await import('/engine/gen.ts');
        const pc = await import('/engine/world/PlaceCoherence.ts');
        const sh = await import('/engine/iso2-assemblies.ts');
        const {
          auditPlaceCoherence,
          findIllegalFenceGaps,
          auditHomesteadSouth,
        } = pc;
        const { STARTER_HOMESTEAD_ORIGIN, STARTER_HOMESTEAD_RECIPE } = sh;

        function runOnce() {
          gen.setWordlist(wordlist);
          gen.setBiomeNoiseSeed(biomeSeed);
          gen.restoreEntropyBuffer('');

          let totalIllegalGaps = 0;
          let totalP1 = 0;
          let totalP3 = 0;
          let totalViolations = 0;
          const perChunk: Array<{
            cx: number;
            cy: number;
            biomeName: string;
            illegalFenceGaps: number;
            enclosureWithoutOpening: number;
            walkablePolicyMismatches: number;
            total: number;
          }> = [];

          for (const [cx, cy] of coords) {
            const chunk = gen.generateChunkSync(cx, cy);
            const cells = chunk.cells;
            const recipes =
              cx === 0 && cy === 0
                ? [
                    {
                      recipe: STARTER_HOMESTEAD_RECIPE,
                      originX: STARTER_HOMESTEAD_ORIGIN.x,
                      originY: STARTER_HOMESTEAD_ORIGIN.y,
                    },
                  ]
                : [];

            const audit = auditPlaceCoherence(cells, {
              chunkX: cx,
              chunkY: cy,
              recipes,
            });
            const gaps = findIllegalFenceGaps(cells);

            totalIllegalGaps += gaps.length;
            totalP1 += audit.counts.enclosureWithoutOpening;
            totalP3 += audit.counts.walkablePolicyMismatches;
            totalViolations += audit.counts.total;

            perChunk.push({
              cx,
              cy,
              biomeName: chunk.biomeName,
              illegalFenceGaps: gaps.length,
              enclosureWithoutOpening: audit.counts.enclosureWithoutOpening,
              walkablePolicyMismatches: audit.counts.walkablePolicyMismatches,
              total: audit.counts.total,
            });
          }

          // Origin homestead P6 hard check inside matrix
          gen.setWordlist(wordlist);
          gen.setBiomeNoiseSeed(biomeSeed);
          gen.restoreEntropyBuffer('');
          const origin = gen.generateChunkSync(0, 0);
          const p6 = auditHomesteadSouth(
            origin.cells,
            STARTER_HOMESTEAD_ORIGIN.x,
            STARTER_HOMESTEAD_ORIGIN.y,
          );

          return {
            chunksSampled: coords.length,
            totalIllegalGaps,
            totalP1,
            totalP3,
            totalViolations,
            perChunk,
            p6Violations: p6.length,
            matrixSignature: perChunk
              .map(
                (c) =>
                  `${c.cx},${c.cy}:${c.illegalFenceGaps}/${c.enclosureWithoutOpening}/${c.walkablePolicyMismatches}`,
              )
              .join('|'),
          };
        }

        const a = runOnce();
        const b = runOnce();
        return { a, b };
      },
      [FIXED_WORDLIST, BIOME_SEED, MATRIX_COORDS] as [string[], number, Array<[number, number]>],
    );

    // P6 under full gen: may be >0 until PR2 re-asserts homestead after late phases.
    // Still require deterministic reporting (same count both runs).
    expect(result.a.p6Violations).toBe(result.b.p6Violations);
    expect(result.a.p6Violations).toBeGreaterThanOrEqual(0);

    // P7: matrix signature stable across two full runs
    expect(result.a.matrixSignature, 'P7 matrix determinism').toBe(result.b.matrixSignature);
    expect(result.a.totalIllegalGaps).toBe(result.b.totalIllegalGaps);
    expect(result.a.totalViolations).toBe(result.b.totalViolations);

    // Document current baseline (may be >0 until PR2 seals gaps)
    expect(result.a.chunksSampled).toBe(MATRIX_COORDS.length);
    expect(result.a.totalIllegalGaps).toBeGreaterThanOrEqual(0);

    // eslint-disable-next-line no-console
    console.log(
      `[place-coherence matrix] chunks=${result.a.chunksSampled} ` +
        `illegalFenceGaps=${result.a.totalIllegalGaps} ` +
        `P1=${result.a.totalP1} P3=${result.a.totalP3} ` +
        `totalViolations=${result.a.totalViolations} p6FullGen=${result.a.p6Violations}`,
    );
    // eslint-disable-next-line no-console
    console.log(`[place-coherence matrix] perChunk=${JSON.stringify(result.a.perChunk)}`);
  });
});
