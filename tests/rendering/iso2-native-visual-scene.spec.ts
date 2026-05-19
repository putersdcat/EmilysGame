/**
 * iso2-native-visual-scene.spec.ts — controlled real-game visual scene for the native Iso 2.0 renderer migration.
 *
 * Stamps Iso2 structures, walls, water, bridge, fence, and varied terrain into the loaded game state,
 * invalidates renderer caches, and captures a screenshot for visual review.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('native Iso2 water/bridge/wall/fence controlled scene', async ({ page }) => {
  await waitForGame(page);
  await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk to be loaded');

    const setCell = (x: number, y: number, assetKey: string) => {
      const def = defs[assetKey];
      if (!def) throw new Error(`Missing asset ${assetKey}`);
      chunk.cells[y][x] = {
        assetKey,
        walkable: def.walkable,
        interactable: def.interactable,
      };
    };

    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) {
        setCell(x, y, 'grass');
      }
    }

    // Focused structure showcase: homestead and ruined cathedral close enough
    // to see in one native 256×128 Iso2 canvas viewport.
    debug.stampIso2Assembly('0,0', 'homestead-small', 10, 8);
    debug.stampIso2Assembly('0,0', 'ruined-cathedral', 15, 8);

    // Supporting feature-family checks near the same camera.
    for (let x = 9; x <= 16; x++) setCell(x, 15, 'wall');
    setCell(12, 15, 'door_locked');
    for (let x = 8; x <= 14; x++) setCell(x, 18, 'water');
    setCell(11, 18, 'bridge');
    setCell(14, 18, 'toll_gate');
    for (let x = 17; x <= 21; x++) setCell(x, 15, 'fence');

    state.player.x = 14.0;
    state.player.y = 10.0;
    state.camera.x = 14.0;
    state.camera.y = 10.0;
    state.ui.dialog.active = false;
    state.ui.dialog.currentLine = '';
    state.quiz.active = false;
    state.paused = false;
    debug.invalidateRenderCaches();
  });

  await page.waitForTimeout(1800);
  const canvas = page.locator('#gameContainer canvas');
  await expect(canvas).toBeVisible();
  await canvas.screenshot({ path: 'tests/screenshots/iso2-native-water-bridge-fence-wall.png' });
});
