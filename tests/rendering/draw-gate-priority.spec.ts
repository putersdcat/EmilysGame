/**
 * draw-gate-priority.spec.ts — Place coherence P5: functional gates beat decor
 * under maxDrawCmds pressure. FOV remains 128×64 (no change).
 *
 * Run: npx playwright test tests/rendering/draw-gate-priority --reporter=line
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test.describe('P5 Draw integrity — functional gate budget priority', () => {
  test('selectWithinDrawBudget prefers quiz_gate/door_* over decor when truncated', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const {
        selectWithinDrawBudget,
        prioritizeObjectCellsForDrawBudget,
        isFunctionalGateDrawPriority,
        DRAW_PRIORITY_GATE_KEYS,
      } = await import('/rendering/draw-priority.ts');
      const { FUNCTIONAL_OPENING_KEYS } = await import(
        '/engine/iso2-assemblies/scene-invariants.ts'
      );
      const { RENDER_CONFIG } = await import('/config/game.config.ts');

      // Align with scene-invariants (no parallel invented set)
      const keysMatch =
        DRAW_PRIORITY_GATE_KEYS.size === FUNCTIONAL_OPENING_KEYS.size &&
        [...FUNCTIONAL_OPENING_KEYS].every((k) => DRAW_PRIORITY_GATE_KEYS.has(k));

      // Synthetic overcrowded list: many decor, one late quiz_gate, one door_locked
      const candidates: Array<{ assetKey: string; id: number }> = [];
      for (let i = 0; i < 50; i++) {
        candidates.push({ assetKey: i % 3 === 0 ? 'tree' : 'fence', id: i });
      }
      candidates.push({ assetKey: 'quiz_gate', id: 100 });
      candidates.push({ assetKey: 'door_locked', id: 101 });
      candidates.push({ assetKey: 'toll_gate', id: 102 });
      candidates.push({ assetKey: 'bush', id: 103 });

      const maxCmds = 5; // far below candidate count
      const selected = selectWithinDrawBudget(candidates, maxCmds);
      const selectedKeys = selected.map((c) => c.assetKey);

      const ordered = prioritizeObjectCellsForDrawBudget(candidates);
      const firstThree = ordered.slice(0, 3).map((c) => c.assetKey);

      // Without priority, naive slice would take first 5 trees/fences and drop gates
      const naive = candidates.slice(0, maxCmds).map((c) => c.assetKey);
      const naiveHasGate = naive.some((k) => isFunctionalGateDrawPriority(k));
      const selectedGates = selectedKeys.filter((k) => isFunctionalGateDrawPriority(k));

      return {
        keysMatch,
        fov: { tileWidth: RENDER_CONFIG.tileWidth, tileHeight: RENDER_CONFIG.tileHeight },
        maxDrawCmdsDefault: RENDER_CONFIG.maxDrawCmds,
        selectedKeys,
        selectedGates,
        firstThree,
        naiveHasGate,
        selectedLen: selected.length,
        isQuiz: isFunctionalGateDrawPriority('quiz_gate'),
        isTree: isFunctionalGateDrawPriority('tree'),
        isDoorOpen: isFunctionalGateDrawPriority('door_open'),
        isDoorGate: isFunctionalGateDrawPriority('door_gate'),
      };
    });

    expect(result.keysMatch, 'DRAW_PRIORITY_GATE_KEYS === FUNCTIONAL_OPENING_KEYS').toBe(true);
    expect(result.fov.tileWidth, 'FOV tileWidth locked at 128').toBe(128);
    expect(result.fov.tileHeight, 'FOV tileHeight locked at 64').toBe(64);
    expect(result.isQuiz).toBe(true);
    expect(result.isTree).toBe(false);
    expect(result.isDoorOpen).toBe(true);
    expect(result.isDoorGate).toBe(true);

    // Budget of 5: all three gates fit first, then 2 decor
    expect(result.selectedLen).toBe(5);
    expect(result.selectedGates.sort()).toEqual(['door_locked', 'quiz_gate', 'toll_gate'].sort());
    expect(result.firstThree.sort()).toEqual(['door_locked', 'quiz_gate', 'toll_gate'].sort());
    expect(result.naiveHasGate, 'naive order would drop late gates').toBe(false);
    expect(result.selectedKeys.slice(0, 3).every((k) =>
      ['quiz_gate', 'door_locked', 'door_open', 'door_gate', 'toll_gate'].includes(k),
    )).toBe(true);
  });

  test('on-screen homestead quiz_gate is present after stamp (sim still has gate cell)', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const {
        stampStarterHomestead,
        STARTER_HOMESTEAD_ORIGIN,
      } = await import('/engine/iso2-assemblies.ts');
      const { HOMESTEAD_SOUTH_GATE_ABS } = await import('/engine/world/PlaceCoherence.ts');
      const { selectWithinDrawBudget, isFunctionalGateDrawPriority } = await import(
        '/rendering/draw-priority.ts'
      );
      const { ASSET_DEFS } = await import('/config/assets.config.ts');

      const size = 32;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );
      stampStarterHomestead(cells);

      const gate = cells[HOMESTEAD_SOUTH_GATE_ABS.y][HOMESTEAD_SOUTH_GATE_ABS.x];
      const gateDef = ASSET_DEFS[gate.assetKey];

      // Simulate overcrowded object list drawn from homestead footprint
      const ox = STARTER_HOMESTEAD_ORIGIN.x;
      const oy = STARTER_HOMESTEAD_ORIGIN.y;
      const candidates: Array<{ assetKey: string; x: number; y: number }> = [];
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const c = cells[oy + y][ox + x];
          const def = ASSET_DEFS[c.assetKey];
          if (!def || (def.layer === 'base' && !c.itemId)) continue;
          candidates.push({ assetKey: c.assetKey, x: ox + x, y: oy + y });
        }
      }
      // Flood with decor so budget would drop a late gate under naive order
      for (let i = 0; i < 200; i++) {
        candidates.unshift({ assetKey: 'tree', x: -1, y: -1 });
      }

      const tight = selectWithinDrawBudget(candidates, 8);
      const hasGate = tight.some((c) => isFunctionalGateDrawPriority(c.assetKey));
      const gateInSelected = tight.some(
        (c) =>
          c.assetKey === 'quiz_gate' &&
          c.x === HOMESTEAD_SOUTH_GATE_ABS.x &&
          c.y === HOMESTEAD_SOUTH_GATE_ABS.y,
      );

      return {
        gateAsset: gate.assetKey,
        gateHasNanoOrTile: !!(gateDef?.tileType || gateDef?.emoji),
        gateLayer: gateDef?.layer ?? null,
        candidateCount: candidates.length,
        hasGateInBudget: hasGate,
        gateInSelected,
        selectedKeys: tight.map((c) => c.assetKey),
      };
    });

    expect(result.gateAsset).toBe('quiz_gate');
    expect(result.gateLayer, 'gate is elevated object paint').not.toBe('base');
    expect(result.gateHasNanoOrTile, 'homestead gate has draw material').toBe(true);
    expect(result.hasGateInBudget, 'budget prefers gate over flooded decor').toBe(true);
    expect(result.gateInSelected, 'south quiz_gate survives maxDrawCmds=8').toBe(true);
  });

  test('FOV still 128×64 (no thrash)', async ({ page }) => {
    await waitForGame(page);
    const fov = await page.evaluate(async () => {
      const { RENDER_CONFIG, entityDisplayScale } = await import('/config/game.config.ts');
      return {
        tileWidth: RENDER_CONFIG.tileWidth,
        tileHeight: RENDER_CONFIG.tileHeight,
        entityScale: entityDisplayScale(),
      };
    });
    expect(fov.tileWidth).toBe(128);
    expect(fov.tileHeight).toBe(64);
    expect(fov.entityScale).toBeCloseTo(1.0, 5);
  });
});
