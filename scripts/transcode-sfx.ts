/**
 * transcode-sfx.ts — Convert WAV SFX samples to OGG Vorbis.
 * Uses ffmpeg to transcode public/audio/sfx/*.wav → *.ogg
 * Much smaller files (typically 5-10x) with excellent browser support.
 * Removes original WAVs and updates manifest.json.
 *
 * Usage: npx tsx scripts/transcode-sfx.ts
 * Requires: ffmpeg in PATH
 */

import { execSync } from 'child_process';
import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SFX_DIR = join(__dirname, '..', 'public', 'audio', 'sfx');

// Check ffmpeg availability
try {
  execSync('ffmpeg -version', { stdio: 'pipe' });
} catch {
  console.error('❌ ffmpeg not found in PATH. Install with: winget install Gyan.FFmpeg');
  process.exit(1);
}

// Read manifest
const manifestPath = join(SFX_DIR, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

console.log(`🔊 Transcoding ${manifest.samples.length} SFX samples to OGG Vorbis...\n`);

let transcoded = 0;
let totalSavedKB = 0;

for (const sample of manifest.samples) {
  const wavFile = join(SFX_DIR, sample.filename);
  
  if (!existsSync(wavFile)) {
    // Already transcoded or missing
    if (sample.filename.endsWith('.ogg')) {
      console.log(`  ✓ ${sample.id} — already OGG`);
      continue;
    }
    console.warn(`  ⚠ ${sample.id} — file not found: ${sample.filename}`);
    continue;
  }

  const oggFilename = sample.filename.replace(/\.wav$/i, '.ogg');
  const oggFile = join(SFX_DIR, oggFilename);

  // Transcode: WAV → OGG Vorbis, mono, 22050 Hz, quality 3 (~96kbps)
  // Loops get slightly higher quality, one-shots get aggressive compression
  const quality = sample.loop ? '4' : '2';
  const sampleRate = sample.loop ? '22050' : '16000';
  
  try {
    execSync(
      `ffmpeg -y -i "${wavFile}" -ac 1 -ar ${sampleRate} -c:a libvorbis -q:a ${quality} "${oggFile}"`,
      { stdio: 'pipe' }
    );

    const wavSize = readFileSync(wavFile).length;
    const oggSize = readFileSync(oggFile).length;
    const savedKB = (wavSize - oggSize) / 1024;
    totalSavedKB += savedKB;

    console.log(
      `  ✓ ${sample.id}: ${(wavSize/1024).toFixed(1)}KB → ${(oggSize/1024).toFixed(1)}KB (saved ${savedKB.toFixed(1)}KB)`
    );

    // Update manifest entry
    sample.filename = oggFilename;
    
    // Remove original WAV
    unlinkSync(wavFile);
    transcoded++;
  } catch (e: any) {
    console.error(`  ✗ ${sample.id}: ffmpeg error: ${e.message}`);
  }
}

// Write updated manifest
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`\n✅ Transcoded ${transcoded} files. Total saved: ${(totalSavedKB/1024).toFixed(2)}MB`);
console.log('📋 Manifest updated with .ogg filenames');
