#!/usr/bin/env tsx
/**
 * convert-midi.ts — Converts MIDI files from MusicAssetTemp/ into
 * compact JSON track files in public/audio/music/ for runtime loading.
 *
 * Usage: npx tsx scripts/convert-midi.ts
 *
 * Reads:  MusicAssetTemp/*.mid + MusicAssetTemp/metadata.json
 * Writes: public/audio/music/manifest.json + public/audio/music/{id}.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseMidi, type MidiNote } from './midi-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Config ─────────────────────────────────────────────────

const MIDI_DIR = path.resolve(__dirname, '../MusicAssetTemp');
const OUT_DIR = path.resolve(__dirname, '../public/audio/music');
const META_FILE = path.join(MIDI_DIR, 'metadata.json');

// Note name mapping (MIDI note number → string)
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

// Supported octave range for legacy JSON note payloads
const MIN_OCTAVE = 2;
const MAX_OCTAVE = 6;


// ─── Types ──────────────────────────────────────────────────

interface MetadataEntry {
  source_url: string;
  download_url: string;
  artist: string;
  title: string;
  composer: string;
  style: string;
  filename: string;
}

type MusicInstrument = 'piano' | 'harpsichord' | 'pipe_organ' | 'nylon_guitar' | 'electric_guitar';

interface GameNote {
  note: string;     // e.g., 'C4', 'Eb5', 'REST'
  duration: number;  // in beats (quarter notes)
}

interface TrackJson {
  id: string;
  name: string;
  composer: string;
  style: string;
  tempo: number;
  melodyWave: string;
  bassWave: string;
  volume: number;
  biomes: number[];
  instrument?: MusicInstrument;
  melody: GameNote[];
  bass: GameNote[];
}

interface ManifestEntry {
  id: string;
  file: string;
  midiFile: string;
  name: string;
  composer: string;
  style: string;
  biomes: number[];
  tempo: number;
  source: 'midi';
}

// ─── Helpers ────────────────────────────────────────────────

function filenameToId(filename: string): string {
  return filename
    .replace('.mid', '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase();
}

function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  const clampedOctave = Math.max(MIN_OCTAVE, Math.min(MAX_OCTAVE, octave));
  return `${name}${clampedOctave}`;
}

function inferMetadataFromFilename(filename: string): Pick<MetadataEntry, 'artist' | 'title' | 'composer' | 'style'> {
  const base = filename.replace('.mid', '');
  const split = base.split('_-_');
  const composerRaw = split[0] ?? 'Unknown';
  const titleRaw = split[1] ?? base;
  const composer = composerRaw.replace(/_/g, ' ').trim();
  const title = titleRaw.replace(/_/g, ' ').trim();

  let style = 'Classical';
  const lcComposer = composer.toLowerCase();
  const lcTitle = title.toLowerCase();
  if (lcComposer.includes('joplin') || lcTitle.includes('rag')) style = 'Ragtime';
  if (lcComposer.includes('traditional')) style = 'Folk';

  return {
    artist: composer,
    title,
    composer,
    style,
  };
}

function inferInstrument(composer: string, style: string, title: string, tempo: number): MusicInstrument {
  const c = composer.toLowerCase();
  const s = style.toLowerCase();
  const t = title.toLowerCase();

  if (c.includes('bach') || c.includes('handel') || c.includes('vivaldi')) return 'harpsichord';
  if (t.includes('toccata') || t.includes('fugue') || t.includes('dies irae')) return 'pipe_organ';
  if (s.includes('ragtime') || c.includes('joplin')) return 'nylon_guitar';
  if (s.includes('folk') || t.includes('wellerman') || t.includes('drunken sailor')) return 'nylon_guitar';
  if (tempo >= 170) return 'electric_guitar';
  return 'piano';
}

/** Pick wave types based on tempo for legacy JSON compat */
function assignWaves(tempo: number): { melody: string; bass: string } {
  if (tempo < 70) return { melody: 'sine', bass: 'triangle' };
  if (tempo < 100) return { melody: 'triangle', bass: 'sine' };
  if (tempo < 130) return { melody: 'triangle', bass: 'triangle' };
  return { melody: 'square', bass: 'triangle' };
}

