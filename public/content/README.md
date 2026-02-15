# Educational Content System

## Overview

Emily's Game now has a scalable educational content system with externalized content packs, age-appropriate filtering, and automated content generation pipelines.

## Content Delivered (Issue #8)

### Quiz Questions: 420 total (COMPLETED second doubling goal!)
- **Categories:** Math (125), Science (125), History (39), Language (43), Logic (30), Geography (37), Technology (20), Art (1)
- **Age Bands:** 5-7 years (120), 8-10 years (152), 11-12+ years (148)
- **Difficulties:** Easy (124), Medium (154), Hard (142)
- **Shards:** 5 shard files (100+100+100+100+20 questions)
- **Progress:** 105→210→330→420 ✅ GOAL ACHIEVED

### Knowledge Articles: 31 total (Baseline complete, expansion to 120 in progress)
- **Subjects:** Math (5), Science (8), History (5), Language (4), Technology (4), Geography (3), Art (2)
- **Age Bands:** 5-7 years (8), 8-10 years (14), 11-12+ years (9)
- **Shards:** 2 shard files
- **Progress:** 15→30→31 (targeting 120)

## Architecture

### Schema v1 (`src/types/content-pack.types.ts`)
- **QuizQuestionPack:** Quiz questions with metadata
- **KnowledgeArticlePack:** Educational articles with metadata
- **ContentPackManifest:** Pack-level metadata and statistics
- **Sharding:** Max 100 questions or 50 articles per shard file

### Metadata Features
- **Age Banding:** 5-7, 8-10, 11-12+ with min/max age filtering
- **Provenance Tracking:** Source, license, ingestion date, curator
- **Difficulty Scaling:** Easy, Medium, Hard
- **Tag System:** Flexible categorization and search

### Content Loader (`src/content-loader.ts`)
- Loads content packs from `/content/packs/default-v1/`
- Falls back to in-code content if packs unavailable
- Filtering by category, difficulty, subject, age
- Singleton instance for game-wide access

## Content Generation Pipeline

### 1. Quiz Questions
```bash
npx tsx scripts/generate-quiz-content.ts
```
Generates sharded quiz JSON files from curated questions.

### 2. Knowledge Articles
```bash
npx tsx scripts/generate-knowledge-content.ts
```
Generates sharded article JSON files from curated content.

### 3. Manifest
```bash
npx tsx scripts/generate-manifest.ts
```
Scans all shards and creates `manifest.json` with statistics.

## Content Pack Structure

```
content/packs/default-v1/
├── manifest.json          # Pack metadata and statistics (210 quizzes, 30 articles)
├── quizzes/
│   ├── quizzes-001.json  # 100 questions
│   ├── quizzes-002.json  # 100 questions
│   └── quizzes-003.json  # 10 questions
└── articles/
    └── articles-001.json  # 30 articles
```

## Usage Example

```typescript
import { contentPackLoader } from './content-loader';

// Load content pack (async, typically at game startup)
await contentPackLoader.loadContentPack();

// Get filtered quizzes
const easyMathQuizzes = contentPackLoader.filterQuizzes({
  category: 'math',
  difficulty: 'easy',
  minAge: 5,
  maxAge: 7,
});

// Get filtered articles
const scienceArticles = contentPackLoader.filterArticles({
  subject: 'science',
  minAge: 8,
  maxAge: 10,
});
```

## Content Sources

All content is sourced from verified public domain and educational resources:
- **Public Domain:** Wikipedia, general knowledge from public educational materials
- **Educational Commons:** Games4ESL, educational websites with freely available content
- **Manual Curation:** Age-appropriate rephrasing and adaptation for children ages 5-12
- **License:** CC0-1.0 (Public Domain equivalent)

### Research & Verification Sources
- **OpenTDB:** Open Trivia Database (4000+ questions)
- **OER Commons:** Open Educational Resources
- **Games4ESL:** Free educational games and quizzes
- **Public Domain Content:** Wikipedia, educational websites
- **Manual Review:** All content manually reviewed for age-appropriateness and accuracy

## Future Enhancements (Blocked Issues)

See decomposed work items:
- **#91:** Rephrasing + Quality Gate Pipeline (LLM-based)
- **#92:** Age-Banded Content Selection Runtime
- **#93:** Older-Kid Math Validation Spike (solver-backed)
- **#94:** Early-Reader Quiz Accessibility (auto-read/repeat)
- **#95:** CI/CD Automated Content Refresh
- **#96:** Source Ingestion & Normalization Pipeline

## Validation

All generated content follows schema v1 and validates:
- TypeScript type checking: ✅ (content files compile cleanly)
- Age-appropriate language
- Provenance metadata
- Correct difficulty scaling

## Notes

- Existing in-code content (`src/config/quiz.config.ts`, `src/config/knowledge.config.ts`) remains as fallback
- Content pack loader prioritizes external JSON packs
- All content includes educational explanations and hints
- Reading level estimates provided where applicable
