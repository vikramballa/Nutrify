import { OpenAICompatibleProvider } from './openaiCompatible.js';

/**
 * Z.ai (formerly Zhipu). GLM-4.7-Flash and GLM-4.5-Flash are free on their
 * open platform — free key at https://open.bigmodel.cn, rate limited to one
 * concurrent request. The GLM models on Ollama Cloud and OpenRouter are paid.
 */
export class ZaiProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      name: 'zai',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      apiKeyEnv: 'ZAI_API_KEY',
      modelEnv: 'ZAI_MODEL',
      defaultModel: 'glm-4.7-flash',
    });
  }
}
