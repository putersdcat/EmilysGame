/**
 * play-stack-motor-recovery.spec.ts — PR4 Layer 3 constrained recovery.
 *
 * Proves:
 *  - stuck-no-tunnel: hold into cottage wall; floor(player) never enters interior
 *  - no-noclip-water: 8-dir into river; four corners never on water after commit
 *  - embed-recovery: place in cottage → one recovery → legal, never water
 *
 * @see memories/repo/design-play-stack-first-principles-2026-07-19.md (PR4)
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test.describe('Play-stack motor recovery (PR4 L3)', () => {
  test('stuck-no-tunnel: hold into starter_cottage wall never enters interior', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const defs = debug.getAssetDefs();
      const chunk = state.chunks.get('0,0');
      if (!chunk) throw new Error('Expected origin chunk');

      const setCell = (x: number, y: number, assetKey: string) => {
        const def = defs[assetKey];
        chunk.cells[y][x] = {
          assetKey,
          walkable: def.walkable,
          interactable: def.interactable ?? false,
        };
      };

      // Open grass field with a solid cottage block at (14,12)
      for (let y = 8; y < 18; y++) {
        for (let x = 8; x < 18; x++) setCell(x, y, 'grass');
      }
      setCell(14, 12, 'starter_cottage');

      // Stand west of cottage, push east into solid for > STUCK_MS
      debug.resetPlayerMotor();
      debug.setPlayerPosition(13.2, 12.5);
      const startX = state.player.x;
      const startY = state.player.y;
      const consts = debug.motorConstants;
      const interiorCells: string[] = [];

      // ~2s of integrate holding pure +x into the wall
      const frameMs = 16.67;
      const frames = Math.ceil(2000 / frameMs);
      for (let i = 0; i < frames; i++) {
        debug.integrateMovementFrame({ dx: 1, dy: 0 }, frameMs, 1);
        const cx = Math.floor(state.player.x);
        const cy = Math.floor(state.player.y);
        if (cx === 14 && cy === 12) {
          interiorCells.push(`${state.player.x},${state.player.y}`);
        }
        if (!debug.isFootprintWalkable(state.player.x, state.player.y)) {
          return {
            ok: false,
            reason: 'illegal footprint after integrate',
            x: state.player.x,
            y: state.player.y,
            interiorHits: interiorCells.length,
          };
        }
      }

      const maxDelta =
        Math.abs(state.player.x - startX) + Math.abs(state.player.y - startY);
      const nudgeCap = consts.NUDGE_EPS * consts.NUDGE_MAX_ATTEMPTS + 0.5; // +slide room

      return {
        ok: true,
        x: state.player.x,
        y: state.player.y,
        startX,
        startY,
        maxDelta,
        nudgeCap,
        interiorHits: interiorCells.length,
        walkable: debug.isFootprintWalkable(state.player.x, state.player.y),
        cellWalkable: chunk.cells[12][14].walkable,
      };
    });

    expect(result.cellWalkable, 'cottage must stamp non-walkable').toBe(false);
    expect(result.ok, result.reason ?? 'integrate stayed legal').toBe(true);
    expect(result.interiorHits, 'floor(player) must never enter cottage cell').toBe(0);
    expect(result.walkable).toBe(true);
    // May slide slightly on grass but must not tunnel far through solid
    expect(result.maxDelta!, `Δpos ${result.maxDelta} should stay bounded`).toBeLessThan(2);
  });

  test('no-noclip-water: cannot enter water cell via integrate (8 dirs)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const defs = debug.getAssetDefs();
      const chunk = state.chunks.get('0,0');
      if (!chunk) throw new Error('Expected origin chunk');

      const setCell = (x: number, y: number, assetKey: string) => {
        const def = defs[assetKey];
        chunk.cells[y][x] = {
          assetKey,
          walkable: def.walkable,
          interactable: def.interactable ?? false,
        };
      };

      for (let y = 8; y < 18; y++) {
        for (let x = 8; x < 18; x++) setCell(x, y, 'grass');
      }
      // Water pool center (13,13)
      for (let y = 12; y <= 14; y++) {
        for (let x = 12; x <= 14; x++) setCell(x, y, 'water');
      }

      const dirs = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1],
      ];
      const violations: string[] = [];
      const frameMs = 16.67;
      const frames = Math.ceil(2000 / frameMs);

      for (const [dx, dy] of dirs) {
        debug.resetPlayerMotor();
        // Start on grass adjacent to pool, push into water for 2s
        debug.setPlayerPosition(11.5, 13.5);
        const len = Math.hypot(dx, dy);
        const mv = { dx: dx / len, dy: dy / len };
        for (let i = 0; i < frames; i++) {
          debug.integrateMovementFrame(mv, frameMs, 1);
          if (!debug.isFootprintWalkable(state.player.x, state.player.y)) {
            violations.push(`illegal@${state.player.x},${state.player.y} dir=${dx},${dy}`);
            break;
          }
          // Any sample cell under footprint center on water counts as river slash
          const gx = Math.floor(state.player.x);
          const gy = Math.floor(state.player.y);
          if (chunk.cells[gy]?.[gx]?.assetKey === 'water') {
            violations.push(`center-on-water@${gx},${gy} dir=${dx},${dy}`);
            break;
          }
        }
      }

      return {
        violations,
        waterWalkable: chunk.cells[13][13].walkable as boolean,
      };
    });

    expect(result.waterWalkable).toBe(false);
    expect(result.violations, `water noclip violations: ${result.violations.join('; ')}`).toEqual([]);
  });

  test('embed recovery: cottage embed → ≤1 recovery → legal, never water', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const defs = debug.getAssetDefs();
      const chunk = state.chunks.get('0,0');
      if (!chunk) throw new Error('Expected origin chunk');

      const setCell = (x: number, y: number, assetKey: string) => {
        const def = defs[assetKey];
        chunk.cells[y][x] = {
          assetKey,
          walkable: def.walkable,
          interactable: def.interactable ?? false,
        };
      };

      // Clear area + solid cottage at (14,12); grass around for R-ladder
      for (let y = 8; y < 18; y++) {
        for (let x = 8; x < 18; x++) setCell(x, y, 'grass');
      }
      setCell(14, 12, 'starter_cottage');
      // Water far away — must not land here
      setCell(17, 17, 'water');

      debug.resetPlayerMotor();
      debug.setPlayerPosition(14.5, 12.5);
      const beforeWalkable = debug.isFootprintWalkable(14.5, 12.5);
      const embed = debug.resolveEmbedIfNeeded();
      const afterWalkable = debug.isFootprintWalkable(state.player.x, state.player.y);
      const gx = Math.floor(state.player.x);
      const gy = Math.floor(state.player.y);
      const asset = chunk.cells[gy]?.[gx]?.assetKey;
      const onWater = asset === 'water' || asset === 'river';

      return {
        beforeWalkable,
        embed,
        afterWalkable,
        x: state.player.x,
        y: state.player.y,
        gx,
        gy,
        asset,
        onWater,
        spawnEscape: state.player.spawnEscape,
      };
    });

    expect(result.beforeWalkable, 'sanity: cottage center non-walkable').toBe(false);
    expect(result.embed, 'one recovery call must teleport or already-legal').toBe('teleported');
    expect(result.afterWalkable, 'footprint legal after recovery').toBe(true);
    expect(result.onWater, 'must never recover onto water').toBe(false);
    expect(result.spawnEscape, 'spawnEscape cleared after legal teleport').toBeFalsy();
    expect(result.gx === 14 && result.gy === 12, 'must leave cottage cell').toBe(false);
  });

  test('motor constants match design Appendix C', async ({ page }) => {
    await waitForGame(page);
    const c = await page.evaluate(() => (window as any).__gameDebug.motorConstants);
    expect(c.STUCK_MS).toBe(450);
    expect(c.NUDGE_EPS).toBe(0.08);
    expect(c.NUDGE_MAX_ATTEMPTS).toBe(8);
    expect(c.EMBED_R_LADDER).toEqual([2, 4, 8]);
  });
});
