# Educational Content System

## Overview

Emily's Game now has a scalable educational content system with externalized content packs, age-appropriate filtering, and automated content generation pipelines.

## Content Delivered (Issue #8)

### Quiz Questions: 105 total
- **Categories:** Math (15), Science (15), History (15), Language (15), Logic (15), Geography (15), Technology (15)
- **Age Bands:** 5-7 years (35), 8-10 years (35), 11-12+ years (35)
- **Difficulties:** Easy (35), Medium (35), Hard (35)

### Knowledge Articles: 15 total
- **Subjects:** Math (3), Science (4), History (2), Language (2), Technology (2), Geography (2)
- **Age Bands:** 5-7 years (3), 8-10 years (7), 11-12+ years (5)

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
├── manifest.json          # Pack metadata and statistics
├── quizzes/
│   ├── quizzes-001.json  # 100 questions
│   └── quizzes-002.json  # 5 questions
└── articles/
    └── articles-001.json  # 15 articles
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

All content is sourced from:
- **Public Domain:** Wikipedia, educational resources
- **Manual Curation:** Age-appropriate rephrasing and adaptation
- **License:** CC0-1.0 (Public Domain equivalent)

### Research Sources
- Games4ESL
- Just Family Fun
- Who Smarted?
- MadeForMums
- Mom Loves Best
- Public domain educational materials

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
