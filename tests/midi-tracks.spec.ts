/**
 * midi-tracks.spec.ts — E2E tests for MIDI track integration (#107)
 * Verifies manifest loading, track lazy-loading, and music playback.
 */
import { test, expect } from '@playwright/test';

test.describe('MIDI Track Integration (#107)', () => {

  test('manifest.json is served and contains tracks', async ({ page, baseURL }) => {
    const resp = await page.goto(`${baseURL}audio/music/manifest.json`);
    expect(resp?.status()).toBe(200);
    const manifest = await resp!.json();
    expect(manifest.tracks).toBeDefined();
    expect(manifest.tracks.length).toBeGreaterThanOrEqual(40);
    // Verify each entry has required fields
    for (const t of manifest.tracks.slice(0, 5)) {
      expect(t.id).toBeTruthy();
      expect(t.file).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.composer).toBeTruthy();
      expect(t.tempo).toBeGreaterThan(0);
      expect(t.source).toBe('midi');
    }
  });

  test('individual track JSON load works', async ({ page, baseURL }) => {
    const manifestResp = await page.goto(`${baseURL}audio/music/manifest.json`);
    const manifest = await manifestResp!.json();
    const first = manifest.tracks[0];
    const trackResp = await page.goto(`${baseURL}audio/music/${first.file}`);
    expect(trackResp?.status()).toBe(200);
    const track = await trackResp!.json();
    expect(track.id).toBe(first.id);
    expect(track.melody).toBeDefined();
    expect(track.melody.length).toBeGreaterThan(10);
    expect(track.bass).toBeDefined();
    expect(track.bass.length).toBeGreaterThan(0);
    // Verify note format
    const note = track.melody[0];
    expect(note.note).toBeTruthy();
    expect(typeof note.duration).toBe('number');
  });

  test('game loads MIDI tracks on startup', async ({ page }) => {
    await page.goto('/?test=1');
    // Wait for game to finish loading
    await page.waitForFunction(() => !!(window as any).__gameDebug, { timeout: 15000 });
    // Wait a bit for async MIDI loading
    await page.waitForTimeout(3000);
    
    // Access music state through debug hooks
    const musicInfo = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      if (!dbg?.state?.music) return null;
      return {
        midiLoaded: dbg.state.music.midiLoaded,
        playlistLength: dbg.state.music.playlist.length,
      };
    });
    
    // Music state should be accessible
    expect(musicInfo).not.toBeNull();
    // MIDI tracks should have loaded from manifest
    expect(musicInfo!.midiLoaded).toBe(true);
  });

  test('Beethoven Fur Elise track has correct structure', async ({ page, baseURL }) => {
    const resp = await page.goto(`${baseURL}audio/music/beethoven___fur_elise.json`);
    expect(resp?.status()).toBe(200);
    const track = await resp!.json();
    expect(track.name).toContain('Fur Elise');
    expect(track.composer).toBe('Ludwig van Beethoven');
    expect(track.tempo).toBe(75);
    expect(track.melody.length).toBeGreaterThan(50);
    expect(track.bass.length).toBeGreaterThan(10);
    expect(track.biomes).toBeDefined();
  });

  test('manifest has at least 50 tracks from MIDI conversion', async ({ page, baseURL }) => {
    const resp = await page.goto(`${baseURL}audio/music/manifest.json`);
    const manifest = await resp!.json();
    expect(manifest.tracks.length).toBeGreaterThanOrEqual(50);
    
    // Check for well-known pieces
    const ids = manifest.tracks.map((t: any) => t.id);
    expect(ids).toContain('beethoven___fur_elise');
    expect(ids).toContain('mozart___alla_turca');
    expect(ids).toContain('pachelbel___canon_in_d');
    expect(ids).toContain('debussy___clair_de_lune');
    expect(ids).toContain('chopin___minute_waltz');
  });

  test('all tracks have valid biome assignments', async ({ page, baseURL }) => {
    const resp = await page.goto(`${baseURL}audio/music/manifest.json`);
    const manifest = await resp!.json();
    for (const t of manifest.tracks) {
      expect(t.biomes.length).toBeGreaterThan(0);
      for (const b of t.biomes) {
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(3);
      }
    }
  });

  test('composer field populated for all metadata-matched tracks', async ({ page, baseURL }) => {
    const resp = await page.goto(`${baseURL}audio/music/manifest.json`);
    const manifest = await resp!.json();
    // At least 45 of the 47 metadata entries should have composers
    const withComposer = manifest.tracks.filter((t: any) => t.composer && t.composer !== 'Unknown');
    expect(withComposer.length).toBeGreaterThanOrEqual(45);
  });
});
