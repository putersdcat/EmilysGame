/**
 * scripts/content-pipeline/adapters/manual.ts
 * Manual curation adapter — wraps existing hardcoded curated content
 * from the original generate-quiz-content.ts and generate-knowledge-content.ts scripts.
 * Issue #96
 *
 * This adapter reads the already-generated shard files in public/content/packs/default-v1/
 * and re-emits them as raw items for the pipeline to normalize and dedupe.
 * Ensures existing curated content is preserved through pipeline runs.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SourceAdapter, SourceMeta, AdapterFetchOptions, RawQuizItem, RawArticleItem } from '../types';
import type { QuizShard, ArticleShard } from '../../../src/types/content-pack.types';

export class ManualCurationAdapter implements SourceAdapter {
  readonly id = 'manual';
  readonly meta: SourceMeta = {
    name: 'manual-curation',
    displayName: 'Manual Curation (Existing Content)',
    license: 'CC0-1.0',
  };

  private readonly contentDir: string;

  constructor(contentDir = 'public/content/packs/default-v1') {
    this.contentDir = contentDir;
  }

  async fetchQuizzes(_options: AdapterFetchOptions): Promise<RawQuizItem[]> {
    const quizDir = path.join(this.contentDir, 'quizzes');
    if (!fs.existsSync(quizDir)) {
      console.warn(`  ⚠️ No quiz directory at ${quizDir}`);
      return [];
    }

    const items: RawQuizItem[] = [];
    const files = fs.readdirSync(quizDir).filter(f => f.endsWith('.json')).sort();

    for (const file of files) {
      const content = fs.readFileSync(path.join(quizDir, file), 'utf-8');
      const shard: QuizShard = JSON.parse(content);

      for (const q of shard.questions) {
        items.push({
          sourceId: `manual:${q.id}`,
          question: q.question,
          correctAnswer: q.answers[0], // First answer is always correct per schema
          incorrectAnswers: q.answers.slice(1),
          rawCategory: q.category,
          rawDifficulty: q.difficulty,
          hint: q.hint,
          explanation: q.explanation,
          tags: q.tags,
        });
      }
    }

    console.log(`  📂 Loaded ${items.length} existing curated quizzes`);
    return items;
  }

  async fetchArticles(_options: AdapterFetchOptions): Promise<RawArticleItem[]> {
    const articleDir = path.join(this.contentDir, 'articles');
    if (!fs.existsSync(articleDir)) {
      console.warn(`  ⚠️ No article directory at ${articleDir}`);
      return [];
    }

    const items: RawArticleItem[] = [];
    const files = fs.readdirSync(articleDir).filter(f => f.endsWith('.json')).sort();

    for (const file of files) {
      const content = fs.readFileSync(path.join(articleDir, file), 'utf-8');
      const shard: ArticleShard = JSON.parse(content);

      for (const a of shard.articles) {
        items.push({
          sourceId: `manual:${a.id}`,
          title: a.title,
          summary: a.summary,
          content: a.content,
          rawSubject: a.subject,
          keyTerms: a.keyTerms,
          readingLevel: a.readingLevel,
          related: a.related,
        });
      }
    }

    console.log(`  📂 Loaded ${items.length} existing curated articles`);
    return items;
  }
}
