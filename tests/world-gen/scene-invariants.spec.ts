/**
 * scene-invariants.spec.ts — Scene opening contract + repair (PR1/PR3/PR4).
 *
 * Standing law: fence openings must be quiz_gate / door_locked / open path.
 * Functional openings ≠ structural seal (critical-path PR4):
 * - Declared openings repair to functional kinds.
 * - Illegal linear dirt gaps seal with matching barrier (not quiz_gate).
 * - Bare fence ring with dirt gap fails validation until repaired.
 * - fenced-farm stamps quiz_gate at south entry center (not dirt-only).
 * - starter-homestead declares openings and validates after stamp.
 * - Fenced recipes never expose bare dirt-only entries without a gate.
 * - Kind-specific repair, recipe-footprint OOB, idempotency, corridor guard.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test('bare fence ring with dirt gap: validate fails, repair places quiz_gate; scan seals barrier', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const {
      validateSceneOpenings,
      repairSceneOpenings,
      scanAndRepairFenceGaps,
    } = await import('/engine/iso2-assemblies/scene-invariants.ts');

    const size = 7;
    const cells = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      })));

    // 5×5 fence ring with a single south-center dirt gap (no gate).
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
    // South-center gap
    cells[oy + 4][ox + 2] = { assetKey: 'dirt', walkable: true, interactable: false };
    // Yard dirt
    cells[oy + 2][ox + 2] = { assetKey: 'dirt', walkable: true, interactable: false };

    const syntheticRecipe = {
      id: 'bare-fence-ring',
      width: 5,
      height: 5,
      placements: [] as const,
      openings: [{ x: 2, y: 4, kind: 'quiz_gate' as const }],
    };

    const before = validateSceneOpenings(cells, ox, oy, syntheticRecipe);
    const gateBefore = cells.flat().filter((c) => c.assetKey === 'quiz_gate').length;

    // Recipe-aware repair — declared openings stay functional quiz_gate
    const repaired = repairSceneOpenings(cells, ox, oy, syntheticRecipe);
    const afterRecipe = validateSceneOpenings(cells, ox, oy, syntheticRecipe);
    const gateAfterRecipe = cells.flat().filter((c) => c.assetKey === 'quiz_gate').length;
    const repairedAgain = repairSceneOpenings(cells, ox, oy, syntheticRecipe);

    // Second ring: only scanAndRepairFenceGaps (no recipe openings) → barrier seal
    const cells2 = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      })));
    for (let x = 0; x < 5; x++) {
      cells2[oy][ox + x] = { assetKey: 'fence', walkable: false, interactable: false };
      cells2[oy + 4][ox + x] = { assetKey: 'fence', walkable: false, interactable: false };
    }
    for (let y = 1; y < 4; y++) {
      cells2[oy + y][ox] = { assetKey: 'fence', walkable: false, interactable: false };
      cells2[oy + y][ox + 4] = { assetKey: 'fence', walkable: false, interactable: false };
    }
    cells2[oy + 4][ox + 2] = { assetKey: 'dirt', walkable: true, interactable: false };
    cells2[oy + 2][ox + 2] = { assetKey: 'dirt', walkable: true, interactable: false };

    const scanSealed = scanAndRepairFenceGaps(cells2, size);
    const scanAgain = scanAndRepairFenceGaps(cells2, size);
    const gapCell = cells2[oy + 4][ox + 2];
    const interiorStillDirt = cells2[oy + 2][ox + 2].assetKey === 'dirt';
    const quizFromScan = cells2.flat().filter((c) => c.assetKey === 'quiz_gate').length;

    // Wall-run linear gap → seal copies dominant wall neighbor
    const cells3 = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      })));
    for (let x = 1; x <= 5; x++) {
      cells3[2][x] = { assetKey: 'wall', walkable: false, interactable: false };
    }
    cells3[2][3] = { assetKey: 'dirt', walkable: true, interactable: false };
    const wallSealed = scanAndRepairFenceGaps(cells3, size);
    const wallGap = cells3[2][3];

    return {
      beforeOk: before.ok,
      beforeViolations: before.violations.length,
      gateBefore,
      repaired,
      afterRecipeOk: afterRecipe.ok,
      gateAfterRecipe,
      gapAfterRepair: cells[oy + 4][ox + 2].assetKey,
      repairedAgain,
      scanSealed,
      scanAgain,
      gapCell: gapCell.assetKey,
      gapWalkable: gapCell.walkable,
      gapInteractable: gapCell.interactable,
      quizFromScan,
      interiorStillDirt,
      wallSealed,
      wallGapKey: wallGap.assetKey,
      wallGapWalkable: wallGap.walkable,
    };
  });

  expect(result.beforeOk, 'bare dirt gap must fail validation').toBe(false);
  expect(result.beforeViolations).toBeGreaterThanOrEqual(1);
  expect(result.gateBefore).toBe(0);

  // Declared opening → functional quiz_gate
  expect(result.repaired, 'repairSceneOpenings should place a gate').toBeGreaterThanOrEqual(1);
  expect(result.afterRecipeOk, 'after repair, openings validate').toBe(true);
  expect(result.gateAfterRecipe).toBeGreaterThanOrEqual(1);
  expect(result.gapAfterRepair).toBe('quiz_gate');
  expect(result.repairedAgain, 'repair is idempotent').toBe(0);

  // Illegal linear gap → barrier seal, NOT quiz_gate
  expect(result.scanSealed, 'scanAndRepairFenceGaps seals 1-cell gap with barrier').toBeGreaterThanOrEqual(1);
  expect(result.scanAgain, 'scan is idempotent').toBe(0);
  expect(result.gapCell, 'fence-run gap seals as fence').toBe('fence');
  expect(result.gapWalkable).toBe(false);
  expect(result.gapInteractable).toBe(false);
  expect(result.quizFromScan, 'barrier seal must not inject quiz_gate').toBe(0);
  expect(result.interiorStillDirt, 'interior dirt without opposite barriers stays dirt').toBe(true);

  expect(result.wallSealed).toBeGreaterThanOrEqual(1);
  expect(result.wallGapKey, 'wall-run gap seals as wall (dominant neighbor)').toBe('wall');
  expect(result.wallGapWalkable).toBe(false);
});

test('fenced-farm recipe openings validated after stamp', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const { stampAssemblyOntoCells, validateSceneOpenings } = await import('/engine/iso2-assemblies.ts');
    const { FENCED_FARM, ASSEMBLY_RECIPES } = await import('/engine/iso2-assemblies/catalog.ts');

    const size = 12;
    const cells = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      })));

    const ox = 3;
    const oy = 3;
    stampAssemblyOntoCells(cells, 'fenced-farm', ox, oy);

    const recipe = ASSEMBLY_RECIPES['fenced-farm'] ?? FENCED_FARM;
    const validation = validateSceneOpenings(cells, ox, oy, recipe);

    const openingCells = (recipe.openings ?? []).map((o) => ({
      kind: o.kind,
      x: o.x,
      y: o.y,
      assetKey: cells[oy + o.y][ox + o.x].assetKey,
      walkable: cells[oy + o.y][ox + o.x].walkable,
    }));

    // Placement data itself must stamp quiz_gate (not rely only on repair).
    const placementCenter = recipe.placements.find((p) => p.x === 2 && p.y === 4);
    const gateCount = cells.flat().filter((c) => c.assetKey === 'quiz_gate').length;
    const fenceCount = cells.flat().filter((c) => c.assetKey === 'fence').length;
    const southCenter = cells[oy + 4][ox + 2].assetKey;
    const southLeft = cells[oy + 4][ox + 1].assetKey;
    const southRight = cells[oy + 4][ox + 3].assetKey;

    // Bare dirt-only entry would mean all three south gap cells are path-only.
    const southGap = [southLeft, southCenter, southRight];
    const bareDirtOnlyEntry =
      southGap.every((k) => k === 'dirt' || k === 'grass') &&
      !southGap.some((k) => k === 'quiz_gate' || k === 'door_locked' || k === 'door_open' || k === 'door_gate');

    return {
      ok: validation.ok,
      violations: validation.violations,
      openingsDeclared: (recipe.openings ?? []).length,
      openingCells,
      gateCount,
      fenceCount,
      southCenter,
      placementCenterKey: placementCenter?.assetKey ?? null,
      bareDirtOnlyEntry,
    };
  });

  expect(result.openingsDeclared, 'fenced-farm declares openings').toBeGreaterThanOrEqual(1);
  expect(result.ok, `farm openings should validate: ${JSON.stringify(result.violations)}`).toBe(true);
  expect(result.placementCenterKey, 'recipe placements stamp quiz_gate at south center').toBe('quiz_gate');
  expect(result.southCenter, 'south-center stamp cell is quiz_gate not dirt').toBe('quiz_gate');
  expect(result.bareDirtOnlyEntry, 'fenced-farm must not be bare dirt-only entry').toBe(false);
  expect(result.gateCount).toBeGreaterThanOrEqual(1);
  expect(result.fenceCount).toBeGreaterThanOrEqual(12);

  const center = result.openingCells.find((c) => c.kind === 'quiz_gate');
  expect(center?.assetKey).toBe('quiz_gate');
});

test('starter-homestead declares openings and validates after stamp', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const {
      stampStarterHomestead,
      validateSceneOpenings,
      STARTER_HOMESTEAD_RECIPE,
      STARTER_HOMESTEAD_ORIGIN,
    } = await import('/engine/iso2-assemblies.ts');

    const size = 32;
    const cells = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      })));

    stampStarterHomestead(cells);

    const recipe = STARTER_HOMESTEAD_RECIPE;
    const ox = STARTER_HOMESTEAD_ORIGIN.x;
    const oy = STARTER_HOMESTEAD_ORIGIN.y;
    const validation = validateSceneOpenings(cells, ox, oy, recipe);

    // Sole opening rel (4,8) → abs (13,16) on 9×9 homestead
    const gateCell = cells[oy + 8][ox + 4];
    const openings = (recipe.openings ?? []).map((o) => ({
      kind: o.kind,
      assetKey: cells[oy + o.y][ox + o.x].assetKey,
    }));

    return {
      openingsDeclared: (recipe.openings ?? []).length,
      hasQuizGateOpening: (recipe.openings ?? []).some((o) => o.kind === 'quiz_gate'),
      ok: validation.ok,
      violations: validation.violations,
      gateAsset: gateCell.assetKey,
      openings,
      recipeWidth: recipe.width,
      recipeHeight: recipe.height,
    };
  });

  expect(result.openingsDeclared, 'starter homestead declares openings').toBeGreaterThanOrEqual(1);
  expect(result.hasQuizGateOpening, 'starter homestead declares quiz_gate opening').toBe(true);
  expect(result.ok, `starter openings should validate: ${JSON.stringify(result.violations)}`).toBe(true);
  expect(result.gateAsset).toBe('quiz_gate');
  expect(result.recipeWidth, '9×9 homestead').toBe(9);
  expect(result.recipeHeight).toBe(9);
});

test('fenced recipes require functional gate openings (no bare dirt-only entry)', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const { stampAssemblyOntoCells, validateSceneOpenings } = await import('/engine/iso2-assemblies.ts');
    const { ASSEMBLY_RECIPES } = await import('/engine/iso2-assemblies/catalog.ts');

    const FENCED_IDS = [
      'fenced-farm',
      'gatehouse',
      'church-graveyard',
      'fenced-garden-quiz',
      'meadow-shrine-gate',
    ] as const;
    const FUNCTIONAL = new Set(['quiz_gate', 'door_locked', 'door_open', 'door_gate', 'toll_gate']);

    const reports: Array<{
      id: string;
      openingsDeclared: number;
      hasFunctionalOpening: boolean;
      validateOk: boolean;
      bareDirtOnlyFunctionalMissing: boolean;
    }> = [];

    for (const id of FENCED_IDS) {
      const recipe = ASSEMBLY_RECIPES[id];
      if (!recipe) continue;

      const size = 16;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })));

      const ox = 2;
      const oy = 2;
      stampAssemblyOntoCells(cells, id, ox, oy);
      const validation = validateSceneOpenings(cells, ox, oy, recipe);
      const openings = recipe.openings ?? [];

      const hasFunctionalOpening = openings.some((o) => {
        if (o.kind === 'quiz_gate' || o.kind === 'door_locked') return true;
        const key = cells[oy + o.y][ox + o.x].assetKey;
        return FUNCTIONAL.has(key);
      });

      // Among openings, if any is declared path-only cluster with no functional
      // neighbor opening, flag bare entry. For fenced recipes we require ≥1 functional.
      const functionalOnGrid = openings.filter((o) => {
        const key = cells[oy + o.y][ox + o.x].assetKey;
        return FUNCTIONAL.has(key);
      });

      const bareDirtOnlyFunctionalMissing =
        openings.length > 0 &&
        functionalOnGrid.length === 0 &&
        openings.every((o) => {
          const key = cells[oy + o.y][ox + o.x].assetKey;
          return key === 'dirt' || key === 'grass';
        });

      reports.push({
        id,
        openingsDeclared: openings.length,
        hasFunctionalOpening,
        validateOk: validation.ok,
        bareDirtOnlyFunctionalMissing,
      });
    }

    // LEGACY homestead-small also fenced with door
    const { stampAssemblyOntoCells: stamp2 } = await import('/engine/iso2-assemblies.ts');
    const size = 16;
    const cells = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      })));
    stamp2(cells, 'homestead-small', 2, 2);
    const door = cells[2 + 4][2 + 2].assetKey;

    return { reports, homesteadDoor: door };
  });

  for (const r of result.reports) {
    expect(r.openingsDeclared, `${r.id} declares openings`).toBeGreaterThanOrEqual(1);
    expect(r.hasFunctionalOpening, `${r.id} has functional gate opening`).toBe(true);
    expect(r.validateOk, `${r.id} openings validate`).toBe(true);
    expect(r.bareDirtOnlyFunctionalMissing, `${r.id} not bare dirt-only entry`).toBe(false);
  }
  expect(result.homesteadDoor).toBe('door_locked');
});

test('gatehouse door_locked opening validates without forced quiz_gate', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const { stampAssemblyOntoCells, validateSceneOpenings } = await import('/engine/iso2-assemblies.ts');
    const { GATEHOUSE } = await import('/engine/iso2-assemblies/catalog.ts');

    const size = 12;
    const cells = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      })));

    stampAssemblyOntoCells(cells, 'gatehouse', 2, 2);
    const validation = validateSceneOpenings(cells, 2, 2, GATEHOUSE);
    const door = cells[2 + 1][2 + 2].assetKey;

    return { ok: validation.ok, door, violations: validation.violations };
  });

  expect(result.ok).toBe(true);
  expect(result.door).toBe('door_locked');
});

test('door_locked repair places door_locked; kind mismatch fails validate', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const {
      validateSceneOpenings,
      repairSceneOpenings,
    } = await import('/engine/iso2-assemblies/scene-invariants.ts');

    const size = 6;
    const cells = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      })));
    // Bare dirt where a door should be
    cells[2][2] = { assetKey: 'dirt', walkable: true, interactable: false };

    const recipe = {
      id: 'door-test',
      width: 3,
      height: 3,
      placements: [] as const,
      openings: [{ x: 1, y: 1, kind: 'door_locked' as const }],
    };

    const before = validateSceneOpenings(cells, 1, 1, recipe);
    const repaired = repairSceneOpenings(cells, 1, 1, recipe);
    const after = validateSceneOpenings(cells, 1, 1, recipe);
    const asset = cells[2][2].assetKey;

    // quiz_gate must NOT satisfy door_locked kind
    cells[2][2] = { assetKey: 'quiz_gate', walkable: false, interactable: true };
    const quizAsDoor = validateSceneOpenings(cells, 1, 1, recipe);

    return {
      beforeOk: before.ok,
      repaired,
      afterOk: after.ok,
      asset,
      quizAsDoorOk: quizAsDoor.ok,
    };
  });

  expect(result.beforeOk).toBe(false);
  expect(result.repaired).toBe(1);
  expect(result.asset).toBe('door_locked');
  expect(result.afterOk).toBe(true);
  expect(result.quizAsDoorOk, 'quiz_gate must not satisfy door_locked opening').toBe(false);
});

test('recipe-footprint and grid OOB openings; parallel corridor not mass-gated', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const {
      validateSceneOpenings,
      repairSceneOpenings,
      scanAndRepairFenceGaps,
    } = await import('/engine/iso2-assemblies/scene-invariants.ts');

    const size = 8;
    const cells = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      })));

    // Recipe footprint OOB: opening (5,0) on a 3×3 recipe
    const recipeOob = {
      id: 'recipe-oob',
      width: 3,
      height: 3,
      placements: [] as const,
      openings: [{ x: 5, y: 0, kind: 'quiz_gate' as const }],
    };
    const footprint = validateSceneOpenings(cells, 1, 1, recipeOob);
    const repairFp = repairSceneOpenings(cells, 1, 1, recipeOob);
    const mutatedByFp = cells[1][1 + 5]?.assetKey === 'quiz_gate';

    // Grid OOB: origin near edge so opening lands outside grid
    const recipeGrid = {
      id: 'grid-oob',
      width: 5,
      height: 5,
      placements: [] as const,
      openings: [{ x: 4, y: 4, kind: 'quiz_gate' as const }],
    };
    const gridOob = validateSceneOpenings(cells, 6, 6, recipeGrid);
    const repairGrid = repairSceneOpenings(cells, 6, 6, recipeGrid);

    // Parallel corridor between two fence runs — must NOT mass-place quiz_gates
    const cells2 = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      })));
    for (let x = 1; x <= 5; x++) {
      cells2[1][x] = { assetKey: 'fence', walkable: false, interactable: false };
      cells2[3][x] = { assetKey: 'fence', walkable: false, interactable: false };
      cells2[2][x] = { assetKey: 'dirt', walkable: true, interactable: false };
    }
    const corridorPlaced = scanAndRepairFenceGaps(cells2, size);
    const corridorGates = cells2.flat().filter((c) => c.assetKey === 'quiz_gate').length;

    // Single-cell punch-through still works (control)
    const cells3 = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      })));
    for (let x = 1; x <= 5; x++) {
      cells3[2][x] = { assetKey: 'fence', walkable: false, interactable: false };
    }
    cells3[2][3] = { assetKey: 'dirt', walkable: true, interactable: false };
    // Continuity: fences on both sides of the gap
    const singlePlaced = scanAndRepairFenceGaps(cells3, size);

    return {
      footprintOk: footprint.ok,
      footprintActual: footprint.violations[0]?.actual,
      repairFp,
      mutatedByFp,
      gridOobOk: gridOob.ok,
      gridOobActual: gridOob.violations[0]?.actual,
      repairGrid,
      corridorPlaced,
      corridorGates,
      singlePlaced,
      singleGate: cells3[2][3].assetKey,
    };
  });

  expect(result.footprintOk).toBe(false);
  expect(result.footprintActual).toBe('<recipe-oob>');
  expect(result.repairFp).toBe(0);
  expect(result.mutatedByFp).toBe(false);

  expect(result.gridOobOk).toBe(false);
  expect(result.gridOobActual).toBe('<oob>');
  expect(result.repairGrid).toBe(0);

  expect(result.corridorPlaced, 'parallel corridor must not mass-seal').toBe(0);
  expect(result.corridorGates).toBe(0);

  expect(result.singlePlaced).toBeGreaterThanOrEqual(1);
  // Structural seal = matching barrier, not quiz_gate
  expect(result.singleGate).toBe('fence');
});

test('PR5 expand recipes: openings validate after stamp (garden, shrine, market)', async ({
  page,
}) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const { stampAssemblyOntoCells, validateSceneOpenings } = await import(
      '/engine/iso2-assemblies.ts'
    );
    const {
      ASSEMBLY_RECIPES,
      FENCED_GARDEN_QUIZ,
      MEADOW_SHRINE_GATE,
      MARKET_STALL_ROW,
    } = await import('/engine/iso2-assemblies/catalog.ts');

    const ids = [
      'fenced-garden-quiz',
      'meadow-shrine-gate',
      'market-stall-row',
    ] as const;

    const reports: Array<{
      id: string;
      openingsDeclared: number;
      validateOk: boolean;
      violations: unknown[];
      openingCells: Array<{ kind: string; assetKey: string }>;
      signatureOk: boolean;
    }> = [];

    for (const id of ids) {
      const recipe = ASSEMBLY_RECIPES[id];
      if (!recipe) {
        reports.push({
          id,
          openingsDeclared: 0,
          validateOk: false,
          violations: [{ reason: 'missing-recipe' }],
          openingCells: [],
          signatureOk: false,
        });
        continue;
      }

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
      stampAssemblyOntoCells(cells, id, ox, oy);
      const validation = validateSceneOpenings(cells, ox, oy, recipe);
      const openings = recipe.openings ?? [];
      const openingCells = openings.map((o) => ({
        kind: o.kind,
        assetKey: cells[oy + o.y][ox + o.x].assetKey,
      }));

      let signatureOk = false;
      if (id === 'fenced-garden-quiz') {
        const fence = cells.flat().filter((c) => c.assetKey === 'fence').length;
        const gate = cells[oy + 3][ox + 2].assetKey;
        signatureOk = fence >= 8 && gate === 'quiz_gate';
      } else if (id === 'meadow-shrine-gate') {
        const wall = cells.flat().filter((c) => c.assetKey === 'wall').length;
        const gate = cells[oy + 4][ox + 2].assetKey;
        const altar = cells[oy + 1][ox + 2].assetKey;
        signatureOk = wall >= 10 && gate === 'quiz_gate' && altar === 'rock';
      } else if (id === 'market-stall-row') {
        const shops =
          cells.flat().filter((c) => c.assetKey === 'shop').length +
          cells.flat().filter((c) => c.assetKey === 'shop_snack').length +
          cells.flat().filter((c) => c.assetKey === 'shop_trading').length +
          cells.flat().filter((c) => c.assetKey === 'shop_general').length;
        const corridorDirt = [0, 1, 2, 3, 4, 5, 6].every(
          (dx) => cells[oy + 1][ox + dx].assetKey === 'dirt',
        );
        signatureOk = shops >= 4 && corridorDirt;
      }

      reports.push({
        id,
        openingsDeclared: openings.length,
        validateOk: validation.ok,
        violations: validation.violations,
        openingCells,
        signatureOk,
      });
    }

    // Exports exist and match registry ids
    return {
      reports,
      exportIds: [
        FENCED_GARDEN_QUIZ.id,
        MEADOW_SHRINE_GATE.id,
        MARKET_STALL_ROW.id,
      ],
    };
  });

  expect(result.exportIds).toEqual([
    'fenced-garden-quiz',
    'meadow-shrine-gate',
    'market-stall-row',
  ]);

  for (const r of result.reports) {
    expect(r.openingsDeclared, `${r.id} declares openings`).toBeGreaterThanOrEqual(1);
    expect(
      r.validateOk,
      `${r.id} openings validate: ${JSON.stringify(r.violations)}`,
    ).toBe(true);
    expect(r.signatureOk, `${r.id} signature cells after stamp`).toBe(true);

    for (const cell of r.openingCells) {
      if (cell.kind === 'quiz_gate') {
        expect(cell.assetKey, `${r.id} quiz_gate opening`).toBe('quiz_gate');
      } else if (cell.kind === 'path') {
        expect(
          ['dirt', 'grass', 'quiz_gate', 'door_locked'].includes(cell.assetKey),
          `${r.id} path opening got ${cell.assetKey}`,
        ).toBe(true);
      }
    }
  }
});

test('PR5 expand recipes: full-gen sample validates stamped openings via registry', async ({
  page,
}) => {
  /**
   * Stamp + place-coherence path under real generateChunkSync.
   * Fixed wordlist + seed 42 over a non-origin ring must land ≥1 PR5 modular
   * stamp; every landed stamp must still validate openings post-pipeline.
   * Hard-require hits so weight/chance regressions cannot silently drop coverage.
   */
  await waitForGame(page);

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

  const result = await page.evaluate(async ([wordlist]: [string[]]) => {
    const gen = await import('/engine/gen.ts');
    const {
      getSceneStampRegistry,
      validateSceneOpenings,
      modularSceneIdsForBiome,
      stampAssemblyOntoCells,
      ASSEMBLY_RECIPES,
    } = await import('/engine/iso2-assemblies.ts');

    const pr5Ids = new Set([
      'fenced-garden-quiz',
      'meadow-shrine-gate',
      'market-stall-row',
    ]);

    gen.setWordlist(wordlist);
    gen.setBiomeNoiseSeed(42);
    gen.restoreEntropyBuffer('');

    const meadowIds = modularSceneIdsForBiome('meadow');
    const forestIds = modularSceneIdsForBiome('forest');
    const castleIds = modularSceneIdsForBiome('castle');

    // Direct stamp + validate under grass grid (always) for each PR5 id
    const directStamp: Array<{ id: string; ok: boolean }> = [];
    for (const id of pr5Ids) {
      const recipe = ASSEMBLY_RECIPES[id];
      const size = 16;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );
      stampAssemblyOntoCells(cells as any, id as any, 2, 2);
      const v = validateSceneOpenings(cells as any, 2, 2, recipe);
      directStamp.push({ id, ok: v.ok });
    }

    // Full-gen ring: collect stamps from registry after each chunk
    const coords: Array<[number, number]> = [];
    for (let cy = -3; cy <= 3; cy++) {
      for (let cx = -3; cx <= 3; cx++) {
        if (Math.abs(cx) + Math.abs(cy) <= 1) continue;
        coords.push([cx, cy]);
      }
    }

    let pr5StampHits = 0;
    let pr5ValidateOk = 0;
    let pr5ValidateFail = 0;
    const hitIds: string[] = [];
    const failures: Array<{ id: string; cx: number; cy: number; n: number }> = [];

    for (const [cx, cy] of coords) {
      const chunk = gen.generateChunkSync(cx, cy);
      const stamps = getSceneStampRegistry();
      for (const stamp of stamps) {
        if (!pr5Ids.has(stamp.recipe.id)) continue;
        pr5StampHits++;
        if (!hitIds.includes(stamp.recipe.id)) hitIds.push(stamp.recipe.id);
        const v = validateSceneOpenings(
          chunk.cells,
          stamp.originX,
          stamp.originY,
          stamp.recipe,
        );
        if (v.ok) pr5ValidateOk++;
        else {
          pr5ValidateFail++;
          failures.push({
            id: stamp.recipe.id,
            cx,
            cy,
            n: v.violations.length,
          });
        }
      }
    }

    return {
      meadowHasGarden: meadowIds.includes('fenced-garden-quiz'),
      meadowHasShrine: meadowIds.includes('meadow-shrine-gate'),
      meadowHasMarket: meadowIds.includes('market-stall-row'),
      forestHasGarden: forestIds.includes('fenced-garden-quiz'),
      forestHasShrine: forestIds.includes('meadow-shrine-gate'),
      castleHasMarket: castleIds.includes('market-stall-row'),
      directStamp,
      sampled: coords.length,
      pr5StampHits,
      pr5ValidateOk,
      pr5ValidateFail,
      hitIds,
      failures,
    };
  }, [FIXED_WORDLIST] as [string[]]);

  // Biome weight wiring
  expect(result.meadowHasGarden).toBe(true);
  expect(result.meadowHasShrine).toBe(true);
  expect(result.meadowHasMarket).toBe(true);
  expect(result.forestHasGarden).toBe(true);
  expect(result.forestHasShrine).toBe(true);
  expect(result.castleHasMarket).toBe(true);

  // Direct stamps always green (catalog contract)
  for (const d of result.directStamp) {
    expect(d.ok, `direct stamp ${d.id}`).toBe(true);
  }

  // Hard-require post-pipeline coverage (do not allow zero-hit silent green).
  // Fixed seed 42 + 44-chunk ring is known to land multiple PR5 stamps.
  expect(
    result.pr5StampHits,
    'fixed-seed ring must stamp at least one PR5 recipe (weights/chance regression)',
  ).toBeGreaterThan(0);
  expect(result.pr5ValidateFail, JSON.stringify(result.failures)).toBe(0);
  expect(result.pr5ValidateOk).toBe(result.pr5StampHits);

  // Prefer full catalog coverage over the ring when sample is large enough.
  for (const id of [
    'fenced-garden-quiz',
    'meadow-shrine-gate',
    'market-stall-row',
  ] as const) {
    expect(
      result.hitIds,
      `full-gen ring should land ${id} at least once (hitIds=${result.hitIds.join(',')})`,
    ).toContain(id);
  }

  // eslint-disable-next-line no-console
  console.log(
    `[PR5 full-gen] sampled=${result.sampled} pr5Hits=${result.pr5StampHits} ` +
      `ok=${result.pr5ValidateOk} ids=${result.hitIds.join(',') || '(none)'}`,
  );
});
