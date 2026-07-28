#!/usr/bin/env tsx
/**
 * transcode-piano-to-ogg.ts
 *
 * Converts bundled piano MP3 note samples in public/audio/piano-mp3
 * into .ogg files using local ffmpeg (if installed).
 *
 * Usage: npx tsx scripts/transcode-piano-to-ogg.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const SAMPLE_DIR = path.resolve(process.cwd(), 'public', 'audio', 'piano-mp3');
const SAMPLE_REGEX = /^[A-G](b)?\d\.mp3$/;

function hasFfmpeg(): boolean {
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', shell: true });
  return probe.status === 0;
}

function transcodeOne(inputAbs: string, outputAbs: string): { ok: boolean; stderr?: string } {
  const outDir = path.dirname(outputAbs);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const run = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i', inputAbs,
      '-vn',
      '-ac', '1',
      '-ar', '44100',
      '-c:a', 'libvorbis',
      '-q:a', '5',
      outputAbs,
    ],
    { encoding: 'utf-8', shell: true },
  );

  if (run.status !== 0) {
    return { ok: false, stderr: run.stderr || run.stdout || 'ffmpeg failed' };
  }
  return { ok: true };
}

function main(): void {
  if (!fs.existsSync(SAMPLE_DIR)) {
    throw new Error(`Piano sample directory not found: ${SAMPLE_DIR}`);
  }

  if (!hasFfmpeg()) {
    throw new Error('ffmpeg was not found on PATH. Install ffmpeg to enable OGG transcoding.');
  }

  const files = fs.readdirSync(SAMPLE_DIR).filter((f: string) => SAMPLE_REGEX.test(f)).sort();
  let converted = 0;
  let failed = 0;

  for (const file of files) {
    const inputAbs = path.join(SAMPLE_DIR, file);
    const outputAbs = path.join(SAMPLE_DIR, file.replace(/\.mp3$/i, '.ogg'));

    const res = transcodeOne(inputAbs, outputAbs);
    if (res.ok) {
      converted++;
    } else {
      failed++;
      console.warn(`[transcode-piano-to-ogg] Failed: ${file} -> ${path.basename(outputAbs)} :: ${res.stderr}`);
    }
  }

  const manifestPath = path.join(SAMPLE_DIR, 'ogg-manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        source: 'ffmpeg',
        converted,
        failed,
        directory: SAMPLE_DIR,
      },
      null,
      2,
    ),
    'utf-8',
  );

  console.log(`[transcode-piano-to-ogg] Converted ${converted} samples (${failed} failed)`);
  console.log(`[transcode-piano-to-ogg] Wrote ${manifestPath}`);
}

main();
