// src/midi/MidiTypes.ts
var MidiEventKind = /* @__PURE__ */ ((MidiEventKind2) => {
  MidiEventKind2[MidiEventKind2["NoteOff"] = 128] = "NoteOff";
  MidiEventKind2[MidiEventKind2["NoteOn"] = 144] = "NoteOn";
  MidiEventKind2[MidiEventKind2["PolyPressure"] = 160] = "PolyPressure";
  MidiEventKind2[MidiEventKind2["ControlChange"] = 176] = "ControlChange";
  MidiEventKind2[MidiEventKind2["ProgramChange"] = 192] = "ProgramChange";
  MidiEventKind2[MidiEventKind2["ChannelPressure"] = 208] = "ChannelPressure";
  MidiEventKind2[MidiEventKind2["PitchBend"] = 224] = "PitchBend";
  MidiEventKind2[MidiEventKind2["SysEx"] = 240] = "SysEx";
  MidiEventKind2[MidiEventKind2["SysExContinue"] = 247] = "SysExContinue";
  MidiEventKind2[MidiEventKind2["Meta"] = 255] = "Meta";
  return MidiEventKind2;
})(MidiEventKind || {});
var MetaType = /* @__PURE__ */ ((MetaType2) => {
  MetaType2[MetaType2["SequenceNumber"] = 0] = "SequenceNumber";
  MetaType2[MetaType2["TextEvent"] = 1] = "TextEvent";
  MetaType2[MetaType2["Copyright"] = 2] = "Copyright";
  MetaType2[MetaType2["TrackName"] = 3] = "TrackName";
  MetaType2[MetaType2["InstrumentName"] = 4] = "InstrumentName";
  MetaType2[MetaType2["Lyric"] = 5] = "Lyric";
  MetaType2[MetaType2["Marker"] = 6] = "Marker";
  MetaType2[MetaType2["CuePoint"] = 7] = "CuePoint";
  MetaType2[MetaType2["ChannelPrefix"] = 32] = "ChannelPrefix";
  MetaType2[MetaType2["EndOfTrack"] = 47] = "EndOfTrack";
  MetaType2[MetaType2["SetTempo"] = 81] = "SetTempo";
  MetaType2[MetaType2["SMPTEOffset"] = 84] = "SMPTEOffset";
  MetaType2[MetaType2["TimeSignature"] = 88] = "TimeSignature";
  MetaType2[MetaType2["KeySignature"] = 89] = "KeySignature";
  MetaType2[MetaType2["SequencerSpecific"] = 127] = "SequencerSpecific";
  return MetaType2;
})(MetaType || {});

// src/midi/MidiParser.ts
function readString(view, offset, len) {
  let s = "";
  for (let i = 0; i < len; i++)
    s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}
function readVLQ(data, offset) {
  let value = 0;
  let bytesRead = 0;
  let b;
  do {
    if (offset + bytesRead >= data.length)
      throw new Error("VLQ overrun");
    b = data[offset + bytesRead];
    value = value << 7 | b & 127;
    bytesRead++;
    if (bytesRead > 4)
      throw new Error("VLQ too long");
  } while (b & 128);
  return [value, bytesRead];
}
function textDecoder(data) {
  try {
    return new TextDecoder("utf-8").decode(data);
  } catch {
    return Array.from(data).map((b) => String.fromCharCode(b)).join("");
  }
}
function channelMessageLength(status) {
  const hi = status & 240;
  if (hi === 192 || hi === 208)
    return 1;
  return 2;
}
function parseTrack(data) {
  const events = [];
  let offset = 0;
  let runningStatus = 0;
  let absoluteTicks = 0;
  let trackName;
  while (offset < data.length) {
    const [deltaTicks, vlqLen] = readVLQ(data, offset);
    offset += vlqLen;
    absoluteTicks += deltaTicks;
    if (offset >= data.length)
      break;
    let statusByte = data[offset];
    if (statusByte & 128) {
      offset++;
    } else {
      statusByte = runningStatus;
    }
    const event = {
      deltaTicks,
      absoluteTicks,
      absoluteTime: 0,
      type: 144 /* NoteOn */,
      status: statusByte,
      channel: -1,
      data1: 0,
      data2: 0,
      metaType: 0,
      rawData: new Uint8Array(0)
    };
    if (statusByte === 255) {
      event.type = 255 /* Meta */;
      event.metaType = data[offset++];
      const [len, vl] = readVLQ(data, offset);
      offset += vl;
      event.rawData = data.slice(offset, offset + len);
      offset += len;
      if (event.metaType === 81 /* SetTempo */ && event.rawData.length >= 3) {
        event.data1 = event.rawData[0] << 16 | event.rawData[1] << 8 | event.rawData[2];
      } else if (event.metaType === 3 /* TrackName */) {
        trackName = textDecoder(event.rawData);
      } else if (event.metaType === 88 /* TimeSignature */ && event.rawData.length >= 4) {
        event.data1 = event.rawData[0];
        event.data2 = event.rawData[1];
      } else if (event.metaType === 89 /* KeySignature */ && event.rawData.length >= 2) {
        event.data1 = event.rawData[0] << 24 >> 24;
        event.data2 = event.rawData[1];
      }
      runningStatus = 0;
    } else if (statusByte === 240) {
      event.type = 240 /* SysEx */;
      const [len, vl] = readVLQ(data, offset);
      offset += vl;
      event.rawData = data.slice(offset, offset + len);
      offset += len;
      runningStatus = 0;
    } else if (statusByte === 247) {
      event.type = 247 /* SysExContinue */;
      const [len, vl] = readVLQ(data, offset);
      offset += vl;
      event.rawData = data.slice(offset, offset + len);
      offset += len;
      runningStatus = 0;
    } else if (statusByte >= 128 && statusByte <= 239) {
      const hi = statusByte & 240;
      event.type = hi;
      event.channel = statusByte & 15;
      const msgLen = channelMessageLength(statusByte);
      event.data1 = data[offset++];
      if (msgLen === 2) {
        event.data2 = data[offset++];
      }
      if (hi === 224 /* PitchBend */) {
        event.data1 = event.data1 | event.data2 << 7;
      }
      runningStatus = statusByte;
    } else {
      offset++;
    }
    events.push(event);
  }
  return { events, name: trackName };
}
function parseMidi(buffer) {
  const view = new DataView(buffer);
  const data = new Uint8Array(buffer);
  let offset = 0;
  const chunkType = readString(view, offset, 4);
  if (chunkType !== "MThd")
    throw new Error("Not a Standard MIDI file (missing MThd)");
  offset += 4;
  const headerLen = view.getUint32(offset);
  offset += 4;
  if (headerLen < 6)
    throw new Error("MThd chunk too short");
  const format = view.getUint16(offset);
  offset += 2;
  const numTracks = view.getUint16(offset);
  offset += 2;
  const division = view.getUint16(offset);
  offset += 2;
  offset = 8 + headerLen;
  const header = {
    format,
    numTracks,
    ticksPerQuarterNote: 0
  };
  if (division & 32768) {
    const fps = -(division >> 8 << 24 >> 24);
    const tpf = division & 255;
    header.smpte = { framesPerSecond: fps, ticksPerFrame: tpf };
    header.ticksPerQuarterNote = fps * tpf;
  } else {
    header.ticksPerQuarterNote = division;
  }
  const tracks = [];
  for (let i = 0; i < numTracks && offset < data.length; i++) {
    while (offset + 8 <= data.length) {
      const cType = readString(view, offset, 4);
      const cLen = view.getUint32(offset + 4);
      if (cType === "MTrk") {
        offset += 8;
        const end = Math.min(offset + cLen, data.length);
        const trackData = data.slice(offset, end);
        tracks.push(parseTrack(trackData));
        offset = end;
        break;
      }
      offset += 8 + cLen;
    }
  }
  return { header, tracks };
}

// src/midi/TempoMap.ts
var DEFAULT_TEMPO = 5e5;
function buildTimeline(midi) {
  const tpq = midi.header.ticksPerQuarterNote;
  let merged = [];
  for (const track of midi.tracks) {
    for (const ev of track.events) {
      merged.push(ev);
    }
  }
  merged.sort((a, b) => a.absoluteTicks - b.absoluteTicks);
  const tempoMap = [{ tick: 0, tempo: DEFAULT_TEMPO, timeSeconds: 0 }];
  const timeSignatures = [];
  const keySignatures = [];
  for (const ev of merged) {
    if (ev.type === 255 /* Meta */) {
      if (ev.metaType === 81 /* SetTempo */ && ev.rawData.length >= 3) {
        const tempo = ev.rawData[0] << 16 | ev.rawData[1] << 8 | ev.rawData[2];
        const last = tempoMap[tempoMap.length - 1];
        if (ev.absoluteTicks === last.tick) {
          last.tempo = tempo;
        } else {
          const dt = ev.absoluteTicks - last.tick;
          const seconds = last.timeSeconds + dt / tpq * (last.tempo / 1e6);
          tempoMap.push({ tick: ev.absoluteTicks, tempo, timeSeconds: seconds });
        }
      } else if (ev.metaType === 88 /* TimeSignature */ && ev.rawData.length >= 4) {
        timeSignatures.push({
          tick: ev.absoluteTicks,
          numerator: ev.rawData[0],
          denominator: ev.rawData[1],
          clocksPerClick: ev.rawData[2],
          notated32ndPerQuarter: ev.rawData[3]
        });
      } else if (ev.metaType === 89 /* KeySignature */ && ev.rawData.length >= 2) {
        keySignatures.push({
          tick: ev.absoluteTicks,
          key: ev.rawData[0] << 24 >> 24,
          scale: ev.rawData[1]
        });
      }
    }
  }
  let tmIdx = 0;
  for (const ev of merged) {
    while (tmIdx + 1 < tempoMap.length && tempoMap[tmIdx + 1].tick <= ev.absoluteTicks) {
      tmIdx++;
    }
    const tm = tempoMap[tmIdx];
    const dtick = ev.absoluteTicks - tm.tick;
    ev.absoluteTime = tm.timeSeconds + dtick / tpq * (tm.tempo / 1e6);
  }
  const lastEvent = merged[merged.length - 1];
  const durationTicks = lastEvent ? lastEvent.absoluteTicks : 0;
  const durationSeconds = lastEvent ? lastEvent.absoluteTime : 0;
  return {
    events: merged,
    tempoMap,
    timeSignatures,
    keySignatures,
    durationTicks,
    durationSeconds,
    ticksPerQuarterNote: tpq
  };
}
function tickToTime(tick, tempoMap, tpq) {
  let tmIdx = 0;
  while (tmIdx + 1 < tempoMap.length && tempoMap[tmIdx + 1].tick <= tick) {
    tmIdx++;
  }
  const tm = tempoMap[tmIdx];
  const dtick = tick - tm.tick;
  return tm.timeSeconds + dtick / tpq * (tm.tempo / 1e6);
}
function timeToTick(time, tempoMap, tpq) {
  let tmIdx = 0;
  while (tmIdx + 1 < tempoMap.length && tempoMap[tmIdx + 1].timeSeconds <= time) {
    tmIdx++;
  }
  const tm = tempoMap[tmIdx];
  const dt = time - tm.timeSeconds;
  const ticksPerSecond = tpq / (tm.tempo / 1e6);
  return tm.tick + dt * ticksPerSecond;
}

