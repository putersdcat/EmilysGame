/**
 * render-ends.mjs — regression guard for true end-cap ticks.
 *
 * Scene: four short isolated wall stubs, each terminated by an end-* variant.
 * Ticks MUST appear on the genuinely exposed end face of every stub.
 *
 *   straight-h ── end-r        (south-row 1: ticks on east face)
 *   end-l ── straight-h        (south-row 2: ticks on west face)
 *   straight-v
 *      │
 *   end-b                       (column 6: ticks on south face)
 *
 *   end-t                       (column 7: ticks on north face)
 *      │
 *   straight-v
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');
const outName = process.argv[2] ?? 'ends.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

const entries = [];
// Grass field 9x6.
for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++)
  entries.push({ kind: 'grass', col: c, row: r });

// Horizontal stub ending east at row 1.
entries.push({ kind: 'stone-wall', col: 1, row: 1, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 2, row: 1, variant: 'end-r' });

// Horizontal stub ending west at row 3.
entries.push({ kind: 'stone-wall', col: 1, row: 3, variant: 'end-l' });
entries.push({ kind: 'stone-wall', col: 2, row: 3, variant: 'straight-h' });

// Vertical stub ending south at col 5.
entries.push({ kind: 'stone-wall', col: 5, row: 1, variant: 'straight-v' });
entries.push({ kind: 'stone-wall', col: 5, row: 2, variant: 'end-b' });

// Vertical stub ending north at col 7.
entries.push({ kind: 'stone-wall', col: 7, row: 1, variant: 'end-t' });
entries.push({ kind: 'stone-wall', col: 7, row: 2, variant: 'straight-v' });

const args = { entries, width: 1600, height: 900, background: '#0d1117', outputPath };
const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_nano_scene'], {
  input: JSON.stringify(args), maxBuffer: 50 * 1024 * 1024, cwd: __dirname, timeout: 60_000,
});
const res = JSON.parse(out.toString('utf8'));
if (!res.ok) { console.error('FAIL:', res.error); process.exit(1); }
console.log(`OK ${res.structuredContent?.bytes}b → ${outputPath}`);
