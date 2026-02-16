/**
 * music.config.ts — MIDI-only music configuration.
 * All music playback uses MIDI files through SoundFont piano samples.
 * Legacy oscillator tracks have been purged.
 * TODO: DOC - MIDI music track format
 */

// ─── Track Types ────────────────────────────────────────────

export interface MusicNote {
  /** Note name or 'REST' */
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
  /** Base volume multiplier (0-1) */
  volume: number;
  /** Composer name */
  composer?: string;
  /** Musical style / era */
  style?: string;
  /** Track origin — always 'midi' now */
  source?: 'midi';
  // Legacy fields kept optional for JSON compat with preloaded track data
  melodyWave?: OscillatorType;
  bassWave?: OscillatorType;
  melody?: MusicNote[];
  bass?: MusicNote[];
}

// ─── Settings ───────────────────────────────────────────────

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
