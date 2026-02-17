/**
 * scripts/content-pipeline/index.ts
 * Unified CLI entry point for the content ingestion & normalization pipeline.
 * Issue #96
 *
 * Run: npx tsx scripts/content-pipeline/index.ts [options]
 *
 * Options:
 *   --adapters=manual,opentdb   Adapters to run (comma-separated, default: manual,opentdb)
 *   --offline                   Use cached source data only (no network, deterministic)
 *   --output=path               Output directory (default: public/content/packs/default-v1)
 *   --no-merge                  Overwrite existing content (default: merge)
 *   --verbose                   Verbose logging
 *   --validate-only             Only validate existing content (no fetch/write)
 *   --limit=N                   Max items to fetch per adapter (default: 50)
 *
 * TODO: DOC — CLI usage examples, pipeline stages, adapter authoring guide
 */

import * as path from 'path';
import * as fs from 'fs';
import { getAdapter, listAdapters } from './adapters/index';
import { normalizeQuiz, normalizeArticle, resetQuizCounter, resetArticleCounter } from './normalize';
import { dedupeAndFilterQuizzes, dedupeAndFilterArticles } from './dedupe';
import { writeQuizShards, writeArticleShards, writeManifest } from './shard-writer';
import { validateAll } from './validate';
import type { PipelineConfig, PipelineResult, PipelineStats, RawQuizItem, RawArticleItem } from './types';
import { DEFAULT_PIPELINE_CONFIG } from './types';
import type { QuizQuestionPack, KnowledgeArticlePack } from '../../src/types/content-pack.types';

// ─── CLI Argument Parsing ────────────────────────────────────

function parseArgs(): Partial<PipelineConfig> & { validateOnly?: boolean; limit?: number } {
  const args = process.argv.slice(2);
  const config: Record<string, unknown> = {};

  for (const arg of args) {
    if (arg === '--offline') config.offline = true;
    else if (arg === '--verbose') config.verbose = true;
    else if (arg === '--no-merge') config.mergeExisting = false;
    else if (arg === '--validate-only') config.validateOnly = true;
    else if (arg.startsWith('--adapters=')) config.adapters = arg.split('=')[1].split(',');
    else if (arg.startsWith('--output=')) config.outputDir = arg.split('=')[1];
    else if (arg.startsWith('--limit=')) config.limit = parseInt(arg.split('=')[1], 10);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.warn(`⚠️ Unknown argument: ${arg}`);
    }
  }

  return config as Partial<PipelineConfig> & { validateOnly?: boolean; limit?: number };
}

function printHelp(): void {
  console.log(`
📚 Emily's Game - Content Ingestion Pipeline (Issue #96)

Usage: npx tsx scripts/content-pipeline/index.ts [options]

Options:
  --adapters=LIST     Comma-separated adapter names (default: manual,opentdb)
  --offline           Use cached data only, no network requests (deterministic)
  --output=DIR        Output directory (default: public/content/packs/default-v1)
  --no-merge          Overwrite existing content (default: merge)
  --verbose           Verbose logging
  --validate-only     Validate existing content without re-generating
  --limit=N           Max items per adapter (default: 50)
  --help, -h          Show this help

Available adapters: ${listAdapters().join(', ')}

Examples:
  npx tsx scripts/content-pipeline/index.ts --offline
  npx tsx scripts/content-pipeline/index.ts --adapters=opentdb --limit=100
  npx tsx scripts/content-pipeline/index.ts --validate-only
`);
}

// ─── Pipeline Execution ──────────────────────────────────────

