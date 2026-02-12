/**
 * quiz.ts - Quiz overlay system.
 * Manages quiz flow: pick question, present choices, verify answer,
 * optionally rephrase via LLM.
 * TODO: DOC - quiz flow diagram
 */

import { getQuestions, type QuizQuestion, type QuizDifficulty } from './config/quiz.config';
import { rephraseQuizQuestion } from './llm';
import { shuffle } from './utils';

// ─── Types ───────────────────────────────────────────────────

export interface QuizState {
  active: boolean;
  question: QuizQuestion | null;
  displayText: string;      // Possibly LLM-rephrased
  choices: string[];         // Shuffled answer options
  correctIndex: number;      // Index of correct answer in shuffled choices
  selectedIndex: number;     // Player's current selection (-1 = none)
  result: 'pending' | 'correct' | 'wrong';
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
 * Picks a random question, shuffles choices, optionally rephrases.
 */
export async function startQuiz(
  state: QuizState,
  difficulty: QuizDifficulty,
  npcId: string | null,
): Promise<void> {
  // Filter eligible questions
  const eligible = getQuestions(undefined, difficulty);

  if (eligible.length === 0) {
    state.active = false;
    return;
  }

  const question = eligible[Math.floor(Math.random() * eligible.length)];

  // Shuffle the answers array (correct answer is always at index 0 in source)
  const shuffledAnswers = [...question.answers];
  shuffle(shuffledAnswers);
  const correctAnswer = question.answers[0]; // Original correct answer
  const correctIdx = shuffledAnswers.indexOf(correctAnswer);

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
 * Submit the current selection.
 * Returns true if correct.
 */
export function quizSubmit(state: QuizState): boolean {
  if (!state.active || state.result !== 'pending') return false;

  if (state.selectedIndex === state.correctIndex) {
    state.result = 'correct';
    return true;
  } else {
    state.result = 'wrong';
    return false;
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
  switch (difficulty) {
    case 'easy': return [{ itemId: 'coin', qty: 5 }];
    case 'medium': return [{ itemId: 'coin', qty: 15 }, { itemId: 'potion', qty: 1 }];
    case 'hard': return [{ itemId: 'coin', qty: 30 }, { itemId: 'key', qty: 1 }];
  }
}
