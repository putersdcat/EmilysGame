/**
 * Type declarations for soundfont-player.
 * @see https://github.com/danigb/soundfont-player
 * TODO: DOC - soundfont-player type declarations
 */
declare module 'soundfont-player' {
  interface InstrumentOptions {
    soundfont?: 'MusyngKite' | 'FluidR3_GM';
    format?: 'mp3' | 'ogg';
    destination?: globalThis.AudioNode;
    gain?: number;
    notes?: (string | number)[];
    nameToUrl?: (name: string, sf: string, format: string) => string;
  }

  interface PlayOptions {
    gain?: number;
    duration?: number;
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
  }

  interface SfAudioNode {
    stop: (when?: number) => void;
  }

  interface Instrument {
    name: string;
    play: (note: string | number, when?: number, options?: PlayOptions) => SfAudioNode;
    stop: (when?: number) => void;
    connect: (destination: globalThis.AudioNode) => Instrument;
  }

  function instrument(
    ac: AudioContext,
    name: string,
    options?: InstrumentOptions
  ): Promise<Instrument>;

  function nameToUrl(name: string, sf?: string, format?: string): string;

  export { instrument, nameToUrl, Instrument, InstrumentOptions, PlayOptions, SfAudioNode };
}
