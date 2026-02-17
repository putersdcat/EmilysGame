/**
 * scripts/content-pipeline/llm-client.ts
 * Authoring LLM client for content rephrasing — separate from game BitNet.
 * Uses OpenAI-compatible chat completions API.
 * Issue #91 — Rephrasing + Quality Gate Pipeline
 *
 * IMPORTANT: This is NOT the game's runtime LLM. This is an authoring-time
 * tool for batch processing content. The game BitNet (port 8002) should NOT
 * be used for authoring to avoid interference with gameplay.
 *
 * TODO: DOC — configuration, rate limiting, fallback behavior
 */

// ─── Configuration ───────────────────────────────────────────

export interface AuthoringLLMConfig {
  /** LLM endpoint URL (OpenAI-compatible) */
  endpoint: string;
  /** Model name */
  model: string;
  /** Max tokens per response */
  maxTokens: number;
  /** Temperature (0 = deterministic, 1 = creative) */
  temperature: number;
  /** Rate limit: max concurrent requests */
  maxConcurrent: number;
  /** Rate limit: delay between requests (ms) */
  delayBetweenRequests: number;
  /** Max retries per request */
  maxRetries: number;
  /** Timeout per request (ms) */
  timeout: number;
}

export const DEFAULT_LLM_CONFIG: AuthoringLLMConfig = {
  // Default to a separate authoring endpoint, NOT the game's BitNet
  endpoint: process.env.AUTHORING_LLM_ENDPOINT || 'http://127.0.0.1:8003/v1/chat/completions',
  model: process.env.AUTHORING_LLM_MODEL || 'default',
  maxTokens: 512,
  temperature: 0.3, // Low temp for consistency
  maxConcurrent: 1, // Be gentle with local models
  delayBetweenRequests: 500,
  maxRetries: 2,
  timeout: 30000,
};

// ─── Response Types ──────────────────────────────────────────

export interface LLMResponse {
  success: boolean;
  content: string;
  error?: string;
  latencyMs: number;
  tokens?: { prompt: number; completion: number };
}

// ─── Client ──────────────────────────────────────────────────

export class AuthoringLLMClient {
  private config: AuthoringLLMConfig;
  private requestCount = 0;
  private totalLatencyMs = 0;

  constructor(config: Partial<AuthoringLLMConfig> = {}) {
    this.config = { ...DEFAULT_LLM_CONFIG, ...config };
  }

  /** Check if LLM endpoint is reachable. */
  async healthCheck(): Promise<boolean> {
    try {
      const healthUrl = this.config.endpoint.replace('/v1/chat/completions', '/health');
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Send a chat completion request. */
  async complete(system: string, user: string): Promise<LLMResponse> {
    const start = Date.now();

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            max_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'unknown');
          if (attempt < this.config.maxRetries) {
            await this.delay(1000 * (attempt + 1));
            continue;
          }
          return {
            success: false,
            content: '',
            error: `HTTP ${response.status}: ${errorText}`,
            latencyMs: Date.now() - start,
          };
        }

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        const content = data.choices?.[0]?.message?.content || '';
        const latency = Date.now() - start;
        this.requestCount++;
        this.totalLatencyMs += latency;

        // Rate limit delay
        await this.delay(this.config.delayBetweenRequests);

        return {
          success: true,
          content,
          latencyMs: latency,
          tokens: {
            prompt: data.usage?.prompt_tokens || 0,
            completion: data.usage?.completion_tokens || 0,
          },
        };
      } catch (error) {
        if (attempt < this.config.maxRetries) {
          await this.delay(1000 * (attempt + 1));
          continue;
        }
        return {
          success: false,
          content: '',
          error: error instanceof Error ? error.message : String(error),
          latencyMs: Date.now() - start,
        };
      }
    }

    return {
      success: false,
      content: '',
      error: 'Max retries exceeded',
      latencyMs: Date.now() - start,
    };
  }

  /** Get request stats. */
  getStats(): { requestCount: number; avgLatencyMs: number } {
    return {
      requestCount: this.requestCount,
      avgLatencyMs: this.requestCount > 0 ? Math.round(this.totalLatencyMs / this.requestCount) : 0,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
