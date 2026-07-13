/**
 * quiz-content-pack-integration.spec.ts — live-engine proof for two related
 * findings from Docs/VisionAlignmentAudit.md's research pass:
 *
 * 1. Content-pack quiz questions were never reachable during real gameplay.
 *    `PR #106` delivered 420 quiz questions via content packs
 *    (contentPackLoader.getQuizzes()), loaded into memory at bootstrap and
 *    counted for age-profile stats (age-profile.ts), but `quiz.ts`'s
 *    `startQuiz()` only ever called the STATIC-only `getQuestions()` from
 *    `config/quiz.config.ts` — the pack corpus was completely dead weight
 *    for actual question selection. Also resolved the documented divergent-
 *    type issue (`.github/instructions/config-files.instructions.md`):
 *    `QuizCategory` in quiz.config.ts (5 values) vs content-pack.types.ts
 *    (7 values, including 'geography'/'technology') — quiz.config.ts now
 *    imports the canonical union instead of re-declaring a narrower one.
 *    Fix: `quiz.ts`'s new `getMergedQuestions()` combines both pools;
 *    `startQuiz` now calls it instead of the static-only function.
 *
 * 2. Finding #7 (WorldEngine-05 Guarantee 5 / quiz-bank <-> Book of
 *    Knowledge cross-reference): the real "I don't know" routing in
 *    main.ts used a literal TEXT search (`searchBookArticles(category)`)
 *    against the quiz category name -- so a correctly-tagged
 *    `subject:'technology'` article (e.g. "Binary Code: The Language of
 *    Computers") was never found, because its title/summary/content/
 *    keyTerms never contain the literal word "technology". Fixed by
 *    preferring an exact subject-based lookup
 *    (`getBookArticlesBySubject([category])`) before falling back to text
 *    search -- text search remains the fallback for categories with no
 *    Book subject counterpart (e.g. 'logic', which is intentionally
 *    book-less: riddles are self-contained and don't need supplementary
 *    reading).
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
  // Content pack loading is awaited during bootstrapAssets() before the
  // game loop starts, but give it a moment of margin in case of scheduling
  // jitter (matches the existing book-content-packs.spec.ts convention).
  await page.waitForTimeout(1000);
}

test('content-pack quiz questions are merged into the live question pool, not just loaded for stats', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const packLoaded = debug.isPackContentLoaded();
    const staticOnly = debug.getStaticQuestions();
    const merged = debug.getMergedQuestions();
    const staticCategories = new Set(staticOnly.map((q: any) => q.category));
    const mergedCategories = new Set(merged.map((q: any) => q.category));
    return {
      packLoaded,
      staticCount: staticOnly.length,
      mergedCount: merged.length,
      staticCategories: Array.from(staticCategories).sort(),
      mergedCategories: Array.from(mergedCategories).sort(),
    };
  });

  console.log('[quiz-content-pack-integration]', JSON.stringify(result));

  expect(result.packLoaded, 'content pack must be loaded by the time a quiz can be triggered').toBe(true);
  // The merged pool must be strictly larger than the static-only pool --
  // proves pack questions are actually included, not just present in memory.
  expect(result.mergedCount).toBeGreaterThan(result.staticCount);
  // The static pool is capped at its 5 historical categories (math/science/
  // history/language/logic); the merged pool should include at least one
  // pack-only category (geography or technology) that was previously
  // impossible to reach through getQuestions() alone.
  const packOnlyCategories = result.mergedCategories.filter((c: string) => !result.staticCategories.includes(c));
  expect(packOnlyCategories.length, `merged categories: ${result.mergedCategories.join(', ')}`).toBeGreaterThan(0);
});

test('getMergedQuestions respects difficulty filtering for both static and pack questions', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const easy = debug.getMergedQuestions('easy');
    const medium = debug.getMergedQuestions('medium');
    const hard = debug.getMergedQuestions('hard');
    return {
      easyAllMatch: easy.every((q: any) => q.difficulty === 'easy'),
      mediumAllMatch: medium.every((q: any) => q.difficulty === 'medium'),
      hardAllMatch: hard.every((q: any) => q.difficulty === 'hard'),
      easyCount: easy.length,
      mediumCount: medium.length,
      hardCount: hard.length,
    };
  });

  expect(result.easyAllMatch).toBe(true);
  expect(result.mediumAllMatch).toBe(true);
  expect(result.hardAllMatch).toBe(true);
  // Every difficulty tier should have at least some questions available.
  expect(result.easyCount).toBeGreaterThan(0);
  expect(result.mediumCount).toBeGreaterThan(0);
  expect(result.hardCount).toBeGreaterThan(0);
});

test('every quiz category actually in play has at least one matching Book of Knowledge article (mirrors real "I don\'t know" routing)', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const merged = debug.getMergedQuestions();
    const categories = Array.from(new Set(merged.map((q: any) => q.category))) as string[];

    const uncovered: string[] = [];
    for (const category of categories) {
      // Exact mirror of main.ts's corrected idk-routing: prefer an exact
      // subject match (category overlaps with SubjectId for math/science/
      // history/language/technology/geography), fall back to a text search
      // for categories with no Book subject counterpart (e.g. 'logic',
      // which is intentionally book-less -- riddles are self-contained).
      const bySubject = debug.getBookArticlesBySubject([category]);
      const hits = bySubject.length > 0 ? bySubject : debug.searchBookArticles(category);
      if (!hits || hits.length === 0) uncovered.push(category);
    }

    return { categories, uncovered };
  });

  console.log('[quiz-content-pack-integration] category coverage', JSON.stringify(result));

  // 'logic' is deliberately excluded: it has no Book of Knowledge subject
  // counterpart by design (SubjectId is math/science/history/language/
  // technology/geography/art -- riddles/logic puzzles are self-contained
  // and don't require supplementary reading). Every OTHER category must
  // have real coverage.
  const meaningfulUncovered = result.uncovered.filter((c: string) => c !== 'logic');
  expect(
    meaningfulUncovered,
    `quiz categories with zero matching Book of Knowledge articles (players saying "I don't know" here get only the generic fallback toast): ${meaningfulUncovered.join(', ')}`,
  ).toEqual([]);
});
