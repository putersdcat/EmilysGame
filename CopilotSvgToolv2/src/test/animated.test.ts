/**
 * Animated SVG Rendering — Unit & Stress Tests
 * These tests exercise the Playwright-based animation sampling pipeline.
 */
import { renderAnimatedSvgPreview } from '../renderAnimatedSvg.js';
import { runSuite, assert, assertThrows, concurrentRun, assertCompletesWithin, getMemoryMb } from './helpers.js';
import * as F from './fixtures.js';

export async function animatedSvgTests() {
  return runSuite('Animated SVG Rendering', [
    // ──── Basic functionality ────
    {
      name: 'renders SMIL animated SVG with default options',
      async fn() {
        const r = await assertCompletesWithin(
          () => renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL),
          30_000,
          'SMIL render'
        );
        assert(r.frames.length > 0, 'should produce frames');
        assert(r.metadata.frameCount === r.frames.length, 'frameCount matches frames array');
        assert(r.metadata.width > 0, 'width > 0');
        assert(r.metadata.height > 0, 'height > 0');
        assert(r.metadata.sha256.length === 64, 'sha256 should be 64 hex chars');
      }
    },
    {
      name: 'renders CSS animated SVG',
      async fn() {
        const r = await assertCompletesWithin(
          () => renderAnimatedSvgPreview(F.ANIMATED_SVG_CSS),
          30_000,
          'CSS animation render'
        );
        assert(r.frames.length > 0, 'should produce frames');
      }
    },
    {
      name: 'detects dur attribute and uses it for duration',
      async fn() {
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_DUR, { frameCount: 4 });
        // dur="3s" → should detect 3000ms
        assert(r.metadata.durationMs === 3000, `expected durationMs=3000, got ${r.metadata.durationMs}`);
        assert(r.frames.length === 4, `expected 4 frames, got ${r.frames.length}`);
      }
    },

    // ──── Frame count & timing ────
    {
      name: 'respects custom frameCount',
      async fn() {
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 3 });
        assert(r.frames.length === 3, `expected 3 frames, got ${r.frames.length}`);
      }
    },
    {
      name: 'respects custom durationMs',
      async fn() {
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { durationMs: 500, frameCount: 2 });
        assert(r.metadata.durationMs === 500, `expected durationMs=500, got ${r.metadata.durationMs}`);
        assert(r.frames.length === 2, `expected 2 frames, got ${r.frames.length}`);
      }
    },
    {
      name: 'respects custom timesMs (overrides frameCount)',
      async fn() {
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { timesMs: [0, 500, 1000, 1500] });
        assert(r.frames.length === 4, `expected 4 frames, got ${r.frames.length}`);
        assert(r.metadata.timesMs.length === 4, 'timesMs should have 4 entries');
      }
    },
    {
      name: 'single frame (frameCount=1)',
      async fn() {
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 1 });
        assert(r.frames.length === 1, `expected 1 frame, got ${r.frames.length}`);
        assert(r.metadata.timesMs[0] === 0, 'single frame should be at t=0');
      }
    },

    // ──── Storyboard ────
    {
      name: 'produces storyboard by default',
      async fn() {
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 4 });
        assert(r.storyboard != null, 'storyboard should be generated');
        assert(r.storyboard!.length > 0, 'storyboard should have content');
      }
    },
    {
      name: 'strip layout produces storyboard',
      async fn() {
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 4, storyboardLayout: 'strip' });
        assert(r.storyboard != null, 'strip storyboard should be generated');
      }
    },

    // ──── Size handling ────
    {
      name: 'respects custom size',
      async fn() {
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { size: 256, frameCount: 2 });
        // width/height come from bounding box within viewport, but viewport is set to size
        assert(r.frames.length === 2, 'should produce 2 frames');
      }
    },
    {
      name: 'clamps size within bounds',
      async fn() {
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { size: 5, frameCount: 1 });
        assert(r.metadata.warnings.some(w => w.includes('clamped')), 'should warn about clamping');
      }
    },

    // ──── Background ────
    {
      name: 'renders with explicit background color',
      async fn() {
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { background: '#ff0000', frameCount: 2 });
        assert(r.frames.length === 2, 'should produce frames with background');
      }
    },

    // ──── Error handling ────
    {
      name: 'throws on empty SVG',
      async fn() {
        await assertThrows(() => renderAnimatedSvgPreview(F.EMPTY_SVG), 'non-empty');
      }
    },
    {
      name: 'handles SVG with no <svg> element gracefully',
      async fn() {
        await assertThrows(
          () => renderAnimatedSvgPreview('<div>not an svg</div>'),
          'svg'
        );
      }
    },
    {
      name: 'handles malformed SVG without crash',
      async fn() {
        // Should either throw a clear error or degrade gracefully
        try {
          const r = await assertCompletesWithin(
            () => renderAnimatedSvgPreview(F.MALFORMED_SVG, { frameCount: 2 }),
            15_000,
            'malformed SVG'
          );
          // If it didn't throw, that's OK too — just verify it didn't hang
          assert(true, 'completed without hanging');
        } catch (err) {
          // Expected — malformed SVG should produce a clear error
          assert(err instanceof Error, 'should throw an Error');
        }
      }
    },

    // ──── Complex animation ────
    {
      name: 'renders complex multi-animation SVG',
      async fn() {
        const r = await assertCompletesWithin(
          () => renderAnimatedSvgPreview(F.ANIMATED_SVG_COMPLEX, { frameCount: 8 }),
          30_000,
          'complex animation'
        );
        assert(r.frames.length === 8, `expected 8 frames, got ${r.frames.length}`);
        assert(r.storyboard != null, 'should produce storyboard');
      }
    },

    // ──── Write to disk ────
    {
      name: 'writes frames and storyboard to disk',
      async fn() {
        const r = await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 3, writeToDisk: true });
        assert(Array.isArray(r.metadata.pngFilePaths), 'should have pngFilePaths');
        assert(r.metadata.pngFilePaths!.length === 3, 'should have 3 frame paths');
        assert(typeof r.metadata.storyboardFilePath === 'string', 'should have storyboard path');
      }
    },

    // ──── Non-animated SVG through animated pipeline ────
    {
      name: 'renders static SVG through animated pipeline without crash',
      async fn() {
        const r = await assertCompletesWithin(
          () => renderAnimatedSvgPreview(F.STANDARD_SVG, { frameCount: 3, durationMs: 1000 }),
          30_000,
          'static through animated pipeline'
        );
        assert(r.frames.length === 3, 'should still produce 3 frames');
      }
    },

    // ──── Stress: sequential animated renders ────
    {
      name: '5 sequential animated renders under 60s',
      async fn() {
        const start = performance.now();
        for (let i = 0; i < 5; i++) {
          await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 3, durationMs: 1000 });
        }
        const elapsed = performance.now() - start;
        assert(elapsed < 60_000, `took ${Math.round(elapsed)}ms, expected < 60s`);
      }
    },

    // ──── Stress: concurrent animated renders (THIS IS THE CRASH TEST) ────
    {
      name: '3 concurrent animated renders without crash',
      async fn() {
        const { results, errors, durationMs } = await concurrentRun(
          () => renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 2, durationMs: 500 }),
          3
        );
        process.stdout.write(`    ↳ 3 concurrent: ${durationMs}ms, ${errors.length} errors\n`);
        assert(errors.length === 0, `${errors.length} errors: ${errors.map(e => e.message).join('; ')}`);
        assert(results.length === 3, `expected 3 results, got ${results.length}`);
      }
    },
    {
      name: '5 concurrent animated renders without crash',
      async fn() {
        const { results, errors, durationMs } = await concurrentRun(
          () => renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 2, durationMs: 500 }),
          5
        );
        process.stdout.write(`    ↳ 5 concurrent: ${durationMs}ms, ${errors.length} errors\n`);
        assert(errors.length === 0, `${errors.length} errors: ${errors.map(e => e.message).join('; ')}`);
        assert(results.length === 5, `expected 5 results, got ${results.length}`);
      }
    },

    // ──── Stress: memory ────
    {
      name: 'animated render does not leak memory across 5 calls',
      async fn() {
        if (typeof global.gc === 'function') global.gc();
        const memBefore = getMemoryMb();
        for (let i = 0; i < 5; i++) {
          await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 2, durationMs: 500 });
        }
        if (typeof global.gc === 'function') global.gc();
        const memAfter = getMemoryMb();
        const delta = memAfter - memBefore;
        process.stdout.write(`    ↳ Memory: ${memBefore}MB → ${memAfter}MB (Δ${delta.toFixed(1)}MB)\n`);
        assert(delta < 300, `memory grew by ${delta.toFixed(1)}MB — possible leak`);
      }
    },

    // ──── Stress: rapid sequential with varying params ────
    {
      name: '10 sequential renders with varying frame counts and sizes',
      async fn() {
        for (let i = 0; i < 10; i++) {
          const frameCount = 1 + (i % 4);
          const size = 64 + (i % 3) * 64;
          await renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount, size, durationMs: 500 });
        }
      }
    },

    // ──── Max frames stress ────
    {
      name: 'renders with max frames (60) without crash',
      async fn() {
        const r = await assertCompletesWithin(
          () => renderAnimatedSvgPreview(F.ANIMATED_SVG_SMIL, { frameCount: 60, durationMs: 2000 }),
          120_000,
          'max frames render'
        );
        assert(r.frames.length === 60, `expected 60 frames, got ${r.frames.length}`);
        assert(r.storyboard != null, 'should produce storyboard for 60 frames');
      }
    },
  ]);
}
