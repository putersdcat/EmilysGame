/**
 * music.config.ts - Procedural music track definitions.
 * Defines simple melodies via note sequences for Web Audio oscillator synthesis.
 * Each track has a mood, tempo, and note sequence.
 * TODO: DOC - music track format spec
 */

// ─── Note Frequency Helpers ─────────────────────────────────

/** Concert pitch note frequencies (A4 = 440Hz), octaves 2-6 */
export const NOTE_FREQ: Record<string, number> = {
  // Octave 2
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
  'Db2': 69.30, 'Eb2': 77.78, 'Gb2': 92.50, 'Ab2': 103.83, 'Bb2': 116.54,
  // Octave 3
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  'Db3': 138.59, 'Eb3': 155.56, 'Gb3': 185.00, 'Ab3': 207.65, 'Bb3': 233.08,
  // Octave 4
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  'Db4': 277.18, 'Eb4': 311.13, 'Gb4': 369.99, 'Ab4': 415.30, 'Bb4': 466.16,
  // Octave 5
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  'Db5': 554.37, 'Eb5': 622.25, 'Gb5': 739.99, 'Ab5': 830.61, 'Bb5': 932.33,
  // Octave 6
  C6: 1046.50, D6: 1174.66, E6: 1318.51, F6: 1396.91, G6: 1567.98, A6: 1760.00, B6: 1975.53,
  'Db6': 1108.73, 'Eb6': 1244.51, 'Gb6': 1479.98, 'Ab6': 1661.22, 'Bb6': 1864.66,
  // Rest
  REST: 0,
};

// ─── Track Types ────────────────────────────────────────────

export interface MusicNote {
  /** Note name (key into NOTE_FREQ) or 'REST' */
  note: string;
  /** Duration in beats (1 = quarter note at track tempo) */
  duration: number;
}

export interface MusicTrack {
  id: string;
  name: string;
  /** Biome IDs this track suits (0=meadow, 1=forest, 2=cave, 3=castle) */
  biomes: number[];
  /** BPM */
  tempo: number;
  /** Oscillator type for melody */
  melodyWave: OscillatorType;
  /** Oscillator type for bass */
  bassWave: OscillatorType;
  /** Melody note sequence (loops) */
  melody: MusicNote[];
  /** Bass note sequence (loops, optional) */
  bass: MusicNote[];
  /** Base volume multiplier (0-1) */
  volume: number;
  /** Composer name (MIDI tracks) */
  composer?: string;
  /** Musical style / era */
  style?: string;
  /** Track origin: 'oscillator' (built-in) or 'midi' (converted from MIDI) */
  source?: 'oscillator' | 'midi';
}

// ─── Track Library ──────────────────────────────────────────