// src/sf2/SF2Types.ts
var SF2Gen = /* @__PURE__ */ ((SF2Gen2) => {
  SF2Gen2[SF2Gen2["startAddrsOffset"] = 0] = "startAddrsOffset";
  SF2Gen2[SF2Gen2["endAddrsOffset"] = 1] = "endAddrsOffset";
  SF2Gen2[SF2Gen2["startloopAddrsOffset"] = 2] = "startloopAddrsOffset";
  SF2Gen2[SF2Gen2["endloopAddrsOffset"] = 3] = "endloopAddrsOffset";
  SF2Gen2[SF2Gen2["startAddrsCoarseOffset"] = 4] = "startAddrsCoarseOffset";
  SF2Gen2[SF2Gen2["modLfoToPitch"] = 5] = "modLfoToPitch";
  SF2Gen2[SF2Gen2["vibLfoToPitch"] = 6] = "vibLfoToPitch";
  SF2Gen2[SF2Gen2["modEnvToPitch"] = 7] = "modEnvToPitch";
  SF2Gen2[SF2Gen2["initialFilterFc"] = 8] = "initialFilterFc";
  SF2Gen2[SF2Gen2["initialFilterQ"] = 9] = "initialFilterQ";
  SF2Gen2[SF2Gen2["modLfoToFilterFc"] = 10] = "modLfoToFilterFc";
  SF2Gen2[SF2Gen2["modLfoToVolume"] = 11] = "modLfoToVolume";
  SF2Gen2[SF2Gen2["endAddrsCoarseOffset"] = 12] = "endAddrsCoarseOffset";
  SF2Gen2[SF2Gen2["modEnvToFilterFc"] = 13] = "modEnvToFilterFc";
  SF2Gen2[SF2Gen2["chorusEffectsSend"] = 15] = "chorusEffectsSend";
  SF2Gen2[SF2Gen2["reverbEffectsSend"] = 16] = "reverbEffectsSend";
  SF2Gen2[SF2Gen2["pan"] = 17] = "pan";
  SF2Gen2[SF2Gen2["delayModLFO"] = 21] = "delayModLFO";
  SF2Gen2[SF2Gen2["freqModLFO"] = 22] = "freqModLFO";
  SF2Gen2[SF2Gen2["delayVibLFO"] = 23] = "delayVibLFO";
  SF2Gen2[SF2Gen2["freqVibLFO"] = 24] = "freqVibLFO";
  SF2Gen2[SF2Gen2["delayModEnv"] = 25] = "delayModEnv";
  SF2Gen2[SF2Gen2["attackModEnv"] = 26] = "attackModEnv";
  SF2Gen2[SF2Gen2["holdModEnv"] = 27] = "holdModEnv";
  SF2Gen2[SF2Gen2["decayModEnv"] = 28] = "decayModEnv";
  SF2Gen2[SF2Gen2["sustainModEnv"] = 29] = "sustainModEnv";
  SF2Gen2[SF2Gen2["releaseModEnv"] = 30] = "releaseModEnv";
  SF2Gen2[SF2Gen2["keynumToModEnvHold"] = 31] = "keynumToModEnvHold";
  SF2Gen2[SF2Gen2["keynumToModEnvDecay"] = 32] = "keynumToModEnvDecay";
  SF2Gen2[SF2Gen2["delayVolEnv"] = 33] = "delayVolEnv";
  SF2Gen2[SF2Gen2["attackVolEnv"] = 34] = "attackVolEnv";
  SF2Gen2[SF2Gen2["holdVolEnv"] = 35] = "holdVolEnv";
  SF2Gen2[SF2Gen2["decayVolEnv"] = 36] = "decayVolEnv";
  SF2Gen2[SF2Gen2["sustainVolEnv"] = 37] = "sustainVolEnv";
  SF2Gen2[SF2Gen2["releaseVolEnv"] = 38] = "releaseVolEnv";
  SF2Gen2[SF2Gen2["keynumToVolEnvHold"] = 39] = "keynumToVolEnvHold";
  SF2Gen2[SF2Gen2["keynumToVolEnvDecay"] = 40] = "keynumToVolEnvDecay";
  SF2Gen2[SF2Gen2["instrument"] = 41] = "instrument";
  SF2Gen2[SF2Gen2["keyRange"] = 43] = "keyRange";
  SF2Gen2[SF2Gen2["velRange"] = 44] = "velRange";
  SF2Gen2[SF2Gen2["startloopAddrsCoarseOffset"] = 45] = "startloopAddrsCoarseOffset";
  SF2Gen2[SF2Gen2["keynum"] = 46] = "keynum";
  SF2Gen2[SF2Gen2["velocity"] = 47] = "velocity";
  SF2Gen2[SF2Gen2["initialAttenuation"] = 48] = "initialAttenuation";
  SF2Gen2[SF2Gen2["endloopAddrsCoarseOffset"] = 50] = "endloopAddrsCoarseOffset";
  SF2Gen2[SF2Gen2["coarseTune"] = 51] = "coarseTune";
  SF2Gen2[SF2Gen2["fineTune"] = 52] = "fineTune";
  SF2Gen2[SF2Gen2["sampleID"] = 53] = "sampleID";
  SF2Gen2[SF2Gen2["sampleModes"] = 54] = "sampleModes";
  SF2Gen2[SF2Gen2["scaleTuning"] = 56] = "scaleTuning";
  SF2Gen2[SF2Gen2["exclusiveClass"] = 57] = "exclusiveClass";
  SF2Gen2[SF2Gen2["overridingRootKey"] = 58] = "overridingRootKey";
  SF2Gen2[SF2Gen2["endOper"] = 60] = "endOper";
  return SF2Gen2;
})(SF2Gen || {});
var SF2SampleMode = /* @__PURE__ */ ((SF2SampleMode2) => {
  SF2SampleMode2[SF2SampleMode2["NoLoop"] = 0] = "NoLoop";
  SF2SampleMode2[SF2SampleMode2["LoopContinuous"] = 1] = "LoopContinuous";
  SF2SampleMode2[SF2SampleMode2["LoopReleaseEnd"] = 3] = "LoopReleaseEnd";
  return SF2SampleMode2;
})(SF2SampleMode || {});
var GENERATOR_DEFAULTS = {
  [0 /* startAddrsOffset */]: 0,
  [1 /* endAddrsOffset */]: 0,
  [2 /* startloopAddrsOffset */]: 0,
  [3 /* endloopAddrsOffset */]: 0,
  [4 /* startAddrsCoarseOffset */]: 0,
  [12 /* endAddrsCoarseOffset */]: 0,
  [45 /* startloopAddrsCoarseOffset */]: 0,
  [50 /* endloopAddrsCoarseOffset */]: 0,
  [5 /* modLfoToPitch */]: 0,
  [6 /* vibLfoToPitch */]: 0,
  [7 /* modEnvToPitch */]: 0,
  [8 /* initialFilterFc */]: 13500,
  [9 /* initialFilterQ */]: 0,
  [10 /* modLfoToFilterFc */]: 0,
  [11 /* modLfoToVolume */]: 0,
  [13 /* modEnvToFilterFc */]: 0,
  [15 /* chorusEffectsSend */]: 0,
  [16 /* reverbEffectsSend */]: 0,
  [17 /* pan */]: 0,
  [21 /* delayModLFO */]: -12e3,
  [22 /* freqModLFO */]: 0,
  [23 /* delayVibLFO */]: -12e3,
  [24 /* freqVibLFO */]: 0,
  [25 /* delayModEnv */]: -12e3,
  [26 /* attackModEnv */]: -12e3,
  [27 /* holdModEnv */]: -12e3,
  [28 /* decayModEnv */]: -12e3,
  [29 /* sustainModEnv */]: 0,
  [30 /* releaseModEnv */]: -12e3,
  [31 /* keynumToModEnvHold */]: 0,
  [32 /* keynumToModEnvDecay */]: 0,
  [33 /* delayVolEnv */]: -12e3,
  [34 /* attackVolEnv */]: -12e3,
  [35 /* holdVolEnv */]: -12e3,
  [36 /* decayVolEnv */]: -12e3,
  [37 /* sustainVolEnv */]: 0,
  [38 /* releaseVolEnv */]: -12e3,
  [39 /* keynumToVolEnvHold */]: 0,
  [40 /* keynumToVolEnvDecay */]: 0,
  [48 /* initialAttenuation */]: 0,
  [51 /* coarseTune */]: 0,
  [52 /* fineTune */]: 0,
  [56 /* scaleTuning */]: 100,
  [57 /* exclusiveClass */]: 0,
  [54 /* sampleModes */]: 0
};
var SAMPLE_GENERATORS = /* @__PURE__ */ new Set([
  0 /* startAddrsOffset */,
  1 /* endAddrsOffset */,
  2 /* startloopAddrsOffset */,
  3 /* endloopAddrsOffset */,
  4 /* startAddrsCoarseOffset */,
  12 /* endAddrsCoarseOffset */,
  45 /* startloopAddrsCoarseOffset */,
  50 /* endloopAddrsCoarseOffset */,
  54 /* sampleModes */,
  57 /* exclusiveClass */,
  58 /* overridingRootKey */
]);

// src/sf2/SF2Parser.ts
function readFourCC(view, offset) {
  let s = "";
  for (let i = 0; i < 4; i++)
    s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}
