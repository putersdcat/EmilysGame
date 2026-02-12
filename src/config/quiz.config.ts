/**
 * config/quiz.config.ts - Quiz question library and categories.
 * Static Q&A pairs curated for educational gameplay.
 * LLM rephrases these for flavor; verification is code-based.
 *
 * Add new questions by appending to QUIZ_QUESTIONS array.
 * Each question must have exactly one correct answer.
 */

export type QuizCategory = 'math' | 'science' | 'history' | 'language' | 'logic';
export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export interface QuizQuestion {
  id: string;
  category: QuizCategory;
  difficulty: QuizDifficulty;
  question: string;
  /** Possible answers (first is always the correct one internally, shuffled at runtime) */
  answers: string[];
  correctIndex: 0;           // Always 0 in this file; shuffled before display
  hint: string;
  /** Optional LLM rephrase prompt override */
  rephraseHint?: string;
}

// ─── Math Questions ──────────────────────────────────────────

const MATH_QUESTIONS: QuizQuestion[] = [
  {
    id: 'math_001', category: 'math', difficulty: 'easy',
    question: 'What is 7 + 5?',
    answers: ['12', '11', '13', '10'], correctIndex: 0,
    hint: 'Count on your fingers from 7!',
  },
  {
    id: 'math_002', category: 'math', difficulty: 'easy',
    question: 'What is 3 × 4?',
    answers: ['12', '7', '16', '9'], correctIndex: 0,
    hint: 'Think of 3 groups of 4.',
  },
  {
    id: 'math_003', category: 'math', difficulty: 'easy',
    question: 'What is 20 - 8?',
    answers: ['12', '14', '10', '18'], correctIndex: 0,
    hint: 'Start at 20 and count back 8.',
  },
  {
    id: 'math_004', category: 'math', difficulty: 'medium',
    question: 'What is 15 × 3?',
    answers: ['45', '40', '50', '35'], correctIndex: 0,
    hint: 'Think of 15 + 15 + 15.',
  },
  {
    id: 'math_005', category: 'math', difficulty: 'medium',
    question: 'What is 144 ÷ 12?',
    answers: ['12', '11', '14', '13'], correctIndex: 0,
    hint: '12 × 12 = ?',
  },
  {
    id: 'math_006', category: 'math', difficulty: 'medium',
    question: 'What is the square root of 81?',
    answers: ['9', '8', '7', '11'], correctIndex: 0,
    hint: 'Which number times itself equals 81?',
  },
  {
    id: 'math_007', category: 'math', difficulty: 'hard',
    question: 'What is 17 × 13?',
    answers: ['221', '231', '211', '201'], correctIndex: 0,
    hint: 'Break it up: (17×10) + (17×3)',
  },
  {
    id: 'math_008', category: 'math', difficulty: 'hard',
    question: 'If a triangle has angles of 60° and 80°, what is the third angle?',
    answers: ['40°', '50°', '30°', '60°'], correctIndex: 0,
    hint: 'All angles in a triangle add up to 180°.',
  },
  {
    id: 'math_009', category: 'math', difficulty: 'easy',
    question: 'What is half of 50?',
    answers: ['25', '20', '30', '15'], correctIndex: 0,
    hint: 'Divide 50 by 2.',
  },
  {
    id: 'math_010', category: 'math', difficulty: 'medium',
    question: 'What is 2 to the power of 5?',
    answers: ['32', '16', '64', '25'], correctIndex: 0,
    hint: 'Multiply 2 × 2 × 2 × 2 × 2.',
  },
];

// ─── Science Questions ───────────────────────────────────────