export const MUSIC_TRACKS: MusicTrack[] = [
  // ── Meadow: Light, cheerful ──
  {
    id: 'meadow_stroll',
    name: '🌿 Meadow Stroll',
    biomes: [0],
    tempo: 120,
    melodyWave: 'triangle',
    bassWave: 'sine',
    volume: 0.6,
    melody: [
      { note: 'C4', duration: 1 }, { note: 'E4', duration: 1 },
      { note: 'G4', duration: 1 }, { note: 'E4', duration: 0.5 },
      { note: 'F4', duration: 0.5 }, { note: 'G4', duration: 1 },
      { note: 'A4', duration: 1 }, { note: 'G4', duration: 1 },
      { note: 'E4', duration: 1 }, { note: 'D4', duration: 0.5 },
      { note: 'C4', duration: 0.5 }, { note: 'D4', duration: 1 },
      { note: 'E4', duration: 2 }, { note: 'REST', duration: 1 },
      { note: 'G4', duration: 0.5 }, { note: 'A4', duration: 0.5 },
      { note: 'G4', duration: 1 }, { note: 'F4', duration: 1 },
      { note: 'E4', duration: 1 }, { note: 'D4', duration: 1 },
      { note: 'C4', duration: 2 }, { note: 'REST', duration: 1 },
    ],
    bass: [
      { note: 'C3', duration: 2 }, { note: 'G3', duration: 2 },
      { note: 'A3', duration: 2 }, { note: 'E3', duration: 2 },
      { note: 'F3', duration: 2 }, { note: 'C3', duration: 2 },
      { note: 'G3', duration: 2 }, { note: 'C3', duration: 2 },
    ],
  },
  // ── Meadow: Peaceful wandering ──
  {
    id: 'sunlit_path',
    name: '☀️ Sunlit Path',
    biomes: [0],
    tempo: 100,
    melodyWave: 'sine',
    bassWave: 'sine',
    volume: 0.5,
    melody: [
      { note: 'E4', duration: 1.5 }, { note: 'G4', duration: 0.5 },
      { note: 'A4', duration: 1 }, { note: 'G4', duration: 1 },
      { note: 'E4', duration: 1 }, { note: 'D4', duration: 1 },
      { note: 'C4', duration: 2 }, { note: 'REST', duration: 1 },
      { note: 'D4', duration: 1 }, { note: 'E4', duration: 1 },
      { note: 'G4', duration: 1.5 }, { note: 'A4', duration: 0.5 },
      { note: 'G4', duration: 2 }, { note: 'REST', duration: 1 },
    ],
    bass: [
      { note: 'C3', duration: 3 }, { note: 'E3', duration: 3 },
      { note: 'F3', duration: 3 }, { note: 'G3', duration: 3 },
    ],
  },
  // ── Forest: Mysterious, darker ──
  {
    id: 'deep_woods',
    name: '🌲 Deep Woods',
    biomes: [1],
    tempo: 80,
    melodyWave: 'triangle',
    bassWave: 'sine',
    volume: 0.55,
    melody: [
      { note: 'E4', duration: 1.5 }, { note: 'Eb4', duration: 0.5 },
      { note: 'D4', duration: 1 }, { note: 'REST', duration: 0.5 },
      { note: 'A3', duration: 1.5 }, { note: 'B3', duration: 1 },
      { note: 'D4', duration: 1 }, { note: 'E4', duration: 2 },
      { note: 'REST', duration: 1 },
      { note: 'C4', duration: 1 }, { note: 'D4', duration: 0.5 },
      { note: 'Eb4', duration: 0.5 }, { note: 'D4', duration: 1 },
      { note: 'A3', duration: 2 }, { note: 'REST', duration: 1 },
    ],
    bass: [
      { note: 'A3', duration: 3 }, { note: 'D3', duration: 3 },
      { note: 'E3', duration: 3 }, { note: 'A3', duration: 3 },
    ],
  },
  // ── Cave: Echo-y, sparse ──
  {
    id: 'cavern_echo',
    name: '🕳️ Cavern Echo',
    biomes: [2],
    tempo: 60,
    melodyWave: 'sine',
    bassWave: 'triangle',
    volume: 0.45,
    melody: [
      { note: 'E4', duration: 2 }, { note: 'REST', duration: 1 },
      { note: 'B3', duration: 2 }, { note: 'REST', duration: 1.5 },
      { note: 'D4', duration: 1.5 }, { note: 'C4', duration: 1.5 },
      { note: 'REST', duration: 1 },
      { note: 'A3', duration: 2 }, { note: 'REST', duration: 1 },
      { note: 'E4', duration: 3 }, { note: 'REST', duration: 2 },
    ],
    bass: [
      { note: 'A3', duration: 4 }, { note: 'E3', duration: 4 },
      { note: 'D3', duration: 4 }, { note: 'A3', duration: 4 },
    ],
  },
  // ── Castle: Grand, regal ──
  {
    id: 'castle_halls',
    name: '🏰 Castle Halls',
    biomes: [3],
    tempo: 90,
    melodyWave: 'square',
    bassWave: 'triangle',
    volume: 0.5,
    melody: [
      { note: 'C4', duration: 1 }, { note: 'E4', duration: 1 },
      { note: 'G4', duration: 1 }, { note: 'C5', duration: 2 },
      { note: 'B4', duration: 0.5 }, { note: 'A4', duration: 0.5 },
      { note: 'G4', duration: 1 }, { note: 'F4', duration: 1 },
      { note: 'E4', duration: 1 }, { note: 'D4', duration: 1 },
      { note: 'C4', duration: 2 }, { note: 'REST', duration: 1 },
      { note: 'G4', duration: 1 }, { note: 'A4', duration: 1 },
      { note: 'B4', duration: 1 }, { note: 'C5', duration: 2 },
      { note: 'REST', duration: 1 },
    ],
    bass: [
      { note: 'C3', duration: 2 }, { note: 'E3', duration: 2 },
      { note: 'F3', duration: 2 }, { note: 'G3', duration: 2 },
      { note: 'C3', duration: 2 }, { note: 'G3', duration: 2 },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────

/** Get tracks suitable for a given biome ID */
export function getTracksForBiome(biomeId: number): MusicTrack[] {
  const tracks = MUSIC_TRACKS.filter(t => t.biomes.includes(biomeId));
  return tracks.length > 0 ? tracks : MUSIC_TRACKS.filter(t => t.biomes.includes(0)); // fallback to meadow
}

/** Default music settings */
export interface MusicSettings {
  volume: number;       // 0-1
  muted: boolean;
  enabled: boolean;     // master on/off
}

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  volume: 0.5,
  muted: false,
  enabled: true,
};
