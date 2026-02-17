/**
 * Stress Tests — push the system to its limits.
 * These tests are intentionally brutal to find crash/OOM/hang scenarios.
 */
import { renderSvgToPng } from '../renderSvg.js';
import { renderAnimatedSvgPreview } from '../renderAnimatedSvg.js';
import { shutdownBrowserPool, getPoolStats } from '../browserPool.js';
import { runSuite, assert, assertThrows, concurrentRun, assertCompletesWithin, getMemoryMb } from './helpers.js';
import * as F from './fixtures.js';

export async function stressTests() {
  return runSuite('Stress Tests', [
    // ──── Static: rapid fire ────
    {
      name: 'static: 500 sequential renders under 10s',
      async fn() {
        const start = performance.now();
        for (let i = 0; i < 500; i++) {
          renderSvgToPng(F.TINY_SVG, { size: 32 + (i % 8) * 8 });
        }
        const elapsed = performance.now() - start;
        assert(elapsed < 10_000, `took ${Math.round(elapsed)}ms, expected < 10s`);
        process.stdout.write(`    ↳ 500 renders in ${Math.round(elapsed)}ms (${(elapsed / 500).toFixed(1)}ms/render)\n`);
      }
    },
    {
      name: 'static: 100 concurrent renders',
      async fn() {
        const { results, errors, durationMs } = await concurrentRun(
          () => Promise.resolve(renderSvgToPng(F.STANDARD_SVG, { size: 128 })),
          100
        );
        process.stdout.write(`    ↳ 100 concurrent: ${durationMs}ms, ${errors.length} errors\n`);
        assert(errors.length === 0, `${errors.length} errors in concurrent stress`);
        assert(results.length === 100, `expected 100 results`);
      }
    },
    {
      name: 'static: 50 concurrent heavy SVGs (500 elements)',
      async fn() {
        const heavy = F.generateHeavySvg(500);
        const { errors, durationMs } = await concurrentRun(
          () => Promise.resolve(renderSvgToPng(heavy, { size: 512 })),
          50
        );
        process.stdout.write(`    ↳ 50 heavy concurrent: ${durationMs}ms, ${errors.length} errors\n`);
        assert(errors.length === 0, `${errors.length} errors`);
      }
    },

    // ──── Animated: oversize SVG validation ────
    {
      name: 'animated: rejects oversize SVG (>100k chars)',
      async fn() {
        const oversized = F.generateOversizeSvg();
        await assertThrows(() => renderAnimatedSvgPreview(oversized), 'too large');
      }
    },

    // ──── Animated: rapid sequential ────
    {
      name: 'animated: 10 rapid sequential renders',
      async fn() {
        const start = performance.now();
        for (let i = 0; i < 10; i++) {
          await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 2, durationMs: 500 });
        }
        const elapsed = performance.now() - start;
        process.stdout.write(`    ↳ 10 sequential: ${Math.round(elapsed)}ms (${(elapsed / 10).toFixed(0)}ms/render)\n`);
      }
    },

    // ──── Animated: concurrent hammering ────
    {
      name: 'animated: 8 concurrent renders (at concurrency limit)',
      async fn() {
        const { results, errors, durationMs } = await concurrentRun(
          () => renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 2, durationMs: 500 }),
          8
        );
        process.stdout.write(`    ↳ 8 concurrent: ${durationMs}ms, ${errors.length} errors\n`);
        assert(errors.length === 0, `${errors.length} errors: ${errors.map(e => e.message).join('; ')}`);
        assert(results.length === 8, `expected 8 results, got ${results.length}`);
      }
    },
    {
      name: 'animated: 12 concurrent renders (exceeds concurrency limit, tests queue)',
      async fn() {
        const { results, errors, durationMs } = await concurrentRun(
          () => renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 2, durationMs: 500 }),
          12
        );
        process.stdout.write(`    ↳ 12 concurrent: ${durationMs}ms, ${errors.length} errors\n`);
        assert(errors.length === 0, `${errors.length} errors: ${errors.map(e => e.message).join('; ')}`);
        assert(results.length === 12, `expected 12 results, got ${results.length}`);
      }
    },

    // ──── Animated: mixed SVG types concurrent ────
    {
      name: 'animated: mixed SVGs concurrent (SMIL + CSS + complex)',
      async fn() {
        const svgs = [
          F.ANIMATED_SVG_SMIL,
          F.ANIMATED_SVG_CSS,
          F.ANIMATED_SVG_COMPLEX,
          F.ANIMATED_SVG_DUR,
          F.ANIMATED_SVG_SMIL,
          F.ANIMATED_SVG_CSS,
        ];
        const { results, errors, durationMs } = await concurrentRun(
          async () => {
            const svg = svgs[Math.floor(Math.random() * svgs.length)];
            return renderAnimatedSvgPreview(svg, { frameCount: 3, durationMs: 1000 });
          },
          6
        );
        process.stdout.write(`    ↳ 6 mixed concurrent: ${durationMs}ms, ${errors.length} errors\n`);
        assert(errors.length === 0, `${errors.length} errors`);
        assert(results.length === 6, `expected 6 results`);
      }
    },

    // ──── Static + Animated interleaved ────
    {
      name: 'interleaved: static and animated concurrent',
      async fn() {
        const promises: Promise<any>[] = [];
        // 20 static + 4 animated simultaneously
        for (let i = 0; i < 20; i++) {
          promises.push(Promise.resolve(renderSvgToPng(F.STANDARD_SVG, { size: 64 + (i % 4) * 32 })));
        }
        for (let i = 0; i < 4; i++) {
          promises.push(renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 2, durationMs: 500 }));
        }
        const outcomes = await Promise.allSettled(promises);
        const failures = outcomes.filter(o => o.status === 'rejected');
        assert(failures.length === 0, `${failures.length} failures in interleaved test`);
      }
    },

    // ──── Memory stress ────
    {
      name: 'memory: 20 animated renders, check for leak',
      async fn() {
        if (typeof global.gc === 'function') global.gc();
        const memBefore = getMemoryMb();
        for (let i = 0; i < 20; i++) {
          await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 2, durationMs: 500 });
        }
        if (typeof global.gc === 'function') global.gc();
        const memAfter = getMemoryMb();
        const delta = memAfter - memBefore;
        process.stdout.write(`    ↳ Memory: ${memBefore}MB → ${memAfter}MB (Δ${delta.toFixed(1)}MB)\n`);
        assert(delta < 200, `memory grew by ${delta.toFixed(1)}MB — possible leak`);
      }
    },

    // ──── Browser pool resilience ────
    {
      name: 'pool: stats report correct after operations',
      async fn() {
        // After all previous tests, pool should be idle.
        // Give a moment for pages to close.
        await new Promise(r => setTimeout(r, 100));
        const stats = getPoolStats();
        assert(stats.browserAlive, 'browser should still be alive');
        assert(stats.activePages === 0, `expected 0 active pages, got ${stats.activePages}`);
        assert(stats.queueLength === 0, `expected 0 queue, got ${stats.queueLength}`);
      }
    },
    {
      name: 'pool: survives shutdown + restart cycle',
      async fn() {
        // Force shutdown
        await shutdownBrowserPool();
        const stats1 = getPoolStats();
        assert(!stats1.browserAlive, 'browser should be dead after shutdown');

        // Should auto-restart on next call
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 1 });
        assert(r.frames.length === 1, 'should render after restart');

        const stats2 = getPoolStats();
        assert(stats2.browserAlive, 'browser should be alive after restart');
      }
    },

    // ──── Error resilience ────
    {
      name: 'resilience: bad SVGs do not kill the pool for subsequent calls',
      async fn() {
        // Send a few bad SVGs
        const badSvgs = [F.EMPTY_SVG, '<div>nope</div>', '   '];
        for (const bad of badSvgs) {
          try {
            await renderAnimatedSvgPreview(bad, { frameCount: 1 });
          } catch {
            // Expected
          }
        }

        // Pool should still work after errors
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 2, durationMs: 500 });
        assert(r.frames.length === 2, 'pool should recover after errors');
      }
    },

    // ──── Large frame count stress ────
    {
      name: 'animated: 60 frames at max size (1024px)',
      async fn() {
        const r = await assertCompletesWithin(
          () => renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 60, size: 1024, durationMs: 2000 }),
          120_000,
          '60 frames @ 1024px'
        );
        assert(r.frames.length === 60, `expected 60 frames, got ${r.frames.length}`);
        assert(r.storyboard != null, 'storyboard should exist');
        process.stdout.write(`    ↳ 60 frames @ 1024px: ${r.metadata.bytesTotal} bytes total\n`);
      }
    },
  ]);
}
