import { OpenAICompatibleProvider } from './openaiCompatible.js';

export class KimiProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      name: 'kimi',
      baseURL: 'https://api.moonshot.ai/v1',
      apiKeyEnv: 'KIMI_API_KEY',
      modelEnv: 'KIMI_MODEL',
      defaultModel: 'moonshot-v1-8k',
    });
  }
}
