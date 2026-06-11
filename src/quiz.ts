/**
 * quiz.ts - Quiz overlay system.
 * Manages quiz flow: pick question, present choices, verify answer,
 * optionally rephrase via LLM.
 * Difficulty scales with player distance from spawn (Doc 05 §9.1)
 * and adapts via streak-aware modulation (#103).
 * TODO: DOC - quiz flow diagram, streak model
 */

import { getQuestions, type QuizQuestion, type QuizDifficulty } from './config/quiz.config';
import { WORLD_CONFIG } from './config/game.config';
import { rephraseQuizQuestion } from './engine/llm';
import { shuffle } from './engine/utils';

// ─── Difficulty Scaling ──────────────────────────────────────

const DIFFICULTY_ORDER: QuizDifficulty[] = ['easy', 'medium', 'hard'];

// ─── Streak-Aware Difficulty (#103) ──────────────────────────

/** Rolling window size for streak tracking */
const STREAK_WINDOW = 10;
/** Consecutive correct answers to trigger upshift */
const HOT_STREAK_THRESHOLD = 4;
/** Consecutive wrong answers to trigger downshift */
const COLD_STREAK_THRESHOLD = 3;
/** Window correct rate above which we consider hot */
const HOT_RATE_THRESHOLD = 0.80;
/** Window correct rate below which we consider cold */
const COLD_RATE_THRESHOLD = 0.30;
/** Correct answers after cold streak to allow re-ramp */
const RECOVERY_CORRECT_NEEDED = 2;

export type QuizOutcome = 'correct' | 'wrong' | 'idk';
export type StreakZone = 'hot' | 'cold' | 'normal';

export interface StreakState {
  /** Rolling window of recent outcomes (most recent at end) */
  history: QuizOutcome[];
  /** Current consecutive correct answers (resets on wrong) */
  consecutiveCorrect: number;
  /** Current consecutive wrong answers (resets on correct) */
  consecutiveWrong: number;
  /** Whether player is in recovery from a cold streak */
  recovering: boolean;
  /** Correct answers accumulated during recovery phase */
  recoveryCorrect: number;
  /** Reason code for last difficulty modulation decision */
  lastReason: string;
}

/** Create initial streak state */
export function createStreakState(): StreakState {
  return {
    history: [],
    consecutiveCorrect: 0,
    consecutiveWrong: 0,
    recovering: false,
    recoveryCorrect: 0,
    lastReason: 'initial',
  };
}

/**
 * Record a quiz outcome and update streak counters.
 * "I don't know" is neutral — doesn't affect streak but is recorded.
 */
export function recordQuizResult(streak: StreakState, outcome: QuizOutcome): void {
  streak.history.push(outcome);
  // Trim to window size
  if (streak.history.length > STREAK_WINDOW) {
    streak.history.shift();
  }

  if (outcome === 'correct') {
    streak.consecutiveCorrect++;
    streak.consecutiveWrong = 0;
    if (streak.recovering) {
      streak.recoveryCorrect++;
      if (streak.recoveryCorrect >= RECOVERY_CORRECT_NEEDED) {
        streak.recovering = false;
        streak.recoveryCorrect = 0;
      }
    }
  } else if (outcome === 'wrong') {
    streak.consecutiveWrong++;
    streak.consecutiveCorrect = 0;
    // Enter recovery mode after cold streak threshold
    if (streak.consecutiveWrong >= COLD_STREAK_THRESHOLD) {
      streak.recovering = true;
      streak.recoveryCorrect = 0;
    }
  }
  // 'idk' is neutral — no streak effect
}

/**
 * Compute the window-based correct rate (ignoring 'idk').
 * Returns NaN if no scored answers in window.
 */
export function getWindowRate(streak: StreakState): number {
  const scored = streak.history.filter(o => o !== 'idk');
  if (scored.length === 0) return NaN;
  const correct = scored.filter(o => o === 'correct').length;
  return correct / scored.length;
}

/** Classify current streak zone */
export function getStreakZone(streak: StreakState): StreakZone {
  // Check consecutive thresholds first (strongest signal)
  if (streak.consecutiveCorrect >= HOT_STREAK_THRESHOLD) return 'hot';
  if (streak.consecutiveWrong >= COLD_STREAK_THRESHOLD) return 'cold';
  // Then check window rate if enough data
  const rate = getWindowRate(streak);
  if (!isNaN(rate) && streak.history.length >= 5) {
    if (rate >= HOT_RATE_THRESHOLD) return 'hot';
    if (rate <= COLD_RATE_THRESHOLD) return 'cold';
  }
  return 'normal';
}

