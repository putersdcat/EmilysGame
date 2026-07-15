/**
 * quiz-gate-bypass-baseline.spec.ts — Phase B feel/progression baseline
 * (2026-07-15, B→A campaign).
 *
 * Measures how often a placed `quiz_gate` is *bypassable* (its walkable
 * cardinal neighbors remain in one connected component of the walkable
 * graph with the gate treated as blocked — which it already is). If all
 * neighbors of a gate can reach each other without the gate cell, the gate
 * does not force engagement: the player can walk around it.
 *
 * This is the quantitative Pillar-2 gap ("gates solvable but not always
 * unavoidable") from Docs/12 and Docs/13. Phase A (corridor bias + bypass
 * repair) should drive `bypassRate` down; re-run this file after A.
 *
 * Technique: same as gen-determinism — import `/engine/gen.ts` in-page with
 * fixed wordlist/seed so results are stable across runs.
 *
 * Run: npx playwright test tests/world-gen/quiz-gate-bypass-baseline.spec.ts --reporter=line
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

const FIXED_WORDLIST = [
  'alpha beta', 'gamma delta', 'epsilon zeta', 'eta theta',
  'iota kappa', 'lambda mu', 'nu xi', 'omicron pi',
];
const BIOME_SEED = 42;

/** Sample a ring of chunks outside the forced-meadow safe zone. */
const SAMPLE_COORDS: Array<[number, number]> = [
  // Near ring (may still mix)
  [2, 0], [0, 2], [-2, 0], [0, -2], [2, 2], [-2, 2], [2, -2], [-2, -2],
  // Farther (more forest/cave/castle)
  [3, 1], [1, 3], [-3, 1], [1, -3], [4, 0], [0, 4], [-4, 0], [0, -4],
  [5, 2], [3, 3], [-3, 3], [3, -3], [6, 1], [2, 5], [-5, 2], [4, 4],
];

type GateSample = {
  cx: number;
  cy: number;
  biomeName: string;
  x: number;
  y: number;
  walkNbrs: number;
  bypassable: boolean;
  /** shortest path length between two opposite-ish neighbors if bypassable, else -1 */
  shortBypassLen: number;
};

type BaselineReport = {
  chunksSampled: number;
  byBiome: Record<string, { chunks: number; quizGates: number; doorLocked: number; tollGate: number }>;
  quizGatesTotal: number;
  gatesWithEnoughNbrs: number;
  bypassableCount: number;
  cutPointCount: number;
  bypassRate: number;
  meanShortBypassLen: number;
  samples: GateSample[];
};

