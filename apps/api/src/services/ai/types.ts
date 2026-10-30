export interface CompleteOpts {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  /**
   * Full data URL of an image (`data:image/jpeg;base64,...`). Only providers
   * reporting `vision: true` receive it; the rest are skipped for that call.
   */
  image?: string;
}

export interface AIProvider {
  name: string;
  /** True when this provider's configured model can read images. */
  vision?: boolean;
  isConfigured(): boolean;
  /** Returns raw text; throws on failure. */
  complete(opts: CompleteOpts): Promise<string>;
}

export class AllProvidersFailedError extends Error {
  constructor() {
    super('All AI providers failed');
    this.name = 'AllProvidersFailedError';
  }
}
