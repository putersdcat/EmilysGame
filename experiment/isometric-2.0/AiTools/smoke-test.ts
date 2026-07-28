/**
 * smoke-test.ts — Quick integration smoke test for new AiTools features.
 * Writes PNGs to test-assets/ for visual inspection.
 * Run: node --import tsx/esm smoke-test.ts
 */
import { renderGeoProof, renderVariationSweep } from './proof-renderer.js';
import { resolveNamedScene } from './scene-registry.js';
import { renderSvg } from './svg-renderer-tool.js';
import fs from 'node:fs';

const STONE_WALL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="#6a6a6a"/>
  <line x1="0" y1="43" x2="128" y2="43" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>
  <line x1="0" y1="85" x2="128" y2="85" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>
  <line x1="32" y1="43" x2="32" y2="85" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
  <line x1="96" y1="43" x2="96" y2="85" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
  <line x1="64" y1="0" x2="64" y2="43" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
</svg>`;

function save(name: string, buf: Buffer): void {
  fs.mkdirSync('./test-assets', { recursive: true });
  fs.writeFileSync(`./test-assets/${name}`, buf);
}

// 1. Geo proof — reference frame
const proof = renderGeoProof({ title: '3-Face Wall Extrusion — Iso 2.0 Reference' });
save('proof-reference.png', proof.png);
console.log(`✓ proof-reference.png  ${proof.width}×${proof.height}  ${proof.png.byteLength}B  ${proof.renderTimeMs}ms`);

// 2. Geo proof — overlay on stone wall SVG
const overlay = renderGeoProof({ variant: 'overlay', svg: STONE_WALL_SVG, title: 'Stone Wall Overlay Proof', col: 3, row: 5 });
save('proof-overlay.png', overlay.png);
console.log(`✓ proof-overlay.png    ${overlay.width}×${overlay.height}  ${overlay.png.byteLength}B`);

// 3. Variation sweep — texture rotation
const sweep = renderVariationSweep(STONE_WALL_SVG, 'textureRotation', [0, 90, 180, 270], { frameSize: 200 });
save('sweep-rotation.png', sweep.stripPng);
console.log(`✓ sweep-rotation.png   ${sweep.frameCount} frames  ${sweep.stripPng.byteLength}B`);

// 4. Variation sweep — zOffset
const sweepZ = renderVariationSweep(STONE_WALL_SVG, 'zOffset', [-2, 0, 2, 4], { frameSize: 200 });
save('sweep-zoffset.png', sweepZ.stripPng);
console.log(`✓ sweep-zoffset.png    ${sweepZ.frameCount} frames  ${sweepZ.stripPng.byteLength}B`);

// 5. Scene render — wall-h-run
const { chain: wallChain, descriptor: wallDesc } = resolveNamedScene('wall-h-run');
const wallScene = renderSvg('<svg/>', { mode: 'isometric_assembly', width: wallDesc.canvasWidth, height: wallDesc.canvasHeight, background: '#0d1117', assemblyChain: wallChain });
save('scene-wall-h-run.png', wallScene.png);
console.log(`✓ scene-wall-h-run.png ${wallScene.width}×${wallScene.height}  ${wallScene.png.byteLength}B`);

// 6. Scene render — all-nanos
const { chain: nanoChain } = resolveNamedScene('all-nanos');
const nanoScene = renderSvg('<svg/>', { mode: 'isometric_assembly', width: 1800, height: 500, background: '#0d1117', assemblyChain: nanoChain });
save('scene-all-nanos.png', nanoScene.png);
console.log(`✓ scene-all-nanos.png  ${nanoScene.width}×${nanoScene.height}  ${nanoScene.png.byteLength}B`);

// 7. Scene render — river crossing
const { chain: riverChain, descriptor: riverDesc } = resolveNamedScene('river-crossing');
const riverScene = renderSvg('<svg/>', { mode: 'isometric_assembly', width: riverDesc.canvasWidth, height: riverDesc.canvasHeight, background: '#0d1117', assemblyChain: riverChain });
save('scene-river-crossing.png', riverScene.png);
console.log(`✓ scene-river-crossing ${riverScene.width}×${riverScene.height}  ${riverScene.png.byteLength}B`);

console.log('\nAll smoke tests passed. Check test-assets/ for PNG output.');
