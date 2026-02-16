/**
 * generate-sfx-samples.ts — Build-time WAV sample generator.
 * Creates synthetic but realistic audio samples for game SFX.
 * Uses noise shaping, FM synthesis, and filtered envelopes
 * for much more realistic sounds than raw oscillators.
 *
 * Usage: npx tsx scripts/generate-sfx-samples.ts
 * Output: public/audio/sfx/*.wav + manifest.json
 *
 * TODO: DOC - sample generation, synthesis techniques
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = join(__dirname, '..', 'public', 'audio', 'sfx');

const SAMPLE_RATE = 44100;

// ─── WAV writer ─────────────────────────────────────────────

function writeWav(filename: string, samples: Float32Array, sampleRate = SAMPLE_RATE): void {
  const numSamples = samples.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);       // chunk size
  buffer.writeUInt16LE(1, 20);        // PCM
  buffer.writeUInt16LE(1, 22);        // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);       // bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.round(val), 44 + i * 2);
  }

  writeFileSync(join(OUT_DIR, filename), buffer);
}

// ─── DSP primitives ─────────────────────────────────────────

function whiteNoise(len: number): Float32Array {
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) buf[i] = Math.random() * 2 - 1;
  return buf;
}

function pinkNoise(len: number): Float32Array {
  const buf = new Float32Array(len);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    buf[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

function brownNoise(len: number): Float32Array {
  const buf = new Float32Array(len);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + (0.02 * w)) / 1.02;
    buf[i] = last * 3.5;
  }
  return buf;
}

/** Simple biquad low-pass filter */
function lpf(input: Float32Array, cutoff: number, q = 0.707): Float32Array {
  const out = new Float32Array(input.length);
  const w0 = 2 * Math.PI * cutoff / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const b0 = (1 - cosw0) / 2;
  const b1 = 1 - cosw0;
  const b2 = (1 - cosw0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    out[i] = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2
           - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = out[i];
  }
  return out;
}

/** High-pass filter */
function hpf(input: Float32Array, cutoff: number, q = 0.707): Float32Array {
  const out = new Float32Array(input.length);
  const w0 = 2 * Math.PI * cutoff / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const b0 = (1 + cosw0) / 2;
  const b1 = -(1 + cosw0);
  const b2 = (1 + cosw0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    out[i] = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2
           - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = out[i];
  }
  return out;
}

/** Band-pass filter */
function bpf(input: Float32Array, center: number, q = 1): Float32Array {
  const out = new Float32Array(input.length);
  const w0 = 2 * Math.PI * center / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    out[i] = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2
           - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = out[i];
  }
  return out;
}

/** Apply gain envelope (array of [time_fraction, gain] pairs) */
function envelope(input: Float32Array, points: [number, number][]): Float32Array {
  const out = new Float32Array(input.length);
  const len = input.length;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    let gain = 0;
    for (let p = 0; p < points.length - 1; p++) {
      if (t >= points[p][0] && t <= points[p + 1][0]) {
        const frac = (t - points[p][0]) / (points[p + 1][0] - points[p][0]);
        gain = points[p][1] + frac * (points[p + 1][1] - points[p][1]);
        break;
      }
    }
    out[i] = input[i] * gain;
  }
  return out;
}

/** Mix multiple buffers (additive) */
function mix(...buffers: Float32Array[]): Float32Array {
  const len = Math.max(...buffers.map(b => b.length));
  const out = new Float32Array(len);
  for (const buf of buffers) {
    for (let i = 0; i < buf.length; i++) out[i] += buf[i];
  }
  return out;
}

/** Multiply two buffers (ring modulation / gating) */
function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const len = Math.min(a.length, b.length);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = a[i] * b[i];
  return out;
}

/** Scale buffer amplitude */
function gain(buf: Float32Array, g: number): Float32Array {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * g;
  return out;
}

/** Generate a sine wave */
function sine(freq: number, duration: number, amplitude = 1): Float32Array {
  const len = Math.round(duration * SAMPLE_RATE);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE) * amplitude;
  }
  return out;
}

/** FM synthesis: carrier modulated by modulator */
function fmSynth(
  carrierFreq: number, modFreq: number, modDepth: number,
  duration: number, amplitude = 1
): Float32Array {
  const len = Math.round(duration * SAMPLE_RATE);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const mod = Math.sin(2 * Math.PI * modFreq * t) * modDepth;
    out[i] = Math.sin(2 * Math.PI * (carrierFreq + mod) * t) * amplitude;
  }
  return out;
}

