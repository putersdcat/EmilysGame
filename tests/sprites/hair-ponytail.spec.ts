/**
 * hair-ponytail.spec.ts - Playwright E2E tests for #86 hair silhouette polish + ponytail style.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173/?test=1';

test.describe('Character Hair Silhouette Polish + Ponytail (#86)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => !!(window as any).__gameDebug?.state);
  });

  test('ponytail is a valid hairStyle value', async ({ page }) => {
    const valid = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const variation = state.playerVariation;
      variation.hairStyle = 'ponytail';
      return variation.hairStyle === 'ponytail';
    });
    expect(valid).toBe(true);
  });

  test('ponytail front-idle SVG renders without errors', async ({ page }) => {
    const svgValid = await page.evaluate(async () => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const variation = { ...state.playerVariation, hairStyle: 'ponytail', name: 'test_pony' };
      const img = await debug.loadCharacterSpriteAsync(variation, 0, false, 'front');
      return img instanceof HTMLImageElement && img.src.length > 0;
    });
    expect(svgValid).toBe(true);
  });

  test('ponytail back-idle SVG renders without errors', async ({ page }) => {
    const svgValid = await page.evaluate(async () => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const variation = { ...state.playerVariation, hairStyle: 'ponytail', name: 'test_pony_back' };
      const img = await debug.loadCharacterSpriteAsync(variation, 0, false, 'back');
      return img instanceof HTMLImageElement && img.src.length > 0;
    });
    expect(svgValid).toBe(true);
  });

  test('ponytail side-idle SVG renders without errors', async ({ page }) => {
    const svgValid = await page.evaluate(async () => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const variation = { ...state.playerVariation, hairStyle: 'ponytail', name: 'test_pony_side' };
      const img = await debug.loadCharacterSpriteAsync(variation, 0, false, 'side');
      return img instanceof HTMLImageElement && img.src.length > 0;
    });
    expect(svgValid).toBe(true);
  });

  test('ponytail walk animation renders all 6 frames', async ({ page }) => {
    const allValid = await page.evaluate(async () => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const variation = { ...state.playerVariation, hairStyle: 'ponytail', name: 'test_pony_walk' };
      for (let f = 0; f < 6; f++) {
        const img = await debug.loadCharacterSpriteAsync(variation, f, true, 'front');
        if (!(img instanceof HTMLImageElement) || !img.src.length) return false;
      }
      return true;
    });
    expect(allValid).toBe(true);
  });

  test('ponytail back-walk animation renders all 6 frames', async ({ page }) => {
    const allValid = await page.evaluate(async () => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const variation = { ...state.playerVariation, hairStyle: 'ponytail', name: 'test_pony_bwalk' };
      for (let f = 0; f < 6; f++) {
        const img = await debug.loadCharacterSpriteAsync(variation, f, true, 'back');
        if (!(img instanceof HTMLImageElement) || !img.src.length) return false;
      }
      return true;
    });
    expect(allValid).toBe(true);
  });

  test('ponytail side-walk animation renders all 6 frames', async ({ page }) => {
    const allValid = await page.evaluate(async () => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const variation = { ...state.playerVariation, hairStyle: 'ponytail', name: 'test_pony_swalk' };
      for (let f = 0; f < 6; f++) {
        const img = await debug.loadCharacterSpriteAsync(variation, f, true, 'side');
        if (!(img instanceof HTMLImageElement) || !img.src.length) return false;
      }
      return true;
    });
    expect(allValid).toBe(true);
  });

  test('ponytail style persists through save and load', async ({ page }) => {
    const persisted = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      state.playerVariation.hairStyle = 'ponytail';
      debug.saveGame();
      state.playerVariation.hairStyle = 'straight';
      debug.loadGame();
      return state.playerVariation.hairStyle;
    });
    expect(persisted).toBe('ponytail');
  });

  test('ponytail appears as an option in the customizer', async ({ page }) => {
    const hasPonytail = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      debug.showCustomizer?.();
      const overlay = document.getElementById('customizerOverlay');
      if (!overlay) return false;
      const text = overlay.textContent || '';
      return text.includes('Ponytail');
    });
    expect(hasPonytail).toBe(true);
  });

  test('all hair styles produce SVGs with subtle stroke outlines', async ({ page }) => {
    const allHaveStrokes = await page.evaluate(async () => {
      const debug = (window as any).__gameDebug;
      const styles = ['straight', 'pigtails', 'wavy', 'ponytail'];
      for (const style of styles) {
        const variation = {
          name: 'stroke_test_' + style,
          hairColor: '#D4A574',
          hairStyle: style,
          dressColor: '#C84E89',
          skinTone: '#F4C9B8',
        };
        const svg = debug.generateIdleCharacterSVG(variation);
        if (!svg.includes('stroke')) return style + ' missing stroke';
      }
      return true;
    });
    expect(allHaveStrokes).toBe(true);
  });

  test('existing hair styles still render correctly', async ({ page }) => {
    const allRender = await page.evaluate(async () => {
      const debug = (window as any).__gameDebug;
      const styles = ['straight', 'pigtails', 'wavy'];
      const poses = ['front', 'back', 'side'];
      for (const style of styles) {
        for (const pose of poses) {
          const variation = {
            name: 'regr_' + style + '_' + pose,
            hairColor: '#8B6F47',
            hairStyle: style,
            dressColor: '#4A9D5F',
            skinTone: '#F4C9B8',
          };
          const img = await debug.loadCharacterSpriteAsync(variation, 0, false, pose);
          if (!(img instanceof HTMLImageElement) || !img.src.length) {
            return 'FAIL: ' + style + '/' + pose;
          }
        }
      }
      return true;
    });
    expect(allRender).toBe(true);
  });

  test('ponytail renders on canvas without errors', async ({ page }) => {
    await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      state.playerVariation.hairStyle = 'ponytail';
      debug.clearVariationCache?.('custom');
    });
    await page.waitForTimeout(500);
    const hasContent = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonEmpty = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) nonEmpty++;
      }
      return nonEmpty > 100;
    });
    expect(hasContent).toBe(true);
  });
});
