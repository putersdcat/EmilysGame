/**
 * metadata-v2.spec.ts — Tests for MicroTileMeta v2 (#101)
 *
 * Covers: climate metadata, LOD tags, expanded anchor roles,
 * schema validation, biome palette mapping, and backward compatibility.
 *
 * Run: npx playwright test tests/metadata-v2.spec.ts --reporter=list
 * GitHub: #101
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

/** Helper: start the game, skip LLM, wait for canvas + gameDebug */
async function startGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) { /* ok */ } });
  await page.waitForTimeout(500);

  const canvas = page.locator('#gameContainer canvas');
  await expect(canvas).toBeAttached({ timeout: 8000 });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
  await page.waitForTimeout(1000);
  return canvas;
}

// ─── Shorthand accessors ────────────────────────────────────
const dbg = () => `(window as any).__gameDebug`;

// ─── Schema Validation Tests ────────────────────────────────

test.describe('MicroTileMeta v2 — Schema Validation', () => {

  test('all MICRO_TILE_DEFS have valid climate bands', async ({ page }) => {
    await startGame(page);
    const errors = await page.evaluate(() => (window as any).__gameDebug.validateAllTileDefs());
    expect(errors).toEqual([]);
  });

  test('all MICRO_TILE_DEFS have climate metadata defined', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() => {
      const defs = (window as any).__gameDebug.getTileConfig().MICRO_TILE_DEFS;
      const missing: string[] = [];
      for (const [key, def] of Object.entries(defs)) {
        if (!(def as any).climate) missing.push(key);
      }
      return { total: Object.keys(defs).length, missing };
    });
    expect(result.total).toBeGreaterThan(0);
    expect(result.missing).toEqual([]);
  });

  test('all MICRO_TILE_DEFS have LOD level defined', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() => {
      const defs = (window as any).__gameDebug.getTileConfig().MICRO_TILE_DEFS;
      const missing: string[] = [];
      for (const [key, def] of Object.entries(defs)) {
        if (!(def as any).lod) missing.push(key);
      }
      return { total: Object.keys(defs).length, missing };
    });
    expect(result.total).toBeGreaterThan(0);
    expect(result.missing).toEqual([]);
  });

  test('climate bands are valid (min <= max, 0-1 range)', async ({ page }) => {
    await startGame(page);
    const invalid = await page.evaluate(() => {
      const defs = (window as any).__gameDebug.getTileConfig().MICRO_TILE_DEFS;
      const inv: string[] = [];
      for (const [key, def] of Object.entries(defs)) {
        const c = (def as any).climate;
        if (c) {
          if (c.moisture[0] < 0 || c.moisture[1] > 1 || c.moisture[0] > c.moisture[1])
            inv.push(`${key}: moisture [${c.moisture}]`);
          if (c.temperature[0] < 0 || c.temperature[1] > 1 || c.temperature[0] > c.temperature[1])
            inv.push(`${key}: temperature [${c.temperature}]`);
        }
      }
      return inv;
    });
    expect(invalid).toEqual([]);
  });
});

// ─── Anchor Role Tests ──────────────────────────────────────

test.describe('MicroTileMeta v2 — Expanded Anchor Roles', () => {

  test('all 10 anchor roles are valid', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const roles = ['npc', 'item', 'decoration', 'feature', 'quest', 'merchant', 'waypoint', 'spawn', 'landmark', 'puzzle'];
      const valid = roles.filter(r => dbg.isValidAnchorRole(r));
      return { expected: roles.length, valid: valid.length, missing: roles.filter(r => !dbg.isValidAnchorRole(r)) };
    });
    expect(result.valid).toBe(result.expected);
    expect(result.missing).toEqual([]);
  });

  test('invalid anchor roles are rejected', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      return {
        bogus: dbg.isValidAnchorRole('bogus'),
        empty: dbg.isValidAnchorRole(''),
        enemy: dbg.isValidAnchorRole('enemy'),
      };
    });
    expect(result.bogus).toBe(false);
    expect(result.empty).toBe(false);
    expect(result.enemy).toBe(false);
  });

  test('existing templates validate cleanly', async ({ page }) => {
    await startGame(page);
    const errors = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const templates = dbg.getTileConfig().WORLD_UNIT_TEMPLATES;
      const allErrors: string[] = [];
      for (const tmpl of templates) {
        allErrors.push(...dbg.validateTemplate(tmpl));
      }
      return allErrors;
    });
    expect(errors).toEqual([]);
  });
});

