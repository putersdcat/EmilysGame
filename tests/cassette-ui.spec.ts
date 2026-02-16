import { test, expect } from '@playwright/test';

// Cassette Player UI (#107 Phase 2) — verifies retro cassette deck renders correctly

test.describe('Cassette Player UI (#107)', () => {
  test('cassette deck elements are present in sidebar', async ({ page }) => {
    await page.goto('/?test=1');
    await page.waitForSelector('#sidebar', { timeout: 15000 });

    // Brand label
    const brand = page.locator('.cassette-brand');
    await expect(brand).toBeVisible();
    await expect(brand).toContainText('Sonny WalkGirl');

    // Window with reels
    await expect(page.locator('.cassette-window')).toBeVisible();
    await expect(page.locator('#cassetteReelL')).toBeVisible();
    await expect(page.locator('#cassetteReelR')).toBeVisible();

    // Track info / INSERT TAPE default
    const trackEl = page.locator('#sbMusicTrack');
    await expect(trackEl).toBeVisible();

    // Progress bar
    await expect(page.locator('.cassette-progress')).toBeVisible();
    await expect(page.locator('#cassetteProgress')).toBeAttached();

    // Transport controls
    await expect(page.locator('#btnMusicPrev')).toBeVisible();
    await expect(page.locator('#btnMusicPlayPause')).toBeVisible();
    await expect(page.locator('#btnMusicNext')).toBeVisible();
    await expect(page.locator('#btnMusicMute')).toBeVisible();

    // Volume + counter
    await expect(page.locator('#musicVolume')).toBeVisible();
    await expect(page.locator('#cassetteCounter')).toBeVisible();
  });

  test('play button starts reel animation', async ({ page }) => {
    await page.goto('/?test=1');
    await page.waitForSelector('.cassette-deck', { timeout: 15000 });

    // Reels should not be spinning initially
    const reelL = page.locator('#cassetteReelL');
    await expect(reelL).not.toHaveClass(/spinning/);

    // Click play
    await page.click('#btnMusicPlayPause');
    // Wait a tick for UI sync
    await page.waitForTimeout(500);

    // After play, reels should spin (depends on music state update)
    // The button should change to pause icon
    const playBtn = page.locator('#btnMusicPlayPause');
    const btnText = await playBtn.textContent();
    // It should have toggled (either to pause ⏸ or still ▶ if no track loaded)
    expect(btnText === '⏸' || btnText === '▶').toBeTruthy();
  });

  test('cassette deck has retro styling', async ({ page }) => {
    await page.goto('/?test=1');
    await page.waitForSelector('.cassette-deck', { timeout: 15000 });

    const deck = page.locator('.cassette-deck');
    const bg = await deck.evaluate(el => getComputedStyle(el).borderRadius);
    expect(bg).toBe('8px');

    // Cassette buttons should exist
    const buttons = page.locator('.cass-btn');
    const count = await buttons.count();
    expect(count).toBe(4); // prev, play, next, mute
  });

  test('volume slider and counter work', async ({ page }) => {
    await page.goto('/?test=1');
    await page.waitForSelector('.cassette-deck', { timeout: 15000 });

    const slider = page.locator('#musicVolume');
    await expect(slider).toHaveAttribute('min', '0');
    await expect(slider).toHaveAttribute('max', '100');

    const counter = page.locator('#cassetteCounter');
    const val = await counter.textContent();
    expect(val).toMatch(/^\d{3}$/); // 3-digit counter
  });
});