function readZStr(view, offset, maxLen) {
  let s = "";
  for (let i = 0; i < maxLen; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0)
      break;
    s += String.fromCharCode(c);
  }
  return s;
}
function readChunk(view, offset) {
  const id = readFourCC(view, offset);
  const size = view.getUint32(offset + 4, true);
  let formType;
  let dataOffset = offset + 8;
  if (id === "RIFF" || id === "LIST") {
    formType = readFourCC(view, dataOffset);
    dataOffset += 4;
  }
  return { id, size, dataOffset, formType };
}
function readSubChunks(view, start, end) {
  const chunks = [];
  let off = start;
  while (off + 8 <= end) {
    const chunk = readChunk(view, off);
    chunks.push(chunk);
    off += 8 + chunk.size;
    if (off & 1)
      off++;
  }
  return chunks;
}
function parsePresetHeaders(view, offset, size) {
  const count = Math.floor(size / 38);
  const headers = [];
  for (let i = 0; i < count; i++) {
    const o = offset + i * 38;
    headers.push({
      name: readZStr(view, o, 20),
      preset: view.getUint16(o + 20, true),
      bank: view.getUint16(o + 22, true),
      bagIndex: view.getUint16(o + 24, true),
      library: view.getUint32(o + 26, true),
      genre: view.getUint32(o + 30, true),
      morphology: view.getUint32(o + 34, true)
    });
  }
  return headers;
}
function parseBags(view, offset, size) {
  const count = Math.floor(size / 4);
  const bags = [];
  for (let i = 0; i < count; i++) {
    const o = offset + i * 4;
    bags.push({
      genIndex: view.getUint16(o, true),
      modIndex: view.getUint16(o + 2, true)
    });
  }
  return bags;
}
function parseMods(view, offset, size) {
  const count = Math.floor(size / 10);
  const mods = [];
  for (let i = 0; i < count; i++) {
    const o = offset + i * 10;
    mods.push({
      srcOper: view.getUint16(o, true),
      destOper: view.getUint16(o + 2, true),
      amount: view.getInt16(o + 4, true),
      amtSrcOper: view.getUint16(o + 6, true),
      transOper: view.getUint16(o + 8, true)
    });
  }
  return mods;
}
function parseGens(view, offset, size) {
  const count = Math.floor(size / 4);
  const gens = [];
  for (let i = 0; i < count; i++) {
    const o = offset + i * 4;
    gens.push({
      oper: view.getUint16(o, true),
      amount: view.getInt16(o + 2, true)
      // signed by default
    });
  }
  return gens;
}
function parseInstHeaders(view, offset, size) {
  const count = Math.floor(size / 22);
  const headers = [];
  for (let i = 0; i < count; i++) {
    const o = offset + i * 22;
    headers.push({
      name: readZStr(view, o, 20),
      bagIndex: view.getUint16(o + 20, true)
    });
  }
  return headers;
}
function parseSampleHeaders(view, offset, size) {
  const count = Math.floor(size / 46);
  const headers = [];
  for (let i = 0; i < count; i++) {
    const o = offset + i * 46;
    headers.push({
      name: readZStr(view, o, 20),
      start: view.getUint32(o + 20, true),
      end: view.getUint32(o + 24, true),
      loopStart: view.getUint32(o + 28, true),
      loopEnd: view.getUint32(o + 32, true),
      sampleRate: view.getUint32(o + 36, true),
      originalPitch: view.getUint8(o + 40),
      pitchCorrection: view.getInt8(o + 41),
      sampleLink: view.getUint16(o + 42, true),
      sampleType: view.getUint16(o + 44, true)
    });
  }
  return headers;
}
function buildZones(bags, gens, mods, startBag, endBag, terminalGen) {
  const zones = [];
  let globalZone;
  for (let zoneIdx = startBag; zoneIdx < endBag; zoneIdx++) {
    const bag = bags[zoneIdx];
    const nextBag = bags[zoneIdx + 1];
    if (!bag || !nextBag)
      break;
    const genStart = bag.genIndex;
    const genEnd = nextBag.genIndex;
    const modStart = bag.modIndex;
    const modEnd = nextBag.modIndex;
    const zone = {
      keyRangeLo: 0,
      keyRangeHi: 127,
      velRangeLo: 0,
      velRangeHi: 127,
      generators: /* @__PURE__ */ new Map(),
      modulators: []
    };
    for (let gi = genStart; gi < genEnd && gi < gens.length; gi++) {
      const gen = gens[gi];
      if (gen.oper === 43 /* keyRange */) {
        zone.keyRangeLo = gen.amount & 255;
        zone.keyRangeHi = gen.amount >> 8 & 255;
      } else if (gen.oper === 44 /* velRange */) {
        zone.velRangeLo = gen.amount & 255;
        zone.velRangeHi = gen.amount >> 8 & 255;
      }
      zone.generators.set(gen.oper, gen.amount);
    }
    for (let mi = modStart; mi < modEnd && mi < mods.length; mi++) {
      zone.modulators.push(mods[mi]);
    }
    const isFirstZone = zoneIdx === startBag;
    const hasTerminal = zone.generators.has(terminalGen);
    if (isFirstZone && !hasTerminal) {
      globalZone = zone;
    } else if (hasTerminal) {
      zones.push(zone);
    }
  }
  return { zones, globalZone };
}
function parseSF2(buffer) {
  const view = new DataView(buffer);
  const riff = readChunk(view, 0);
  if (riff.id !== "RIFF" || riff.formType !== "sfbk") {
    throw new Error("Not a SoundFont 2 file (expected RIFF/sfbk)");
  }
  const topEnd = 8 + riff.size;
  const topChunks = readSubChunks(view, riff.dataOffset, topEnd);
  let info = {
    version: { major: 2, minor: 1 },
    soundEngine: "EMU8000",
    name: "Unknown"
  };
  let sampleData = new Int16Array(0);
  let sampleDataFloat = new Float32Array(0);
  let rawPresetHeaders = [];
  let rawPresetBags = [];
  let rawPresetMods = [];
  let rawPresetGens = [];
  let rawInstHeaders = [];
  let rawInstBags = [];
  let rawInstMods = [];
  let rawInstGens = [];
  let rawSampleHeaders = [];
  for (const chunk of topChunks) {
    if (chunk.id === "LIST") {
      const listSubs = readSubChunks(view, chunk.dataOffset, chunk.dataOffset - 4 + chunk.size);
      if (chunk.formType === "INFO") {
        for (const sub of listSubs) {
          const d = sub.dataOffset;
          const s = sub.size;
          switch (sub.id) {
            case "ifil":
              info.version = { major: view.getUint16(d, true), minor: view.getUint16(d + 2, true) };
              break;
            case "isng":
              info.soundEngine = readZStr(view, d, s);
              break;
            case "INAM":
              info.name = readZStr(view, d, s);
              break;
            case "irom":
              info.rom = readZStr(view, d, s);
              break;
            case "iver":
              info.romVersion = { major: view.getUint16(d, true), minor: view.getUint16(d + 2, true) };
              break;
            case "ICRD":
              info.creationDate = readZStr(view, d, s);
              break;
            case "IENG":
              info.engineers = readZStr(view, d, s);
              break;
            case "IPRD":
              info.product = readZStr(view, d, s);
              break;
            case "ICOP":
              info.copyright = readZStr(view, d, s);
              break;
            case "ICMT":
              info.comments = readZStr(view, d, s);
              break;
            case "ISFT":
              info.tools = readZStr(view, d, s);
              break;
          }
        }
      } else if (chunk.formType === "sdta") {
        for (const sub of listSubs) {
          if (sub.id === "smpl") {
            const numSamples = Math.floor(sub.size / 2);
            sampleData = new Int16Array(numSamples);
            sampleDataFloat = new Float32Array(numSamples);
            for (let i = 0; i < numSamples; i++) {
              const val = view.getInt16(sub.dataOffset + i * 2, true);
              sampleData[i] = val;
              sampleDataFloat[i] = val / 32768;
            }
          }
        }
      } else if (chunk.formType === "pdta") {
        for (const sub of listSubs) {
          const d = sub.dataOffset;
          const s = sub.size;
          switch (sub.id) {
            case "phdr":
              rawPresetHeaders = parsePresetHeaders(view, d, s);
              break;
            case "pbag":
              rawPresetBags = parseBags(view, d, s);
              break;
            case "pmod":
              rawPresetMods = parseMods(view, d, s);
              break;
            case "pgen":
              rawPresetGens = parseGens(view, d, s);
              break;
            case "inst":
              rawInstHeaders = parseInstHeaders(view, d, s);
              break;
            case "ibag":
              rawInstBags = parseBags(view, d, s);
              break;
            case "imod":
              rawInstMods = parseMods(view, d, s);
              break;
            case "igen":
              rawInstGens = parseGens(view, d, s);
              break;
            case "shdr":
              rawSampleHeaders = parseSampleHeaders(view, d, s);
              break;
          }
        }
      }
    }
  }
  const presets = [];
  const termPresetIdx = rawPresetHeaders.length - 1;
  for (let pi = 0; pi < termPresetIdx; pi++) {
    const ph = rawPresetHeaders[pi];
    const nextPh = rawPresetHeaders[pi + 1];
    const { zones, globalZone } = buildZones(
      rawPresetBags,
      rawPresetGens,
      rawPresetMods,
      ph.bagIndex,
      nextPh.bagIndex,
      41 /* instrument */
    );
    presets.push({ name: ph.name, preset: ph.preset, bank: ph.bank, zones, globalZone });
  }
  const instruments = [];
  const termInstIdx = rawInstHeaders.length - 1;
  for (let ii = 0; ii < termInstIdx; ii++) {
    const ih = rawInstHeaders[ii];
    const nextIh = rawInstHeaders[ii + 1];
    const { zones, globalZone } = buildZones(
      rawInstBags,
      rawInstGens,
      rawInstMods,
      ih.bagIndex,
      nextIh.bagIndex,
      53 /* sampleID */
    );
    instruments.push({ name: ih.name, zones, globalZone });
  }
  const termSampleIdx = rawSampleHeaders.length - 1;
  const samples = [];
  for (let si = 0; si < termSampleIdx; si++) {
    const sh = rawSampleHeaders[si];
    let pitch = sh.originalPitch;
    if (pitch >= 128 && pitch !== 255)
      pitch = 60;
    if (pitch === 255)
      pitch = 60;
    samples.push({
      name: sh.name,
      start: sh.start,
      end: sh.end,
      loopStart: sh.loopStart,
      loopEnd: sh.loopEnd,
      sampleRate: sh.sampleRate || 44100,
      originalPitch: pitch,
      pitchCorrection: sh.pitchCorrection,
      sampleLink: sh.sampleLink,
      sampleType: sh.sampleType
    });
  }
  return {
    info,
    sampleData,
    sampleDataFloat,
    presets,
    instruments,
    samples,
    rawPresetHeaders,
    rawPresetBags,
    rawPresetMods,
    rawPresetGens,
    rawInstHeaders,
    rawInstBags,
    rawInstMods,
    rawInstGens,
    rawSampleHeaders
  };
}

// src/synth/Channel.ts
var Channel = class {
  program = 0;
  bank = 0;
  volume = 100;
  // CC 7
  expression = 127;
  // CC 11
  pan = 64;
  // CC 10 (64 = center)
  pitchBend = 8192;
  // 14-bit center
  pitchBendRange = 2;
  // semitones (default ±2)
  sustain = false;
  // CC 64
  modWheel = 0;
  // CC 1
  /** Calculated gain from volume + expression (0–1) */
  get gain() {
    return this.volume / 127 * (this.expression / 127);
  }
  /** Calculated pitch bend in semitones */
  get pitchBendSemitones() {
    return (this.pitchBend - 8192) / 8192 * this.pitchBendRange;
  }
  /** Calculated pan position (-1 to 1) */
  get panPosition() {
    return (this.pan - 64) / 64;
  }
  /** Reset to default state */
  reset() {
    this.program = 0;
    this.bank = 0;
    this.volume = 100;
    this.expression = 127;
    this.pan = 64;
    this.pitchBend = 8192;
    this.pitchBendRange = 2;
    this.sustain = false;
    this.modWheel = 0;
  }
  /** Process a CC message */
  handleCC(controller, value) {
    switch (controller) {
      case 1:
        this.modWheel = value;
        break;
      case 7:
        this.volume = value;
        break;
      case 10:
        this.pan = value;
        break;
      case 11:
        this.expression = value;
        break;
      case 64:
        this.sustain = value >= 64;
        break;
      case 121:
        this.reset();
        break;
    }
  }
};

// src/synth/Envelope.ts
function timecentsToSeconds(tc) {
  if (tc <= -32768)
    return 0;
  return Math.pow(2, tc / 1200);
}
function centibelToGain(cb) {
  if (cb <= 0)
    return 1;
  if (cb >= 1440)
    return 0;
  return Math.pow(10, -cb / 200);
}
function resolveVolEnvelope(gens, key) {
  const g = (gen) => gens.get(gen) ?? GENERATOR_DEFAULTS[gen] ?? 0;
  let holdTC = g(35 /* holdVolEnv */);
  let decayTC = g(36 /* decayVolEnv */);
  const holdScale = g(39 /* keynumToVolEnvHold */);
  const decayScale = g(40 /* keynumToVolEnvDecay */);
  holdTC += holdScale * (key - 60);
  decayTC += decayScale * (key - 60);
  const sustainCB = g(37 /* sustainVolEnv */);
  return {
    delay: timecentsToSeconds(g(33 /* delayVolEnv */)),
    attack: timecentsToSeconds(g(34 /* attackVolEnv */)),
    hold: timecentsToSeconds(holdTC),
    decay: timecentsToSeconds(decayTC),
    sustain: centibelToGain(sustainCB),
    release: timecentsToSeconds(g(38 /* releaseVolEnv */))
  };
}
function scheduleEnvelope(gainNode, env, startTime) {
  const gain = gainNode.gain;
  const minTime = 1e-3;
  const delay = Math.max(env.delay, 0);
  const attack = Math.max(env.attack, minTime);
  const hold = Math.max(env.hold, 0);
  const decay = Math.max(env.decay, minTime);
  const sustain = Math.max(env.sustain, 1e-4);
  const t0 = startTime + delay;
  const t1 = t0 + attack;
  const t2 = t1 + hold;
  const t3 = t2 + decay;
  gain.setValueAtTime(1e-4, startTime);
  if (delay > 0) {
    gain.setValueAtTime(1e-4, t0);
  }
  gain.linearRampToValueAtTime(1, t1);
  if (hold > 0) {
    gain.setValueAtTime(1, t2);
  }
  gain.setTargetAtTime(sustain, t2, decay / 3);
}
function scheduleRelease(gainNode, releaseTime, noteOffTime) {
  const release = Math.max(releaseTime, 5e-3);
  const gain = gainNode.gain;
  gain.cancelScheduledValues(noteOffTime);
  gain.setValueAtTime(gain.value || 1e-4, noteOffTime);
  gain.setTargetAtTime(1e-4, noteOffTime, release / 3);
}

