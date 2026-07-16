/**
 * scene-invariants.spec.ts — Scene opening contract + repair (PR1).
 *
 * Standing law: fence openings must be quiz_gate / door_locked / open path.
 * - Bare fence ring with dirt gap fails validation until repaired.
 * - fenced-farm recipe openings validate after stamp (repair places gate).
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test('bare fence ring with dirt gap: validate fails, repair places quiz_gate', async ({ page }) => {
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

    // Recipe-aware repair
    const repaired = repairSceneOpenings(cells, ox, oy, syntheticRecipe);
    const afterRecipe = validateSceneOpenings(cells, ox, oy, syntheticRecipe);
    const gateAfterRecipe = cells.flat().filter((c) => c.assetKey === 'quiz_gate').length;

    // Second ring: only scanAndRepairFenceGaps (no recipe openings applied yet)
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

    const scanPlaced = scanAndRepairFenceGaps(cells2, size);
    const gapCell = cells2[oy + 4][ox + 2].assetKey;
    const interiorStillDirt = cells2[oy + 2][ox + 2].assetKey === 'dirt';

    return {
      beforeOk: before.ok,
      beforeViolations: before.violations.length,
      gateBefore,
      repaired,
      afterRecipeOk: afterRecipe.ok,
      gateAfterRecipe,
      gapAfterRepair: cells[oy + 4][ox + 2].assetKey,
      scanPlaced,
      gapCell,
      interiorStillDirt,
    };
  });

  expect(result.beforeOk, 'bare dirt gap must fail validation').toBe(false);
  expect(result.beforeViolations).toBeGreaterThanOrEqual(1);
  expect(result.gateBefore).toBe(0);

  expect(result.repaired, 'repairSceneOpenings should place a gate').toBeGreaterThanOrEqual(1);
  expect(result.afterRecipeOk, 'after repair, openings validate').toBe(true);
  expect(result.gateAfterRecipe).toBeGreaterThanOrEqual(1);
  expect(result.gapAfterRepair).toBe('quiz_gate');

  expect(result.scanPlaced, 'scanAndRepairFenceGaps places gate in 1-cell gap').toBeGreaterThanOrEqual(1);
  expect(result.gapCell).toBe('quiz_gate');
  expect(result.interiorStillDirt, 'interior dirt without opposite barriers stays dirt').toBe(true);
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
      assetKey: cells[oy + o.y][ox + o.x].assetKey,
      walkable: cells[oy + o.y][ox + o.x].walkable,
    }));

    const gateCount = cells.flat().filter((c) => c.assetKey === 'quiz_gate').length;
    const fenceCount = cells.flat().filter((c) => c.assetKey === 'fence').length;
    const hasCenterGate = cells[oy + 4][ox + 2].assetKey === 'quiz_gate';

    return {
      ok: validation.ok,
      violations: validation.violations,
      openingsDeclared: (recipe.openings ?? []).length,
      openingCells,
      gateCount,
      fenceCount,
      hasCenterGate,
    };
  });

  expect(result.openingsDeclared, 'fenced-farm declares openings').toBeGreaterThanOrEqual(1);
  expect(result.ok, `farm openings should validate: ${JSON.stringify(result.violations)}`).toBe(true);
  expect(result.hasCenterGate, 'south-center opening repaired to quiz_gate').toBe(true);
  expect(result.gateCount).toBeGreaterThanOrEqual(1);
  expect(result.fenceCount).toBeGreaterThanOrEqual(12);

  const center = result.openingCells.find((c) => c.kind === 'quiz_gate');
  expect(center?.assetKey).toBe('quiz_gate');
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
