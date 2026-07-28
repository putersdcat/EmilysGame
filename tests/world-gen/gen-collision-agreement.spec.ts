/**
 * gen-collision-agreement.spec.ts — PR6 Layer 5: gen stamps ↔ walkability policy.
 *
 * Contract (design-play-stack-first-principles L5 / W4 / W5):
 *  - Fresh stamps write `cell.walkable` matching `expectedWalkableDefault(assetKey)`.
 *  - water* → false; bridge* → true; quiz_gate / door_locked / fence → false.
 *  - Pure water pad is not footprint-walkable (no leak through water).
 *  - Bridge deck walkable; adjacent water not (neighborhood).
 *  - Scene openings remain functional gates (quiz_gate / door_locked), not bare dirt.
 *
 * Policy is **tests/stamp defaults only** — not a second runtime authority.
 *
 * @see memories/repo/design-play-stack-first-principles-2026-07-19.md (PR6, L5)
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test.describe('PR6 Gen ↔ collision agreement (L5)', () => {
  test('modular scene stamps match expectedWalkableDefault (water/bridge/gate/fence)', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { stampAssemblyOntoCells } = await import('/engine/iso2-assemblies.ts');
      const { expectedWalkableDefault } = await import('/engine/walkability-policy.ts');

      const size = 16;
      const blank = () =>
        Array.from({ length: size }, () =>
          Array.from({ length: size }, () => ({
            assetKey: 'grass',
            walkable: true,
            interactable: false,
          })),
        );

      const contractKeys = new Set([
        'water',
        'bridge',
        'quiz_gate',
        'door_locked',
        'door_open',
        'fence',
        'wall',
        'toll_gate',
      ]);
      const isContract = (k: string) =>
        contractKeys.has(k) ||
        (k.startsWith('water_') && k !== 'water_flask') ||
        k.startsWith('bridge_') ||
        k.startsWith('wooden_fence') ||
        k.startsWith('stone_wall');

      const recipes = [
        'fenced-farm',
        'pond-clearing',
        'bridge-crossing',
        'gatehouse',
        'church-graveyard',
      ] as const;

      const mismatches: Array<{
        recipe: string;
        x: number;
        y: number;
        assetKey: string;
        stamped: boolean;
        expected: boolean;
      }> = [];
      const counts: Record<string, number> = {
        water: 0,
        bridge: 0,
        quiz_gate: 0,
        door_locked: 0,
        fence: 0,
        wall: 0,
      };

      for (const id of recipes) {
        const cells = blank();
        stampAssemblyOntoCells(cells as any, id as any, 2, 2);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const cell = cells[y][x];
            const k = cell.assetKey;
            if (k in counts) counts[k]++;
            if (!isContract(k)) continue;
            const expected = expectedWalkableDefault(k);
            if (cell.walkable !== expected) {
              mismatches.push({
                recipe: id,
                x,
                y,
                assetKey: k,
                stamped: cell.walkable,
                expected,
              });
            }
          }
        }
      }

      return { mismatches, counts, recipesChecked: recipes.length };
    });

    expect(result.recipesChecked).toBe(5);
    expect(result.counts.water, 'pond + bridge recipes must stamp water').toBeGreaterThanOrEqual(8);
    expect(result.counts.bridge, 'bridge-crossing must stamp bridge deck').toBeGreaterThanOrEqual(1);
    expect(result.counts.quiz_gate, 'fenced-farm must stamp quiz_gate').toBeGreaterThanOrEqual(1);
    expect(result.counts.fence, 'fenced-farm must stamp fence').toBeGreaterThanOrEqual(12);
    expect(result.counts.door_locked, 'gatehouse/church must stamp door_locked').toBeGreaterThanOrEqual(1);
    expect(
      result.mismatches,
      `stamp walkable must match policy: ${JSON.stringify(result.mismatches.slice(0, 8))}`,
    ).toEqual([]);
  });

  test('bridge-crossing: deck walkable; adjacent water not; policy agreement (W5)', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { stampAssemblyOntoCells } = await import('/engine/iso2-assemblies.ts');
      const { expectedWalkableDefault } = await import('/engine/walkability-policy.ts');
      const { isFootprintWalkable } = await import('/engine/walkability-query.ts');

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
      stampAssemblyOntoCells(cells as any, 'bridge-crossing', ox, oy);

      // Recipe: y=1 row → sand, water, bridge, water, sand at local (0..4, 1)
      const bridgeLocal = { x: 2, y: 1 };
      const waterW = cells[oy + bridgeLocal.y][ox + bridgeLocal.x - 1];
      const bridge = cells[oy + bridgeLocal.y][ox + bridgeLocal.x];
      const waterE = cells[oy + bridgeLocal.y][ox + bridgeLocal.x + 1];

      // Build a one-chunk map so footprint queries resolve stamped cells.
      const chunk = {
        cx: 0,
        cy: 0,
        biomeId: 0,
        biomeName: 'meadow',
        seed: 0,
        cells,
      };
      const chunks = new Map([['0,0', chunk]]);

      const bx = ox + bridgeLocal.x + 0.5;
      const by = oy + bridgeLocal.y + 0.5;

      return {
        bridgeKey: bridge.assetKey,
        bridgeWalkable: bridge.walkable,
        bridgePolicy: expectedWalkableDefault(bridge.assetKey),
        waterWKey: waterW.assetKey,
        waterWWalkable: waterW.walkable,
        waterWPolicy: expectedWalkableDefault(waterW.assetKey),
        waterEKey: waterE.assetKey,
        waterEWalkable: waterE.walkable,
        waterEPolicy: expectedWalkableDefault(waterE.assetKey),
        footprintBridge: isFootprintWalkable(bx, by, chunks as any),
        footprintWaterW: isFootprintWalkable(bx - 1, by, chunks as any),
        footprintWaterE: isFootprintWalkable(bx + 1, by, chunks as any),
      };
    });

    expect(result.bridgeKey).toBe('bridge');
    expect(result.bridgeWalkable).toBe(true);
    expect(result.bridgePolicy).toBe(true);
    expect(result.waterWKey).toBe('water');
    expect(result.waterEKey).toBe('water');
    expect(result.waterWWalkable).toBe(false);
    expect(result.waterEWalkable).toBe(false);
    expect(result.waterWPolicy).toBe(false);
    expect(result.waterEPolicy).toBe(false);
    expect(result.footprintBridge, 'bridge deck footprint must pass').toBe(true);
    expect(result.footprintWaterW, 'west water footprint must hard-fail').toBe(false);
    expect(result.footprintWaterE, 'east water footprint must hard-fail').toBe(false);
  });

  test('pure water pad: no walkable footprint through water (integrity)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { stampAssemblyOntoCells } = await import('/engine/iso2-assemblies.ts');
      const { expectedWalkableDefault } = await import('/engine/walkability-policy.ts');
      const { isFootprintWalkable, isPositionWalkable } = await import(
        '/engine/walkability-query.ts'
      );

      const size = 12;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );
      stampAssemblyOntoCells(cells as any, 'pond-clearing', 2, 2);

      // Collect all pond water cells
      const waterCells: Array<{ x: number; y: number; walkable: boolean }> = [];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const c = cells[y][x];
          if (c.assetKey === 'water' || (c.assetKey.startsWith('water_') && c.assetKey !== 'water_flask')) {
            waterCells.push({ x, y, walkable: c.walkable });
          }
        }
      }

      const chunk = {
        cx: 0,
        cy: 0,
        biomeId: 0,
        biomeName: 'meadow',
        seed: 0,
        cells,
      };
      const chunks = new Map([['0,0', chunk]]);

      let walkableFootprints = 0;
      let walkablePositions = 0;
      for (const w of waterCells) {
        if (isFootprintWalkable(w.x + 0.5, w.y + 0.5, chunks as any)) walkableFootprints++;
        if (isPositionWalkable(w.x + 0.5, w.y + 0.5, chunks as any)) walkablePositions++;
      }

      // Policy agreement on every water cell
      const policyMismatches = waterCells.filter(
        (w) => w.walkable !== expectedWalkableDefault(cells[w.y][w.x].assetKey),
      ).length;

      return {
        waterCount: waterCells.length,
        walkableWaterLeaks: waterCells.filter((w) => w.walkable).length,
        policyMismatches,
        walkableFootprints,
        walkablePositions,
      };
    });

    expect(result.waterCount, 'pond-clearing must stamp a water body').toBeGreaterThanOrEqual(8);
    expect(result.walkableWaterLeaks, 'no stamped water cell may be walkable').toBe(0);
    expect(result.policyMismatches).toBe(0);
    expect(result.walkableFootprints, 'no footprint may pass through pure water').toBe(0);
    expect(result.walkablePositions, 'no position sample may pass through pure water').toBe(0);
  });

  test('scene openings remain functional gates after stamp', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { stampAssemblyOntoCells, validateSceneOpenings } = await import(
        '/engine/iso2-assemblies.ts'
      );
      const { ASSEMBLY_RECIPES, FENCED_FARM } = await import(
        '/engine/iso2-assemblies/catalog.ts'
      );
      const {
        stampStarterHomestead,
        STARTER_HOMESTEAD_RECIPE,
        STARTER_HOMESTEAD_ORIGIN,
      } = await import('/engine/iso2-assemblies.ts');
      const { expectedWalkableDefault } = await import('/engine/walkability-policy.ts');

      const size = 32;
      const blank = () =>
        Array.from({ length: size }, () =>
          Array.from({ length: size }, () => ({
            assetKey: 'grass',
            walkable: true,
            interactable: false,
          })),
        );

      // --- fenced-farm ---
      const farm = blank();
      const fox = 3;
      const foy = 3;
      stampAssemblyOntoCells(farm as any, 'fenced-farm', fox, foy);
      const farmRecipe = ASSEMBLY_RECIPES['fenced-farm'] ?? FENCED_FARM;
      const farmVal = validateSceneOpenings(farm as any, fox, foy, farmRecipe);
      const farmGate = farm[foy + 4][fox + 2];

      // --- gatehouse ---
      const gate = blank();
      stampAssemblyOntoCells(gate as any, 'gatehouse', 3, 3);
      const gateRecipe = ASSEMBLY_RECIPES['gatehouse'];
      const gateVal = gateRecipe
        ? validateSceneOpenings(gate as any, 3, 3, gateRecipe)
        : { ok: true, violations: [] as string[] };
      const lockedDoors = gate.flat().filter((c) => c.assetKey === 'door_locked');

      // --- starter homestead ---
      const home = blank();
      stampStarterHomestead(home as any);
      const ox = STARTER_HOMESTEAD_ORIGIN.x;
      const oy = STARTER_HOMESTEAD_ORIGIN.y;
      const homeVal = validateSceneOpenings(
        home as any,
        ox,
        oy,
        STARTER_HOMESTEAD_RECIPE,
      );
      const homeGateOpening = (STARTER_HOMESTEAD_RECIPE.openings ?? []).find(
        (o) => o.kind === 'quiz_gate',
      );
      const homeGate = homeGateOpening
        ? home[oy + homeGateOpening.y][ox + homeGateOpening.x]
        : null;

      return {
        farmOk: farmVal.ok,
        farmViolations: farmVal.violations,
        farmGateKey: farmGate.assetKey,
        farmGateWalkable: farmGate.walkable,
        farmGateInteractable: farmGate.interactable,
        farmGatePolicy: expectedWalkableDefault(farmGate.assetKey),
        gateOk: gateVal.ok,
        lockedDoorCount: lockedDoors.length,
        lockedDoorsWalkable: lockedDoors.map((d) => d.walkable),
        lockedDoorsPolicy: lockedDoors.map((d) => expectedWalkableDefault(d.assetKey)),
        homeOk: homeVal.ok,
        homeViolations: homeVal.violations,
        homeGateKey: homeGate?.assetKey ?? null,
        homeGateWalkable: homeGate?.walkable ?? null,
        homeGateInteractable: homeGate?.interactable ?? null,
        homeGatePolicy: homeGate ? expectedWalkableDefault(homeGate.assetKey) : null,
      };
    });

    expect(result.farmOk, `fenced-farm openings: ${JSON.stringify(result.farmViolations)}`).toBe(
      true,
    );
    expect(result.farmGateKey).toBe('quiz_gate');
    expect(result.farmGateWalkable).toBe(false);
    expect(result.farmGateInteractable).toBe(true);
    expect(result.farmGatePolicy).toBe(false);

    expect(result.gateOk).toBe(true);
    expect(result.lockedDoorCount).toBeGreaterThanOrEqual(1);
    for (const w of result.lockedDoorsWalkable) expect(w).toBe(false);
    for (const p of result.lockedDoorsPolicy) expect(p).toBe(false);

    expect(result.homeOk, `homestead openings: ${JSON.stringify(result.homeViolations)}`).toBe(
      true,
    );
    expect(result.homeGateKey).toBe('quiz_gate');
    expect(result.homeGateWalkable).toBe(false);
    expect(result.homeGateInteractable).toBe(true);
    expect(result.homeGatePolicy).toBe(false);
  });

  test('generateChunkSync contract keys match expectedWalkableDefault (W4 scan)', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const gen = await import('/engine/gen.ts');
      const { expectedWalkableDefault } = await import('/engine/walkability-policy.ts');

      const contractKeys = new Set([
        'water',
        'bridge',
        'quiz_gate',
        'door_locked',
        'door_open',
        'fence',
        'wall',
        'toll_gate',
        'barricade',
      ]);
      const isContract = (k: string) =>
        contractKeys.has(k) ||
        (k.startsWith('water_') && k !== 'water_flask') ||
        k.startsWith('bridge_') ||
        k.startsWith('wooden_fence') ||
        k.startsWith('stone_wall');

      // Sample origin + near ring so modular scenes / rivers can appear.
      const coords = [
        [0, 0],
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
        [2, 0],
        [1, 1],
        [-1, 1],
        [2, 1],
        [3, 0],
      ];

      const mismatches: Array<{
        chunk: string;
        x: number;
        y: number;
        assetKey: string;
        stamped: boolean;
        expected: boolean;
      }> = [];
      const tallies: Record<string, number> = {
        water: 0,
        bridge: 0,
        quiz_gate: 0,
        fence: 0,
        door_locked: 0,
        wall: 0,
        contractCells: 0,
      };
      let walkableWater = 0;
      let unwalkableBridge = 0;

      for (const [cx, cy] of coords) {
        const chunk = gen.generateChunkSync(cx, cy);
        for (let y = 0; y < chunk.cells.length; y++) {
          for (let x = 0; x < chunk.cells[y].length; x++) {
            const cell = chunk.cells[y][x];
            const k = cell.assetKey;
            if (k === 'water') {
              tallies.water++;
              if (cell.walkable) walkableWater++;
            }
            if (k === 'bridge') {
              tallies.bridge++;
              if (!cell.walkable) unwalkableBridge++;
            }
            if (k === 'quiz_gate') tallies.quiz_gate++;
            if (k === 'fence') tallies.fence++;
            if (k === 'door_locked') tallies.door_locked++;
            if (k === 'wall') tallies.wall++;

            if (!isContract(k)) continue;
            tallies.contractCells++;
            const expected = expectedWalkableDefault(k);
            if (cell.walkable !== expected) {
              mismatches.push({
                chunk: `${cx},${cy}`,
                x,
                y,
                assetKey: k,
                stamped: cell.walkable,
                expected,
              });
            }
          }
        }
      }

      return {
        mismatches: mismatches.slice(0, 20),
        mismatchCount: mismatches.length,
        tallies,
        walkableWater,
        unwalkableBridge,
        chunks: coords.length,
      };
    });

    expect(result.chunks).toBe(10);
    expect(result.walkableWater, 'water integrity: no walkable water after gen').toBe(0);
    expect(result.unwalkableBridge, 'bridge integrity: no unwalkable bridge after gen').toBe(0);
    expect(
      result.mismatchCount,
      `gen stamps must match policy: ${JSON.stringify(result.mismatches)}`,
    ).toBe(0);
    // Sanity: origin/near chunks should produce some contract cells (terrain always has some).
    expect(result.tallies.contractCells).toBeGreaterThan(0);
  });

  test('ASSET_DEFS catalog keys agree with expectedWalkableDefault (asset-policy)', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { ASSET_DEFS } = await import('/config/assets.config.ts');
      const { expectedWalkableDefault } = await import('/engine/walkability-policy.ts');

      const keys = [
        'water',
        'bridge',
        'quiz_gate',
        'door_locked',
        'door_open',
        'fence',
        'wall',
        'toll_gate',
        'grass',
        'dirt',
        'water_flask',
      ] as const;

      const rows: Array<{ key: string; catalog: boolean; policy: boolean }> = [];
      const mismatches: string[] = [];
      for (const k of keys) {
        const def = ASSET_DEFS[k];
        if (!def) {
          mismatches.push(`missing ASSET_DEFS.${k}`);
          continue;
        }
        const policy = expectedWalkableDefault(k);
        rows.push({ key: k, catalog: def.walkable, policy });
        if (def.walkable !== policy) mismatches.push(k);
      }

      // Material-only fallbacks (not in ASSET_DEFS) — place-family matrix surface
      const materialOnly: Record<string, boolean> = {};
      for (const k of [
        'water_clear_river',
        'water_muddy_creek',
        'water_deep_pond',
        'water_marsh_edge',
        'bridge_wood',
        'stone_wall',
        'stone_wall_red_clinker',
        'wooden_fence',
        'door_gate',
      ]) {
        materialOnly[k] = expectedWalkableDefault(k);
      }

      return { rows, mismatches, materialOnly };
    });

    expect(result.mismatches, 'catalog walkable must equal policy for contract keys').toEqual([]);
    for (const row of result.rows) {
      expect(row.policy, row.key).toBe(row.catalog);
    }
    expect(result.materialOnly.water_clear_river).toBe(false);
    expect(result.materialOnly.water_muddy_creek).toBe(false);
    expect(result.materialOnly.water_deep_pond).toBe(false);
    expect(result.materialOnly.water_marsh_edge).toBe(false);
    expect(result.materialOnly.bridge_wood).toBe(true);
    expect(result.materialOnly.stone_wall).toBe(false);
    expect(result.materialOnly.stone_wall_red_clinker).toBe(false);
    expect(result.materialOnly.wooden_fence).toBe(false);
    expect(result.materialOnly.door_gate).toBe(false);
  });
});
