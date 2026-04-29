/**
 * render-closed.mjs — full closed rectangular wall.
 *
 *  corner-br ── straight-h ── straight-h ── corner-bl
 *      │                                         │
 *  straight-v                                straight-v
 *      │                                         │
 *  straight-v                                straight-v
 *      │                                         │
 *  corner-tr ── straight-h ── straight-h ── corner-tl
 *
 * Same per-side wall length as the L test (4 tiles between corners).
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');
const outName = process.argv[2] ?? 'closed.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;
const entries = [];
// Grass field 6x6.
for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++)
  entries.push({ kind: 'grass', col: c, row: r });
// Closed rectangle: corners at (1,1),(4,1),(1,4),(4,4); 2 straights per side.
entries.push({ kind: 'stone-wall', col: 1, row: 1, variant: 'corner-br' });
entries.push({ kind: 'stone-wall', col: 2, row: 1, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 3, row: 1, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 4, row: 1, variant: 'corner-bl' });
entries.push({ kind: 'stone-wall', col: 1, row: 2, variant: 'straight-v' });
entries.push({ kind: 'stone-wall', col: 4, row: 2, variant: 'straight-v' });
entries.push({ kind: 'stone-wall', col: 1, row: 3, variant: 'straight-v' });
entries.push({ kind: 'stone-wall', col: 4, row: 3, variant: 'straight-v' });
entries.push({ kind: 'stone-wall', col: 1, row: 4, variant: 'corner-tr' });
entries.push({ kind: 'stone-wall', col: 2, row: 4, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 3, row: 4, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 4, row: 4, variant: 'corner-tl' });
const args = { entries, width: 1400, height: 900, background: '#0d1117', outputPath };
const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_nano_scene'], {
  input: JSON.stringify(args), maxBuffer: 50 * 1024 * 1024, cwd: __dirname, timeout: 60_000,
});
const res = JSON.parse(out.toString('utf8'));
if (!res.ok) { console.error('FAIL:', res.error); process.exit(1); }
console.log(`OK ${res.structuredContent?.bytes}b → ${outputPath}`);
