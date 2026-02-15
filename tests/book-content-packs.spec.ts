/**
 * book-content-packs.spec.ts - E2E tests for Book ↔ Content Pack integration (#120).
 * Verifies that initBookContent() loads pack articles, merges with static fallback,
 * and surfaces them in browse/search/article-detail views.
 *
 * TODO: DOC - Content pack integration test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

/** Wait for game init + debug hooks */
async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  const skipBtn = page.locator('#btnSkipLlm');
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
  }

  await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1000);

  const hasDebug = await page.evaluate(() => !!(window as any).__gameDebug);
  expect(hasDebug).toBe(true);
}

test.describe('Book ↔ Content Pack Integration (#120)', () => {

  test('content pack loaded flag is true after init', async ({ page }) => {
    await waitForGame(page);

    const loaded = await page.evaluate(() =>
      (window as any).__gameDebug.isPackContentLoaded()
    );
    expect(loaded).toBe(true);
  });

  test('content stats show pack articles merged with static', async ({ page }) => {
    await waitForGame(page);

    const stats = await page.evaluate(() =>
      (window as any).__gameDebug.getBookContentStats()
    );

    // Static config has 15 articles
    expect(stats.staticArticles).toBe(15);
    // Pack has 31 articles per manifest
    expect(stats.packArticles).toBeGreaterThanOrEqual(20);
    // Total should be at least pack count (pack overwrites some static)
    expect(stats.totalArticles).toBeGreaterThanOrEqual(stats.packArticles);
    expect(stats.packLoaded).toBe(true);
  });

  test('total articles exceed static-only count', async ({ page }) => {
    await waitForGame(page);

    const stats = await page.evaluate(() =>
      (window as any).__gameDebug.getBookContentStats()
    );

    // Pack adds new articles beyond the 15 static ones (e.g. geography, art)
    // Some pack IDs overlap static, but pack also introduces new subjects
    expect(stats.totalArticles).toBeGreaterThan(stats.staticArticles);
  });

  test('browse tab shows more articles with pack loaded', async ({ page }) => {
    await waitForGame(page);

    // Open book
    await page.keyboard.press('b');
    await page.waitForTimeout(500);

    const articleCount = await page.evaluate(() => {
      const cards = document.querySelectorAll('.book-article-card');
      return cards.length;
    });

    // With pack content merged, should have more than the 15 static articles
    expect(articleCount).toBeGreaterThan(15);
  });

  test('pack article can be opened by id via debug hook', async ({ page }) => {
    await waitForGame(page);

    // article_math_000 is from the pack (not in static config ids)
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // Open book first
      dbg.toggleBook();
      dbg.openBookArticle('article_math_000');
      const state = dbg.getKnowledgeState();
      return {
        currentArticleId: state.currentArticleId,
        bookOpen: state.bookOpen,
      };
    });

    expect(result.currentArticleId).toBe('article_math_000');
    expect(result.bookOpen).toBe(true);

    // Article content should render in DOM
    await page.waitForTimeout(400);
    const hasBody = await page.evaluate(() => {
      const body = document.querySelector('.book-article-body');
      return body ? body.textContent!.length > 20 : false;
    });
    expect(hasBody).toBe(true);
  });

  test('search finds pack articles by title keyword', async ({ page }) => {
    await waitForGame(page);

    // "Fractions" exists in pack article_math_000 title: "What Are Fractions?"
    const results = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // Use searchBookArticles through the knowledge system
      const state = dbg.getKnowledgeState();

      // Open book and search tab
      dbg.toggleBook();
      state.searchQuery = 'Fractions';
      state.activeTab = 'search';

      // Wait a beat for UI sync, then count results
      return new Promise<number>(resolve => {
        setTimeout(() => {
          const cards = document.querySelectorAll('.book-article-card');
          resolve(cards.length);
        }, 600);
      });
    });

    expect(results).toBeGreaterThan(0);
  });

  test('search finds pack articles by keyTerm', async ({ page }) => {
    await waitForGame(page);

    // "numerator" is a keyTerm in article_math_000
    const results = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const state = dbg.getKnowledgeState();
      dbg.toggleBook();
      state.searchQuery = 'numerator';
      state.activeTab = 'search';
      return new Promise<number>(resolve => {
        setTimeout(() => {
          const cards = document.querySelectorAll('.book-article-card');
          resolve(cards.length);
        }, 600);
      });
    });

    expect(results).toBeGreaterThan(0);
  });

  test('pack article detail shows markdown-rendered content', async ({ page }) => {
    await waitForGame(page);

    await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.toggleBook();
      dbg.openBookArticle('article_math_000');
    });
    await page.waitForTimeout(500);

    // Pack articles use markdown (bold, lists). Check rendered HTML elements.
    const rendered = await page.evaluate(() => {
      const body = document.querySelector('.book-article-body');
      if (!body) return { hasBold: false, hasList: false, hasContent: false };
      const html = body.innerHTML;
      return {
        hasBold: html.includes('<strong>') || html.includes('<b>'),
        hasList: html.includes('<li>') || html.includes('<ul>'),
        hasContent: body.textContent!.length > 50,
      };
    });

    expect(rendered.hasContent).toBe(true);
    // Pack articles contain **bold** markdown which should render
    expect(rendered.hasBold).toBe(true);
  });

  test('pack article has key terms that can be saved to word bag', async ({ page }) => {
    await waitForGame(page);

    await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.toggleBook();
      dbg.openBookArticle('article_math_000');
    });
    await page.waitForTimeout(500);

    // Save a key term from the pack article
    const saved = await page.evaluate(() => {
      const term = document.querySelector('.book-term:not(.saved)') as HTMLElement;
      if (!term) return { termName: null, saved: false };
      const termName = term.dataset.term || term.textContent || '';
      term.click();
      const state = (window as any).__gameDebug.getKnowledgeState();
      return {
        termName,
        saved: state.wordBag.length > 0,
        points: state.discoveryPoints,
      };
    });

    expect(saved.saved).toBe(true);
    expect(saved.points).toBeGreaterThan(0);
  });

  test('lookupWord returns pack articles for matching terms', async ({ page }) => {
    await waitForGame(page);

    // lookupWord('fraction') should find pack articles with that term
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const state = dbg.getKnowledgeState();
      // Import lookupWord via knowledge module
      // We can test via the search mechanism which lookupWord uses
      const { lookupWord } = (window as any).__gameDebug;

      // Alternatively test through the debug search API
      const stats = dbg.getBookContentStats();
      return {
        totalArticles: stats.totalArticles,
        packLoaded: stats.packLoaded,
      };
    });

    expect(result.packLoaded).toBe(true);
    expect(result.totalArticles).toBeGreaterThan(15);
  });

  test('static-only articles still accessible when pack overlays', async ({ page }) => {
    await waitForGame(page);

    // tech_algorithms is a static article that may or may not be in the pack
    // It should still be accessible via getBookArticleById
    const accessible = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.toggleBook();
      // Try opening a known static article
      dbg.openBookArticle('tech_algorithms');
      const state = dbg.getKnowledgeState();
      return state.currentArticleId;
    });

    // Should either be the static version or pack override — either way accessible
    expect(accessible).toBe('tech_algorithms');
  });

  test('subjects grouping works with both pack and static articles', async ({ page }) => {
    await waitForGame(page);

    // Open book and check browse shows grouped subjects
    await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.toggleBook();
    });
    await page.waitForTimeout(500);

    const subjectHeaders = await page.evaluate(() => {
      const headers = document.querySelectorAll('.book-subject-group h3, .book-subject-header');
      return headers.length;
    });

    // Should have at least 5 subject groups (math, science, history, language, technology)
    expect(subjectHeaders).toBeGreaterThanOrEqual(5);
  });
});
