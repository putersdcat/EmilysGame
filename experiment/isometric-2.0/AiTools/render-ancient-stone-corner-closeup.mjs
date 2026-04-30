/**
 * render-ancient-stone-corner-closeup.mjs — Tight zoom on a single
 * inside corner formed by corner-br + straight-h + straight-v +
 * corner-tr ancient-stone walls. Validates that within-tile H/V
 * Voronoi cells flow continuously across the corner meeting point
 * (proves the topRotateWithAxis=false fix).
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');
const outName = process.argv[2] ?? 'ancient-stone-corner-closeup-iter04.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

const entries = [];
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 4; c++) {
    entries.push({ kind: 'grass', col: c, row: r });
  }
}
const W = (col, row, variant) => ({ kind: 'stone-wall', col, row, variant, texture: 'ancient-stone' });
// L-shape: corner-br at (1,1) opens down+right; straight-h to right; straight-v below; corner-tr closes
entries.push(W(1, 1, 'corner-br'));
entries.push(W(2, 1, 'straight-h'));
entries.push(W(1, 2, 'straight-v'));
entries.push(W(1, 3, 'corner-tr'));
entries.push(W(2, 3, 'straight-h'));

const args = {
  entries,
  width: 900,
  height: 600,
  background: '#222',
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
