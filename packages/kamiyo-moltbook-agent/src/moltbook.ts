import type { MoltbookPost, MoltbookComment, MoltbookSearchResult } from './types.js';

const BASE_URL = 'https://www.moltbook.com/api/v1';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export class MoltbookClient {
  private commentCount = 0;
  private commentWindowStart = Date.now();

  constructor(private apiKey: string) {
    if (!apiKey || !apiKey.startsWith('moltbook_')) {
      throw new Error('Invalid Moltbook API key format');
    }
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          ...options,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.status === 429) {
          lastError = new Error('Rate limited');
          continue;
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Moltbook API error ${res.status}: ${body.slice(0, 200)}`);
        }

        return res.json();
      } catch (err) {
        clearTimeout(timeout);
        lastError = err instanceof Error ? err : new Error('Request failed');
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new Error('Request timeout');
        }
      }
    }

    throw lastError ?? new Error('Request failed');
  }

  // Search endpoint is broken (500), use feed scanning instead
  async search(_query: string, _limit = 50): Promise<MoltbookSearchResult> {
    // Fallback: scan feed for matching posts
    const posts = await this.getFeed('new', 50);
    return { posts, agents: [], submolts: [] };
  }

  async searchJobs(keywords: string[]): Promise<MoltbookPost[]> {
    // Search is broken, scan recent posts for keywords instead
    const posts = await this.getFeed('new', 50);
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    return posts.filter(post => {
      const text = `${post.title} ${post.body || ''}`.toLowerCase();
      return lowerKeywords.some(kw => text.includes(kw));
    });
  }

  private normalizeAuthor(author: unknown): string {
    if (typeof author === 'object' && author !== null) {
      return (author as { name?: string }).name ?? '';
    }
    return String(author ?? '');
  }

  private normalizePost(post: MoltbookPost): MoltbookPost {
    const author = this.normalizeAuthor(post.author);
    const comments = post.comments?.map(c => ({
      ...c,
      author: this.normalizeAuthor(c.author),
    }));
    return { ...post, author, comments };
  }

  async getPost(postId: string): Promise<MoltbookPost> {
    const post = await this.request<MoltbookPost>(`/posts/${postId}`);
    return this.normalizePost(post);
  }

  async getComments(postId: string): Promise<MoltbookComment[]> {
    const post = await this.getPost(postId);
    return post.comments || [];
  }

  async getFeed(sort: 'hot' | 'new' | 'top' = 'new', limit = 25): Promise<MoltbookPost[]> {
    const result = await this.request<{ posts: MoltbookPost[] }>(
      `/posts?sort=${sort}&limit=${limit}`
    );
    return (result.posts || []).map(p => this.normalizePost(p));
  }

  private checkCommentRateLimit(): void {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    if (now - this.commentWindowStart > hourMs) {
      this.commentCount = 0;
      this.commentWindowStart = now;
    }

    if (this.commentCount >= 45) {
      throw new Error('Comment rate limit approaching (45/50 per hour)');
    }
  }

  async comment(postId: string, content: string): Promise<void> {
    if (!postId || !/^[a-zA-Z0-9_-]+$/.test(postId)) {
      throw new Error('Invalid post ID');
    }
    if (!content || content.length > 10000) {
      throw new Error('Comment must be 1-10000 characters');
    }

    this.checkCommentRateLimit();

    await this.request(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });

    this.commentCount++;
  }

  async reply(commentId: string, content: string): Promise<void> {
    if (!commentId || !/^[a-zA-Z0-9_-]+$/.test(commentId)) {
      throw new Error('Invalid comment ID');
    }
    if (!content || content.length > 10000) {
      throw new Error('Reply must be 1-10000 characters');
    }

    this.checkCommentRateLimit();

    await this.request(`/comments/${commentId}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });

    this.commentCount++;
  }

  async upvote(postId: string): Promise<void> {
    await this.request(`/posts/${postId}/upvote`, { method: 'POST' });
  }

  async deletePost(postId: string): Promise<void> {
    await this.request(`/posts/${postId}`, { method: 'DELETE' });
  }

  async updatePost(postId: string, params: { title?: string; body?: string }): Promise<void> {
    const payload: Record<string, string> = {};
    if (params.title) payload.title = params.title;
    if (params.body) payload.content = params.body;

    await this.request(`/posts/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async getAgentStatus(): Promise<{ status: string; claimed: boolean; name?: string }> {
    const result = await this.request<{ success: boolean; status: string; agent?: { name: string } }>('/agents/status');
    return {
      status: result.status,
      claimed: result.status === 'claimed',
      name: result.agent?.name,
    };
  }

  private postCount = 0;
  private postWindowStart = Date.now();

  private checkPostRateLimit(): void {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    if (now - this.postWindowStart > hourMs) {
      this.postCount = 0;
      this.postWindowStart = now;
    }

    // Moltbook allows ~2 posts per hour for agents
    if (this.postCount >= 2) {
      throw new Error('Post rate limit reached (2/hour)');
    }
  }

  async createPost(params: {
    title: string;
    body: string;
    submolt: string;
  }): Promise<{ postId: string; url: string }> {
    if (!params.title || params.title.length > 300) {
      throw new Error('Title must be 1-300 characters');
    }
    if (!params.body || params.body.length > 40000) {
      throw new Error('Body must be 1-40000 characters');
    }
    if (!params.submolt || !/^[a-zA-Z0-9/_-]+$/.test(params.submolt)) {
      throw new Error('Invalid submolt format');
    }

    this.checkPostRateLimit();

    const result = await this.request<{ id: string; url: string }>('/posts', {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        content: params.body,
        submolt: params.submolt,
      }),
    });

    this.postCount++;

    return {
      postId: result.id,
      url: result.url || `https://www.moltbook.com/p/${result.id}`,
    };
  }

  async getMentions(_since?: number): Promise<MoltbookComment[]> {
    // Mentions endpoint is 404 - return empty for now
    // Actual mention scanning happens in agent.ts via scanOwnPostsForMentions()
    return [];
  }

  async getSubmoltPosts(submolt: string, sort: 'hot' | 'new' | 'top' = 'new', limit = 50): Promise<MoltbookPost[]> {
    if (!submolt || !/^[a-zA-Z0-9/_-]+$/.test(submolt)) {
      throw new Error('Invalid submolt format');
    }

    const result = await this.request<{ posts: MoltbookPost[] }>(
      `/posts?submolt=${encodeURIComponent(submolt)}&sort=${sort}&limit=${limit}`
    );
    return (result.posts || []).map(p => this.normalizePost(p));
  }

  async getAgentProfile(handle: string): Promise<{
    handle: string;
    description: string;
    reputation?: number;
    postCount: number;
    joinedAt: string;
  } | null> {
    if (!handle || !/^[a-zA-Z0-9_-]+$/.test(handle)) {
      return null;
    }

    try {
      return await this.request(`/agents/${handle}`);
    } catch {
      return null;
    }
  }
}
