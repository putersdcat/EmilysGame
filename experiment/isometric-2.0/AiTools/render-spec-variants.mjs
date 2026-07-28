/**
 * render-spec-variants.mjs
 * Renders the 8 spec-named single-variant stone-wall PNGs that close issue #217:
 *   nano-stonewall-{straight-h, straight-v, corner-tr, corner-br,
 *                   corner-tl, corner-bl, cross, tee-t}.png
 *
 * Uses render_iso_scene with a single stone-wall entry per render so it
 * exercises the same fixed SVG extrusion path as the perimeter validation.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');

const VARIANTS = [
  'straight-h', 'straight-v',
  'corner-tr', 'corner-br', 'corner-tl', 'corner-bl',
  'cross', 'tee-t',
];

for (const variant of VARIANTS) {
  const outName = `nano-stonewall-${variant}.png`;
  const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;
  // Single tile sat on a 3x3 grass platform so the diamond context is visible
  const entries = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    entries.push({ kind: 'grass', col: c, row: r });
  }
  entries.push({ kind: 'stone-wall', col: 1, row: 1, variant });

  const args = {
    entries,
    width: 800, height: 600,
    background: '#0d1117',
    outputPath,
  };
  const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_iso_scene'], {
    input: JSON.stringify(args), maxBuffer: 50 * 1024 * 1024,
    cwd: __dirname, timeout: 60_000,
  });
  const res = JSON.parse(out.toString('utf8'));
  if (!res.ok) { console.error(`FAIL ${variant}:`, res.error); process.exit(1); }
  console.log(`OK ${variant} → ${outName} (${res.structuredContent?.bytes} bytes)`);
}
