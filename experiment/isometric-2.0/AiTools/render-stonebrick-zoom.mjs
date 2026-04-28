/**
 * render-stonebrick-zoom.mjs — close-up of one corner at large size for
 * visual verification of side/top scale parity and seamless tiling.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');

const outName = process.argv[2] ?? 'stonebrick-zoom-corner.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

// 4×4 grid: small grass quad with a corner+two straights to inspect side/top wrap
const entries = [];
for (let r = 0; r < 4; r++)
  for (let c = 0; c < 4; c++)
    entries.push({ kind: 'grass', col: c, row: r });

// Bottom-right corner pattern: corner-br at (0,0), two straight-h to right, straight-v down
entries.push({ kind: 'stone-wall', col: 0, row: 0, variant: 'corner-br' });
entries.push({ kind: 'stone-wall', col: 1, row: 0, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 2, row: 0, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 0, row: 1, variant: 'straight-v' });
entries.push({ kind: 'stone-wall', col: 0, row: 2, variant: 'straight-v' });

const args = { entries, width: 1200, height: 900, background: '#0d1117', outputPath };

const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_nano_scene'], {
  input: JSON.stringify(args), maxBuffer: 50 * 1024 * 1024,
  cwd: __dirname, timeout: 60_000,
});
const res = JSON.parse(out.toString('utf8'));
if (!res.ok) { console.error('FAIL:', res.error); process.exit(1); }
console.log(`OK ${res.structuredContent?.bytes}b → ${outputPath}`);
