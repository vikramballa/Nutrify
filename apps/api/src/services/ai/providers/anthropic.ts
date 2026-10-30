import { fetchWithTimeout } from '../../../lib/http.js';
import type { AIProvider, CompleteOpts } from '../types.js';

const TIMEOUT_MS = 30_000;

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  private model(): string {
    return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  }

  async complete(opts: CompleteOpts): Promise<string> {
    const res = await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model(),
          max_tokens: opts.maxTokens ?? 1500,
          system: opts.system,
          messages: [{ role: 'user', content: opts.user }],
        }),
      },
      TIMEOUT_MS,
    );
    if (!res.ok) {
      throw new Error(`anthropic HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { content?: { text?: string }[] };
    const content = data.content?.[0]?.text;
    if (!content) throw new Error('anthropic returned empty content');
    return content;
  }
}
