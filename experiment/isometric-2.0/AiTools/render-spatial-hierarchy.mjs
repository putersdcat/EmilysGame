/**
 * render-spatial-hierarchy.mjs — Single-image diagnostic of the
 * canonical world spatial hierarchy.
 *
 * Per Docs/WorldEngine-01-SpatialHierarchy.md:
 *
 *   L2  Macro Tile      = 5 × 5 World Unit Tiles  (= 25 × 25 micros)
 *   L1  World Unit Tile = 5 × 5 Micro Tiles
 *   L0  Micro Tile      = atomic terrain cell (1 iso diamond)
 *   L0.5 Nano Tile      = 3 × 3 sub-grid OVERLAY of one Micro Tile
 *
 * Rendered scene: ONE complete L1 World Unit (a 5×5 grid of micro tiles)
 * with iso projection, full L0 yellow diamonds, L0.5 magenta nano grid,
 * and the L1 lime perimeter. A small wall enclosure sits inside so the
 * wall solver footprint (orange) is also exercised.
 *
 * The L2 macro tier is impossible to render legibly at the same iso
 * scale (25 micros across = ~6400px wide diamond), so it is shown
 * accurately in a proportional FLAT SCHEMATIC inset in the bottom-right
 * of the canvas — that inset depicts the full L2→L1→L0→L0.5 nesting
 * with a 3×3 nano callout including patch labels (NW/N/.../SE).
 *
 * Together, the iso scene + inset cover all four tiers in one image.
 *
 * Usage:
 *   node render-spatial-hierarchy.mjs <outName>
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');
const outName = process.argv[2] ?? 'spatial-hierarchy.png';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

// One full L1 World Unit = 5×5 micros, anchored at WU (0,0) → micros (0..4, 0..4).
const entries = [];
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    entries.push({ kind: 'grass', col: c, row: r });
  }
}

// Small closed stone-wall square inside the World Unit so the orange
// wall-footprint overlay (L0.5 wall solver geometry) appears.
// Square at micros (1,1)..(3,3): corners + straight middles.
entries.push({ kind: 'stone-wall', col: 1, row: 1, variant: 'corner-br' });
entries.push({ kind: 'stone-wall', col: 3, row: 1, variant: 'corner-bl' });
entries.push({ kind: 'stone-wall', col: 1, row: 3, variant: 'corner-tr' });
entries.push({ kind: 'stone-wall', col: 3, row: 3, variant: 'corner-tl' });
entries.push({ kind: 'stone-wall', col: 2, row: 1, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 2, row: 3, variant: 'straight-h' });
entries.push({ kind: 'stone-wall', col: 1, row: 2, variant: 'straight-v' });
entries.push({ kind: 'stone-wall', col: 3, row: 2, variant: 'straight-v' });

// One nano-snapped player inside the enclosure to demonstrate L0.5 placement.
const players = [
  { col: 2, row: 2, nanoCol: 1, nanoRow: 1, label: 'P' },
];

const args = {
  entries,
  width: 2000,
  height: 1400,
  background: '#0d1117',
  players,
  geometryLayers: true,
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
