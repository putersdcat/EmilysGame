/**
 * npc-voice.ts — Web Speech API adapter for NPC dialog voice output (#76).
 * Feature detects speechSynthesis, queues/cancels safely, falls back to text-only.
 * TODO: DOC - NPC voice system, settings, per-NPC voice mapping
 */

import { isTestMode } from './llm';

/** Cached once — doesn't change at runtime */
const _isTestMode = isTestMode();

// ─── Types ───────────────────────────────────────────────────

export interface VoiceStyle {
  /** Speech rate (0.1–10, default 1.0) */
  rate: number;
  /** Pitch (0–2, default 1.0) */
  pitch: number;
  /** Preferred voice name substring match (e.g. 'Google UK English Female') */
  voiceHint?: string;
}

export interface VoiceSettings {
  enabled: boolean;
  volume: number; // 0–1
}

export interface VoiceState {
  settings: VoiceSettings;
  /** True if browser supports speechSynthesis */
  supported: boolean;
  /** True if currently speaking */
  speaking: boolean;
  /** NPC id of current speaker (for cancel logic) */
  currentSpeaker: string | null;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: true,
  volume: 0.8,
};

// ─── Per-NPC Voice Styles ────────────────────────────────────
// Maps NPC persona id → voice parameters. Missing entries use defaults.

const NPC_VOICE_STYLES: Record<string, VoiceStyle> = {
  merchant_default:   { rate: 1.3, pitch: 1.4, voiceHint: 'Male' },
  villager_default:   { rate: 1.0, pitch: 1.0, voiceHint: 'Female' },
  guardian_default:   { rate: 0.7, pitch: 0.5, voiceHint: 'Male' },
  cat_default:        { rate: 1.5, pitch: 1.8 },
  black_cat_default:  { rate: 0.9, pitch: 1.6 },
  farmer_meadow:      { rate: 1.0, pitch: 0.9, voiceHint: 'Female' },
  beekeeper_meadow:   { rate: 1.2, pitch: 1.3, voiceHint: 'Male' },
  ranger_forest:      { rate: 0.9, pitch: 0.8, voiceHint: 'Male' },
  hermit_forest:      { rate: 0.7, pitch: 0.6, voiceHint: 'Male' },
  miner_cave:         { rate: 1.0, pitch: 0.7, voiceHint: 'Male' },
  ghost_castle:       { rate: 0.6, pitch: 1.5, voiceHint: 'Female' },
  knight_castle:      { rate: 0.8, pitch: 0.6, voiceHint: 'Male' },
};

const DEFAULT_VOICE_STYLE: VoiceStyle = { rate: 1.0, pitch: 1.0 };

// ─── Internal State ──────────────────────────────────────────

let _voices: SpeechSynthesisVoice[] = [];

function _loadVoices(): void {
  if (typeof speechSynthesis === 'undefined') return;
  _voices = speechSynthesis.getVoices();
}

// Voices load async in most browsers, listen for change
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener?.('voiceschanged', _loadVoices);
  _loadVoices(); // Try sync first (Chrome sometimes has them immediately)
}

// ─── Public API ──────────────────────────────────────────────

/** Create initial voice state with feature detection.
 *  Disabled in test mode to prevent speech during Playwright runs. */
export function createVoiceState(): VoiceState {
  const supported = !_isTestMode
    && typeof speechSynthesis !== 'undefined'
    && typeof SpeechSynthesisUtterance !== 'undefined';
  return {
    settings: { ...DEFAULT_VOICE_SETTINGS },
    supported,
    speaking: false,
    currentSpeaker: null,
  };
}

/**
 * Speak a dialog line for an NPC.
 * Cancels any in-progress speech first.
 * No-ops silently if voice disabled, unsupported, or text is empty.
 */
export function speakLine(state: VoiceState, text: string, npcId: string | null): void {
  if (!state.supported || !state.settings.enabled) return;
  if (!text || text.trim().length === 0) return;

  // Cancel any current speech
  cancelSpeech(state);

  // Clean text: strip emoji, asterisks (cat actions), brackets
  const cleanText = text
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, '') // strip emoji
    .replace(/\*[^*]+\*/g, '')               // strip *actions*
    .replace(/[[\]{}]/g, '')                 // strip brackets
    .trim();

  if (!cleanText) return; // Nothing left to speak (pure emoji line)

  try {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const style = (npcId && NPC_VOICE_STYLES[npcId]) || DEFAULT_VOICE_STYLE;

    utterance.rate = style.rate;
    utterance.pitch = style.pitch;
    utterance.volume = state.settings.volume;

    // Try to match a voice from the hint
    if (style.voiceHint && _voices.length > 0) {
      const hint = style.voiceHint.toLowerCase();
      const match = _voices.find(v =>
        v.name.toLowerCase().includes(hint) && v.lang.startsWith('en')
      );
      if (match) utterance.voice = match;
    }

    // Track state
    state.speaking = true;
    state.currentSpeaker = npcId;

    utterance.onend = () => {
      state.speaking = false;
      state.currentSpeaker = null;
    };
    utterance.onerror = () => {
      state.speaking = false;
      state.currentSpeaker = null;
    };

    speechSynthesis.speak(utterance);
  } catch {
    // Browser may throw — silently fall back
    state.speaking = false;
    state.currentSpeaker = null;
  }
}

/** Cancel any in-progress speech immediately. Safe to call anytime. */
export function cancelSpeech(state: VoiceState): void {
  if (!state.supported) return;
  try {
    speechSynthesis.cancel();
  } catch {
    // Ignore errors
  }
  state.speaking = false;
  state.currentSpeaker = null;
}

/** Toggle voice on/off */
export function toggleVoice(state: VoiceState): void {
  state.settings.enabled = !state.settings.enabled;
  if (!state.settings.enabled) cancelSpeech(state);
}

/** Set voice volume (0–1) */
export function setVoiceVolume(state: VoiceState, vol: number): void {
  state.settings.volume = Math.max(0, Math.min(1, vol));
}

// ─── Serialization ──────────────────────────────────────────

export function serializeVoiceSettings(state: VoiceState): VoiceSettings {
  return { ...state.settings };
}

export function deserializeVoiceSettings(state: VoiceState, saved: Partial<VoiceSettings>): void {
  if (saved.enabled !== undefined) state.settings.enabled = saved.enabled;
  if (saved.volume !== undefined) state.settings.volume = saved.volume;
}

/** Get voice style for an NPC id (for debug/test) */
export function getVoiceStyle(npcId: string): VoiceStyle {
  return NPC_VOICE_STYLES[npcId] || DEFAULT_VOICE_STYLE;
}
