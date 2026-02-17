/**
 * src/math-solver.ts
 * Deterministic math expression parser and validator for free-response quizzes.
 * Issue #93 — Older-Kid Math Validation Path (Solver-Backed Free-Response)
 *
 * Browser-compatible, zero dependencies. Supports:
 * - Basic arithmetic: +, -, *, /, ^ (power)
 * - Parentheses  
 * - Comparison with tolerance for floating-point
 * - Number normalization (fractions, percentages, commas)
 * - Unit stripping (degrees, cm, etc.)
 *
 * TODO: DOC — expression grammar, supported formats, tolerance rules
 */

// ─── Types ───────────────────────────────────────────────────

export type ValidationVerdict = 'correct' | 'incorrect' | 'parse-error' | 'unsupported';

export interface MathValidationResult {
  /** Did the student answer correctly? */
  verdict: ValidationVerdict;
  /** The expected numeric answer (NaN if parse failed) */
  expected: number;
  /** What we parsed from the student's input */
  parsed: number;
  /** Human-readable feedback */
  feedback: string;
  /** How close were they (0 = exact, higher = further) */
  distance: number;
  /** Was approximate matching used? */
  approximate: boolean;
  /** Raw input after normalization */
  normalizedInput: string;
}

export interface FreeResponseRubric {
  /** The question text */
  question: string;
  /** Canonical correct answer (as string) */
  correctAnswer: string;
  /** Numeric value of correct answer */
  correctValue: number;
  /** Tolerance for numeric comparison (absolute) */
  tolerance: number;
  /** Whether to accept percentage-format answers */
  acceptPercentage: boolean;
  /** Whether to accept fraction-format answers */
  acceptFraction: boolean;
  /** Units expected (if any) */
  expectedUnit?: string;
  /** Hints for common mistakes */
  commonMistakes?: { answer: string; feedback: string }[];
}

// ─── Constants ───────────────────────────────────────────────

/** Default absolute tolerance for floating-point comparison */
const DEFAULT_TOLERANCE = 0.0001;

/** Units we can strip from answers */
const UNIT_PATTERNS = [
  /°/g,           // degrees
  /\s*(cm|mm|m|km|in|ft|yd|mi|kg|g|lb|oz|s|ms|min|hr|hrs)\s*$/i,
  /\s*degrees?\s*$/i,
  /\s*percent\s*$/i,
];

// ─── Expression Parser (Recursive Descent) ───────────────────

/**
 * Tokenize a math expression string.
 * Supports: numbers (including decimals), operators, parens.
 */
function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    // Number (including negative after operator or at start)
    if (/[0-9.]/.test(ch) || (ch === '-' && (tokens.length === 0 || /[+\-*/^(]/.test(tokens[tokens.length - 1])))) {
      let num = '';
      if (ch === '-') { num += '-'; i++; }
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i]; i++;
      }
      tokens.push(num);
    } else if ('+-*/^()'.includes(ch)) {
      tokens.push(ch);
      i++;
    } else {
      // Unknown character — skip
      i++;
    }
  }
  return tokens;
}

/**
 * Recursive descent parser for arithmetic expressions.
 * Grammar:
 *   expr     → term (('+' | '-') term)*
 *   term     → power (('*' | '/') power)*
 *   power    → unary ('^' unary)*
 *   unary    → '-' unary | primary
 *   primary  → NUMBER | '(' expr ')'
 */
class ExprParser {
  private tokens: string[];
  private pos = 0;

  constructor(tokens: string[]) {
    this.tokens = tokens;
  }

