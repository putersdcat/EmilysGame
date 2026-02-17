/**
 * sprite-limb-layering.spec.ts — E2E tests for sprite limb layering (#182).
 * Verifies that arms/legs render in correct depth order (back limbs behind body,
 * front limbs in front) across all facing poses and during direction flips.
 * TODO: DOC - sprite layering test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  const skipBtn = page.locator('#btnSkipLlm');
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
  }

  await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1000);
  const hasState = await page.evaluate(() => !!(window as any).__gameState);
  expect(hasState).toBe(true);
}

test.describe('Sprite Limb Layering (#182)', () => {

  test('side-facing idle SVG has back arm before body and front arm after', async ({ page }) => {
    await waitForGame(page);

    // Generate a side-facing idle sprite SVG and check element ordering
    const ordering = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = (window as any).__gameState;
      if (!debug?.generateSideIdleCharacterSVG || !state?.playerVariation) return null;

      const svg = debug.generateSideIdleCharacterSVG(state.playerVariation);

      // Verify back arm appears BEFORE body rect, front arm AFTER in SVG source
      const backArmIdx = svg.indexOf('Back arm');
      const bodyIdx = svg.indexOf('Body - Dress');
      const frontArmIdx = svg.indexOf('Front arm');

      return {
        backArmBeforeBody: backArmIdx !== -1 && bodyIdx !== -1 && backArmIdx < bodyIdx,
        frontArmAfterBody: frontArmIdx !== -1 && bodyIdx !== -1 && frontArmIdx > bodyIdx,
        allPresent: backArmIdx !== -1 && bodyIdx !== -1 && frontArmIdx !== -1,
      };
    });

    expect(ordering).toBeTruthy();
    expect(ordering!.allPresent).toBe(true);
    expect(ordering!.backArmBeforeBody).toBe(true);
    expect(ordering!.frontArmAfterBody).toBe(true);
  });

  test('sprite facing updates correctly when moving right then left', async ({ page }) => {
    await waitForGame(page);

    // Move right to set facing
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(200);

    const rightState = await page.evaluate(() => {
      const state = (window as any).__gameState;
      if (!state?.player) return null;
      return {
        direction: state.player.direction,
        facingPose: state.player.facingPose,
      };
    });

    expect(rightState).toBeTruthy();
    expect(rightState!.direction).toBe(1); // facing right
    expect(rightState!.facingPose).toBe('side');

    // Now move left to flip
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(200);

    const leftState = await page.evaluate(() => {
      const state = (window as any).__gameState;
      if (!state?.player) return null;
      return {
        direction: state.player.direction,
        facingPose: state.player.facingPose,
      };
    });

    expect(leftState).toBeTruthy();
    expect(leftState!.direction).toBe(-1); // facing left
    expect(leftState!.facingPose).toBe('side');
  });

  test('sprite cache populates for all used poses', async ({ page }) => {
    await waitForGame(page);

    // Walk in all 4 directions to trigger sprite generation for each pose
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    for (const key of keys) {
      await page.keyboard.down(key);
      await page.waitForTimeout(400);
      await page.keyboard.up(key);
      await page.waitForTimeout(100);
    }

    const cacheState = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const cache = debug?.spriteCache;
      if (!cache) return null;

      const keys = Array.from(cache.keys()) as string[];
      return {
        cacheSize: keys.length,
        hasSide: keys.some((k: string) => k.includes('_side')),
        hasFront: keys.some((k: string) => k.includes('_front')),
        hasBack: keys.some((k: string) => k.includes('_back')),
        hasWalk: keys.some((k: string) => k.includes('_walk')),
        hasIdle: keys.some((k: string) => k.includes('_idle')),
      };
    });

    expect(cacheState).toBeTruthy();
    expect(cacheState!.cacheSize).toBeGreaterThan(0);
    expect(cacheState!.hasSide).toBe(true);
    expect(cacheState!.hasFront).toBe(true);
    expect(cacheState!.hasBack).toBe(true);
  });

  test('side-facing walking SVG has correct limb layering for all frames', async ({ page }) => {
    await waitForGame(page);

    const layering = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = (window as any).__gameState;
      if (!debug?.generateSideWalkingCharacterSVG || !state?.playerVariation) return null;

      const results: { frame: number; backArmBeforeBody: boolean; frontArmAfterBody: boolean }[] = [];

      // Check all 6 animation frames
      for (let frame = 0; frame < 6; frame++) {
        const svg = debug.generateSideWalkingCharacterSVG(state.playerVariation, frame);
        const backArmIdx = svg.indexOf('Back arm');
        const bodyIdx = svg.indexOf('Body - Dress');
        const frontArmIdx = svg.indexOf('Front arm');

        results.push({
          frame,
          backArmBeforeBody: backArmIdx !== -1 && bodyIdx !== -1 && backArmIdx < bodyIdx,
          frontArmAfterBody: frontArmIdx !== -1 && bodyIdx !== -1 && frontArmIdx > bodyIdx,
        });
      }

      return results;
    });

    expect(layering).toBeTruthy();
    expect(layering!.length).toBe(6);

    for (const frame of layering!) {
      expect(frame.backArmBeforeBody).toBe(true);
      expect(frame.frontArmAfterBody).toBe(true);
    }
  });

  test('direction flip does not cause visual glitch (screenshot comparison)', async ({ page }) => {
    await waitForGame(page);

    // Walk right for a moment
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(300);

    // Take screenshot facing right
    const screenshotRight = await page.screenshot({ fullPage: false });
    expect(screenshotRight.byteLength).toBeGreaterThan(0);

    // Walk left for a moment
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(300);

    // Take screenshot facing left
    const screenshotLeft = await page.screenshot({ fullPage: false });
    expect(screenshotLeft.byteLength).toBeGreaterThan(0);

    // Both screenshots should be valid (non-zero different sizes = game is rendering)
    // This is a smoke test — detailed visual regression would use toMatchSnapshot
    expect(screenshotRight).not.toEqual(screenshotLeft);
  });

  test('all facing transitions produce valid sprite state', async ({ page }) => {
    await waitForGame(page);

    // Test all 4 directions to trigger facing transitions
    const directions = [
      { key: 'ArrowRight', expectedPose: 'side', expectedDir: 1 },
      { key: 'ArrowDown', expectedPose: 'front', expectedDir: 1 },
      { key: 'ArrowLeft', expectedPose: 'side', expectedDir: -1 },
      { key: 'ArrowUp', expectedPose: 'back', expectedDir: -1 },
    ];

    for (const { key, expectedPose, expectedDir } of directions) {
      await page.keyboard.down(key);
      await page.waitForTimeout(400);
      await page.keyboard.up(key);
      await page.waitForTimeout(200);

      const state = await page.evaluate(() => {
        const s = (window as any).__gameState;
        if (!s?.player) return null;
        return {
          facingPose: s.player.facingPose,
          direction: s.player.direction,
          hasImg: !!s.egoImg,
        };
      });

      expect(state).toBeTruthy();
      expect(state!.facingPose).toBe(expectedPose);
      expect(state!.direction).toBe(expectedDir);
      expect(state!.hasImg).toBe(true);
    }
  });
});
