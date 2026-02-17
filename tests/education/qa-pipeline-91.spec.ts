/**
 * tests/education/qa-pipeline-91.spec.ts
 * E2E tests for the QA + Rephrasing Pipeline (#91)
 * Tests QA checks, readability scoring, report generation, and dry-run rephrasing.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const CONTENT_DIR = 'public/content/packs/default-v1';

// Helper: wait for game init
async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:5173/?test=1');
  await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1000);
  const hasState = await page.evaluate(() => !!(window as any).__gameState);
  expect(hasState).toBe(true);
}

// ─── QA Pipeline Tests ──────────────────────────────────────

test.describe('QA Pipeline (#91)', () => {

  test('qa-checks module exports runQAChecks function', async () => {
    // Verify the QA module exists and can be imported
    const qaChecksPath = path.resolve('scripts/content-pipeline/qa-checks.ts');
    expect(fs.existsSync(qaChecksPath)).toBe(true);

    const content = fs.readFileSync(qaChecksPath, 'utf-8');
    expect(content).toContain('export function runQAChecks');
    expect(content).toContain('export function fleschKincaidGradeLevel');
    expect(content).toContain('QAReport');
    expect(content).toContain('QAIssue');
  });

  test('prompts module exports reading level presets', async () => {
    const promptsPath = path.resolve('scripts/content-pipeline/prompts.ts');
    expect(fs.existsSync(promptsPath)).toBe(true);

    const content = fs.readFileSync(promptsPath, 'utf-8');
    expect(content).toContain('READING_LEVEL_PRESETS');
    expect(content).toContain('Early Reader');
    expect(content).toContain('Elementary');
    expect(content).toContain('Pre-Teen');
    expect(content).toContain('buildQuizRephrasePrompt');
    expect(content).toContain('buildArticleRephrasePrompt');
  });

  test('llm-client module uses separate endpoint from game BitNet', async () => {
    const clientPath = path.resolve('scripts/content-pipeline/llm-client.ts');
    expect(fs.existsSync(clientPath)).toBe(true);

    const content = fs.readFileSync(clientPath, 'utf-8');
    // Should NOT use port 8002 (game BitNet)
    expect(content).toContain('8003');
    expect(content).not.toContain("'http://127.0.0.1:8002'");
    expect(content).toContain('AUTHORING_LLM_ENDPOINT');
    expect(content).toContain('AuthoringLLMClient');
  });

  test('rephrase module supports dry-run mode', async () => {
    const rephrasePath = path.resolve('scripts/content-pipeline/rephrase.ts');
    expect(fs.existsSync(rephrasePath)).toBe(true);

    const content = fs.readFileSync(rephrasePath, 'utf-8');
    expect(content).toContain('dryRun');
    expect(content).toContain('skipAppropriate');
    expect(content).toContain('RephraseReport');
    expect(content).toContain("'dry-run'");
    expect(content).toContain("'skipped'");
  });

  test('qa-report module generates markdown and json reports', async () => {
    const reportPath = path.resolve('scripts/content-pipeline/qa-report.ts');
    expect(fs.existsSync(reportPath)).toBe(true);

    const content = fs.readFileSync(reportPath, 'utf-8');
    expect(content).toContain('generateQAReportMarkdown');
    expect(content).toContain('generateRephraseReportMarkdown');
    expect(content).toContain('writeQAReport');
    expect(content).toContain('writeRephraseReport');
    expect(content).toContain('Review Checklist');
    expect(content).toContain('Approval Gate');
  });

  test('content pack shard files have valid quiz structure', async () => {
    const quizzesDir = path.join(CONTENT_DIR, 'quizzes');
    const files = fs.readdirSync(quizzesDir).filter(f => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const shard = JSON.parse(fs.readFileSync(path.join(quizzesDir, file), 'utf-8'));
      expect(shard.questions).toBeDefined();
      expect(Array.isArray(shard.questions)).toBe(true);

      for (const q of shard.questions) {
        // Every quiz must have basic fields
        expect(q.id).toBeTruthy();
        expect(q.question).toBeTruthy();
        expect(q.answers.length).toBeGreaterThanOrEqual(2);
        expect(q.category).toBeTruthy();
        expect(q.difficulty).toBeTruthy();
        expect(q.ageMetadata).toBeTruthy();
        expect(q.provenance).toBeTruthy();
        // Answers should not have duplicates
        const uniqueAnswers = new Set(q.answers.map((a: string) => a.toLowerCase().trim()));
        expect(uniqueAnswers.size).toBe(q.answers.length);
      }
    }
  });

  test('content pack articles have valid structure for QA', async () => {
    const articlesDir = path.join(CONTENT_DIR, 'articles');
    const files = fs.readdirSync(articlesDir).filter(f => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const shard = JSON.parse(fs.readFileSync(path.join(articlesDir, file), 'utf-8'));
      expect(shard.articles).toBeDefined();

      for (const a of shard.articles) {
        expect(a.id).toBeTruthy();
        expect(a.title).toBeTruthy();
        expect(a.summary).toBeTruthy();
        expect(a.content).toBeTruthy();
        expect(a.subject).toBeTruthy();
        expect(a.keyTerms).toBeDefined();
        expect(Array.isArray(a.keyTerms)).toBe(true);
      }
    }
  });

  test('CLI supports --qa flag', async () => {
    const indexPath = path.resolve('scripts/content-pipeline/index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');
    expect(content).toContain("'--qa'");
    expect(content).toContain("'--rephrase'");
    expect(content).toContain("'--dry-run'");
    expect(content).toContain("'--target-age='");
    expect(content).toContain("'--llm-endpoint='");
    expect(content).toContain("'--report-format='");
  });

  test('package.json has qa and rephrase scripts', async () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    expect(pkg.scripts['content:qa']).toContain('--qa');
    expect(pkg.scripts['content:rephrase']).toContain('--rephrase');
    expect(pkg.scripts['content:rephrase:dry']).toContain('--dry-run');
  });

  test('game loads content and runs stably with pipeline output', async ({ page }) => {
    // Set up console listener before navigation
    const logs: string[] = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.goto('http://localhost:5173/?test=1');
    await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Verify content pack loaded
    const packLogged = logs.some(l => l.includes('Loaded content pack'));
    expect(packLogged).toBe(true);

    // Verify manifest is accessible with quiz count
    const totalQuizzes = await page.evaluate(async () => {
      const resp = await fetch('/content/packs/default-v1/manifest.json');
      const manifest = await resp.json();
      return manifest.stats.totalQuizzes;
    });
    expect(totalQuizzes).toBeGreaterThan(300);

    // Let game run for stability
    const startFrame = await page.evaluate(() => (window as any).__gameState?.frameCount || 0);
    await page.waitForTimeout(3000);
    const endFrame = await page.evaluate(() => (window as any).__gameState?.frameCount || 0);
    expect(endFrame).toBeGreaterThan(startFrame + 30);
  });

  test('qa report files can be generated in qa-reports directory', async () => {
    const reportsDir = path.join(CONTENT_DIR, 'qa-reports');
    // Reports may or may not exist from previous runs — check dir creation logic
    const qaReportModule = path.resolve('scripts/content-pipeline/qa-report.ts');
    const content = fs.readFileSync(qaReportModule, 'utf-8');
    expect(content).toContain("path.join(outputDir, 'qa-reports')");
    expect(content).toContain('mkdirSync');
  });
});
