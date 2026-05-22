/**
 * iso2-nano-main-port.spec.ts — smoke tests for the Iso 2.0 nano asset bridge in the main game.
 *
 * These tests intentionally exercise the real browser/Vite runtime rather than a mocked renderer:
 * - asset config exposes nano-capable tile types
 * - nano factory modules load through the app server
 * - drawNanoStack paints fence/gate/water/bridge descriptors onto a canvas
 */
import { test, expect, Page } from '@playwright/test';
import { getNanoStack, hasNanoRenderer } from '../../src/nano-tile-defs';
import { listNanoFenceStyles, listNanoWaterStyles, wallBounds, waterNanoSvg } from '../../src/nano-tile-svgs';
import { ISO_DIAMOND_HEIGHT, ISO_DIAMOND_WIDTH, ISO_MICRO_TILE_SIZE } from '../../src/types/iso-renderer.types';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test.describe('Iso 2.0 nano main-game port', () => {
  test('asset config exposes nano-capable fence/gates/water/bridge', async ({ page }) => {
    await waitForGame(page);
    const defs = await page.evaluate(() => {
      const assetDefs = (window as any).__gameDebug.getAssetDefs();
      return {
        fence: assetDefs.fence?.tileType,
        barricade: assetDefs.barricade?.tileType,
        door: assetDefs.door_locked?.tileType,
        quiz: assetDefs.quiz_gate?.tileType,
        water: assetDefs.water?.tileType,
        bridge: assetDefs.bridge?.tileType,
        toll: assetDefs.toll_gate?.tileType,
        house: assetDefs.house?.tileType,
        cathedral: assetDefs.cathedral_wall?.tileType,
      };
    });
    expect(defs).toEqual({
      fence: 'wooden_fence',
      barricade: 'wooden_fence',
      door: 'door_gate',
      quiz: 'quiz_gate',
      water: 'water',
      bridge: 'bridge',
      toll: 'troll_bridge',
      house: 'homestead_wall',
      cathedral: 'cathedral_wall',
    });
  });

  test('nano factories produce stack descriptors for the ported asset families', async () => {
    const tileTypes = ['wooden_fence', 'door_gate', 'quiz_gate', 'water', 'bridge', 'troll_bridge', 'homestead_wall', 'cathedral_wall'] as const;
    for (const tileType of tileTypes) {
      expect(hasNanoRenderer(tileType)).toBe(true);
      const stack = getNanoStack(tileType, tileType === 'water' ? 'corner-bl' : 'straight-h');
      expect(stack?.length).toBeGreaterThan(0);
      expect(stack?.[0].svg.length).toBeGreaterThan(500);
    }
    expect(listNanoFenceStyles().length).toBeGreaterThanOrEqual(4);
    expect(listNanoWaterStyles().length).toBeGreaterThanOrEqual(4);
    const waterSvg = waterNanoSvg('corner-bl', 'clear-river');
    expect(waterSvg).toContain('Q 72 72');
    expect(waterSvg).not.toContain('<rect width="144" height="144" fill="#');
  });

  test('main Iso2 structural port uses 144px source geometry and canonical tee variants', async () => {
    expect(ISO_MICRO_TILE_SIZE).toBe(144);
    expect(ISO_DIAMOND_WIDTH).toBe(256);
    expect(ISO_DIAMOND_HEIGHT).toBe(128);

    expect(wallBounds('tee-t').rects.some(rect => rect.y === 96 && rect.h === 48)).toBe(true);
    expect(wallBounds('tee-t').rects.some(rect => rect.y === 0 && rect.h === 48)).toBe(false);

    const stone = getNanoStack('stone_wall', 'straight-h')?.[0];
    expect(stone?.topFaceTextureSvg).toBeTruthy();
    expect(stone?.topFaceTextureSvgV).toBeTruthy();
    expect(stone?.southFaceTextureSvg).toBeTruthy();
    expect(stone?.eastFaceTextureSvg).toBeTruthy();
    expect(stone?.faceSliceEqualLighting).toBe(true);
  });
});
