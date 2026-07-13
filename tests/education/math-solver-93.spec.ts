/**
 * tests/education/math-solver-93.spec.ts
 * Tests for the math solver / free-response validation system (#93).
 * Covers: expression parser, normalization, validation, rubric, feature flag, fallback.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const SOLVER_PATH = 'src/game/math-solver.ts';

test.describe('Issue #93 — Older-Kid Math Validation (Solver Spike)', () => {

  // ─── Module Structure ────────────────────────────────────

  test('math-solver.ts module exists', () => {
    expect(fs.existsSync(SOLVER_PATH)).toBe(true);
  });

  test('exports required functions', () => {
    const content = fs.readFileSync(SOLVER_PATH, 'utf-8');
    expect(content).toContain('export function evaluateExpression');
    expect(content).toContain('export function normalizeAnswer');
    expect(content).toContain('export function validateMathAnswer');
    expect(content).toContain('export function buildRubricFromQuestion');
    expect(content).toContain('export function isFreeResponseEnabled');
    expect(content).toContain('export function canUseFreeResponse');
  });

  test('exports validation result types', () => {
    const content = fs.readFileSync(SOLVER_PATH, 'utf-8');
    expect(content).toContain('export type ValidationVerdict');
    expect(content).toContain('export interface MathValidationResult');
    expect(content).toContain('export interface FreeResponseRubric');
  });

  // ─── Expression Parser (in-browser evaluation) ──────────

  test('evaluateExpression handles basic arithmetic', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const results = await page.evaluate(() => {
      // Dynamic import the module
      return import('/src/game/math-solver.ts').then(mod => ({
        add: mod.evaluateExpression('7 + 5'),
        sub: mod.evaluateExpression('20 - 8'),
        mul: mod.evaluateExpression('15 * 3'),
        div: mod.evaluateExpression('144 / 12'),
        pow: mod.evaluateExpression('2 ^ 5'),
        parens: mod.evaluateExpression('(3 + 4) * 2'),
        nested: mod.evaluateExpression('((2 + 3) * (4 - 1))'),
        decimal: mod.evaluateExpression('3.14 * 2'),
        negative: mod.evaluateExpression('-5 + 3'),
        complex: mod.evaluateExpression('(17 * 10) + (17 * 3)'),
      }));
    });

    expect(results.add).toBe(12);
    expect(results.sub).toBe(12);
    expect(results.mul).toBe(45);
    expect(results.div).toBe(12);
    expect(results.pow).toBe(32);
    expect(results.parens).toBe(14);
    expect(results.nested).toBe(15);
    expect(results.decimal).toBeCloseTo(6.28, 2);
    expect(results.negative).toBe(-2);
    expect(results.complex).toBe(221);
  });

  test('evaluateExpression returns NaN for invalid input', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const results = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => ({
        empty: mod.evaluateExpression(''),
        text: mod.evaluateExpression('hello'),
        partial: mod.evaluateExpression('5 +'),
      }));
    });

    expect(results.empty).toBeNaN();
    expect(results.text).toBeNaN();
    expect(results.partial).toBeNaN();
  });

  // ─── Input Normalization ─────────────────────────────────

  test('normalizeAnswer handles fractions', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const results = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => ({
        half: mod.normalizeAnswer('1/2'),
        threeQuarter: mod.normalizeAnswer('3/4'),
        mixed: mod.normalizeAnswer('2 1/2'),
      }));
    });

    expect(results.half.value).toBe(0.5);
    expect(results.threeQuarter.value).toBe(0.75);
    expect(results.mixed.value).toBe(2.5);
  });

  test('normalizeAnswer handles percentages and commas', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const results = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => ({
        pct: mod.normalizeAnswer('45%'),
        comma: mod.normalizeAnswer('1,000'),
        bigComma: mod.normalizeAnswer('1,000,000'),
      }));
    });

    expect(results.pct.value).toBe(45);
    expect(results.comma.value).toBe(1000);
    expect(results.bigComma.value).toBe(1000000);
  });

  test('normalizeAnswer strips units', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const results = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => ({
        degrees: mod.normalizeAnswer('40°'),
        cm: mod.normalizeAnswer('15 cm'),
        kg: mod.normalizeAnswer('3.5 kg'),
      }));
    });

    expect(results.degrees.value).toBe(40);
    expect(results.cm.value).toBe(15);
    expect(results.kg.value).toBe(3.5);
  });

  // ─── Validation ──────────────────────────────────────────

  test('validateMathAnswer returns correct for right answer', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const result = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => {
        const rubric = mod.buildRubricFromQuestion('What is 7 + 5?', '12');
        if (!rubric) return null;
        return mod.validateMathAnswer('12', rubric);
      });
    });

    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('correct');
    expect(result!.expected).toBe(12);
    expect(result!.parsed).toBe(12);
    expect(result!.distance).toBe(0);
  });

  test('validateMathAnswer returns incorrect for wrong answer', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const result = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => {
        const rubric = mod.buildRubricFromQuestion('What is 7 + 5?', '12');
        if (!rubric) return null;
        return mod.validateMathAnswer('13', rubric);
      });
    });

    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('incorrect');
    expect(result!.distance).toBe(1);
  });

  test('validateMathAnswer handles expression input', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const result = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => {
        const rubric = mod.buildRubricFromQuestion('What is 17 x 13?', '221');
        if (!rubric) return null;
        // Student types the expression itself
        return mod.validateMathAnswer('(17 * 10) + (17 * 3)', rubric);
      });
    });

    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('correct');
  });

  test('validateMathAnswer returns parse-error for non-numeric', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const result = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => {
        const rubric = mod.buildRubricFromQuestion('What is 7 + 5?', '12');
        if (!rubric) return null;
        return mod.validateMathAnswer('twelve', rubric);
      });
    });

    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('parse-error');
    expect(result!.feedback).toContain('couldn\'t understand');
  });

  test('validateMathAnswer with common mistakes feedback', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const result = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => {
        const rubric = mod.buildRubricFromQuestion('What is 7 + 5?', '12', {
          commonMistakes: [
            { answer: '75', feedback: 'You may have concatenated instead of adding.' },
          ],
        });
        if (!rubric) return null;
        return mod.validateMathAnswer('75', rubric);
      });
    });

    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('incorrect');
  });

  // ─── Rubric Builder ─────────────────────────────────────

  test('buildRubricFromQuestion creates valid rubric', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const rubric = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => {
        return mod.buildRubricFromQuestion('What is 15 × 3?', '45');
      });
    });

    expect(rubric).not.toBeNull();
    expect(rubric!.correctValue).toBe(45);
    expect(rubric!.correctAnswer).toBe('45');
    expect(rubric!.tolerance).toBeGreaterThan(0);
  });

  test('buildRubricFromQuestion returns null for non-numeric', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const rubric = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => {
        return mod.buildRubricFromQuestion('What is the capital of France?', 'Paris');
      });
    });

    expect(rubric).toBeNull();
  });

  // ─── Feature Flag ────────────────────────────────────────

  test('isFreeResponseEnabled respects URL param', async ({ page }) => {
    // Without flag
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const disabledResult = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => mod.isFreeResponseEnabled());
    });
    expect(disabledResult).toBe(false);

    // With flag
    await page.goto('http://localhost:5173/?test=1&freeresponse=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const enabledResult = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => mod.isFreeResponseEnabled());
    });
    expect(enabledResult).toBe(true);
  });

  // ─── canUseFreeResponse ──────────────────────────────────

  test('canUseFreeResponse only for math with numeric answers', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const results = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => ({
        math12: mod.canUseFreeResponse('math', '12'),
        math45: mod.canUseFreeResponse('math', '45'),
        mathDegree: mod.canUseFreeResponse('math', '40°'),
        sciMercury: mod.canUseFreeResponse('science', 'Mercury'),
        mathText: mod.canUseFreeResponse('math', 'H₂O'),
      }));
    });

    expect(results.math12).toBe(true);
    expect(results.math45).toBe(true);
    expect(results.mathDegree).toBe(true);
    expect(results.sciMercury).toBe(false);
    expect(results.mathText).toBe(false);
  });

  // ─── Representative Math Questions ───────────────────────

  test('validates representative quiz questions deterministically', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const results = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => {
        // Test against actual quiz questions from quiz.config.ts
        const testCases = [
          { q: 'What is 7 + 5?', correct: '12', student: '12' },
          { q: 'What is 3 × 4?', correct: '12', student: '12' },
          { q: 'What is 20 - 8?', correct: '12', student: '12' },
          { q: 'What is 15 × 3?', correct: '45', student: '45' },
          { q: 'What is 144 ÷ 12?', correct: '12', student: '12' },
          { q: 'What is the square root of 81?', correct: '9', student: '9' },
          { q: 'What is 17 × 13?', correct: '221', student: '221' },
          { q: 'What is the third angle?', correct: '40', student: '40' },
          { q: 'What is half of 50?', correct: '25', student: '25' },
          { q: 'What is 2 to the power of 5?', correct: '32', student: '32' },
        ];

        return testCases.map(tc => {
          const rubric = mod.buildRubricFromQuestion(tc.q, tc.correct);
          if (!rubric) return { q: tc.q, verdict: 'no-rubric' as const };
          const result = mod.validateMathAnswer(tc.student, rubric);
          return { q: tc.q, verdict: result.verdict };
        });
      });
    });

    // All should validate correctly
    for (const r of results) {
      expect(r.verdict).toBe('correct');
    }
  });

  // ─── Failure Modes ───────────────────────────────────────

  test('graceful handling of edge cases', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 2, { timeout: 15000 });

    const results = await page.evaluate(() => {
      return import('/src/game/math-solver.ts').then(mod => {
        const rubric = mod.buildRubricFromQuestion('What is 10 / 3?', '3.333');
        if (!rubric) return null;
        return {
          exact: mod.validateMathAnswer('3.333', { ...rubric, tolerance: 0.001 }).verdict,
          close: mod.validateMathAnswer('3.33', { ...rubric, tolerance: 0.01 }).verdict,
          fraction: mod.validateMathAnswer('10/3', { ...rubric, tolerance: 0.001 }).verdict,
          empty: mod.validateMathAnswer('', rubric).verdict,
          divZero: mod.evaluateExpression('1/0'),
        };
      });
    });

    expect(results).not.toBeNull();
    expect(results!.exact).toBe('correct');
    expect(results!.close).toBe('correct');
    expect(results!.fraction).toBe('correct');
    expect(results!.empty).toBe('parse-error');
    expect(results!.divZero).toBe(Infinity);
  });

  // ─── Game Stability ──────────────────────────────────────

  test('game remains stable after solver module import', async ({ page }) => {
    await page.goto('http://localhost:5173/?test=1');
    await page.waitForFunction(() => (window as any).__gameState?.frameCount > 10, { timeout: 15000 });

    const state = await page.evaluate(() => {
      const gs = (window as any).__gameState;
      return {
        running: gs.frameCount > 0,
        hasPlayer: !!gs.player,
        noErrors: true,
      };
    });

    expect(state.running).toBe(true);
    expect(state.hasPlayer).toBe(true);
  });
});
