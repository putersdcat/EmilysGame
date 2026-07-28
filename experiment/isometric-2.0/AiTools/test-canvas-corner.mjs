/**
 * test-canvas-corner.mjs — exercise the canvas path (render_nano_tile)
 * to confirm the per-rect fix in nano-tile.ts works end-to-end.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');

const args = { kind: 'stone-wall', variant: 'corner-br', width: 320, height: 320 };
const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_nano_tile'], {
  input: JSON.stringify(args), maxBuffer: 50 * 1024 * 1024,
  cwd: __dirname, timeout: 60_000,
});
const res = JSON.parse(out.toString('utf8'));
if (!res.ok) { console.error('FAIL:', res.error); process.exit(1); }
const b64 = res.content.find(c => c.type === 'image').data;
const outPath = 'c:/GitRoots/EmilysGame/experiment/isometric-2.0/ProgressEvaluations/canvas-nano-corner-br.png';
writeFileSync(outPath, Buffer.from(b64, 'base64'));
console.log(`OK canvas path → ${outPath} (${res.structuredContent?.bytes} bytes)`);
