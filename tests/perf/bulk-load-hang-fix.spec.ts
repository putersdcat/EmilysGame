/**
 * bulk-load-hang-fix.spec.ts — Critical-path PR2 hang fix.
 *
 * Automated AC:
 *   - Multi-chunk bulk emits boot.chunkProgress N/M marks (inter-chunk yield path)
 *   - boot.ensureChunks present with count ≥ 2 on cold load
 *   - Slot-load catch path uses ensureChunksAroundYielding under spinner,
 *     never sync ensureChunksAround (static source guard)
 *
 * Does NOT claim per-chunk solid gen < 100ms.
 *
 * Run: npx playwright test tests/perf/bulk-load-hang-fix --reporter=line
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:5173/?test=1';

type BootMark = {
  name: string;
  t: number;
  detail?: Record<string, unknown>;
};

async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const dbg = (window as unknown as {
        __gameDebug?: { state?: { chunks?: { size: number } }; bootMarks?: () => unknown };
      }).__gameDebug;
      return !!(dbg?.bootMarks) && (dbg?.state?.chunks?.size ?? 0) > 0;
    },
    { timeout: 90_000 },
  );
}

test.describe('Critical-path bulk-load hang fix', () => {
  test('multi-chunk bulk emits inter-chunk progress marks + ensureChunks', async ({ page }) => {
    await waitForGame(page);

    const snapshot = await page.evaluate(() => {
      const dbg = (window as unknown as {
        __gameDebug: {
          bootMarks: () => BootMark[];
          bootMarksNamed: (n: string) => BootMark[];
        };
      }).__gameDebug;
      const progress = dbg.bootMarksNamed('boot.chunkProgress');
      const ensure = dbg.bootMarksNamed('boot.ensureChunks');
      const genChunk = dbg.bootMarksNamed('gen.chunk');
      return {
        progress: progress.map((m) => m.detail ?? {}),
        ensure: ensure.map((m) => m.detail ?? {}),
        genChunkCount: genChunk.length,
      };
    });

    // Cold load generates the 3×3 viewport buffer (up to 9 chunks).
    expect(
      snapshot.progress.length,
      'expected multi-chunk boot.chunkProgress marks (N/M)',
    ).toBeGreaterThanOrEqual(2);

    // N climbs 1..M with stable M.
    const first = snapshot.progress[0];
    const last = snapshot.progress[snapshot.progress.length - 1];
    expect(typeof first.n).toBe('number');
    expect(typeof first.m).toBe('number');
    expect(first.n).toBe(1);
    expect(last.n).toBe(snapshot.progress.length);
    expect(last.m).toBe(first.m);
    expect(last.n).toBe(last.m);

    // Monotonic n and constant m across the batch.
    for (let i = 0; i < snapshot.progress.length; i++) {
      const d = snapshot.progress[i];
      expect(d.n).toBe(i + 1);
      expect(d.m).toBe(first.m);
    }

    expect(snapshot.ensure.length).toBeGreaterThanOrEqual(1);
    const ensureDetail = snapshot.ensure[0];
    expect(typeof ensureDetail.count).toBe('number');
    expect(ensureDetail.count as number).toBeGreaterThanOrEqual(2);
    expect(typeof ensureDetail.ms).toBe('number');

    // Residual solid per-chunk cost is documented via gen.chunk — not a failure.
    // eslint-disable-next-line no-console
    console.log('[hang-fix] boot.chunkProgress:', snapshot.progress);
    // eslint-disable-next-line no-console
    console.log('[hang-fix] boot.ensureChunks:', snapshot.ensure);
    // eslint-disable-next-line no-console
    console.log('[hang-fix] gen.chunk count:', snapshot.genChunkCount);
  });

  test('slot-actions catch path uses yielding ensure under spinner (not sync)', () => {
    const slotPath = path.join(process.cwd(), 'src/game/slot-actions.ts');
    const src = fs.readFileSync(slotPath, 'utf-8');

    // Catch recovery must re-enter spinner + yielding bulk gen.
    expect(src).toMatch(/ensureChunksAroundYielding/);
    expect(src).toMatch(/withWorldLoading/);

    // Sync multi-chunk ensure is forbidden on this UI/error path.
    expect(src).not.toMatch(/\bensureChunksAround\s*\(/);
    // Import must not pull the sync API either.
    expect(src).not.toMatch(/import\s*\{[^}]*\bensureChunksAround\b[^}]*\}\s*from\s*['"]\.\/chunk-lifecycle['"]/);
  });

  test('UI/boot paths never call sync ensureChunksAround', () => {
    const files = [
      'src/game/state-init.ts',
      'src/game/save-apply.ts',
      'src/game/game-reset.ts',
      'src/game/slot-actions.ts',
      'src/game/new-game-flow.ts',
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
      expect(
        src,
        `${rel} must not call sync ensureChunksAround(`,
      ).not.toMatch(/\bensureChunksAround\s*\(/);
      // May mention the name in comments — only ban the call form above.
    }
  });
});
