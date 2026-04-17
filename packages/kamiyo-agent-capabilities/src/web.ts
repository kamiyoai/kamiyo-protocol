import { z } from 'zod';
import { defineTool, type Capability, type ToolDefinition } from '@kamiyo-org/agent';

export interface WebConfig {
  headless?: boolean;
  userAgent?: string;
  timeout?: number;
}

const browseSchema = z.object({
  url: z.string().url(),
  waitFor: z.string().optional(),
});

const scrapeSchema = z.object({
  url: z.string().url(),
  selector: z.string().optional(),
  format: z.enum(['text', 'html', 'markdown']).optional(),
});

const searchSchema = z.object({
  query: z.string(),
  maxResults: z.number().int().min(1).max(20).optional(),
});

interface PlaywrightModule {
  chromium: { launch(opts: { headless?: boolean }): Promise<Browser> };
}

interface Browser {
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

function loadPlaywright(): PlaywrightModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    return require('playwright') as PlaywrightModule;
  } catch {
    return null;
  }
}

export function webCapability(config: WebConfig = {}): Capability {
  let browser: Browser | null = null;

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'web_browse',
      description:
        'Browse a web page and return its text content. Requires playwright peer dependency for full rendering; falls back to fetch.',
      schema: browseSchema,
      category: 'web',
      handler: async input => {
        const pw = loadPlaywright();
        if (!pw) {
          const res = await fetch(input.url, {
            headers: { 'User-Agent': config.userAgent ?? 'KamiyoAgent/1.0' },
          });
          const html = await res.text();
          return stripHtml(html);
        }

        if (!browser) {
          browser = await pw.chromium.launch({ headless: config.headless ?? true });
        }
        const page = await browser.newPage();
        try {
          await page.goto(input.url, { timeout: config.timeout ?? 30_000 });
          if (input.waitFor)
            await page.waitForSelector(input.waitFor, { timeout: 5000 }).catch(() => {});
          return await page.evaluate('document.body.innerText');
        } finally {
          await page.close();
        }
      },
    }),
    defineTool({
      name: 'web_scrape',
      description: 'Scrape specific content from a web page using a CSS selector.',
      schema: scrapeSchema,
      category: 'web',
      handler: async input => {
        const res = await fetch(input.url, {
          headers: { 'User-Agent': config.userAgent ?? 'KamiyoAgent/1.0' },
        });
        const html = await res.text();

        if (!input.selector) {
          return input.format === 'html' ? html : stripHtml(html);
        }

        // CSS selector queries require playwright; fall back to plain text without it
        const pw = loadPlaywright();
        if (!pw) {
          return stripHtml(html);
        }

        if (!browser) {
          browser = await pw.chromium.launch({ headless: config.headless ?? true });
        }
        const page = await browser.newPage();
        try {
          await page.setContent(html);
          const elements = await page.$$eval(input.selector, (els: unknown[]) =>
            els.map(el => (el as { textContent?: string }).textContent?.trim() ?? '')
          );
          return JSON.stringify(elements);
        } finally {
          await page.close();
        }
      },
    }),
    defineTool({
      name: 'web_search',
      description: 'Search the web using DuckDuckGo HTML and return results. No API key needed.',
      schema: searchSchema,
      category: 'web',
      handler: async input => {
        const maxResults = input.maxResults ?? 5;
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': config.userAgent ?? 'KamiyoAgent/1.0' },
        });
        const html = await res.text();
        // extract result snippets from DDG HTML
        const results = extractDdgResults(html, maxResults);
        return JSON.stringify(results);
      },
    }),
  ];

  return {
    name: 'web',
    description: 'Web browsing, scraping, and search tools',
    tools,
    async teardown() {
      if (browser) {
        await browser.close();
        browser = null;
      }
    },
  };
}

interface Page {
  goto(url: string, opts?: { timeout?: number }): Promise<void>;
  close(): Promise<void>;
  evaluate(fn: string | (() => string)): Promise<string>;
  setContent(html: string): Promise<void>;
  $$eval(selector: string, fn: (els: unknown[]) => string[]): Promise<string[]>;
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<void>;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10_000);
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function extractDdgResults(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = [];
  // DDG HTML results are in .result__body divs
  const regex =
    /class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<[\s\S]*?class="result__snippet"[^>]*>([^<]*)</g;
  let match;
  while ((match = regex.exec(html)) !== null && results.length < max) {
    results.push({
      url: decodeURIComponent(match[1].replace(/.*uddg=/, '').replace(/&.*/, '')),
      title: match[2].trim(),
      snippet: match[3].trim(),
    });
  }
  return results;
}