// src/synth/Voice.ts
var Voice = class {
  key;
  velocity;
  channelNum;
  startTime;
  source;
  envGain;
  channelGain;
  panNode;
  releaseTime;
  released = false;
  finished = false;
  sustained = false;
  // held by sustain pedal
  constructor(ctx, dest, params, channel, audioTime) {
    this.key = params.key;
    this.velocity = params.velocity;
    this.channelNum = params.channel;
    this.startTime = audioTime;
    this.releaseTime = params.envelope.release;
    const g = (gen) => params.generators.get(gen) ?? GENERATOR_DEFAULTS[gen] ?? 0;
    this.source = ctx.createBufferSource();
    this.source.buffer = params.sampleBuffer;
    const sampleRate = params.sample.sampleRate;
    const rootKey = g(58 /* overridingRootKey */) >= 0 && g(58 /* overridingRootKey */) <= 127 ? g(58 /* overridingRootKey */) : params.sample.originalPitch;
    const coarseTune = g(51 /* coarseTune */);
    const fineTune = g(52 /* fineTune */) + params.sample.pitchCorrection;
    const scaleTuning = g(56 /* scaleTuning */) / 100;
    const semitones = (params.key - rootKey) * scaleTuning + coarseTune + fineTune / 100;
    const pitchBendSemitones = channel.pitchBendSemitones;
    const totalSemitones = semitones + pitchBendSemitones;
    this.source.playbackRate.value = sampleRate / ctx.sampleRate * Math.pow(2, totalSemitones / 12);
    const sampleModes = g(54 /* sampleModes */);
    if (sampleModes === 1 /* LoopContinuous */ || sampleModes === 3 /* LoopReleaseEnd */) {
      const loopStart = params.sample.loopStart + g(2 /* startloopAddrsOffset */) + g(45 /* startloopAddrsCoarseOffset */) * 32768;
      const loopEnd = params.sample.loopEnd + g(3 /* endloopAddrsOffset */) + g(50 /* endloopAddrsCoarseOffset */) * 32768;
      if (loopEnd > loopStart && loopStart >= params.sample.start) {
        this.source.loop = true;
        this.source.loopStart = (loopStart - params.sample.start) / sampleRate;
        this.source.loopEnd = (loopEnd - params.sample.start) / sampleRate;
      }
    }
    this.envGain = ctx.createGain();
    scheduleEnvelope(this.envGain, params.envelope, audioTime);
    const attenuation = g(48 /* initialAttenuation */);
    const velGain = params.velocity / 127;
    const attenGain = centibelToGain(attenuation);
    this.channelGain = ctx.createGain();
    this.channelGain.gain.value = channel.gain * velGain * attenGain;
    this.panNode = ctx.createStereoPanner();
    const genPan = g(17 /* pan */) / 500;
    this.panNode.pan.value = Math.max(-1, Math.min(1, genPan + channel.panPosition * 0.5));
    this.source.connect(this.envGain);
    this.envGain.connect(this.channelGain);
    this.channelGain.connect(this.panNode);
    this.panNode.connect(dest);
    const startOffset = g(0 /* startAddrsOffset */) + g(4 /* startAddrsCoarseOffset */) * 32768;
    const sampleStart = Math.max(0, startOffset) / sampleRate;
    this.source.start(audioTime, sampleStart);
    this.source.onended = () => {
      this.finished = true;
    };
  }
  get isFinished() {
    return this.finished;
  }
  get isReleased() {
    return this.released;
  }
  /** Update channel gain (for CC changes during note) */
  updateChannelGain(channel) {
    this.channelGain.gain.value = channel.gain * (this.velocity / 127);
  }
  /** Update pitch bend */
  updatePitchBend(channel, sample, gens) {
    const g = (gen) => gens.get(gen) ?? GENERATOR_DEFAULTS[gen] ?? 0;
    const rootKey = g(58 /* overridingRootKey */) >= 0 && g(58 /* overridingRootKey */) <= 127 ? g(58 /* overridingRootKey */) : sample.originalPitch;
    const coarseTune = g(51 /* coarseTune */);
    const fineTune = g(52 /* fineTune */) + sample.pitchCorrection;
    const scaleTuning = g(56 /* scaleTuning */) / 100;
    const semitones = (this.key - rootKey) * scaleTuning + coarseTune + fineTune / 100;
    const total = semitones + channel.pitchBendSemitones;
    this.source.playbackRate.value = sample.sampleRate / this.source.context.sampleRate * Math.pow(2, total / 12);
  }
  /** Trigger note-off release phase */
  release(audioTime) {
    if (this.released)
      return;
    this.released = true;
    this.sustained = false;
    scheduleRelease(this.envGain, this.releaseTime, audioTime);
    const stopTime = audioTime + this.releaseTime * 2 + 0.1;
    try {
      this.source.stop(stopTime);
    } catch {
    }
  }
  /** Immediately stop and disconnect */
  kill() {
    this.finished = true;
    this.released = true;
    try {
      this.source.stop();
    } catch {
    }
    try {
      this.source.disconnect();
      this.envGain.disconnect();
      this.channelGain.disconnect();
      this.panNode.disconnect();
    } catch {
    }
  }
};

