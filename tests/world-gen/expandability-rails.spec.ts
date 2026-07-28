/**
 * expandability-rails.spec.ts — Scene-first PR7 smoke
 *
 * Proves a second farm variant can be added by catalog/register only
 * (no WorldUnitSolver, no nano architecture). Openings validate/repair.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test('registerSceneRecipe adds farm variant; openings validate after stamp', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const {
      registerSceneRecipe,
      stampAssemblyOntoCells,
      validateSceneOpenings,
      ASSEMBLY_RECIPES,
      setBiomeSceneWeight,
      modularSceneIdsForBiome,
    } = await import('/engine/iso2-assemblies.ts');

    const id = 'fenced-farm-north-variant';
    // Clean prior registration if re-run in same session
    delete (ASSEMBLY_RECIPES as any)[id];

    const recipe = registerSceneRecipe({
      id,
      width: 5,
      height: 5,
      placements: [
        { x: 0, y: 0, assetKey: 'fence' }, { x: 1, y: 0, assetKey: 'dirt' },
        { x: 2, y: 0, assetKey: 'quiz_gate' }, { x: 3, y: 0, assetKey: 'dirt' },
        { x: 4, y: 0, assetKey: 'fence' },
        { x: 0, y: 1, assetKey: 'fence' }, { x: 4, y: 1, assetKey: 'fence' },
        { x: 0, y: 2, assetKey: 'fence' }, { x: 2, y: 2, assetKey: 'hut' }, { x: 4, y: 2, assetKey: 'fence' },
        { x: 0, y: 3, assetKey: 'fence' }, { x: 4, y: 3, assetKey: 'fence' },
        { x: 0, y: 4, assetKey: 'fence' }, { x: 1, y: 4, assetKey: 'fence' },
        { x: 2, y: 4, assetKey: 'fence' }, { x: 3, y: 4, assetKey: 'fence' },
        { x: 4, y: 4, assetKey: 'fence' },
        { x: 1, y: 1, assetKey: 'wheat' }, { x: 3, y: 1, assetKey: 'wheat' },
        { x: 1, y: 2, assetKey: 'chicken' }, { x: 3, y: 2, assetKey: 'sheep' },
        { x: 1, y: 3, assetKey: 'dirt' }, { x: 2, y: 3, assetKey: 'dirt' }, { x: 3, y: 3, assetKey: 'dirt' },
      ],
      openings: [
        { x: 1, y: 0, kind: 'path' },
        { x: 2, y: 0, kind: 'quiz_gate' },
        { x: 3, y: 0, kind: 'path' },
      ],
    });

    setBiomeSceneWeight('meadow', id, 0.12);
    const meadowIds = modularSceneIdsForBiome('meadow');

    const size = 12;
    const cells = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      })),
    );
    stampAssemblyOntoCells(cells as any, id as any, 2, 2);
    const validation = validateSceneOpenings(cells as any, 2, 2, recipe);
    const gate = cells[2][2 + 2]; // originY=2, opening y=0 → y=2; x=2+2=4

    return {
      registered: ASSEMBLY_RECIPES[id]?.id === id,
      inMeadow: meadowIds.includes(id as any),
      ok: validation.ok,
      violations: validation.violations.length,
      gateKey: gate.assetKey,
    };
  });

  expect(result.registered).toBe(true);
  expect(result.inMeadow).toBe(true);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  expect(result.violations).toBe(0);
  expect(result.gateKey).toBe('quiz_gate');
});
