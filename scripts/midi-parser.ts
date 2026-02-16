/**
 * midi-parser.ts — Minimal Standard MIDI File parser.
 * Zero dependencies. Handles SMF format 0/1.
 * Extracts note on/off events, tempo changes, track names.
 * Used by convert-midi.ts at build time only (not shipped to browser).
 */

// ─── Types ──────────────────────────────────────────────────

export interface MidiNote {
  midi: number;       // MIDI note number (0-127)
  startTick: number;
  endTick: number;
  velocity: number;   // 0-127
  channel: number;    // 0-15
}

export interface MidiTrack {
  name: string;
  notes: MidiNote[];
  channel: number;    // primary channel used
}

export interface MidiFile {
  format: number;        // 0 = single track, 1 = multi track
  ticksPerBeat: number;  // ticks per quarter note
  tracks: MidiTrack[];
  tempos: { tick: number; bpm: number }[];
}

// ─── Binary Helpers ─────────────────────────────────────────

function readVarLen(data: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let bytesRead = 0;
  let byte: number;
  do {
    byte = data[offset + bytesRead];
    value = (value << 7) | (byte & 0x7f);
    bytesRead++;
    if (bytesRead > 4) throw new Error(`VarLen overflow at offset ${offset}`);
  } while (byte & 0x80);
  return [value, bytesRead];
}

function readU32(d: Uint8Array, o: number): number {
  return ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
}

function readU16(d: Uint8Array, o: number): number {
  return (d[o] << 8) | d[o + 1];
}

function chunkTag(d: Uint8Array, o: number): string {
  return String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3]);
}

// ─── Parser ─────────────────────────────────────────────────

export function parseMidi(buffer: ArrayBuffer): MidiFile {
  const data = new Uint8Array(buffer);
  let pos = 0;

  // ── Header ──
  if (chunkTag(data, pos) !== 'MThd') throw new Error('Not a MIDI file: bad header tag');
  pos += 4;
  const headerLen = readU32(data, pos); pos += 4;
  const format = readU16(data, pos); pos += 2;
  const numTracks = readU16(data, pos); pos += 2;
  const division = readU16(data, pos); pos += 2;

  // SMPTE division not supported — only ticks-per-beat
  if (division & 0x8000) throw new Error('SMPTE time division not supported');
  const ticksPerBeat = division;
  pos = 4 + 4 + headerLen; // tag(4) + lenField(4) + headerData

  const allTempos: { tick: number; bpm: number }[] = [];
  const tracks: MidiTrack[] = [];

  // ── Track Chunks ──
  for (let t = 0; t < numTracks && pos < data.length; t++) {
    if (pos + 8 > data.length) break;
    const tag = chunkTag(data, pos); pos += 4;
    const trackLen = readU32(data, pos); pos += 4;
    const trackEnd = Math.min(pos + trackLen, data.length);

    if (tag !== 'MTrk') {
      pos = trackEnd; // skip unknown chunk
      continue;
    }

    const notes: MidiNote[] = [];
    // key = midi*16+channel → pending note-on info
    const active = new Map<number, { startTick: number; velocity: number; channel: number }>();
    let trackName = '';
    let tick = 0;
    let runningStatus = 0;
    const channelCounts = new Map<number, number>();

    while (pos < trackEnd) {
      const [dt, dtLen] = readVarLen(data, pos);
      pos += dtLen;
      tick += dt;

      let status = data[pos];

      // Running status: if high bit not set, reuse previous status
      if (status < 0x80) {
        status = runningStatus;
      } else {
        pos++;
        if (status < 0xf0) runningStatus = status;
      }

      const type = status & 0xf0;
      const ch = status & 0x0f;

      switch (type) {
        case 0x90: { // Note On
          const note = data[pos++];
          const vel = data[pos++];
          if (vel > 0) {
            active.set(note * 16 + ch, { startTick: tick, velocity: vel, channel: ch });
            channelCounts.set(ch, (channelCounts.get(ch) || 0) + 1);
          } else {
            // vel=0 means note off
            const key = note * 16 + ch;
            const a = active.get(key);
            if (a) {
              notes.push({ midi: note, startTick: a.startTick, endTick: tick, velocity: a.velocity, channel: a.channel });
              active.delete(key);
            }
          }
          break;
        }
        case 0x80: { // Note Off
          const note = data[pos++];
          pos++; // skip velocity
          const key = note * 16 + ch;
          const a = active.get(key);
          if (a) {
            notes.push({ midi: note, startTick: a.startTick, endTick: tick, velocity: a.velocity, channel: a.channel });
            active.delete(key);
          }
          break;
        }
        case 0xa0: pos += 2; break; // Poly aftertouch
        case 0xb0: pos += 2; break; // Control change
        case 0xc0: pos += 1; break; // Program change
        case 0xd0: pos += 1; break; // Channel pressure
        case 0xe0: pos += 2; break; // Pitch bend
        default:
          if (status === 0xff) {
            // Meta event
            const metaType = data[pos++];
            const [metaLen, mlBytes] = readVarLen(data, pos);
            pos += mlBytes;

            if (metaType === 0x51 && metaLen === 3) {
              // Set Tempo (microseconds per quarter note)
              const usPerBeat = (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2];
              allTempos.push({ tick, bpm: Math.round(60000000 / usPerBeat) });
            } else if (metaType === 0x03 && metaLen > 0) {
              // Track Name
              trackName = String.fromCharCode(...Array.from(data.slice(pos, pos + metaLen)));
            }
            // 0x2f = End of Track — just skip
            pos += metaLen;
          } else if (status === 0xf0 || status === 0xf7) {
            // SysEx
            const [sysLen, slBytes] = readVarLen(data, pos);
            pos += slBytes + sysLen;
          } else {
            // Unknown — try to skip gracefully
            pos++;
          }
          break;
      }
    }

    // Close any dangling active notes
    for (const [key, a] of active) {
      notes.push({
        midi: Math.floor(key / 16),
        startTick: a.startTick,
        endTick: tick,
        velocity: a.velocity,
        channel: a.channel,
      });
    }

    pos = trackEnd;

    // Determine primary channel (most notes)
    let primaryChannel = 0;
    let maxCount = 0;
    for (const [c, count] of channelCounts) {
      if (count > maxCount) { maxCount = count; primaryChannel = c; }
    }

    if (notes.length > 0) {
      tracks.push({ name: trackName, notes, channel: primaryChannel });
    }
  }

  // Default tempo if none found
  if (allTempos.length === 0) allTempos.push({ tick: 0, bpm: 120 });

  return { format, ticksPerBeat, tracks, tempos: allTempos };
}
