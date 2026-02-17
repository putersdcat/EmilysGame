/**
 * scripts/content-pipeline/qa-checks.ts
 * Deterministic quality checks for content packs — no LLM needed.
 * Validates readability, safety, answer consistency, and age-appropriateness.
 * Issue #91 — Rephrasing + Quality Gate Pipeline
 *
 * TODO: DOC — QA check categories, severity levels, report format
 */

import type { QuizQuestionPack, KnowledgeArticlePack, AgeBand } from '../../src/types/content-pack.types';

// ─── QA Issue Types ──────────────────────────────────────────

export type QASeverity = 'error' | 'warning' | 'info';
export type QACheckCategory =
  | 'safety'
  | 'readability'
  | 'answer-consistency'
  | 'length'
  | 'age-appropriateness'
  | 'completeness'
  | 'duplicates';

export interface QAIssue {
  /** Item ID that has the issue */
  itemId: string;
  /** Type of item */
  itemType: 'quiz' | 'article';
  /** What category of check flagged this */
  category: QACheckCategory;
  /** How severe is the issue */
  severity: QASeverity;
  /** Human-readable description */
  message: string;
  /** Suggested fix (optional) */
  suggestion?: string;
  /** Raw field value that caused the issue */
  fieldValue?: string;
  /** Which field is problematic */
  field?: string;
}

export interface QAReport {
  /** When the QA run happened */
  timestamp: string;
  /** Total items checked */
  totalQuizzes: number;
  totalArticles: number;
  /** Issues found */
  issues: QAIssue[];
  /** Summary counts by severity */
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** Pass/fail determination */
  passed: boolean;
  /** Items that need human review (error or warning) */
  flaggedItemIds: string[];
}

// ─── Readability Scoring ─────────────────────────────────────

/** Count syllables in a word (simple English heuristic). */
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 2) return 1;

  // Count vowel groups
  const vowelGroups = w.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 1;

  // Silent 'e' at end
  if (w.endsWith('e') && !w.endsWith('le') && count > 1) count--;
  // -ed endings (often silent)
  if (w.endsWith('ed') && w.length > 3 && count > 1) count--;

  return Math.max(1, count);
}

/** Count sentences in text (period, question mark, exclamation). */
function countSentences(text: string): number {
  const matches = text.match(/[.!?]+/g);
  return matches ? matches.length : 1;
}

/** Count words in text. */
function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

/**
 * Flesch-Kincaid Grade Level approximation.
 * Returns approximate US school grade level (1-12+).
 */
export function fleschKincaidGradeLevel(text: string): number {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  if (wordCount === 0) return 0;

  const sentenceCount = countSentences(text);
  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);

  // FK formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
  const grade = 0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59;
  return Math.max(0, Math.round(grade * 10) / 10);
}

/** Target grade level ranges for each age band. */
const AGE_BAND_GRADE_TARGETS: Record<AgeBand, { min: number; max: number }> = {
  '5-7':    { min: 0, max: 3 },
  '8-10':   { min: 2, max: 6 },
  '11-12+': { min: 4, max: 10 },
};

// ─── Safety Checks (expanded) ────────────────────────────────

// Hard-block terms — always an error regardless of context
const SAFETY_TERMS_ERROR = [
  'kill', 'murder', 'suicide', 'weapon', 'gun', 'knife',
  'sexual', 'nude', 'naked', 'drunk', 'alcohol', 'cigarette',
  'racist', 'torture', 'abuse', 'hate', 'slur',
  'gambling', 'betting', 'casino',
];

// Context-dependent terms — error only when NOT in educational context
const SAFETY_TERMS_CONTEXTUAL = [
  'blood', 'drug', 'slavery',
];

// Phrases that make contextual terms OK (educational usage)
const SAFETY_CONTEXT_ALLOWLIST = [
  // blood in anatomy/biology
  'pumps blood', 'blood cell', 'blood vessel', 'blood type', 'blood pressure',
  'bloodstream', 'carries blood', 'blood through', 'red blood', 'white blood',
  'blood flow',
  // drug in pharmaceutical/science context
  'drug discovery', 'drug resistance', 'antibiotic',
  // slavery in history context
  'abolition', 'emancipation', 'civil rights', 'underground railroad',
  // gunpowder in history context
  'gunpowder',
];

interface SafetyResult {
  term: string;
  /** 'error' for hard-block, 'warning' for contextual without allowlist match */
  severity: QASeverity;
}

