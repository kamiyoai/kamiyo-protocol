import axios from 'axios';
import { logger } from '../utils/logger.js';

interface DataSource {
  name: string;
  url: string;
  priority: number;
  healthy: boolean;
  failures: number;
  lastCheck: number;
}

interface ExploitData {
  protocol: string;
  chain: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  loss_usd: number;
  timestamp: string;
  description: string;
  attack_vector: string;
}

const DATA_SOURCES: DataSource[] = [
  {
    name: 'kamiyo_primary',
    url: 'https://api.kamiyo.ai',
    priority: 1,
    healthy: true,
    failures: 0,
    lastCheck: Date.now(),
  },
];

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 60000;
const REQUEST_TIMEOUT = 10000;

export class DataService {
  private cache = new Map<string, { data: ExploitData[]; timestamp: number }>();
  private CACHE_TTL = 300000; // 5 minutes

  async fetchExploits(
    protocol?: string,
    chain?: string
  ): Promise<ExploitData[]> {
    const cacheKey = `exploits:${protocol || 'all'}:${chain || 'all'}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.debug('Cache hit', { cacheKey });
      return cached.data;
    }

    for (const source of this.getSortedSources()) {
      if (!this.isSourceHealthy(source)) {
        continue;
      }

      try {
        const startTime = Date.now();
        const data = await this.fetchFromSource(source, protocol, chain);
        const duration = Date.now() - startTime;

        source.healthy = true;
        source.failures = 0;
        source.lastCheck = Date.now();

        this.cache.set(cacheKey, { data, timestamp: Date.now() });

        logger.dataFetch(source.name, true, data.length, duration);

        return data;
      } catch (error) {
        this.handleSourceFailure(source, error);

        if (source === DATA_SOURCES[DATA_SOURCES.length - 1]) {
          throw error;
        }

        logger.warn(`Failing over from ${source.name}`, {
          error: (error as Error).message,
        });
      }
    }

    throw new Error('All data sources unavailable');
  }

  private async fetchFromSource(
    source: DataSource,
    protocol?: string,
    chain?: string
  ): Promise<ExploitData[]> {
    const params: Record<string, any> = {
      limit: 100,
      sort_by: 'timestamp',
      order: 'desc',
    };

    if (protocol) params.protocol = protocol;
    if (chain) params.chain = chain;

    const response = await axios.get(`${source.url}/exploits`, {
      params,
      timeout: REQUEST_TIMEOUT,
      headers: {
        'User-Agent': 'KAMIYO-Security-Oracle/2.0',
        Accept: 'application/json',
      },
    });

    if (!response.data || !response.data.exploits) {
      throw new Error('Invalid response format from data source');
    }

    return response.data.exploits;
  }

  private getSortedSources(): DataSource[] {
    return [...DATA_SOURCES].sort((a, b) => {
      if (a.healthy && !b.healthy) return -1;
      if (!a.healthy && b.healthy) return 1;
      return a.priority - b.priority;
    });
  }

  private isSourceHealthy(source: DataSource): boolean {
    if (source.healthy) return true;

    const timeSinceLastCheck = Date.now() - source.lastCheck;
    if (timeSinceLastCheck > CIRCUIT_BREAKER_TIMEOUT) {
      logger.info(`Attempting to recover source: ${source.name}`);
      source.healthy = true;
      source.failures = 0;
      return true;
    }

    return false;
  }

  private handleSourceFailure(source: DataSource, error: unknown): void {
    source.failures++;
    source.lastCheck = Date.now();

    logger.error(`Data source failure: ${source.name}`, error, {
      failures: source.failures,
      threshold: CIRCUIT_BREAKER_THRESHOLD,
    });

    if (source.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      source.healthy = false;
      logger.warn(`Circuit breaker opened for: ${source.name}`, {
        failures: source.failures,
        nextRetry: new Date(Date.now() + CIRCUIT_BREAKER_TIMEOUT).toISOString(),
      });
    }
  }

  getSourcesHealth() {
    return DATA_SOURCES.map((source) => ({
      name: source.name,
      healthy: source.healthy,
      failures: source.failures,
    }));
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('Data cache cleared');
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      ttl: this.CACHE_TTL,
    };
  }
}

export const dataService = new DataService();
