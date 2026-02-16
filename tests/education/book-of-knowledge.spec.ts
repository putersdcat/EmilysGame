/**
 * book-of-knowledge.spec.ts - E2E tests for Book of Knowledge system.
 * Tests: book toggle, browse tab, search tab, word bag, subject filtering.
 * TODO: DOC - Book of Knowledge test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

/** Helper: wait for game to fully initialize */
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
  const hasState = await page.evaluate(() => !!(window as any).__gameState);
  expect(hasState).toBe(true);
}

test.describe('Book of Knowledge', () => {

  test('B key toggles book overlay', async ({ page }) => {
    await waitForGame(page);

    // Book should be closed initially
    const initiallyHidden = await page.evaluate(() => {
      const overlay = document.getElementById('bookOverlay');
      return overlay ? overlay.style.display === 'none' || overlay.style.display === '' : true;
    });
    expect(initiallyHidden).toBe(true);

    // Press B to open
    await page.keyboard.press('b');
    await page.waitForTimeout(300);

    const bookOpen = await page.evaluate(() => {
      const overlay = document.getElementById('bookOverlay');
      return overlay ? overlay.style.display !== 'none' && overlay.style.display !== '' : false;
    });
    expect(bookOpen).toBe(true);

    // Press B again to close
    await page.keyboard.press('b');
    await page.waitForTimeout(300);

    const bookClosed = await page.evaluate(() => {
      const overlay = document.getElementById('bookOverlay');
      return overlay ? overlay.style.display === 'none' : true;
    });
    expect(bookClosed).toBe(true);
  });

  test('browse tab shows articles from all subjects in test mode', async ({ page }) => {
    await waitForGame(page);

    // In test mode, subjects aren't selected, so all articles should show
    await page.keyboard.press('b');
    await page.waitForTimeout(500);

    const articleCount = await page.evaluate(() => {
      const cards = document.querySelectorAll('.book-article-card');
      return cards.length;
    });

    // Should have articles from all subjects (15 in config)
    expect(articleCount).toBeGreaterThan(0);
  });

  test('clicking an article opens the reader', async ({ page }) => {
    await waitForGame(page);

    await page.keyboard.press('b');
    await page.waitForTimeout(500);

    // Click the first article card
    const articleTitle = await page.evaluate(() => {
      const card = document.querySelector('.book-article-card');
      if (!card) return null;
      const title = card.querySelector('.book-article-title')?.textContent || '';
      (card as HTMLElement).click();
      return title;
    });
    expect(articleTitle).not.toBeNull();

    await page.waitForTimeout(300);

    // Should be viewing the article now (back button visible)
    const hasBackBtn = await page.evaluate(() => !!document.getElementById('bookBack'));
    expect(hasBackBtn).toBe(true);

    // Should have article body content
    const hasBody = await page.evaluate(() => {
      const body = document.querySelector('.book-article-body');
      return body ? body.textContent!.length > 20 : false;
    });
    expect(hasBody).toBe(true);

    // Should have key terms
    const termCount = await page.evaluate(() => {
      return document.querySelectorAll('.book-term').length;
    });
    expect(termCount).toBeGreaterThan(0);
  });

  test('saving a key term adds it to word bag', async ({ page }) => {
    await waitForGame(page);

    await page.keyboard.press('b');
    await page.waitForTimeout(500);

    // Click first article
    await page.evaluate(() => {
      const card = document.querySelector('.book-article-card');
      if (card) (card as HTMLElement).click();
    });
    await page.waitForTimeout(300);

    // Get a term name and click the save button
    const savedTerm = await page.evaluate(() => {
      const term = document.querySelector('.book-term:not(.saved)') as HTMLElement;
      if (!term) return null;
      const termName = term.dataset.term || '';
      term.click();
      return termName;
    });
    expect(savedTerm).not.toBeNull();

    await page.waitForTimeout(200);

    // Verify it's marked as saved
    const isSaved = await page.evaluate((termName: string) => {
      const state = (window as any).__gameState;
      return state.knowledge.wordBag.some((w: any) => w.term === termName.toLowerCase());
    }, savedTerm!);
    expect(isSaved).toBe(true);

    // Check discovery points increased
    const points = await page.evaluate(() => {
      const state = (window as any).__gameState;
      return state.knowledge.discoveryPoints;
    });
    expect(points).toBeGreaterThan(0);
  });

  test('search tab filters articles by query', async ({ page }) => {
    await waitForGame(page);

    await page.keyboard.press('b');
    await page.waitForTimeout(500);

    // Switch to search tab
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('.book-tab');
      if (tabs[2]) (tabs[2] as HTMLElement).click();
    });
    await page.waitForTimeout(300);

    // Type a search query that should match (e.g., "fraction" for math)
    await page.evaluate(() => {
      const state = (window as any).__gameState;
      state.knowledge.searchQuery = 'fraction';
    });
    await page.waitForTimeout(500);

    // Check that search results appear
    const results = await page.evaluate(() => {
      const cards = document.querySelectorAll('.book-article-card');
      return cards.length;
    });
    expect(results).toBeGreaterThan(0);
  });

  test('word bag tab shows saved terms', async ({ page }) => {
    await waitForGame(page);

    // Open book and save a term first
    await page.keyboard.press('b');
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const card = document.querySelector('.book-article-card');
      if (card) (card as HTMLElement).click();
    });
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const term = document.querySelector('.book-term:not(.saved)') as HTMLElement;
      if (term) term.click();
    });
    await page.waitForTimeout(200);

    // Switch to word bag tab
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('.book-tab');
      if (tabs[1]) (tabs[1] as HTMLElement).click();
    });
    await page.waitForTimeout(500);

    // Word bag should show at least 1 saved word
    const wordCount = await page.evaluate(() => {
      const entries = document.querySelectorAll('.wordbag-entry');
      return entries.length;
    });
    expect(wordCount).toBeGreaterThanOrEqual(1);
  });

  test('book overlay elements exist in DOM', async ({ page }) => {
    await waitForGame(page);

    // Check that book-related DOM elements exist
    const elements = await page.evaluate(() => ({
      bookOverlay: !!document.getElementById('bookOverlay'),
      bookContent: !!document.getElementById('bookContent'),
      bookClose: !!document.getElementById('bookClose'),
      bookTabs: document.querySelectorAll('.book-tab').length,
      btnBook: !!document.getElementById('btnBook'),
      subjectOverlay: !!document.getElementById('subjectOverlay'),
    }));

    expect(elements.bookOverlay).toBe(true);
    expect(elements.bookContent).toBe(true);
    expect(elements.bookClose).toBe(true);
    expect(elements.bookTabs).toBe(3); // Browse, Word Bag, Search
    expect(elements.btnBook).toBe(true);
    expect(elements.subjectOverlay).toBe(true);
  });

  test('close button closes the book', async ({ page }) => {
    await waitForGame(page);

    await page.keyboard.press('b');
    await page.waitForTimeout(300);

    // Click close button
    await page.evaluate(() => {
      document.getElementById('bookClose')?.click();
    });
    await page.waitForTimeout(300);

    const bookClosed = await page.evaluate(() => {
      const overlay = document.getElementById('bookOverlay');
      return overlay ? overlay.style.display === 'none' : true;
    });
    expect(bookClosed).toBe(true);

    // Game should be unpaused
    const unpaused = await page.evaluate(() => {
      const state = (window as any).__gameState;
      return !state.paused;
    });
    expect(unpaused).toBe(true);
  });
});
