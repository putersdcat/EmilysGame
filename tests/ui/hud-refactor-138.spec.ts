/**
 * hud-refactor-138.spec.ts — E2E tests for Issue #138 HUD/Menu refactor.
 * Covers: music popup flyout, LLM settings in Options overlay, mini status meters.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173/?test=1';

test.describe('HUD Refactor (#138)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => !!(window as any).__gameDebug?.state, undefined, { timeout: 15000 });
  });

  // ─── Music Popup ────────────────────────────────────────────
  test('music popup starts hidden', async ({ page }) => {
    const visible = await page.evaluate(() => {
      const el = document.getElementById('musicPopup');
      return el ? el.style.display !== 'none' && getComputedStyle(el).display !== 'none' : false;
    });
    expect(visible).toBe(false);
  });

  test('🎵 button opens music popup', async ({ page }) => {
    await page.click('#btnMusic');
    await page.waitForSelector('#musicPopup', { state: 'visible', timeout: 5000 });
    const visible = await page.locator('#musicPopup').isVisible();
    expect(visible).toBe(true);
  });

  test('music popup contains cassette deck', async ({ page }) => {
    await page.click('#btnMusic');
    await page.waitForSelector('#musicPopup', { state: 'visible', timeout: 5000 });
    await expect(page.locator('.cassette-deck')).toBeVisible();
    await expect(page.locator('.cassette-brand')).toContainText('Sonny WalkGirl');
    await expect(page.locator('#btnMusicPlayPause')).toBeVisible();
  });

  test('music popup closes with × button', async ({ page }) => {
    await page.click('#btnMusic');
    await page.waitForSelector('#musicPopup', { state: 'visible', timeout: 5000 });
    await page.click('#btnMusicPopupClose');
    await page.waitForTimeout(300);
    const visible = await page.locator('#musicPopup').isVisible();
    expect(visible).toBe(false);
  });

  test('music popup toggles on repeated 🎵 clicks', async ({ page }) => {
    // Open
    await page.click('#btnMusic');
    await page.waitForSelector('#musicPopup', { state: 'visible', timeout: 5000 });
    // Close by clicking again
    await page.click('#btnMusic');
    await page.waitForTimeout(300);
    const visible = await page.locator('#musicPopup').isVisible();
    expect(visible).toBe(false);
  });

  // ─── LLM Settings in Options ─────────────────────────────────
  test('LLM config is NOT in sidebar', async ({ page }) => {
    // Sidebar should not have LLM Mode or URL fields
    const hasSidebarLlm = await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) return false;
      // Check for old sidebar LLM IDs
      return !!sidebar.querySelector('#llmMode') || !!sidebar.querySelector('#llmUrl');
    });
    expect(hasSidebarLlm).toBe(false);
  });

  test('LLM config is in Options overlay', async ({ page }) => {
    // LLM config elements should exist in the options overlay DOM
    // Use evaluate to check attachment without needing to visually open it
    const check = await page.evaluate(() => {
      const overlay = document.getElementById('optionsOverlay');
      if (!overlay) return { hasOverlay: false };
      return {
        hasOverlay: true,
        hasMode: !!overlay.querySelector('#optLlmMode'),
        hasUrl: !!overlay.querySelector('#optLlmUrl'),
        hasApiKey: !!overlay.querySelector('#optLlmApiKey'),
        hasApply: !!overlay.querySelector('#optLlmApply'),
      };
    });
    expect(check.hasOverlay).toBe(true);
    expect(check.hasMode).toBe(true);
    expect(check.hasUrl).toBe(true);
    expect(check.hasApiKey).toBe(true);
    expect(check.hasApply).toBe(true);
  });

  test('API Key field exists in Options LLM section', async ({ page }) => {
    const check = await page.evaluate(() => {
      const apiKey = document.getElementById('optLlmApiKey') as HTMLInputElement | null;
      if (!apiKey) return { exists: false, type: '' };
      return { exists: true, type: apiKey.type };
    });
    expect(check.exists).toBe(true);
    expect(check.type).toBe('password');
  });

  // ─── Mini Status Meters ──────────────────────────────────────
  test('mini status meters hidden when sidebar expanded', async ({ page }) => {
    const visible = await page.evaluate(() => {
      const strip = document.getElementById('miniStatusStrip');
      if (!strip) return false;
      return getComputedStyle(strip).display !== 'none';
    });
    expect(visible).toBe(false);
  });

  test('mini status meters show when sidebar collapsed', async ({ page }) => {
    // Collapse the sidebar
    await page.click('#sidebarToggle');
    await page.waitForTimeout(500);

    // Check mini status strip is visible
    const visible = await page.evaluate(() => {
      const strip = document.getElementById('miniStatusStrip');
      if (!strip) return false;
      return getComputedStyle(strip).display !== 'none';
    });
    expect(visible).toBe(true);
  });

  test('mini status shows energy/hydration/cleanliness values', async ({ page }) => {
    // Collapse sidebar to reveal mini meters
    await page.click('#sidebarToggle');
    // Wait for game loop to sync the mini meter values
    await page.waitForFunction(() => {
      const el = document.getElementById('miniEnergyVal');
      return el && el.textContent && el.textContent.trim().length > 0;
    }, undefined, { timeout: 10000 });

    const values = await page.evaluate(() => {
      return {
        energy: document.getElementById('miniEnergyVal')?.textContent?.trim(),
        hydration: document.getElementById('miniHydrationVal')?.textContent?.trim(),
        cleanliness: document.getElementById('miniCleanlinessVal')?.textContent?.trim(),
      };
    });
    // Should have numeric values
    expect(values.energy).toMatch(/^\d+$/);
    expect(values.hydration).toMatch(/^\d+$/);
    expect(values.cleanliness).toMatch(/^\d+$/);
  });

  test('mini meters hide when sidebar re-expanded', async ({ page }) => {
    // Collapse
    await page.click('#sidebarToggle');
    await page.waitForTimeout(500);
    // Re-expand
    await page.click('#sidebarToggle');
    await page.waitForTimeout(500);

    const visible = await page.evaluate(() => {
      const strip = document.getElementById('miniStatusStrip');
      if (!strip) return false;
      return getComputedStyle(strip).display !== 'none';
    });
    expect(visible).toBe(false);
  });
});
