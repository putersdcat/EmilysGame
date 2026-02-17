/**
 * scripts/content-pipeline/validate.ts
 * Schema validation for generated content pack files.
 * Issue #96
 *
 * TODO: DOC — validation rules, error reporting format
 */

import type { QuizQuestionPack, KnowledgeArticlePack } from '../../src/types/content-pack.types';
import { isValidAgeBand } from '../../src/types/content-pack.types';

// ─── Validation ──────────────────────────────────────────────

export interface ValidationError {
  itemId: string;
  field: string;
  message: string;
}

const VALID_QUIZ_CATEGORIES = ['math', 'science', 'history', 'language', 'logic', 'geography', 'technology', 'art'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const VALID_SUBJECTS = ['math', 'science', 'history', 'language', 'technology', 'geography', 'art'];

/** Validate a single quiz question pack entry. */
export function validateQuiz(q: QuizQuestionPack): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!q.id || q.id.length < 3) {
    errors.push({ itemId: q.id || '<missing>', field: 'id', message: 'Missing or too short ID' });
  }
  if (!VALID_QUIZ_CATEGORIES.includes(q.category)) {
    errors.push({ itemId: q.id, field: 'category', message: `Invalid category: ${q.category}` });
  }
  if (!VALID_DIFFICULTIES.includes(q.difficulty)) {
    errors.push({ itemId: q.id, field: 'difficulty', message: `Invalid difficulty: ${q.difficulty}` });
  }
  if (!q.question || q.question.trim().length === 0) {
    errors.push({ itemId: q.id, field: 'question', message: 'Empty question text' });
  }
  if (!q.answers || q.answers.length < 2) {
    errors.push({ itemId: q.id, field: 'answers', message: `Need at least 2 answers, got ${q.answers?.length}` });
  }
  if (!q.hint || q.hint.trim().length === 0) {
    errors.push({ itemId: q.id, field: 'hint', message: 'Missing hint' });
  }
  if (!q.ageMetadata || !isValidAgeBand(q.ageMetadata.ageBand)) {
    errors.push({ itemId: q.id, field: 'ageMetadata', message: 'Invalid or missing age band' });
  }
  if (!q.provenance || !q.provenance.source) {
    errors.push({ itemId: q.id, field: 'provenance', message: 'Missing provenance source' });
  }

  return errors;
}

/** Validate a single knowledge article pack entry. */
export function validateArticle(a: KnowledgeArticlePack): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!a.id || a.id.length < 3) {
    errors.push({ itemId: a.id || '<missing>', field: 'id', message: 'Missing or too short ID' });
  }
  if (!VALID_SUBJECTS.includes(a.subject)) {
    errors.push({ itemId: a.id, field: 'subject', message: `Invalid subject: ${a.subject}` });
  }
  if (!a.title || a.title.trim().length === 0) {
    errors.push({ itemId: a.id, field: 'title', message: 'Empty title' });
  }
  if (!a.summary || a.summary.trim().length === 0) {
    errors.push({ itemId: a.id, field: 'summary', message: 'Empty summary' });
  }
  if (!a.content || a.content.trim().length < 50) {
    errors.push({ itemId: a.id, field: 'content', message: 'Content too short (need 50+ chars)' });
  }
  if (!a.ageMetadata || !isValidAgeBand(a.ageMetadata.ageBand)) {
    errors.push({ itemId: a.id, field: 'ageMetadata', message: 'Invalid or missing age band' });
  }
  if (!a.provenance || !a.provenance.source) {
    errors.push({ itemId: a.id, field: 'provenance', message: 'Missing provenance source' });
  }

  return errors;
}

/**
 * Validate arrays and return summary.
 */
export function validateAll(
  quizzes: QuizQuestionPack[],
  articles: KnowledgeArticlePack[],
): { valid: boolean; quizErrors: ValidationError[]; articleErrors: ValidationError[]; totalErrors: number } {
  const quizErrors: ValidationError[] = [];
  const articleErrors: ValidationError[] = [];

  for (const q of quizzes) quizErrors.push(...validateQuiz(q));
  for (const a of articles) articleErrors.push(...validateArticle(a));

  const totalErrors = quizErrors.length + articleErrors.length;
  return { valid: totalErrors === 0, quizErrors, articleErrors, totalErrors };
}
