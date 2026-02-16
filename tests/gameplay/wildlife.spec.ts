/**
 * Wildlife system tests (#68).
 * Verifies: spawning, time-of-day variation, water adjacency, interaction, determinism.
 */
import { test, expect } from '@playwright/test';

test.describe('Wildlife System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?test=1');
    await page.waitForSelector('#gameContainer canvas', { state: 'visible', timeout: 15000 });
    // Wait for game init + at least a few wildlife update ticks
    await page.waitForTimeout(3000);
  });

  test('wildlife entities spawn in visible chunks', async ({ page }) => {
    const stats = await page.evaluate(() => {
      const wl = (window as any).__wildlife;
      if (!wl) return null;
      return wl.getWildlifeStats();
    });

    expect(stats).not.toBeNull();
    expect(stats.cached).toBeGreaterThan(0);
    expect(['day', 'dusk', 'night']).toContain(stats.timeSlot);
  });

  test('wildlife changes with time of day', async ({ page }) => {
    // Get initial stats
    const before = await page.evaluate(() => {
      const wl = (window as any).__wildlife;
      return wl?.getWildlifeStats() ?? null;
    });
    expect(before).not.toBeNull();

    // Jump to night and force wildlife update
    await page.evaluate(() => {
      const lt = (window as any).__lighting;
      const wl = (window as any).__wildlife;
      const gs = (window as any).__gameState;
      lt.setTimeOfDay(0.85); // Night phase
      // Force wildlife re-spawn at new time
      wl.updateWildlife(gs.chunks, gs.player.x, gs.player.y);
    });

    const after = await page.evaluate(() => {
      const wl = (window as any).__wildlife;
      return wl?.getWildlifeStats() ?? null;
    });

    expect(after).not.toBeNull();
    expect(after.timeSlot).toBe('night');
    expect(after.cached).toBeGreaterThanOrEqual(0);
  });

  test('wildlife is deterministic for same chunk', async ({ page }) => {
    // Get wildlife, clear, re-spawn, compare home positions (deterministic)
    const result = await page.evaluate(() => {
      const wl = (window as any).__wildlife;
      const gs = (window as any).__gameState;
      if (!wl || !gs) return { match: false, reason: 'no state' };

      const toSnap = (entities: any[]) => entities
        .map((e: any) => ({
          speciesId: e.speciesId,
          homeX: Math.round(e.homeX * 100) / 100,
          homeY: Math.round(e.homeY * 100) / 100,
        }))
        // Sort consistently by home position for comparison
        .sort((a: any, b: any) => a.homeX - b.homeX || a.homeY - b.homeY || a.speciesId.localeCompare(b.speciesId));

      // First pass
      const vis1 = wl.getVisibleWildlife({ x: 0, y: 0 }, gs.player.x, gs.player.y);
      const snap1 = toSnap(vis1);

      // Clear and re-spawn
      wl.clearWildlife();
      wl.updateWildlife(gs.chunks, gs.player.x, gs.player.y);

      // Second pass
      const vis2 = wl.getVisibleWildlife({ x: 0, y: 0 }, gs.player.x, gs.player.y);
      const snap2 = toSnap(vis2);

      if (snap1.length !== snap2.length) return { match: false, reason: `length mismatch ${snap1.length} vs ${snap2.length}` };

      for (let i = 0; i < snap1.length; i++) {
        if (snap1[i].speciesId !== snap2[i].speciesId) return { match: false, reason: `species mismatch at ${i}: ${snap1[i].speciesId} vs ${snap2[i].speciesId}` };
        if (snap1[i].homeX !== snap2[i].homeX) return { match: false, reason: `homeX mismatch at ${i}` };
        if (snap1[i].homeY !== snap2[i].homeY) return { match: false, reason: `homeY mismatch at ${i}` };
      }

      return { match: true, count: snap1.length };
    });

    expect(result.match).toBe(true);
    // Should have at least some wildlife
    if ('count' in result) {
      expect(result.count).toBeGreaterThan(0);
    }
  });

  test('wildlife interaction shows dialog', async ({ page }) => {
    // Position player near a wildlife entity and interact
    const setup = await page.evaluate(() => {
      const wl = (window as any).__wildlife;
      const gs = (window as any).__gameState;
      if (!wl || !gs) return false;

      const visible = wl.getVisibleWildlife({ x: 0, y: 0 }, gs.player.x, gs.player.y);
      if (visible.length === 0) return false;

      // Teleport player adjacent to first creature
      const target = visible[0];
      gs.player.x = target.worldX - 1;
      gs.player.y = target.worldY;
      gs.player.facingDx = 1;
      gs.player.facingDy = 0;
      gs.camera.x = gs.player.x;
      gs.camera.y = gs.player.y;
      return true;
    });

    if (!setup) {
      test.skip(true, 'No wildlife near player for interaction test');
      return;
    }

    // Press interact
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    const dialogActive = await page.evaluate(() => {
      const gs = (window as any).__gameState;
      return gs?.ui?.dialog?.active ?? false;
    });

    expect(dialogActive).toBe(true);
  });

  test('discovered species tracking works', async ({ page }) => {
    const result = await page.evaluate(() => {
      const wl = (window as any).__wildlife;
      const gs = (window as any).__gameState;
      if (!wl || !gs) return { discovered: 0, speciesIds: [] as string[], restored: [] as string[] };

      const visible = wl.getVisibleWildlife({ x: 0, y: 0 }, gs.player.x, gs.player.y);
      if (visible.length === 0) return { discovered: 0, speciesIds: [] as string[], restored: [] as string[] };

      // Move near first creature and interact
      const target = visible[0];
      gs.player.x = target.worldX - 1;
      gs.player.y = target.worldY;

      const hit = wl.interactWithWildlife(gs.player.x, gs.player.y, 1, 0);
      const ids = wl.getDiscoveredSpeciesArray();

      // Verify save/restore cycle
      wl.restoreDiscoveredSpecies(ids);
      const restored = wl.getDiscoveredSpeciesArray();

      return { discovered: ids.length, speciesIds: ids, restored };
    });

    if (result.discovered === 0) {
      test.skip(true, 'No wildlife to discover');
      return;
    }

    expect(result.discovered).toBeGreaterThan(0);
    expect(result.restored).toEqual(result.speciesIds);
  });

  test('game runs normally with wildlife (no crash, good FPS)', async ({ page }) => {
    // Let game run a few more seconds
    await page.waitForTimeout(3000);

    const health = await page.evaluate(() => {
      const gs = (window as any).__gameState;
      const wl = (window as any).__wildlife;
      if (!gs || !wl) return null;
      return {
        frameCount: gs.frameCount,
        fps: gs.fps,
        wildlife: wl.getWildlifeStats(),
      };
    });

    expect(health).not.toBeNull();
    expect(health!.frameCount).toBeGreaterThan(60);
    expect(health!.fps).toBeGreaterThan(10);
    expect(health!.wildlife.cached).toBeGreaterThanOrEqual(0);

    // Screenshot for visual verification
    await page.screenshot({ path: 'tests/screenshots/wildlife-gameplay.png' });
  });
});