const SCIENCE_QUESTIONS: QuizQuestion[] = [
  {
    id: 'sci_001', category: 'science', difficulty: 'easy',
    question: 'What planet is closest to the Sun?',
    answers: ['Mercury', 'Venus', 'Earth', 'Mars'], correctIndex: 0,
    hint: 'It\'s the smallest planet too!',
  },
  {
    id: 'sci_002', category: 'science', difficulty: 'easy',
    question: 'What gas do plants need to make food?',
    answers: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'], correctIndex: 0,
    hint: 'We breathe this out!',
  },
  {
    id: 'sci_003', category: 'science', difficulty: 'easy',
    question: 'How many legs does a spider have?',
    answers: ['8', '6', '10', '4'], correctIndex: 0,
    hint: 'More than an insect, but not 10.',
  },
  {
    id: 'sci_004', category: 'science', difficulty: 'medium',
    question: 'What is the chemical symbol for water?',
    answers: ['H₂O', 'CO₂', 'NaCl', 'O₂'], correctIndex: 0,
    hint: 'Two hydrogen atoms and one oxygen.',
  },
  {
    id: 'sci_005', category: 'science', difficulty: 'medium',
    question: 'What is the hardest natural substance on Earth?',
    answers: ['Diamond', 'Iron', 'Quartz', 'Gold'], correctIndex: 0,
    hint: 'It\'s made of carbon and sparkles!',
  },
  {
    id: 'sci_006', category: 'science', difficulty: 'medium',
    question: 'Which organ pumps blood through the body?',
    answers: ['Heart', 'Lungs', 'Brain', 'Liver'], correctIndex: 0,
    hint: 'It beats about 100,000 times a day.',
  },
  {
    id: 'sci_007', category: 'science', difficulty: 'hard',
    question: 'What is the speed of light approximately?',
    answers: ['300,000 km/s', '150,000 km/s', '500,000 km/s', '1,000,000 km/s'], correctIndex: 0,
    hint: 'It takes about 8 minutes for light to reach Earth from the Sun.',
  },
  {
    id: 'sci_008', category: 'science', difficulty: 'hard',
    question: 'What is the smallest unit of matter?',
    answers: ['Atom', 'Molecule', 'Cell', 'Electron'], correctIndex: 0,
    hint: 'Everything is made of these tiny building blocks.',
  },
  {
    id: 'sci_009', category: 'science', difficulty: 'easy',
    question: 'What is the largest mammal on Earth?',
    answers: ['Blue whale', 'Elephant', 'Giraffe', 'Hippopotamus'], correctIndex: 0,
    hint: 'It lives in the ocean!',
  },
  {
    id: 'sci_010', category: 'science', difficulty: 'medium',
    question: 'How many bones are in the adult human body?',
    answers: ['206', '300', '150', '250'], correctIndex: 0,
    hint: 'Babies have more, adults have a little over 200.',
  },
];

// ─── History Questions ───────────────────────────────────────

const HISTORY_QUESTIONS: QuizQuestion[] = [
  {
    id: 'hist_001', category: 'history', difficulty: 'easy',
    question: 'In which country were the pyramids built?',
    answers: ['Egypt', 'Greece', 'Mexico', 'India'], correctIndex: 0,
    hint: 'Think of the Nile River and pharaohs.',
  },
  {
    id: 'hist_002', category: 'history', difficulty: 'easy',
    question: 'Who was the first person to walk on the Moon?',
    answers: ['Neil Armstrong', 'Buzz Aldrin', 'John Glenn', 'Yuri Gagarin'], correctIndex: 0,
    hint: '"That\'s one small step for man..."',
  },
  {
    id: 'hist_003', category: 'history', difficulty: 'medium',
    question: 'What year did World War II end?',
    answers: ['1945', '1943', '1947', '1941'], correctIndex: 0,
    hint: 'The 1940s, closer to the middle.',
  },
  {
    id: 'hist_004', category: 'history', difficulty: 'medium',
    question: 'Which ancient civilization built the Colosseum?',
    answers: ['Romans', 'Greeks', 'Egyptians', 'Persians'], correctIndex: 0,
    hint: 'Their empire included Italy.',
  },
  {
    id: 'hist_005', category: 'history', difficulty: 'hard',
    question: 'Who invented the printing press?',
    answers: ['Johannes Gutenberg', 'Leonardo da Vinci', 'Galileo Galilei', 'Isaac Newton'], correctIndex: 0,
    hint: 'A German inventor in the 1400s.',
  },
];

