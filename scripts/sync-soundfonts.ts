#!/usr/bin/env tsx
/**
 * sync-soundfonts.ts
 * Copies bundled piano note samples from node_modules into public/
 * so runtime music playback never depends on CDN-hosted soundfont assets.
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(process.cwd(), 'node_modules', 'piano-mp3', 'piano-mp3');
const OUT_DIR = path.resolve(process.cwd(), 'public', 'audio', 'piano-mp3');
const SAMPLE_PUBLIC_PATH = './audio/piano-mp3';

const SAMPLE_REGEX = /^[A-G](b)?\d\.mp3$/;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function main(): void {
  if (!fs.existsSync(SRC_DIR)) {
    throw new Error(
      `Piano sample source directory missing: ${SRC_DIR}. Run npm install to fetch piano-mp3.`
    );
  }

  ensureDir(OUT_DIR);

  const files = fs.readdirSync(SRC_DIR).filter((f) => SAMPLE_REGEX.test(f));

  let copied = 0;
  for (const file of files) {
    const src = path.join(SRC_DIR, file);
    const dst = path.join(OUT_DIR, file);
    fs.copyFileSync(src, dst);
    copied++;
  }

  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        source: 'piano-mp3',
        copied,
        totalAvailable: files.length,
        sampleDirectory: SAMPLE_PUBLIC_PATH,
      },
      null,
      2
    )
  );

  console.log(`[sync-soundfonts] Copied ${copied} piano samples to ${OUT_DIR}`);
}

main();