// src/synth/Synthesizer.ts
var MAX_VOICES = 128;
var Synthesizer = class {
  ctx;
  masterGain;
  channels = [];
  voices = [];
  sf2 = null;
  presetMap = /* @__PURE__ */ new Map();
  // "bank:program" → preset
  sampleBuffers = /* @__PURE__ */ new Map();
  // sample index → AudioBuffer
  forcedPresetIndex = -1;
  // -1 = normal, ≥0 = forced for all channels
  constructor(ctx) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.connect(ctx.destination);
    for (let i = 0; i < 16; i++) {
      this.channels.push(new Channel());
    }
    this.channels[9].bank = 128;
  }
  get audioContext() {
    return this.ctx;
  }
  /** The master gain node — connect an AnalyserNode here for visualization */
  get output() {
    return this.masterGain;
  }
  get masterVolume() {
    return this.masterGain.gain.value;
  }
  set masterVolume(v) {
    this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(2, v)), this.ctx.currentTime);
  }
  /** Load a parsed SF2 file, building AudioBuffers for all samples */
  loadSF2(sf2) {
    this.sf2 = sf2;
    this.presetMap.clear();
    this.sampleBuffers.clear();
    this.forcedPresetIndex = -1;
    this.buildPresetMap(sf2);
    this.buildSampleBuffers(sf2);
  }
  /**
   * Hot-swap SF2 without interrupting playback.
   * Active voices continue using old AudioBuffers until they finish.
   * New voices will use the new SF2 data immediately.
   * If matchInstrument is provided (bank:program string), attempts to find matching preset.
   */
  hotSwapSF2(sf2, matchInstrument) {
    const newPresetMap = /* @__PURE__ */ new Map();
    for (const preset of sf2.presets) {
      const key = `${preset.bank}:${preset.preset}`;
      if (!newPresetMap.has(key))
        newPresetMap.set(key, preset);
    }
    const newSampleBuffers = /* @__PURE__ */ new Map();
    for (let i = 0; i < sf2.samples.length; i++) {
      const sh = sf2.samples[i];
      if (sh.sampleType & 32768)
        continue;
      const length = sh.end - sh.start;
      if (length <= 0)
        continue;
      const audioBuffer = this.ctx.createBuffer(1, length, sh.sampleRate || 44100);
      const channelData = audioBuffer.getChannelData(0);
      const endIdx = Math.min(sh.start + length, sf2.sampleDataFloat.length);
      for (let j = sh.start; j < endIdx; j++) {
        channelData[j - sh.start] = sf2.sampleDataFloat[j];
      }
      newSampleBuffers.set(i, audioBuffer);
    }
    this.sf2 = sf2;
    this.presetMap = newPresetMap;
    this.sampleBuffers = newSampleBuffers;
    let matchedPreset = -1;
    if (matchInstrument && this.forcedPresetIndex >= 0) {
      for (let i = 0; i < sf2.presets.length; i++) {
        const p = sf2.presets[i];
        if (`${p.bank}:${p.preset}` === matchInstrument) {
          matchedPreset = i;
          break;
        }
      }
      if (matchedPreset < 0) {
        matchedPreset = -1;
      }
      this.forcedPresetIndex = matchedPreset;
    }
    return matchedPreset;
  }
  buildPresetMap(sf2) {
    for (const preset of sf2.presets) {
      const key = `${preset.bank}:${preset.preset}`;
      if (!this.presetMap.has(key)) {
        this.presetMap.set(key, preset);
      }
    }
  }
  buildSampleBuffers(sf2) {
    for (let i = 0; i < sf2.samples.length; i++) {
      const sh = sf2.samples[i];
      if (sh.sampleType & 32768)
        continue;
      const length = sh.end - sh.start;
      if (length <= 0)
        continue;
      const audioBuffer = this.ctx.createBuffer(1, length, sh.sampleRate || 44100);
      const channelData = audioBuffer.getChannelData(0);
      const endIdx = Math.min(sh.start + length, sf2.sampleDataFloat.length);
      for (let j = sh.start; j < endIdx; j++) {
        channelData[j - sh.start] = sf2.sampleDataFloat[j];
      }
      this.sampleBuffers.set(i, audioBuffer);
    }
  }
  /** Set a forced instrument preset for all channels (demo feature) */
  setForcedPreset(presetIndex) {
    this.forcedPresetIndex = presetIndex;
  }
  /** Clear forced preset, return to per-channel normal mapping */
  clearForcedPreset() {
    this.forcedPresetIndex = -1;
  }
  /** Get list of available presets */
  getPresets() {
    if (!this.sf2)
      return [];
    return this.sf2.presets.map((p, i) => ({
      index: i,
      bank: p.bank,
      preset: p.preset,
      name: p.name
    }));
  }
  findPreset(channel, channelNum) {
    if (!this.sf2)
      return void 0;
    if (this.forcedPresetIndex >= 0 && this.forcedPresetIndex < this.sf2.presets.length) {
      return this.sf2.presets[this.forcedPresetIndex];
    }
    const key = `${channel.bank}:${channel.program}`;
    let preset = this.presetMap.get(key);
    if (!preset && channel.bank !== 0) {
      preset = this.presetMap.get(`0:${channel.program}`);
    }
    if (!preset) {
      preset = this.presetMap.get(`${channel.bank}:0`) || this.presetMap.get("0:0");
    }
    return preset;
  }
  /** Process a MIDI note-on event */
  noteOn(channel, key, velocity, audioTime) {
    if (velocity === 0) {
      this.noteOff(channel, key, audioTime);
      return;
    }
    if (!this.sf2)
      return;
    const ch = this.channels[channel];
    const time = audioTime ?? this.ctx.currentTime;
    const preset = this.findPreset(ch, channel);
    if (!preset)
      return;
    const matchedZones = this.matchPresetZones(preset, key, velocity);
    for (const { instZone, presetZone } of matchedZones) {
      const sampleId = instZone.generators.get(53 /* sampleID */);
      if (sampleId === void 0)
        continue;
      const sample = this.sf2.samples[sampleId];
      if (!sample)
        continue;
      const audioBuffer = this.sampleBuffers.get(sampleId);
      if (!audioBuffer)
        continue;
      const mergedGens = this.mergeGenerators(preset, presetZone, instZone);
      const envelope = resolveVolEnvelope(mergedGens, key);
      const voiceParams = {
        key,
        velocity,
        channel,
        sample,
        generators: mergedGens,
        envelope,
        sampleBuffer: audioBuffer
      };
      this.cleanupVoices();
      if (this.voices.length >= MAX_VOICES) {
        const oldest = this.voices.shift();
        oldest?.kill();
      }
      const voice = new Voice(this.ctx, this.masterGain, voiceParams, ch, time);
      this.voices.push(voice);
    }
  }
  /** Process a MIDI note-off event */
  noteOff(channel, key, audioTime) {
    const ch = this.channels[channel];
    const time = audioTime ?? this.ctx.currentTime;
    for (const voice of this.voices) {
      if (voice.channelNum === channel && voice.key === key && !voice.isReleased) {
        if (ch.sustain) {
          voice.sustained = true;
        } else {
          voice.release(time);
        }
      }
    }
  }
  /** Process a MIDI CC event */
  controlChange(channel, controller, value) {
    const ch = this.channels[channel];
    const wasSustained = ch.sustain;
    ch.handleCC(controller, value);
    if (controller === 7 || controller === 11) {
      for (const voice of this.voices) {
        if (voice.channelNum === channel && !voice.isFinished) {
          voice.updateChannelGain(ch);
        }
      }
    }
    if (wasSustained && !ch.sustain) {
      const time = this.ctx.currentTime;
      for (const voice of this.voices) {
        if (voice.channelNum === channel && voice.sustained && !voice.isReleased) {
          voice.release(time);
        }
      }
    }
    if (controller === 120 || controller === 123) {
      this.allNotesOff(channel);
    }
  }
  /** Process a program change event */
  programChange(channel, program) {
    this.channels[channel].program = program;
  }
  /** Process a pitch bend event */
  pitchBend(channel, value) {
    const ch = this.channels[channel];
    ch.pitchBend = value;
  }
  /** Stop all notes on a channel */
  allNotesOff(channel) {
    const time = this.ctx.currentTime;
    for (const voice of this.voices) {
      if (voice.channelNum === channel && !voice.isFinished) {
        voice.kill();
      }
    }
  }
  /** Stop all voices across all channels */
  allSoundOff() {
    for (const voice of this.voices) {
      voice.kill();
    }
    this.voices = [];
  }
  /** Reset all channels to defaults */
  resetAllChannels() {
    for (let i = 0; i < 16; i++) {
      this.channels[i].reset();
    }
    this.channels[9].bank = 128;
  }
  getChannel(ch) {
    return this.channels[ch];
  }
  cleanupVoices() {
    this.voices = this.voices.filter((v) => !v.isFinished);
  }
  /** Match preset zones, then resolve to instrument zones */
  matchPresetZones(preset, key, velocity) {
    const results = [];
    if (!this.sf2)
      return results;
    for (const pZone of preset.zones) {
      if (key < pZone.keyRangeLo || key > pZone.keyRangeHi)
        continue;
      if (velocity < pZone.velRangeLo || velocity > pZone.velRangeHi)
        continue;
      const instId = pZone.generators.get(41 /* instrument */);
      if (instId === void 0)
        continue;
      const instrument = this.sf2.instruments[instId];
      if (!instrument)
        continue;
      for (const iZone of instrument.zones) {
        if (key < iZone.keyRangeLo || key > iZone.keyRangeHi)
          continue;
        if (velocity < iZone.velRangeLo || velocity > iZone.velRangeHi)
          continue;
        results.push({ instZone: iZone, presetZone: pZone });
      }
    }
    return results;
  }
  /** Merge generators: inst global + inst zone (absolute), then preset global + preset zone (additive) */
  mergeGenerators(preset, presetZone, instZone) {
    if (!this.sf2)
      return instZone.generators;
    const merged = /* @__PURE__ */ new Map();
    for (const [gen, val] of Object.entries(GENERATOR_DEFAULTS)) {
      merged.set(Number(gen), val);
    }
    const instId = presetZone.generators.get(41 /* instrument */);
    if (instId !== void 0) {
      const instrument = this.sf2.instruments[instId];
      if (instrument?.globalZone) {
        for (const [gen, val] of instrument.globalZone.generators) {
          merged.set(gen, val);
        }
      }
    }
    for (const [gen, val] of instZone.generators) {
      merged.set(gen, val);
    }
    if (preset.globalZone) {
      for (const [gen, val] of preset.globalZone.generators) {
        if (SAMPLE_GENERATORS.has(gen))
          continue;
        if (gen === 43 /* keyRange */ || gen === 44 /* velRange */ || gen === 41 /* instrument */)
          continue;
        const current = merged.get(gen) ?? 0;
        merged.set(gen, current + val);
      }
    }
    for (const [gen, val] of presetZone.generators) {
      if (SAMPLE_GENERATORS.has(gen))
        continue;
      if (gen === 43 /* keyRange */ || gen === 44 /* velRange */ || gen === 41 /* instrument */)
        continue;
      const current = merged.get(gen) ?? 0;
      merged.set(gen, current + val);
    }
    return merged;
  }
};

// src/engine/Scheduler.ts
var SCHEDULE_AHEAD = 0.1;
var TIMER_INTERVAL = 25;
var Scheduler = class {
  timeline = null;
  synth;
  cursor = 0;
  // index into timeline.events
  startAudioTime = 0;
  // ctx.currentTime when playback started
  startTimelineTime = 0;
  // timeline seconds offset when started
  tempoMultiplier = 1;
  timerId = null;
  playing = false;
  onEventCallback;
  onEndCallback;
  constructor(synth) {
    this.synth = synth;
  }
  get isPlaying() {
    return this.playing;
  }
  get currentTime() {
    if (!this.playing || !this.timeline)
      return this.startTimelineTime;
    const ctx = this.synth.audioContext;
    const elapsed = (ctx.currentTime - this.startAudioTime) * this.tempoMultiplier;
    return this.startTimelineTime + elapsed;
  }
  set tempo(multiplier) {
    if (this.playing) {
      const pos = this.currentTime;
      this.startTimelineTime = pos;
      this.startAudioTime = this.synth.audioContext.currentTime;
    }
    this.tempoMultiplier = Math.max(0.1, Math.min(4, multiplier));
  }
  get tempo() {
    return this.tempoMultiplier;
  }
  setTimeline(timeline) {
    this.timeline = timeline;
    this.cursor = 0;
    this.startTimelineTime = 0;
  }
  start(fromTime) {
    if (!this.timeline)
      return;
    const ctx = this.synth.audioContext;
    if (fromTime !== void 0) {
      this.startTimelineTime = fromTime;
      this.cursor = 0;
      for (let i = 0; i < this.timeline.events.length; i++) {
        if (this.timeline.events[i].absoluteTime >= fromTime) {
          this.cursor = i;
          break;
        }
        if (i === this.timeline.events.length - 1) {
          this.cursor = this.timeline.events.length;
        }
      }
    }
    this.startAudioTime = ctx.currentTime;
    this.playing = true;
    this.scheduleLoop();
  }
  stop() {
    this.playing = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.synth.allSoundOff();
  }
  pause() {
    if (!this.playing)
      return;
    this.startTimelineTime = this.currentTime;
    this.playing = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.synth.allSoundOff();
  }
  resume() {
    if (this.playing)
      return;
    this.start(this.startTimelineTime);
  }
  seekTo(timeSeconds) {
    const wasPlaying = this.playing;
    this.stop();
    if (!this.timeline)
      return;
    this.synth.resetAllChannels();
    for (let i = 0; i < this.timeline.events.length; i++) {
      const ev = this.timeline.events[i];
      if (ev.absoluteTime > timeSeconds)
        break;
      if (ev.type === 192 /* ProgramChange */) {
        this.synth.programChange(ev.channel, ev.data1);
      } else if (ev.type === 176 /* ControlChange */) {
        this.synth.controlChange(ev.channel, ev.data1, ev.data2);
      } else if (ev.type === 224 /* PitchBend */) {
        this.synth.pitchBend(ev.channel, ev.data1);
      }
    }
    if (wasPlaying) {
      this.start(timeSeconds);
    } else {
      this.startTimelineTime = timeSeconds;
      this.cursor = 0;
      if (this.timeline) {
        for (let i = 0; i < this.timeline.events.length; i++) {
          if (this.timeline.events[i].absoluteTime >= timeSeconds) {
            this.cursor = i;
            break;
          }
          if (i === this.timeline.events.length - 1) {
            this.cursor = this.timeline.events.length;
          }
        }
      }
    }
  }
  onEvent(cb) {
    this.onEventCallback = cb;
  }
  onEnd(cb) {
    this.onEndCallback = cb;
  }
  scheduleLoop = () => {
    if (!this.playing || !this.timeline)
      return;
    const ctx = this.synth.audioContext;
    const now = ctx.currentTime;
    const lookAheadEnd = now + SCHEDULE_AHEAD;
    while (this.cursor < this.timeline.events.length) {
      const ev = this.timeline.events[this.cursor];
      const eventTimelineTime = ev.absoluteTime;
      const elapsedTimeline = eventTimelineTime - this.startTimelineTime;
      const audioTime = this.startAudioTime + elapsedTimeline / this.tempoMultiplier;
      if (audioTime > lookAheadEnd)
        break;
      this.dispatchEvent(ev, Math.max(audioTime, now));
      this.onEventCallback?.(ev);
      this.cursor++;
    }
    if (this.cursor >= this.timeline.events.length) {
      this.onEndCallback?.();
      return;
    }
    this.timerId = window.setTimeout(this.scheduleLoop, TIMER_INTERVAL);
  };
  dispatchEvent(ev, audioTime) {
    switch (ev.type) {
      case 144 /* NoteOn */:
        this.synth.noteOn(ev.channel, ev.data1, ev.data2, audioTime);
        break;
      case 128 /* NoteOff */:
        this.synth.noteOff(ev.channel, ev.data1, audioTime);
        break;
      case 176 /* ControlChange */:
        this.synth.controlChange(ev.channel, ev.data1, ev.data2);
        break;
      case 192 /* ProgramChange */:
        this.synth.programChange(ev.channel, ev.data1);
        break;
      case 224 /* PitchBend */:
        this.synth.pitchBend(ev.channel, ev.data1);
        break;
    }
  }
};

