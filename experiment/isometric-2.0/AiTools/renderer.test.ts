/**
 * renderer.test.ts — Unit tests for AiTools SVG renderer edge cases.
 * Uses node:test (Node 18+). Run via: npm test
 * TODO: DOC — expand to cover nano assembly renderer once stable.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderSvg } from './svg-renderer-tool.js';

// ─── Fixtures ────────────────────────────────────────────────

const MINIMAL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="green"/></svg>';
const NO_VIEWBOX  = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="blue"/></svg>';
const TINY_SVG    = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="red"/></svg>';
const LARGE_SVG   = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1a1a2e"/>
  ${Array.from({ length: 50 }, (_, i) => `<circle cx="${i * 10}" cy="${i * 10}" r="5" fill="white"/>`).join('')}
</svg>`;

// ─── flat mode ───────────────────────────────────────────────

describe('renderSvg — flat mode (default)', () => {
  it('renders minimal valid SVG to 128×128 PNG', () => {
    const r = renderSvg(MINIMAL_SVG);
    assert.equal(r.mode, 'flat');
    assert.equal(r.width, 128);
    assert.equal(r.height, 128);
    assert.ok(r.png.byteLength > 100, 'PNG should have data');
    assert.ok(typeof r.base64 === 'string' && r.base64.length > 0, 'base64 non-empty');
    assert.ok(r.renderTimeMs >= 0);
  });

  it('renders SVG missing viewBox without crashing', () => {
    // resvg infers dimensions from width/height attributes
    const r = renderSvg(NO_VIEWBOX);
    assert.equal(r.mode, 'flat');
    assert.ok(r.png.byteLength > 100);
  });

  it('renders small 1×1 SVG without crash', () => {
    const r = renderSvg(TINY_SVG);
    assert.ok(r.png.byteLength > 0);
  });

  it('renders complex multi-element SVG', () => {
    const r = renderSvg(LARGE_SVG);
    assert.equal(r.mode, 'flat');
    assert.ok(r.png.byteLength > 100);
  });

  it('respects custom width/height override', () => {
    const r = renderSvg(MINIMAL_SVG, { width: 64, height: 64 });
    // resvg fitTo: width=64 → output should be 64px wide
    assert.equal(r.width, 64);
  });

  it('renders oversized (1024×1024) without crash', () => {
    const r = renderSvg(MINIMAL_SVG, { width: 1024, height: 1024 });
    assert.equal(r.width, 1024);
    assert.ok(r.png.byteLength > 1000, 'Large PNG should have substantial data');
  });

  it('applies background color (no transparent holes)', () => {
    const r1 = renderSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"></svg>', { background: '#ff0000' });
    const r2 = renderSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"></svg>');
    // Background changes the PNG — byte lengths will differ
    assert.notEqual(r1.png.byteLength, r2.png.byteLength, 'Background PNG should differ from transparent');
  });

  it('throws or errors gracefully on empty string', () => {
    // resvg throws on empty/invalid SVG — this is acceptable behaviour
    assert.throws(() => renderSvg(''), {
      // Just confirm it's an error, not a silent wrong output
      message: /.+/,
    });
  });

  it('throws or errors gracefully on non-SVG string', () => {
    assert.throws(() => renderSvg('<html><body>not svg</body></html>'));
  });
});

// ─── isometric mode ──────────────────────────────────────────

describe('renderSvg — isometric mode', () => {
  it('produces 256×128 diamond output by default', () => {
    const r = renderSvg(MINIMAL_SVG, { mode: 'isometric' });
    assert.equal(r.mode, 'isometric');
    assert.equal(r.width, 256);
    assert.equal(r.height, 128);
    assert.ok(r.png.byteLength > 100);
  });

  it('respects custom width/height override in isometric mode', () => {
    const r = renderSvg(MINIMAL_SVG, { mode: 'isometric', width: 512, height: 256 });
    assert.equal(r.width, 512);
  });

  it('renders SVG without viewBox in isometric mode', () => {
    const r = renderSvg(NO_VIEWBOX, { mode: 'isometric' });
    assert.equal(r.mode, 'isometric');
    assert.ok(r.png.byteLength > 100);
  });
});

// ─── isometric_z_pinned mode ─────────────────────────────────

describe('renderSvg — isometric_z_pinned mode', () => {
  it('produces 256×256 output by default (tall nano canvas)', () => {
    const r = renderSvg(MINIMAL_SVG, { mode: 'isometric_z_pinned' });
    assert.equal(r.mode, 'isometric_z_pinned');
    assert.equal(r.width, 256);
    assert.equal(r.height, 256);
    assert.ok(r.png.byteLength > 100);
  });

  it('handles narrow tall SVG in z-pinned mode', () => {
    const tallSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 256"><rect width="32" height="256" fill="#8B6914"/></svg>';
    const r = renderSvg(tallSvg, { mode: 'isometric_z_pinned' });
    assert.equal(r.mode, 'isometric_z_pinned');
    assert.ok(r.png.byteLength > 100);
  });
});

// ─── output determinism ──────────────────────────────────────

describe('renderSvg — output determinism', () => {
  it('same SVG + options always produces identical base64', () => {
    const a = renderSvg(MINIMAL_SVG, { mode: 'flat', width: 128 });
    const b = renderSvg(MINIMAL_SVG, { mode: 'flat', width: 128 });
    assert.equal(a.base64, b.base64, 'Renders must be deterministic');
  });

  it('different modes produce different output', () => {
    const flat = renderSvg(MINIMAL_SVG, { mode: 'flat' });
    const iso  = renderSvg(MINIMAL_SVG, { mode: 'isometric' });
    assert.notEqual(flat.base64, iso.base64, 'flat vs isometric must differ');
  });
});

// ─── renderGeoProof ──────────────────────────────────────────

import { renderGeoProof, renderVariationSweep } from './proof-renderer.js';
import { resolveNamedScene, listScenes, resolveScene, BUILT_IN_SCENES } from './scene-registry.js';

describe('renderGeoProof — reference mode', () => {
  it('returns a PNG with width=520 height=380 by default', () => {
    const r = renderGeoProof();
    assert.equal(r.proofVariant, 'reference');
    assert.equal(r.width, 520);
    assert.equal(r.height, 380);
    assert.ok(r.png.byteLength > 500, 'Proof PNG should have data');
    assert.ok(r.renderTimeMs >= 0);
  });

  it('respects custom width/height', () => {
    const r = renderGeoProof({ width: 400, height: 300 });
    assert.equal(r.width, 400);
  });

  it('overlay mode renders without error', () => {
    const r = renderGeoProof({ variant: 'overlay', svg: MINIMAL_SVG, col: 3, row: 7 });
    assert.equal(r.proofVariant, 'overlay');
    assert.ok(r.png.byteLength > 400);
  });

  it('can disable all overlays without crash', () => {
    const r = renderGeoProof({
      compassRose: false, axisArrows: false, faceLabels: false, coordLabels: false, boundOutline: false,
    });
    assert.ok(r.png.byteLength > 400);
  });

  it('renders with custom title', () => {
    const r = renderGeoProof({ title: 'Test proof title' });
    assert.ok(r.png.byteLength > 400);
  });
});

// ─── renderVariationSweep ────────────────────────────────────

describe('renderVariationSweep', () => {
  it('textureRotation sweep produces strip with count × frameSize width', () => {
    const values = [0, 90, 180, 270];
    const r = renderVariationSweep(MINIMAL_SVG, 'textureRotation', values, { frameSize: 120 });
    assert.equal(r.param, 'textureRotation');
    assert.deepEqual(r.values, values);
    assert.equal(r.frameCount, 4);
    assert.equal(r.frameWidth, 120);
    assert.ok(r.stripPng.byteLength > 500);
  });

  it('textureScale sweep works', () => {
    const r = renderVariationSweep(MINIMAL_SVG, 'textureScale', [0.5, 1, 1.5, 2]);
    assert.equal(r.frameCount, 4);
    assert.ok(r.stripPng.byteLength > 500);
  });

  it('zOffset sweep works', () => {
    const r = renderVariationSweep(MINIMAL_SVG, 'zOffset', [-2, 0, 2, 4]);
    assert.equal(r.frameCount, 4);
    assert.ok(r.stripPng.byteLength > 500);
  });

  it('opacity sweep works', () => {
    const r = renderVariationSweep(MINIMAL_SVG, 'opacity', [0.3, 0.6, 0.8, 1.0]);
    assert.equal(r.frameCount, 4);
    assert.ok(r.stripPng.byteLength > 500);
  });

  it('single-value sweep does not crash', () => {
    const r = renderVariationSweep(MINIMAL_SVG, 'textureRotation', [45]);
    assert.equal(r.frameCount, 1);
  });
});

// ─── scene-registry ──────────────────────────────────────────

describe('scene-registry — listScenes', () => {
  it('returns at least 7 built-in scenes', () => {
    const scenes = listScenes();
    assert.ok(scenes.length >= 7, `Expected ≥7 scenes, got ${scenes.length}`);
  });

  it('every scene has a name and description', () => {
    const scenes = listScenes();
    for (const s of scenes) {
      assert.ok(typeof s.name === 'string' && s.name.length > 0, `Scene missing name: ${JSON.stringify(s)}`);
      assert.ok(typeof s.description === 'string' && s.description.length > 0);
      assert.ok(s.tileCount > 0, `Scene "${s.name}" has no tiles`);
    }
  });
});

describe('scene-registry — resolveNamedScene', () => {
  for (const name of Object.keys(BUILT_IN_SCENES)) {
    it(`resolves "${name}" to a non-empty AssemblyChainItem array`, () => {
      const { chain } = resolveNamedScene(name);
      assert.ok(chain.length > 0, `Scene "${name}" resolved to empty chain`);
      for (const item of chain) {
        assert.ok(typeof item.svg === 'string' && item.svg.includes('<svg'), `Item svg invalid in scene "${name}"`);
        assert.ok(typeof item.col === 'number');
        assert.ok(typeof item.row === 'number');
      }
    });
  }

  it('throws on unknown scene name', () => {
    assert.throws(() => resolveNamedScene('does-not-exist'), /Unknown scene/);
  });
});

describe('scene-registry — resolveScene (custom)', () => {
  it('resolves a custom scene with mixed tile and nano kinds', () => {
    const chain = resolveScene({
      name: 'test', description: 'test', entries: [
        { kind: 'grass', col: 0, row: 0 },
        { kind: 'stone-wall', col: 0, row: 0 },
        { kind: 'river', col: 1, row: 0 },
      ],
    });
    assert.equal(chain.length, 3);
    assert.equal(chain[0].zMode, 'flat');   // grass base
    assert.equal(chain[1].zMode, 'positive'); // stone-wall
    assert.equal(chain[2].zMode, 'negative'); // river
  });
});

describe('scene-registry — round-trip render', () => {
  it('renders wall-h-run scene without crash', () => {
    const { chain, descriptor } = resolveNamedScene('wall-h-run');
    const result = renderSvg('<svg/>', {
      mode: 'isometric_assembly',
      width: descriptor.canvasWidth ?? 1024,
      height: descriptor.canvasHeight ?? 512,
      background: '#0d1117',
      assemblyChain: chain,
    });
    assert.equal(result.mode, 'isometric_assembly');
    assert.ok(result.png.byteLength > 1000, 'Rendered scene should have substantial data');
  });

  it('renders mixed-biomes scene without crash', () => {
    const { chain } = resolveNamedScene('mixed-biomes');
    const result = renderSvg('<svg/>', {
      mode: 'isometric_assembly',
      width: 900,
      height: 300,
      assemblyChain: chain,
    });
    assert.ok(result.png.byteLength > 500);
  });
});
