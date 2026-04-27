/**
 * render-top-edge.mjs
 * Tight 3-tile back-edge render: corner-br + straight-h + straight-h
 * High resolution, narrow canvas, single-row Z-clean. Use to inspect
 * whether adjacent straight-h tiles actually abut at the iso seam.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');

const outName = process.argv[2] ?? 'issue217-topedge-3tile.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

const entries = [];
// Grass row underneath
for (let c = 0; c < 4; c++) entries.push({ kind: 'grass', col: c, row: 0 });
// Walls: corner + 2 straight-h + corner
entries.push({ kind: 'stone-wall', col: 0, row: 0, variant: 'corner-br' });
entries.push({ kind: 'stone-wall', col: 1, row: 0, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 2, row: 0, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 3, row: 0, variant: 'corner-bl' });

const args = {
  entries,
  width: 1600,
  height: 600,
  background: '#0d1117',
  outputPath,
};

console.log(`Rendering ${entries.length} tiles → ${outputPath}`);
const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_iso_scene'], {
  input: JSON.stringify(args), maxBuffer: 50 * 1024 * 1024,
  cwd: __dirname, timeout: 60_000,
});
const res = JSON.parse(out.toString('utf8'));
if (!res.ok) { console.error('FAIL:', res.error); process.exit(1); }
console.log(`OK bytes=${res.structuredContent?.bytes}`);
