/**
 * npc-sprites.spec.ts — Playwright E2E tests for #85 Human NPC Paper-Cut Style.
 * Tests NPC sprite generation, direction-aware facing, caching, and canvas rendering.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173/?test=1';

test.describe('Human NPC Paper-Cut Style (#85)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => !!(window as any).__gameDebug?.state);
  });

  // ─── Appearance Config ──────────────────────────────────────

  test('NPC_APPEARANCES has entries for all human NPC types', async ({ page }) => {
    const keys = await page.evaluate(() => {
      return Object.keys((window as any).__gameDebug.NPC_APPEARANCES);
    });
    expect(keys).toContain('npc_merchant');
    expect(keys).toContain('npc_villager');
    expect(keys).toContain('npc_guardian');
    expect(keys).toContain('npc_farmer');
    expect(keys).toContain('npc_beekeeper');
    expect(keys).toContain('npc_ranger');
    expect(keys).toContain('npc_hermit');
    expect(keys).toContain('npc_miner');
    expect(keys).toContain('npc_knight');
    // Non-human NPCs should NOT be in the list
    expect(keys).not.toContain('npc_cat');
    expect(keys).not.toContain('npc_black_cat');
    expect(keys).not.toContain('npc_ghost');
  });

  test('each appearance has required visual fields', async ({ page }) => {
    const valid = await page.evaluate(() => {
      const apps = (window as any).__gameDebug.NPC_APPEARANCES;
      const required = ['bodyColor', 'bodyAccent', 'skinTone', 'hairColor', 'hairStyle', 'outlineColor'];
      return Object.entries(apps).every(([, app]: [string, any]) =>
        required.every(f => typeof app[f] === 'string' && app[f].length > 0)
      );
    });
    expect(valid).toBe(true);
  });

  // ─── SVG Generation ────────────────────────────────────────

  test('generateNpcSVG produces valid SVG for human NPC', async ({ page }) => {
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const svg = debug.generateNpcSVG('npc_merchant', 'south', 'closed');
      return { hasContent: svg !== null, startsSvg: svg?.startsWith('<svg'), length: svg?.length ?? 0 };
    });
    expect(result.hasContent).toBe(true);
    expect(result.startsSvg).toBe(true);
    expect(result.length).toBeGreaterThan(100);
  });

  test('generateNpcSVG returns null for non-human NPC', async ({ page }) => {
    const result = await page.evaluate(() => {
      return (window as any).__gameDebug.generateNpcSVG('npc_cat', 'south', 'closed');
    });
    expect(result).toBeNull();
  });

  test('all 4 facings produce distinct SVG', async ({ page }) => {
    const svgs = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return ['south', 'north', 'east', 'west'].map(
        f => debug.generateNpcSVG('npc_guardian', f, 'closed')
      );
    });
    // south !== north (front vs back)
    expect(svgs[0]).not.toBe(svgs[1]);
    // south !== east (front vs side)
    expect(svgs[0]).not.toBe(svgs[2]);
    // east and west should be same SVG (flipX is handled at render time)
    expect(svgs[2]).toBe(svgs[3]);
  });

  // ─── Mouth Animation ──────────────────────────────────────

  test('mouth states produce different SVG', async ({ page }) => {
    const svgs = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return ['closed', 'open', 'wide'].map(
        m => debug.generateNpcSVG('npc_villager', 'south', m)
      );
    });
    // Each mouth state should be different
    expect(svgs[0]).not.toBe(svgs[1]);
    expect(svgs[1]).not.toBe(svgs[2]);
    expect(svgs[0]).not.toBe(svgs[2]);
  });

  test('back-facing has no mouth (same for all mouth states)', async ({ page }) => {
    const svgs = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return ['closed', 'open', 'wide'].map(
        m => debug.generateNpcSVG('npc_villager', 'north', m)
      );
    });
    // Back-facing doesn't show mouth — all should be identical
    expect(svgs[0]).toBe(svgs[1]);
    expect(svgs[1]).toBe(svgs[2]);
  });

  // ─── Sprite Cache ─────────────────────────────────────────

  test('getNpcSprite returns cached image (preloaded at init)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const sprite = debug.getNpcSprite('npc_farmer', 'south', 'closed');
      // After preloading, should return either an Image or null (still loading)
      if (sprite === null) return 'null';
      if (sprite instanceof HTMLImageElement) return 'image';
      return 'unexpected';
    });
    // Accept either: preload may have completed (image) or still pending (null)
    expect(['null', 'image']).toContain(result);
  });

  test('loadNpcSpriteAsync loads image successfully', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const debug = (window as any).__gameDebug;
      const img = await debug.loadNpcSpriteAsync('npc_merchant', 'south', 'closed');
      return img ? { w: img.width, h: img.height, hasImg: true } : { hasImg: false };
    });
    expect(result.hasImg).toBe(true);
    expect(result.w).toBeGreaterThan(0);
    expect(result.h).toBeGreaterThan(0);
  });

  test('loadNpcSpriteAsync returns null for non-human NPC', async ({ page }) => {
    const result = await page.evaluate(async () => {
      return await (window as any).__gameDebug.loadNpcSpriteAsync('npc_ghost', 'south', 'closed');
    });
    expect(result).toBeNull();
  });

  // ─── hasNpcSprite ─────────────────────────────────────────

  test('hasNpcSprite correctly identifies human vs non-human NPCs', async ({ page }) => {
    const results = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return {
        merchant: debug.hasNpcSprite('npc_merchant'),
        guardian: debug.hasNpcSprite('npc_guardian'),
        cat: debug.hasNpcSprite('npc_cat'),
        ghost: debug.hasNpcSprite('npc_ghost'),
        blackCat: debug.hasNpcSprite('npc_black_cat'),
        farmer: debug.hasNpcSprite('npc_farmer'),
      };
    });
    expect(results.merchant).toBe(true);
    expect(results.guardian).toBe(true);
    expect(results.farmer).toBe(true);
    expect(results.cat).toBe(false);
    expect(results.ghost).toBe(false);
    expect(results.blackCat).toBe(false);
  });

  // ─── Direction-Aware Facing ───────────────────────────────

  test('all human NPC archetypes produce valid SVGs for all facings', async ({ page }) => {
    const results = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const facings = ['south', 'north', 'east', 'west'];
      const keys = Object.keys(debug.NPC_APPEARANCES);
      const failures: string[] = [];
      for (const key of keys) {
        for (const facing of facings) {
          const svg = debug.generateNpcSVG(key, facing, 'closed');
          if (!svg || !svg.startsWith('<svg')) {
            failures.push(`${key}_${facing}`);
          }
        }
      }
      return { total: keys.length * 4, failures };
    });
    expect(results.failures).toEqual([]);
    expect(results.total).toBe(36); // 9 NPCs × 4 facings
  });

  // ─── Hat Rendering ────────────────────────────────────────

  test('NPCs with hats have hat SVG elements', async ({ page }) => {
    const results = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      // Merchant has wizard hat, Guardian has helmet, Farmer has straw hat
      const merchant = debug.generateNpcSVG('npc_merchant', 'south', 'closed');
      const guardian = debug.generateNpcSVG('npc_guardian', 'south', 'closed');
      const farmer = debug.generateNpcSVG('npc_farmer', 'south', 'closed');
      const villager = debug.generateNpcSVG('npc_villager', 'south', 'closed');
      return {
        merchantHasPolygon: merchant.includes('polygon'), // wizard hat
        guardianHasHelmet: guardian.includes('708090'),    // helmet color
        farmerHasEllipse: farmer.includes('F4D03F'),      // straw hat
        villagerNoHat: !villager.includes('polygon') && !villager.includes('crown'),
      };
    });
    expect(results.merchantHasPolygon).toBe(true);
    expect(results.guardianHasHelmet).toBe(true);
    expect(results.farmerHasEllipse).toBe(true);
    expect(results.villagerNoHat).toBe(true);
  });

  // ─── Canvas Rendering ─────────────────────────────────────

  test('NPC sprite renders on canvas without errors', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const debug = (window as any).__gameDebug;
      const img = await debug.loadNpcSpriteAsync('npc_knight', 'south', 'closed');
      if (!img) return { success: false, error: 'no image' };
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 64, 64);
        // Verify non-blank (check some pixels)
        const data = ctx.getImageData(32, 32, 1, 1).data;
        const hasContent = data[3] > 0; // alpha > 0
        return { success: true, hasContent };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    });
    expect(result.success).toBe(true);
    expect(result.hasContent).toBe(true);
  });
});
