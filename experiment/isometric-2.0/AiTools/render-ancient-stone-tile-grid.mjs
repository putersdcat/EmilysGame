/**
 * render-ancient-stone-tile-grid.mjs — 2×2 grid of plain stone-wall
 * tiles textured with ancient-stone. The point of this render is NOT
 * the iso scene per se but to inspect SEAM CONTINUITY: each adjacent
 * tile should appear as a continuation of the same Voronoi
 * tessellation, not as a visibly repeating image.
 *
 * If any vertical or horizontal seam shows a hard line of mortar
 * coincident with the tile boundary, the toroidal-Voronoi periodic
 * neighbour clipping is broken.
 *
 * Usage: node render-ancient-stone-tile-grid.mjs <outName>
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');
const outName = process.argv[2] ?? 'ancient-stone-grid.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

const entries = [];
// 4×4 grass under a 2×2 wall block — straight-h walls are widest top
// face for inspection.
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 4; c++) {
    entries.push({ kind: 'grass', col: c, row: r });
  }
}
const W = (col, row, variant) => ({ kind: 'stone-wall', col, row, variant, texture: 'ancient-stone' });
entries.push(W(1, 1, 'corner-br'));
entries.push(W(2, 1, 'corner-bl'));
entries.push(W(1, 2, 'corner-tr'));
entries.push(W(2, 2, 'corner-tl'));

const args = {
  entries,
  width: 1200,
  height: 800,
  background: '#0d1117',
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
