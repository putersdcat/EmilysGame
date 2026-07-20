/**
 * critical-path-boot.spec.ts — Critical-path instrumentation harness (PR1).
 *
 * Verifies boot marks are readable via __gameDebug after cold load:
 *   - gen.chunk {cx, cy, ms} and/or boot.ensureChunks {count, ms, maxChunkMs, p95ChunkMs}
 * No hard latency threshold (honest baseline only).
 *
 * Run: npx playwright test tests/perf/critical-path-boot --reporter=line
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

type BootMark = {
  name: string;
  t: number;
  detail?: Record<string, unknown>;
};

async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  // Cold load can take a while while 3×3 chunks generate solid.
  await page.waitForFunction(
    () => !!(window as unknown as { __gameDebug?: { state?: { chunks?: { size: number } }; bootMarks?: () => unknown } }).__gameDebug?.bootMarks
      && ((window as unknown as { __gameDebug: { state?: { chunks?: { size: number } } } }).__gameDebug?.state?.chunks?.size ?? 0) > 0,
    { timeout: 90_000 },
  );
}

test.describe('Critical-path instrumentation harness', () => {
  test('bootMarks exposes gen.chunk or boot.ensureChunks with ms', async ({ page }) => {
    await waitForGame(page);

    const snapshot = await page.evaluate(() => {
      const dbg = (window as unknown as {
        __gameDebug: {
          bootMarks: () => BootMark[];
          bootMarksNamed: (n: string) => BootMark[];
        };
      }).__gameDebug;
      const all = dbg.bootMarks();
      const genChunk = dbg.bootMarksNamed('gen.chunk');
      const ensure = dbg.bootMarksNamed('boot.ensureChunks');
      return {
        names: all.map((m) => m.name),
        genChunk: genChunk.map((m) => m.detail ?? {}),
        ensure: ensure.map((m) => m.detail ?? {}),
      };
    });

    // At least one of the primary harness marks must be present with ms.
    const hasGenChunk = snapshot.genChunk.some(
      (d) => typeof d.ms === 'number' && Number.isFinite(d.ms as number),
    );
    const hasEnsure = snapshot.ensure.some(
      (d) => typeof d.ms === 'number' && Number.isFinite(d.ms as number),
    );
    expect(hasGenChunk || hasEnsure).toBe(true);

    if (hasEnsure) {
      const detail = snapshot.ensure[0];
      expect(typeof detail.count).toBe('number');
      expect(typeof detail.ms).toBe('number');
      // Extended fields from PR1 (may be 0 if count was 0, but cold load generates).
      expect(typeof detail.maxChunkMs).toBe('number');
      expect(typeof detail.p95ChunkMs).toBe('number');
    }

    if (hasGenChunk) {
      const sample = snapshot.genChunk[0];
      expect(typeof sample.cx).toBe('number');
      expect(typeof sample.cy).toBe('number');
      expect(typeof sample.ms).toBe('number');
      // Log baseline for PR summary (no hard threshold).
      // eslint-disable-next-line no-console
      console.log('[critical-path baseline] gen.chunk samples:', snapshot.genChunk);
      // eslint-disable-next-line no-console
      console.log('[critical-path baseline] boot.ensureChunks:', snapshot.ensure);
    }
  });

  test('bootMarksNamed filters by name', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const dbg = (window as unknown as {
        __gameDebug: {
          bootMarks: () => BootMark[];
          bootMarksNamed: (n: string) => BootMark[];
        };
      }).__gameDebug;
      const all = dbg.bootMarks();
      const ensureName = 'boot.ensureChunks';
      const named = dbg.bootMarksNamed(ensureName);
      const fromAll = all.filter((m) => m.name === ensureName);
      const unknown = dbg.bootMarksNamed('__no_such_mark__');
      return {
        namedLen: named.length,
        fromAllLen: fromAll.length,
        allSameName: named.every((m) => m.name === ensureName),
        unknownLen: unknown.length,
      };
    });

    // Cold boot must have emitted ensure marks — empty named would make .every vacuously true.
    expect(result.namedLen).toBeGreaterThanOrEqual(1);
    expect(result.fromAllLen).toBe(result.namedLen);
    expect(result.allSameName).toBe(true);
    expect(result.unknownLen).toBe(0);
  });
});
