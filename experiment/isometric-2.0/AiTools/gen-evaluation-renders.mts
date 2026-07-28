/**
 * gen-evaluation-renders.mts
 * Run once to produce ProgressEvaluations PNG files using the current tool code directly.
 * Usage: npx tsx gen-evaluation-renders.mts
 * TODO: DOC
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSvg } from './svg-renderer-tool.js';
import { resolveScene, type SceneEntry } from './scene-registry.js';
import type { PlayerWorldPos } from './svg-renderer-tool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../ProgressEvaluations');
mkdirSync(outDir, { recursive: true });

function save(filename: string, png: Buffer) {
  const filePath = `${outDir}/${filename}`;
  writeFileSync(filePath, png);
  console.log(`✔ Saved: ${filePath} (${(png.byteLength / 1024).toFixed(1)} KB)`);
}

// ─── Scene 1: Stone-Wall Square Perimeter with 8 Players ─────────────────────

const grassBase: SceneEntry[] = [];
for (let col = 0; col <= 6; col++) for (let row = 0; row <= 6; row++) {
  // Skip wall positions so grass doesn't overlap (grass renders first anyway)
  const isWallPos = (col >= 1 && col <= 5 && row >= 1 && row <= 5) && (
    col === 1 || col === 5 || row === 1 || row === 5
  );
  if (!isWallPos) grassBase.push({ kind: 'grass', col, row });
  else            grassBase.push({ kind: 'grass', col, row }); // grass under wall too — renders first, wall on top
}

const wallVariants: Record<string, SceneEntry['variant']> = {
  // Corners
  '1-1': 'corner-br',  // TL cam corner — connects right(+col) and down(+row)
  '5-1': 'corner-bl',  // TR cam corner — connects left(-col) and down(+row)
  '1-5': 'corner-tr',  // BL cam corner — connects right(+col) and up(-row)
  '5-5': 'corner-tl',  // BR cam corner — connects left(-col) and up(-row)
};

const wallEntries: SceneEntry[] = [
  // Top edge row=1 (col 1–5)
  { kind: 'stone-wall', col: 1, row: 1, variant: wallVariants['1-1'], label: 'TL' },
  { kind: 'stone-wall', col: 2, row: 1, variant: 'straight-h' },
  { kind: 'stone-wall', col: 3, row: 1, variant: 'straight-h' },
  { kind: 'stone-wall', col: 4, row: 1, variant: 'straight-h' },
  { kind: 'stone-wall', col: 5, row: 1, variant: wallVariants['5-1'], label: 'TR' },
  // Left edge (col=1, row 2–4)
  { kind: 'stone-wall', col: 1, row: 2, variant: 'straight-v' },
  { kind: 'stone-wall', col: 1, row: 3, variant: 'straight-v' },
  { kind: 'stone-wall', col: 1, row: 4, variant: 'straight-v' },
  // Right edge (col=5, row 2–4)
  { kind: 'stone-wall', col: 5, row: 2, variant: 'straight-v' },
  { kind: 'stone-wall', col: 5, row: 3, variant: 'straight-v' },
  { kind: 'stone-wall', col: 5, row: 4, variant: 'straight-v' },
  // Bottom edge row=5 (col 1–5)
  { kind: 'stone-wall', col: 1, row: 5, variant: wallVariants['1-5'], label: 'BL' },
  { kind: 'stone-wall', col: 2, row: 5, variant: 'straight-h' },
  { kind: 'stone-wall', col: 3, row: 5, variant: 'straight-h' },
  { kind: 'stone-wall', col: 4, row: 5, variant: 'straight-h' },
  { kind: 'stone-wall', col: 5, row: 5, variant: wallVariants['5-5'], label: 'BR' },
];

// 8 players in a ring around the walkable interior (cols 2–4, rows 2–4)
const players: PlayerWorldPos[] = [
  { col: 2, row: 2, label: 'P1' },
  { col: 3, row: 2, label: 'P2' },
  { col: 4, row: 2, label: 'P3' },
  { col: 4, row: 3, label: 'P4' },
  { col: 4, row: 4, label: 'P5' },
  { col: 3, row: 4, label: 'P6' },
  { col: 2, row: 4, label: 'P7' },
  { col: 2, row: 3, label: 'P8' },
];

const sceneEntries = [...grassBase, ...wallEntries];
const chain = resolveScene({ name: 'stone-wall-square', description: 'Stone wall perimeter test', entries: sceneEntries });

const r1 = renderSvg('<svg/>', {
  mode: 'isometric_assembly',
  width: 1800,
  height: 900,
  background: '#0d1117',
  debug: true,
  assemblyChain: chain,
  players,
});
save('stone-wall-square-perimeter-8players.png', r1.png);
console.log(`  Render time: ${r1.renderTimeMs}ms, tiles: ${chain.length}, players: ${players.length}`);

// ─── Scene 2: Same, no debug overlay, cleaner view ───────────────────────────
const r2 = renderSvg('<svg/>', {
  mode: 'isometric_assembly',
  width: 1800,
  height: 900,
  background: '#1a1a2e',
  debug: false,
  assemblyChain: chain,
  players,
});
save('stone-wall-square-perimeter-8players-clean.png', r2.png);

// ─── Scene 3: Close-up of interior (cols 2–4, rows 2–4) with players ─────────
const innerEntries: SceneEntry[] = [];
for (let c = 1; c <= 5; c++) for (let r = 1; r <= 5; r++) {
  innerEntries.push({ kind: 'grass', col: c, row: r });
}
const innerChain = resolveScene({ name: 'inner', description: 'Interior zoom', entries: innerEntries });
const r3 = renderSvg('<svg/>', {
  mode: 'isometric_assembly',
  width: 800,
  height: 500,
  background: '#0d1117',
  debug: true,
  assemblyChain: innerChain,
  players,
});
save('players-interior-closeup.png', r3.png);

// ─── Scene 4: all-nanos showcase ─────────────────────────────────────────────
import { resolveNamedScene } from './scene-registry.js';
const { chain: nanoChain, descriptor: nanoDesc } = resolveNamedScene('all-nanos');
const r4 = renderSvg('<svg/>', {
  mode: 'isometric_assembly',
  width: nanoDesc.canvasWidth ?? 1200,
  height: nanoDesc.canvasHeight ?? 600,
  background: '#0d1117',
  debug: false,
  assemblyChain: nanoChain,
});
save('all-nanos-current.png', r4.png);

console.log('\n✅ All evaluation renders complete.');
