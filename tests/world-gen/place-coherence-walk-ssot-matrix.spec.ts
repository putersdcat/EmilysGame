/**
 * place-coherence-walk-ssot-matrix.spec.ts — Place Coherence PR3 (P3 walk SSOT).
 *
 * Matrix for place-family assetKeys:
 *   fence, wall, wooden_fence, stone_wall,
 *   quiz_gate, door_locked, door_open, door_gate, toll_gate,
 *   water*, bridge*
 *
 * Proves:
 *  1. expectedWalkableDefault(key) matches ASSET_DEFS / material fallbacks
 *  2. After stamp, cell.walkable === expectedWalkableDefault(assetKey)
 *     (via auditWalkablePolicy from PlaceCoherence PR1)
 *  3. Runtime isPositionWalkable / isFootprintWalkable read cell.walkable only
 *  4. Bridge-over-water: bridge *replaces* water cell (walkable); neighbors stay water
 *  5. Gate unlock is cell rewrite (quiz_gate → door_open), not policy/render
 *  6. walkability-query source has no policy / render imports
 *
 * @see memories/repo/design-place-coherence-epic-2026-07-19.md (PR3)
 * @see src/engine/walkability-policy.ts
 * @see src/engine/world/PlaceCoherence.ts (auditWalkablePolicy)
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

/** Catalogued place-family keys + expected product-law walkable. */
const CATALOG_FAMILY: ReadonlyArray<{ key: string; walkable: boolean }> = [
  { key: 'fence', walkable: false },
  { key: 'wall', walkable: false },
  { key: 'quiz_gate', walkable: false },
  { key: 'door_locked', walkable: false },
  { key: 'door_open', walkable: true },
  { key: 'toll_gate', walkable: false },
  { key: 'water', walkable: false },
  { key: 'bridge', walkable: true },
];

/**
 * Material-only / tileType keys not necessarily in ASSET_DEFS as assetKeys.
 * door_gate = door_locked tileType; wooden_fence / stone_wall material families.
 */
const MATERIAL_FAMILY: ReadonlyArray<{ key: string; walkable: boolean }> = [
  { key: 'wooden_fence', walkable: false },
  { key: 'wooden_fence_post', walkable: false },
  { key: 'stone_wall', walkable: false },
  { key: 'stone_wall_red_clinker', walkable: false },
  { key: 'door_gate', walkable: false },
  { key: 'water_clear_river', walkable: false },
  { key: 'water_muddy_creek', walkable: false },
  { key: 'water_deep_pond', walkable: false },
  { key: 'water_marsh_edge', walkable: false },
  { key: 'bridge_wood', walkable: true },
];

