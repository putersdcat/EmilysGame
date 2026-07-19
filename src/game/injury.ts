/**
 * injury.ts - Deterministic injury event system (#109, #137).
 * Injuries from explicit hazard collisions (cactus, rock, etc.), NOT random.
 * Bandaid recovery with wound-care quizzes.
 * Non-punitive: injuries slow movement but never kill.
 * TODO: DOC - injury system API
 */

import type { PlayerStatus } from './status';

// ─── Types ───────────────────────────────────────────────────

export interface InjuryState {
  /** Whether the player is currently injured */
  injured: boolean;
  /** Total injury count this session (for stats) */
  injuryCount: number;
  /** Timestamp of last injury (for cooldown) */
  lastInjuryAt: number;
  /** Whether a wound-care quiz is pending (bandaid was just used) */
  pendingWoundQuiz: boolean;
}

export interface WoundCareQuestion {
  question: string;
  answers: string[];
  /** Index of correct answer in answers array */
  correctIndex: number;
}

// ─── Constants ───────────────────────────────────────────────

/** Minimum ms between injury events (prevent rapid stacking) */
const INJURY_COOLDOWN_MS = 3000;

/** Speed multiplier when injured (stacks with status debuffs) */
export const INJURY_SPEED_PENALTY = 0.8;

/** Bonus energy heal when wound-care quiz answered correctly */
export const WOUND_QUIZ_BONUS_HEAL = 15;

/** Normal energy heal from bandaid (without quiz bonus) */
export const BANDAID_BASE_HEAL = 10;

// ─── Wound-Care Quiz Pool (#109) ─────────────────────────────

export const WOUND_CARE_QUESTIONS: WoundCareQuestion[] = [
  {
    question: 'Should you wash a scrape before putting on a bandage?',
    answers: ['Yes, with clean water', 'No, just cover it', 'Use dirt to stop bleeding', 'Ignore it'],
    correctIndex: 0,
  },
  {
    question: 'What should you put on a small cut first?',
    answers: ['Clean water and soap', 'Mud', 'Nothing, just wrap it', 'Sand'],
    correctIndex: 0,
  },
  {
    question: 'Which is the best way to stop a small cut from bleeding?',
    answers: ['Press a clean cloth on it', 'Blow on it', 'Put sugar on it', 'Wave your hand'],
    correctIndex: 0,
  },
  {
    question: 'After washing a scrape, what helps protect it?',
    answers: ['A clean bandage', 'Leaves', 'Tape only', 'Nothing — let it air out'],
    correctIndex: 0,
  },
  {
    question: 'Why do we clean a wound before bandaging?',
    answers: ['To wash away germs', 'To make it hurt more', 'Because it looks nicer', 'To make it bigger'],
    correctIndex: 0,
  },
  {
    question: 'What is the first step if you get a scrape while playing?',
    answers: ['Tell an adult', 'Keep playing', 'Put a bandage on right away', 'Rub it with sand'],
    correctIndex: 0,
  },
];

// ─── State ───────────────────────────────────────────────────

export function createInjuryState(): InjuryState {
  return {
    injured: false,
    injuryCount: 0,
    lastInjuryAt: 0,
    pendingWoundQuiz: false,
  };
}

// ─── Actions ─────────────────────────────────────────────────

/**
 * Check for deterministic injury from a hazard collision (#137).
 * Returns true if an injury occurred. Only triggers on hazardous obstacles
 * (those with hazardDamage > 0 in AssetDef), never randomly.
 * Respects cooldown to prevent rapid stacking.
 */
export function checkHazardInjury(injury: InjuryState, hazardDamage: number): boolean {
  if (injury.injured) return false; // Already injured
  if (hazardDamage <= 0) return false; // Not a hazard — no injury possible
  const now = Date.now();
  if (now - injury.lastInjuryAt < INJURY_COOLDOWN_MS) return false;

  // Deterministic: any hazard with damage > 0 always injures
  injury.injured = true;
  injury.injuryCount++;
  injury.lastInjuryAt = now;
  return true;
}

