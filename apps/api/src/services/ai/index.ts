import { AllProvidersFailedError, type AIProvider, type CompleteOpts } from './types.js';
import { OllamaProvider, OllamaVisionProvider } from './providers/ollama.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { MistralProvider } from './providers/mistral.js';
import { KimiProvider } from './providers/kimi.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { ZaiProvider } from './providers/zai.js';

const REGISTRY: Record<string, AIProvider> = {
  ollama: new OllamaProvider(),
  'ollama-vision': new OllamaVisionProvider(),
  zai: new ZaiProvider(),
  gemini: new GeminiProvider(),
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  mistral: new MistralProvider(),
  kimi: new KimiProvider(),
  openrouter: new OpenRouterProvider(),
};

// Ollama leads: gpt-oss:120b-cloud is free, needs no API key, and beats the
// hosted free tiers on both quality and latency for this workload.
const DEFAULT_ORDER =
  'ollama,ollama-vision,zai,gemini,openai,anthropic,mistral,kimi,openrouter';

/** Ordered, configured providers per AI_PROVIDER_ORDER. */
export function activeProviders(): AIProvider[] {
  const order = (process.env.AI_PROVIDER_ORDER || DEFAULT_ORDER)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return order
    .map((name) => REGISTRY[name])
    .filter((p): p is AIProvider => Boolean(p) && p.isConfigured());
}

export function activeProviderNames(): string[] {
  return activeProviders().map((p) => p.name);
}

/** Configured providers whose model can read images. */
export function visionProviders(): AIProvider[] {
  return activeProviders().filter((p) => p.vision === true);
}

export class NoVisionProviderError extends Error {
  constructor() {
    super('No vision-capable AI provider is configured');
    this.name = 'NoVisionProviderError';
  }
}

export interface AIResult {
  content: string;
  provider: string;
}

/**
 * Try each configured provider in order. First success wins.
 * All fail => AllProvidersFailedError.
 */
export async function aiComplete(opts: CompleteOpts): Promise<AIResult> {
  // An image only reaches providers that can actually see it; the rest would
  // silently answer from the text alone, which is worse than failing over.
  const providers = opts.image ? visionProviders() : activeProviders();
  if (opts.image && providers.length === 0) throw new NoVisionProviderError();
  for (const provider of providers) {
    try {
      const content = await provider.complete(opts);
      return { content, provider: provider.name };
    } catch (err) {
      console.warn(`[ai] provider "${provider.name}" failed:`, (err as Error).message);
    }
  }
  throw new AllProvidersFailedError();
}

export { AllProvidersFailedError };
