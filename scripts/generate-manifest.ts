/**
 * scripts/generate-manifest.ts
 * Content pack manifest generation script.
 * Scans generated content shards and creates a manifest file.
 *
 * Run with: npx tsx scripts/generate-manifest.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import type {
  ContentPackManifest,
  QuizShard,
  ArticleShard,
  QuizCategory,
  SubjectId,
  AgeBand,
} from '../src/types/content-pack.types';
import { SCHEMA_VERSION } from '../src/types/content-pack.types';

// ─── Manifest Generation ────────────────────────────────────

function main() {
  console.log('🚀 Generating content pack manifest...');

  const contentDir = path.join(__dirname, '../content/packs/default-v1');
  const quizzesDir = path.join(contentDir, 'quizzes');
  const articlesDir = path.join(contentDir, 'articles');

  // Read quiz shards
  const quizFiles = fs.readdirSync(quizzesDir).filter(f => f.endsWith('.json')).sort();
  console.log(`📝 Found ${quizFiles.length} quiz shards`);

  // Read article shards
  const articleFiles = fs.readdirSync(articlesDir).filter(f => f.endsWith('.json')).sort();
  console.log(`📚 Found ${articleFiles.length} article shards`);

  // Count totals and gather statistics
  let totalQuizzes = 0;
  const categoryCounts: Record<string, number> = {};
  const subjectCounts: Record<string, number> = {};
  const ageBandCounts: Record<string, number> = {};

  // Process quiz shards
  for (const file of quizFiles) {
    const content = fs.readFileSync(path.join(quizzesDir, file), 'utf-8');
    const shard: QuizShard = JSON.parse(content);
    totalQuizzes += shard.questions.length;

    shard.questions.forEach(q => {
      categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1;
      ageBandCounts[q.ageMetadata.ageBand] = (ageBandCounts[q.ageMetadata.ageBand] || 0) + 1;
    });
  }

  // Process article shards
  let totalArticles = 0;
  for (const file of articleFiles) {
    const content = fs.readFileSync(path.join(articlesDir, file), 'utf-8');
    const shard: ArticleShard = JSON.parse(content);
    totalArticles += shard.articles.length;

    shard.articles.forEach(a => {
      subjectCounts[a.subject] = (subjectCounts[a.subject] || 0) + 1;
      ageBandCounts[a.ageMetadata.ageBand] = (ageBandCounts[a.ageMetadata.ageBand] || 0) + 1;
    });
  }

  // Create manifest
  const manifest: ContentPackManifest = {
    schemaVersion: SCHEMA_VERSION,
    packName: 'Default Educational Content Pack',
    packVersion: '1.0.0',
    description: 'Core educational content for Emily\'s Game - quiz questions and knowledge articles across multiple subjects and age bands (5-12+)',
    author: 'Emily\'s Game Content Team',
    license: 'CC0-1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    shards: {
      quizzes: quizFiles,
      articles: articleFiles,
    },
    stats: {
      totalQuizzes,
      totalArticles,
      categoryCounts: categoryCounts as Record<QuizCategory, number>,
      subjectCounts: subjectCounts as Record<SubjectId, number>,
      ageBandCounts: ageBandCounts as Record<AgeBand, number>,
    },
  };

  // Write manifest
  const manifestPath = path.join(contentDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log('\n✅ Manifest generated successfully!');
  console.log(`\n📊 Content Pack Statistics:`);
  console.log(`   Total Quizzes: ${totalQuizzes}`);
  console.log(`   Total Articles: ${totalArticles}`);
  console.log(`   Categories: ${JSON.stringify(categoryCounts, null, 2)}`);
  console.log(`   Subjects: ${JSON.stringify(subjectCounts, null, 2)}`);
  console.log(`   Age Bands: ${JSON.stringify(ageBandCounts, null, 2)}`);
  console.log(`\n📄 Manifest written to: ${manifestPath}`);
}

main();
