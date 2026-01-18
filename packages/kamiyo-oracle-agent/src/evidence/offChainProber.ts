import type {
  APIHealthResult,
  WebSearchResult,
  DomainInfo,
} from '../deliberation/types';
import { createLogger } from '../lib/logger';

const log = createLogger('off-chain-prober');

export interface OffChainEvidence {
  apiHealthCheck?: APIHealthResult;
  webSearch: WebSearchResult[];
  domainInfo?: DomainInfo;
  socialSignals: SocialSignal[];
}

export interface SocialSignal {
  platform: string;
  presence: boolean;
  followers?: number;
  accountAge?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export class OffChainProber {
  private tavilyApiKey?: string;

  constructor(tavilyApiKey?: string) {
    this.tavilyApiKey = tavilyApiKey;
  }

  async probe(
    serviceType: string,
    transactionId: string,
    providerPubkey: string,
    maxTimeMs = 15000
  ): Promise<OffChainEvidence> {
    const startTime = Date.now();

    log.info('Starting off-chain probing', { serviceType });

    const evidence: OffChainEvidence = {
      webSearch: [],
      socialSignals: [],
    };

    const tasks: Promise<void>[] = [];

    // Check if service type suggests an API endpoint
    if (serviceType === 'api_call' || serviceType === 'x402_payment') {
      tasks.push(
        this.checkAPIHealth(transactionId)
          .then((result) => {
            evidence.apiHealthCheck = result;
          })
          .catch(() => {})
      );
    }

    // Web search for provider reputation
    if (this.tavilyApiKey) {
      tasks.push(
        this.searchWeb(providerPubkey)
          .then((results) => {
            evidence.webSearch = results;
          })
          .catch(() => {})
      );
    }

    // Domain analysis if transaction ID looks like a URL
    if (transactionId.includes('.') || transactionId.includes('http')) {
      tasks.push(
        this.analyzeDomain(transactionId)
          .then((info) => {
            evidence.domainInfo = info;
          })
          .catch(() => {})
      );
    }

    // Wait for all tasks or timeout
    await Promise.race([
      Promise.all(tasks),
      new Promise((resolve) => setTimeout(resolve, maxTimeMs)),
    ]);

    log.info('Off-chain probing complete', {
      hasAPICheck: !!evidence.apiHealthCheck,
      searchResults: evidence.webSearch.length,
      timeMs: Date.now() - startTime,
    });

    return evidence;
  }

  private async checkAPIHealth(transactionId: string): Promise<APIHealthResult> {
    // Try to extract API endpoint from transaction ID
    const endpoint = this.extractEndpoint(transactionId);

    if (!endpoint) {
      return {
        endpoint: 'unknown',
        reachable: false,
        error: 'Could not determine endpoint from transaction ID',
      };
    }

    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(endpoint, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      return {
        endpoint,
        reachable: true,
        responseTimeMs: Date.now() - startTime,
        statusCode: response.status,
      };
    } catch (err) {
      return {
        endpoint,
        reachable: false,
        error: err instanceof Error ? err.message : 'Request failed',
      };
    }
  }

  private extractEndpoint(transactionId: string): string | null {
    // Common patterns:
    // - api-{domain}-{hash}
    // - x402-{domain}-{hash}
    // - https://...

    if (transactionId.startsWith('http')) {
      try {
        const url = new URL(transactionId);
        return url.origin;
      } catch {
        return null;
      }
    }

    // Try to extract domain from ID patterns
    const patterns = [
      /^api-([a-z0-9.-]+)-/i,
      /^x402-([a-z0-9.-]+)-/i,
      /https?:\/\/([a-z0-9.-]+)/i,
    ];

    for (const pattern of patterns) {
      const match = transactionId.match(pattern);
      if (match) {
        return `https://${match[1]}`;
      }
    }

    return null;
  }

  private async searchWeb(providerPubkey: string): Promise<WebSearchResult[]> {
    if (!this.tavilyApiKey) return [];

    try {
      const query = `Solana ${providerPubkey.slice(0, 12)} reputation reviews`;

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.tavilyApiKey}`,
        },
        body: JSON.stringify({
          query,
          max_results: 5,
          search_depth: 'basic',
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        log.warn('Tavily search failed', { status: response.status });
        return [];
      }

      const data = (await response.json()) as {
        results?: Array<{
          title: string;
          content: string;
          url: string;
          score: number;
        }>;
      };

      return (data.results || []).map((r) => ({
        title: r.title,
        snippet: r.content.slice(0, 200),
        url: r.url,
        relevance: r.score,
      }));
    } catch (err) {
      log.warn('Web search failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async analyzeDomain(identifier: string): Promise<DomainInfo | undefined> {
    const domain = this.extractDomain(identifier);
    if (!domain) return undefined;

    try {
      // Check SSL certificate
      const hasSSL = await this.checkSSL(domain);

      return {
        domain,
        hasSSL,
        // WHOIS data would require additional API
      };
    } catch {
      return {
        domain,
        hasSSL: false,
      };
    }
  }

  private extractDomain(identifier: string): string | null {
    try {
      if (identifier.startsWith('http')) {
        return new URL(identifier).hostname;
      }

      // Check if it looks like a domain
      const domainMatch = identifier.match(/([a-z0-9-]+\.[a-z]{2,})/i);
      return domainMatch ? domainMatch[1] : null;
    } catch {
      return null;
    }
  }

  private async checkSSL(domain: string): Promise<boolean> {
    try {
      const response = await fetch(`https://${domain}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok || response.status < 500;
    } catch {
      return false;
    }
  }
}
