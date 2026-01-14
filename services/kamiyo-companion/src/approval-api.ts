/**
 * Approval API for autonomous posts
 * Simple HTTP endpoints to review and approve/reject posts
 */

import express, { Express } from 'express';
import cors from 'cors';
import { logger } from './logger';
import {
  getPendingPosts,
  getApprovedPosts,
  approvePost,
  rejectPost,
  getPostStats,
  QueuedPost,
} from './autonomous';
import { getRecentConversations } from './multi-agent';
import { getSentimentTrend, formatSentimentTrend } from './sentiment';

const app: Express = express();
app.use(cors());
app.use(express.json());

// Simple API key auth
const API_KEY = process.env.APPROVAL_API_KEY || 'dev-key';

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// Get pending posts
app.get('/api/posts/pending', authMiddleware, (_req, res) => {
  const posts = getPendingPosts();
  res.json({ posts });
});

// Get approved posts (ready to send)
app.get('/api/posts/approved', authMiddleware, (_req, res) => {
  const posts = getApprovedPosts();
  res.json({ posts });
});

// Get post stats
app.get('/api/posts/stats', authMiddleware, (_req, res) => {
  const stats = getPostStats();
  res.json(stats);
});

// Approve a post
app.post('/api/posts/:id/approve', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const success = approvePost(id);

  if (success) {
    logger.info('Post approved via API', { id });
    res.json({ success: true, id });
  } else {
    res.status(404).json({ error: 'Post not found or already processed' });
  }
});

// Reject a post
app.post('/api/posts/:id/reject', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const reason = req.body.reason || undefined;
  const success = rejectPost(id, reason);

  if (success) {
    logger.info('Post rejected via API', { id, reason });
    res.json({ success: true, id });
  } else {
    res.status(404).json({ error: 'Post not found or already processed' });
  }
});

// Bulk approve
app.post('/api/posts/bulk-approve', authMiddleware, (req, res) => {
  const ids: number[] = req.body.ids || [];
  const results: Array<{ id: number; success: boolean }> = [];

  for (const id of ids) {
    results.push({ id, success: approvePost(id) });
  }

  res.json({ results });
});

// Get recent multi-agent conversations
app.get('/api/conversations', authMiddleware, (_req, res) => {
  const conversations = getRecentConversations(20);
  res.json({ conversations });
});

// Get current sentiment
app.get('/api/sentiment', authMiddleware, (_req, res) => {
  const trend = getSentimentTrend();
  res.json({
    ...trend,
    formatted: formatSentimentTrend(trend),
  });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Dashboard HTML (simple approval UI)
app.get('/', authMiddleware, (_req, res) => {
  const posts = getPendingPosts();
  const stats = getPostStats();

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>KAMIYO Approval Queue</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #eee; }
    h1 { color: #00ff88; }
    .stats { display: flex; gap: 20px; margin-bottom: 20px; }
    .stat { background: #16213e; padding: 15px; border-radius: 8px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #00ff88; }
    .post { background: #16213e; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #00ff88; }
    .post-content { font-size: 18px; margin-bottom: 15px; white-space: pre-wrap; }
    .post-meta { color: #888; font-size: 12px; margin-bottom: 10px; }
    .buttons { display: flex; gap: 10px; }
    button { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; }
    .approve { background: #00ff88; color: #000; }
    .reject { background: #ff4444; color: #fff; }
    .empty { text-align: center; padding: 40px; color: #666; }
  </style>
</head>
<body>
  <h1>KAMIYO Approval Queue</h1>

  <div class="stats">
    <div class="stat"><div class="stat-value">${stats.pending}</div>Pending</div>
    <div class="stat"><div class="stat-value">${stats.approved}</div>Approved</div>
    <div class="stat"><div class="stat-value">${stats.posted}</div>Posted</div>
    <div class="stat"><div class="stat-value">${stats.rejected}</div>Rejected</div>
  </div>

  ${posts.length === 0 ? '<div class="empty">No pending posts</div>' : ''}

  ${posts.map((post: QueuedPost) => `
    <div class="post" id="post-${post.id}">
      <div class="post-meta">#${post.id} | ${post.post_type} | ${new Date(post.generated_at).toLocaleString()}</div>
      <div class="post-content">${escapeHtml(post.content)}</div>
      <div class="buttons">
        <button class="approve" onclick="approve(${post.id})">Approve</button>
        <button class="reject" onclick="reject(${post.id})">Reject</button>
      </div>
    </div>
  `).join('')}

  <script>
    const key = new URLSearchParams(window.location.search).get('key') || '';

    async function approve(id) {
      await fetch('/api/posts/' + id + '/approve?key=' + key, { method: 'POST' });
      document.getElementById('post-' + id).remove();
      location.reload();
    }

    async function reject(id) {
      await fetch('/api/posts/' + id + '/reject?key=' + key, { method: 'POST' });
      document.getElementById('post-' + id).remove();
      location.reload();
    }
  </script>
</body>
</html>
  `);
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function startApprovalServer(port: number = 3002): void {
  app.listen(port, () => {
    logger.info(`Approval API running on port ${port}`);
  });
}

export { app };
