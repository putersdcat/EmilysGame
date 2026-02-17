/**
 * midi-loader.ts — Runtime loader for MIDI-derived track JSON files.
 * Fetches manifest from public/audio/music/manifest.json at startup,
 * then lazy-loads individual track data on demand.
 * TODO: DOC - MIDI track loading pipeline
 */

import type { MusicTrack } from './config/music.config';

// ─── Manifest Types ─────────────────────────────────────────

export interface MidiManifestEntry {
  id: string;
  file: string;
  name: string;
  composer: string;
  style: string;
  biomes: number[];
  tempo: number;
  source: 'midi';
}

export interface MidiManifest {
  tracks: MidiManifestEntry[];
}

// ─── Track JSON shape (as emitted by convert-midi.ts) ───────
// Contains legacy melody/bass arrays for backward compat with JSON files;
// only id/name/composer/style/tempo/volume/biomes are forwarded to MusicTrack.

interface TrackJson {
  id: string;
  name: string;
  composer: string;
  style: string;
  tempo: number;
  volume: number;
  biomes: number[];
  // Legacy fields in JSON — parsed but not forwarded
  melodyWave?: string;
  bassWave?: string;
  melody?: unknown[];
  bass?: unknown[];
}

// ─── State ──────────────────────────────────────────────────

const MANIFEST_URL = './audio/music/manifest.json';
const TRACK_BASE_URL = './audio/music/';

let _manifest: MidiManifest | null = null;
let _manifestLoading: Promise<MidiManifest> | null = null;
const _trackCache = new Map<string, MusicTrack>();
const _loadingTracks = new Map<string, Promise<MusicTrack | null>>();

// ─── Public API ─────────────────────────────────────────────

/** Load the MIDI track manifest. Safe to call multiple times. */
export async function loadMidiManifest(): Promise<MidiManifest> {
  if (_manifest) return _manifest;
  if (_manifestLoading) return _manifestLoading;

  _manifestLoading = (async () => {
    try {
      const resp = await fetch(MANIFEST_URL);
      if (!resp.ok) {
        console.warn(`[MidiLoader] Manifest fetch failed: ${resp.status}`);
        return { tracks: [] };
      }
      const data: MidiManifest = await resp.json();
      _manifest = data;
      console.log(`[MidiLoader] Loaded manifest: ${data.tracks.length} MIDI tracks`);
      return data;
    } catch (e) {
      console.warn('[MidiLoader] Manifest load error:', e);
      return { tracks: [] };
    }
  })();

  return _manifestLoading;
}

/** Get manifest entries (call after loadMidiManifest) */
export function getMidiTrackList(): MidiManifestEntry[] {
  return _manifest?.tracks ?? [];
}

/** Lazy-load a single MIDI track by ID. Returns cached if available. */
export async function loadMidiTrack(id: string): Promise<MusicTrack | null> {
  // Check cache
  const cached = _trackCache.get(id);
  if (cached) return cached;

  // Check if already loading
  const loading = _loadingTracks.get(id);
  if (loading) return loading;

  const entry = _manifest?.tracks.find(t => t.id === id);
  if (!entry) {
    console.warn(`[MidiLoader] Track not in manifest: ${id}`);
    return null;
  }

  const promise = (async () => {
    try {
      const resp = await fetch(`${TRACK_BASE_URL}${entry.file}`);
      if (!resp.ok) {
        console.warn(`[MidiLoader] Track fetch failed: ${entry.file} (${resp.status})`);
        return null;
      }
      const json: TrackJson = await resp.json();

      // Convert to MusicTrack (legacy melody/bass/wave fields not forwarded)
      const track: MusicTrack = {
        id: json.id,
        name: json.name,
        biomes: json.biomes,
        tempo: json.tempo,
        volume: json.volume,
        composer: json.composer,
        style: json.style,
        source: 'midi',
      };

      _trackCache.set(id, track);
      return track;
    } catch (e) {
      console.warn(`[MidiLoader] Track load error (${id}):`, e);
      return null;
    } finally {
      _loadingTracks.delete(id);
    }
  })();

  _loadingTracks.set(id, promise);
  return promise;
}

/** Preload all MIDI tracks (fire-and-forget batch fetch) */
export async function preloadAllMidiTracks(): Promise<MusicTrack[]> {
  const manifest = await loadMidiManifest();
  const results = await Promise.all(
    manifest.tracks.map(t => loadMidiTrack(t.id))
  );
  const loaded = results.filter((t): t is MusicTrack => t !== null);
  console.log(`[MidiLoader] Preloaded ${loaded.length}/${manifest.tracks.length} MIDI tracks`);
  return loaded;
}

/** Get all loaded MIDI tracks (from cache, no async) */
export function getLoadedMidiTracks(): MusicTrack[] {
  return [..._trackCache.values()];
}

/** Check if manifest has been loaded */
export function isMidiManifestLoaded(): boolean {
  return _manifest !== null;
}
