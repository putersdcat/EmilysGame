/**
 * Entropy.ts — Entropy pool + wordlist state for world generation.
 *
 * Extracted from gen.ts (B3 / #253). Owns the session-growing entropy buffer that
 * salts chunk generation for evolving, player-influenced worlds (#4), the active
 * wordlist, and the direction-pair helper.
 *
 * This is an intentional module-level state service (see ARCHITECTURE.md §7):
 * the entropy buffer + wordlist are mutable session state, surfaced through a
 * narrow getter/setter API. `gen.ts` re-exports the public functions so existing
 * importers (`main.ts`, `ui/ui.ts`) keep importing them from `engine/gen`.
 */
import { DIRECTION_WORDS } from '../../config/entropy.config';

// --- Entropy State ---
// The entropy pool grows over the session as NPC chat words, quiz answers,
// and LLM outputs concatenate. It salts chunk generation for evolving worlds. (#4)

let wordlist: string[] = [];
let lastEntropyOutput = '';
let entropyBuffer = '';
let entropyFeedCount = 0; // Number of external feeds (NPC chat, quiz, etc.)

export function setWordlist(list: string[]): void {
  wordlist = list;
}

export function getWordlist(): string[] {
  return wordlist;
}

/**
 * Feed external text into the entropy pool.
 * Called when NPC dialog, quiz answers, or player chat occurs.
 * The text is appended to the growing entropy buffer, which salts
 * future chunk generation for evolving, player-influenced worlds. (#4)
 */
export function feedEntropy(text: string): void {
  if (!text || text.length === 0) return;
  entropyBuffer += text;
  entropyFeedCount++;
}

/** Get entropy pool stats for debug display. */
export function getEntropyStats(): { poolSize: number; feedCount: number; lastOutput: string } {
  return {
    poolSize: entropyBuffer.length,
    feedCount: entropyFeedCount,
    lastOutput: lastEntropyOutput.slice(0, 40),
  };
}

/** Restore entropy buffer from save data. feedCount approximated from buffer length. */
export function restoreEntropyBuffer(buffer: string): void {
  entropyBuffer = buffer || '';
  // Approximate feedCount from buffer (avg ~40 chars per feed)
  entropyFeedCount = entropyBuffer.length > 0 ? Math.max(1, Math.round(entropyBuffer.length / 40)) : 0;
}

/** Get entropy buffer for saving. */
export function getEntropyBuffer(): string {
  return entropyBuffer;
}

// --- Internal accessors for the async generation path (generateChunk) ---
// These preserve gen.ts's previous direct field access semantics exactly:
// `lastEntropyOutput = text` and a RAW `entropyBuffer += text` (no feedCount bump).

/** Last LLM entropy expansion output (seed for the next expansion). */
export function getLastEntropyOutput(): string {
  return lastEntropyOutput;
}

/** Set the last LLM entropy expansion output. */
export function setLastEntropyOutput(text: string): void {
  lastEntropyOutput = text;
}

/** Append raw text to the entropy buffer WITHOUT bumping the feed count. */
export function appendEntropyRaw(text: string): void {
  entropyBuffer += text;
}

// --- Direction Pair ---

export function getDirectionPair(direction: string, rng: () => number): string {
  const table = DIRECTION_WORDS[direction] || DIRECTION_WORDS['right'];
  const verb = table.verbs[Math.floor(rng() * table.verbs.length)];
  const noun = table.nouns[Math.floor(rng() * table.nouns.length)];
  return `${verb} ${noun}`;
}
