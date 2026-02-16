/**
 * sampled-sfx.ts — AudioBuffer loader + cache for sampled SFX.
 * Lazy-loads WAV files from public/audio/sfx/ with preload support.
 * Provides AudioBufferSourceNode playback with optional PannerNode.
 *
 * TODO: DOC - sampled sfx pipeline, positional audio
 */

// ─── Types ──────────────────────────────────────────────────

export interface SampleManifestEntry {
  id: string;
  filename: string;
  category: string;
  loop: boolean;
}

export interface SampleManifest {
  samples: SampleManifestEntry[];
}

export interface LoadedSample {
  id: string;
  buffer: AudioBuffer;
  loop: boolean;
  category: string;
}

// ─── State ──────────────────────────────────────────────────

const _bufferCache = new Map<string, AudioBuffer>();
const _entryCache = new Map<string, SampleManifestEntry>();
let _manifestLoaded = false;
let _manifestPromise: Promise<void> | null = null;
const SFX_BASE_URL = './audio/sfx/';

// ─── Manifest loader ───────────────────────────────────────

async function _loadManifest(): Promise<void> {
  if (_manifestLoaded) return;
  try {
    const resp = await fetch(SFX_BASE_URL + 'manifest.json');
    if (!resp.ok) {
      console.warn('[SampledSFX] Manifest not found — sampled SFX disabled');
      _manifestLoaded = true;
      return;
    }
    const data: SampleManifest = await resp.json();
    for (const entry of data.samples) {
      _entryCache.set(entry.id, entry);
    }
    _manifestLoaded = true;
    console.log(`[SampledSFX] Manifest loaded: ${data.samples.length} samples`);
  } catch (e) {
    console.warn('[SampledSFX] Failed to load manifest:', e);
    _manifestLoaded = true;
  }
}

/** Init sampled SFX — loads manifest (call once at startup) */
export async function initSampledSfx(): Promise<void> {
  if (!_manifestPromise) {
    _manifestPromise = _loadManifest();
  }
  await _manifestPromise;
}

// ─── Buffer loading ─────────────────────────────────────────

/** Load a single sample into AudioBuffer cache */
async function _loadBuffer(ctx: AudioContext, entry: SampleManifestEntry): Promise<AudioBuffer | null> {
  const cached = _bufferCache.get(entry.id);
  if (cached) return cached;

  try {
    const resp = await fetch(SFX_BASE_URL + entry.filename);
    if (!resp.ok) return null;
    const arrayBuf = await resp.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuf);
    _bufferCache.set(entry.id, audioBuffer);
    return audioBuffer;
  } catch (e) {
    console.warn(`[SampledSFX] Failed to load ${entry.id}:`, e);
    return null;
  }
}

/** Preload specific sample IDs (call after AudioContext is available) */
export async function preloadSamples(ctx: AudioContext, ids: string[]): Promise<void> {
  const entries = ids
    .map(id => _entryCache.get(id))
    .filter((e): e is SampleManifestEntry => !!e);

  await Promise.all(entries.map(e => _loadBuffer(ctx, e)));
  console.log(`[SampledSFX] Preloaded ${entries.length} samples`);
}

/** Preload all samples in manifest */
export async function preloadAllSamples(ctx: AudioContext): Promise<void> {
  const entries = Array.from(_entryCache.values());
  await Promise.all(entries.map(e => _loadBuffer(ctx, e)));
  console.log(`[SampledSFX] Preloaded all ${entries.length} samples`);
}

// ─── Playback ───────────────────────────────────────────────

export interface PlaySampleOptions {
  /** Volume 0-1 (default 0.7) */
  volume?: number;
  /** Playback rate multiplier (default 1.0) */
  rate?: number;
  /** Random pitch variation ± (e.g. 0.1 = ±10%) */
  pitchVariation?: number;
  /** Destination node (for routing through gain/panner chains) */
  destination?: AudioNode;
  /** If true, loop the sample */
  loop?: boolean;
}

export interface ActiveSampleSource {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  /** Stop playback */
  stop(): void;
  /** Adjust volume */
  setVolume(v: number): void;
}

/**
 * Play a sampled SFX by ID. Returns handle for control (or null if not loaded).
 * Non-blocking — loads lazily if not cached.
 */
export async function playSample(
  ctx: AudioContext,
  sampleId: string,
  options: PlaySampleOptions = {}
): Promise<ActiveSampleSource | null> {
  const entry = _entryCache.get(sampleId);
  if (!entry) return null;

  const buffer = await _loadBuffer(ctx, entry);
  if (!buffer) return null;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Pitch variation
  const baseRate = options.rate ?? 1.0;
  const variation = options.pitchVariation ?? 0;
  const rate = baseRate + (variation ? (Math.random() * 2 - 1) * variation : 0);
  source.playbackRate.value = rate;

  // Looping
  source.loop = options.loop ?? entry.loop;

  // Gain
  const gainNode = ctx.createGain();
  gainNode.gain.value = options.volume ?? 0.7;

  source.connect(gainNode);
  gainNode.connect(options.destination ?? ctx.destination);

  source.start();

  const handle: ActiveSampleSource = {
    source,
    gainNode,
    stop() {
      try { source.stop(); } catch { /* already stopped */ }
    },
    setVolume(v: number) {
      gainNode.gain.setValueAtTime(v, ctx.currentTime);
    },
  };

  source.onended = () => {
    source.disconnect();
    gainNode.disconnect();
  };

  return handle;
}

/** Check if a sampled version exists for a given SFX ID */
export function hasSample(id: string): boolean {
  return _entryCache.has(id);
}

/** Get manifest entry for a sample */
export function getSampleEntry(id: string): SampleManifestEntry | undefined {
  return _entryCache.get(id);
}

/** Get number of loaded samples */
export function getSampleCount(): number {
  return _entryCache.size;
}

/** Get buffer cache size */
export function getBufferCacheSize(): number {
  return _bufferCache.size;
}
