/**
 * render-perimeter-7x7.mjs
 * One-shot script that calls render-worker.ts to render the 7×7 stone-wall
 * perimeter the user has been screenshotting, saves it to ProgressEvaluations,
 * and prints the PNG path so we can view it.
 *
 * Layout (col, row):
 *   (0,0)=corner-br        (1..5, 0)=straight-h    (6,0)=corner-bl
 *   (0, 1..5)=straight-v   (interior=grass)        (6, 1..5)=straight-v
 *   (0,6)=corner-tr        (1..5, 6)=straight-h    (6,6)=corner-tl
 */
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');

const outName = process.argv[2] ?? 'issue217-perimeter-baseline.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

// ─── Build 7×7 perimeter entries ───
const entries = [];
const N = 7;

// Grass interior (so corners aren't floating in space)
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    entries.push({ kind: 'grass', col: c, row: r });
  }
}

// Stone-wall perimeter
for (let c = 1; c < N - 1; c++) {
  entries.push({ kind: 'stone-wall', col: c, row: 0,     variant: 'straight-h' }); // top
  entries.push({ kind: 'stone-wall', col: c, row: N - 1, variant: 'straight-h' }); // bottom
}
for (let r = 1; r < N - 1; r++) {
  entries.push({ kind: 'stone-wall', col: 0,     row: r, variant: 'straight-v' }); // left
  entries.push({ kind: 'stone-wall', col: N - 1, row: r, variant: 'straight-v' }); // right
}
// Four corners
entries.push({ kind: 'stone-wall', col: 0,     row: 0,     variant: 'corner-br' }); // top-left of perimeter
entries.push({ kind: 'stone-wall', col: N - 1, row: 0,     variant: 'corner-bl' }); // top-right
entries.push({ kind: 'stone-wall', col: 0,     row: N - 1, variant: 'corner-tr' }); // bot-left
entries.push({ kind: 'stone-wall', col: N - 1, row: N - 1, variant: 'corner-tl' }); // bot-right

// Players inside for boundary context
const players = [
  { col: 3, row: 3, label: 'P1' },
];

const args = {
  entries,
  width: 1400,
  height: 1000,
  background: '#0d1117',
  players,
  outputPath,
};

console.log(`Rendering ${entries.length} tiles → ${outputPath}`);
const t0 = Date.now();
const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_iso_scene'], {
  input: JSON.stringify(args),
  maxBuffer: 50 * 1024 * 1024,
  cwd: __dirname,
  timeout: 60_000,
});
const elapsed = Date.now() - t0;
const res = JSON.parse(out.toString('utf8'));
if (!res.ok) {
  console.error('FAIL:', res.error);
  process.exit(1);
}
console.log(`OK in ${elapsed}ms — bytes=${res.structuredContent?.bytes} → ${res.structuredContent?.savedTo}`);
console.log('Absolute path:', resolve('c:/GitRoots/EmilysGame', outputPath));
