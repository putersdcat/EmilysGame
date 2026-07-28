/**
 * render-perimeter-canvas.mjs — same 7×7 perimeter as render-perimeter-7x7.mjs
 * but uses render_nano_scene (canvas/game path) instead of render_iso_scene.
 *
 * This is the path the in-game canvas uses, so it's the truth-test for any
 * texture work that targets the actual playable view.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');

const outName = process.argv[2] ?? 'stonebrick-perimeter-canvas.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

const entries = [];
const N = 7;
for (let r = 0; r < N; r++)
  for (let c = 0; c < N; c++)
    entries.push({ kind: 'grass', col: c, row: r });
for (let c = 1; c < N - 1; c++) {
  entries.push({ kind: 'stone-wall', col: c, row: 0,     variant: 'straight-h' });
  entries.push({ kind: 'stone-wall', col: c, row: N - 1, variant: 'straight-h' });
}
for (let r = 1; r < N - 1; r++) {
  entries.push({ kind: 'stone-wall', col: 0,     row: r, variant: 'straight-v' });
  entries.push({ kind: 'stone-wall', col: N - 1, row: r, variant: 'straight-v' });
}
entries.push({ kind: 'stone-wall', col: 0,     row: 0,     variant: 'corner-br' });
entries.push({ kind: 'stone-wall', col: N - 1, row: 0,     variant: 'corner-bl' });
entries.push({ kind: 'stone-wall', col: 0,     row: N - 1, variant: 'corner-tr' });
entries.push({ kind: 'stone-wall', col: N - 1, row: N - 1, variant: 'corner-tl' });

const players = [{ col: 3, row: 3, label: 'P1' }];

const args = { entries, width: 1400, height: 1000, background: '#0d1117', players, outputPath };

console.log(`Rendering ${entries.length} tiles via CANVAS path → ${outputPath}`);
const t0 = Date.now();
const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_nano_scene'], {
  input: JSON.stringify(args), maxBuffer: 50 * 1024 * 1024,
  cwd: __dirname, timeout: 60_000,
});
const elapsed = Date.now() - t0;
const res = JSON.parse(out.toString('utf8'));
if (!res.ok) { console.error('FAIL:', res.error); process.exit(1); }
console.log(`OK in ${elapsed}ms — bytes=${res.structuredContent?.bytes} → ${res.structuredContent?.savedTo}`);
console.log('Absolute path:', resolve('c:/GitRoots/EmilysGame', outputPath));
