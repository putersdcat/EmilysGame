#!/usr/bin/env tsx
/**
 * sync-soundfonts.ts
 * Verifies that MidiocrePack.sf2 is present in public/audio/music/.
 * The SF2 file is committed directly to the repo — no copy step needed.
 * Previous piano-mp3 sample sync has been removed (replaced by MIDIocre + SF2).
 * TODO: DOC - SF2 asset pipeline
 */

import fs from 'node:fs';
import path from 'node:path';

const SF2_PATH = path.resolve(process.cwd(), 'public', 'audio', 'music', 'MidiocrePack.sf2');

function main(): void {
  if (!fs.existsSync(SF2_PATH)) {
    console.error(
      `[sync-soundfonts] ERROR: MidiocrePack.sf2 missing at ${SF2_PATH}.\n` +
      'Copy it from C:\\GitRoots\\MIDIocre\\SoundFonts\\MidiocrePack.sf2'
    );
    process.exit(1);
  }
  const { size } = fs.statSync(SF2_PATH);
  console.log(`[sync-soundfonts] SF2 OK: MidiocrePack.sf2 (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

main();
