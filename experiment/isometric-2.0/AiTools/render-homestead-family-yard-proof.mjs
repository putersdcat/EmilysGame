/**
 * render-homestead-family-yard-proof.mjs — fenced-yard proof scene for the
 * first-pass homestead material set.
 *
 * One perimeter fence + gate establishes the rural context while four interior
 * wall masses show the initial material set in a single review image.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');
const outName = process.argv[2] ?? 'homestead-family-yard-proof.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

const entries = [];
for (let r = 0; r <= 8; r++) {
  for (let c = 0; c <= 8; c++) {
    entries.push({ kind: 'grass', col: c, row: r });
  }
}

const F = (col, row, variant) => ({ kind: 'fence', col, row, variant });
entries.push(F(1, 1, 'corner-tl'));
entries.push(F(2, 1, 'straight-h'));
entries.push(F(3, 1, 'straight-h'));
entries.push(F(4, 1, 'straight-h'));
entries.push(F(5, 1, 'straight-h'));
entries.push(F(6, 1, 'straight-h'));
entries.push(F(7, 1, 'corner-tr'));
entries.push(F(1, 2, 'straight-v'));
entries.push(F(1, 3, 'straight-v'));
entries.push(F(1, 4, 'straight-v'));
entries.push(F(1, 5, 'straight-v'));
entries.push(F(1, 6, 'straight-v'));
entries.push(F(7, 2, 'straight-v'));
entries.push(F(7, 3, 'straight-v'));
entries.push(F(7, 4, 'straight-v'));
entries.push(F(7, 5, 'straight-v'));
entries.push(F(7, 6, 'straight-v'));
entries.push(F(1, 7, 'corner-bl'));
entries.push(F(2, 7, 'straight-h'));
entries.push(F(3, 7, 'straight-h'));
entries.push({ kind: 'gate', col: 4, row: 7, variant: 'straight-h' });
entries.push(F(5, 7, 'straight-h'));
entries.push(F(6, 7, 'straight-h'));
entries.push(F(7, 7, 'corner-br'));

entries.push({ kind: 'homestead-wall', col: 3, row: 3, texture: 'timber-frame-wall', zOffset: 8, variant: 'isolated' });
entries.push({ kind: 'homestead-wall', col: 5, row: 3, texture: 'plaster-whitewash-wall', zOffset: 8, variant: 'isolated' });
entries.push({ kind: 'homestead-wall', col: 3, row: 5, texture: 'rough-wood-plank-wall', zOffset: 8, variant: 'isolated' });
entries.push({ kind: 'homestead-wall', col: 5, row: 5, texture: 'cottage-stone-foundation', zOffset: 6, variant: 'isolated' });

const players = [
  { col: 3, row: 4, label: 'TIMB' },
  { col: 5, row: 4, label: 'PLAS' },
  { col: 3, row: 6, label: 'WOOD' },
  { col: 5, row: 6, label: 'BASE' },
  { col: 4, row: 8, label: 'YARD' },
];

const args = {
  entries,
  width: 1800,
  height: 1250,
  background: '#0d1117',
  players,
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