async function runPipeline(): Promise<PipelineResult> {
  const cliArgs = parseArgs();
  const config: PipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...cliArgs } as PipelineConfig;
  const limit = (cliArgs as { limit?: number }).limit || 50;
  const validateOnly = (cliArgs as { validateOnly?: boolean }).validateOnly || false;

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  📚 Content Ingestion & Normalization Pipeline');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Adapters:  ${config.adapters.join(', ')}`);
  console.log(`  Output:    ${config.outputDir}`);
  console.log(`  Offline:   ${config.offline}`);
  console.log(`  Merge:     ${config.mergeExisting}`);
  console.log(`  Limit:     ${limit}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Validate Only Mode ─────────────────────────────────────
  if (validateOnly) {
    return runValidateOnly(config);
  }

  // ── Stage 1: Fetch from adapters ───────────────────────────
  console.log('🔽 Stage 1: Fetching from source adapters...');
  const allRawQuizzes: RawQuizItem[] = [];
  const allRawArticles: RawArticleItem[] = [];
  const sourceCounts: Record<string, number> = {};

  for (const adapterId of config.adapters) {
    console.log(`\n  📦 Adapter: ${adapterId}`);
    try {
      const adapter = getAdapter(adapterId);
      const quizzes = await adapter.fetchQuizzes({
        limit,
        offline: config.offline,
        cacheDir: path.join(config.cacheDir, adapterId),
      });
      const articles = await adapter.fetchArticles({
        limit,
        offline: config.offline,
        cacheDir: path.join(config.cacheDir, adapterId),
      });

      allRawQuizzes.push(...quizzes);
      allRawArticles.push(...articles);
      sourceCounts[adapterId] = quizzes.length + articles.length;
      console.log(`  ✅ ${quizzes.length} quizzes, ${articles.length} articles`);
    } catch (err) {
      const msg = `Adapter ${adapterId} failed: ${err}`;
      errors.push(msg);
      console.error(`  ❌ ${msg}`);
    }
  }

  const totalFetched = allRawQuizzes.length + allRawArticles.length;
  console.log(`\n  📊 Total fetched: ${totalFetched} items (${allRawQuizzes.length} quizzes, ${allRawArticles.length} articles)\n`);

  // ── Stage 2: Normalize ─────────────────────────────────────
  console.log('🔄 Stage 2: Normalizing to schema v1...');
  resetQuizCounter();
  resetArticleCounter();

  const normalizedQuizzes: QuizQuestionPack[] = [];
  const normalizedArticles: KnowledgeArticlePack[] = [];

  for (const adapterId of config.adapters) {
    try {
      const adapter = getAdapter(adapterId);
      const adapterQuizzes = allRawQuizzes.filter(q => q.sourceId.startsWith(`${adapterId}:`));
      const adapterArticles = allRawArticles.filter(a => a.sourceId.startsWith(`${adapterId}:`));

      // Use a broader match for manual adapter (sourceId starts with "manual:")
      const quizzesForAdapter = adapterId === 'manual'
        ? allRawQuizzes.filter(q => q.sourceId.startsWith('manual:'))
        : adapterQuizzes;
      const articlesForAdapter = adapterId === 'manual'
        ? allRawArticles.filter(a => a.sourceId.startsWith('manual:'))
        : adapterArticles;

      for (const raw of quizzesForAdapter) {
        normalizedQuizzes.push(normalizeQuiz(raw, adapter.meta));
      }
      for (const raw of articlesForAdapter) {
        normalizedArticles.push(normalizeArticle(raw, adapter.meta));
      }
    } catch (err) {
      errors.push(`Normalization error for ${adapterId}: ${err}`);
    }
  }

  const totalAfterNormalization = normalizedQuizzes.length + normalizedArticles.length;
  console.log(`  ✅ Normalized: ${normalizedQuizzes.length} quizzes, ${normalizedArticles.length} articles\n`);

  // ── Stage 3: Dedup + Safety ────────────────────────────────
  console.log('🔍 Stage 3: Deduplication & safety filtering...');
  const quizResult = dedupeAndFilterQuizzes(normalizedQuizzes, config.verbose);
  const articleResult = dedupeAndFilterArticles(normalizedArticles, config.verbose);

  const totalAfterDedupe = quizResult.items.length + articleResult.items.length;
  const duplicatesRemoved = quizResult.duplicatesRemoved + articleResult.duplicatesRemoved;
  const safetyRejected = quizResult.safetyRejected + articleResult.safetyRejected;

  console.log(`  ✅ After dedupe: ${quizResult.items.length} quizzes, ${articleResult.items.length} articles`);
  console.log(`  🔄 Duplicates removed: ${duplicatesRemoved}`);
  console.log(`  🚫 Safety rejected: ${safetyRejected}`);

  if (quizResult.rejections.length > 0 && config.verbose) {
    console.log('\n  Quiz rejections:');
    for (const r of quizResult.rejections) {
      console.log(`    - ${r.item.id}: ${r.reason}`);
    }
  }
  console.log('');

  // ── Stage 4: Validate ──────────────────────────────────────
  console.log('✅ Stage 4: Schema validation...');
  const validation = validateAll(quizResult.items, articleResult.items);

  if (!validation.valid) {
    console.error(`  ❌ Validation failed: ${validation.totalErrors} errors`);
    for (const e of [...validation.quizErrors, ...validation.articleErrors].slice(0, 20)) {
      console.error(`    - ${e.itemId}.${e.field}: ${e.message}`);
      errors.push(`${e.itemId}.${e.field}: ${e.message}`);
    }
    // Continue anyway — log errors but write valid items
    const validQuizIds = new Set(validation.quizErrors.map(e => e.itemId));
    const validArticleIds = new Set(validation.articleErrors.map(e => e.itemId));
    warnings.push(`${validation.totalErrors} validation errors — invalid items included in output`);
  } else {
    console.log(`  ✅ All ${quizResult.items.length + articleResult.items.length} items pass validation`);
  }
  console.log('');

  // ── Stage 5: Write output ──────────────────────────────────
  console.log('💾 Stage 5: Writing sharded output files...');
  const quizShardFiles = writeQuizShards(quizResult.items, config.outputDir, config.maxQuestionsPerShard);
  const articleShardFiles = writeArticleShards(articleResult.items, config.outputDir, config.maxArticlesPerShard);
  writeManifest(quizResult.items, articleResult.items, quizShardFiles, articleShardFiles, config.outputDir);
  console.log('');

  // ── Summary ────────────────────────────────────────────────
  const byCategory: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  const byAgeBand: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  for (const q of quizResult.items) {
    byCategory[q.category] = (byCategory[q.category] || 0) + 1;
    byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;
    byAgeBand[q.ageMetadata.ageBand] = (byAgeBand[q.ageMetadata.ageBand] || 0) + 1;
    bySource[q.provenance.source] = (bySource[q.provenance.source] || 0) + 1;
  }

  const stats: PipelineStats = {
    totalFetched,
    totalAfterNormalization,
    totalAfterDedupe,
    totalAfterSafety: totalAfterDedupe,
    totalWritten: quizResult.items.length + articleResult.items.length,
    duplicatesRemoved,
    safetyRejected,
    byCategory,
    byDifficulty,
    byAgeBand,
    bySource,
  };

  console.log('═══════════════════════════════════════════════════');
  console.log('  📊 Pipeline Summary');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Fetched:    ${stats.totalFetched}`);
  console.log(`  Normalized: ${stats.totalAfterNormalization}`);
  console.log(`  Deduped:    ${stats.totalAfterDedupe} (${stats.duplicatesRemoved} removed)`);
  console.log(`  Output:     ${stats.totalWritten} items`);
  console.log(`  Categories: ${JSON.stringify(stats.byCategory)}`);
  console.log(`  Difficulty: ${JSON.stringify(stats.byDifficulty)}`);
  console.log(`  Age Bands:  ${JSON.stringify(stats.byAgeBand)}`);
  console.log(`  Sources:    ${JSON.stringify(stats.bySource)}`);
  if (errors.length > 0) console.log(`  Errors:     ${errors.length}`);
  if (warnings.length > 0) console.log(`  Warnings:   ${warnings.length}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  return {
    success: errors.length === 0,
    stats,
    errors,
    warnings,
    outputDir: config.outputDir,
  };
}

// ─── Validate-Only Mode ──────────────────────────────────────

function runValidateOnly(config: PipelineConfig): PipelineResult {
  console.log('🔍 Validate-only mode: checking existing content pack...\n');

  const quizzesDir = path.join(config.outputDir, 'quizzes');
  const articlesDir = path.join(config.outputDir, 'articles');
  const errors: string[] = [];

  // Load existing quizzes
  const quizzes: QuizQuestionPack[] = [];
  if (fs.existsSync(quizzesDir)) {
    for (const f of fs.readdirSync(quizzesDir).filter(f => f.endsWith('.json'))) {
      const shard = JSON.parse(fs.readFileSync(path.join(quizzesDir, f), 'utf-8'));
      quizzes.push(...(shard.questions || []));
    }
  }

  // Load existing articles
  const articles: KnowledgeArticlePack[] = [];
  if (fs.existsSync(articlesDir)) {
    for (const f of fs.readdirSync(articlesDir).filter(f => f.endsWith('.json'))) {
      const shard = JSON.parse(fs.readFileSync(path.join(articlesDir, f), 'utf-8'));
      articles.push(...(shard.articles || []));
    }
  }

  console.log(`  Found ${quizzes.length} quizzes and ${articles.length} articles`);

  const validation = validateAll(quizzes, articles);
  if (validation.valid) {
    console.log('  ✅ All items pass schema validation!\n');
  } else {
    console.error(`  ❌ ${validation.totalErrors} validation errors:`);
    for (const e of [...validation.quizErrors, ...validation.articleErrors]) {
      console.error(`    - ${e.itemId}.${e.field}: ${e.message}`);
      errors.push(`${e.itemId}.${e.field}: ${e.message}`);
    }
    console.log('');
  }

  return {
    success: errors.length === 0,
    stats: {
      totalFetched: 0, totalAfterNormalization: 0, totalAfterDedupe: 0,
      totalAfterSafety: 0, totalWritten: quizzes.length + articles.length,
      duplicatesRemoved: 0, safetyRejected: 0,
      byCategory: {}, byDifficulty: {}, byAgeBand: {}, bySource: {},
    },
    errors,
    warnings: [],
    outputDir: config.outputDir,
  };
}

// ─── Main ────────────────────────────────────────────────────

runPipeline()
  .then(result => {
    if (!result.success) {
      console.log('❌ Pipeline completed with errors.');
      process.exit(1);
    }
    console.log('✨ Pipeline completed successfully!');
  })
  .catch(err => {
    console.error('💥 Pipeline crashed:', err);
    process.exit(2);
  });