/**
 * Apply bandaid: clear injury state, mark pending wound-care quiz.
 * Returns heal amount (base). Caller should add bonus if quiz correct.
 */
export function applyBandaid(injury: InjuryState, status: PlayerStatus): number {
  if (!injury.injured) return 0;

  injury.injured = false;
  injury.pendingWoundQuiz = true;

  // Base heal
  status.energy = Math.min(100, status.energy + BANDAID_BASE_HEAL);
  return BANDAID_BASE_HEAL;
}

/**
 * Apply wound-care quiz bonus (called after correct answer).
 */
export function applyWoundQuizBonus(status: PlayerStatus): void {
  status.energy = Math.min(100, status.energy + WOUND_QUIZ_BONUS_HEAL);
}

/**
 * Get a random wound-care question (answers pre-shuffled).
 */
export function getWoundCareQuestion(): WoundCareQuestion {
  const src = WOUND_CARE_QUESTIONS[Math.floor(Math.random() * WOUND_CARE_QUESTIONS.length)];
  // Shuffle answers but track correct
  const correctAnswer = src.answers[src.correctIndex];
  const shuffled = [...src.answers];
  // Fisher-Yates
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return {
    question: src.question,
    answers: shuffled,
    correctIndex: shuffled.indexOf(correctAnswer),
  };
}

/**
 * Start a wound-care mini-quiz after bandaid use.
 * Uses the regular quiz UI but with a custom wound-care question.
 *
 * B5 micro-slice 11.8 (#268): extracted from main.ts. Co-located with
 * `WOUND_CARE_QUESTIONS` + `getWoundCareQuestion()` so the entire
 * wound-care quiz flow lives in one file. Hygiene + insect variants
 * live in `./quiz-specials.ts` using the same pattern.
 *
 * Sets `state._woundCareQuiz = true` so the bonus-logic branch in
 * `update()` (main.ts L861) can grant `WOUND_QUIZ_BONUS_HEAL` energy.
 */
/**
 * Sync-activate wound-care quiz content. Caller **must** `enterQuizModal(state, 'wound_care')`
 * same turn (handshake). PR4: product reconcile will not rehydrate orphan quiz.active.
 */
export function startWoundCareQuiz(state: import('./game-state').GameState, wq: WoundCareQuestion): void {
  // Content half of handshake — populate quiz directly (bypass content-pack startQuiz)
  state.quiz.active = true;
  state.quiz.displayText = `🩹 Wound Care: ${wq.question}`;
  state.quiz.choices = [...wq.answers, "I don't know 📖"];
  state.quiz.correctIndex = wq.correctIndex;
  state.quiz.selectedIndex = 0;
  state.quiz.result = 'pending';
  state.quiz.npcId = null;
  state.quiz.difficulty = 'easy';
  state.quiz.question = {
    id: `wound_care_${Date.now()}`,
    question: wq.question,
    answers: wq.answers,
    category: 'science',
    difficulty: 'easy',
    correctIndex: 0 as const,
    hint: 'Think about first aid!',
  };
  // PlayMode: caller enters quiz modal after sync activate (PR5)
  // Mark this as a wound-care quiz for bonus logic
  state._woundCareQuiz = true;
}

/**
 * Get injury speed multiplier (stacks with status debuffs).
 */
export function getInjurySpeedMult(injury: InjuryState): number {
  return injury.injured ? INJURY_SPEED_PENALTY : 1.0;
}

// ─── Serialization ───────────────────────────────────────────

export function serializeInjury(injury: InjuryState): { injured: boolean; injuryCount: number } {
  return { injured: injury.injured, injuryCount: injury.injuryCount };
}

export function deserializeInjury(data: { injured?: boolean; injuryCount?: number } | undefined): InjuryState {
  if (!data) return createInjuryState();
  return {
    injured: data.injured ?? false,
    injuryCount: data.injuryCount ?? 0,
    lastInjuryAt: 0,
    pendingWoundQuiz: false,
  };
}