function extractMelody(allNotes: MidiNote[], ticksPerBeat: number, maxNotes = 256): GameNote[] {
  if (allNotes.length === 0) return [{ note: 'REST', duration: 4 }];

  const sorted = [...allNotes].sort((a, b) =>
    a.startTick !== b.startTick ? a.startTick - b.startTick : b.midi - a.midi,
  );

  const result: GameNote[] = [];
  let currentTick = 0;

  for (const n of sorted) {
    if (result.length >= maxNotes) break;
    if (n.startTick < currentTick) continue;

    if (n.startTick > currentTick) {
      const gapBeats = (n.startTick - currentTick) / ticksPerBeat;
      if (gapBeats > 0.1) result.push({ note: 'REST', duration: round(gapBeats) });
    }

    const durBeats = Math.max(0.125, (n.endTick - n.startTick) / ticksPerBeat);
    result.push({ note: midiToNoteName(n.midi), duration: round(durBeats) });
    currentTick = n.endTick;
  }

  if (result.length === 0) return [{ note: 'REST', duration: 4 }];
  return result;
}

function extractBass(allNotes: MidiNote[], ticksPerBeat: number, maxNotes = 128): GameNote[] {
  if (allNotes.length === 0) return [{ note: 'C3', duration: 4 }];

  const sorted = [...allNotes].sort((a, b) =>
    a.startTick !== b.startTick ? a.startTick - b.startTick : a.midi - b.midi,
  );

  const beatMap = new Map<number, MidiNote>();
  for (const n of sorted) {
    const beat = Math.floor(n.startTick / ticksPerBeat);
    if (!beatMap.has(beat) || n.midi < beatMap.get(beat)!.midi) {
      beatMap.set(beat, n);
    }
  }

  const beats = [...beatMap.keys()].sort((a, b) => a - b);
  const result: GameNote[] = [];
  let prevBeat = 0;

  for (const beat of beats) {
    if (result.length >= maxNotes) break;
    if (beat > prevBeat && result.length > 0) {
      const gapBeats = beat - prevBeat - 1;
      if (gapBeats > 0) result[result.length - 1].duration += gapBeats;
    }

    const n = beatMap.get(beat)!;
    const durBeats = Math.max(1, Math.round((n.endTick - n.startTick) / ticksPerBeat));
    result.push({ note: midiToNoteName(n.midi), duration: round(durBeats) });
    prevBeat = beat + durBeats;
  }

  if (result.length === 0) return [{ note: 'C3', duration: 4 }];
  return result;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Pick biomes based on tempo heuristic */
function assignBiomes(tempo: number): number[] {
  if (tempo < 70) return [2];          // cave — slow/sparse
  if (tempo < 100) return [1, 2];      // forest/cave — mysterious
  if (tempo < 130) return [0, 1];      // meadow/forest — moderate
  return [0, 3];                       // meadow/castle — bright/grand
}


function canonicalTrackKey(composer: string, title: string): string {
  const clean = (s: string) => s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${clean(composer)}::${clean(title)}`;
}

// ─── Main ───────────────────────────────────────────────────

function main(): void {
  console.log('MIDI Track Converter');
  console.log('====================\n');

  // Ensure output dir
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Load metadata
  let metadata: MetadataEntry[] = [];
  if (fs.existsSync(META_FILE)) {
    metadata = JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
    console.log(`Loaded ${metadata.length} metadata entries`);
  }

  // Build metadata lookup by filename
  const metaMap = new Map<string, MetadataEntry>();
  for (const m of metadata) {
    metaMap.set(m.filename, m);
  }

  // Find all .mid files
  const midFiles = fs.readdirSync(MIDI_DIR).filter(f => f.endsWith('.mid')).sort();
  console.log(`Found ${midFiles.length} MIDI files\n`);

  const manifest: ManifestEntry[] = [];
  const seenCanonical = new Set<string>();
  let converted = 0;
  let failed = 0;
  let skippedDuplicates = 0;

  for (const filename of midFiles) {
    const filePath = path.join(MIDI_DIR, filename);
    const id = filenameToId(filename);
    const meta = metaMap.get(filename);

    try {
      const buffer = fs.readFileSync(filePath);
      const midi = parseMidi(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

      // Combine all notes from all tracks
      const allNotes = midi.tracks.flatMap(t => t.notes);
      if (allNotes.length === 0) {
        console.log(`  ⚠ ${filename}: no notes found, skipping`);
        failed++;
        continue;
      }

      // Get tempo (use first tempo event or default 120)
      const tempo = midi.tempos[0]?.bpm || 120;
      const waves = assignWaves(tempo);
      const biomes = assignBiomes(tempo);

      // Legacy JSON payload retained for compatibility/tests.
      const melodyNotes = allNotes.filter(n => n.midi >= 55);
      const bassNotes = allNotes.filter(n => n.midi < 65);
      const melody = extractMelody(
        melodyNotes.length > 0 ? melodyNotes : allNotes,
        midi.ticksPerBeat,
      );
      const bass = extractBass(
        bassNotes.length > 0 ? bassNotes : allNotes,
        midi.ticksPerBeat,
      );

      const inferred = inferMetadataFromFilename(filename);
      const name = (meta?.title || inferred.title || filename.replace('.mid', '').replace(/_/g, ' ')).trim();
      const composer = (meta?.composer || meta?.artist || inferred.composer || 'Unknown').trim();
      const style = (meta?.style || inferred.style || 'Classical').trim();
      const instrument = inferInstrument(composer, style, name, tempo);
      const canonical = canonicalTrackKey(composer, name);
      if (seenCanonical.has(canonical)) {
        console.log(`  ↷ ${filename}: duplicate canonical track (${composer} — ${name}), skipping`);
        skippedDuplicates++;
        continue;
      }
      seenCanonical.add(canonical);

      const track: TrackJson = {
        id,
        name: `🎼 ${name}`,
        composer,
        style,
        tempo,
        melodyWave: waves.melody,
        bassWave: waves.bass,
        volume: 0.55,
        biomes,
        instrument,
        melody,
        bass,
      };

      // Write track JSON
      const outFile = path.join(OUT_DIR, `${id}.json`);
      fs.writeFileSync(outFile, JSON.stringify(track));

      manifest.push({
        id,
        file: `${id}.json`,
        midiFile: `midi/${filename}`,
        name: track.name,
        composer,
        style,
        biomes,
        tempo,
        source: 'midi',
      });

      const melodyLen = melody.length;
      const bassLen = bass.length;
      const sizeKB = (fs.statSync(outFile).size / 1024).toFixed(1);
      console.log(`  ✓ ${filename} → ${id}.json (${melodyLen}m/${bassLen}b notes, ${sizeKB}KB, ${tempo}bpm)`);
      converted++;
    } catch (err) {
      console.log(`  ✗ ${filename}: ${(err as Error).message}`);
      failed++;
    }
  }

  // Reconcile metadata mismatches
  const unmatched = metadata.filter(m => !midFiles.includes(m.filename));
  if (unmatched.length > 0) {
    console.log(`\n⚠ ${unmatched.length} metadata entries have no matching .mid file:`);
    for (const m of unmatched) {
      console.log(`  - ${m.filename} (${m.title})`);
    }
  }

  const noMeta = midFiles.filter(f => !metaMap.has(f));
  if (noMeta.length > 0) {
    console.log(`\n⚠ ${noMeta.length} .mid files have no metadata entry:`);
    for (const f of noMeta) {
      console.log(`  - ${f}`);
    }
  }

  // Write manifest
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ tracks: manifest }, null, 2));

  // Remove stale generated track JSONs that are no longer referenced.
  const keepFiles = new Set(manifest.map(m => m.file));
  const generatedJsons = fs.readdirSync(OUT_DIR)
    .filter(f => f.endsWith('.json') && f !== 'manifest.json');
  let pruned = 0;
  for (const jsonFile of generatedJsons) {
    if (!keepFiles.has(jsonFile)) {
      fs.unlinkSync(path.join(OUT_DIR, jsonFile));
      pruned++;
    }
  }

  console.log(`\n✓ Converted: ${converted}/${midFiles.length}`);
  if (skippedDuplicates > 0) console.log(`↷ Skipped duplicates: ${skippedDuplicates}`);
  if (pruned > 0) console.log(`🧹 Pruned stale track JSON files: ${pruned}`);
  if (failed > 0) console.log(`✗ Failed: ${failed}`);
  console.log(`Manifest: ${manifestPath} (${manifest.length} tracks)`);
}

main();
