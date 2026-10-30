import { OpenAICompatibleProvider } from './openaiCompatible.js';

/**
 * Ollama via its OpenAI-compatible endpoint — local models and, when signed in
 * with `ollama signin`, the hosted cloud models. No API key either way.
 *
 * Default is gemma4:31b-cloud — the same free-tier model used for vision, so
 * one Ollama cloud model handles both text (recipe generation, chat, coach)
 * and image (meal photo, nutrition label) requests. Set OLLAMA_MODEL to
 * override (e.g. `gemma4:e4b` to stay fully offline).
 */
const DEFAULT_MODEL = 'gemma4:31b-cloud';

/** Cloud round-trips are slower than localhost; 30s is not enough headroom. */
const CLOUD_TIMEOUT_MS = 90_000;

function baseRoot(): string {
  return process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
}

export class OllamaProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      name: 'ollama',
      baseURL: '', // resolved from env in baseURL()
      apiKeyEnv: 'OLLAMA_API_KEY',
      modelEnv: 'OLLAMA_MODEL',
      defaultModel: DEFAULT_MODEL,
      timeoutMs: CLOUD_TIMEOUT_MS,
      // gpt-oss thinks before answering; "low" keeps latency near 5s and is
      // plenty for recipe/nutrition work. Ignored by non-reasoning models.
      extraBody: { reasoning_effort: 'low' },
    });
  }

  protected baseURL(): string {
    return `${baseRoot()}/v1`;
  }

  protected headers(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  // Configured when a base URL or model env is present (no API key needed).
  // A closed port fails fast (ECONNREFUSED), so the chain falls through quickly.
  isConfigured(): boolean {
    return Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL);
  }
}

/**
 * Same endpoint, different model: the text model of choice (gpt-oss) is blind,
 * so photo analysis routes to a multimodal one. gemma4:31b-cloud is free and
 * reads a meal photo in ~2.5s.
 */
export class OllamaVisionProvider extends OpenAICompatibleProvider {
  readonly vision = true;

  constructor() {
    super({
      name: 'ollama-vision',
      baseURL: '',
      apiKeyEnv: 'OLLAMA_API_KEY',
      modelEnv: 'OLLAMA_VISION_MODEL',
      defaultModel: 'gemma4:31b-cloud',
      timeoutMs: CLOUD_TIMEOUT_MS,
    });
  }

  protected baseURL(): string {
    return `${baseRoot()}/v1`;
  }

  protected headers(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  isConfigured(): boolean {
    return Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_VISION_MODEL);
  }
}
