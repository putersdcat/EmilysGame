/**
 * quiz-specials.ts — In-world mini-quizzes (hygiene, insects, wound care).
 *
 * B5 micro-slice 11.8 (#268): extracted from main.ts to make the inline
 * quiz content + start functions modular. The previous shape had the
 * data tables (`HYGIENE_QUESTIONS`, `INSECT_QUESTIONS`) inline in
 * main.ts, which made the content hard to find, hard to extend, and
 * bloated the orchestrator.
 *
 * This module co-locates the question pool, the Fisher-Yates shuffler,
 * and the `start*Quiz(state)` functions that populate `state.quiz.*`
 * for each flavor of in-world mini-quiz. The wound-care variant lives
 * in `./injury.ts` next to its `WOUND_CARE_QUESTIONS` data and
 * `getWoundCareQuestion()` shuffler — same pattern.
 *
 * Content can be expanded by appending to the data arrays. Each entry
 * is `{ question: string, answers: string[] }` with the **first**
 * answer treated as the correct one at shuffle time (mirroring how
 * `getWoundCareQuestion()` already works in injury.ts).
 *
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { type GameState } from './game-state';

// ─── Types ───────────────────────────────────────────────────

/**
 * Single-question payload used by all in-world mini-quizzes
 * (hygiene, insect, wound care).
 *
 * The first entry in `answers` is the correct one; callers shuffle
 * before display so the correct answer is not always at index 0.
 */
export interface MiniQuizQuestion {
  question: string;
  answers: string[];
}

// ─── Hygiene Quiz Pool (#110 Phase 2) ────────────────────────

/** Hygiene quiz questions — fired by outhouse interaction. */
export const HYGIENE_QUESTIONS: readonly MiniQuizQuestion[] = [
  {
    question: 'When should you wash your hands?',
    answers: ['Before eating and after using the bathroom', 'Only when they look dirty', 'Once a week', 'Never'],
  },
  {
    question: 'How long should you wash your hands with soap?',
    answers: ['At least 20 seconds', '2 seconds', '1 minute', 'Just rinse with water'],
  },
  {
    question: 'What kills germs on your hands?',
    answers: ['Soap and water', 'Just water', 'Blowing on them', 'Wiping on your shirt'],
  },
  {
    question: 'Why do we brush our teeth?',
    answers: ['To remove bacteria and prevent cavities', 'To make them shiny', 'Because adults say so', 'To wake up faster'],
  },
  {
    question: 'What should you do after sneezing?',
    answers: ['Wash your hands or use sanitizer', 'Wipe on your sleeve and forget about it', 'Nothing', 'Sneeze again to clear it'],
  },
  {
    question: 'How often should you take a bath or shower?',
    answers: ['Every day or every other day', 'Once a month', 'Only in summer', 'When someone tells you'],
  },
];

/**
 * Pick a random hygiene question (answers pre-shuffled, correctIndex set).
 */