// ─── Climate-Based Tile Selection Tests ──────────────────────

test.describe('MicroTileMeta v2 — Climate Tile Matching', () => {

  test('grass matches moderate climate', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() =>
      (window as any).__gameDebug.tileMatchesClimate('grass', 0.5, 0.5));
    expect(result).toBe(true);
  });

  test('water matches high-moisture climate', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() =>
      (window as any).__gameDebug.tileMatchesClimate('water', 0.9, 0.4));
    expect(result).toBe(true);
  });

  test('sand matches low-moisture high-temp climate', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() =>
      (window as any).__gameDebug.tileMatchesClimate('sand', 0.1, 0.8));
    expect(result).toBe(true);
  });

  test('tileMatchesClimate rejects out-of-range climate', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() =>
      (window as any).__gameDebug.tileMatchesClimate('water', 0.05, 0.5));
    expect(result).toBe(false);
  });
});

// ─── LOD Tests ──────────────────────────────────────────────

test.describe('MicroTileMeta v2 — LOD Tags', () => {

  test('getTileLOD returns valid LOD for known tiles', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      return {
        grass: dbg.getTileLOD('grass'),
        water: dbg.getTileLOD('water'),
        rock: dbg.getTileLOD('rock'),
      };
    });
    const validLODs = ['detail', 'standard', 'simplified', 'minimal'];
    expect(validLODs).toContain(result.grass);
    expect(validLODs).toContain(result.water);
    expect(validLODs).toContain(result.rock);
  });

  test('tilesAtLOD respects LOD hierarchy', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      return {
        detailCount: dbg.tilesAtLOD('detail').length,
        standardCount: dbg.tilesAtLOD('standard').length,
        minimalCount: dbg.tilesAtLOD('minimal').length,
      };
    });
    expect(result.minimalCount).toBeGreaterThanOrEqual(result.standardCount);
    expect(result.standardCount).toBeGreaterThanOrEqual(result.detailCount);
  });
});

// ─── Biome Palette Tests ────────────────────────────────────

test.describe('MicroTileMeta v2 — Biome Palette Mapping', () => {

  test('getBiomePalette returns palette for known biome/surface', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      return {
        meadowGrass: dbg.getBiomePalette('meadow', 'grass'),
        forestDirt: dbg.getBiomePalette('forest', 'dirt'),
      };
    });
    expect(result.meadowGrass).toBeTruthy();
    expect(result.meadowGrass.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(result.forestDirt).toBeTruthy();
    expect(result.forestDirt.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('getBiomePalette returns undefined for unknown biome', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() =>
      (window as any).__gameDebug.getBiomePalette('nonexistent', 'grass'));
    expect(result).toBeUndefined();
  });

  test('all BIOME_PALETTES entries have valid hex colors', async ({ page }) => {
    await startGame(page);
    const errors = await page.evaluate(() => {
      const palettes = (window as any).__gameDebug.getTileConfig().BIOME_PALETTES;
      const errs: string[] = [];
      const hexRe = /^#[0-9A-Fa-f]{6}$/;
      for (const [biome, surfaces] of Object.entries(palettes)) {
        for (const [surface, palette] of Object.entries(surfaces as any)) {
          const p = palette as any;
          if (!hexRe.test(p.primary)) errs.push(`${biome}.${surface}.primary: ${p.primary}`);
          if (!hexRe.test(p.secondary)) errs.push(`${biome}.${surface}.secondary: ${p.secondary}`);
          if (!hexRe.test(p.accent)) errs.push(`${biome}.${surface}.accent: ${p.accent}`);
        }
      }
      return errs;
    });
    expect(errors).toEqual([]);
  });
});

// ─── Chunk Climate Integration Tests ────────────────────────

