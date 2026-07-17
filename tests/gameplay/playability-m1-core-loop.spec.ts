/**
 * playability-m1-core-loop.spec.ts — Milestone 1 automated proof
 * (2026-07-15 functional-first campaign).
 *
 * Proves the child-facing core loop is trustworthy enough to unlock
 * Iso 2.0 visual re-attachment (Docs/13 §4):
 *   1) Starter homestead quiz_gate is present and interactable
 *   2) Wrong answer → immediate re-deal (still active quiz)
 *   3) Correct answer → door_open + walkable
 *   4) Full-tile collision blocks mid-gate while locked
 *   5) Sampled non-origin chunks (fixed seed) each have ≥1 quiz_gate
 *
 * See AGENTS.md + Docs/01–02 for product loop context
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state?.chunks?.size, undefined, {
    timeout: 15000,
  });
  // Dismiss welcome if present
  await page.evaluate(() => {
    localStorage.setItem('emilys_game_first_run', '1');
    const splash = document.getElementById('welcomeSplash');
    if (splash) {
      splash.style.display = 'none';
      (splash as HTMLElement).style.pointerEvents = 'none';
    }
    const d = (window as any).__gameDebug;
    if (d?.state) d.state.paused = false;
  });
}

async function pressSpace(page: Page) {
  await page.keyboard.down(' ');
  await page.waitForTimeout(200);
  await page.keyboard.up(' ');
  await page.waitForTimeout(300);
}

test('M1: starter homestead gate — collision, fail, retry, open', async ({ page }) => {
  await waitForGame(page);

  // Homestead ORIGIN (9,8) + gate offset (3,6) = world cell (12,14)
  const GATE = { x: 12, y: 14 };
  const setup = await page.evaluate((g) => {
    const d = (window as any).__gameDebug;
    const ch = d.state.chunks.get('0,0');
    if (!ch) return { ok: false, reason: 'no chunk' };
    const cell = ch.cells[g.y]?.[g.x];
    // Stand north of gate, face south
    d.setPlayerPosition(g.x + 0.5, g.y - 0.5);
    d.state.player.facingDx = 0;
    d.state.player.facingDy = 1;
    d.state.player.isMoving = false;
    d.state.camera.x = d.state.player.x;
    d.state.camera.y = d.state.player.y;
    d.state.paused = false;
    return {
      ok: true,
      assetKey: cell?.assetKey,
      walkable: cell?.walkable,
      midBlocked: !d.isFootprintWalkable(g.x + 0.5, g.y + 0.5),
    };
  }, GATE);

  expect(setup.ok, 'origin chunk loaded').toBe(true);
  expect(setup.assetKey, 'starter homestead must stamp a quiz_gate at south exit').toBe('quiz_gate');
  expect(setup.walkable).toBe(false);
  expect(setup.midBlocked, 'locked gate must full-tile block').toBe(true);

  await pressSpace(page); // dialog
  await pressSpace(page); // start quiz
  await page.waitForTimeout(500);

  let quiz = await page.evaluate(() => {
    const q = (window as any).__gameDebug.state.quiz;
    return { active: q.active, correctIndex: q.correctIndex, choicesLen: q.choices.length, result: q.result };
  });
  expect(quiz.active, 'quiz must start from homestead gate').toBe(true);
  expect(quiz.choicesLen).toBeGreaterThan(1);

  // Wrong answer → immediate re-deal
  const wrongIndex = [...Array(quiz.choicesLen).keys()].find(
    (i) => i !== quiz.correctIndex && i !== quiz.choicesLen - 1,
  )!;
  await page.evaluate((idx) => (window as any).__gameDebug.quizSelectIndex(idx), wrongIndex);
  await pressSpace(page); // submit wrong
  await pressSpace(page); // process → re-deal
  await page.waitForTimeout(500);

  quiz = await page.evaluate(() => {
    const q = (window as any).__gameDebug.state.quiz;
    return { active: q.active, correctIndex: q.correctIndex, choicesLen: q.choices.length, result: q.result };
  });
  expect(quiz.active, 'wrong answer must re-deal without walk-away').toBe(true);
  expect(quiz.result).toBe('pending');

  const stillGate = await page.evaluate((g) => {
    const ch = (window as any).__gameDebug.state.chunks.get('0,0');
    return ch.cells[g.y][g.x].assetKey;
  }, GATE);
  expect(stillGate).toBe('quiz_gate');

  // Correct → open
  await page.evaluate((idx) => (window as any).__gameDebug.quizSelectIndex(idx), quiz.correctIndex);
  await pressSpace(page);
  await pressSpace(page);
  await page.waitForTimeout(300);

  const opened = await page.evaluate((g) => {
    const d = (window as any).__gameDebug;
    const ch = d.state.chunks.get('0,0');
    const cell = ch.cells[g.y][g.x];
    return {
      assetKey: cell.assetKey,
      walkable: cell.walkable,
      midOpen: d.isFootprintWalkable(g.x + 0.5, g.y + 0.5),
    };
  }, GATE);
  expect(opened.assetKey).toBe('door_open');
  expect(opened.walkable).toBe(true);
  expect(opened.midOpen, 'opened gate must be walkable').toBe(true);
});

test('M1: fixed-seed non-origin chunks each have at least one quiz_gate', async ({ page }) => {
  await waitForGame(page);

  const FIXED_WORDLIST = [
    'alpha beta', 'gamma delta', 'epsilon zeta', 'eta theta',
    'iota kappa', 'lambda mu', 'nu xi', 'omicron pi',
  ];
  const BIOME_SEED = 42;
  // Ring outside origin (gen skips quiz placement only on 0,0)
  const COORDS: Array<[number, number]> = [
    [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [2, 0], [0, 2], [-2, 1],
  ];

  const report = await page.evaluate(
    ([wordlist, biomeSeed, coords]: [string[], number, Array<[number, number]>]) => {
      // @ts-expect-error Vite dynamic import
      return import('/engine/gen.ts').then((gen: any) => {
        gen.setWordlist(wordlist);
        gen.setBiomeNoiseSeed(biomeSeed);
        gen.restoreEntropyBuffer('');
        const rows: Array<{ cx: number; cy: number; biome: string; quizGates: number }> = [];
        for (const [cx, cy] of coords) {
          const c = gen.generateChunkSync(cx, cy);
          let quizGates = 0;
          for (const row of c.cells) {
            for (const cell of row) {
              if (cell.assetKey === 'quiz_gate') quizGates++;
            }
          }
          rows.push({ cx, cy, biome: c.biomeName, quizGates });
        }
        return rows;
      });
    },
    [FIXED_WORDLIST, BIOME_SEED, COORDS] as [string[], number, Array<[number, number]>],
  );

  console.log('M1 non-origin gate counts:', JSON.stringify(report));
  for (const row of report) {
    expect(
      row.quizGates,
      `chunk (${row.cx},${row.cy}) biome=${row.biome} must have ≥1 quiz_gate for M1 progression density`,
    ).toBeGreaterThanOrEqual(1);
  }
});
