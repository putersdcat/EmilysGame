/**
 * src/content-loader.ts
 * Content pack loader with fallback to in-code content.
 * Loads quiz questions and knowledge articles from JSON content packs.
 * Falls back to existing in-code config files if packs are unavailable.
 */

import type {
  ContentPackManifest,
  QuizQuestionPack,
  KnowledgeArticlePack,
  QuizShard,
  ArticleShard,
  QuizCategory,
  QuizDifficulty,
  SubjectId,
} from '../types/content-pack.types';

// ─── Content Pack Loader ────────────────────────────────────

class ContentPackLoader {
  private manifest: ContentPackManifest | null = null;
  private quizCache: QuizQuestionPack[] | null = null;
  private articleCache: KnowledgeArticlePack[] | null = null;
  private loadAttempted = false;

  /**
   * Attempt to load the content pack manifest and shards.
   * Returns true if successfully loaded from packs, false if fallback needed.
   */
  async loadContentPack(basePath = '/content/packs/default-v1'): Promise<boolean> {
    if (this.loadAttempted) {
      return this.manifest !== null;
    }

    this.loadAttempted = true;

    try {
      // Try to load manifest
      const manifestResponse = await fetch(`${basePath}/manifest.json`);
      if (!manifestResponse.ok) {
        console.warn('Content pack manifest not found, falling back to in-code content');
        return false;
      }

      this.manifest = await manifestResponse.json();
      if (!this.manifest) {
        console.warn('Manifest is null');
        return false;
      }
      console.log(`✅ Loaded content pack: ${this.manifest.packName} v${this.manifest.packVersion}`);

      // Load quiz shards
      const quizzes: QuizQuestionPack[] = [];
      for (const shardFile of (this.manifest?.shards.quizzes || [])) {
        const response = await fetch(`${basePath}/quizzes/${shardFile}`);
        if (response.ok) {
          const shard: QuizShard = await response.json();
          quizzes.push(...shard.questions);
        } else {
          console.warn(`Failed to load quiz shard: ${shardFile}`);
        }
      }
      this.quizCache = quizzes;

      // Load article shards
      const articles: KnowledgeArticlePack[] = [];
      for (const shardFile of (this.manifest?.shards.articles || [])) {
        const response = await fetch(`${basePath}/articles/${shardFile}`);
        if (response.ok) {
          const shard: ArticleShard = await response.json();
          articles.push(...shard.articles);
        } else {
          console.warn(`Failed to load article shard: ${shardFile}`);
        }
      }
      this.articleCache = articles;

      console.log(`📊 Loaded ${quizzes.length} quizzes and ${articles.length} articles from content pack`);
      return true;
    } catch (error) {
      console.warn('Failed to load content pack, falling back to in-code content:', error);
      this.manifest = null;
      this.quizCache = null;
      this.articleCache = null;
      return false;
    }
  }

  /**
   * Get all loaded quiz questions, or empty array if not loaded.
   */
  getQuizzes(): QuizQuestionPack[] {
    return this.quizCache || [];
  }

  /**
   * Get all loaded knowledge articles, or empty array if not loaded.
   */
  getArticles(): KnowledgeArticlePack[] {
    return this.articleCache || [];
  }

  /**
   * Filter quizzes by category, difficulty, and/or age.
   */
  filterQuizzes(options: {
    category?: QuizCategory;
    difficulty?: QuizDifficulty;
    minAge?: number;
    maxAge?: number;
  }): QuizQuestionPack[] {
    let filtered = this.quizCache || [];

    if (options.category) {
      filtered = filtered.filter(q => q.category === options.category);
    }

    if (options.difficulty) {
      filtered = filtered.filter(q => q.difficulty === options.difficulty);
    }

    if (options.minAge !== undefined) {
      filtered = filtered.filter(q => {
        return q.ageMetadata.maxAge === null || q.ageMetadata.maxAge >= options.minAge!;
      });
    }

    if (options.maxAge !== undefined) {
      filtered = filtered.filter(q => q.ageMetadata.minAge <= options.maxAge!);
    }

    return filtered;
  }

  /**
   * Filter articles by subject and/or age.
   */
  filterArticles(options: {
    subject?: SubjectId;
    minAge?: number;
    maxAge?: number;
  }): KnowledgeArticlePack[] {
    let filtered = this.articleCache || [];

    if (options.subject) {
      filtered = filtered.filter(a => a.subject === options.subject);
    }

    if (options.minAge !== undefined) {
      filtered = filtered.filter(a => {
        return a.ageMetadata.maxAge === null || a.ageMetadata.maxAge >= options.minAge!;
      });
    }

    if (options.maxAge !== undefined) {
      filtered = filtered.filter(a => a.ageMetadata.minAge <= options.maxAge!);
    }

    return filtered;
  }

  /**
   * Get manifest information.
   */
  getManifest(): ContentPackManifest | null {
    return this.manifest;
  }

  /**
   * Check if content pack is loaded.
   */
  isLoaded(): boolean {
    return this.manifest !== null;
  }
}

// ─── Singleton Instance ──────────────────────────────────────

export const contentPackLoader = new ContentPackLoader();
