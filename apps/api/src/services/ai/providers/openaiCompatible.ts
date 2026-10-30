import { fetchWithTimeout } from '../../../lib/http.js';
import type { AIProvider, CompleteOpts } from '../types.js';

const TIMEOUT_MS = 30_000;

export interface OpenAICompatConfig {
  name: string;
  baseURL: string;
  apiKeyEnv: string;
  modelEnv: string;
  defaultModel: string;
  /** Override the 30s default — big cloud models cold-start slower. */
  timeoutMs?: number;
  /** Extra top-level body fields (e.g. `reasoning_effort` for gpt-oss). */
  extraBody?: Record<string, unknown>;
}

/**
 * Base for providers speaking the OpenAI /chat/completions format.
 * Subclasses may override baseURL()/apiKey()/isConfigured() (e.g. Ollama).
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  protected cfg: OpenAICompatConfig;

  constructor(cfg: OpenAICompatConfig) {
    this.name = cfg.name;
    this.cfg = cfg;
  }

  protected baseURL(): string {
    return this.cfg.baseURL;
  }

  protected apiKey(): string {
    return process.env[this.cfg.apiKeyEnv] ?? '';
  }

  protected model(): string {
    return process.env[this.cfg.modelEnv] || this.cfg.defaultModel;
  }

  isConfigured(): boolean {
    return this.apiKey().length > 0;
  }

  protected headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey()}`,
    };
  }

  /**
   * A vision call sends the image alongside the text as OpenAI content parts;
   * a text-only call keeps the plain-string form every provider accepts.
   */
  protected userMessage(opts: CompleteOpts): unknown {
    if (!opts.image) return { role: 'user', content: opts.user };
    return {
      role: 'user',
      content: [
        { type: 'text', text: opts.user },
        { type: 'image_url', image_url: { url: opts.image } },
      ],
    };
  }

  async complete(opts: CompleteOpts): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model(),
      messages: [{ role: 'system', content: opts.system }, this.userMessage(opts)],
      max_tokens: opts.maxTokens ?? 1500,
      temperature: 0.7,
      ...this.cfg.extraBody,
    };
    if (opts.json) body.response_format = { type: 'json_object' };

    const res = await fetchWithTimeout(
      `${this.baseURL()}/chat/completions`,
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
      this.cfg.timeoutMs ?? TIMEOUT_MS,
    );
    if (!res.ok) {
      throw new Error(`${this.name} HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning?: string } }[];
    };
    const message = data.choices?.[0]?.message;
    // Reasoning models (gpt-oss, nemotron) spend the budget thinking and can
    // return an empty `content` with the answer stranded in `reasoning`.
    // Using it beats failing the whole chain over a formatting quirk.
    const content = message?.content?.trim() || message?.reasoning?.trim();
    if (!content) throw new Error(`${this.name} returned empty content`);
    return content;
  }
}
