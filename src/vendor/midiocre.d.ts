/**
 * midiocre.d.ts — Inline type declarations for the vendored midiocre.js ESM bundle.
 * Hand-written from src/api/Midiocre.ts in the MIDIocre project (CC0-1.0 license).
 * TODO: DOC - regenerate this file whenever MIDIocre is updated
 */

export type TransportState = 'stopped' | 'playing' | 'paused';

export interface MidiocreConfig {
  volume?: number;      // 0–1, default 0.5
  loop?: boolean;       // default false
  tempo?: number;       // BPM multiplier, default 1.0
  sf2Path?: string;     // base path for SF2 URL resolution, default 'SoundFonts'
  midiPath?: string;    // base path for MIDI URL resolution, default 'midi'
}

export interface MidiocreState {
  sf2Loaded: boolean;
  midiLoaded: boolean;
  state: TransportState;
  currentTime: number;
  duration: number;
  volume: number;
  loop: boolean;
  tempo: number;
}

export declare class Midiocre {
  constructor(config?: MidiocreConfig);

  // Loaders — each returns a promise that resolves when loaded
  loadSF2(source: string | ArrayBuffer | File): Promise<void>;
  loadMIDI(source: string | ArrayBuffer | File): Promise<void>;

  // Transport controls
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seek(seconds: number): void;

  // Properties
  volume: number;         // 0–1
  loop: boolean;
  tempo: number;          // BPM multiplier
  readonly currentTime: number;
  readonly duration: number;
  readonly state: TransportState;

  // Callbacks — register before play()
  onProgress(cb: (progress: number, currentTime: number) => void): void;
  onStateChange(cb: (state: TransportState) => void): void;

  // Snapshot save/restore
  getState(): MidiocreState;
  restoreState(state: MidiocreState): Promise<void>;

  destroy(): void;
}