export function getHygieneQuestion(): MiniQuizQuestion {
  const src = HYGIENE_QUESTIONS[Math.floor(Math.random() * HYGIENE_QUESTIONS.length)];
  const shuffled = [...src.answers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { question: src.question, answers: shuffled };
}

/**
 * Return the full hygiene question pool (for debug introspection
 * via `window.__gameDebug.getHygieneQuestions`).
 */
export function getHygieneQuestions(): readonly MiniQuizQuestion[] {
  return HYGIENE_QUESTIONS;
}

// ─── Insect Safety Quiz Pool (#110 Phase 3) ──────────────────

/** Insect safety quiz questions — fired by "eat worms" desperation. */
export const INSECT_QUESTIONS: readonly MiniQuizQuestion[] = [
  {
    question: 'Is it safe to eat insects?',
    answers: ['Some insects are safe if cooked, but many are not', 'All insects are safe to eat', 'No insects are ever safe', 'Only butterflies are safe'],
  },
  {
    question: 'Why do some people eat insects?',
    answers: ['They are high in protein and sustainable', 'They taste like candy', 'There is no reason', 'Insects have magic powers'],
  },
  {
    question: 'What should you NEVER eat from the ground?',
    answers: ['Unknown berries, mushrooms, or bugs', 'Grass', 'Dirt', 'Leaves'],
  },
  {
    question: 'What is the safest way to prepare insects for eating?',
    answers: ['Cook them thoroughly first', 'Eat them raw and alive', 'Wash them with soap', 'Freeze them for a minute'],
  },
];

/**
 * Pick a random insect safety question (answers pre-shuffled).
 */
export function getInsectQuestion(): MiniQuizQuestion {
  const src = INSECT_QUESTIONS[Math.floor(Math.random() * INSECT_QUESTIONS.length)];
  const shuffled = [...src.answers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { question: src.question, answers: shuffled };
}

/**
 * Return the full insect question pool (for debug introspection
 * via `window.__gameDebug.getInsectQuestions`).
 */
export function getInsectQuestions(): readonly MiniQuizQuestion[] {
  return INSECT_QUESTIONS;
}

// ─── Quiz Starters ──────────────────────────────────────────

/**
 * Start a hygiene mini-quiz after outhouse interaction.
 * Correct → full cleanliness restore; Wrong → partial restore only.
 *
 * Sets `state._hygieneQuiz = true` so the bonus-logic branch in
 * `update()` (main.ts L868) can grant the appropriate reward.
 */
/**
 * Sync-activate hygiene quiz content. Caller **must** `enterQuizModal(state, 'hygiene')`
 * same turn (handshake). Do not leave quiz.active without a stack frame.
 */
export function startHygieneQuiz(state: GameState): void {
  const hq = getHygieneQuestion();
  const correctAnswer = hq.answers[0];
  // Find the new index of the (originally first) correct answer after shuffle
  const correctIdx = hq.answers.indexOf(correctAnswer);

  // Content half of handshake — enterQuizModal owns stack same turn
  state.quiz.active = true;
  state.quiz.displayText = `🚽 Hygiene Quiz: ${hq.question}`;
  state.quiz.choices = [...hq.answers, "I don't know 📖"];
  state.quiz.correctIndex = correctIdx;
  state.quiz.selectedIndex = 0;
  state.quiz.result = 'pending';
  state.quiz.npcId = null;
  state.quiz.difficulty = 'easy';
  state.quiz.question = {
    id: `hygiene_${Date.now()}`,
    question: hq.question,
    answers: hq.answers,
    category: 'science',
    difficulty: 'easy',
    correctIndex: 0 as const,
    hint: 'Think about hygiene and health!',
  };
  // PlayMode: caller (or drain) enters quiz modal after sync activate
  state._hygieneQuiz = true;
}

/**
 * Start an insect safety mini-quiz after eating worms.
 * Correct → bonus energy; Wrong → just the tiny +5 from the worm.
 *
 * Sets `state._insectQuiz = true` so the bonus-logic branch in
 * `update()` (main.ts L876) can grant the bonus.
 */
/**
 * Sync-activate insect quiz content. Caller **must** `enterQuizModal` / drain
 * enterModal same turn (handshake). PR4: product reconcile will not rehydrate.
 */
export function startInsectQuiz(state: GameState): void {
  const iq = getInsectQuestion();
  const correctAnswer = iq.answers[0];
  const correctIdx = iq.answers.indexOf(correctAnswer);

  // Content half of handshake — enterQuizModal owns stack same turn
  state.quiz.active = true;
  state.quiz.displayText = `🐛 Insect Safety: ${iq.question}`;
  state.quiz.choices = [...iq.answers, "I don't know 📖"];
  state.quiz.correctIndex = correctIdx;
  state.quiz.selectedIndex = 0;
  state.quiz.result = 'pending';
  state.quiz.npcId = null;
  state.quiz.difficulty = 'easy';
  state.quiz.question = {
    id: `insect_${Date.now()}`,
    question: iq.question,
    answers: iq.answers,
    category: 'science',
    difficulty: 'easy',
    correctIndex: 0 as const,
    hint: 'Think about food safety!',
  };
  // PlayMode: caller (or drain) enters quiz modal after sync activate
  state._insectQuiz = true;
}
