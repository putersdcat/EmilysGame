/**
 * iso2-d8-biome-transitions.spec.ts — D.8 continuous biome transition proof.
 *
 * Builds a grass→mud(dirt)→sand→stone_floor patch and captures the main
 * terrain-cache output. The D.8 overlay pass adds moisture/elevation-noise
 * transition washes on top of the existing local edge feathering.
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT = 'tests/screenshots/iso2-d8-biome-transitions.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('D.8: grass→mud→sand→stone transition ladder renders smoothly (refs #275)', async ({ page }) => {
  await waitForGame(page);

  await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk');

    const setCell = (x: number, y: number, assetKey: string) => {
      const def = defs[assetKey];
      if (!def) throw new Error(`Missing asset ${assetKey}`);
      chunk.cells[y][x] = {
        assetKey,
        walkable: def.walkable,
        interactable: def.interactable,
      };
    };

    // Warm/dry-ish climate lets the new D.8 sampler visibly exercise mud,
    // sand, and high-stone overlays while still using deterministic noise.
    chunk.climate = { moisture: 0.46, temperature: 0.72 };
    chunk.biomeTransitions = { n: true, s: true, e: true, w: true };

    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) {
        let key = 'grass';
        const diagonal = y + Math.floor((x - 12) * 0.35);
        if (diagonal >= 8 && diagonal < 12) key = 'dirt';
        else if (diagonal >= 12 && diagonal < 16) key = 'sand';
        else if (diagonal >= 16) key = 'stone_floor';
        setCell(x, y, key);
      }
    }

    state.camera.x = 12;
    state.camera.y = 12;
    state.player.x = 12.5;
    state.player.y = 18.5;
    state.player.sinkDepth = 0;
    state.ui.dialog.active = false;
    state.quiz.active = false;
    state.paused = false;
    debug.invalidateRenderCaches();
  });

  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT, fullPage: false });

  const details = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const rules = debug.getBiomeTransitionRules?.();
    if (!Array.isArray(rules) || rules.length < 4) return { ok: false, ruleSurfaces: [], sampleSurfaces: [] };
    const surfaces = new Set(rules.map((r: any) => r.surface));
    const samples = new Set<string>();
    const currents = ['grass', 'dirt', 'sand', 'stone_floor'] as const;
    for (const current of currents) {
      for (let i = 0; i < 96; i++) {
        const sample = debug.sampleBiomeTransition?.(
          30 + i * 2,
          12 + i,
          { moisture: 0.46, temperature: 0.72 },
          current,
        );
        if (sample?.surface && sample.alpha > 0.02) samples.add(sample.surface);
      }
    }
    const ok = surfaces.has('grass')
      && surfaces.has('dirt')
      && surfaces.has('sand')
      && surfaces.has('stone_floor')
      && samples.has('dirt')
      && samples.has('sand')
      && samples.has('stone_floor');
    return { ok, ruleSurfaces: [...surfaces], sampleSurfaces: [...samples] };
  });

  // eslint-disable-next-line no-console
  console.log(`[D.8] rules=${details.ruleSurfaces.join(',')} samples=${details.sampleSurfaces.join(',')}`);
  expect(details.ok).toBe(true);
});
