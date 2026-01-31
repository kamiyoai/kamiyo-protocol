import Database from 'better-sqlite3';
import type {
  Offer,
  Job,
  OfferStatus,
  JobStatus,
  OwnPost,
  TrustEdge,
  ReputationProof,
  Badge,
  AgentJob,
} from './types.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS seen_posts (
  post_id TEXT PRIMARY KEY,
  seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL UNIQUE,
  price_sol REAL NOT NULL,
  offered_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL,
  requester_wallet TEXT NOT NULL,
  escrow_address TEXT,
  escrow_tx TEXT,
  amount_sol REAL NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  deliverable TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS own_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  submolt TEXT NOT NULL,
  category TEXT NOT NULL,
  topic TEXT NOT NULL,
  posted_at INTEGER NOT NULL,
  upvotes INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trust_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  trust_level INTEGER NOT NULL,
  trust_type TEXT NOT NULL,
  stake_sol REAL DEFAULT 0,
  ual TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reputation_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  tier INTEGER NOT NULL,
  nullifier_hash TEXT UNIQUE,
  proof_format TEXT NOT NULL,
  ual TEXT,
  moltbook_post_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  badge_id TEXT UNIQUE,
  agent_id TEXT NOT NULL,
  badge_type TEXT NOT NULL,
  tier INTEGER NOT NULL,
  ual TEXT,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS agent_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT UNIQUE,
  post_id TEXT,
  poster_agent TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  budget_sol REAL NOT NULL,
  capability TEXT NOT NULL,
  required_tier INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT,
  escrow_address TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id TEXT UNIQUE,
  post_id TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  processed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_own_posts_topic ON own_posts(topic);