const MEASURE_FN = ([wordlist, biomeSeed, coords]: [string[], number, Array<[number, number]>]) => {
  // @ts-expect-error — Vite-served source module
  return import('/engine/gen.ts').then((gen: any) => {
    gen.setWordlist(wordlist);
    gen.setBiomeNoiseSeed(biomeSeed);
    gen.restoreEntropyBuffer('');

    const DX = [1, 0, -1, 0];
    const DY = [0, 1, 0, -1];

    function walkableNbrs(cells: any[][], x: number, y: number, size: number) {
      const out: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < 4; i++) {
        const nx = x + DX[i], ny = y + DY[i];
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny][nx].walkable) {
          out.push({ x: nx, y: ny });
        }
      }
      return out;
    }

    /** BFS distance from start to goal on walkable cells only (gate cells are not walkable). */
    function bfsDist(cells: any[][], size: number, sx: number, sy: number, gx: number, gy: number): number {
      if (sx === gx && sy === gy) return 0;
      const key = (x: number, y: number) => y * size + x;
      const seen = new Uint8Array(size * size);
      const qx: number[] = [sx];
      const qy: number[] = [sy];
      const qd: number[] = [0];
      seen[key(sx, sy)] = 1;
      let head = 0;
      while (head < qx.length) {
        const x = qx[head], y = qy[head], d = qd[head];
        head++;
        for (let i = 0; i < 4; i++) {
          const nx = x + DX[i], ny = y + DY[i];
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          if (!cells[ny][nx].walkable) continue;
          const k = key(nx, ny);
          if (seen[k]) continue;
          if (nx === gx && ny === gy) return d + 1;
          seen[k] = 1;
          qx.push(nx); qy.push(ny); qd.push(d + 1);
        }
      }
      return -1;
    }

    /**
     * Gate is bypassable if every pair of its walkable neighbors can reach
     * each other without using the gate cell (already non-walkable).
     * Equivalent: flood from first neighbor reaches all other neighbors.
     */
    function isBypassable(cells: any[][], size: number, gx: number, gy: number, nbrs: Array<{ x: number; y: number }>): {
      bypassable: boolean;
      shortBypassLen: number;
    } {
      if (nbrs.length < 2) {
        // 0–1 walkable neighbors: dead-end plug or isolated; not a "route gate"
        return { bypassable: false, shortBypassLen: -1 };
      }
      const start = nbrs[0];
      const key = (x: number, y: number) => y * size + x;
      const seen = new Uint8Array(size * size);
      const qx = [start.x], qy = [start.y];
      seen[key(start.x, start.y)] = 1;
      let head = 0;
      while (head < qx.length) {
        const x = qx[head], y = qy[head];
        head++;
        for (let i = 0; i < 4; i++) {
          const nx = x + DX[i], ny = y + DY[i];
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          // Explicitly never step on the gate cell even if walkable were true
          if (nx === gx && ny === gy) continue;
          if (!cells[ny][nx].walkable) continue;
          const k = key(nx, ny);
          if (seen[k]) continue;
          seen[k] = 1;
          qx.push(nx); qy.push(ny);
        }
      }
      let allReached = true;
      for (let i = 1; i < nbrs.length; i++) {
        if (!seen[key(nbrs[i].x, nbrs[i].y)]) {
          allReached = false;
          break;
        }
      }
      if (!allReached) return { bypassable: false, shortBypassLen: -1 };

      // Shortest bypass path among neighbor pairs (use first vs each other)
      let best = Infinity;
      for (let i = 1; i < nbrs.length; i++) {
        const d = bfsDist(cells, size, start.x, start.y, nbrs[i].x, nbrs[i].y);
        if (d >= 0 && d < best) best = d;
      }
      return { bypassable: true, shortBypassLen: best === Infinity ? -1 : best };
    }

    const byBiome: BaselineReport['byBiome'] = {};
    const samples: GateSample[] = [];
    let quizGatesTotal = 0;
    let gatesWithEnoughNbrs = 0;
    let bypassableCount = 0;
    let cutPointCount = 0;
    let shortBypassSum = 0;
    let shortBypassN = 0;

    for (const [cx, cy] of coords) {
      const c = gen.generateChunkSync(cx, cy);
      const size = c.cells.length;
      const biomeName: string = c.biomeName || 'unknown';
      if (!byBiome[biomeName]) {
        byBiome[biomeName] = { chunks: 0, quizGates: 0, doorLocked: 0, tollGate: 0 };
      }
      byBiome[biomeName].chunks++;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const cell = c.cells[y][x];
          if (cell.assetKey === 'door_locked') byBiome[biomeName].doorLocked++;
          if (cell.assetKey === 'toll_gate') byBiome[biomeName].tollGate++;
          if (cell.assetKey !== 'quiz_gate') continue;

          quizGatesTotal++;
          byBiome[biomeName].quizGates++;
          const nbrs = walkableNbrs(c.cells, x, y, size);
          const { bypassable, shortBypassLen } = isBypassable(c.cells, size, x, y, nbrs);
          if (nbrs.length >= 2) gatesWithEnoughNbrs++;
          if (bypassable) {
            bypassableCount++;
            if (shortBypassLen >= 0) {
              shortBypassSum += shortBypassLen;
              shortBypassN++;
            }
          } else if (nbrs.length >= 2) {
            cutPointCount++;
          }
          samples.push({
            cx, cy, biomeName, x, y,
            walkNbrs: nbrs.length,
            bypassable,
            shortBypassLen,
          });
        }
      }
    }

    const denom = gatesWithEnoughNbrs > 0 ? gatesWithEnoughNbrs : 1;
    const report: BaselineReport = {
      chunksSampled: coords.length,
      byBiome,
      quizGatesTotal,
      gatesWithEnoughNbrs,
      bypassableCount,
      cutPointCount,
      bypassRate: bypassableCount / denom,
      meanShortBypassLen: shortBypassN > 0 ? shortBypassSum / shortBypassN : -1,
      samples,
    };
    return report;
  });
};

test.describe('Phase B: quiz-gate bypass baseline', () => {
  test('measure quiz_gate density + bypass rate across sampled chunks', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!(window as any).__gameDebug, undefined, { timeout: 15000 });

    const report = await page.evaluate(MEASURE_FN, [FIXED_WORDLIST, BIOME_SEED, SAMPLE_COORDS] as [
      string[],
      number,
      Array<[number, number]>,
    ]);

    // Always log full numbers — this IS the deliverable of Phase B.
    console.log('=== QUIZ GATE BYPASS BASELINE ===');
    console.log(JSON.stringify({
      chunksSampled: report.chunksSampled,
      byBiome: report.byBiome,
      quizGatesTotal: report.quizGatesTotal,
      gatesWithEnoughNbrs: report.gatesWithEnoughNbrs,
      bypassableCount: report.bypassableCount,
      cutPointCount: report.cutPointCount,
      bypassRate: report.bypassRate,
      meanShortBypassLen: report.meanShortBypassLen,
    }, null, 2));

    // Soft structural assertions: we need enough signal to act on Phase A.
    expect(report.chunksSampled, 'sample set must run').toBe(SAMPLE_COORDS.length);
    expect(
      report.quizGatesTotal,
      'expected some quiz_gates outside the meadow safe zone — if 0, biome sampling or placeQuizGates may be broken',
    ).toBeGreaterThan(0);

    // Document-only threshold: baseline is allowed (and expected) to be high.
    // Phase A success will re-run and assert a LOWER rate; we only assert
    // the metric is a real number in [0,1] here.
    expect(report.bypassRate).toBeGreaterThanOrEqual(0);
    expect(report.bypassRate).toBeLessThanOrEqual(1);

    // Attach a compact summary for the test report / CI log.
    test.info().annotations.push({
      type: 'baseline',
      description: `bypassRate=${report.bypassRate.toFixed(3)} gates=${report.quizGatesTotal} cutPoints=${report.cutPointCount}`,
    });
  });
});
