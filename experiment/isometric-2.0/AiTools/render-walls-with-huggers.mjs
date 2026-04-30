/**
 * render-walls-with-huggers.mjs — Four players inside a closed stone-wall
 * enclosure, each hugging a different wall (N / E / S / W).
 *
 * Walkability model (per Docs/WorldEngine-01-SpatialHierarchy.md):
 *
 *   A Micro Tile (L0) is sub-divided by a 3×3 Nano Overlay (L0.5).
 *   Every L0.5 nano patch that is NOT occupied by z-height geometry
 *   (wall / fence / etc.) is walkable. The wall tiles themselves
 *   place geometry in the *center column / center row* of their nano
 *   grid (vertical / horizontal straights) — so 8 of 9 nano patches
 *   in a wall micro tile are still walkable.
 *
 *   Inside our closed square, the *interior* L0 micro is (2,2) — fully
 *   open grass. To "hug a wall", a player stands inside (2,2) on the
 *   nano patch closest to that wall:
 *
 *     NORTH-hugger : micro (2,2), nano (1,0)   (top-center patch)
 *     EAST-hugger  : micro (2,2), nano (2,1)   (right-center patch)
 *     SOUTH-hugger : micro (2,2), nano (1,2)   (bottom-center patch)
 *     WEST-hugger  : micro (2,2), nano (0,1)   (left-center patch)
 *
 * Same wall geometry as render-spatial-hierarchy.mjs (closed 3-micro
 * square at micros (1,1)..(3,3)) so the renders are directly
 * comparable.
 *
 * Usage:
 *   node render-walls-with-huggers.mjs <outName> [--layers]
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');
const outName = process.argv[2] ?? 'walls-huggers.png';
const layers  = process.argv.includes('--layers');
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

const entries = [];
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    entries.push({ kind: 'grass', col: c, row: r });
  }
}
// Closed stone-wall square — 4 corners + 4 straight middles.
entries.push({ kind: 'stone-wall', col: 1, row: 1, variant: 'corner-br' });
entries.push({ kind: 'stone-wall', col: 3, row: 1, variant: 'corner-bl' });
entries.push({ kind: 'stone-wall', col: 1, row: 3, variant: 'corner-tr' });
entries.push({ kind: 'stone-wall', col: 3, row: 3, variant: 'corner-tl' });
entries.push({ kind: 'stone-wall', col: 2, row: 1, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 2, row: 3, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 1, row: 2, variant: 'straight-v' });
entries.push({ kind: 'stone-wall', col: 3, row: 2, variant: 'straight-v' });

// Four players in the interior micro (2,2), each hugging a wall via nano offset.
const players = [
  { col: 2, row: 2, nanoCol: 1, nanoRow: 0, label: 'N' },
  { col: 2, row: 2, nanoCol: 2, nanoRow: 1, label: 'E' },
  { col: 2, row: 2, nanoCol: 1, nanoRow: 2, label: 'S' },
  { col: 2, row: 2, nanoCol: 0, nanoRow: 1, label: 'W' },
];

const args = {
  entries,
  width: 1600,
  height: 1100,
  background: '#0d1117',
  players,
  geometryLayers: layers,
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
