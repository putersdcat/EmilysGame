/**
 * draw-gate-priority.spec.ts — Place coherence P5: functional gates beat decor
 * under maxDrawCmds pressure. FOV remains 128×64 (no change).
 *
 * Covers:
 *   - Pure slot-priority contract (selectWithinDrawBudget)
 *   - Homestead stamp + pure budget selection (sim membership, not paint)
 *   - Live two-pass wiring: tiny maxDrawCmds still emits gates (getDrawPriorityStats)
 *   - FOV lock
 *
 * Run: npx playwright test tests/rendering/draw-gate-priority --reporter=line
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

/** Full boot: need live renderer + origin chunk for two-pass stats. */
async function waitForLiveGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const d = (window as any).__gameDebug;
      const chunks = d?.state?.chunks;
      return !!(chunks && typeof chunks.get === 'function' && chunks.get('0,0'));
    },
    { timeout: 20000 },
  );
  // Let a few frames settle after state init
  await page.waitForTimeout(600);
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

      // Pure helper: maxSlots = cell slots (not live jsPool cmds — see draw-priority.ts)
      const maxSlots = 5;
      const selected = selectWithinDrawBudget(candidates, maxSlots);
      const selectedKeys = selected.map((c) => c.assetKey);

      const ordered = prioritizeObjectCellsForDrawBudget(candidates);
      const firstThree = ordered.slice(0, 3).map((c) => c.assetKey);

      // Without priority, naive slice would take first 5 trees/fences and drop gates
      const naive = candidates.slice(0, maxSlots).map((c) => c.assetKey);
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

    // Slot budget of 5: all three gates fit first, then 2 decor
    expect(result.selectedLen).toBe(5);
    expect(result.selectedGates.sort()).toEqual(['door_locked', 'quiz_gate', 'toll_gate'].sort());
    expect(result.firstThree.sort()).toEqual(['door_locked', 'quiz_gate', 'toll_gate'].sort());
    expect(result.naiveHasGate, 'naive order would drop late gates').toBe(false);
    expect(result.selectedKeys.slice(0, 3).every((k) =>
      ['quiz_gate', 'door_locked', 'door_open', 'door_gate', 'toll_gate'].includes(k),
    )).toBe(true);
  });

  test('homestead stamp: south quiz_gate survives pure slot budget under flooded decor', async ({
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
    expect(result.hasGateInBudget, 'slot budget prefers gate over flooded decor').toBe(true);
    expect(result.gateInSelected, 'south quiz_gate survives maxSlots=8').toBe(true);
  });

  test('live two-pass: tiny maxDrawCmds still emits gates near homestead', async ({ page }) => {
    /**
     * Regression lock for render.ts wiring: pure helpers alone cannot catch a
     * revert that drops the gates-first two-pass. Drive the live renderer with
     * a temporary maxDrawCmds cap and assert getDrawPriorityStats.
     */
    await waitForLiveGame(page);

    const result = await page.evaluate(async () => {
      const { RENDER_CONFIG, WORLD_CONFIG } = await import('/config/game.config.ts');
      const { getDrawPriorityStats } = await import('/rendering/draw-priority.ts');
      const { HOMESTEAD_SOUTH_GATE_ABS } = await import('/engine/world/PlaceCoherence.ts');
      const d = (window as any).__gameDebug;
      if (!d?.state) return { ok: false as const, reason: 'no __gameDebug.state' };

      // Snap player + camera next to south quiz_gate so it is on-screen
      const gx = HOMESTEAD_SOUTH_GATE_ABS.x + 0.5;
      const gy = HOMESTEAD_SOUTH_GATE_ABS.y - 1.0;
      d.setPlayerPosition(gx, gy);
      d.state.camera.x = gx;
      d.state.camera.y = gy;

      // Confirm sim still has the gate cell (P6 stamp)
      const size = WORLD_CONFIG.chunkSize;
      const cx = Math.floor(HOMESTEAD_SOUTH_GATE_ABS.x / size);
      const cy = Math.floor(HOMESTEAD_SOUTH_GATE_ABS.y / size);
      const chunk = d.state.chunks.get(`${cx},${cy}`);
      const lx = HOMESTEAD_SOUTH_GATE_ABS.x - cx * size;
      const ly = HOMESTEAD_SOUTH_GATE_ABS.y - cy * size;
      const gateKey = chunk?.cells?.[ly]?.[lx]?.assetKey ?? null;

      const prevBudget = RENDER_CONFIG.maxDrawCmds;

      function waitFrames(n: number): Promise<void> {
        return new Promise((resolve) => {
          let left = n;
          const step = () => {
            left--;
            if (left <= 0) resolve();
            else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
      }

      try {
        // Extreme cmd pressure: only 1 object cmd — two-pass must pick a gate
        RENDER_CONFIG.maxDrawCmds = 1;
        await waitFrames(8);
        const tight = {
          gatesEmitted: getDrawPriorityStats().gatesEmitted,
          decorEmitted: getDrawPriorityStats().decorEmitted,
          budgetCapped: getDrawPriorityStats().budgetCapped,
        };

        // Mild pressure: a few cmds — gates still first, may include some decor
        RENDER_CONFIG.maxDrawCmds = 12;
        await waitFrames(6);
        const mild = {
          gatesEmitted: getDrawPriorityStats().gatesEmitted,
          decorEmitted: getDrawPriorityStats().decorEmitted,
          budgetCapped: getDrawPriorityStats().budgetCapped,
        };

        // Restore and sample normal frame (gates still counted when on-screen)
        RENDER_CONFIG.maxDrawCmds = prevBudget;
        await waitFrames(4);
        const normal = {
          gatesEmitted: getDrawPriorityStats().gatesEmitted,
          decorEmitted: getDrawPriorityStats().decorEmitted,
          budgetCapped: getDrawPriorityStats().budgetCapped,
        };

        return {
          ok: true as const,
          gateKey,
          prevBudget,
          fov: { tileWidth: RENDER_CONFIG.tileWidth, tileHeight: RENDER_CONFIG.tileHeight },
          tight,
          mild,
          normal,
        };
      } finally {
        RENDER_CONFIG.maxDrawCmds = prevBudget;
      }
    });

    expect(result.ok, result.ok ? '' : (result as { reason?: string }).reason).toBe(true);
    if (!result.ok) return;

    expect(result.gateKey, 'homestead south still quiz_gate in live world').toBe('quiz_gate');
    expect(result.fov.tileWidth).toBe(128);
    expect(result.fov.tileHeight).toBe(64);
    expect(result.prevBudget, 'default maxDrawCmds restored after probe').toBe(400);

    // maxDrawCmds=1: two-pass must still emit ≥1 gate; decor yields entirely
    expect(result.tight.gatesEmitted, 'live path emits gate under maxDrawCmds=1').toBeGreaterThanOrEqual(1);
    expect(result.tight.decorEmitted, 'decor yields when only 1 cmd slot').toBe(0);
    expect(result.tight.budgetCapped, 'tiny budget marks capped').toBe(true);

    // Mild budget still paints gates
    expect(result.mild.gatesEmitted, 'gates still emitted at maxDrawCmds=12').toBeGreaterThanOrEqual(1);

    // Normal budget: gate still on-screen near player
    expect(result.normal.gatesEmitted, 'normal frame still counts on-screen gates').toBeGreaterThanOrEqual(1);
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
