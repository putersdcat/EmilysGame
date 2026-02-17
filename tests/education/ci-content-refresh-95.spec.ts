/**
 * tests/education/ci-content-refresh-95.spec.ts
 * E2E tests for the CI/CD Content Refresh Workflow (#95).
 * Validates: workflow file, fail conditions, PR template, scripts, safety refinements.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const WORKFLOW = '.github/workflows/content-refresh.yml';
const PR_TEMPLATE = '.github/PULL_REQUEST_TEMPLATE/content-pack.md';

test.describe('Issue #95 — CI/CD Content Refresh Workflow', () => {

  test('workflow file exists and has valid YAML structure', () => {
    expect(fs.existsSync(WORKFLOW)).toBe(true);
    const content = fs.readFileSync(WORKFLOW, 'utf-8');
    // Must have name, on, jobs keys
    expect(content).toMatch(/^name:/m);
    expect(content).toMatch(/^on:/m);
    expect(content).toMatch(/^jobs:/m);
  });

  test('workflow triggers: dispatch, push, PR, schedule', () => {
    const content = fs.readFileSync(WORKFLOW, 'utf-8');
    expect(content).toContain('workflow_dispatch:');
    expect(content).toContain('push:');
    expect(content).toContain('pull_request:');
    expect(content).toContain('schedule:');
  });

  test('workflow scoped to content paths', () => {
    const content = fs.readFileSync(WORKFLOW, 'utf-8');
    expect(content).toContain('public/content/packs/**');
    expect(content).toContain('scripts/content-pipeline/**');
    expect(content).toContain('src/types/content-pack.types.ts');
  });

  test('workflow has validate, qa-checks, and review-gate jobs', () => {
    const content = fs.readFileSync(WORKFLOW, 'utf-8');
    // Job definitions
    expect(content).toMatch(/^\s+validate:/m);
    expect(content).toMatch(/^\s+qa-checks:/m);
    expect(content).toMatch(/^\s+review-gate:/m);
  });

  test('validate job runs content:validate script', () => {
    const content = fs.readFileSync(WORKFLOW, 'utf-8');
    expect(content).toContain('npm run content:validate');
  });

  test('qa-checks job runs content:qa script', () => {
    const content = fs.readFileSync(WORKFLOW, 'utf-8');
    expect(content).toContain('npm run content:qa');
  });

  test('workflow uploads artifacts for validation and QA reports', () => {
    const content = fs.readFileSync(WORKFLOW, 'utf-8');
    expect(content).toContain('upload-artifact@v4');
    expect(content).toContain('validation-report');
    expect(content).toContain('qa-reports');
  });

  test('review-gate blocks on validation or QA failure', () => {
    const content = fs.readFileSync(WORKFLOW, 'utf-8');
    // Gate job checks results and exits 1 on failure
    expect(content).toContain('exit 1');
    expect(content).toContain('needs.validate.result');
  });

  test('workflow has rephrase dry-run job (manual dispatch only)', () => {
    const content = fs.readFileSync(WORKFLOW, 'utf-8');
    expect(content).toMatch(/rephrase-dry-run:/);
    expect(content).toContain('--rephrase');
    expect(content).toContain('--dry-run');
  });

  test('workflow dispatch inputs include QA toggle and age band', () => {
    const content = fs.readFileSync(WORKFLOW, 'utf-8');
    expect(content).toContain('run_qa:');
    expect(content).toContain('target_age:');
    expect(content).toContain('5-7');
    expect(content).toContain('8-10');
    expect(content).toContain('11-12+');
  });

  test('PR template exists with review checklist', () => {
    expect(fs.existsSync(PR_TEMPLATE)).toBe(true);
    const content = fs.readFileSync(PR_TEMPLATE, 'utf-8');
    expect(content).toContain('Schema validation');
    expect(content).toContain('QA checks');
    expect(content).toContain('Manual Review');
    expect(content).toMatch(/\[.*\]/); // has checkbox items
  });

  test('PR template has recovery instructions', () => {
    const content = fs.readFileSync(PR_TEMPLATE, 'utf-8');
    expect(content).toContain('Recovery');
    expect(content).toContain('content:ingest');
    expect(content).toContain('content:qa');
  });

  test('content:validate script exists in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    expect(pkg.scripts['content:validate']).toBeDefined();
    expect(pkg.scripts['content:validate']).toContain('--validate-only');
  });

  test('content:qa script exists in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    expect(pkg.scripts['content:qa']).toBeDefined();
    expect(pkg.scripts['content:qa']).toContain('--qa');
  });

  // Safety refinement tests (part of making CI workflow practically useful)
  test('safety check has context-aware terms (not just blocklist)', () => {
    // qa-checks.ts should have contextual safety terms, not just a flat blocklist
    const qaChecks = fs.readFileSync(
      'scripts/content-pipeline/qa-checks.ts', 'utf-8'
    );
    expect(qaChecks).toContain('SAFETY_TERMS_CONTEXTUAL');
    expect(qaChecks).toContain('SAFETY_CONTEXT_ALLOWLIST');
    // "blood" should be contextual, not hard-blocked
    expect(qaChecks).toMatch(/SAFETY_TERMS_CONTEXTUAL.*blood/s);
  });

  test('safety allowlist includes educational blood terms', () => {
    const qaChecks = fs.readFileSync(
      'scripts/content-pipeline/qa-checks.ts', 'utf-8'
    );
    expect(qaChecks).toContain('pumps blood');
    expect(qaChecks).toContain('blood cell');
    expect(qaChecks).toContain('blood vessel');
  });

  test('validate script returns exit code 0 on valid content', async () => {
    // Run the actual validation — content packs should be valid
    const { execSync } = await import('child_process');
    const result = execSync('npx tsx scripts/content-pipeline/index.ts --validate-only', {
      encoding: 'utf-8',
      timeout: 30000,
    });
    expect(result).toContain('All items pass schema validation');
  });

  test('QA script returns exit code 0 on current content (no errors)', async () => {
    // After safety refinement, QA should pass (warnings OK, no errors)
    const { execSync } = await import('child_process');
    const result = execSync('npx tsx scripts/content-pipeline/index.ts --qa', {
      encoding: 'utf-8',
      timeout: 30000,
    });
    expect(result).toContain('0 errors');
    expect(result).toContain('Pipeline completed successfully');
  });

  test('game still loads correctly after pipeline changes', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    // Wait for game to start
    await page.waitForFunction(() => {
      const gs = (window as any).__gameState;
      return gs && gs.frameCount > 5;
    }, { timeout: 15000 });
    // Verify game state
    const state = await page.evaluate(() => {
      const gs = (window as any).__gameState;
      return { running: gs.frameCount > 0, hasPlayer: !!gs.player };
    });
    expect(state.running).toBe(true);
    expect(state.hasPlayer).toBe(true);
  });

  test('workflow uses concurrency to cancel stale runs', () => {
    const content = fs.readFileSync(WORKFLOW, 'utf-8');
    expect(content).toContain('concurrency:');
    expect(content).toContain('cancel-in-progress');
  });

  test('workflow writes to GITHUB_STEP_SUMMARY', () => {
    const content = fs.readFileSync(WORKFLOW, 'utf-8');
    expect(content).toContain('GITHUB_STEP_SUMMARY');
  });
});
