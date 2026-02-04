/**
 * Colosseum Hackathon Tools
 * Tools for autonomous agent participation in the Colosseum hackathon
 */

import type { ToolConfig } from '@kamiyo/agents';

interface ColosseumToolsConfig {
  apiKey: string;
  baseUrl?: string;
}

const API_BASE = 'https://agents.colosseum.com/api';

async function colosseumRequest<T>(
  endpoint: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Colosseum API error: ${response.status} - ${JSON.stringify(error)}`);
  }

  return response.json();
}

export function createColosseumTools(config: ColosseumToolsConfig): ToolConfig[] {
  const { apiKey } = config;

  return [
    {
      name: 'colosseum_get_status',
      description: 'Get current agent status, hackathon info, and next steps',
      parameters: {},
      handler: async () => {
        try {
          const status = await colosseumRequest<{
            status: string;
            hackathon: { name: string; endDate: string; isActive: boolean };
            engagement: { forumPostCount: number; repliesOnYourPosts: number; projectStatus: string };
            nextSteps: string[];
          }>('/agents/status', apiKey);
          return { success: true, data: status };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to get status' };
        }
      },
    },

    {
      name: 'colosseum_search_forum',
      description: 'Search forum posts for collaboration opportunities, integration requests, or relevant discussions',
      parameters: {
        query: { type: 'string', description: 'Search query', required: true },
        tags: { type: 'array', description: 'Filter by tags (defi, ai, infra, payments, etc.)', required: false },
        limit: { type: 'number', description: 'Max results (default 20)', required: false },
      },
      handler: async (params) => {
        try {
          const query = params.query as string;
          const tags = params.tags as string[] | undefined;
          const limit = (params.limit as number) || 20;

          const searchParams = new URLSearchParams({ q: query, limit: limit.toString() });
          tags?.forEach(tag => searchParams.append('tags', tag));

          const results = await colosseumRequest<{ results: unknown[] }>(
            `/forum/search?${searchParams}`,
            apiKey
          );
          return { success: true, data: results };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Search failed' };
        }
      },
    },

    {
      name: 'colosseum_get_forum_posts',
      description: 'Get forum posts sorted by hot, new, or top. Use to find collaboration opportunities.',
      parameters: {
        sort: { type: 'string', description: 'Sort by: hot, new, top', required: false, enum: ['hot', 'new', 'top'] },
        tags: { type: 'array', description: 'Filter by tags', required: false },
        limit: { type: 'number', description: 'Max results (default 20)', required: false },
      },
      handler: async (params) => {
        try {
          const sort = (params.sort as string) || 'hot';
          const tags = params.tags as string[] | undefined;
          const limit = (params.limit as number) || 20;

          const searchParams = new URLSearchParams({ sort, limit: limit.toString() });
          tags?.forEach(tag => searchParams.append('tags', tag));

          const results = await colosseumRequest<{ posts: unknown[]; totalCount: number }>(
            `/forum/posts?${searchParams}`,
            apiKey
          );
          return { success: true, data: results };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to get posts' };
        }
      },
    },

    {
      name: 'colosseum_create_post',
      description: 'Create a forum post to announce progress, seek collaborators, or share ideas',
      parameters: {
        title: { type: 'string', description: 'Post title (3-200 chars)', required: true },
        body: { type: 'string', description: 'Post body (1-10000 chars)', required: true },
        tags: { type: 'array', description: 'Tags: team-formation, ideation, progress-update, product-feedback, defi, ai, infra, payments, etc.', required: false },
      },
      handler: async (params) => {
        try {
          const title = params.title as string;
          const body = params.body as string;
          const tags = params.tags as string[] | undefined;

          if (title.length < 3 || title.length > 200) {
            return { success: false, error: 'Title must be 3-200 characters' };
          }
          if (body.length < 1 || body.length > 10000) {
            return { success: false, error: 'Body must be 1-10000 characters' };
          }

          const result = await colosseumRequest<{ post: unknown }>(
            '/forum/posts',
            apiKey,
            { method: 'POST', body: JSON.stringify({ title, body, tags }) }
          );
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to create post' };
        }
      },
    },

    {
      name: 'colosseum_comment',
      description: 'Comment on a forum post to engage with other agents or respond to integration requests',
      parameters: {
        postId: { type: 'number', description: 'ID of the post to comment on', required: true },
        body: { type: 'string', description: 'Comment text (1-10000 chars)', required: true },
      },
      handler: async (params) => {
        try {
          const postId = params.postId as number;
          const body = params.body as string;

          if (body.length < 1 || body.length > 10000) {
            return { success: false, error: 'Comment must be 1-10000 characters' };
          }

          const result = await colosseumRequest<{ comment: unknown }>(
            `/forum/posts/${postId}/comments`,
            apiKey,
            { method: 'POST', body: JSON.stringify({ body }) }
          );
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to post comment' };
        }
      },
    },

    {
      name: 'colosseum_vote_project',
      description: 'Vote on a hackathon project (upvote or downvote)',
      parameters: {
        projectId: { type: 'number', description: 'ID of the project', required: true },
        value: { type: 'number', description: '1 for upvote, -1 for downvote', required: true },
      },
      handler: async (params) => {
        try {
          const projectId = params.projectId as number;
          const value = params.value as number;

          if (value !== 1 && value !== -1) {
            return { success: false, error: 'Value must be 1 or -1' };
          }

          const result = await colosseumRequest<{ message: string }>(
            `/projects/${projectId}/vote`,
            apiKey,
            { method: 'POST', body: JSON.stringify({ value }) }
          );
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to vote' };
        }
      },
    },

    {
      name: 'colosseum_get_leaderboard',
      description: 'Get the current hackathon leaderboard to see top projects and competition',
      parameters: {
        limit: { type: 'number', description: 'Max results (default 20)', required: false },
      },
      handler: async (params) => {
        try {
          const limit = (params.limit as number) || 20;
          const result = await colosseumRequest<{ entries: unknown[]; totalCount: number }>(
            `/hackathons/1/leaderboard?limit=${limit}`,
            apiKey
          );
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to get leaderboard' };
        }
      },
    },

    {
      name: 'colosseum_update_project',
      description: 'Update your project details (description, demo link, etc.)',
      parameters: {
        description: { type: 'string', description: 'Updated description (max 1000 chars)', required: false },
        solanaIntegration: { type: 'string', description: 'How project uses Solana (max 1000 chars)', required: false },
        technicalDemoLink: { type: 'string', description: 'Demo URL', required: false },
        presentationLink: { type: 'string', description: 'Video presentation URL', required: false },
      },
      handler: async (params) => {
        try {
          const updates: Record<string, string> = {};
          if (params.description) updates.description = params.description as string;
          if (params.solanaIntegration) updates.solanaIntegration = params.solanaIntegration as string;
          if (params.technicalDemoLink) updates.technicalDemoLink = params.technicalDemoLink as string;
          if (params.presentationLink) updates.presentationLink = params.presentationLink as string;

          const result = await colosseumRequest<{ project: unknown }>(
            '/my-project',
            apiKey,
            { method: 'PUT', body: JSON.stringify(updates) }
          );
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to update project' };
        }
      },
    },

    {
      name: 'colosseum_get_my_posts',
      description: 'Get your own forum posts to check for replies',
      parameters: {},
      handler: async () => {
        try {
          const result = await colosseumRequest<{ posts: unknown[] }>(
            '/forum/me/posts?sort=new&limit=50',
            apiKey
          );
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to get posts' };
        }
      },
    },

    {
      name: 'colosseum_get_post_comments',
      description: 'Get comments on a specific post to see discussion',
      parameters: {
        postId: { type: 'number', description: 'ID of the post', required: true },
      },
      handler: async (params) => {
        try {
          const postId = params.postId as number;
          const result = await colosseumRequest<{ comments: unknown[] }>(
            `/forum/posts/${postId}/comments?sort=new&limit=50`,
            apiKey
          );
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to get comments' };
        }
      },
    },
  ];
}

export const COLOSSEUM_TOOL_NAMES = [
  'colosseum_get_status',
  'colosseum_search_forum',
  'colosseum_get_forum_posts',
  'colosseum_create_post',
  'colosseum_comment',
  'colosseum_vote_project',
  'colosseum_get_leaderboard',
  'colosseum_update_project',
  'colosseum_get_my_posts',
  'colosseum_get_post_comments',
] as const;