// ─── Language Questions ──────────────────────────────────────

const LANGUAGE_QUESTIONS: QuizQuestion[] = [
  {
    id: 'lang_001', category: 'language', difficulty: 'easy',
    question: 'Which word is a noun: run, happy, cat, quickly?',
    answers: ['cat', 'run', 'happy', 'quickly'], correctIndex: 0,
    hint: 'A noun is a person, place, or thing.',
  },
  {
    id: 'lang_002', category: 'language', difficulty: 'easy',
    question: 'What is the plural of "mouse"?',
    answers: ['mice', 'mouses', 'mices', 'mouse'], correctIndex: 0,
    hint: 'This one\'s irregular - it doesn\'t just add "s".',
  },
  {
    id: 'lang_003', category: 'language', difficulty: 'medium',
    question: 'What does the prefix "un-" mean?',
    answers: ['not', 'again', 'before', 'after'], correctIndex: 0,
    hint: 'Un-happy means...?',
  },
  {
    id: 'lang_004', category: 'language', difficulty: 'medium',
    question: 'Which word is spelled correctly?',
    answers: ['necessary', 'neccessary', 'necesary', 'neccesary'], correctIndex: 0,
    hint: 'One "c", two "s"s.',
  },
  {
    id: 'lang_005', category: 'language', difficulty: 'hard',
    question: 'What is a synonym for "ephemeral"?',
    answers: ['temporary', 'permanent', 'beautiful', 'dangerous'], correctIndex: 0,
    hint: 'Something that doesn\'t last long.',
  },
];

// ─── Logic Questions ─────────────────────────────────────────

const LOGIC_QUESTIONS: QuizQuestion[] = [
  {
    id: 'logic_001', category: 'logic', difficulty: 'easy',
    question: 'What comes next: 2, 4, 6, 8, ...?',
    answers: ['10', '9', '12', '7'], correctIndex: 0,
    hint: 'Count by twos!',
  },
  {
    id: 'logic_002', category: 'logic', difficulty: 'easy',
    question: 'If all apples are fruits, and I have an apple, what do I have?',
    answers: ['A fruit', 'A vegetable', 'A seed', 'Nothing'], correctIndex: 0,
    hint: 'Think about what category apples belong to.',
  },
  {
    id: 'logic_003', category: 'logic', difficulty: 'medium',
    question: 'A farmer has 17 sheep. All but 9 run away. How many are left?',
    answers: ['9', '8', '17', '0'], correctIndex: 0,
    hint: 'Read carefully: "all BUT 9".',
  },
  {
    id: 'logic_004', category: 'logic', difficulty: 'medium',
    question: 'What is the next letter: A, C, E, G, ...?',
    answers: ['I', 'H', 'J', 'F'], correctIndex: 0,
    hint: 'Skip every other letter.',
  },
  {
    id: 'logic_005', category: 'logic', difficulty: 'hard',
    question: 'I have cities but no houses, forests but no trees, water but no fish. What am I?',
    answers: ['A map', 'A painting', 'A dream', 'A book'], correctIndex: 0,
    hint: 'It represents the real world on paper.',
  },
];

// ─── Combined Library ────────────────────────────────────────

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  ...MATH_QUESTIONS,
  ...SCIENCE_QUESTIONS,
  ...HISTORY_QUESTIONS,
  ...LANGUAGE_QUESTIONS,
  ...LOGIC_QUESTIONS,
];

/** Get questions filtered by category and/or difficulty */
export function getQuestions(
  category?: QuizCategory,
  difficulty?: QuizDifficulty,
): QuizQuestion[] {
  return QUIZ_QUESTIONS.filter((q) => {
    if (category && q.category !== category) return false;
    if (difficulty && q.difficulty !== difficulty) return false;
    return true;
  });
}

/** Pick N random questions from filtered set */
export function pickRandomQuestions(
  count: number,
  category?: QuizCategory,
  difficulty?: QuizDifficulty,
): QuizQuestion[] {
  const pool = getQuestions(category, difficulty);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
