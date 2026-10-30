import { fetchWithTimeout } from '../../../lib/http.js';
import type { AIProvider, CompleteOpts } from '../types.js';

const TIMEOUT_MS = 30_000;

/** `data:image/jpeg;base64,AAA...` → the inlineData part Gemini expects. */
function inlineImage(dataUrl: string): { inlineData: { mimeType: string; data: string } } | null {
  const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  // Every Gemini model this app would target (1.5/2.x flash & pro) is multimodal.
  readonly vision = true;

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  private model(): string {
    return process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  }

  async complete(opts: CompleteOpts): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model()}:generateContent`;
    const image = opts.image ? inlineImage(opts.image) : null;
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [
        { role: 'user', parts: [{ text: opts.user }, ...(image ? [image] : [])] },
      ],
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 1500,
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      },
    };

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        // Header, not ?key=: a URL ends up in proxy and error logs.
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY ?? '',
        },
        body: JSON.stringify(body),
      },
      TIMEOUT_MS,
    );
    if (!res.ok) {
      throw new Error(`gemini HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('gemini returned empty content');
    return content;
  }
}