/**
 * Modulate a base difficulty using streak state.
 * Returns adjusted difficulty and updates streak.lastReason.
 * Rules:
 *  - Hot streak → upshift +1 (bounded at 'hard')
 *  - Cold streak → downshift -1 (bounded at 'easy')
 *  - Recovering → force easy until recovery complete
 *  - Normal → no change
 */
export function modulateDifficulty(
  baseDifficulty: QuizDifficulty,
  streak: StreakState,
): QuizDifficulty {
  const baseIdx = DIFFICULTY_ORDER.indexOf(baseDifficulty);
  const zone = getStreakZone(streak);

  // Recovery override: force downshift regardless of zone
  if (streak.recovering) {
    const recoveryIdx = Math.max(0, baseIdx - 1);
    const result = DIFFICULTY_ORDER[recoveryIdx];
    streak.lastReason = `recovery(${streak.recoveryCorrect}/${RECOVERY_CORRECT_NEEDED})→${result}`;
    return result;
  }

  switch (zone) {
    case 'hot': {
      const upIdx = Math.min(DIFFICULTY_ORDER.length - 1, baseIdx + 1);
      const result = DIFFICULTY_ORDER[upIdx];
      streak.lastReason = `hot(${streak.consecutiveCorrect}cc,${(getWindowRate(streak) * 100).toFixed(0)}%wr)→${result}`;
      return result;
    }
    case 'cold': {
      const downIdx = Math.max(0, baseIdx - 1);
      const result = DIFFICULTY_ORDER[downIdx];
      streak.lastReason = `cold(${streak.consecutiveWrong}cw,${(getWindowRate(streak) * 100).toFixed(0)}%wr)→${result}`;
      return result;
    }
    default: {
      streak.lastReason = `normal→${baseDifficulty}`;
      return baseDifficulty;
    }
  }
}

/** Get debug-friendly streak summary */
export function getStreakDebugInfo(streak: StreakState): {
  zone: StreakZone;
  windowRate: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  recovering: boolean;
  historyLength: number;
  lastReason: string;
} {
  return {
    zone: getStreakZone(streak),
    windowRate: getWindowRate(streak),
    consecutiveCorrect: streak.consecutiveCorrect,
    consecutiveWrong: streak.consecutiveWrong,
    recovering: streak.recovering,
    historyLength: streak.history.length,
    lastReason: streak.lastReason,
  };
}

/**
 * Map chunk Manhattan distance from spawn to a base difficulty.
 * dist 0-2: easy, dist 3-5: medium, dist 6+: hard
 * TODO: DOC - distance-based difficulty thresholds
 */
export function getDifficultyForDistance(chunkDist: number): QuizDifficulty {
  if (chunkDist <= 2) return 'easy';
  if (chunkDist <= 5) return 'medium';
  return 'hard';
}

/**
 * Compute difficulty from player world-space position.
 * Uses Manhattan chunk distance from origin.
 */
export function getDifficultyForPosition(playerX: number, playerY: number): QuizDifficulty {
  const size = WORLD_CONFIG.chunkSize;
  const chunkDist = Math.abs(Math.floor(playerX / size)) + Math.abs(Math.floor(playerY / size));
  return getDifficultyForDistance(chunkDist);
}

/**
 * Blend NPC's preferred difficulty with distance-based difficulty.
 * Takes the harder of the two (Doc 05 §9.1 - distance never lowers difficulty).
 */
export function blendDifficulty(npcPref: QuizDifficulty, distDiff: QuizDifficulty): QuizDifficulty {
  const npcIdx = DIFFICULTY_ORDER.indexOf(npcPref);
  const distIdx = DIFFICULTY_ORDER.indexOf(distDiff);
  return DIFFICULTY_ORDER[Math.max(npcIdx, distIdx)];
}

// ─── Types ───────────────────────────────────────────────────

export interface QuizState {
  active: boolean;
  question: QuizQuestion | null;
  displayText: string;      // Possibly LLM-rephrased
  choices: string[];         // Shuffled answer options (last is always "I don't know")
  correctIndex: number;      // Index of correct answer in shuffled choices
  selectedIndex: number;     // Player's current selection (-1 = none)
  result: 'pending' | 'correct' | 'wrong' | 'idk';
  npcId: string | null;      // NPC that triggered the quiz
  difficulty: QuizDifficulty;
}