// src/engine/Transport.ts
var Transport = class {
  scheduler;
  timeline = null;
  _state = "stopped";
  _loop = false;
  _onStateChange;
  _onProgress;
  progressTimer = null;
  constructor(scheduler) {
    this.scheduler = scheduler;
    this.scheduler.onEnd(() => {
      if (this._loop && this.timeline) {
        this.scheduler.seekTo(0);
        this.scheduler.start(0);
      } else {
        this._state = "stopped";
        this._onStateChange?.("stopped");
        this.stopProgressTimer();
      }
    });
  }
  get state() {
    return this._state;
  }
  get loop() {
    return this._loop;
  }
  set loop(v) {
    this._loop = v;
  }
  get currentTime() {
    return this.scheduler.currentTime;
  }
  get duration() {
    return this.timeline?.durationSeconds ?? 0;
  }
  get tempoMultiplier() {
    return this.scheduler.tempo;
  }
  set tempoMultiplier(v) {
    this.scheduler.tempo = v;
  }
  setTimeline(timeline) {
    this.timeline = timeline;
    this.scheduler.setTimeline(timeline);
    this._state = "stopped";
  }
  play() {
    if (!this.timeline)
      return;
    if (this._state === "paused") {
      this.scheduler.resume();
    } else {
      this.scheduler.seekTo(0);
      this.scheduler.start(0);
    }
    this._state = "playing";
    this._onStateChange?.("playing");
    this.startProgressTimer();
  }
  pause() {
    if (this._state !== "playing")
      return;
    this.scheduler.pause();
    this._state = "paused";
    this._onStateChange?.("paused");
    this.stopProgressTimer();
  }
  stop() {
    this.scheduler.stop();
    this.scheduler.seekTo(0);
    this._state = "stopped";
    this._onStateChange?.("stopped");
    this.stopProgressTimer();
  }
  seek(timeSeconds) {
    const wasPlaying = this._state === "playing";
    this.scheduler.seekTo(Math.max(0, Math.min(timeSeconds, this.duration)));
    if (wasPlaying) {
      this.scheduler.start(timeSeconds);
    }
  }
  onStateChange(cb) {
    this._onStateChange = cb;
  }
  onProgress(cb) {
    this._onProgress = cb;
  }
  onEvent(cb) {
    this.scheduler.onEvent(cb);
  }
  startProgressTimer() {
    this.stopProgressTimer();
    const tick = () => {
      if (this._state === "playing") {
        this._onProgress?.(this.currentTime, this.duration);
        this.progressTimer = window.requestAnimationFrame(tick);
      }
    };
    this.progressTimer = window.requestAnimationFrame(tick);
  }
  stopProgressTimer() {
    if (this.progressTimer !== null) {
      window.cancelAnimationFrame(this.progressTimer);
      this.progressTimer = null;
    }
  }
};

// src/api/Midiocre.ts
var DEFAULT_CONFIG = {
  sf2Path: "SoundFonts",
  midiPath: "DemoMidiFiles",
  sf2Files: [],
  midiFiles: [],
  autoplay: false,
  loop: false,
  volume: 0.8,
  tempo: 1
};
var Midiocre = class {
  ctx;
  synth;
  scheduler;
  transport;
  config;
  currentSF2Name = null;
  currentMIDIName = null;
  loadedSF2 = null;
  loadedMidi = null;
  timeline = null;
  forcedPreset = -1;
  constructor(config) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ctx = new AudioContext();
    this.synth = new Synthesizer(this.ctx);
    this.scheduler = new Scheduler(this.synth);
    this.transport = new Transport(this.scheduler);
    if (this.config.volume !== void 0) {
      this.synth.masterVolume = this.config.volume;
    }
    if (this.config.tempo !== void 0) {
      this.transport.tempoMultiplier = this.config.tempo;
    }
    if (this.config.loop !== void 0) {
      this.transport.loop = this.config.loop;
    }
  }
  /** The underlying AudioContext — for attaching AnalyserNodes, etc. */
  get audioContext() {
    return this.ctx;
  }
  /** The master output GainNode — splice visualizers between this and destination */
  get outputNode() {
    return this.synth.output;
  }
  // -- Config API ------------------------------------------------------------
  getConfig() {
    return { ...this.config };
  }
  configure(partial) {
    Object.assign(this.config, partial);
    if (partial.volume !== void 0)
      this.synth.masterVolume = partial.volume;
    if (partial.tempo !== void 0)
      this.transport.tempoMultiplier = partial.tempo;
    if (partial.loop !== void 0)
      this.transport.loop = partial.loop;
  }
  // -- Discovery API ---------------------------------------------------------
  listSF2Files() {
    return this.config.sf2Files ?? [];
  }
  listMIDIFiles() {
    return this.config.midiFiles ?? [];
  }
  listPresets() {
    return this.synth.getPresets();
  }
  // -- Loading API -----------------------------------------------------------
  async loadSF2(source) {
    let buffer;
    let name = null;
    if (typeof source === "string") {
      name = source;
      const url = source.startsWith("http") || source.startsWith("/") ? source : `${this.config.sf2Path}/${source}`;
      const resp = await fetch(url);
      if (!resp.ok)
        throw new Error(`Failed to load SF2: ${resp.status} ${url}`);
      buffer = await resp.arrayBuffer();
    } else if (source instanceof File) {
      name = source.name;
      buffer = await source.arrayBuffer();
    } else {
      buffer = source;
    }
    const newSF2 = parseSF2(buffer);
    if (this.transport.state === "playing" || this.transport.state === "paused") {
      let matchKey;
      if (this.forcedPreset >= 0 && this.loadedSF2) {
        const oldPreset = this.loadedSF2.presets[this.forcedPreset];
        if (oldPreset)
          matchKey = `${oldPreset.bank}:${oldPreset.preset}`;
      }
      const matched = this.synth.hotSwapSF2(newSF2, matchKey);
      this.loadedSF2 = newSF2;
      this.currentSF2Name = name;
      if (this.forcedPreset >= 0) {
        this.forcedPreset = matched;
      }
    } else {
      this.loadedSF2 = newSF2;
      this.synth.loadSF2(newSF2);
      this.currentSF2Name = name;
    }
  }
  async loadMIDI(source) {
    let buffer;
    let name = null;
    if (typeof source === "string") {
      name = source;
      const url = source.startsWith("http") || source.startsWith("/") ? source : `${this.config.midiPath}/${source}`;
      const resp = await fetch(url);
      if (!resp.ok)
        throw new Error(`Failed to load MIDI: ${resp.status} ${url}`);
      buffer = await resp.arrayBuffer();
    } else if (source instanceof File) {
      name = source.name;
      buffer = await source.arrayBuffer();
    } else {
      buffer = source;
    }
    this.loadedMidi = parseMidi(buffer);
    this.timeline = buildTimeline(this.loadedMidi);
    this.transport.setTimeline(this.timeline);
    this.currentMIDIName = name;
  }
  // -- Transport API ---------------------------------------------------------
  async play() {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn("AudioContext resume failed:", err);
      }
    }
    this.transport.play();
  }
  pause() {
    this.transport.pause();
  }
  stop() {
    this.transport.stop();
  }
  seek(timeSeconds) {
    this.transport.seek(timeSeconds);
  }
  // -- Property accessors ----------------------------------------------------
  get volume() {
    return this.synth.masterVolume;
  }
  set volume(v) {
    this.synth.masterVolume = v;
  }
  get tempo() {
    return this.transport.tempoMultiplier;
  }
  set tempo(v) {
    this.transport.tempoMultiplier = v;
  }
  get loop() {
    return this.transport.loop;
  }
  set loop(v) {
    this.transport.loop = v;
  }
  get currentTime() {
    return this.transport.currentTime;
  }
  get duration() {
    return this.transport.duration;
  }
  get state() {
    return this.transport.state;
  }
  // -- Instrument selection --------------------------------------------------
  setInstrument(presetIndex) {
    this.forcedPreset = presetIndex;
    if (presetIndex >= 0) {
      this.synth.setForcedPreset(presetIndex);
    } else {
      this.synth.clearForcedPreset();
    }
  }
  // -- State serialization ---------------------------------------------------
  getState() {
    return {
      playing: this.transport.state === "playing",
      paused: this.transport.state === "paused",
      currentTime: this.transport.currentTime,
      duration: this.transport.duration,
      volume: this.synth.masterVolume,
      tempo: this.transport.tempoMultiplier,
      loop: this.transport.loop,
      currentSF2: this.currentSF2Name,
      currentMIDI: this.currentMIDIName,
      forcedPreset: this.forcedPreset
    };
  }
  restoreState(state) {
    this.synth.masterVolume = state.volume;
    this.transport.tempoMultiplier = state.tempo;
    this.transport.loop = state.loop;
    if (state.forcedPreset >= 0) {
      this.synth.setForcedPreset(state.forcedPreset);
    } else {
      this.synth.clearForcedPreset();
    }
    this.forcedPreset = state.forcedPreset;
    if (state.playing || state.paused) {
      this.transport.seek(state.currentTime);
      if (state.playing) {
        this.transport.play();
      }
    }
  }
  // -- Callbacks -------------------------------------------------------------
  onStateChange(cb) {
    this.transport.onStateChange(cb);
  }
  onProgress(cb) {
    this.transport.onProgress(cb);
  }
  onEvent(cb) {
    this.transport.onEvent(cb);
  }
  // -- Cleanup ---------------------------------------------------------------
  destroy() {
    this.transport.stop();
    this.ctx.close();
  }
};

