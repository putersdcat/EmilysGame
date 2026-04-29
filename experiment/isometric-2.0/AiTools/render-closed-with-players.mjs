/**
 * render-closed-with-players.mjs — closed stone-wall square with one
 * player against each of the 4 interior walls. Validates BOTH:
 *
 *   (a) Walkability mapping: with debug:true, walls render red diamonds
 *       (not walkable) and grass renders green (walkable). Players sit on
 *       interior grass tiles only.
 *
 *   (b) Depth layering: front walls (south + east of perimeter) must
 *       partially OCCLUDE the players adjacent to them, because in iso
 *       order col+row larger == closer to camera. Back walls (north +
 *       west of perimeter) sit behind their adjacent players.
 *
 * Layout (5×5 interior so we have room for 4 distinct interior players):
 *   (1,1)=corner-br   (2..5,1)=straight-h   (6,1)=corner-bl
 *   (1, 2..5)=straight-v                    (6, 2..5)=straight-v
 *   (1,6)=corner-tr   (2..5,6)=straight-h   (6,6)=corner-tl
 *
 * Player placement (inside, hugging one wall each):
 *   P-N at (3,2) — flush against north (back) wall row=1
 *   P-S at (3,5) — flush against south (front) wall row=6 → south wall front overlaps player
 *   P-W at (2,3) — flush against west (back) wall col=1
 *   P-E at (5,3) — flush against east (front) wall col=6 → east wall front overlaps player
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER  = join(__dirname, 'render-worker.ts');
const outName = process.argv[2] ?? 'closed-with-players.png';
const debug   = process.argv[3] === 'debug';
const outputPath = `experiment/isometric-2.0/ProgressEvaluations/${outName}`;

const entries = [];
// Grass field 8x8 to give some negative space outside the wall.
for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
  entries.push({ kind: 'grass', col: c, row: r });

// Closed perimeter: corners at (1,1),(6,1),(1,6),(6,6); 4 straights per side.
entries.push({ kind: 'stone-wall', col: 1, row: 1, variant: 'corner-br' });
entries.push({ kind: 'stone-wall', col: 6, row: 1, variant: 'corner-bl' });
entries.push({ kind: 'stone-wall', col: 1, row: 6, variant: 'corner-tr' });
entries.push({ kind: 'stone-wall', col: 6, row: 6, variant: 'corner-tl' });
for (let c = 2; c <= 5; c++) {
  entries.push({ kind: 'stone-wall', col: c, row: 1, variant: 'straight-h' });
  entries.push({ kind: 'stone-wall', col: c, row: 6, variant: 'straight-h' });
}
for (let r = 2; r <= 5; r++) {
  entries.push({ kind: 'stone-wall', col: 1, row: r, variant: 'straight-v' });
  entries.push({ kind: 'stone-wall', col: 6, row: r, variant: 'straight-v' });
}

// Four interior players, one hugging each wall.
const players = [
  { col: 3, row: 2, label: 'N' },  // against north (back) wall
  { col: 3, row: 5, label: 'S' },  // against south (front) wall — will be partially behind
  { col: 2, row: 3, label: 'W' },  // against west (back) wall
  { col: 5, row: 3, label: 'E' },  // against east (front) wall — will be partially behind
];

const args = { entries, width: 1600, height: 1100, background: '#0d1117', players, debug, outputPath };
const out = execFileSync(process.execPath, [TSX_CLI, WORKER, 'render_nano_scene'], {
  input: JSON.stringify(args), maxBuffer: 50 * 1024 * 1024, cwd: __dirname, timeout: 60_000,
});
const res = JSON.parse(out.toString('utf8'));
if (!res.ok) { console.error('FAIL:', res.error); process.exit(1); }
console.log(`OK ${res.structuredContent?.bytes}b → ${outputPath}`);
