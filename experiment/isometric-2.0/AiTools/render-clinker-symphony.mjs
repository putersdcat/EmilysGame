/**
 * render-clinker-symphony.mjs — The "symphony" render: closed wall enclosure
 * around four nano-snapped wall huggers, but the entire ring is RED CLINKER
 * brick instead of the canonical grey stone brick.
 *
 * Why this exists
 * ──────────────────────────────────────────────────────────────────────────
 * This render is the closing movement of the visual iteration arc that
 * produced ProgressEvaluations/walls-huggers-iter04.png. Every prior
 * lesson should be visible here, intact, applied to a brand-new texture:
 *
 *   1. Wall geometry is texture-agnostic — `wallBounds()` in solver.ts
 *      returns the same rect layout no matter what brick palette is
 *      patterned into it. (Proven: identical corners + L-joins.)
 *
 *   2. Texture pipeline is pluggable — adding `red-clinker` as a sibling
 *      of `stone-brick` required ZERO changes to nano-tile.ts (the
 *      renderer just calls createPattern on `nano.sideTextureSvg` and
 *      `nano.topTextureSvg`). One new texture file + one barrel re-export.
 *
 *   3. Iso depth-sort uses centroid (col+row+1) for extruded nanos and
 *      raw worldCol+worldRow (no +0.5) for players. (Proven: N/W back
 *      huggers visible in front of their walls; S/E front huggers
 *      correctly occluded with only their heads peeking above.)
 *
 *   4. Wall huggers nano-snap to the interior-side L0.5 patch of the
 *      wall's OWN micro tile (8 of 9 nano patches per wall micro are
 *      walkable; only the wall's centre column/row is blocked).
 *
 * If any of points 1-4 had regressed, this render would not match
 * walls-huggers-iter04.png in topology. The only legitimate visual
 * difference should be the brick PALETTE (warm fired-clay reds with
 * wider per-brick variance vs. cool tight grey stone).
 *
 * Mirrors render-walls-with-huggers.mjs exactly except for `texture:
 * 'red-clinker'` on every wall entry.
 *
 * Usage:
 *   node render-clinker-symphony.mjs <outName> [--layers]
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');
const outName = process.argv[2] ?? 'clinker-symphony.png';
const layers  = process.argv.includes('--layers');
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

const entries = [];
// 5×5 grass floor — same as canonical hugger scene.
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    entries.push({ kind: 'grass', col: c, row: r });
  }
}
// Closed RED CLINKER wall square — 4 corners + 4 straight middles.
// `texture: 'red-clinker'` is resolved by render-worker.ts into both
// svgOverride (side faces) and topSvgOverride (top cap) so all six
// faces of every wall box pattern from the same self-tileable image,
// keeping grout aligned across micros and between side and top.
const W = (col, row, variant) => ({ kind: 'stone-wall', col, row, variant, texture: 'red-clinker' });
entries.push(W(1, 1, 'corner-br'));
entries.push(W(3, 1, 'corner-bl'));
entries.push(W(1, 3, 'corner-tr'));
entries.push(W(3, 3, 'corner-tl'));
entries.push(W(2, 1, 'straight-h'));
entries.push(W(2, 3, 'straight-h'));
entries.push(W(1, 2, 'straight-v'));
entries.push(W(3, 2, 'straight-v'));

// Four players, identical placements to walls-huggers-iter04.
//   N : N-wall micro (2,1), interior nano patch (1,2)  — south-of-wall
//   E : E-wall micro (3,2), interior nano patch (0,1)  — west-of-wall
//   S : S-wall micro (2,3), interior nano patch (1,0)  — north-of-wall
//   W : W-wall micro (1,2), interior nano patch (2,1)  — east-of-wall
const players = [
  { col: 2, row: 1, nanoCol: 1, nanoRow: 2, label: 'N' },
  { col: 3, row: 2, nanoCol: 0, nanoRow: 1, label: 'E' },
  { col: 2, row: 3, nanoCol: 1, nanoRow: 0, label: 'S' },
  { col: 1, row: 2, nanoCol: 2, nanoRow: 1, label: 'W' },
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
