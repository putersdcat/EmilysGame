/**
 * scripts/content-pipeline/normalize.ts
 * Normalization stage — converts raw adapter output to schema v1 format.
 * Maps categories, difficulties, age bands. Generates provenance metadata.
 * Issue #96
 *
 * TODO: DOC — mapping tables, auto-generated IDs, hint generation
 */

import type { RawQuizItem, RawArticleItem, CategoryMapping, DifficultyMapping, SubjectMapping } from './types';
import type { SourceMeta } from './types';
import type {
  QuizQuestionPack,
  KnowledgeArticlePack,
  QuizCategory,
  QuizDifficulty,
  AgeBand,
  SubjectId,
} from '../../src/types/content-pack.types';
import { createAgeMetadata, createProvenanceMetadata, SCHEMA_VERSION } from '../../src/types/content-pack.types';

// ─── Category Mappings ───────────────────────────────────────

const CATEGORY_MAPPINGS: CategoryMapping[] = [
  { rawPattern: /math|arithmetic|calcul/i, category: 'math' },
  { rawPattern: /science|nature|animal|biology|chemistry|physics/i, category: 'science' },
  { rawPattern: /history|mythology|ancient/i, category: 'history' },
  { rawPattern: /geography|capital|country|continent/i, category: 'geography' },
  { rawPattern: /language|english|grammar|spelling|vocabulary|word/i, category: 'language' },
  { rawPattern: /computer|technology|programming|software|internet/i, category: 'technology' },
  { rawPattern: /logic|general knowledge|trivia|puzzle/i, category: 'logic' },
];

/** Map a raw category string → QuizCategory. Falls back to 'logic'. */
function mapCategory(raw: string): QuizCategory {
  for (const m of CATEGORY_MAPPINGS) {
    if (m.rawPattern.test(raw)) return m.category;
  }
  return 'logic';
}

// ─── Difficulty Mappings ─────────────────────────────────────

const DIFFICULTY_MAP: Record<string, { difficulty: QuizDifficulty; ageBand: AgeBand }> = {
  'easy':   { difficulty: 'easy',   ageBand: '5-7' },
  'medium': { difficulty: 'medium', ageBand: '8-10' },
  'hard':   { difficulty: 'hard',   ageBand: '11-12+' },
};

function mapDifficulty(raw: string): { difficulty: QuizDifficulty; ageBand: AgeBand } {
  const lower = raw.toLowerCase().trim();
  return DIFFICULTY_MAP[lower] || { difficulty: 'medium', ageBand: '8-10' };
}

// ─── Subject Mappings ────────────────────────────────────────

const SUBJECT_MAPPINGS: SubjectMapping[] = [
  { rawPattern: /math/i, subject: 'math' },
  { rawPattern: /science|biology|chemistry|physics|nature/i, subject: 'science' },
  { rawPattern: /history/i, subject: 'history' },
  { rawPattern: /language|english|grammar/i, subject: 'language' },
  { rawPattern: /technology|computer/i, subject: 'technology' },
  { rawPattern: /geography/i, subject: 'geography' },
  { rawPattern: /art/i, subject: 'art' },
];

function mapSubject(raw: string): SubjectId {
  for (const m of SUBJECT_MAPPINGS) {
    if (m.rawPattern.test(raw)) return m.subject;
  }
  return 'science'; // Default fallback
}

// ─── Age Metadata ────────────────────────────────────────────

const AGE_BAND_RANGES: Record<AgeBand, { min: number; max: number | null }> = {
  '5-7':   { min: 5, max: 7 },
  '8-10':  { min: 8, max: 10 },
  '11-12+': { min: 11, max: null },
};

// ─── Quiz Normalization ──────────────────────────────────────

let _quizCounter = 0;

/** Reset counter (useful for deterministic runs). */
export function resetQuizCounter(start = 0): void {
  _quizCounter = start;
}

/**
 * Normalize a raw quiz item into a schema v1 QuizQuestionPack.
 * - Maps category, difficulty, age band
 * - Shuffles answers (correct first for storage, shuffled at runtime)
 * - Generates a unique ID
 * - Auto-generates hint if missing
 */
