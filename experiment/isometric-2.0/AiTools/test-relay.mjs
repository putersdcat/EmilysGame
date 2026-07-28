/**
 * test-relay.mjs — smoke test for the spawnWorker relay
 * Run: node test-relay.mjs
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI  = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER   = join(__dirname, 'render-worker.ts');

console.log('TSX_CLI exists:', (await import('node:fs')).existsSync(TSX_CLI));
console.log('WORKER exists:', (await import('node:fs')).existsSync(WORKER));

const input = JSON.stringify({ kind: 'stone-wall', variant: 'straight-h' });

try {
  const t0 = Date.now();
  const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_nano_tile'], {
    input,
    maxBuffer: 50 * 1024 * 1024,
    cwd: __dirname,
    timeout: 30_000,
  });
  const elapsed = Date.now() - t0;
  const res = JSON.parse(out.toString('utf8'));
  console.log(`OK: ok=${res.ok}, bytes=${res.structuredContent?.bytes}, ms=${res.structuredContent?.renderTimeMs}, total=${elapsed}ms`);
} catch (err) {
  console.error('FAIL:', err.message?.substring(0, 400));
  if (err.stderr) console.error('STDERR:', err.stderr.toString().substring(0, 400));
}
