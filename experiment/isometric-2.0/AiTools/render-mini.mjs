/**
 * render-mini.mjs — minimal scene for stone-wall texture iteration.
 *
 * Layout (3x3 grass with two adjacent walls):
 *   .  .  .
 *   .  H  H        ← horizontal pair (south-facing front, "\")
 *   V  .  .        ← vertical solo   (east-facing front,  "/")
 *
 * Just enough to:
 *   - Confirm side textures don't seam between adjacent tiles (pair of H's)
 *   - Confirm both wall orientations render correctly
 *   - See top textures clearly
 *   - NO corners — corner-edge texture meeting is explicitly out of scope.
 *
 * Usage: node render-mini.mjs <outname>
 */
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');

const outName = process.argv[2] ?? 'mini.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

const entries = [];
// 4×3 grass field
for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++)
  entries.push({ kind: 'grass', col: c, row: r });

// Horizontal pair — adjacent to test inter-tile seam
entries.push({ kind: 'stone-wall', col: 1, row: 1, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 2, row: 1, variant: 'straight-h' });

// Vertical solo — different orientation
entries.push({ kind: 'stone-wall', col: 0, row: 0, variant: 'straight-v' });
entries.push({ kind: 'stone-wall', col: 0, row: 1, variant: 'straight-v' });

const args = { entries, width: 800, height: 600, background: '#0d1117', outputPath };

const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_nano_scene'], {
  input: JSON.stringify(args), maxBuffer: 50 * 1024 * 1024,
  cwd: __dirname, timeout: 60_000,
});
const res = JSON.parse(out.toString('utf8'));
if (!res.ok) { console.error('FAIL:', res.error); process.exit(1); }
console.log(`OK ${res.structuredContent?.bytes}b → ${outputPath}`);
