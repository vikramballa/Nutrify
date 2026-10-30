import { OpenAICompatibleProvider } from './openaiCompatible.js';

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      name: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      modelEnv: 'OPENROUTER_MODEL',
      defaultModel: 'openai/gpt-4o-mini',
    });
  }
}
