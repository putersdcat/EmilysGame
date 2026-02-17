/**
 * scripts/content-pipeline/types.ts
 * Core types for the content ingestion & normalization pipeline.
 * Issue #96 — Source Ingestion & Normalization Pipeline
 *
 * TODO: DOC — pipeline architecture, adapter contract, normalization flow
 */

import type {
  QuizCategory,
  QuizDifficulty,
  AgeBand,
  SubjectId,
} from '../../src/types/content-pack.types';

// ─── Raw Content (pre-normalization) ─────────────────────────

/** Raw quiz question as returned by a source adapter, before normalization. */
export interface RawQuizItem {
  /** Unique source-relative ID (e.g. "opentdb:12345") */
  sourceId: string;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  /** Source category (will be mapped to QuizCategory) */
  rawCategory: string;
  /** Source difficulty (will be mapped to QuizDifficulty) */
  rawDifficulty: string;
  /** Adapter-provided hint (optional) */
  hint?: string;
  /** Adapter-provided explanation (optional) */
  explanation?: string;
  /** Adapter-provided tags */
  tags?: string[];
}

/** Raw article as returned by a source adapter, before normalization. */
export interface RawArticleItem {
  sourceId: string;
  title: string;
  summary: string;
  content: string;
  rawSubject: string;
  keyTerms: string[];
  readingLevel?: number;
  related?: string[];
}

// ─── Source Adapter Interface ────────────────────────────────

/** Metadata about a content source for provenance tracking. */
export interface SourceMeta {
  name: string;        // e.g. "opentdb", "manual-curation"
  displayName: string; // e.g. "Open Trivia Database"
  license: string;     // e.g. "CC-BY-SA-4.0"
  url?: string;        // e.g. "https://opentdb.com"
}

/** Options passed to source adapters at fetch time. */
export interface AdapterFetchOptions {
  /** Max items to fetch (adapter may return fewer) */
  limit?: number;
  /** Category filter (adapter-specific) */
  category?: string;
  /** Difficulty filter */
  difficulty?: string;
  /** Use cached responses only (no network) */
  offline?: boolean;
  /** Cache directory for source snapshots */
  cacheDir?: string;
}

/** A source adapter fetches raw content from an external provider. */
export interface SourceAdapter {
  /** Unique adapter ID */
  readonly id: string;
  /** Source metadata for provenance */
  readonly meta: SourceMeta;
  /** Fetch raw quiz items from this source */
  fetchQuizzes(options: AdapterFetchOptions): Promise<RawQuizItem[]>;
  /** Fetch raw articles from this source (not all adapters support this) */
  fetchArticles(options: AdapterFetchOptions): Promise<RawArticleItem[]>;
}

// ─── Normalization Types ─────────────────────────────────────

/** Category mapping entry: raw category string → QuizCategory */
export interface CategoryMapping {
  rawPattern: RegExp;
  category: QuizCategory;
}

/** Difficulty mapping entry: raw difficulty → QuizDifficulty + AgeBand */
export interface DifficultyMapping {
  raw: string;
  difficulty: QuizDifficulty;
  defaultAgeBand: AgeBand;
}

/** Subject mapping entry: raw subject → SubjectId */
export interface SubjectMapping {
  rawPattern: RegExp;
  subject: SubjectId;
}

// ─── Pipeline Configuration ──────────────────────────────────

export interface PipelineConfig {
  /** Adapters to run */
  adapters: string[];
  /** Output directory for content packs */
  outputDir: string;
  /** Cache directory for source snapshots */
  cacheDir: string;
  /** Max questions per shard */
  maxQuestionsPerShard: number;
  /** Max articles per shard */
  maxArticlesPerShard: number;
  /** Merge with existing content pack (true) or overwrite (false) */
  mergeExisting: boolean;
  /** Use offline/cached mode only */
  offline: boolean;
  /** Verbose logging */
  verbose: boolean;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  adapters: ['opentdb'],
  outputDir: 'public/content/packs/default-v1',
  cacheDir: 'scripts/content-pipeline/.cache',
  maxQuestionsPerShard: 100,
  maxArticlesPerShard: 50,
  mergeExisting: true,
  offline: false,
  verbose: false,
};

// ─── Pipeline Result ─────────────────────────────────────────

export interface PipelineStats {
  totalFetched: number;
  totalAfterNormalization: number;
  totalAfterDedupe: number;
  totalAfterSafety: number;
  totalWritten: number;
  duplicatesRemoved: number;
  safetyRejected: number;
  byCategory: Record<string, number>;
  byDifficulty: Record<string, number>;
  byAgeBand: Record<string, number>;
  bySource: Record<string, number>;
}

export interface PipelineResult {
  success: boolean;
  stats: PipelineStats;
  errors: string[];
  warnings: string[];
  outputDir: string;
}
