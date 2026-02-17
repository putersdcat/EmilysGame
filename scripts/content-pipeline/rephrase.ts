/**
 * scripts/content-pipeline/rephrase.ts
 * Batch rephrasing engine — sends content to authoring LLM for age-targeted rewording.
 * Supports dry-run mode (generate prompts without LLM calls).
 * Issue #91 — Rephrasing + Quality Gate Pipeline
 *
 * TODO: DOC — batch processing flow, dry-run output format, merge strategy
 */

import type { AgeBand, QuizQuestionPack, KnowledgeArticlePack } from '../../src/types/content-pack.types';
import { AuthoringLLMClient, DEFAULT_LLM_CONFIG } from './llm-client';
import type { AuthoringLLMConfig } from './llm-client';
import { buildRephraseRequests, type RephraseRequest } from './prompts';
import { fleschKincaidGradeLevel } from './qa-checks';

// ─── Rephrase Result Types ───────────────────────────────────

export interface RephraseResult {
  itemId: string;
  itemType: 'quiz' | 'article';
  targetAgeBand: AgeBand;
  status: 'success' | 'skipped' | 'failed' | 'dry-run';
  /** Original readability grade level */
  originalGradeLevel: number;
  /** Rephrased readability grade level (null if not rephrased) */
  rephrasedGradeLevel: number | null;
  /** Rephrased content (null if skipped/failed) */
  rephrasedData: Partial<QuizQuestionPack | KnowledgeArticlePack> | null;
  /** Error message if failed */
  error?: string;
  /** LLM latency in ms */
  latencyMs?: number;
}

export interface RephraseReport {
  timestamp: string;
  mode: 'live' | 'dry-run';
  targetAgeBand: AgeBand | 'auto';
  totalItems: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  results: RephraseResult[];
  llmStats: { requestCount: number; avgLatencyMs: number };
}

// ─── Rephrase Engine ─────────────────────────────────────────

export interface RephraseOptions {
  /** Target age band (or 'auto' to use each item's existing band) */
  targetAgeBand?: AgeBand;
  /** Dry-run: generate prompts without calling LLM */
  dryRun?: boolean;
  /** LLM config overrides */
  llmConfig?: Partial<AuthoringLLMConfig>;
  /** Skip items that are already at appropriate reading level */
  skipAppropriate?: boolean;
  /** Maximum items to process */
  limit?: number;
  /** Verbose logging */
  verbose?: boolean;
  /** Progress callback */
  onProgress?: (current: number, total: number, itemId: string) => void;
}

/**
 * Run batch rephrasing on content items.
 * In dry-run mode, generates all prompts but skips LLM calls.
 */
export async function runRephrase(
  quizzes: QuizQuestionPack[],
  articles: KnowledgeArticlePack[],
  options: RephraseOptions = {},
): Promise<RephraseReport> {
  const {
    targetAgeBand,
    dryRun = false,
    llmConfig = {},
    skipAppropriate = true,
    limit,
    verbose = false,
    onProgress,
  } = options;

  const client = new AuthoringLLMClient({ ...DEFAULT_LLM_CONFIG, ...llmConfig });
  const results: RephraseResult[] = [];

  // Check LLM health (skip in dry-run)
  if (!dryRun) {
    const healthy = await client.healthCheck();
    if (!healthy) {
      console.error('  ❌ Authoring LLM not reachable at', DEFAULT_LLM_CONFIG.endpoint);
      console.error('     Set AUTHORING_LLM_ENDPOINT env var or use --dry-run');
      return {
        timestamp: new Date().toISOString(),
        mode: 'dry-run',
        targetAgeBand: targetAgeBand || 'auto',
        totalItems: quizzes.length + articles.length,
        successCount: 0,
        skippedCount: 0,
        failedCount: quizzes.length + articles.length,
        results: [],
        llmStats: { requestCount: 0, avgLatencyMs: 0 },
      };
    }
  }

  // Build requests
  let requests = buildRephraseRequests(quizzes, articles, targetAgeBand);

  // Apply limit
  if (limit && limit > 0) {
    requests = requests.slice(0, limit);
  }

  const total = requests.length;

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
    onProgress?.(i + 1, total, req.itemId);

    // Check if already appropriate
    if (skipAppropriate) {
      const text = req.itemType === 'quiz'
        ? (req.originalItem as QuizQuestionPack).question
        : (req.originalItem as KnowledgeArticlePack).content;
      const grade = fleschKincaidGradeLevel(text);
      const target = getGradeTarget(req.targetAgeBand);

      if (grade <= target.max) {
        results.push({
          itemId: req.itemId,
          itemType: req.itemType,
          targetAgeBand: req.targetAgeBand,
          status: 'skipped',
          originalGradeLevel: grade,
          rephrasedGradeLevel: null,
          rephrasedData: null,
        });
        if (verbose) {
          console.log(`  ⏭️  Skip ${req.itemId} — grade ${grade} OK for ${req.targetAgeBand}`);
        }
        continue;
      }
    }

    // Dry-run: just record the prompt
    if (dryRun) {
      const text = req.itemType === 'quiz'
        ? (req.originalItem as QuizQuestionPack).question
        : (req.originalItem as KnowledgeArticlePack).content;
      results.push({
        itemId: req.itemId,
        itemType: req.itemType,
        targetAgeBand: req.targetAgeBand,
        status: 'dry-run',
        originalGradeLevel: fleschKincaidGradeLevel(text),
        rephrasedGradeLevel: null,
        rephrasedData: null,
      });
      if (verbose) {
        console.log(`  📝 Dry-run ${req.itemId} — prompt generated`);
      }
      continue;
    }

    // Live: call LLM
    const result = await processRephraseRequest(req, client, verbose);
    results.push(result);
  }

  return {
    timestamp: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'live',
    targetAgeBand: targetAgeBand || 'auto',
    totalItems: total,
    successCount: results.filter(r => r.status === 'success').length,
    skippedCount: results.filter(r => r.status === 'skipped').length,
    failedCount: results.filter(r => r.status === 'failed').length,
    results,
    llmStats: client.getStats(),
  };
}

