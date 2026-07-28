/**
 * render-homestead-family-height-demo.mjs — first-pass homestead material grid.
 *
 * Renders the four initial rural dwelling materials at 48 / 96 / 144 px wall
 * heights (zOffset 4 / 8 / 12). Labels are carried by player tags so the PNG
 * is self-describing enough for quick review.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');
const outName = process.argv[2] ?? 'homestead-family-height-demo.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

const materials = [
  { texture: 'timber-frame-wall', label: 'TIMB', col: 1 },
  { texture: 'plaster-whitewash-wall', label: 'PLAS', col: 3 },
  { texture: 'rough-wood-plank-wall', label: 'WOOD', col: 5 },
  { texture: 'cottage-stone-foundation', label: 'BASE', col: 7 },
];
const heights = [
  { zOffset: 4, label: '48', row: 1 },
  { zOffset: 8, label: '96', row: 3 },
  { zOffset: 12, label: '144', row: 5 },
];

const entries = [];
for (let r = 0; r <= 7; r++) {
  for (let c = 0; c <= 8; c++) {
    entries.push({ kind: 'grass', col: c, row: r });
  }
}
for (const h of heights) {
  for (const m of materials) {
    entries.push({
      kind: 'homestead-wall',
      col: m.col,
      row: h.row,
      zOffset: h.zOffset,
      texture: m.texture,
      variant: 'isolated',
    });
  }
}

const players = [
  ...materials.map((m) => ({ col: m.col, row: 7, label: m.label })),
  ...heights.map((h) => ({ col: 0, row: h.row, label: h.label })),
];

const args = {
  entries,
  width: 1900,
  height: 1300,
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