// ─── Quiz Manager ────────────────────────────────────────────

export function createQuizState(): QuizState {
  return {
    active: false,
    question: null,
    displayText: '',
    choices: [],
    correctIndex: -1,
    selectedIndex: -1,
    result: 'pending',
    npcId: null,
    difficulty: 'easy',
  };
}

/**
 * Start a quiz for the given difficulty.
 * Picks a random question (biased by category weights), shuffles choices, optionally rephrases.
 * @param categoryBias - optional Record<category, weight> for weighted random selection
 */
export async function startQuiz(
  state: QuizState,
  difficulty: QuizDifficulty,
  npcId: string | null,
  categoryBias?: Record<string, number>,
): Promise<void> {
  // Filter eligible questions
  const eligible = getQuestions(undefined, difficulty);

  if (eligible.length === 0) {
    state.active = false;
    return;
  }

  // Apply category bias: duplicate entries for biased categories
  let pool: QuizQuestion[];
  if (categoryBias && Object.keys(categoryBias).length > 0) {
    pool = [];
    for (const q of eligible) {
      const weight = categoryBias[q.category] || 1;
      for (let i = 0; i < weight; i++) pool.push(q);
    }
  } else {
    pool = eligible;
  }

  const question = pool[Math.floor(Math.random() * pool.length)];

  // Shuffle the answers array (correct answer is always at index 0 in source)
  const shuffledAnswers = [...question.answers];
  shuffle(shuffledAnswers);
  const correctAnswer = question.answers[0]; // Original correct answer
  const correctIdx = shuffledAnswers.indexOf(correctAnswer);

  // Add "I don't know" as the last option
  shuffledAnswers.push("I don't know 📖");

  // Try LLM rephrase (fallback: original text)
  const displayText = await rephraseQuizQuestion(question.question);

  state.active = true;
  state.question = question;
  state.displayText = displayText;
  state.choices = shuffledAnswers;
  state.correctIndex = correctIdx;
  state.selectedIndex = 0;
  state.result = 'pending';
  state.npcId = npcId;
  state.difficulty = difficulty;
}

/**
 * Move selection up/down.
 */
export function quizNavigate(state: QuizState, delta: number): void {
  if (!state.active || state.result !== 'pending') return;
  const len = state.choices.length;
  state.selectedIndex = ((state.selectedIndex + delta) % len + len) % len;
}

/**
 * Jump to a specific choice index (0-based). Used by numeric key shortcuts (#94).
 * Returns true if the index is valid and selection changed.
 */
export function quizSelectIndex(state: QuizState, index: number): boolean {
  if (!state.active || state.result !== 'pending') return false;
  if (index < 0 || index >= state.choices.length) return false;
  state.selectedIndex = index;
  return true;
}

/**
 * Submit the current selection.
 * Returns 'correct', 'wrong', or 'idk'.
 */
export function quizSubmit(state: QuizState): 'correct' | 'wrong' | 'idk' {
  if (!state.active || state.result !== 'pending') return 'wrong';

  // "I don't know" is always the last choice
  if (state.selectedIndex === state.choices.length - 1) {
    state.result = 'idk';
    return 'idk';
  }

  if (state.selectedIndex === state.correctIndex) {
    state.result = 'correct';
    return 'correct';
  } else {
    state.result = 'wrong';
    return 'wrong';
  }
}

/**
 * Close the quiz overlay.
 */
export function quizClose(state: QuizState): void {
  state.active = false;
  state.question = null;
}

/**
 * Rewards for correct quiz answers.
 */
export function quizReward(difficulty: QuizDifficulty): { itemId: string; qty: number }[] {
  // Occasional bandage drop (#109) — 25% chance from easy/medium
  const bandageDrop = Math.random() < 0.25 ? [{ itemId: 'bandage', qty: 1 }] : [];
  switch (difficulty) {
    case 'easy': return [{ itemId: 'coin', qty: 5 }, ...bandageDrop];
    case 'medium': return [{ itemId: 'coin', qty: 15 }, { itemId: 'potion', qty: 1 }, ...bandageDrop];
    case 'hard': return [{ itemId: 'coin', qty: 30 }, { itemId: 'key', qty: 1 }];
  }
}