CREATE INDEX IF NOT EXISTS idx_trust_edges_from ON trust_edges(from_agent);
CREATE INDEX IF NOT EXISTS idx_trust_edges_to ON trust_edges(to_agent);
CREATE INDEX IF NOT EXISTS idx_reputation_proofs_agent ON reputation_proofs(agent_id);
CREATE INDEX IF NOT EXISTS idx_badges_agent ON badges(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON agent_jobs(status);
CREATE INDEX IF NOT EXISTS idx_mentions_processed ON mentions(processed);
`;

export class JobDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    if (!dbPath || dbPath.includes('..')) {
      throw new Error('Invalid database path');
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // Seen posts
  hasSeenPost(postId: string): boolean {
    if (!postId || postId.length > 100) return false;
    const row = this.db.prepare('SELECT 1 FROM seen_posts WHERE post_id = ?').get(postId);
    return row !== undefined;
  }

  markSeen(postId: string): void {
    if (!postId || postId.length > 100) return;
    this.db
      .prepare('INSERT OR IGNORE INTO seen_posts (post_id, seen_at) VALUES (?, ?)')
      .run(postId, Date.now());
  }

  // Offers
  saveOffer(postId: string, priceSol: number): void {
    this.db
      .prepare('INSERT OR REPLACE INTO offers (post_id, price_sol, offered_at, status) VALUES (?, ?, ?, ?)')
      .run(postId, priceSol, Date.now(), 'pending');
  }

  getOffer(postId: string): Offer | null {
    const row = this.db.prepare('SELECT * FROM offers WHERE post_id = ?').get(postId) as {
      id: number;
      post_id: string;
      price_sol: number;
      offered_at: number;
      status: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      postId: row.post_id,
      priceSol: row.price_sol,
      offeredAt: row.offered_at,
      status: row.status as OfferStatus,
    };
  }

  getPendingOffers(): Offer[] {
    const rows = this.db.prepare('SELECT * FROM offers WHERE status = ?').all('pending') as Array<{
      id: number;
      post_id: string;
      price_sol: number;
      offered_at: number;
      status: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      postId: row.post_id,
      priceSol: row.price_sol,
      offeredAt: row.offered_at,
      status: row.status as OfferStatus,
    }));
  }

  updateOfferStatus(postId: string, status: OfferStatus): void {
    this.db.prepare('UPDATE offers SET status = ? WHERE post_id = ?').run(status, postId);
  }

  // Jobs
  createJob(params: {
    postId: string;
    requesterWallet: string;
    amountSol: number;
    description: string;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO jobs (post_id, requester_wallet, amount_sol, description, status, created_at)
         VALUES (?, ?, ?, ?, 'created', ?)`
      )
      .run(params.postId, params.requesterWallet, params.amountSol, params.description, Date.now());

    return result.lastInsertRowid as number;
  }

  getJob(id: number): Job | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as {
      id: number;
      post_id: string;
      requester_wallet: string;
      escrow_address: string | null;
      escrow_tx: string | null;
      amount_sol: number;
      description: string;
      status: string;
      deliverable: string | null;
      created_at: number;
      completed_at: number | null;
    } | undefined;

    if (!row) return null;

    return this.rowToJob(row);
  }

  getJobByPostId(postId: string): Job | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE post_id = ?').get(postId) as {
      id: number;
      post_id: string;
      requester_wallet: string;
      escrow_address: string | null;
      escrow_tx: string | null;
      amount_sol: number;
      description: string;
      status: string;
      deliverable: string | null;
      created_at: number;
      completed_at: number | null;
    } | undefined;

    if (!row) return null;

    return this.rowToJob(row);
  }

  getActiveJobs(): Job[] {
    const rows = this.db
      .prepare("SELECT * FROM jobs WHERE status IN ('created', 'in_progress')")
      .all() as Array<{
      id: number;
      post_id: string;
      requester_wallet: string;
      escrow_address: string | null;
      escrow_tx: string | null;
      amount_sol: number;
      description: string;
      status: string;
      deliverable: string | null;
      created_at: number;
      completed_at: number | null;
    }>;

    return rows.map((row) => this.rowToJob(row));
  }

  updateJobStatus(id: number, status: JobStatus): void {
    const completedAt = status === 'completed' ? Date.now() : null;
    this.db
      .prepare('UPDATE jobs SET status = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?')
      .run(status, completedAt, id);
  }

  setJobEscrow(id: number, escrowAddress: string, escrowTx: string): void {
    this.db
      .prepare('UPDATE jobs SET escrow_address = ?, escrow_tx = ?, status = ? WHERE id = ?')
      .run(escrowAddress, escrowTx, 'in_progress', id);
  }

  setJobDeliverable(id: number, deliverable: string): void {
    this.db
      .prepare('UPDATE jobs SET deliverable = ?, status = ? WHERE id = ?')
      .run(deliverable, 'delivered', id);
  }

  private rowToJob(row: {
    id: number;
    post_id: string;
    requester_wallet: string;
    escrow_address: string | null;
    escrow_tx: string | null;
    amount_sol: number;
    description: string;
    status: string;
    deliverable: string | null;
    created_at: number;
    completed_at: number | null;
  }): Job {
    return {
      id: row.id,
      postId: row.post_id,
      requesterWallet: row.requester_wallet,
      escrowAddress: row.escrow_address,
      escrowTx: row.escrow_tx,
      amountSol: row.amount_sol,
      description: row.description,
      status: row.status as JobStatus,
      deliverable: row.deliverable,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  // Own posts
  saveOwnPost(post: {
    postId: string;
    title: string;
    body: string;
    submolt: string;
    category: string;
    topic: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO own_posts (post_id, title, body, submolt, category, topic, posted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(post.postId, post.title, post.body, post.submolt, post.category, post.topic, Date.now());
  }

  getOwnPosts(limit = 50): OwnPost[] {
    const rows = this.db
      .prepare('SELECT * FROM own_posts ORDER BY posted_at DESC LIMIT ?')
      .all(limit) as Array<{
      id: number;
      post_id: string;
      title: string;
      body: string;
      submolt: string;
      category: string;
      topic: string;
      posted_at: number;
      upvotes: number;
      comment_count: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      postId: row.post_id,
      title: row.title,
      body: row.body,
      submolt: row.submolt,
      category: row.category,
      topic: row.topic,
      postedAt: row.posted_at,
      upvotes: row.upvotes,
      commentCount: row.comment_count,
    }));
  }

  updatePostEngagement(postId: string, upvotes: number, commentCount: number): void {
    this.db
      .prepare('UPDATE own_posts SET upvotes = ?, comment_count = ? WHERE post_id = ?')
      .run(upvotes, commentCount, postId);
  }

  getLastPostTime(): number {
    const row = this.db
      .prepare('SELECT MAX(posted_at) as last FROM own_posts')
      .get() as { last: number | null } | undefined;
    return row?.last ?? 0;
  }

  getPostsToday(): number {
    const dayMs = 24 * 60 * 60 * 1000;
    const today = Math.floor(Date.now() / dayMs) * dayMs;
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM own_posts WHERE posted_at >= ?')
      .get(today) as { count: number };
    return row.count;
  }

  // Trust edges
  saveTrustEdge(edge: {
    fromAgent: string;
    toAgent: string;
    trustLevel: number;
    trustType: 'vouches' | 'delegates' | 'endorses';
    stakeSol?: number;
    ual?: string;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO trust_edges (from_agent, to_agent, trust_level, trust_type, stake_sol, ual, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        edge.fromAgent,
        edge.toAgent,
        edge.trustLevel,
        edge.trustType,
        edge.stakeSol ?? 0,
        edge.ual ?? null,
        Date.now()
      );
    return result.lastInsertRowid as number;
  }

  getTrustEdges(agentId: string): TrustEdge[] {
    const rows = this.db
      .prepare('SELECT * FROM trust_edges WHERE from_agent = ? OR to_agent = ?')
      .all(agentId, agentId) as Array<{
      id: number;
      from_agent: string;
      to_agent: string;
      trust_level: number;
      trust_type: string;
      stake_sol: number;
      ual: string | null;
      created_at: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      fromAgent: row.from_agent,
      toAgent: row.to_agent,
      trustLevel: row.trust_level,
      trustType: row.trust_type as 'vouches' | 'delegates' | 'endorses',
      stakeSol: row.stake_sol,
      ual: row.ual,
      createdAt: row.created_at,
    }));
  }

  getTrustGraphSize(): number {
    const row = this.db
      .prepare('SELECT COUNT(DISTINCT from_agent) + COUNT(DISTINCT to_agent) as count FROM trust_edges')
      .get() as { count: number };
    return row.count;
  }

  // Reputation proofs
  saveReputationProof(proof: {
    agentId: string;
    tier: number;
    nullifierHash: string;
    proofFormat: 'solana' | 'evm';
    ual?: string;
    moltbookPostId?: string;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO reputation_proofs (agent_id, tier, nullifier_hash, proof_format, ual, moltbook_post_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        proof.agentId,
        proof.tier,
        proof.nullifierHash,
        proof.proofFormat,
        proof.ual ?? null,
        proof.moltbookPostId ?? null,
        Date.now()
      );
    return result.lastInsertRowid as number;
  }

  getReputationProof(agentId: string): ReputationProof | null {
    const row = this.db
      .prepare('SELECT * FROM reputation_proofs WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(agentId) as {
      id: number;
      agent_id: string;
      tier: number;
      nullifier_hash: string;
      proof_format: string;
      ual: string | null;
      moltbook_post_id: string | null;
      created_at: number;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      agentId: row.agent_id,
      tier: row.tier,
      nullifierHash: row.nullifier_hash,
      proofFormat: row.proof_format as 'solana' | 'evm',
      ual: row.ual,
      moltbookPostId: row.moltbook_post_id,
      createdAt: row.created_at,
    };
  }

  getVerificationCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM reputation_proofs')
      .get() as { count: number };
    return row.count;
  }

  hasNullifier(nullifierHash: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM reputation_proofs WHERE nullifier_hash = ?')
      .get(nullifierHash);
    return row !== undefined;
  }

  // Badges
  saveBadge(badge: {
    badgeId: string;
    agentId: string;
    badgeType: 'reputation-verified' | 'transaction-count' | 'dispute-free';
    tier: number;
    ual?: string;
    expiresAt?: number;
  }): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO badges (badge_id, agent_id, badge_type, tier, ual, issued_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        badge.badgeId,
        badge.agentId,
        badge.badgeType,
        badge.tier,
        badge.ual ?? null,
        Date.now(),
        badge.expiresAt ?? null
      );
  }

  getBadges(agentId: string): Badge[] {
    const rows = this.db
      .prepare('SELECT * FROM badges WHERE agent_id = ? ORDER BY issued_at DESC')
      .all(agentId) as Array<{
      id: number;
      badge_id: string;
      agent_id: string;
      badge_type: string;
      tier: number;
      ual: string | null;
      issued_at: number;
      expires_at: number | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      badgeId: row.badge_id,
      agentId: row.agent_id,
      badgeType: row.badge_type as 'reputation-verified' | 'transaction-count' | 'dispute-free',
      tier: row.tier,
      ual: row.ual,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
    }));
  }

  // Mentions
  saveMention(mention: {
    commentId: string;
    postId: string;
    author: string;
    content: string;
  }): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO mentions (comment_id, post_id, author, content, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(mention.commentId, mention.postId, mention.author, mention.content, Date.now());
  }

  getUnprocessedMentions(): Array<{
    id: number;
    commentId: string;
    postId: string;
    author: string;
    content: string;
  }> {
    const rows = this.db
      .prepare('SELECT * FROM mentions WHERE processed = 0 ORDER BY created_at ASC')
      .all() as Array<{
      id: number;
      comment_id: string;
      post_id: string;
      author: string;
      content: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      commentId: row.comment_id,
      postId: row.post_id,
      author: row.author,
      content: row.content,
    }));
  }

  markMentionProcessed(commentId: string): void {
    this.db.prepare('UPDATE mentions SET processed = 1 WHERE comment_id = ?').run(commentId);
  }

  getLastMentionTime(): number {
    const row = this.db
      .prepare('SELECT MAX(created_at) as last FROM mentions')
      .get() as { last: number | null } | undefined;
    return row?.last ?? 0;
  }

  // Stats
  getStats(): {
    verifications: number;
    trustEdges: number;
    escrowVolume: number;
    postsToday: number;
  } {
    const verifications = this.getVerificationCount();
    const trustEdges = this.db
      .prepare('SELECT COUNT(*) as count FROM trust_edges')
      .get() as { count: number };
    const escrowVolume = this.db
      .prepare("SELECT COALESCE(SUM(amount_sol), 0) as total FROM jobs WHERE status = 'completed'")
      .get() as { total: number };
    const postsToday = this.getPostsToday();

    return {
      verifications,
      trustEdges: trustEdges.count,
      escrowVolume: escrowVolume.total,
      postsToday,
    };
  }
}
