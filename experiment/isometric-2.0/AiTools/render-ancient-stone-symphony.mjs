/**
 * render-ancient-stone-symphony.mjs — Symphony render for the
 * ancient-stone (irregular Voronoi) wall texture.
 *
 * Same scene as render-clinker-symphony.mjs and the canonical
 * walls-huggers-iter04 reference: closed wall enclosure + four
 * nano-snapped wall huggers (N / E / S / W). The only thing that
 * changes is the texture name, which is the entire point — every
 * upstream invariant (texture-agnostic geometry, pluggable pipeline,
 * centroid depth-sort, nano-snapped huggers) must hold under a
 * texture authored as POLYGONS instead of rectangles.
 *
 * Usage:
 *   node render-ancient-stone-symphony.mjs <outName> [--layers]
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');
const outName = process.argv[2] ?? 'ancient-stone-symphony.png';
const layers  = process.argv.includes('--layers');
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

const entries = [];
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    entries.push({ kind: 'grass', col: c, row: r });
  }
}
const W = (col, row, variant) => ({ kind: 'stone-wall', col, row, variant, texture: 'ancient-stone' });
entries.push(W(1, 1, 'corner-br'));
entries.push(W(3, 1, 'corner-bl'));
entries.push(W(1, 3, 'corner-tr'));
entries.push(W(3, 3, 'corner-tl'));
entries.push(W(2, 1, 'straight-h'));
entries.push(W(2, 3, 'straight-h'));
entries.push(W(1, 2, 'straight-v'));
entries.push(W(3, 2, 'straight-v'));

const players = [
  { col: 2, row: 1, nanoCol: 1, nanoRow: 2, label: 'N' },
  { col: 3, row: 2, nanoCol: 0, nanoRow: 1, label: 'E' },
  { col: 2, row: 3, nanoCol: 1, nanoRow: 0, label: 'S' },
  { col: 1, row: 2, nanoCol: 2, nanoRow: 1, label: 'W' },
];

const args = {
  entries,
  width: 1600,
  height: 1100,
  background: '#0d1117',
  players,
  geometryLayers: layers,
  outputPath,
};

const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_nano_scene'], {
  input: JSON.stringify(args),
  maxBuffer: 80 * 1024 * 1024,
  cwd: __dirname,
  timeout: 90_000,
});
const res = JSON.parse(out.toString('utf8'));
if (!res.ok) { console.error('FAIL:', res.error); process.exit(1); }
console.log(`OK ${res.structuredContent?.bytes}b → ${outputPath}`);