export function normalizeQuiz(raw: RawQuizItem, sourceMeta: SourceMeta): QuizQuestionPack {
  const category = mapCategory(raw.rawCategory);
  const { difficulty, ageBand } = mapDifficulty(raw.rawDifficulty);
  const ageRange = AGE_BAND_RANGES[ageBand];

  // Answers: correct answer first (schema convention), then incorrect
  const answers = [raw.correctAnswer, ...raw.incorrectAnswers];

  // Auto-generate hint if missing
  const hint = raw.hint || generateHint(category, difficulty);

  // Preserve original ID for manual adapter items, generate new for external
  const id = raw.sourceId.startsWith('manual:')
    ? raw.sourceId.slice('manual:'.length)
    : `q_${sourceMeta.name}_${category}_${String(_quizCounter++).padStart(4, '0')}`;

  return {
    id,
    category,
    difficulty,
    ageMetadata: createAgeMetadata(ageRange.min, ageRange.max),
    question: raw.question.trim(),
    answers,
    hint,
    explanation: raw.explanation,
    tags: raw.tags || [category, difficulty],
    provenance: createProvenanceMetadata(
      sourceMeta.name,
      sourceMeta.license,
      sourceMeta.url,
      'content-pipeline-v2',
    ),
  };
}

/** Generate a generic hint based on category and difficulty. */
function generateHint(category: QuizCategory, difficulty: QuizDifficulty): string {
  const hints: Record<QuizCategory, Record<QuizDifficulty, string>> = {
    math: {
      easy: 'Try counting on your fingers!',
      medium: 'Think about the numbers carefully.',
      hard: 'Break the problem into smaller steps.',
    },
    science: {
      easy: 'Think about what you see in nature!',
      medium: 'Remember what you learned about science.',
      hard: 'Use scientific reasoning to figure it out.',
    },
    history: {
      easy: 'Think about stories from the past!',
      medium: 'Remember important events and people.',
      hard: 'Consider the historical context.',
    },
    language: {
      easy: 'Sound out the word carefully.',
      medium: 'Think about the rules of grammar.',
      hard: 'Consider the meaning and context.',
    },
    logic: {
      easy: 'Think step by step!',
      medium: 'Use your reasoning skills.',
      hard: 'Look for patterns and connections.',
    },
    geography: {
      easy: 'Think about maps and places!',
      medium: 'Remember the continents and countries.',
      hard: 'Consider geography and culture together.',
    },
    technology: {
      easy: 'Think about computers and gadgets!',
      medium: 'Remember how technology works.',
      hard: 'Apply your tech knowledge.',
    },
  };
  return hints[category]?.[difficulty] || 'Think carefully about the question!';
}

// ─── Article Normalization ───────────────────────────────────

let _articleCounter = 0;

export function resetArticleCounter(start = 0): void {
  _articleCounter = start;
}

/**
 * Normalize a raw article into a schema v1 KnowledgeArticlePack.
 */
export function normalizeArticle(raw: RawArticleItem, sourceMeta: SourceMeta): KnowledgeArticlePack {
  const subject = mapSubject(raw.rawSubject);
  // Infer age band from reading level if available
  let ageBand: AgeBand = '8-10';
  if (raw.readingLevel !== undefined) {
    if (raw.readingLevel <= 2.5) ageBand = '5-7';
    else if (raw.readingLevel <= 5) ageBand = '8-10';
    else ageBand = '11-12+';
  }
  const ageRange = AGE_BAND_RANGES[ageBand];

  // Preserve original ID for manual adapter items, generate new for external
  const id = raw.sourceId.startsWith('manual:')
    ? raw.sourceId.slice('manual:'.length)
    : `art_${sourceMeta.name}_${subject}_${String(_articleCounter++).padStart(3, '0')}`;

  return {
    id,
    subject,
    ageMetadata: createAgeMetadata(ageRange.min, ageRange.max),
    title: raw.title.trim(),
    summary: raw.summary.trim(),
    content: raw.content.trim(),
    keyTerms: raw.keyTerms,
    related: raw.related,
    readingLevel: raw.readingLevel,
    provenance: createProvenanceMetadata(
      sourceMeta.name,
      sourceMeta.license,
      sourceMeta.url,
      'content-pipeline-v2',
    ),
  };
}