// src/sf2/SF2Builder.ts
function writeString(view, offset, str, len) {
  for (let i = 0; i < len; i++) {
    view.setUint8(offset + i, i < str.length ? str.charCodeAt(i) : 0);
  }
}
function writeFourCC(view, offset, cc) {
  for (let i = 0; i < 4; i++)
    view.setUint8(offset + i, cc.charCodeAt(i));
}
function padSize(size) {
  return size + (size & 1);
}
function writeInfoChunk(info) {
  const subChunks = [];
  const ifilBuf = new ArrayBuffer(4);
  const ifilView = new DataView(ifilBuf);
  ifilView.setUint16(0, info.version.major, true);
  ifilView.setUint16(2, info.version.minor, true);
  subChunks.push({ id: "ifil", data: ifilBuf });
  const isng = info.soundEngine || "EMU8000";
  const isngLen = isng.length + 1 + (isng.length + 1 & 1);
  const isngBuf = new ArrayBuffer(isngLen);
  const isngView = new DataView(isngBuf);
  writeString(isngView, 0, isng, isngLen);
  subChunks.push({ id: "isng", data: isngBuf });
  const inam = info.name || "Midiocre Custom SF2";
  const inamLen = inam.length + 1 + (inam.length + 1 & 1);
  const inamBuf = new ArrayBuffer(inamLen);
  writeString(new DataView(inamBuf), 0, inam, inamLen);
  subChunks.push({ id: "INAM", data: inamBuf });
  const optionals = [
    ["ICRD", info.creationDate],
    ["IENG", info.engineers],
    ["IPRD", info.product],
    ["ICOP", info.copyright],
    ["ICMT", info.comments],
    ["ISFT", info.tools || "Midiocre SF2 Builder"]
  ];
  for (const [id, val] of optionals) {
    if (val) {
      const len = val.length + 1 + (val.length + 1 & 1);
      const buf2 = new ArrayBuffer(len);
      writeString(new DataView(buf2), 0, val, len);
      subChunks.push({ id, data: buf2 });
    }
  }
  let dataSize = 4;
  for (const sc of subChunks)
    dataSize += 8 + padSize(sc.data.byteLength);
  const buf = new ArrayBuffer(8 + dataSize);
  const view = new DataView(buf);
  writeFourCC(view, 0, "LIST");
  view.setUint32(4, dataSize, true);
  writeFourCC(view, 8, "INFO");
  let off = 12;
  for (const sc of subChunks) {
    writeFourCC(view, off, sc.id);
    view.setUint32(off + 4, sc.data.byteLength, true);
    new Uint8Array(buf, off + 8, sc.data.byteLength).set(new Uint8Array(sc.data));
    off += 8 + padSize(sc.data.byteLength);
  }
  return buf;
}
function writeSdtaChunk(sampleData) {
  const smplSize = sampleData.length * 2;
  const dataSize = 4 + 8 + smplSize;
  const totalSize = 8 + dataSize;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  writeFourCC(view, 0, "LIST");
  view.setUint32(4, dataSize, true);
  writeFourCC(view, 8, "sdta");
  writeFourCC(view, 12, "smpl");
  view.setUint32(16, smplSize, true);
  for (let i = 0; i < sampleData.length; i++) {
    view.setInt16(20 + i * 2, sampleData[i], true);
  }
  return buf;
}
function writePdtaChunk(presetHeaders, presetBags, presetMods, presetGens, instHeaders, instBags, instMods, instGens, sampleHeaders) {
  const phdrSize = presetHeaders.length * 38;
  const pbagSize = presetBags.length * 4;
  const pmodSize = presetMods.length * 10;
  const pgenSize = presetGens.length * 4;
  const instSize = instHeaders.length * 22;
  const ibagSize = instBags.length * 4;
  const imodSize = instMods.length * 10;
  const igenSize = instGens.length * 4;
  const shdrSize = sampleHeaders.length * 46;
  const dataSize = 4 + // 'pdta'
  9 * 8 + // 9 sub-chunk headers
  phdrSize + pbagSize + pmodSize + pgenSize + instSize + ibagSize + imodSize + igenSize + shdrSize;
  const buf = new ArrayBuffer(8 + dataSize);
  const view = new DataView(buf);
  writeFourCC(view, 0, "LIST");
  view.setUint32(4, dataSize, true);
  writeFourCC(view, 8, "pdta");
  let off = 12;
  writeFourCC(view, off, "phdr");
  view.setUint32(off + 4, phdrSize, true);
  off += 8;
  for (const ph of presetHeaders) {
    writeString(view, off, ph.name, 20);
    off += 20;
    view.setUint16(off, ph.preset, true);
    off += 2;
    view.setUint16(off, ph.bank, true);
    off += 2;
    view.setUint16(off, ph.bagIndex, true);
    off += 2;
    view.setUint32(off, ph.library, true);
    off += 4;
    view.setUint32(off, ph.genre, true);
    off += 4;
    view.setUint32(off, ph.morphology, true);
    off += 4;
  }
  writeFourCC(view, off, "pbag");
  view.setUint32(off + 4, pbagSize, true);
  off += 8;
  for (const b of presetBags) {
    view.setUint16(off, b.genIndex, true);
    off += 2;
    view.setUint16(off, b.modIndex, true);
    off += 2;
  }
  writeFourCC(view, off, "pmod");
  view.setUint32(off + 4, pmodSize, true);
  off += 8;
  for (const m of presetMods) {
    view.setUint16(off, m.srcOper, true);
    off += 2;
    view.setUint16(off, m.destOper, true);
    off += 2;
    view.setInt16(off, m.amount, true);
    off += 2;
    view.setUint16(off, m.amtSrcOper, true);
    off += 2;
    view.setUint16(off, m.transOper, true);
    off += 2;
  }
  writeFourCC(view, off, "pgen");
  view.setUint32(off + 4, pgenSize, true);
  off += 8;
  for (const g of presetGens) {
    view.setUint16(off, g.oper, true);
    off += 2;
    view.setInt16(off, g.amount, true);
    off += 2;
  }
  writeFourCC(view, off, "inst");
  view.setUint32(off + 4, instSize, true);
  off += 8;
  for (const ih of instHeaders) {
    writeString(view, off, ih.name, 20);
    off += 20;
    view.setUint16(off, ih.bagIndex, true);
    off += 2;
  }
  writeFourCC(view, off, "ibag");
  view.setUint32(off + 4, ibagSize, true);
  off += 8;
  for (const b of instBags) {
    view.setUint16(off, b.genIndex, true);
    off += 2;
    view.setUint16(off, b.modIndex, true);
    off += 2;
  }
  writeFourCC(view, off, "imod");
  view.setUint32(off + 4, imodSize, true);
  off += 8;
  for (const m of instMods) {
    view.setUint16(off, m.srcOper, true);
    off += 2;
    view.setUint16(off, m.destOper, true);
    off += 2;
    view.setInt16(off, m.amount, true);
    off += 2;
    view.setUint16(off, m.amtSrcOper, true);
    off += 2;
    view.setUint16(off, m.transOper, true);
    off += 2;
  }
  writeFourCC(view, off, "igen");
  view.setUint32(off + 4, igenSize, true);
  off += 8;
  for (const g of instGens) {
    view.setUint16(off, g.oper, true);
    off += 2;
    view.setInt16(off, g.amount, true);
    off += 2;
  }
  writeFourCC(view, off, "shdr");
  view.setUint32(off + 4, shdrSize, true);
  off += 8;
  for (const sh of sampleHeaders) {
    writeString(view, off, sh.name, 20);
    off += 20;
    view.setUint32(off, sh.start, true);
    off += 4;
    view.setUint32(off, sh.end, true);
    off += 4;
    view.setUint32(off, sh.loopStart, true);
    off += 4;
    view.setUint32(off, sh.loopEnd, true);
    off += 4;
    view.setUint32(off, sh.sampleRate, true);
    off += 4;
    view.setUint8(off, sh.originalPitch);
    off += 1;
    view.setInt8(off, sh.pitchCorrection);
    off += 1;
    view.setUint16(off, sh.sampleLink, true);
    off += 2;
    view.setUint16(off, sh.sampleType, true);
    off += 2;
  }
  return buf;
}
function mergeSF2(entries, info) {
  const allPHdrs = [];
  const allPBags = [];
  const allPMods = [];
  const allPGens = [];
  const allIHdrs = [];
  const allIBags = [];
  const allIMods = [];
  const allIGens = [];
  const allSHdrs = [];
  const sampleChunks = [];
  let sampleOffset = 0;
  for (const entry of entries) {
    const src = entry.source;
    const wantedPresets = new Set(entry.presetIndices);
    const wantedInstruments = /* @__PURE__ */ new Set();
    const wantedSamples = /* @__PURE__ */ new Set();
    for (const pi of wantedPresets) {
      const preset = src.presets[pi];
      if (!preset)
        continue;
      if (preset.globalZone) {
        const gInst = preset.globalZone.generators.get(41);
        if (gInst !== void 0)
          wantedInstruments.add(gInst);
      }
      for (const zone of preset.zones) {
        const instId = zone.generators.get(41);
        if (instId !== void 0)
          wantedInstruments.add(instId);
      }
    }
    for (const ii of wantedInstruments) {
      const inst = src.instruments[ii];
      if (!inst)
        continue;
      if (inst.globalZone) {
        const gSmp = inst.globalZone.generators.get(53);
        if (gSmp !== void 0)
          wantedSamples.add(gSmp);
      }
      for (const zone of inst.zones) {
        const sampleId = zone.generators.get(53);
        if (sampleId !== void 0)
          wantedSamples.add(sampleId);
      }
    }
    const sampleRemap = /* @__PURE__ */ new Map();
    const instRemap = /* @__PURE__ */ new Map();
    const sortedSamples = [...wantedSamples].sort((a, b) => a - b);
    for (const si of sortedSamples) {
      const sh = src.samples[si];
      if (!sh)
        continue;
      const newIdx = allSHdrs.length;
      sampleRemap.set(si, newIdx);
      const len = sh.end - sh.start + 46;
      const slice = new Int16Array(len);
      const endCopy = Math.min(sh.start + len, src.sampleData.length);
      for (let j = sh.start; j < endCopy; j++) {
        slice[j - sh.start] = src.sampleData[j];
      }
      sampleChunks.push(slice);
      const offset = sampleOffset - sh.start;
      allSHdrs.push({
        name: sh.name,
        start: sh.start + offset,
        end: sh.end + offset,
        loopStart: sh.loopStart + offset,
        loopEnd: sh.loopEnd + offset,
        sampleRate: sh.sampleRate,
        originalPitch: sh.originalPitch,
        pitchCorrection: sh.pitchCorrection,
        sampleLink: 0,
        // will fix linked samples if needed
        sampleType: sh.sampleType
      });
      sampleOffset += len;
    }
    for (const si of sortedSamples) {
      const sh = src.samples[si];
      if (!sh)
        continue;
      const newIdx = sampleRemap.get(si);
      if (sh.sampleLink !== 0 && sampleRemap.has(sh.sampleLink)) {
        allSHdrs[newIdx].sampleLink = sampleRemap.get(sh.sampleLink);
      }
    }
    const sortedInsts = [...wantedInstruments].sort((a, b) => a - b);
    for (const ii of sortedInsts) {
      const inst = src.instruments[ii];
      if (!inst)
        continue;
      const newIdx = allIHdrs.length;
      instRemap.set(ii, newIdx);
      allIHdrs.push({ name: inst.name, bagIndex: allIBags.length });
      if (inst.globalZone) {
        allIBags.push({ genIndex: allIGens.length, modIndex: allIMods.length });
        for (const [oper, amount] of inst.globalZone.generators) {
          if (oper === 53) {
            allIGens.push({ oper, amount: sampleRemap.get(amount) ?? 0 });
          } else {
            allIGens.push({ oper, amount });
          }
        }
        for (const mod of inst.globalZone.modulators)
          allIMods.push(mod);
      }
      for (const zone of inst.zones) {
        allIBags.push({ genIndex: allIGens.length, modIndex: allIMods.length });
        for (const [oper, amount] of zone.generators) {
          if (oper === 53) {
            allIGens.push({ oper, amount: sampleRemap.get(amount) ?? 0 });
          } else {
            allIGens.push({ oper, amount });
          }
        }
        for (const mod of zone.modulators)
          allIMods.push(mod);
      }
    }
    for (const pi of [...wantedPresets].sort((a, b) => a - b)) {
      const preset = src.presets[pi];
      if (!preset)
        continue;
      const key = `${preset.bank}:${preset.preset}`;
      const collision = allPHdrs.find(
        (ph) => ph.bank === preset.bank && ph.preset === preset.preset
      );
      const name = collision ? `${preset.name} (${src.info.name?.slice(0, 8) || "src"})` : preset.name;
      const bank = collision ? preset.bank : preset.bank;
      const presetNum = collision ? preset.preset + 100 : preset.preset;
      allPHdrs.push({
        name,
        preset: presetNum,
        bank,
        bagIndex: allPBags.length,
        library: 0,
        genre: 0,
        morphology: 0
      });
      if (preset.globalZone) {
        allPBags.push({ genIndex: allPGens.length, modIndex: allPMods.length });
        for (const [oper, amount] of preset.globalZone.generators) {
          if (oper === 41) {
            allPGens.push({ oper, amount: instRemap.get(amount) ?? 0 });
          } else {
            allPGens.push({ oper, amount });
          }
        }
        for (const mod of preset.globalZone.modulators)
          allPMods.push(mod);
      }
      for (const zone of preset.zones) {
        allPBags.push({ genIndex: allPGens.length, modIndex: allPMods.length });
        for (const [oper, amount] of zone.generators) {
          if (oper === 41) {
            allPGens.push({ oper, amount: instRemap.get(amount) ?? 0 });
          } else {
            allPGens.push({ oper, amount });
          }
        }
        for (const mod of zone.modulators)
          allPMods.push(mod);
      }
    }
  }
  allSHdrs.push({
    name: "EOS",
    start: 0,
    end: 0,
    loopStart: 0,
    loopEnd: 0,
    sampleRate: 0,
    originalPitch: 60,
    pitchCorrection: 0,
    sampleLink: 0,
    sampleType: 0
  });
  allIHdrs.push({ name: "EOI", bagIndex: allIBags.length });
  allIBags.push({ genIndex: allIGens.length, modIndex: allIMods.length });
  allIGens.push({ oper: 0, amount: 0 });
  allIMods.push({ srcOper: 0, destOper: 0, amount: 0, amtSrcOper: 0, transOper: 0 });
  allPHdrs.push({
    name: "EOP",
    preset: 255,
    bank: 255,
    bagIndex: allPBags.length,
    library: 0,
    genre: 0,
    morphology: 0
  });
  allPBags.push({ genIndex: allPGens.length, modIndex: allPMods.length });
  allPGens.push({ oper: 0, amount: 0 });
  allPMods.push({ srcOper: 0, destOper: 0, amount: 0, amtSrcOper: 0, transOper: 0 });
  const totalSamples = sampleChunks.reduce((sum, c) => sum + c.length, 0);
  const mergedSampleData = new Int16Array(totalSamples);
  let writePos = 0;
  for (const chunk of sampleChunks) {
    mergedSampleData.set(chunk, writePos);
    writePos += chunk.length;
  }
  const mergedInfo = {
    version: { major: 2, minor: 1 },
    soundEngine: "EMU8000",
    name: info?.name ?? "MidiocrePack",
    creationDate: info?.creationDate ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    tools: info?.tools ?? "Midiocre SF2 Builder",
    engineers: info?.engineers,
    product: info?.product,
    copyright: info?.copyright,
    comments: info?.comments ?? `Merged from ${entries.length} SF2 sources`
  };
  const infoChunk = writeInfoChunk(mergedInfo);
  const sdtaChunk = writeSdtaChunk(mergedSampleData);
  const pdtaChunk = writePdtaChunk(
    allPHdrs,
    allPBags,
    allPMods,
    allPGens,
    allIHdrs,
    allIBags,
    allIMods,
    allIGens,
    allSHdrs
  );
  const totalDataSize = 4 + infoChunk.byteLength + sdtaChunk.byteLength + pdtaChunk.byteLength;
  const totalFileSize = 8 + totalDataSize;
  const result = new ArrayBuffer(totalFileSize);
  const rv = new DataView(result);
  writeFourCC(rv, 0, "RIFF");
  rv.setUint32(4, totalDataSize, true);
  writeFourCC(rv, 8, "sfbk");
  let wOff = 12;
  new Uint8Array(result, wOff, infoChunk.byteLength).set(new Uint8Array(infoChunk));
  wOff += infoChunk.byteLength;
  new Uint8Array(result, wOff, sdtaChunk.byteLength).set(new Uint8Array(sdtaChunk));
  wOff += sdtaChunk.byteLength;
  new Uint8Array(result, wOff, pdtaChunk.byteLength).set(new Uint8Array(pdtaChunk));
  return result;
}
function buildSF2(source, options = {}) {
  const wantedPresets = new Set(options.presetIndices ?? source.presets.map((_, i) => i));
  const wantedInstruments = new Set(options.instrumentIndices ?? []);
  const wantedSamples = new Set(options.sampleIndices ?? []);
  for (const pi of wantedPresets) {
    const preset = source.presets[pi];
    if (!preset)
      continue;
    for (const zone of preset.zones) {
      const instId = zone.generators.get(41);
      if (instId !== void 0)
        wantedInstruments.add(instId);
    }
  }
  for (const ii of wantedInstruments) {
    const inst = source.instruments[ii];
    if (!inst)
      continue;
    for (const zone of inst.zones) {
      const sampleId = zone.generators.get(53);
      if (sampleId !== void 0)
        wantedSamples.add(sampleId);
    }
  }
  if (wantedSamples.size === 0 && wantedInstruments.size === 0 && wantedPresets.size === 0) {
    source.samples.forEach((_, i) => wantedSamples.add(i));
    source.instruments.forEach((_, i) => wantedInstruments.add(i));
    source.presets.forEach((_, i) => wantedPresets.add(i));
  }
  const sampleRemap = /* @__PURE__ */ new Map();
  const instRemap = /* @__PURE__ */ new Map();
  const presetRemap = /* @__PURE__ */ new Map();
  const sortedSamples = [...wantedSamples].sort((a, b) => a - b);
  sortedSamples.forEach((orig, idx) => sampleRemap.set(orig, idx));
  const sortedInsts = [...wantedInstruments].sort((a, b) => a - b);
  sortedInsts.forEach((orig, idx) => instRemap.set(orig, idx));
  const sortedPresets = [...wantedPresets].sort((a, b) => a - b);
  sortedPresets.forEach((orig, idx) => presetRemap.set(orig, idx));
  let totalSamplePoints = 0;
  const sampleSlices = [];
  for (const si of sortedSamples) {
    const sh = source.samples[si];
    if (!sh)
      continue;
    const len = sh.end - sh.start + 46;
    sampleSlices.push({ src: sh.start, len, newStart: totalSamplePoints });
    totalSamplePoints += len;
  }
  const newSampleData = new Int16Array(totalSamplePoints);
  for (const slice of sampleSlices) {
    const end = Math.min(slice.src + slice.len, source.sampleData.length);
    for (let i = slice.src; i < end; i++) {
      newSampleData[i - slice.src + slice.newStart] = source.sampleData[i];
    }
  }
  const newSampleHeaders = [];
  for (let i = 0; i < sortedSamples.length; i++) {
    const origIdx = sortedSamples[i];
    const sh = source.samples[origIdx];
    const offset = sampleSlices[i].newStart - sh.start;
    newSampleHeaders.push({
      name: sh.name,
      start: sh.start + offset,
      end: sh.end + offset,
      loopStart: sh.loopStart + offset,
      loopEnd: sh.loopEnd + offset,
      sampleRate: sh.sampleRate,
      originalPitch: sh.originalPitch,
      pitchCorrection: sh.pitchCorrection,
      sampleLink: sampleRemap.get(sh.sampleLink) ?? 0,
      sampleType: sh.sampleType
    });
  }
  newSampleHeaders.push({
    name: "EOS",
    start: 0,
    end: 0,
    loopStart: 0,
    loopEnd: 0,
    sampleRate: 0,
    originalPitch: 60,
    pitchCorrection: 0,
    sampleLink: 0,
    sampleType: 0
  });
  const newInstHeaders = [];
  const newInstBags = [];
  const newInstGens = [];
  const newInstMods = [];
  for (const origIdx of sortedInsts) {
    const inst = source.instruments[origIdx];
    if (!inst)
      continue;
    newInstHeaders.push({ name: inst.name, bagIndex: newInstBags.length });
    if (inst.globalZone) {
      newInstBags.push({ genIndex: newInstGens.length, modIndex: newInstMods.length });
      for (const [oper, amount] of inst.globalZone.generators) {
        newInstGens.push({ oper, amount });
      }
      for (const mod of inst.globalZone.modulators) {
        newInstMods.push(mod);
      }
    }
    for (const zone of inst.zones) {
      newInstBags.push({ genIndex: newInstGens.length, modIndex: newInstMods.length });
      for (const [oper, amount] of zone.generators) {
        if (oper === 53) {
          newInstGens.push({ oper, amount: sampleRemap.get(amount) ?? 0 });
        } else {
          newInstGens.push({ oper, amount });
        }
      }
      for (const mod of zone.modulators) {
        newInstMods.push(mod);
      }
    }
  }
  newInstHeaders.push({ name: "EOI", bagIndex: newInstBags.length });
  newInstBags.push({ genIndex: newInstGens.length, modIndex: newInstMods.length });
  newInstGens.push({ oper: 0, amount: 0 });
  newInstMods.push({ srcOper: 0, destOper: 0, amount: 0, amtSrcOper: 0, transOper: 0 });
  const newPresetHeaders = [];
  const newPresetBags = [];
  const newPresetGens = [];
  const newPresetMods = [];
  for (const origIdx of sortedPresets) {
    const preset = source.presets[origIdx];
    if (!preset)
      continue;
    newPresetHeaders.push({
      name: preset.name,
      preset: preset.preset,
      bank: preset.bank,
      bagIndex: newPresetBags.length,
      library: 0,
      genre: 0,
      morphology: 0
    });
    if (preset.globalZone) {
      newPresetBags.push({ genIndex: newPresetGens.length, modIndex: newPresetMods.length });
      for (const [oper, amount] of preset.globalZone.generators) {
        newPresetGens.push({ oper, amount });
      }
      for (const mod of preset.globalZone.modulators) {
        newPresetMods.push(mod);
      }
    }
    for (const zone of preset.zones) {
      newPresetBags.push({ genIndex: newPresetGens.length, modIndex: newPresetMods.length });
      for (const [oper, amount] of zone.generators) {
        if (oper === 41) {
          newPresetGens.push({ oper, amount: instRemap.get(amount) ?? 0 });
        } else {
          newPresetGens.push({ oper, amount });
        }
      }
      for (const mod of zone.modulators) {
        newPresetMods.push(mod);
      }
    }
  }
  newPresetHeaders.push({
    name: "EOP",
    preset: 255,
    bank: 255,
    bagIndex: newPresetBags.length,
    library: 0,
    genre: 0,
    morphology: 0
  });
  newPresetBags.push({ genIndex: newPresetGens.length, modIndex: newPresetMods.length });
  newPresetGens.push({ oper: 0, amount: 0 });
  newPresetMods.push({ srcOper: 0, destOper: 0, amount: 0, amtSrcOper: 0, transOper: 0 });
  const infoChunk = writeInfoChunk(source.info);
  const sdtaChunk = writeSdtaChunk(newSampleData);
  const pdtaChunk = writePdtaChunk(
    newPresetHeaders,
    newPresetBags,
    newPresetMods,
    newPresetGens,
    newInstHeaders,
    newInstBags,
    newInstMods,
    newInstGens,
    newSampleHeaders
  );
  const totalDataSize = 4 + infoChunk.byteLength + sdtaChunk.byteLength + pdtaChunk.byteLength;
  const totalFileSize = 8 + totalDataSize;
  const result = new ArrayBuffer(totalFileSize);
  const rv = new DataView(result);
  writeFourCC(rv, 0, "RIFF");
  rv.setUint32(4, totalDataSize, true);
  writeFourCC(rv, 8, "sfbk");
  let writeOff = 12;
  new Uint8Array(result, writeOff, infoChunk.byteLength).set(new Uint8Array(infoChunk));
  writeOff += infoChunk.byteLength;
  new Uint8Array(result, writeOff, sdtaChunk.byteLength).set(new Uint8Array(sdtaChunk));
  writeOff += sdtaChunk.byteLength;
  new Uint8Array(result, writeOff, pdtaChunk.byteLength).set(new Uint8Array(pdtaChunk));
  return result;
}
export {
  MetaType,
  MidiEventKind,
  Midiocre,
  SF2Gen,
  SF2SampleMode,
  Scheduler,
  Synthesizer,
  Transport,
  buildSF2,
  buildTimeline,
  mergeSF2,
  parseMidi,
  parseSF2,
  tickToTime,
  timeToTick
};
//# sourceMappingURL=midiocre.js.map
