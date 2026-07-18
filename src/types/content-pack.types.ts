/**
 * types/content-pack.types.ts
 * Content Pack Schema v1 - Data contract for externalized educational content.
 * Supports sharded JSON files with age-banded metadata.
 * Issue #88 - Content Pack Schema v1
 */

// ─── Age Banding ─────────────────────────────────────────────

export type AgeBand = '5-7' | '8-10' | '11-12+';

export interface AgeMetadata {
  /** Minimum recommended age for this content */
  minAge: number;
  /** Maximum recommended age for this content (null = no upper limit) */
  maxAge: number | null;
  /** Age band classification */
  ageBand: AgeBand;
}

// ─── Difficulty & Categories ─────────────────────────────────

export type QuizDifficulty = 'easy' | 'medium' | 'hard';
export type QuizCategory = 'math' | 'science' | 'history' | 'language' | 'logic' | 'geography' | 'technology' | 'art';
export type SubjectId = 'math' | 'science' | 'history' | 'language' | 'technology' | 'geography' | 'art';

// ─── Provenance & Versioning ─────────────────────────────────

export interface ProvenanceMetadata {
  /** Source of the content (e.g., "public-domain", "wikibooks", "manual-curation") */
  source: string;
  /** Original URL or reference (if applicable) */
  sourceUrl?: string;
  /** License type (e.g., "CC0", "CC-BY-4.0", "public-domain") */
  license: string;
  /** Date the content was ingested (ISO 8601) */
  dateIngested: string;
  /** Human curator or script that added this content */
  curator?: string;
}

// ─── Quiz Question Schema ────────────────────────────────────

export interface QuizQuestionPack {
  id: string;
  category: QuizCategory;
  difficulty: QuizDifficulty;
  ageMetadata: AgeMetadata;
  question: string;
  /** Possible answers (first is always the correct one internally, shuffled at runtime) */
  answers: string[];
  hint: string;
  /** Optional detailed explanation after answer */
  explanation?: string;
  /** Optional LLM rephrase prompt override */
  rephraseHint?: string;
  /** Tags for filtering/search */
  tags?: string[];
  provenance: ProvenanceMetadata;
}

// ─── Knowledge Article Schema ────────────────────────────────

export interface KnowledgeArticlePack {
  id: string;
  subject: SubjectId;
  ageMetadata: AgeMetadata;
  title: string;
  summary: string;
  content: string;
  /** Key terms that can be saved to Word Bag */
  keyTerms: string[];
  /** Related article ids */
  related?: string[];
  /** Reading level estimate (Flesch-Kincaid grade level) */
  readingLevel?: number;
  provenance: ProvenanceMetadata;
}

// ─── Content Pack Manifest ───────────────────────────────────

export interface ContentPackManifest {
  /** Schema version for compatibility checks */
  schemaVersion: string;
  /** Pack metadata */
  packName: string;
  packVersion: string;
  description: string;
  author: string;
  license: string;
  /** ISO 8601 date */
  createdAt: string;
  updatedAt: string;

  /** Sharded file references */
  shards: {
    quizzes: string[];   // e.g., ["quizzes-001.json", "quizzes-002.json"]
    articles: string[];  // e.g., ["articles-001.json", "articles-002.json"]
  };

  /** Statistics */
  stats: {
    totalQuizzes: number;
    totalArticles: number;
    categoryCounts: Record<QuizCategory, number>;
    subjectCounts: Record<SubjectId, number>;
    ageBandCounts: Record<AgeBand, number>;
  };
}

// ─── Shard File Schemas ──────────────────────────────────────

export interface QuizShard {
  /** Shard metadata */
  shardId: string;
  schemaVersion: string;
  createdAt: string;

  /** Quiz questions in this shard */
  questions: QuizQuestionPack[];
}

export interface ArticleShard {
  /** Shard metadata */
  shardId: string;
  schemaVersion: string;
  createdAt: string;

  /** Articles in this shard */
  articles: KnowledgeArticlePack[];
}

// ─── Validation Helpers ──────────────────────────────────────

export function isValidAgeBand(ageBand: string): ageBand is AgeBand {
  return ['5-7', '8-10', '11-12+'].includes(ageBand);
}

export function getAgeBandForAge(age: number): AgeBand {
  if (age <= 7) return '5-7';
  if (age <= 10) return '8-10';
  return '11-12+';
}

export function createAgeMetadata(minAge: number, maxAge: number | null = null): AgeMetadata {
  const ageBand = getAgeBandForAge(minAge);
  return { minAge, maxAge, ageBand };
}

export function createProvenanceMetadata(
  source: string,
  license: string,
  sourceUrl?: string,
  curator?: string,
): ProvenanceMetadata {
  return {
    source,
    sourceUrl,
    license,
    dateIngested: new Date().toISOString(),
    curator,
  };
}

// ─── Constants ───────────────────────────────────────────────

export const SCHEMA_VERSION = '1.0.0';
export const MAX_QUESTIONS_PER_SHARD = 100;
export const MAX_ARTICLES_PER_SHARD = 50;
