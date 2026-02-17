/**
 * scripts/content-pipeline/dedupe.ts
 * Deduplication and safety filtering stage.
 * Removes duplicate questions (by content hash) and filters unsafe content.
 * Issue #96
 *
 * TODO: DOC — dedupe hash algorithm, safety word list, rejection reasons
 */

import { createHash } from 'crypto';
import type { QuizQuestionPack, KnowledgeArticlePack } from '../../src/types/content-pack.types';

// ─── Safety Word List ────────────────────────────────────────
// Words/phrases that should not appear in content for children ages 5-12.

const SAFETY_REJECT_PATTERNS: RegExp[] = [
  /\b(damn|hell|crap)\b/i,
  /\b(kill|murder|death|dead|die|dying)\b/i,
  /\b(drug|alcohol|beer|wine|cigarette|smoke|vape)\b/i,
  /\b(sex|sexual|nude|naked)\b/i,
  /\b(gun|weapon|bomb|explosive)\b/i,
  /\b(suicide|self-harm)\b/i,
  /\b(racist|sexist|bigot)\b/i,
  /\b(gambling|casino|bet)\b/i,
];

// Allowed exceptions — terms that might match but are educational
const SAFETY_EXCEPTIONS: RegExp[] = [
  /\bdead sea\b/i,
  /\bextinct|extinction\b/i,
  /\bdead reckoning\b/i,
  /\bblack death\b/i, // Historical topic
  /\bdeath valley\b/i,
  /\bsmoke signal\b/i,
  /\bgunpowder\b/i, // Historical invention
];

/** Content length constraints */
const MIN_QUESTION_LENGTH = 10;
const MAX_QUESTION_LENGTH = 500;
const MIN_ANSWER_LENGTH = 1;
const MAX_ANSWER_LENGTH = 200;
const MIN_ANSWERS = 2;
const MAX_ANSWERS = 6;

// ─── Content Hashing ─────────────────────────────────────────

/** Generate a normalized content hash for dedup comparison. */
function contentHash(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Strip all non-alphanumeric
    .trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// ─── Safety Check ────────────────────────────────────────────

export interface SafetyResult {
  safe: boolean;
  reason?: string;
}

/** Check if text passes safety filters. Returns { safe: true } or { safe: false, reason }. */
function checkSafety(text: string): SafetyResult {
  // Check exceptions first — if an exception matches, it's allowed
  for (const ex of SAFETY_EXCEPTIONS) {
    if (ex.test(text)) return { safe: true };
  }
  // Check reject patterns
  for (const pat of SAFETY_REJECT_PATTERNS) {
    const match = text.match(pat);
    if (match) {
      return { safe: false, reason: `Contains unsafe term: "${match[0]}"` };
    }
  }
  return { safe: true };
}

// ─── Quiz Dedup + Safety ─────────────────────────────────────

export interface DedupeResult<T> {
  items: T[];
  duplicatesRemoved: number;
  safetyRejected: number;
  rejections: { item: T; reason: string }[];
}

/**
 * Deduplicate and safety-filter quiz questions.
 * - Removes exact and near-duplicate questions (by content hash of question text)
 * - Filters questions with unsafe content
 * - Validates structural constraints (answer count, lengths)
 */
export function dedupeAndFilterQuizzes(
  quizzes: QuizQuestionPack[],
  verbose = false,
): DedupeResult<QuizQuestionPack> {
  const seen = new Set<string>();
  const result: QuizQuestionPack[] = [];
  const rejections: { item: QuizQuestionPack; reason: string }[] = [];
  let duplicatesRemoved = 0;
  let safetyRejected = 0;

  for (const q of quizzes) {
    // 1. Deduplicate by question content hash
    const hash = contentHash(q.question);
    if (seen.has(hash)) {
      duplicatesRemoved++;
      if (verbose) console.log(`  🔄 Duplicate: "${q.question.slice(0, 60)}..."`);
      continue;
    }
    seen.add(hash);

    // 2. Safety check question + all answers
    const allText = [q.question, ...q.answers, q.hint, q.explanation || ''].join(' ');
    const safety = checkSafety(allText);
    if (!safety.safe) {
      safetyRejected++;
      rejections.push({ item: q, reason: safety.reason! });
      if (verbose) console.log(`  🚫 Safety: "${q.question.slice(0, 60)}..." → ${safety.reason}`);
      continue;
    }

    // 3. Structural validation
    if (q.question.length < MIN_QUESTION_LENGTH) {
      safetyRejected++;
      rejections.push({ item: q, reason: `Question too short (${q.question.length} chars)` });
      continue;
    }
    if (q.question.length > MAX_QUESTION_LENGTH) {
      safetyRejected++;
      rejections.push({ item: q, reason: `Question too long (${q.question.length} chars)` });
      continue;
    }
    if (q.answers.length < MIN_ANSWERS || q.answers.length > MAX_ANSWERS) {
      safetyRejected++;
      rejections.push({ item: q, reason: `Invalid answer count: ${q.answers.length}` });
      continue;
    }
    const badAnswer = q.answers.find(a => a.length < MIN_ANSWER_LENGTH || a.length > MAX_ANSWER_LENGTH);
    if (badAnswer !== undefined) {
      safetyRejected++;
      rejections.push({ item: q, reason: `Answer outside length bounds: "${badAnswer}"` });
      continue;
    }

    result.push(q);
  }

  return { items: result, duplicatesRemoved, safetyRejected, rejections };
}

/**
 * Deduplicate and safety-filter articles.
 */
export function dedupeAndFilterArticles(
  articles: KnowledgeArticlePack[],
  verbose = false,
): DedupeResult<KnowledgeArticlePack> {
  const seen = new Set<string>();
  const result: KnowledgeArticlePack[] = [];
  const rejections: { item: KnowledgeArticlePack; reason: string }[] = [];
  let duplicatesRemoved = 0;
  let safetyRejected = 0;

  for (const a of articles) {
    // Dedupe by title hash
    const hash = contentHash(a.title);
    if (seen.has(hash)) {
      duplicatesRemoved++;
      if (verbose) console.log(`  🔄 Duplicate article: "${a.title}"`);
      continue;
    }
    seen.add(hash);

    // Safety check
    const allText = [a.title, a.summary, a.content].join(' ');
    const safety = checkSafety(allText);
    if (!safety.safe) {
      safetyRejected++;
      rejections.push({ item: a, reason: safety.reason! });
      continue;
    }

    // Length validation
    if (a.title.length < 3) {
      safetyRejected++;
      rejections.push({ item: a, reason: 'Title too short' });
      continue;
    }
    if (a.content.length < 50) {
      safetyRejected++;
      rejections.push({ item: a, reason: `Content too short (${a.content.length} chars)` });
      continue;
    }

    result.push(a);
  }

  return { items: result, duplicatesRemoved, safetyRejected, rejections };
}
