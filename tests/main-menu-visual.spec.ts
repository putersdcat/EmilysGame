import { test, expect } from '@playwright/test';

// These tests exercise the main menu and pause menu.
// ?test=0 forces non-test mode (overrides navigator.webdriver detection)
test.describe('Main Menu Visual', () => {
  test('main menu appears on startup', async ({ page }) => {
    page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));

    // Navigate with ?test=0 to force non-test mode (show LLM splash + menu)
    await page.goto('http://localhost:5173/?test=0');

    // Skip LLM splash (health check can take ~10s with timeouts)
    const skipBtn = page.locator('#btnSkipLlm');
    await skipBtn.waitFor({ state: 'visible', timeout: 5000 });
    await skipBtn.click();

    // Wait for main menu (LLM health checks ~3-9s + 400ms + init)
    const mainMenu = page.locator('#mainMenu');
    await mainMenu.waitFor({ state: 'visible', timeout: 30000 });

    // Screenshot the main menu
    await page.screenshot({ path: 'menu-screenshot-startup.png', fullPage: true });

    // Verify title elements
    const title = page.locator('.menu-title');
    await expect(title).toBeVisible();
    await expect(title).toContainText('Emily');

    // Verify New Game button
    const newGameBtn = page.locator('#menuNewGame');
    await expect(newGameBtn).toBeVisible();

    // Click New Game
    await newGameBtn.click();
    await page.waitForTimeout(500);

    // Main menu should be hidden now
    await expect(mainMenu).toBeHidden();

    // Customizer should appear
    const customizer = page.locator('#customizerOverlay');
    await expect(customizer).toBeVisible({ timeout: 5000 });

    // Screenshot customizer
    await page.screenshot({ path: 'menu-screenshot-customizer.png', fullPage: true });
    console.log('Main menu test passed!');
  });

  test('pause menu opens with Escape during gameplay', async ({ page }) => {
    page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));

    // Start with test mode to skip menu and get into gameplay quickly
    await page.goto('http://localhost:5173/?test=1');

    // Wait for game canvas
    const canvas = page.locator('#gameContainer canvas');
    await canvas.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Press Escape to open pause menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const pauseMenu = page.locator('#pauseMenu');
    await expect(pauseMenu).toBeVisible({ timeout: 3000 });

    // Screenshot pause menu
    await page.screenshot({ path: 'menu-screenshot-pause.png', fullPage: true });

    // Verify correct buttons exist
    await expect(page.locator('#pauseResume')).toBeVisible();
    await expect(page.locator('#pauseSave')).toBeVisible();
    await expect(page.locator('#pauseCustomize')).toBeVisible();
    await expect(page.locator('#pauseMainMenu')).toBeVisible();

    // Click Resume
    await page.locator('#pauseResume').click();
    await page.waitForTimeout(500);

    // Pause menu should be hidden
    await expect(pauseMenu).toBeHidden();
    console.log('Pause menu resume works!');
  });
});
