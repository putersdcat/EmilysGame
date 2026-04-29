/**
 * render-corner.mjs — L-shaped wall corner.
 *
 * corner-br at (1,1): central core + arms to bottom + right.
 *   → connects rightward to straight-h at (2,1)
 *   → connects downward to straight-v at (1,2)
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');
const outName = process.argv[2] ?? 'corner.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;
const entries = [];
for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
  entries.push({ kind: 'grass', col: c, row: r });
entries.push({ kind: 'stone-wall', col: 1, row: 1, variant: 'corner-br' });
entries.push({ kind: 'stone-wall', col: 2, row: 1, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 1, row: 2, variant: 'straight-v' });
const args = { entries, width: 1200, height: 700, background: '#0d1117', outputPath };
const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_nano_scene'], {
  input: JSON.stringify(args), maxBuffer: 50 * 1024 * 1024, cwd: __dirname, timeout: 60_000,
});
const res = JSON.parse(out.toString('utf8'));
if (!res.ok) { console.error('FAIL:', res.error); process.exit(1); }
console.log(`OK ${res.structuredContent?.bytes}b → ${outputPath}`);
