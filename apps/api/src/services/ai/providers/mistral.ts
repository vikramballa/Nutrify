import { OpenAICompatibleProvider } from './openaiCompatible.js';

export class MistralProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      name: 'mistral',
      baseURL: 'https://api.mistral.ai/v1',
      apiKeyEnv: 'MISTRAL_API_KEY',
      modelEnv: 'MISTRAL_MODEL',
      defaultModel: 'mistral-small-latest',
    });
  }
}
