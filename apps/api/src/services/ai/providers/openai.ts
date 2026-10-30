import { OpenAICompatibleProvider } from './openaiCompatible.js';

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      name: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKeyEnv: 'OPENAI_API_KEY',
      modelEnv: 'OPENAI_MODEL',
      defaultModel: 'gpt-4o-mini',
    });
  }
}
