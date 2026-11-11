import { OpenAICompatibleProvider } from './openaiCompatible.js';

export class OpenAIProvider extends OpenAICompatibleProvider {
  // gpt-4o-mini (and every gpt-4o/4.1/5 model) reads images, so meal-photo and
  // label scans can fall back here when the Ollama vision model is down.
  readonly vision = true;

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
