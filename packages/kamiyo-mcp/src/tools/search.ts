export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  success: boolean;
  results?: SearchResult[];
  error?: string;
}

const SEARXNG_INSTANCES = [
  'https://searx.be',
  'https://search.bus-hit.me',
  'https://searx.tiekoetter.com',
];

const VALID_ENGINES = ['google', 'bing', 'duckduckgo', 'wikipedia', 'brave'];
const MAX_QUERY_LENGTH = 500;
const MAX_RESULTS = 20;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_HTML_SIZE = 2 * 1024 * 1024; // 2MB

let currentInstanceIndex = 0;

function getNextInstance(): string {
  const instance = SEARXNG_INSTANCES[currentInstanceIndex];
  currentInstanceIndex = (currentInstanceIndex + 1) % SEARXNG_INSTANCES.length;
  return instance;
}

function isValidHttpUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://');
}

function sanitizeQuery(query: string): string {
  if (typeof query !== 'string') return '';
  return query.slice(0, MAX_QUERY_LENGTH).replace(/[\x00-\x1F\x7F]/g, '').trim();
}

export async function webSearch(args: {
  query: string;
  limit?: number;
  engines?: string[];
}): Promise<SearchResponse> {
  const { limit = 5, engines } = args;

  // Validate and sanitize query
  const query = sanitizeQuery(args.query);
  if (!query) {
    return { success: false, error: 'Query is required' };
  }

  // Validate limit
  const safeLimit = Math.min(Math.max(1, limit || 5), MAX_RESULTS);

  // Validate engines
  if (engines && engines.length > 0) {
    const invalidEngines = engines.filter((e) => !VALID_ENGINES.includes(e));
    if (invalidEngines.length > 0) {
      return { success: false, error: `Invalid engines: ${invalidEngines.join(', ')}` };
    }
  }

  // Try SearXNG instances
  for (let attempt = 0; attempt < SEARXNG_INSTANCES.length; attempt++) {
    const instance = getNextInstance();

    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        language: 'en',
      });

      if (engines && engines.length > 0) {
        params.set('engines', engines.join(','));
      }

      const response = await fetch(`${instance}/search?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'KAMIYO-MCP/1.0',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as {
        results?: Array<{
          title: string;
          url: string;
          content: string;
        }>;
      };

      if (data.results && data.results.length > 0) {
        const results: SearchResult[] = data.results
          .filter((r) => r.url && isValidHttpUrl(r.url))
          .slice(0, safeLimit)
          .map((r) => ({
            title: (r.title || '').slice(0, 200),
            url: r.url,
            snippet: (r.content || '').slice(0, 300),
          }));

        return { success: true, results };
      }
    } catch {
      // Try next instance
      continue;
    }
  }

  // Fallback: DuckDuckGo HTML API (limited but works)
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KAMIYO-MCP/1.0)',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.ok) {
      // Check content length before reading
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_HTML_SIZE) {
        return { success: false, error: 'Response too large' };
      }

      const html = await response.text();
      if (html.length > MAX_HTML_SIZE) {
        return { success: false, error: 'Response too large' };
      }

      const results = parseDuckDuckGoResults(html, safeLimit);
      if (results.length > 0) {
        return { success: true, results };
      }
    }
  } catch {
    // Fall through to error
  }

  return { success: false, error: 'Search failed - all providers unavailable' };
}

function parseDuckDuckGoResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  const resultPattern = new RegExp(
    /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/g
  );
  let match;

  while ((match = resultPattern.exec(html)) !== null && results.length < limit) {
    const url = match[1];
    const title = (match[2] || '').trim().slice(0, 200);
    const snippet = (match[3] || '').trim().slice(0, 300);

    if (url && title && isValidHttpUrl(url) && !url.includes('duckduckgo.com')) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

export async function cryptoNewsSearch(args: {
  query?: string;
  limit?: number;
}): Promise<SearchResponse> {
  const { query = 'cryptocurrency', limit = 5 } = args;

  return webSearch({
    query: `${query} site:coindesk.com OR site:cointelegraph.com OR site:theblock.co OR site:decrypt.co`,
    limit,
    engines: ['google', 'bing'],
  });
}

export const SEARCH_TOOL_DEFINITIONS = [
  {
    name: 'web_search',
    description: 'Search the web for information',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 5)' },
        engines: {
          type: 'array',
          items: { type: 'string' },
          description: 'Search engines to use (google, bing, duckduckgo)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'crypto_news',
    description: 'Search for cryptocurrency news from trusted sources',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search topic (default: cryptocurrency)' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
    },
  },
];

export async function handleSearchTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (name === 'web_search') {
    return webSearch(args as { query: string; limit?: number; engines?: string[] });
  }
  if (name === 'crypto_news') {
    return cryptoNewsSearch(args as { query?: string; limit?: number });
  }
  return { success: false, error: `Unknown search tool: ${name}` };
}