// ─── Single Item Processing ──────────────────────────────────

async function processRephraseRequest(
  req: RephraseRequest,
  client: AuthoringLLMClient,
  verbose: boolean,
): Promise<RephraseResult> {
  const text = req.itemType === 'quiz'
    ? (req.originalItem as QuizQuestionPack).question
    : (req.originalItem as KnowledgeArticlePack).content;
  const originalGrade = fleschKincaidGradeLevel(text);

  const response = await client.complete(req.prompt.system, req.prompt.user);

  if (!response.success) {
    if (verbose) {
      console.log(`  ❌ Failed ${req.itemId}: ${response.error}`);
    }
    return {
      itemId: req.itemId,
      itemType: req.itemType,
      targetAgeBand: req.targetAgeBand,
      status: 'failed',
      originalGradeLevel: originalGrade,
      rephrasedGradeLevel: null,
      rephrasedData: null,
      error: response.error,
      latencyMs: response.latencyMs,
    };
  }

  // Parse LLM response as JSON
  try {
    const parsed = parseRephraseResponse(response.content, req.itemType);
    const rephrasedText = req.itemType === 'quiz'
      ? (parsed as { question: string }).question
      : (parsed as { content: string }).content;
    const rephrasedGrade = fleschKincaidGradeLevel(rephrasedText);

    if (verbose) {
      console.log(`  ✅ Rephrased ${req.itemId}: grade ${originalGrade} → ${rephrasedGrade}`);
    }

    return {
      itemId: req.itemId,
      itemType: req.itemType,
      targetAgeBand: req.targetAgeBand,
      status: 'success',
      originalGradeLevel: originalGrade,
      rephrasedGradeLevel: rephrasedGrade,
      rephrasedData: parsed,
      latencyMs: response.latencyMs,
    };
  } catch (parseError) {
    if (verbose) {
      console.log(`  ❌ Parse error for ${req.itemId}: ${parseError}`);
    }
    return {
      itemId: req.itemId,
      itemType: req.itemType,
      targetAgeBand: req.targetAgeBand,
      status: 'failed',
      originalGradeLevel: originalGrade,
      rephrasedGradeLevel: null,
      rephrasedData: null,
      error: `JSON parse failed: ${parseError}`,
      latencyMs: response.latencyMs,
    };
  }
}

// ─── Response Parsing ────────────────────────────────────────

function parseRephraseResponse(
  raw: string,
  itemType: 'quiz' | 'article',
): Record<string, unknown> {
  // Try to extract JSON from response (might have markdown wrapping)
  let jsonStr = raw.trim();

  // Strip markdown code block if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  // Validate required fields
  if (itemType === 'quiz') {
    if (!parsed.question || !Array.isArray(parsed.answers)) {
      throw new Error('Missing required quiz fields: question, answers');
    }
  } else {
    if (!parsed.title || !parsed.content) {
      throw new Error('Missing required article fields: title, content');
    }
  }

  return parsed;
}

// ─── Helpers ─────────────────────────────────────────────────

function getGradeTarget(ageBand: AgeBand): { min: number; max: number } {
  const targets: Record<AgeBand, { min: number; max: number }> = {
    '5-7': { min: 0, max: 3 },
    '8-10': { min: 2, max: 6 },
    '11-12+': { min: 4, max: 10 },
  };
  return targets[ageBand];
}