test.describe('MicroTileMeta v2 — Chunk Climate', () => {

  test('generated chunks have climate data', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() => {
      const state = (window as any).__gameDebug.state;
      const climateData: { key: string; m: number; t: number }[] = [];
      state.chunks.forEach((chunk: any, key: string) => {
        if (chunk.climate) {
          climateData.push({ key, m: chunk.climate.moisture, t: chunk.climate.temperature });
        }
      });
      return { total: state.chunks.size, withClimate: climateData.length, samples: climateData.slice(0, 5) };
    });
    expect(result.total).toBeGreaterThan(0);
    expect(result.withClimate).toBe(result.total);
    for (const s of result.samples) {
      expect(s.m).toBeGreaterThanOrEqual(0);
      expect(s.m).toBeLessThanOrEqual(1);
      expect(s.t).toBeGreaterThanOrEqual(0);
      expect(s.t).toBeLessThanOrEqual(1);
    }
  });

  test('getChunkClimate is deterministic', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const c1 = dbg.getChunkClimate(0, 0);
      const c2 = dbg.getChunkClimate(0, 0);
      const c3 = dbg.getChunkClimate(5, -3);
      return {
        same: c1.moisture === c2.moisture && c1.temperature === c2.temperature,
        different: c1.moisture !== c3.moisture || c1.temperature !== c3.temperature,
      };
    });
    expect(result.same).toBe(true);
    expect(result.different).toBe(true);
  });
});

// ─── LOD Debug Overlay (runtime path) ───────────────────────

test.describe('MicroTileMeta v2 — LOD Debug Overlay', () => {

  test('F3 debug overlay triggers LOD consumption', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('F3');
    await page.waitForTimeout(500);

    const debugOn = await page.evaluate(() =>
      (window as any).__gameDebug.state.ui.showDebug);
    expect(debugOn).toBe(true);

    const lodValid = await page.evaluate(() => {
      const lod = (window as any).__gameDebug.getTileLOD('grass');
      return ['detail', 'standard', 'simplified', 'minimal'].includes(lod);
    });
    expect(lodValid).toBe(true);

    await page.waitForTimeout(300);
    await page.keyboard.press('F3');
  });

  test('climate data present in chunks for debug overlay', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('F3');
    await page.waitForTimeout(500);

    const hasClimate = await page.evaluate(() => {
      const state = (window as any).__gameDebug.state;
      let count = 0;
      state.chunks.forEach((chunk: any) => { if (chunk.climate) count++; });
      return count > 0;
    });
    expect(hasClimate).toBe(true);

    await page.keyboard.press('F3');
  });
});

// ─── Backward Compatibility Tests ───────────────────────────

test.describe('MicroTileMeta v2 — Backward Compatibility', () => {

  test('normalizeTileDef fills defaults for legacy tiles', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const legacy = {
        type: 'grass', walkable: true, edgeTag: 'open',
        edges: { n: 'open', s: 'open', e: 'open', w: 'open' },
        traversal: 'open', surface: 'grass', height: 0,
        connectable: false, decorationEligible: true,
        variationFamily: 'grass', variationIndex: 0,
        description: 'Test grass',
      };
      const normalized = dbg.normalizeTileDef(legacy);
      return {
        hasClimate: !!normalized.climate,
        hasLod: !!normalized.lod,
        climateMoisture: normalized.climate?.moisture,
        lod: normalized.lod,
      };
    });
    expect(result.hasClimate).toBe(true);
    expect(result.hasLod).toBe(true);
    expect(result.climateMoisture).toEqual([0, 1]);
    expect(result.lod).toBe('standard');
  });

  test('game runs without errors after metadata changes', async ({ page }) => {
    await startGame(page);
    const result = await page.evaluate(() => {
      const state = (window as any).__gameDebug.state;
      return {
        chunks: state.chunks.size,
        playerExists: !!state.player,
        hasPlayer: state.player.x !== undefined && state.player.y !== undefined,
      };
    });
    expect(result.chunks).toBeGreaterThan(0);
    expect(result.playerExists).toBe(true);
    expect(result.hasPlayer).toBe(true);
  });

  test('movement still works with climate-influenced terrain', async ({ page }) => {
    await startGame(page);
    const startPos = await page.evaluate(() => {
      const state = (window as any).__gameDebug.state;
      return { x: state.player.x, y: state.player.y };
    });

    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(300);

    const endPos = await page.evaluate(() => {
      const state = (window as any).__gameDebug.state;
      return { x: state.player.x, y: state.player.y };
    });

    expect(endPos.x).not.toBe(startPos.x);
  });
});
