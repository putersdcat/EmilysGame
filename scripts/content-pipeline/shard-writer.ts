/**
 * scripts/content-pipeline/shard-writer.ts
 * Shard file writer + manifest generator.
 * Takes validated content and writes sharded JSON files + manifest.json.
 * Issue #96
 *
 * TODO: DOC — shard naming convention, manifest stat aggregation
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  QuizQuestionPack,
  KnowledgeArticlePack,
  QuizShard,
  ArticleShard,
  ContentPackManifest,
  QuizCategory,
  SubjectId,
  AgeBand,
} from '../../src/types/content-pack.types';
import { SCHEMA_VERSION } from '../../src/types/content-pack.types';

// ─── Shard Writer ────────────────────────────────────────────

/**
 * Write quiz questions into sharded JSON files.
 * Returns the list of shard filenames created.
 */
export function writeQuizShards(
  quizzes: QuizQuestionPack[],
  outputDir: string,
  maxPerShard: number,
): string[] {
  const quizzesDir = path.join(outputDir, 'quizzes');
  if (!fs.existsSync(quizzesDir)) {
    fs.mkdirSync(quizzesDir, { recursive: true });
  }

  // Clear existing shard files
  const existing = fs.readdirSync(quizzesDir).filter(f => f.startsWith('quizzes-') && f.endsWith('.json'));
  for (const f of existing) {
    fs.unlinkSync(path.join(quizzesDir, f));
  }

  const shardFiles: string[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < quizzes.length; i += maxPerShard) {
    const chunk = quizzes.slice(i, i + maxPerShard);
    const shardNumber = Math.floor(i / maxPerShard) + 1;
    const filename = `quizzes-${String(shardNumber).padStart(3, '0')}.json`;

    const shard: QuizShard = {
      shardId: `quizzes-${String(shardNumber).padStart(3, '0')}`,
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      questions: chunk,
    };

    fs.writeFileSync(path.join(quizzesDir, filename), JSON.stringify(shard, null, 2), 'utf-8');
    shardFiles.push(filename);
    console.log(`  ✅ Written ${chunk.length} quizzes → ${filename}`);
  }

  return shardFiles;
}

/**
 * Write articles into sharded JSON files.
 * Returns the list of shard filenames created.
 */
export function writeArticleShards(
  articles: KnowledgeArticlePack[],
  outputDir: string,
  maxPerShard: number,
): string[] {
  const articlesDir = path.join(outputDir, 'articles');
  if (!fs.existsSync(articlesDir)) {
    fs.mkdirSync(articlesDir, { recursive: true });
  }

  // Clear existing shard files
  const existing = fs.readdirSync(articlesDir).filter(f => f.startsWith('articles-') && f.endsWith('.json'));
  for (const f of existing) {
    fs.unlinkSync(path.join(articlesDir, f));
  }

  const shardFiles: string[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < articles.length; i += maxPerShard) {
    const chunk = articles.slice(i, i + maxPerShard);
    const shardNumber = Math.floor(i / maxPerShard) + 1;
    const filename = `articles-${String(shardNumber).padStart(3, '0')}.json`;

    const shard: ArticleShard = {
      shardId: `articles-${String(shardNumber).padStart(3, '0')}`,
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      articles: chunk,
    };

    fs.writeFileSync(path.join(articlesDir, filename), JSON.stringify(shard, null, 2), 'utf-8');
    shardFiles.push(filename);
    console.log(`  ✅ Written ${chunk.length} articles → ${filename}`);
  }

  return shardFiles;
}

// ─── Manifest Generator ─────────────────────────────────────

/**
 * Generate manifest.json from the written shard files.
 */
export function writeManifest(
  quizzes: QuizQuestionPack[],
  articles: KnowledgeArticlePack[],
  quizShardFiles: string[],
  articleShardFiles: string[],
  outputDir: string,
): void {
  // Aggregate stats
  const categoryCounts: Record<string, number> = {};
  const subjectCounts: Record<string, number> = {};
  const ageBandCounts: Record<string, number> = {};

  for (const q of quizzes) {
    categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1;
    ageBandCounts[q.ageMetadata.ageBand] = (ageBandCounts[q.ageMetadata.ageBand] || 0) + 1;
  }

  for (const a of articles) {
    subjectCounts[a.subject] = (subjectCounts[a.subject] || 0) + 1;
    // Don't double-count age bands from articles if quizzes already counted them
  }

  // Build source list from provenance
  const sources = new Set<string>();
  for (const q of quizzes) sources.add(q.provenance.source);
  for (const a of articles) sources.add(a.provenance.source);

  const manifest: ContentPackManifest = {
    schemaVersion: SCHEMA_VERSION,
    packName: 'Default Educational Content Pack',
    packVersion: '2.0.0', // Bumped for pipeline-generated content
    description: `Educational content for Emily's Game — ${quizzes.length} quizzes and ${articles.length} articles across multiple subjects and age bands. Sources: ${[...sources].join(', ')}.`,
    author: "Emily's Game Content Pipeline v2",
    license: 'CC0-1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    shards: {
      quizzes: quizShardFiles,
      articles: articleShardFiles,
    },
    stats: {
      totalQuizzes: quizzes.length,
      totalArticles: articles.length,
      categoryCounts: categoryCounts as Record<QuizCategory, number>,
      subjectCounts: subjectCounts as Record<SubjectId, number>,
      ageBandCounts: ageBandCounts as Record<AgeBand, number>,
    },
  };

  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`  📄 Manifest written → ${manifestPath}`);
}
