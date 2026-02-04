import { env, COLOSSEUM_API_BASE } from './config.js';

interface AgentStatus {
  status: 'pending_claim' | 'claimed' | 'suspended';
  hackathon: {
    name: string;
    endDate: string;
    isActive: boolean;
  };
  engagement: {
    forumPostCount: number;
    repliesOnYourPosts: number;
    projectStatus: 'none' | 'draft' | 'submitted';
  };
  nextSteps: string[];
}

interface ForumPost {
  id: number;
  agentId: number;
  agentName: string;
  title: string;
  body: string;
  upvotes: number;
  downvotes: number;
  score: number;
  commentCount: number;
  tags: string[];
  createdAt: string;
}

interface Project {
  id: number;
  name: string;
  slug: string;
  description: string;
  repoLink: string;
  solanaIntegration: string;
  status: 'draft' | 'submitted';
  humanUpvotes: number;
  agentUpvotes: number;
}

export class ColosseumClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.COLOSSEUM_API_KEY;
    this.baseUrl = COLOSSEUM_API_BASE;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Colosseum API error: ${response.status} - ${JSON.stringify(error)}`);
    }

    return response.json();
  }

  async getStatus(): Promise<AgentStatus> {
    return this.request<AgentStatus>('/agents/status');
  }

  async getForumPosts(options: {
    sort?: 'hot' | 'new' | 'top';
    tags?: string[];
    limit?: number;
    offset?: number;
  } = {}): Promise<{ posts: ForumPost[]; totalCount: number; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (options.sort) params.append('sort', options.sort);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    options.tags?.forEach(tag => params.append('tags', tag));

    return this.request(`/forum/posts?${params}`);
  }

  async createForumPost(post: {
    title: string;
    body: string;
    tags?: string[];
  }): Promise<{ post: ForumPost }> {
    return this.request('/forum/posts', {
      method: 'POST',
      body: JSON.stringify(post),
    });
  }

  async commentOnPost(postId: number, body: string): Promise<{ comment: unknown }> {
    return this.request(`/forum/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  async voteOnPost(postId: number, value: 1 | -1): Promise<void> {
    await this.request(`/forum/posts/${postId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    });
  }

  async voteOnProject(projectId: number, value: 1 | -1): Promise<void> {
    await this.request(`/projects/${projectId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    });
  }

  async getMyProject(): Promise<{ project: Project } | null> {
    try {
      return await this.request('/my-project');
    } catch {
      return null;
    }
  }

  async updateProject(updates: Partial<{
    description: string;
    solanaIntegration: string;
    technicalDemoLink: string;
    presentationLink: string;
  }>): Promise<{ project: Project }> {
    return this.request('/my-project', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async submitProject(): Promise<{ project: Project }> {
    return this.request('/my-project/submit', {
      method: 'POST',
    });
  }

  async getLeaderboard(limit = 20): Promise<{
    entries: Array<{
      rank: number;
      project: Project;
    }>;
    totalCount: number;
  }> {
    return this.request(`/hackathons/1/leaderboard?limit=${limit}`);
  }

  async searchForum(query: string, options: {
    sort?: 'hot' | 'new' | 'top';
    tags?: string[];
    limit?: number;
  } = {}): Promise<{ results: Array<ForumPost & { type: 'post' | 'comment' }> }> {
    const params = new URLSearchParams({ q: query });
    if (options.sort) params.append('sort', options.sort);
    if (options.limit) params.append('limit', options.limit.toString());
    options.tags?.forEach(tag => params.append('tags', tag));

    return this.request(`/forum/search?${params}`);
  }

  async getMyPosts(): Promise<{ posts: ForumPost[] }> {
    return this.request('/forum/me/posts?sort=new&limit=50');
  }

  async getPostComments(postId: number): Promise<{ comments: unknown[] }> {
    return this.request(`/forum/posts/${postId}/comments?sort=new&limit=50`);
  }
}

export const colosseum = new ColosseumClient();
