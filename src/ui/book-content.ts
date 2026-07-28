/**
 * book-content.ts - Unified article repository for Book of Knowledge.
 * Merges external content-pack articles with fallback in-code articles.
 * Content pack is primary source; static config is fallback/supplement.
 *
 * TODO: DOC - Book content pipeline and pack integration
 */

import { contentPackLoader } from '../asset-pipeline/content-loader';
import {
  KNOWLEDGE_ARTICLES, getArticleById as getStaticArticle,
  type KnowledgeArticle, type SubjectId,
} from '../config/knowledge.config';
import type { KnowledgeArticlePack } from '../types/content-pack.types';

// ─── State ──────────────────────────────────────────────────

/** Unified article cache — pack articles + static fallback */
let _articles: KnowledgeArticle[] = [];
/** Whether content pack has been loaded */
let _packLoaded = false;
/** Whether init has been called */
let _initialized = false;

// ─── Initialization ─────────────────────────────────────────

/**
 * Initialize the book content repository.
 * Loads content packs asynchronously, falls back to in-code articles.
 * Should be called once during game startup.
 */
export async function initBookContent(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  try {
    _packLoaded = await contentPackLoader.loadContentPack();
  } catch {
    console.warn('[BookContent] Pack load failed, using in-code fallback');
    _packLoaded = false;
  }

  _rebuildArticleList();
}

/**
 * Rebuild the unified article list from packs + static config.
 * Pack articles take priority (by id) over static articles.
 */
function _rebuildArticleList(): void {
  const byId = new Map<string, KnowledgeArticle>();

  // 1. Start with static in-code articles as baseline
  for (const a of KNOWLEDGE_ARTICLES) {
    byId.set(a.id, a);
  }

  // 2. Overlay pack articles (pack content wins on id collision)
  if (_packLoaded) {
    const packArticles = contentPackLoader.getArticles();
    for (const pa of packArticles) {
      byId.set(pa.id, _convertPackArticle(pa));
    }
  }

  _articles = [...byId.values()];
}

/**
 * Convert a content-pack article to the KnowledgeArticle interface
 * used by the Book UI. Pack articles have extra fields (ageMetadata,
 * readingLevel, provenance) that are stripped for UI compatibility.
 */
function _convertPackArticle(pa: KnowledgeArticlePack): KnowledgeArticle {
  return {
    id: pa.id,
    subject: pa.subject as SubjectId,
    title: pa.title,
    summary: pa.summary,
    content: pa.content,
    keyTerms: pa.keyTerms,
    related: pa.related,
    image: pa.image
      ? {
          url: pa.image.url,
          alt: pa.image.alt,
          credit: pa.image.credit,
          license: pa.image.license,
        }
      : undefined,
  };
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Get filtered articles by subject(s).
 */
export function getBookArticlesBySubject(subjects?: SubjectId[]): KnowledgeArticle[] {
  if (!subjects || subjects.length === 0) return _articles;
  return _articles.filter(a => subjects.includes(a.subject));
}

/**
 * Look up a single article by id.
 * Checks unified list first, falls back to static config.
 */
export function getBookArticleById(id: string): KnowledgeArticle | undefined {
  return _articles.find(a => a.id === id) || getStaticArticle(id);
}

/**
 * Search articles by query string (matches title, summary, content, keyTerms).
 */
export function searchBookArticles(
  query: string,
  subjects?: SubjectId[],
): KnowledgeArticle[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();

  let pool = _articles;
  if (subjects && subjects.length > 0) {
    pool = pool.filter(a => subjects.includes(a.subject));
  }

  return pool.filter(a =>
    a.title.toLowerCase().includes(q) ||
    a.summary.toLowerCase().includes(q) ||
    a.content.toLowerCase().includes(q) ||
    a.keyTerms.some(t => t.toLowerCase().includes(q))
  );
}

/**
 * Check if content pack articles are loaded.
 */
export function isPackContentLoaded(): boolean {
  return _packLoaded;
}

/**
 * Get content stats for debugging.
 */
export function getBookContentStats(): {
  totalArticles: number;
  packArticles: number;
  staticArticles: number;
  packLoaded: boolean;
} {
  const packCount = _packLoaded ? contentPackLoader.getArticles().length : 0;
  return {
    totalArticles: _articles.length,
    packArticles: packCount,
    staticArticles: KNOWLEDGE_ARTICLES.length,
    packLoaded: _packLoaded,
  };
}
