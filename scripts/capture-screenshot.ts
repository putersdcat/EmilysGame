/**
 * capture-screenshot.ts - Automated screenshot capture for README
 *
 * This script:
 * 1. Starts the dev server
 * 2. Opens the game in a headless browser with test mode (?test=1)
 * 3. Game automatically skips LLM calls (Issue #26 test mode)
 * 4. Waits for the game world to render
 * 5. Captures a screenshot showing actual gameplay
 * 6. Saves it to docs/game-screenshot.png for README embedding
 *
 * Test mode (?test=1) bypasses all LLM health checks and uses cached/bundled
 * entropy wordlists, preventing local LLM server from being hammered during
 * automated screenshot capture.
 *
 * Run: npm run screenshot
 */

import { chromium } from '@playwright/test';
import type { Browser, Page } from 'playwright';
import { spawn, ChildProcess } from 'child_process';
import { setTimeout } from 'timers/promises';
import * as path from 'path';
import * as fs from 'fs';

const DEV_SERVER_URL = 'http://localhost:5173/?test=1'; // Test mode - skip LLM
const SCREENSHOT_PATH = path.join(process.cwd(), 'docs', 'game-screenshot.png');
const SERVER_STARTUP_DELAY = 3000; // Wait 3s for Vite to start
const GAME_LOAD_DELAY = 2000; // Wait 2s for game to render

let devServer: ChildProcess | null = null;
let browser: Browser | null = null;

async function startDevServer(): Promise<void> {
  console.log('🚀 Starting dev server...');

  devServer = spawn('npx', ['vite', '--port', '5173'], {
    stdio: 'pipe',
    shell: true,
    detached: false,
  });

  devServer.stdout?.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Local:') || output.includes('ready')) {
      console.log('✓ Dev server ready');
    }
  });

  devServer.stderr?.on('data', (data) => {
    console.error('Dev server error:', data.toString());
  });

  // Wait for server to start
  await setTimeout(SERVER_STARTUP_DELAY);
}

async function captureScreenshot(): Promise<void> {
  console.log('📸 Launching browser...');

  browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();

  try {
    console.log('🌐 Navigating to game (test mode)...');
    await page.goto(DEV_SERVER_URL, { waitUntil: 'domcontentloaded' });

    // Test mode (?test=1) automatically skips LLM splash - no click needed
    console.log('✓ Test mode active - LLM calls bypassed');

    // Wait for canvas to exist
    console.log('⏳ Waiting for game canvas to render...');
    await page.waitForSelector('#gameContainer canvas', { timeout: 5000 });

    // Give the game a moment to render the world
    await page.waitForTimeout(GAME_LOAD_DELAY);

    // Ensure docs directory exists
    const docsDir = path.dirname(SCREENSHOT_PATH);
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Capture screenshot of the game wrapper (includes canvas + HUD)
    const gameWrapper = page.locator('#gameWrapper');
    await gameWrapper.screenshot({ path: SCREENSHOT_PATH });

    console.log(`✅ Screenshot saved to: ${SCREENSHOT_PATH}`);

  } catch (error) {
    console.error('❌ Screenshot capture failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function cleanup(): Promise<void> {
  console.log('🧹 Cleaning up...');

  if (browser) {
    await browser.close();
  }

  if (devServer) {
    devServer.kill();
    // Give it a moment to shut down
    await setTimeout(500);
  }

  console.log('✓ Cleanup complete');
}

async function main(): Promise<void> {
  try {
    await startDevServer();
    await captureScreenshot();
    await cleanup();
    console.log('🎉 Screenshot capture complete!');
    process.exit(0);
  } catch (error) {
    console.error('💥 Fatal error:', error);
    await cleanup();
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n⚠️  Interrupted by user');
  await cleanup();
  process.exit(130);
});

main();