function checkSafetyTerms(text: string): SafetyResult | null {
  const lower = text.toLowerCase();

  // Check hard-block terms first
  for (const term of SAFETY_TERMS_ERROR) {
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    if (regex.test(text)) return { term, severity: 'error' };
  }

  // Check contextual terms — allow if educational context detected
  for (const term of SAFETY_TERMS_CONTEXTUAL) {
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    if (regex.test(text)) {
      // Check if any allowlist phrase is present
      const hasContext = SAFETY_CONTEXT_ALLOWLIST.some(phrase => lower.includes(phrase));
      if (!hasContext) {
        return { term, severity: 'warning' };
      }
      // Educational context detected — no issue
    }
  }

  return null;
}

// ─── Quiz Checks ─────────────────────────────────────────────

function checkQuiz(quiz: QuizQuestionPack): QAIssue[] {
  const issues: QAIssue[] = [];
  const id = quiz.id;

  // 1. Answer consistency: correct answer should be first in array
  if (quiz.answers.length < 2) {
    issues.push({
      itemId: id, itemType: 'quiz', category: 'answer-consistency',
      severity: 'error', message: 'Quiz has fewer than 2 answers',
      field: 'answers', fieldValue: String(quiz.answers.length),
    });
  }

  // Check for duplicate answers
  const uniqueAnswers = new Set(quiz.answers.map(a => a.toLowerCase().trim()));
  if (uniqueAnswers.size < quiz.answers.length) {
    issues.push({
      itemId: id, itemType: 'quiz', category: 'answer-consistency',
      severity: 'error', message: 'Quiz has duplicate answers',
      field: 'answers',
    });
  }

  // 2. Question length
  const qWords = countWords(quiz.question);
  if (qWords < 3) {
    issues.push({
      itemId: id, itemType: 'quiz', category: 'length',
      severity: 'warning', message: `Question too short (${qWords} words)`,
      field: 'question', fieldValue: quiz.question,
      suggestion: 'Rephrase to be more descriptive',
    });
  }
  if (qWords > 80) {
    issues.push({
      itemId: id, itemType: 'quiz', category: 'length',
      severity: 'warning', message: `Question very long (${qWords} words)`,
      field: 'question',
      suggestion: 'Consider simplifying for young readers',
    });
  }

  // 3. Answer lengths
  for (const ans of quiz.answers) {
    if (countWords(ans) > 30) {
      issues.push({
        itemId: id, itemType: 'quiz', category: 'length',
        severity: 'info', message: `Long answer option (${countWords(ans)} words): "${ans.substring(0, 50)}..."`,
        field: 'answers',
      });
    }
  }

  // 4. Readability vs age band
  const gradeLevel = fleschKincaidGradeLevel(quiz.question);
  const ageBand = quiz.ageMetadata.ageBand;
  const target = AGE_BAND_GRADE_TARGETS[ageBand];
  if (gradeLevel > target.max + 2) {
    issues.push({
      itemId: id, itemType: 'quiz', category: 'age-appropriateness',
      severity: 'warning',
      message: `Question readability (grade ${gradeLevel}) too high for age band ${ageBand} (target: grade ${target.min}-${target.max})`,
      field: 'question', fieldValue: quiz.question,
      suggestion: `Rephrase for grade ${target.max} reading level`,
    });
  }

  // 5. Safety
  const safetyResult = checkSafetyTerms(quiz.question);
  if (safetyResult) {
    issues.push({
      itemId: id, itemType: 'quiz', category: 'safety',
      severity: safetyResult.severity,
      message: `Question contains potentially unsafe term: "${safetyResult.term}"`,
      field: 'question', fieldValue: quiz.question,
    });
  }
  for (const ans of quiz.answers) {
    const ansResult = checkSafetyTerms(ans);
    if (ansResult) {
      issues.push({
        itemId: id, itemType: 'quiz', category: 'safety',
        severity: ansResult.severity,
        message: `Answer contains potentially unsafe term: "${ansResult.term}"`,
        field: 'answers', fieldValue: ans,
      });
    }
  }

  // 6. Completeness
  if (!quiz.hint || quiz.hint.trim().length === 0) {
    issues.push({
      itemId: id, itemType: 'quiz', category: 'completeness',
      severity: 'info', message: 'Quiz missing hint',
      field: 'hint',
      suggestion: 'Add a helpful hint for struggling learners',
    });
  }
  if (!quiz.explanation || quiz.explanation.trim().length === 0) {
    issues.push({
      itemId: id, itemType: 'quiz', category: 'completeness',
      severity: 'info', message: 'Quiz missing explanation',
      field: 'explanation',
      suggestion: 'Add explanation for learning reinforcement',
    });
  }

  return issues;
}

// ─── Article Checks ──────────────────────────────────────────

