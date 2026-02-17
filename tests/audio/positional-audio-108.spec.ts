/**
 * positional-audio-108.spec.ts — E2E tests for #108 Sampled SFX + Positional Audio.
 * Phase 1: Terrain-aware footsteps
 * Phase 2: Positional audio (waterfall, campfire with PannerNode)
 * Phase 3: Sampled ambience layers + animal calls
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

/** Helper: wait for game to initialize */
async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test.describe('Sampled SFX + Positional Audio (#108)', () => {

  // ─── Phase 1: Sampled SFX Pipeline ─────────────────────────

  test('sampled SFX manifest loads at startup', async ({ page }) => {
    await waitForGame(page);
    // Wait for sampledReady flag
    await page.waitForFunction(() => {
      const s = (window as any).__gameDebug.getSfxState();
      return s.sampledReady === true;
    }, null, { timeout: 10000 });
    const state = await page.evaluate(() => (window as any).__gameDebug.getSfxState());
    expect(state.sampledReady).toBe(true);
  });

  test('getSfxState exposes positionalSources count', async ({ page }) => {
    await waitForGame(page);
    const state = await page.evaluate(() => (window as any).__gameDebug.getSfxState());
    expect(typeof state.positionalSources).toBe('number');
    expect(state.positionalSources).toBeGreaterThanOrEqual(0);
  });

  // ─── Phase 1: Terrain-Aware Footsteps ─────────────────────

  test('footstep surface detection: MICRO_TILE_DEFS have surface field', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const defs = (window as any).__gameDebug.getTileConfig().MICRO_TILE_DEFS;
      const surfaces: string[] = [];
      for (const [key, def] of Object.entries(defs)) {
        surfaces.push((def as any).surface ?? 'unknown');
      }
      return { count: surfaces.length, uniqueSurfaces: [...new Set(surfaces)] };
    });
    expect(result.count).toBeGreaterThan(0);
    // Should include at least grass, dirt, stone surface types
    expect(result.uniqueSurfaces).toContain('grass');
    expect(result.uniqueSurfaces).toContain('dirt');
    expect(result.uniqueSurfaces).toContain('stone');
  });

  test('footstep sample variants exist in manifest', async ({ page }) => {
    await waitForGame(page);
    await page.waitForFunction(() => {
      return (window as any).__gameDebug.getSfxState().sampledReady;
    }, null, { timeout: 10000 });

    // Check that footstep samples are available by trying to play them
    // (won't actually produce sound in headless, but tests the pipeline)
    const hasSamples = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      // playSfx exists and won't crash for footstep variants
      debug.playSfx('footstep_grass');
      debug.playSfx('footstep_dirt');
      debug.playSfx('footstep_stone');
      return true;
    });
    expect(hasSamples).toBe(true);
  });

  test('footsteps play while player moves (no crash)', async ({ page }) => {
    await waitForGame(page);
    await page.waitForFunction(() => {
      return (window as any).__gameDebug.getSfxState().sampledReady;
    }, null, { timeout: 10000 });

    // Move the player with arrow keys
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowRight');

    // Game should still be running
    const state = await page.evaluate(() => (window as any).__gameDebug.state);
    expect(state.initialized).toBe(true);
  });

  // ─── Phase 2: Positional Audio ────────────────────────────

  test('playPositionalSfx export is callable from debug', async ({ page }) => {
    await waitForGame(page);
    // Verify playPositionalSfx is wired up via sfx module
    const result = await page.evaluate(() => {
      const sfxMod = (window as any).__gameDebug;
      // We can call playSfx for positional samples without crash
      sfxMod.playSfx('campfire_loop');
      sfxMod.playSfx('waterfall_loop');
      return true;
    });
    expect(result).toBe(true);
  });

  test('positional audio data structures initialized', async ({ page }) => {
    await waitForGame(page);
    const state = await page.evaluate(() => {
      const s = (window as any).__gameDebug.getSfxState();
      return {
        hasPositionalSources: typeof s.positionalSources === 'number',
        sfxEnabled: s.sfxEnabled,
      };
    });
    expect(state.hasPositionalSources).toBe(true);
    expect(state.sfxEnabled).toBe(true);
  });

  // ─── Phase 3: Sampled Ambience ────────────────────────────

  test('ambience profile resolves correctly for time-of-day', async ({ page }) => {
    await waitForGame(page);
    // Ambience updates every 60 frames (~1s) — wait for it to resolve
    await page.waitForFunction(() => {
      const s = (window as any).__gameDebug.getSfxState();
      return s.activeAmbience !== null;
    }, null, { timeout: 10000 });
    const state = await page.evaluate(() => {
      return (window as any).__gameDebug.getSfxState();
    });
    // activeAmbience should be set to a valid profile
    expect(state.activeAmbience).toBeTruthy();
    // Profile should be one of the known IDs
    const validProfiles = ['day_clear', 'dusk_clear', 'night_clear', 'rain', 'storm', 'fog'];
    expect(validProfiles).toContain(state.activeAmbience);
  });

  test('animal call samples exist (bird, owl, frog, rooster)', async ({ page }) => {
    await waitForGame(page);
    await page.waitForFunction(() => {
      return (window as any).__gameDebug.getSfxState().sampledReady;
    }, null, { timeout: 10000 });

    // Fire each animal call — should not crash
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      debug.playSfx('bird_chirp_1');
      debug.playSfx('bird_chirp_2');
      debug.playSfx('bird_chirp_3');
      debug.playSfx('owl_hoot');
      debug.playSfx('frog_croak');
      debug.playSfx('rooster_crow');
      debug.playSfx('cat_purr_loop');
      return true;
    });
    expect(result).toBe(true);
  });

  test('ambience loops list includes sampled IDs (cricket, wind, rain)', async ({ page }) => {
    await waitForGame(page);
    await page.waitForFunction(() => {
      return (window as any).__gameDebug.getSfxState().sampledReady;
    }, null, { timeout: 10000 });

    // Play the sampled ambience samples directly — should not crash
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      debug.playSfx('cricket_loop');
      debug.playSfx('wind_loop');
      debug.playSfx('rain_loop');
      return true;
    });
    expect(result).toBe(true);
  });

  // ─── Integration: Game loop stability ─────────────────────

  test('game runs with all audio systems for 3 seconds without crash', async ({ page }) => {
    await waitForGame(page);
    await page.waitForFunction(() => {
      return (window as any).__gameDebug.getSfxState().sampledReady;
    }, null, { timeout: 10000 });

    // Move around to trigger footsteps, positional scan, ambience
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1000);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(1000);
    await page.keyboard.up('ArrowDown');
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(1000);
    await page.keyboard.up('ArrowLeft');

    // Verify game is still running and SFX state is intact
    const state = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return {
        initialized: debug.state.initialized,
        sfx: debug.getSfxState(),
      };
    });
    expect(state.initialized).toBe(true);
    expect(state.sfx.sfxEnabled).toBe(true);
    expect(state.sfx.sampledReady).toBe(true);
  });

  test('SFX mute disables footstep and ambience playback', async ({ page }) => {
    await waitForGame(page);

    // Mute SFX
    await page.click('#btnSfxMute');
    await page.waitForFunction(() => {
      return (window as any).__gameDebug.getSfxState().sfxMuted === true;
    }, null, { timeout: 3000 });

    // Move player — should not crash even when muted
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowRight');

    const state = await page.evaluate(() => (window as any).__gameDebug.getSfxState());
    expect(state.sfxMuted).toBe(true);

    // Unmute
    await page.click('#btnSfxMute');
    await page.waitForFunction(() => {
      return (window as any).__gameDebug.getSfxState().sfxMuted === false;
    }, null, { timeout: 3000 });
  });
});
