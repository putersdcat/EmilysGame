/**
 * Static SVG Rendering — Unit & Stress Tests
 */
import { renderSvgToPng, renderSvgPreview } from '../renderSvg.js';
import { runSuite, assert, assertThrows, concurrentRun, assertCompletesWithin, getMemoryMb } from './helpers.js';
import * as F from './fixtures.js';

export async function staticSvgTests() {
  return runSuite('Static SVG Rendering', [
    // ──── Basic functionality ────
    {
      name: 'renders tiny SVG to PNG',
      async fn() {
        const r = renderSvgToPng(F.TINY_SVG);
        assert(r.pngBuffer.length > 0, 'pngBuffer should not be empty');
        assert(r.metadata.width > 0, 'width > 0');
        assert(r.metadata.height > 0, 'height > 0');
        assert(r.metadata.mediaType === 'image/png', 'mediaType should be image/png');
        assert(r.metadata.sha256.length === 64, 'sha256 should be 64 hex chars');
      }
    },
    {
      name: 'renders standard SVG with gradients and text',
      async fn() {
        const r = renderSvgToPng(F.STANDARD_SVG, { size: 256 });
        assert(r.metadata.width === 256, `expected width=256, got ${r.metadata.width}`);
        assert(r.pngBuffer.length > 100, 'PNG should have substance');
      }
    },
    {
      name: 'legacy renderSvgPreview returns base64 and dataUri',
      async fn() {
        const r = renderSvgPreview(F.STANDARD_SVG);
        assert(typeof r.pngBase64 === 'string' && r.pngBase64.length > 0, 'pngBase64 should be non-empty');
        assert(r.dataUri.startsWith('data:image/png;base64,'), 'dataUri should start with data:image/png;base64,');
      }
    },

    // ──── Size clamping ────
    {
      name: 'clamps size below MIN_SIZE (16)',
      async fn() {
        const r = renderSvgToPng(F.TINY_SVG, { size: 1 });
        assert(r.metadata.width === 16, `expected width=16, got ${r.metadata.width}`);
        assert(r.metadata.warnings.some(w => w.includes('clamped')), 'should warn about clamping');
      }
    },
    {
      name: 'clamps size above MAX_SIZE (1024)',
      async fn() {
        const r = renderSvgToPng(F.TINY_SVG, { size: 9999 });
        assert(r.metadata.width === 1024, `expected width=1024, got ${r.metadata.width}`);
        assert(r.metadata.warnings.some(w => w.includes('clamped')), 'should warn about clamping');
      }
    },
    {
      name: 'default size is 128',
      async fn() {
        const r = renderSvgToPng(F.TINY_SVG);
        assert(r.metadata.width === 128, `expected width=128, got ${r.metadata.width}`);
      }
    },

    // ──── Background color ────
    {
      name: 'renders with explicit background color',
      async fn() {
        const r = renderSvgToPng(F.TINY_SVG, { background: '#ffffff' });
        assert(r.pngBuffer.length > 0, 'should render with background');
      }
    },

    // ──── Edge cases ────
    {
      name: 'throws on empty string',
      async fn() {
        await assertThrows(() => renderSvgToPng(F.EMPTY_SVG), 'non-empty');
      }
    },
    {
      name: 'throws on whitespace-only string',
      async fn() {
        await assertThrows(() => renderSvgToPng('   \n  '), 'non-empty');
      }
    },
    {
      name: 'throws on oversize SVG (>100k chars)',
      async fn() {
        const oversized = F.generateOversizeSvg();
        await assertThrows(() => renderSvgToPng(oversized), 'too large');
      }
    },
    {
      name: 'handles SVG with no visible content',
      async fn() {
        // Should not crash — just returns a mostly-empty PNG
        const r = renderSvgToPng(F.INVISIBLE_SVG);
        assert(r.pngBuffer.length > 0, 'should return a valid PNG even if empty');
      }
    },
    {
      name: 'warns about animated elements in static render',
      async fn() {
        const r = renderSvgToPng(F.ANIMATED_SVG_SMIL);
        assert(r.metadata.warnings.some(w => w.includes('Animated')), 'should warn about animation');
      }
    },
    {
      name: 'handles SVG with special chars / CDATA',
      async fn() {
        const r = renderSvgToPng(F.SPECIAL_CHARS_SVG);
        assert(r.pngBuffer.length > 0, 'should handle CDATA');
      }
    },
    {
      name: 'handles SVG with huge viewBox',
      async fn() {
        // Shouldn't crash / OOM — resvg clips to fit width constraint
        const r = await assertCompletesWithin(
          () => Promise.resolve(renderSvgToPng(F.HUGE_VIEWBOX_SVG, { size: 64 })),
          5000,
          'huge viewBox render'
        );
        assert(r.pngBuffer.length > 0, 'should produce output');
      }
    },

    // ──── Determinism ────
    {
      name: 'same SVG produces same sha256',
      async fn() {
        const a = renderSvgToPng(F.STANDARD_SVG, { size: 128 });
        const b = renderSvgToPng(F.STANDARD_SVG, { size: 128 });
        assert(a.metadata.sha256 === b.metadata.sha256, 'sha256 should be deterministic');
      }
    },
    {
      name: 'different sizes produce different sha256',
      async fn() {
        const a = renderSvgToPng(F.STANDARD_SVG, { size: 64 });
        const b = renderSvgToPng(F.STANDARD_SVG, { size: 256 });
        assert(a.metadata.sha256 !== b.metadata.sha256, 'different sizes should differ');
      }
    },

    // ──── Stress: rapid sequential ────
    {
      name: 'renders 100 SVGs sequentially under 10s',
      async fn() {
        const start = performance.now();
        for (let i = 0; i < 100; i++) {
          renderSvgToPng(F.STANDARD_SVG, { size: 64 + (i % 5) * 32 });
        }
        const elapsed = performance.now() - start;
        assert(elapsed < 10_000, `took ${Math.round(elapsed)}ms, expected < 10s`);
      }
    },

    // ──── Stress: concurrent ────
    {
      name: 'renders 50 SVGs concurrently without errors',
      async fn() {
        const { results, errors } = await concurrentRun(
          () => Promise.resolve(renderSvgToPng(F.STANDARD_SVG, { size: 128 })),
          50
        );
        assert(errors.length === 0, `${errors.length} errors: ${errors.map(e => e.message).join('; ')}`);
        assert(results.length === 50, `expected 50 results, got ${results.length}`);
      }
    },

    // ──── Stress: heavy SVG ────
    {
      name: 'renders heavy SVG (200 elements) under 3s',
      async fn() {
        const heavy = F.generateHeavySvg(200);
        const r = await assertCompletesWithin(
          () => Promise.resolve(renderSvgToPng(heavy, { size: 512 })),
          3000,
          'heavy SVG render'
        );
        assert(r.pngBuffer.length > 0, 'should produce output');
      }
    },
    {
      name: 'renders giant SVG (1000 elements) without OOM',
      async fn() {
        const giant = F.generateGiantSvg();
        const memBefore = getMemoryMb();
        const r = renderSvgToPng(giant, { size: 256 });
        const memAfter = getMemoryMb();
        assert(r.pngBuffer.length > 0, 'should produce output');
        assert(memAfter - memBefore < 200, `memory delta ${memAfter - memBefore}MB is too high`);
      }
    },

    // ──── Stress: mixed concurrent heavy ────
    {
      name: '20 concurrent heavy SVGs without crash',
      async fn() {
        const heavy = F.generateHeavySvg(100);
        const { errors } = await concurrentRun(
          () => Promise.resolve(renderSvgToPng(heavy, { size: 256 })),
          20
        );
        assert(errors.length === 0, `${errors.length} errors in concurrent heavy test`);
      }
    }
  ]);
}
