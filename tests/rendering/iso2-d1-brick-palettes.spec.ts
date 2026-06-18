/**
 * iso2-d1-brick-palettes.spec.ts — D.1 brick palette port proof (issue #275).
 *
 * Renders three horizontal stone-wall runs using RedClinker, MudBrick, and
 * SandstoneBrick face-slice materials (ported from experiment textures/).
 *
 * @see .github/instructions/iso2-main-port.instructions.md
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT = 'tests/screenshots/iso2-d1-brick-palettes.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('D.1: red clinker / mud / sandstone brick wall palettes render (refs #275)', async ({ page }) => {
  await waitForGame(page);

  await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk');

    const wallBase = defs.wall;
    if (!wallBase) throw new Error('Missing wall asset def');

    const setCell = (x: number, y: number, assetKey: string) => {
      const def = defs[assetKey];
      if (!def) throw new Error(`Missing asset ${assetKey}`);
      chunk.cells[y][x] = {
        assetKey,
        walkable: def.walkable,
        interactable: def.interactable,
      };
    };

    // Runtime test defs — tileType routes to ported brick palette nanos.
    defs.wall_red_clinker = {
      ...wallBase,
      description: 'Red clinker test wall',
      tileType: 'stone_wall_red_clinker',
    };
    defs.wall_mud_brick = {
      ...wallBase,
      description: 'Mud brick test wall',
      tileType: 'stone_wall_mud_brick',
    };
    defs.wall_sandstone = {
      ...wallBase,
      description: 'Sandstone brick test wall',
      tileType: 'stone_wall_sandstone',
    };

    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) {
        setCell(x, y, 'grass');
      }
    }

    const cx = 12;
    const rows = [
      { y: 10, key: 'wall_red_clinker' },
      { y: 12, key: 'wall_mud_brick' },
      { y: 14, key: 'wall_sandstone' },
    ] as const;

    for (const row of rows) {
      for (let x = cx - 4; x <= cx + 4; x++) {
        setCell(x, row.y, row.key);
      }
    }

    state.camera.x = cx;
    state.camera.y = 12;
    state.player.x = cx + 0.5;
    state.player.y = 14.5;
    state.ui.dialog.active = false;
    state.quiz.active = false;
    state.paused = false;
    debug.invalidateRenderCaches();
  });

  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT, fullPage: false });

  const svgOk = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const mats = debug.iso2BrickMaterials;
    if (!mats) return false;
    const red = mats.RedClinker.svg();
    const mud = mats.MudBrick.svg();
    const sand = mats.SandstoneBrick.svg();
    return red.includes('rgb(') && mud.includes('rgb(') && sand.includes('rgb(')
      && red.includes('144') && mud.includes('144') && sand.includes('144');
  });

  expect(svgOk).toBe(true);
});