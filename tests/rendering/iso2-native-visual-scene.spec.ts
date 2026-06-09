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

    // Compact, intentional Iso2 showcase. Keep the camera centered on a
    // coherent compound instead of mixing whole assemblies with loose feature
    // runs; the screenshot should answer "does this render as a structure?".

    // Stone wall corner / room shell on the right.
    for (let x = 14; x <= 18; x++) setCell(x, 8, 'wall');
    for (let y = 9; y <= 12; y++) setCell(18, y, 'wall');
    for (let x = 14; x <= 18; x++) setCell(x, 12, 'wall');
    setCell(16, 12, 'door_locked');

    // Connected fence yard on the left with a single gate on the south edge.
    for (let x = 8; x <= 12; x++) {
      setCell(x, 8, 'fence');
      setCell(x, 12, x === 10 ? 'quiz_gate' : 'fence');
    }
    for (let y = 9; y <= 11; y++) {
      setCell(8, y, 'fence');
      setCell(12, y, 'fence');
    }

    // River crossing through the center so the negative-Z channel and arched
    // bridge are visible in the same viewport.
    for (let x = 8; x <= 18; x++) setCell(x, 15, 'water');
    setCell(13, 15, 'bridge');

    // Small structural material samples, away from the interaction radius.
    setCell(9, 6, 'house');
    setCell(19, 7, 'cathedral_wall');

    state.player.x = 11.0;
    state.player.y = 10.0;
    state.camera.x = 13.0;
    state.camera.y = 11.0;
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
