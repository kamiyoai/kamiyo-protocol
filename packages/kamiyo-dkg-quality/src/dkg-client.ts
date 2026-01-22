import type { UAL, QualityMetadata } from './types.js';
import type { DKGClientInterface } from './drag-quality.js';

export interface DKGClientConfig {
  endpoint: string;
  port?: number;
  blockchain?: {
    name: string;
    publicKey?: string;
    privateKey?: string;
  };
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

const DEFAULT_CONFIG: Partial<DKGClientConfig> = {
  port: 8900,
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,
};

export interface DKGLogger {
  debug: (msg: string, meta?: object) => void;
  info: (msg: string, meta?: object) => void;
  warn: (msg: string, meta?: object) => void;
  error: (msg: string, meta?: object) => void;
}

const noopLogger: DKGLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  delayMs: number,
  logger: DKGLogger
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(`DKG operation failed (attempt ${attempt}/${maxRetries})`, {
        error: lastError.message,
      });

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  throw lastError;
}

export class DKGClient implements DKGClientInterface {
  private client: any;
  private config: DKGClientConfig;
  private logger: DKGLogger;
  private initialized = false;

  constructor(config: DKGClientConfig, logger?: DKGLogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger || noopLogger;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to avoid bundling issues
      const DKG = await import('dkg.js');
      const DKGClient = DKG.default || DKG;

      this.client = new DKGClient({
        endpoint: this.config.endpoint,
        port: this.config.port,
        blockchain: this.config.blockchain,
        maxNumberOfRetries: this.config.maxRetries,
      });

      this.initialized = true;
      this.logger.info('DKG client initialized', { endpoint: this.config.endpoint });
    } catch (err) {
      this.logger.error('Failed to initialize DKG client', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error(`DKG initialization failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  async query(sparql: string): Promise<unknown[]> {
    await this.ensureInitialized();

    return withRetry(
      async () => {
        this.logger.debug('Executing SPARQL query', { sparql: sparql.slice(0, 100) });

        const result = await this.client.graph.query(sparql, 'SELECT');

        if (!result || !Array.isArray(result.data)) {
          return [];
        }

        return result.data;
      },
      this.config.maxRetries!,
      this.config.retryDelayMs!,
      this.logger
    );
  }

  async get(ual: UAL): Promise<{ content: unknown; metadata?: Record<string, unknown> }> {
    await this.ensureInitialized();

    return withRetry(
      async () => {
        this.logger.debug('Getting asset', { ual });

        const result = await this.client.asset.get(ual);

        return {
          content: result?.public?.assertion || result?.assertion || {},
          metadata: result?.public?.metadata || result?.metadata || {},
        };
      },
      this.config.maxRetries!,
      this.config.retryDelayMs!,
      this.logger
    );
  }

  async update(ual: UAL, data: Record<string, unknown>): Promise<void> {
    await this.ensureInitialized();

    return withRetry(
      async () => {
        this.logger.debug('Updating asset', { ual, keys: Object.keys(data) });

        await this.client.asset.update(ual, {
          public: data,
        });
      },
      this.config.maxRetries!,
      this.config.retryDelayMs!,
      this.logger
    );
  }

  async publish(
    content: object,
    options?: { epochs?: number; tokenAmount?: number }
  ): Promise<string> {
    await this.ensureInitialized();

    return withRetry(
      async () => {
        this.logger.info('Publishing asset', {
          contentKeys: Object.keys(content),
          epochs: options?.epochs,
        });

        const result = await this.client.asset.create(
          {
            public: content,
          },
          {
            epochs: options?.epochs || 2,
            tokenAmount: options?.tokenAmount,
          }
        );

        const ual = result?.UAL;
        if (!ual) {
          throw new Error('No UAL returned from DKG publish');
        }

        this.logger.info('Asset published', { ual });
        return ual;
      },
      this.config.maxRetries!,
      this.config.retryDelayMs!,
      this.logger
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const info = await this.client.node.info();
      return !!info;
    } catch {
      return false;
    }
  }
}

export class MockDKGClient implements DKGClientInterface {
  private assets = new Map<string, { content: unknown; metadata: Record<string, unknown> }>();
  private counter = 0;

  async query(_sparql: string): Promise<unknown[]> {
    return Array.from(this.assets.entries()).map(([ual, asset]) => ({
      '@id': ual,
      ...(typeof asset.content === 'object' && asset.content !== null ? asset.content : {}),
    }));
  }

  async get(ual: UAL): Promise<{ content: unknown; metadata?: Record<string, unknown> }> {
    const asset = this.assets.get(ual);
    if (!asset) {
      return { content: {}, metadata: {} };
    }
    return asset;
  }

  async update(ual: UAL, data: Record<string, unknown>): Promise<void> {
    const asset = this.assets.get(ual);
    if (asset) {
      asset.metadata = { ...asset.metadata, ...data };
    }
  }

  async publish(content: object): Promise<string> {
    const ual = `did:dkg:otp/0xmock/${++this.counter}`;
    this.assets.set(ual, { content, metadata: {} });
    return ual;
  }

  setAsset(ual: UAL, content: unknown, metadata: Record<string, unknown> = {}): void {
    this.assets.set(ual, { content, metadata });
  }

  clear(): void {
    this.assets.clear();
    this.counter = 0;
  }
}

export function createDKGClient(
  config?: Partial<DKGClientConfig>,
  logger?: DKGLogger
): DKGClientInterface {
  const endpoint = config?.endpoint || process.env.DKG_ENDPOINT;

  if (!endpoint) {
    if (logger) {
      logger.warn('No DKG_ENDPOINT configured, using mock client');
    }
    return new MockDKGClient();
  }

  const fullConfig: DKGClientConfig = {
    endpoint,
    port: config?.port || parseInt(process.env.DKG_PORT || '8900'),
    blockchain: config?.blockchain || {
      name: process.env.DKG_BLOCKCHAIN || 'otp:20430',
      publicKey: process.env.DKG_PUBLIC_KEY,
      privateKey: process.env.DKG_PRIVATE_KEY,
    },
    maxRetries: config?.maxRetries,
    retryDelayMs: config?.retryDelayMs,
    timeoutMs: config?.timeoutMs,
  };

  return new DKGClient(fullConfig, logger);
}
