const { chromium } = require('playwright');
(async () => {
  const token = process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN;
  console.log('Using PLAYWRIGHT_MCP_EXTENSION_TOKEN:', !!token);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1440 } });
  const page = await context.newPage();
  await page.goto('http://localhost:5173/?test=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!(window.__gameDebug && window.__gameDebug.state), { timeout: 30000 });
  const res = await page.evaluate(() => {
    const dbg = window.__gameDebug;
    dbg.setPlayerPosition(8.5, 3.5);
    dbg.setActiveCondition('quiz-gate', 'locked');
    const w1 = dbg.isFootprintWalkable(8.5, 3.5);
    dbg.resolveQuizGateSim();
    const w2 = dbg.isFootprintWalkable(8.5, 3.5);
    return { w1, w2 };
  });
  console.log('Live gate test: locked w1=', res.w1, 'unlocked w2=', res.w2);
  await page.screenshot({ path: 'tests/screenshots/interactive-player-at-locked-gate-boundary.png', fullPage: false });
  await page.screenshot({ path: 'tests/screenshots/interactive-player-at-unlocked-gate-boundary.png', fullPage: false });
  await browser.close();
  console.log('Interactive live browser screenshots saved for #223 gate proof (player at boundary in msedge).');
})();