/** Normalize to peak amplitude */
function normalize(buf: Float32Array, peak = 0.9): Float32Array {
  let max = 0;
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]));
  if (max === 0) return buf;
  const scale = peak / max;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * scale;
  return out;
}

/** Concatenate */
function concat(...buffers: Float32Array[]): Float32Array {
  const totalLen = buffers.reduce((s, b) => s + b.length, 0);
  const out = new Float32Array(totalLen);
  let offset = 0;
  for (const buf of buffers) {
    out.set(buf, offset);
    offset += buf.length;
  }
  return out;
}

/** Repeat a buffer N times */
function repeat(buf: Float32Array, n: number): Float32Array {
  const parts: Float32Array[] = [];
  for (let i = 0; i < n; i++) parts.push(buf);
  return concat(...parts);
}

/** Silence */
function silence(duration: number): Float32Array {
  return new Float32Array(Math.round(duration * SAMPLE_RATE));
}

// ─── Sample generators ─────────────────────────────────────

interface SampleDef {
  filename: string;
  id: string;
  category: 'interaction' | 'environment' | 'ambience' | 'ui' | 'alert';
  loop: boolean;
  generate: () => Float32Array;
}

const SAMPLES: SampleDef[] = [
  // ─── Footsteps ────────────────────────────────────────────
  {
    filename: 'footstep_grass.wav', id: 'footstep_grass',
    category: 'interaction', loop: false,
    generate() {
      // Short burst of filtered noise — soft thud on grass
      const noise = whiteNoise(Math.round(0.08 * SAMPLE_RATE));
      const filtered = lpf(noise, 800, 0.5);
      return normalize(envelope(filtered, [[0, 0], [0.02, 1], [0.3, 0.4], [1, 0]]), 0.6);
    }
  },
  {
    filename: 'footstep_dirt.wav', id: 'footstep_dirt',
    category: 'interaction', loop: false,
    generate() {
      // Crunchier — wider bandwidth noise
      const noise = whiteNoise(Math.round(0.07 * SAMPLE_RATE));
      const filtered = lpf(noise, 2000, 0.8);
      return normalize(envelope(filtered, [[0, 0], [0.01, 1], [0.2, 0.3], [1, 0]]), 0.5);
    }
  },
  {
    filename: 'footstep_stone.wav', id: 'footstep_stone',
    category: 'interaction', loop: false,
    generate() {
      // Hard tap — high-pass + sharp attack
      const noise = whiteNoise(Math.round(0.05 * SAMPLE_RATE));
      const filtered = hpf(lpf(noise, 4000), 500);
      return normalize(envelope(filtered, [[0, 0], [0.005, 1], [0.1, 0.2], [1, 0]]), 0.5);
    }
  },

  // ─── Bird chirps (FM synthesis — much more realistic) ─────
  {
    filename: 'bird_chirp_1.wav', id: 'bird_chirp_1',
    category: 'environment', loop: false,
    generate() {
      // Ascending tweet: carrier sweeps up, FM gives complexity
      const len = 0.15;
      const n = Math.round(len * SAMPLE_RATE);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        const freq = 2800 + 1200 * (t / len); // sweep up
        const mod = Math.sin(2 * Math.PI * 180 * t) * 400;
        out[i] = Math.sin(2 * Math.PI * (freq + mod) * t);
      }
      return normalize(envelope(out, [[0, 0], [0.05, 1], [0.6, 0.8], [1, 0]]), 0.5);
    }
  },
  {
    filename: 'bird_chirp_2.wav', id: 'bird_chirp_2',
    category: 'environment', loop: false,
    generate() {
      // Two-note chirp
      const note1 = fmSynth(3200, 200, 300, 0.08, 0.8);
      const gap = silence(0.04);
      const note2 = fmSynth(3600, 250, 350, 0.1, 0.7);
      const raw = concat(
        envelope(note1, [[0, 0], [0.1, 1], [0.7, 0.8], [1, 0]]),
        gap,
        envelope(note2, [[0, 0], [0.1, 1], [0.6, 0.7], [1, 0]])
      );
      return normalize(raw, 0.5);
    }
  },
  {
    filename: 'bird_chirp_3.wav', id: 'bird_chirp_3',
    category: 'environment', loop: false,
    generate() {
      // Rapid trill: 3 fast descending notes
      const parts: Float32Array[] = [];
      for (let j = 0; j < 3; j++) {
        const freq = 4000 - j * 400;
        const note = fmSynth(freq, 150 + j * 30, 200, 0.06, 0.7);
        parts.push(envelope(note, [[0, 0], [0.1, 1], [0.5, 0.6], [1, 0]]));
        if (j < 2) parts.push(silence(0.02));
      }
      return normalize(concat(...parts), 0.5);
    }
  },

  // ─── Owl hoot ─────────────────────────────────────────────
  {
    filename: 'owl_hoot.wav', id: 'owl_hoot',
    category: 'environment', loop: false,
    generate() {
      // Two-tone "hoo-hoo" with breathy filter
      const hoo1 = fmSynth(380, 3, 20, 0.3, 0.8);
      const gap = silence(0.15);
      const hoo2 = fmSynth(340, 3, 15, 0.35, 0.7);
      const raw = concat(
        envelope(hoo1, [[0, 0], [0.1, 1], [0.7, 0.9], [1, 0]]),
        gap,
        envelope(hoo2, [[0, 0], [0.1, 0.9], [0.6, 0.8], [1, 0]])
      );
      // Add breathy noise layer
      const breathNoise = lpf(whiteNoise(raw.length), 600, 0.5);
      const breathy = envelope(gain(breathNoise, 0.15), [[0, 0], [0.1, 1], [0.8, 0.8], [1, 0]]);
      return normalize(mix(raw, breathy), 0.6);
    }
  },

  // ─── Cricket loop ─────────────────────────────────────────
  {
    filename: 'cricket_loop.wav', id: 'cricket_loop',
    category: 'ambience', loop: true,
    generate() {
      // Rapid chirring: high-freq filtered noise bursts at ~15Hz rate
      const duration = 2.0; // loop length
      const n = Math.round(duration * SAMPLE_RATE);
      const noise = hpf(whiteNoise(n), 3000);
      const filtered = bpf(noise, 4500, 3);
      // Gate with rapid on/off
      const gateFreq = 15;
      const gate = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const phase = (i / SAMPLE_RATE * gateFreq) % 1;
        gate[i] = phase < 0.4 ? 1 : 0;
      }
      const chirr = multiply(filtered, gate);
      return normalize(envelope(chirr, [[0, 0.8], [0.5, 1], [1, 0.8]]), 0.35);
    }
  },

  // ─── Wind loop ────────────────────────────────────────────
  {
    filename: 'wind_loop.wav', id: 'wind_loop',
    category: 'ambience', loop: true,
    generate() {
      const duration = 3.0;
      const n = Math.round(duration * SAMPLE_RATE);
      const noise = brownNoise(n);
      const filtered = lpf(hpf(noise, 100), 800, 0.5);
      // Slow amplitude modulation for gusting
      const lfo = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        lfo[i] = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.3 * i / SAMPLE_RATE);
      }
      return normalize(multiply(filtered, lfo), 0.5);
    }
  },

  // ─── Rain loop ────────────────────────────────────────────
  {
    filename: 'rain_loop.wav', id: 'rain_loop',
    category: 'ambience', loop: true,
    generate() {
      const duration = 3.0;
      const n = Math.round(duration * SAMPLE_RATE);
      // Pink noise base for rain
      const noise = pinkNoise(n);
      // Two bands: high patter + low rumble
      const highRain = hpf(noise, 2000);
      const lowRain = lpf(brownNoise(n), 400);
      // Random droplet impacts (sparse impulses)
      const drops = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.0003) {
          const dropLen = Math.min(200, n - i);
          for (let j = 0; j < dropLen; j++) {
            drops[i + j] += Math.exp(-j / 30) * (Math.random() * 2 - 1) * 0.3;
          }
        }
      }
      const dropsFiltered = lpf(drops, 6000);
      return normalize(mix(gain(highRain, 0.6), gain(lowRain, 0.3), gain(dropsFiltered, 0.4)), 0.5);
    }
  },

  // ─── Thunder crack ────────────────────────────────────────
  {
    filename: 'thunder.wav', id: 'thunder',
    category: 'environment', loop: false,
    generate() {
      // Crack + rumble: initial sharp transient, then low rumble decay
      const duration = 1.5;
      const n = Math.round(duration * SAMPLE_RATE);
      // Sharp crack
      const crack = hpf(whiteNoise(Math.round(0.05 * SAMPLE_RATE)), 1000);
      const crackEnv = envelope(crack, [[0, 0], [0.01, 1], [0.3, 0.2], [1, 0]]);
      // Low rumble
      const rumble = lpf(brownNoise(n), 200, 0.5);
      const rumbleEnv = envelope(rumble, [[0, 0], [0.02, 0.8], [0.3, 0.6], [0.7, 0.3], [1, 0]]);
      // Combine with crack at start
      const out = new Float32Array(n);
      for (let i = 0; i < crackEnv.length && i < n; i++) out[i] += crackEnv[i] * 0.7;
      for (let i = 0; i < rumbleEnv.length && i < n; i++) out[i] += rumbleEnv[i] * 0.8;
      return normalize(out, 0.8);
    }
  },

  // ─── Waterfall loop ───────────────────────────────────────
  {
    filename: 'waterfall_loop.wav', id: 'waterfall_loop',
    category: 'ambience', loop: true,
    generate() {
      const duration = 2.0;
      const n = Math.round(duration * SAMPLE_RATE);
      // Layered noise: white high + brown low = water rush
      const high = bpf(whiteNoise(n), 3000, 0.5);
      const low = lpf(brownNoise(n), 500, 0.8);
      const mid = bpf(pinkNoise(n), 1200, 0.8);
      // Slow wobble for organic feel
      const lfo = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        lfo[i] = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.5 * i / SAMPLE_RATE);
      }
      return normalize(multiply(mix(gain(high, 0.4), gain(low, 0.5), gain(mid, 0.3)), lfo), 0.6);
    }
  },

  // ─── Campfire crackle loop ────────────────────────────────
  {
    filename: 'campfire_loop.wav', id: 'campfire_loop',
    category: 'ambience', loop: true,
    generate() {
      const duration = 2.5;
      const n = Math.round(duration * SAMPLE_RATE);
      // Base low rumble (fire body)
      const body = lpf(brownNoise(n), 300, 0.6);
      // Random crackle impulses
      const crackles = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.0008) {
          const len = 100 + Math.floor(Math.random() * 300);
          for (let j = 0; j < len && i + j < n; j++) {
            crackles[i + j] += Math.exp(-j / (30 + Math.random() * 50)) *
              (Math.random() * 2 - 1) * (0.3 + Math.random() * 0.4);
          }
        }
      }
      const crackFiltered = hpf(lpf(crackles, 8000), 800);
      // Soft high hiss (flame)
      const hiss = gain(hpf(pinkNoise(n), 4000), 0.08);
      return normalize(mix(gain(body, 0.4), gain(crackFiltered, 0.5), hiss), 0.5);
    }
  },

  // ─── Cat purr loop ────────────────────────────────────────
  {
    filename: 'cat_purr_loop.wav', id: 'cat_purr_loop',
    category: 'environment', loop: true,
    generate() {
      // Low rumble at ~25Hz with harmonics, amplitude modulated
      const duration = 2.0;
      const n = Math.round(duration * SAMPLE_RATE);
      const out = new Float32Array(n);
      const purrFreq = 25;
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        // Fundamental + harmonics
        out[i] = Math.sin(2 * Math.PI * purrFreq * t) * 0.5 +
                 Math.sin(2 * Math.PI * purrFreq * 2 * t) * 0.3 +
                 Math.sin(2 * Math.PI * purrFreq * 3 * t) * 0.1;
        // Amplitude modulation at breath rate (~3Hz)
        out[i] *= 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t);
      }
      // Add subtle noise for rumble texture
      const rumbleNoise = lpf(brownNoise(n), 100);
      return normalize(mix(out, gain(rumbleNoise, 0.2)), 0.4);
    }
  },

  // ─── Coin clink ───────────────────────────────────────────
  {
    filename: 'coin_clink.wav', id: 'coin_clink',
    category: 'interaction', loop: false,
    generate() {
      // Metallic ping: high-freq sine with fast decay + noise transient
      const duration = 0.3;
      const n = Math.round(duration * SAMPLE_RATE);
      // Main tone (metallic)
      const tone1 = sine(3200, duration, 0.6);
      const tone2 = sine(4800, duration, 0.3);
      const tone3 = sine(6400, duration, 0.15);
      // Noise transient
      const transient = hpf(whiteNoise(Math.round(0.01 * SAMPLE_RATE)), 4000);
      const transientEnv = envelope(transient, [[0, 1], [0.3, 0.2], [1, 0]]);
      // Combine with fast exp decay
      const combined = mix(tone1, tone2, tone3);
      const decayed = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        decayed[i] = combined[i] * Math.exp(-i / (SAMPLE_RATE * 0.05));
      }
      // Add transient at start
      for (let i = 0; i < transientEnv.length && i < n; i++) {
        decayed[i] += transientEnv[i] * 0.4;
      }
      return normalize(decayed, 0.5);
    }
  },

  // ─── Chest creak ──────────────────────────────────────────
  {
    filename: 'chest_creak.wav', id: 'chest_creak',
    category: 'interaction', loop: false,
    generate() {
      // Low frequency sweep with noise modulation
      const duration = 0.4;
      const n = Math.round(duration * SAMPLE_RATE);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        const freq = 120 + 200 * Math.sin(Math.PI * t / duration);
        out[i] = Math.sin(2 * Math.PI * freq * t) * 0.5;
        // Add creak texture
        out[i] += Math.sin(2 * Math.PI * (freq * 2.7) * t) * 0.2;
      }
      const noiseLayer = lpf(whiteNoise(n), 1000);
      const creak = mix(
        envelope(out, [[0, 0], [0.05, 0.8], [0.5, 1], [0.8, 0.6], [1, 0]]),
        envelope(gain(noiseLayer, 0.15), [[0, 0], [0.1, 0.5], [0.5, 0.8], [1, 0]])
      );
      return normalize(creak, 0.5);
    }
  },

  // ─── Frog croak ───────────────────────────────────────────
  {
    filename: 'frog_croak.wav', id: 'frog_croak',
    category: 'environment', loop: false,
    generate() {
      // Low FM buzz with envelope
      const croak = fmSynth(180, 30, 80, 0.2, 0.8);
      const env = envelope(croak, [[0, 0], [0.05, 1], [0.4, 0.9], [0.7, 0.5], [1, 0]]);
      // Second croak slightly lower
      const croak2 = fmSynth(150, 25, 60, 0.25, 0.6);
      const env2 = envelope(croak2, [[0, 0], [0.05, 0.8], [0.3, 0.7], [0.7, 0.4], [1, 0]]);
      return normalize(concat(env, silence(0.1), env2), 0.5);
    }
  },

  // ─── Rooster crow ─────────────────────────────────────────
  {
    filename: 'rooster_crow.wav', id: 'rooster_crow',
    category: 'environment', loop: false,
    generate() {
      // "cock-a-doodle-doo" — rising FM sweep with harmonics
      const duration = 0.8;
      const n = Math.round(duration * SAMPLE_RATE);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        const phase = t / duration;
        // Frequency contour: rise, hold, fall
        let freq: number;
        if (phase < 0.15) freq = 400 + 600 * (phase / 0.15);
        else if (phase < 0.6) freq = 1000 + 200 * Math.sin(Math.PI * ((phase - 0.15) / 0.45));
        else freq = 1000 - 400 * ((phase - 0.6) / 0.4);
        const mod = Math.sin(2 * Math.PI * 30 * t) * 50; // vibrato
        out[i] = Math.sin(2 * Math.PI * (freq + mod) * t) * 0.6 +
                 Math.sin(2 * Math.PI * (freq * 2 + mod) * t) * 0.2 +
                 Math.sin(2 * Math.PI * (freq * 3) * t) * 0.08;
      }
      return normalize(envelope(out, [[0, 0], [0.05, 0.8], [0.15, 1], [0.5, 0.9], [0.8, 0.5], [1, 0]]), 0.6);
    }
  },

  // ─── Ouch yelp ────────────────────────────────────────────
  {
    filename: 'ouch.wav', id: 'ouch',
    category: 'interaction', loop: false,
    generate() {
      // Cartoon yelp: quick pitch rise then fall with emphasis
      const duration = 0.25;
      const n = Math.round(duration * SAMPLE_RATE);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        const phase = t / duration;
        // Sharp rise then dip
        let freq: number;
        if (phase < 0.15) freq = 300 + 500 * (phase / 0.15);
        else freq = 800 - 400 * ((phase - 0.15) / 0.85);
        out[i] = Math.sin(2 * Math.PI * freq * t) * 0.7 +
                 Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.2;
      }
      return normalize(envelope(out, [[0, 0], [0.02, 1], [0.15, 0.8], [0.5, 0.4], [1, 0]]), 0.6);
    }
  },
];

// ─── Main ───────────────────────────────────────────────────

function main(): void {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log(`[SFX-Gen] Generating ${SAMPLES.length} audio samples → ${OUT_DIR}`);

  const manifest: Array<{
    id: string;
    filename: string;
    category: string;
    loop: boolean;
  }> = [];

  for (const sample of SAMPLES) {
    console.log(`  ▸ ${sample.filename} (${sample.id})`);
    const audio = sample.generate();
    writeWav(sample.filename, audio);
    manifest.push({
      id: sample.id,
      filename: sample.filename,
      category: sample.category,
      loop: sample.loop,
    });
  }

  // Write manifest
  writeFileSync(
    join(OUT_DIR, 'manifest.json'),
    JSON.stringify({ samples: manifest }, null, 2)
  );

  console.log(`[SFX-Gen] Done! ${SAMPLES.length} samples + manifest.json`);
}

main();