test.describe('Place coherence walk SSOT matrix (PR3)', () => {
  test('policy matrix: place-family keys match ASSET_DEFS / material fallbacks', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(
      async ({ catalog, material }) => {
        const { ASSET_DEFS } = await import('/config/assets.config.ts');
        const { expectedWalkableDefault, PLACE_WALK_FAMILY_KEYS } = await import(
          '/engine/walkability-policy.ts'
        );

        const catalogRows: Array<{
          key: string;
          policy: boolean;
          catalog: boolean | null;
          expected: boolean;
        }> = [];
        const mismatches: string[] = [];

        for (const row of catalog) {
          const def = ASSET_DEFS[row.key];
          const policy = expectedWalkableDefault(row.key);
          catalogRows.push({
            key: row.key,
            policy,
            catalog: def ? def.walkable : null,
            expected: row.walkable,
          });
          if (policy !== row.walkable) mismatches.push(`policy:${row.key}`);
          if (def && def.walkable !== policy) mismatches.push(`catalog:${row.key}`);
        }

        const materialRows: Array<{ key: string; policy: boolean; expected: boolean }> = [];
        for (const row of material) {
          const policy = expectedWalkableDefault(row.key);
          materialRows.push({ key: row.key, policy, expected: row.walkable });
          if (policy !== row.walkable) mismatches.push(`material:${row.key}`);
        }

        // water_flask must stay walkable (collectible — not terrain water*)
        const flask = expectedWalkableDefault('water_flask');
        if (flask !== true) mismatches.push('water_flask must be walkable (catalog collectible)');

        return {
          catalogRows,
          materialRows,
          mismatches,
          placeFamilyKeys: [...PLACE_WALK_FAMILY_KEYS],
          flask,
        };
      },
      { catalog: CATALOG_FAMILY, material: MATERIAL_FAMILY },
    );

    expect(result.mismatches, JSON.stringify(result.mismatches)).toEqual([]);
    expect(result.flask).toBe(true);
    for (const row of result.catalogRows) {
      expect(row.policy, row.key).toBe(row.expected);
      if (row.catalog !== null) expect(row.catalog, row.key).toBe(row.expected);
    }
    for (const row of result.materialRows) {
      expect(row.policy, row.key).toBe(row.expected);
    }
    for (const k of [
      'fence',
      'wall',
      'quiz_gate',
      'door_locked',
      'door_open',
      'door_gate',
      'toll_gate',
      'water',
      'bridge',
      'wooden_fence',
      'stone_wall',
    ]) {
      expect(result.placeFamilyKeys, k).toContain(k);
    }
  });

  test('manual stamp: cell.walkable === expectedWalkableDefault; runtime cell-only', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { ASSET_DEFS } = await import('/config/assets.config.ts');
      const { expectedWalkableDefault } = await import('/engine/walkability-policy.ts');
      const { isPositionWalkable, isFootprintWalkable } = await import(
        '/engine/walkability-query.ts'
      );
      const { auditWalkablePolicy } = await import('/engine/world/PlaceCoherence.ts');

      const size = 16;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );

      type StampRow = {
        key: string;
        x: number;
        y: number;
        walkable: boolean;
        expected: boolean;
        posOk: boolean;
        footOk: boolean;
      };
      const stamped: StampRow[] = [];

      // Catalog keys stamped via ASSET_DEFS (production stamp path)
      const catalogKeys = [
        'fence',
        'wall',
        'quiz_gate',
        'door_locked',
        'door_open',
        'toll_gate',
        'water',
        'bridge',
      ] as const;

      let col = 1;
      for (const key of catalogKeys) {
        const def = ASSET_DEFS[key];
        if (!def) throw new Error(`missing ASSET_DEFS.${key}`);
        const expected = expectedWalkableDefault(key);
        const x = col++;
        const y = 2;
        cells[y][x] = {
          assetKey: key,
          walkable: def.walkable,
          interactable: def.interactable ?? false,
        };
        stamped.push({
          key,
          x,
          y,
          walkable: cells[y][x].walkable,
          expected,
          posOk: false,
          footOk: false,
        });
      }

      // Material-only keys stamped with policy default (simulates material tileTypes)
      const materialKeys = [
        'wooden_fence',
        'stone_wall',
        'door_gate',
        'water_clear_river',
        'bridge_wood',
      ] as const;

      col = 1;
      for (const key of materialKeys) {
        const expected = expectedWalkableDefault(key);
        const x = col++;
        const y = 4;
        cells[y][x] = {
          assetKey: key,
          walkable: expected,
          interactable: false,
        };
        stamped.push({
          key,
          x,
          y,
          walkable: cells[y][x].walkable,
          expected,
          posOk: false,
          footOk: false,
        });
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

      for (const row of stamped) {
        const px = row.x + 0.5;
        const py = row.y + 0.5;
        row.posOk = isPositionWalkable(px, py, chunks as any) === row.walkable;
        row.footOk = isFootprintWalkable(px, py, chunks as any) === row.walkable;
      }

      const policyViolations = auditWalkablePolicy(cells as any, size);

      // Negative control: flip walkable without changing assetKey → query follows cell
      const flip = stamped[0]!;
      const before = cells[flip.y][flip.x].walkable;
      cells[flip.y][flip.x] = { ...cells[flip.y][flip.x], walkable: !before };
      const afterFlip = isPositionWalkable(flip.x + 0.5, flip.y + 0.5, chunks as any);
      cells[flip.y][flip.x] = { ...cells[flip.y][flip.x], walkable: before };

      return {
        stamped,
        policyViolations,
        flipFollowsCell: afterFlip === !before,
      };
    });

    expect(result.policyViolations, JSON.stringify(result.policyViolations)).toEqual([]);
    expect(result.flipFollowsCell, 'isPositionWalkable must follow cell.walkable only').toBe(true);
    expect(result.stamped.length).toBe(13);
    for (const row of result.stamped) {
      expect(row.walkable, row.key).toBe(row.expected);
      expect(row.posOk, `pos ${row.key}`).toBe(true);
      expect(row.footOk, `foot ${row.key}`).toBe(true);
    }
  });

  test('recipe stamps: auditWalkablePolicy clean for place recipes (reuse PR1)', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { stampAssemblyOntoCells, stampStarterHomestead } = await import(
        '/engine/iso2-assemblies.ts'
      );
      const { auditWalkablePolicy } = await import('/engine/world/PlaceCoherence.ts');

      const recipes = [
        'fenced-farm',
        'pond-clearing',
        'bridge-crossing',
        'gatehouse',
        'church-graveyard',
      ] as const;

      const blank = (size: number) =>
        Array.from({ length: size }, () =>
          Array.from({ length: size }, () => ({
            assetKey: 'grass',
            walkable: true,
            interactable: false,
          })),
        );

      const reports: Array<{
        id: string;
        mismatches: number;
        sample: Array<{ x: number; y: number; assetKey: string; reason: string }>;
        counts: Record<string, number>;
      }> = [];

      for (const id of recipes) {
        const size = 16;
        const cells = blank(size);
        stampAssemblyOntoCells(cells as any, id, 2, 2);
        const violations = auditWalkablePolicy(cells as any, size);
        const counts: Record<string, number> = {};
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const k = cells[y][x].assetKey;
            counts[k] = (counts[k] ?? 0) + 1;
          }
        }
        reports.push({
          id,
          mismatches: violations.length,
          sample: violations.slice(0, 5).map((v) => ({
            x: v.x,
            y: v.y,
            assetKey: v.assetKey,
            reason: v.reason,
          })),
          counts: {
            fence: counts.fence ?? 0,
            wall: counts.wall ?? 0,
            water: counts.water ?? 0,
            bridge: counts.bridge ?? 0,
            quiz_gate: counts.quiz_gate ?? 0,
            door_locked: counts.door_locked ?? 0,
          },
        });
      }

      const home = blank(32);
      stampStarterHomestead(home as any);
      const homeViolations = auditWalkablePolicy(home as any, 32);

      return {
        reports,
        homeMismatches: homeViolations.length,
        homeSample: homeViolations.slice(0, 5),
      };
    });

    for (const r of result.reports) {
      expect(r.mismatches, `${r.id}: ${JSON.stringify(r.sample)}`).toBe(0);
    }
    expect(result.reports.find((r) => r.id === 'fenced-farm')?.counts.fence ?? 0).toBeGreaterThan(
      8,
    );
    expect(
      result.reports.find((r) => r.id === 'bridge-crossing')?.counts.bridge ?? 0,
    ).toBeGreaterThanOrEqual(1);
    expect(
      result.reports.find((r) => r.id === 'pond-clearing')?.counts.water ?? 0,
    ).toBeGreaterThanOrEqual(8);
    expect(result.homeMismatches, JSON.stringify(result.homeSample)).toBe(0);
  });

  test('bridge-over-water: deck replaces water cell; neighbors non-walkable water', async ({
    page,
  }) => {
    await waitForGame(page);

    /**
     * Product exception (documented): a bridge is not a dual-key overlay.
     * Stamping bridge on a former water cell sets assetKey='bridge', walkable=true.
     * Adjacent water cells remain assetKey='water', walkable=false.
     */
    const result = await page.evaluate(async () => {
      const { ASSET_DEFS } = await import('/config/assets.config.ts');
      const { expectedWalkableDefault } = await import('/engine/walkability-policy.ts');
      const { isFootprintWalkable, isPositionWalkable } = await import(
        '/engine/walkability-query.ts'
      );
      const { stampAssemblyOntoCells } = await import('/engine/iso2-assemblies.ts');
      const { auditWalkablePolicy } = await import('/engine/world/PlaceCoherence.ts');

      const size = 12;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );
      const waterDef = ASSET_DEFS.water;
      const bridgeDef = ASSET_DEFS.bridge;
      for (let y = 4; y <= 6; y++) {
        for (let x = 4; x <= 6; x++) {
          cells[y][x] = {
            assetKey: 'water',
            walkable: waterDef.walkable,
            interactable: false,
          };
        }
      }
      // Bridge replaces center water cell (product stamp path)
      cells[5][5] = {
        assetKey: 'bridge',
        walkable: bridgeDef.walkable,
        interactable: bridgeDef.interactable ?? false,
      };

      const chunk = {
        cx: 0,
        cy: 0,
        biomeId: 0,
        biomeName: 'meadow',
        seed: 0,
        cells,
      };
      const chunks = new Map([['0,0', chunk]]);

      const neighbors: Record<string, { key: string; walkable: boolean; pos: boolean }> = {};
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const c = cells[5 + dy][5 + dx];
        neighbors[`${dx},${dy}`] = {
          key: c.assetKey,
          walkable: c.walkable,
          pos: isPositionWalkable(5.5 + dx, 5.5 + dy, chunks as any),
        };
      }

      const recipeCells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );
      stampAssemblyOntoCells(recipeCells as any, 'bridge-crossing', 2, 2);
      const ox = 2;
      const oy = 2;
      // Local (2,1) is bridge; (1,1)/(3,1) water
      const rBridge = recipeCells[oy + 1][ox + 2];
      const rWaterW = recipeCells[oy + 1][ox + 1];
      const rWaterE = recipeCells[oy + 1][ox + 3];
      const recipeViolations = auditWalkablePolicy(recipeCells as any, size);

      return {
        bridgeKey: cells[5][5].assetKey,
        bridgeWalkable: cells[5][5].walkable,
        bridgePolicy: expectedWalkableDefault('bridge'),
        waterPolicy: expectedWalkableDefault('water'),
        footBridge: isFootprintWalkable(5.5, 5.5, chunks as any),
        neighbors,
        syntheticViolations: auditWalkablePolicy(cells as any, size).length,
        recipe: {
          bridgeKey: rBridge.assetKey,
          bridgeWalkable: rBridge.walkable,
          waterWKey: rWaterW.assetKey,
          waterWWalkable: rWaterW.walkable,
          waterEKey: rWaterE.assetKey,
          waterEWalkable: rWaterE.walkable,
          violations: recipeViolations.length,
        },
      };
    });

    expect(result.bridgeKey).toBe('bridge');
    expect(result.bridgeWalkable).toBe(true);
    expect(result.bridgePolicy).toBe(true);
    expect(result.waterPolicy).toBe(false);
    expect(result.footBridge).toBe(true);
    expect(result.syntheticViolations).toBe(0);
    for (const [offset, n] of Object.entries(result.neighbors)) {
      expect(n.key, `neighbor ${offset}`).toBe('water');
      expect(n.walkable, `neighbor ${offset}`).toBe(false);
      expect(n.pos, `neighbor ${offset} pos`).toBe(false);
    }
    expect(result.recipe.bridgeKey).toBe('bridge');
    expect(result.recipe.bridgeWalkable).toBe(true);
    expect(result.recipe.waterWKey).toBe('water');
    expect(result.recipe.waterEKey).toBe('water');
    expect(result.recipe.waterWWalkable).toBe(false);
    expect(result.recipe.waterEWalkable).toBe(false);
    expect(result.recipe.violations).toBe(0);
  });

  test('gate locked/unlocked: cell rewrite SSOT (quiz_gate → door_open)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { ASSET_DEFS } = await import('/config/assets.config.ts');
      const { expectedWalkableDefault } = await import('/engine/walkability-policy.ts');
      const { isPositionWalkable } = await import('/engine/walkability-query.ts');
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const chunk = state.chunks.get('0,0');
      if (!chunk) throw new Error('origin chunk missing');

      const setCell = (x: number, y: number, assetKey: string) => {
        const def = ASSET_DEFS[assetKey];
        chunk.cells[y][x] = {
          assetKey,
          walkable: def.walkable,
          interactable: def.interactable ?? false,
        };
      };

      for (let y = 10; y <= 14; y++) {
        for (let x = 10; x <= 14; x++) setCell(x, y, 'grass');
      }
      setCell(12, 12, 'quiz_gate');
      setCell(13, 12, 'door_locked');
      setCell(14, 12, 'toll_gate');

      const lockedGate = isPositionWalkable(12.5, 12.5, state.chunks);
      const lockedDoor = isPositionWalkable(13.5, 12.5, state.chunks);
      const lockedToll = isPositionWalkable(14.5, 12.5, state.chunks);

      state.activeConditions.set('quiz-gate', 'unlocked');
      const afterCondition = isPositionWalkable(12.5, 12.5, state.chunks);

      debug.resolveQuizGate('0,0', 12, 12);
      const rewritten = chunk.cells[12][12];
      const afterRewrite = isPositionWalkable(12.5, 12.5, state.chunks);

      return {
        lockedGate,
        lockedDoor,
        lockedToll,
        afterCondition,
        afterRewrite,
        rewrittenAsset: rewritten.assetKey,
        rewrittenWalkable: rewritten.walkable,
        quizPolicy: expectedWalkableDefault('quiz_gate'),
        openPolicy: expectedWalkableDefault('door_open'),
        lockedPolicy: expectedWalkableDefault('door_locked'),
        tollPolicy: expectedWalkableDefault('toll_gate'),
      };
    });

    expect(result.quizPolicy).toBe(false);
    expect(result.lockedPolicy).toBe(false);
    expect(result.tollPolicy).toBe(false);
    expect(result.openPolicy).toBe(true);
    expect(result.lockedGate).toBe(false);
    expect(result.lockedDoor).toBe(false);
    expect(result.lockedToll).toBe(false);
    expect(result.afterCondition, 'activeConditions must not open quiz_gate').toBe(false);
    expect(result.rewrittenAsset).toBe('door_open');
    expect(result.rewrittenWalkable).toBe(true);
    expect(result.afterRewrite).toBe(true);
  });

  test('walkability-query source: no policy or render imports', async () => {
    const queryPath = path.resolve('src/engine/walkability-query.ts');
    const src = fs.readFileSync(queryPath, 'utf-8');

    // Strip block comments so doc lines (e.g. "No imports from src/rendering") don't false-positive.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(code).not.toMatch(/walkability-policy/);
    expect(code).not.toMatch(/from\s+['"][^'"]*rendering/);
    expect(code).not.toMatch(/import\s+.*rendering/);
    expect(code).toMatch(/\.walkable/);
    expect(code).not.toMatch(/ASSET_DEFS/);
    expect(code).not.toMatch(/expectedWalkableDefault/);
    // Runtime path must not consult policy module (import statements only)
    expect(code).not.toMatch(/import\s+.*walkability-policy/);
  });
});