  parse(): number {
    const result = this.expr();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token: ${this.tokens[this.pos]}`);
    }
    return result;
  }

  private expr(): number {
    let left = this.term();
    while (this.pos < this.tokens.length && (this.peek() === '+' || this.peek() === '-')) {
      const op = this.advance();
      const right = this.term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private term(): number {
    let left = this.power();
    while (this.pos < this.tokens.length && (this.peek() === '*' || this.peek() === '/')) {
      const op = this.advance();
      const right = this.power();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  private power(): number {
    const base = this.unary();
    if (this.pos < this.tokens.length && this.peek() === '^') {
      this.advance();
      const exp = this.unary();
      return Math.pow(base, exp);
    }
    return base;
  }

  private unary(): number {
    if (this.peek() === '-') {
      this.advance();
      return -this.unary();
    }
    return this.primary();
  }

  private primary(): number {
    if (this.peek() === '(') {
      this.advance(); // consume '('
      const val = this.expr();
      if (this.peek() !== ')') throw new Error('Missing closing parenthesis');
      this.advance(); // consume ')'
      return val;
    }
    // Must be a number
    const token = this.advance();
    const num = parseFloat(token);
    if (isNaN(num)) throw new Error(`Invalid number: ${token}`);
    return num;
  }

  private peek(): string {
    return this.tokens[this.pos] || '';
  }

  private advance(): string {
    return this.tokens[this.pos++] || '';
  }
}

/**
 * Evaluate a math expression string to a number.
 * Returns NaN if the expression cannot be parsed.
 */
export function evaluateExpression(expr: string): number {
  try {
    const tokens = tokenize(expr);
    if (tokens.length === 0) return NaN;
    const parser = new ExprParser(tokens);
    return parser.parse();
  } catch {
    return NaN;
  }
}

// ─── Input Normalization ─────────────────────────────────────

/**
 * Normalize a student's free-form answer for comparison.
 * Handles: fractions, percentages, commas, units, whitespace, degree symbols.
 */
export function normalizeAnswer(raw: string): { value: number; normalized: string } {
  let s = raw.trim();

  // Strip units
  for (const pattern of UNIT_PATTERNS) {
    s = s.replace(pattern, '');
  }
  s = s.trim();

  // Handle percentage: "45%" → 45
  if (s.endsWith('%')) {
    const num = parseFloat(s.slice(0, -1));
    if (!isNaN(num)) return { value: num, normalized: s };
  }

  // Handle fractions: "3/4" → 0.75
  const fractionMatch = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (fractionMatch) {
    const num = parseInt(fractionMatch[1], 10);
    const den = parseInt(fractionMatch[2], 10);
    if (den !== 0) return { value: num / den, normalized: s };
  }

  // Handle mixed numbers: "2 1/2" → 2.5
  const mixedMatch = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den !== 0) {
      const sign = whole < 0 ? -1 : 1;
      return { value: whole + sign * (num / den), normalized: s };
    }
  }

  // Remove commas from numbers: "1,000" → "1000"
  const decomma = s.replace(/,/g, '');

  // Try as expression
  const exprValue = evaluateExpression(decomma);
  if (!isNaN(exprValue)) return { value: exprValue, normalized: decomma };

  // Try as plain number
  const plainNum = parseFloat(decomma);
  if (!isNaN(plainNum)) return { value: plainNum, normalized: decomma };

  return { value: NaN, normalized: s };
}

// ─── Validation ──────────────────────────────────────────────

/**
 * Validate a free-response math answer against a rubric.
 * Pure, deterministic, no LLM needed.
 */
export function validateMathAnswer(
  studentInput: string,
  rubric: FreeResponseRubric,
): MathValidationResult {
  const { value: parsed, normalized } = normalizeAnswer(studentInput);
  const tolerance = rubric.tolerance || DEFAULT_TOLERANCE;

  // Parse error — couldn't understand the student's input
  if (isNaN(parsed)) {
    // Check for common mistake matches (string-based)
    const mistake = rubric.commonMistakes?.find(
      m => studentInput.trim().toLowerCase() === m.answer.toLowerCase()
    );
    return {
      verdict: 'parse-error',
      expected: rubric.correctValue,
      parsed: NaN,
      feedback: mistake?.feedback || 'I couldn\'t understand your answer. Try entering just a number.',
      distance: Infinity,
      approximate: false,
      normalizedInput: normalized,
    };
  }

  const distance = Math.abs(parsed - rubric.correctValue);
  const isCorrect = distance <= tolerance;
  const isClose = !isCorrect && distance <= tolerance * 100;

  // Build feedback
  let feedback: string;
  if (isCorrect) {
    feedback = 'Correct! Great job! 🎉';
  } else if (isClose) {
    feedback = `Almost! You got ${parsed}, but the answer is ${rubric.correctAnswer}. You were very close!`;
  } else {
    // Check common mistakes
    const mistake = rubric.commonMistakes?.find(
      m => Math.abs(parsed - parseFloat(m.answer)) < tolerance
    );
    feedback = mistake?.feedback || `Not quite. The correct answer is ${rubric.correctAnswer}.`;
  }

  return {
    verdict: isCorrect ? 'correct' : 'incorrect',
    expected: rubric.correctValue,
    parsed,
    feedback,
    distance,
    approximate: isCorrect && distance > 0,
    normalizedInput: normalized,
  };
}

// ─── Rubric Builder ──────────────────────────────────────────

/**
 * Build a rubric from a quiz question.
 * Extracts the numeric answer from the first choice.
 */
export function buildRubricFromQuestion(
  question: string,
  correctAnswer: string,
  options?: Partial<FreeResponseRubric>,
): FreeResponseRubric | null {
  const { value } = normalizeAnswer(correctAnswer);
  if (isNaN(value)) return null; // Can't build rubric for non-numeric answer

  return {
    question,
    correctAnswer,
    correctValue: value,
    tolerance: options?.tolerance ?? DEFAULT_TOLERANCE,
    acceptPercentage: options?.acceptPercentage ?? true,
    acceptFraction: options?.acceptFraction ?? true,
    expectedUnit: options?.expectedUnit,
    commonMistakes: options?.commonMistakes,
  };
}

// ─── Feature Flag ────────────────────────────────────────────

/** Runtime check for free-response math mode */
export function isFreeResponseEnabled(): boolean {
  // Feature flag: URL param ?freeresponse=1 or localStorage
  if (typeof window !== 'undefined') {
    const urlFlag = new URLSearchParams(window.location.search).get('freeresponse');
    if (urlFlag === '1') return true;
    if (urlFlag === '0') return false;
    // Check localStorage setting
    try {
      return localStorage.getItem('emilys_game_freeresponse') === '1';
    } catch { /* ignore */ }
  }
  return false;
}

/**
 * Can this quiz question be handled as free-response?
 * Only math category questions with numeric answers qualify.
 */
export function canUseFreeResponse(
  category: string,
  correctAnswer: string,
): boolean {
  if (category !== 'math') return false;
  const { value } = normalizeAnswer(correctAnswer);
  return !isNaN(value);
}