function checkArticle(article: KnowledgeArticlePack): QAIssue[] {
  const issues: QAIssue[] = [];
  const id = article.id;

  // 1. Content length
  const contentWords = countWords(article.content);
  if (contentWords < 50) {
    issues.push({
      itemId: id, itemType: 'article', category: 'length',
      severity: 'warning', message: `Article content very short (${contentWords} words)`,
      field: 'content',
      suggestion: 'Expand with more detail or examples',
    });
  }
  if (contentWords > 2000) {
    issues.push({
      itemId: id, itemType: 'article', category: 'length',
      severity: 'info', message: `Article content very long (${contentWords} words)`,
      field: 'content',
      suggestion: 'Consider splitting into multiple articles',
    });
  }

  // 2. Summary length
  const summaryWords = countWords(article.summary);
  if (summaryWords < 5) {
    issues.push({
      itemId: id, itemType: 'article', category: 'length',
      severity: 'warning', message: `Summary too short (${summaryWords} words)`,
      field: 'summary', fieldValue: article.summary,
    });
  }
  if (summaryWords > 60) {
    issues.push({
      itemId: id, itemType: 'article', category: 'length',
      severity: 'info', message: `Summary quite long (${summaryWords} words)`,
      field: 'summary',
      suggestion: 'Keep summaries concise (under 50 words)',
    });
  }

  // 3. Key terms
  if (!article.keyTerms || article.keyTerms.length === 0) {
    issues.push({
      itemId: id, itemType: 'article', category: 'completeness',
      severity: 'warning', message: 'Article has no key terms',
      field: 'keyTerms',
      suggestion: 'Add key terms for word bag feature',
    });
  }

  // 4. Readability vs age band
  const gradeLevel = fleschKincaidGradeLevel(article.content);
  const ageBand = article.ageMetadata.ageBand;
  const target = AGE_BAND_GRADE_TARGETS[ageBand];
  if (gradeLevel > target.max + 3) {
    issues.push({
      itemId: id, itemType: 'article', category: 'age-appropriateness',
      severity: 'warning',
      message: `Article readability (grade ${gradeLevel}) high for age band ${ageBand} (target: grade ${target.min}-${target.max})`,
      field: 'content',
      suggestion: `Rephrase for grade ${target.max} reading level`,
    });
  }

  // 5. Safety
  const safetyResult = checkSafetyTerms(article.content);
  if (safetyResult) {
    issues.push({
      itemId: id, itemType: 'article', category: 'safety',
      severity: safetyResult.severity,
      message: `Article content contains potentially unsafe term: "${safetyResult.term}"`,
      field: 'content',
    });
  }

  return issues;
}

// ─── Duplicate Detection ─────────────────────────────────────

function checkDuplicateHints(quizzes: QuizQuestionPack[]): QAIssue[] {
  const issues: QAIssue[] = [];
  const hintMap = new Map<string, string[]>();

  for (const q of quizzes) {
    if (!q.hint) continue;
    const key = q.hint.toLowerCase().trim();
    const ids = hintMap.get(key) || [];
    ids.push(q.id);
    hintMap.set(key, ids);
  }

  for (const [hint, ids] of hintMap) {
    if (ids.length > 5) {
      // Generic hint used by many questions — probably auto-generated
      issues.push({
        itemId: ids[0], itemType: 'quiz', category: 'duplicates',
        severity: 'info',
        message: `Generic hint used by ${ids.length} questions: "${hint.substring(0, 60)}..."`,
        suggestion: 'Consider writing specific hints for better learning',
      });
    }
  }

  return issues;
}

// ─── Main QA Runner ──────────────────────────────────────────

export function runQAChecks(
  quizzes: QuizQuestionPack[],
  articles: KnowledgeArticlePack[],
): QAReport {
  const issues: QAIssue[] = [];

  // Check each quiz
  for (const q of quizzes) {
    issues.push(...checkQuiz(q));
  }

  // Check each article
  for (const a of articles) {
    issues.push(...checkArticle(a));
  }

  // Cross-item checks
  issues.push(...checkDuplicateHints(quizzes));

  // Count severities
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  // Collect flagged items (unique IDs with error or warning)
  const flaggedItemIds = [...new Set(
    issues
      .filter(i => i.severity === 'error' || i.severity === 'warning')
      .map(i => i.itemId)
  )];

  return {
    timestamp: new Date().toISOString(),
    totalQuizzes: quizzes.length,
    totalArticles: articles.length,
    issues,
    errorCount,
    warningCount,
    infoCount,
    passed: errorCount === 0,
    flaggedItemIds,
  };
}

// ─── Exports for testing ─────────────────────────────────────

export { countSyllables, countWords, countSentences, checkSafetyTerms };
