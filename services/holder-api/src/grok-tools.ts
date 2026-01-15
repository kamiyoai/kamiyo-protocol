import OpenAI from 'openai';
import { logger } from './logger.js';
import { grokClient } from './clients.js';

const X_SEARCH_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'x_search',
    description: 'Search for posts on X (Twitter) with filters',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for X posts',
        },
        from_date: {
          type: 'string',
          description: 'Start date in ISO format (YYYY-MM-DD)',
        },
        to_date: {
          type: 'string',
          description: 'End date in ISO format (YYYY-MM-DD)',
        },
        included_x_handles: {
          type: 'array',
          items: { type: 'string' },
          description: 'X handles to include (without @)',
        },
        excluded_x_handles: {
          type: 'array',
          items: { type: 'string' },
          description: 'X handles to exclude (without @)',
        },
        post_favorite_count: {
          type: 'number',
          description: 'Minimum like count filter',
        },
        post_retweet_count: {
          type: 'number',
          description: 'Minimum retweet count filter',
        },
      },
      required: ['query'],
    },
  },
};

const WEB_SEARCH_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web for information',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Web search query',
        },
        allowed_domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Domains to restrict search to',
        },
        blocked_domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Domains to exclude from search',
        },
      },
      required: ['query'],
    },
  },
};

export interface GrokSearchOptions {
  xHandles?: string[];
  excludeHandles?: string[];
  minLikes?: number;
  minRetweets?: number;
  fromDate?: string;
  toDate?: string;
  webDomains?: string[];
  excludeDomains?: string[];
}

export interface GrokSearchResult {
  content: string;
  toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
}

export async function searchWithTools(
  query: string,
  options: GrokSearchOptions = {}
): Promise<GrokSearchResult | null> {
  if (!grokClient) {
    logger.warn('Grok client not available for search');
    return null;
  }

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [X_SEARCH_TOOL];
  if (options.webDomains || options.excludeDomains) {
    tools.push(WEB_SEARCH_TOOL);
  }

  try {
    const response = await grokClient.chat.completions.create({
      model: 'grok-3',
      messages: [
        {
          role: 'user',
          content: query,
        },
      ],
      tools,
      tool_choice: 'auto',
    });

    const message = response.choices[0]?.message;
    if (!message) return null;

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolNames = message.tool_calls
        .filter(
          (
            tc
          ): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
            function: { name: string };
          } => 'function' in tc && tc.function != null
        )
        .map((tc) => tc.function.name);
      logger.debug('Grok tool calls', { count: message.tool_calls.length, tools: toolNames });
    }

    return {
      content: message.content || '',
      toolCalls: message.tool_calls,
    };
  } catch (err) {
    logger.error('Grok search failed', { error: String(err) });
    return null;
  }
}

export async function searchXTrends(categories: string[]): Promise<string | null> {
  const query = `What are the top trending topics on X right now in these categories:
${categories.map((c, i) => `${i + 1}. ${c}`).join('\n')}

List the specific topics people are discussing, not generic categories.
Be concise - just list the trending topics with brief context.`;

  const result = await searchWithTools(query);
  return result?.content || null;
}

export async function searchXHandles(
  handles: string[],
  hoursAgo: number = 2
): Promise<string | null> {
  if (handles.length === 0) return null;

  const handleList = handles
    .slice(0, 10)
    .map((h) => `@${h}`)
    .join(', ');
  const query = `What have ${handleList} been tweeting about in the last ${hoursAgo} hours? Summarize the key topics and any notable tweets.`;

  const result = await searchWithTools(query, {
    xHandles: handles.slice(0, 10),
  });

  return result?.content || null;
}

export async function searchEngagementOpportunities(
  topics: string[],
  minLikes: number = 100
): Promise<string | null> {
  if (topics.length === 0) return null;

  const query = `Find high-engagement tweets from the last 4 hours about these topics: ${topics.join(', ')}.
Focus on tweets with substantial engagement that could benefit from thoughtful replies.`;

  const result = await searchWithTools(query, {
    minLikes,
  });

  return result?.content || null;
}

export function isGrokToolsAvailable(): boolean {
  return !!grokClient;
}
