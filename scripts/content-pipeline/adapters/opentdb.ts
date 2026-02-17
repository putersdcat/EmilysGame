/**
 * scripts/content-pipeline/adapters/opentdb.ts
 * OpenTDB (Open Trivia Database) source adapter.
 * Fetches quiz questions from https://opentdb.com
 * Supports offline mode via local cache snapshots.
 * Issue #96
 *
 * TODO: DOC — OpenTDB API categories, rate limiting, cache format
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SourceAdapter, SourceMeta, AdapterFetchOptions, RawQuizItem, RawArticleItem } from '../types';

// ─── OpenTDB API Types ───────────────────────────────────────

interface OpenTDBResponse {
  response_code: number;
  results: OpenTDBQuestion[];
}

interface OpenTDBQuestion {
  type: string;
  difficulty: string;
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

// ─── Category Mapping ────────────────────────────────────────

/** OpenTDB category IDs → fetch targets */
const OPENTDB_CATEGORIES: { id: number; name: string; quizCategory: string }[] = [
  { id: 19, name: 'Science: Mathematics', quizCategory: 'math' },
  { id: 17, name: 'Science & Nature', quizCategory: 'science' },
  { id: 18, name: 'Science: Computers', quizCategory: 'technology' },
  { id: 23, name: 'History', quizCategory: 'history' },
  { id: 22, name: 'Geography', quizCategory: 'geography' },
  { id: 9,  name: 'General Knowledge', quizCategory: 'logic' },
  { id: 20, name: 'Mythology', quizCategory: 'history' },
  { id: 27, name: 'Animals', quizCategory: 'science' },
];

// ─── HTML Entity Decoding ────────────────────────────────────

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#039;': "'", '&apos;': "'", '&ldquo;': '\u201c', '&rdquo;': '\u201d',
  '&lsquo;': '\u2018', '&rsquo;': '\u2019', '&hellip;': '\u2026',
  '&ndash;': '\u2013', '&mdash;': '\u2014', '&deg;': '\u00b0',
  '&eacute;': '\u00e9', '&ouml;': '\u00f6', '&uuml;': '\u00fc',
};

function decodeHTMLEntities(text: string): string {
  let decoded = text;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    decoded = decoded.replaceAll(entity, char);
  }
  // Handle numeric entities like &#123;
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return decoded;
}

// ─── Rate Limiter ────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── OpenTDB Adapter ─────────────────────────────────────────

export class OpenTDBAdapter implements SourceAdapter {
  readonly id = 'opentdb';
  readonly meta: SourceMeta = {
    name: 'opentdb',
    displayName: 'Open Trivia Database',
    license: 'CC-BY-SA-4.0',
    url: 'https://opentdb.com',
  };

  /**
   * Fetch quiz questions from OpenTDB API.
   * Rate-limited to 1 request per 5 seconds.
   * Caches responses for deterministic offline re-runs.
   */
  async fetchQuizzes(options: AdapterFetchOptions): Promise<RawQuizItem[]> {
    const cacheDir = options.cacheDir || 'scripts/content-pipeline/.cache/opentdb';
    const limit = options.limit || 50;
    const perCategoryLimit = Math.max(5, Math.ceil(limit / OPENTDB_CATEGORIES.length));
    const allQuestions: RawQuizItem[] = [];

    // Ensure cache dir exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    for (const cat of OPENTDB_CATEGORIES) {
      const cacheFile = path.join(cacheDir, `cat-${cat.id}.json`);

      let questions: OpenTDBQuestion[];

      if (options.offline) {
        // Offline mode: read from cache only
        if (!fs.existsSync(cacheFile)) {
          console.warn(`  ⚠️ No cache for category ${cat.name} (id=${cat.id}), skipping`);
          continue;
        }
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        questions = cached.results || [];
        console.log(`  📂 Cache hit: ${questions.length} questions from ${cat.name}`);
      } else {
        // Online mode: fetch from API
        try {
          const url = `https://opentdb.com/api.php?amount=${perCategoryLimit}&category=${cat.id}&type=multiple`;
          console.log(`  🌐 Fetching ${perCategoryLimit} questions from ${cat.name}...`);
          const response = await fetch(url);
          if (!response.ok) {
            console.warn(`  ⚠️ HTTP ${response.status} for category ${cat.name}, skipping`);
            continue;
          }
          const data: OpenTDBResponse = await response.json();
          if (data.response_code !== 0) {
            console.warn(`  ⚠️ OpenTDB response_code=${data.response_code} for ${cat.name}`);
            // response_code 1 = no results for amount requested
            if (data.response_code === 1 && data.results) {
              questions = data.results;
            } else {
              continue;
            }
          } else {
            questions = data.results;
          }

          // Cache the response
          fs.writeFileSync(cacheFile, JSON.stringify({
            fetchedAt: new Date().toISOString(),
            categoryId: cat.id,
            categoryName: cat.name,
            results: questions,
          }, null, 2), 'utf-8');

          // Rate limit: 5 seconds between requests
          await sleep(5500);
        } catch (err) {
          console.warn(`  ⚠️ Fetch error for ${cat.name}: ${err}`);
          // Try cache fallback
          if (fs.existsSync(cacheFile)) {
            const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            questions = cached.results || [];
            console.log(`  📂 Fallback to cache: ${questions.length} questions`);
          } else {
            continue;
          }
        }
      }

      // Convert to RawQuizItem
      for (const q of questions) {
        allQuestions.push({
          sourceId: `opentdb:${cat.id}:${hashString(q.question)}`,
          question: decodeHTMLEntities(q.question),
          correctAnswer: decodeHTMLEntities(q.correct_answer),
          incorrectAnswers: q.incorrect_answers.map(decodeHTMLEntities),
          rawCategory: q.category,
          rawDifficulty: q.difficulty,
          tags: [cat.quizCategory, q.difficulty],
        });
      }
    }

    return allQuestions;
  }

  /** OpenTDB does not provide articles. */
  async fetchArticles(_options: AdapterFetchOptions): Promise<RawArticleItem[]> {
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────

/** Simple string hash for source IDs (not crypto-grade). */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
