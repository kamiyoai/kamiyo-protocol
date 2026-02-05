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

-- Social Intelligence: Observed posts from feed monitoring
CREATE TABLE IF NOT EXISTS observed_posts (
  post_id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  title TEXT,
  topics TEXT,
  sentiment REAL,
  is_question INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  observed_at INTEGER NOT NULL
);

-- Social Intelligence: Agent activity tracking
CREATE TABLE IF NOT EXISTS agent_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  post_id TEXT,
  content TEXT,
  observed_at INTEGER NOT NULL
);

-- Relationship Memory: Agent relationships
CREATE TABLE IF NOT EXISTS agent_relationships (
  agent_id TEXT PRIMARY KEY,
  first_interaction INTEGER NOT NULL,
  interaction_count INTEGER DEFAULT 1,
  topics_discussed TEXT,
  questions_they_asked TEXT,
  help_we_provided TEXT,
  observed_traits TEXT,
  expertise TEXT,
  communication_style TEXT DEFAULT 'casual',
  trust_level INTEGER DEFAULT 50,
  sentiment REAL DEFAULT 0,
  last_interaction INTEGER NOT NULL
);

-- Relationship Memory: Conversation threads
CREATE TABLE IF NOT EXISTS conversation_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  our_last_message TEXT,
  their_last_message TEXT,
  message_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(post_id, agent_id)
);

-- Goal System: Active goals
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  target_metric TEXT,
  current_value REAL DEFAULT 0,
  target_value REAL NOT NULL,
  progress REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Goal System: Weekly metrics snapshots
CREATE TABLE IF NOT EXISTS weekly_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start INTEGER NOT NULL,
  posts_published INTEGER DEFAULT 0,
  engagements_initiated INTEGER DEFAULT 0,
  mentions_received INTEGER DEFAULT 0,
  questions_answered INTEGER DEFAULT 0,
  trust_edges_gained INTEGER DEFAULT 0,
  avg_engagement_score REAL DEFAULT 0,
  top_performing_topics TEXT,
  created_at INTEGER NOT NULL
);

-- Inner Voice: Opinions formed
CREATE TABLE IF NOT EXISTS opinions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL UNIQUE,
  stance TEXT NOT NULL,
  confidence REAL NOT NULL,
  reasoning TEXT,
  context TEXT,
  formed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Inner Voice: Curiosities
CREATE TABLE IF NOT EXISTS curiosities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  context TEXT,
  explored INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Proactive Engagement: Engagement log
CREATE TABLE IF NOT EXISTS engagement_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL,
  engagement_type TEXT NOT NULL,
  content TEXT,
  confidence REAL,
  success INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_observed_posts_author ON observed_posts(author);
CREATE INDEX IF NOT EXISTS idx_observed_posts_observed ON observed_posts(observed_at);
CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_relationships_trust ON agent_relationships(trust_level);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_active ON conversation_threads(is_active);
CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(type);
CREATE INDEX IF NOT EXISTS idx_weekly_metrics_week ON weekly_metrics(week_start);
CREATE INDEX IF NOT EXISTS idx_engagement_log_post ON engagement_log(post_id);

-- DKG TaskCompletion Publishing: Track posts published to DKG as TaskCompletions
CREATE TABLE IF NOT EXISTS published_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT UNIQUE NOT NULL,
  task_ual TEXT,
  quality_score INTEGER NOT NULL,
  published_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_published_tasks_post ON published_tasks(post_id);

-- Hackathon: Voted submissions (persisted across restarts)
CREATE TABLE IF NOT EXISTS hackathon_voted_submissions (
  post_id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  title TEXT,
  upvoted INTEGER DEFAULT 0,
  commented INTEGER DEFAULT 0,
  voted_at INTEGER NOT NULL
);

-- Hackathon: Reciprocally engaged users
CREATE TABLE IF NOT EXISTS hackathon_engaged_users (
  username TEXT PRIMARY KEY,
  engagement_type TEXT NOT NULL,
  engaged_at INTEGER NOT NULL
);

-- Hackathon: Strategic posts (scheduled content tracking)
CREATE TABLE IF NOT EXISTS hackathon_strategic_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT,
  submolt TEXT NOT NULL,
  content_type TEXT NOT NULL,
  title TEXT NOT NULL,
  posted_at INTEGER NOT NULL
);

-- Hackathon: Vote exchange threads we've engaged with
CREATE TABLE IF NOT EXISTS hackathon_vote_exchanges (
  post_id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  engaged_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hackathon_voted_author ON hackathon_voted_submissions(author);
CREATE INDEX IF NOT EXISTS idx_hackathon_strategic_type ON hackathon_strategic_posts(content_type);
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

  // Generic run method for services
  run(sql: string, ...params: unknown[]): void {
    this.db.prepare(sql).run(...params);
  }

  // Generic query method for services
  query<T>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  // Generic get method for services
  get<T>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
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

  // Agent Relationships
  getRelationship(agentId: string): {
    agentId: string;
    firstInteraction: number;
    interactionCount: number;
    topicsDiscussed: string[];
    questionsTheyAsked: string[];
    helpWeProvided: string[];
    observedTraits: string[];
    expertise: string[];
    communicationStyle: 'formal' | 'casual' | 'technical';
    trustLevel: number;
    sentiment: number;
    lastInteraction: number;
  } | null {
    const row = this.db
      .prepare('SELECT * FROM agent_relationships WHERE agent_id = ?')
      .get(agentId) as {
        agent_id: string;
        first_interaction: number;
        interaction_count: number;
        topics_discussed: string | null;
        questions_they_asked: string | null;
        help_we_provided: string | null;
        observed_traits: string | null;
        expertise: string | null;
        communication_style: string;
        trust_level: number;
        sentiment: number;
        last_interaction: number;
      } | undefined;

    if (!row) return null;

    return {
      agentId: row.agent_id,
      firstInteraction: row.first_interaction,
      interactionCount: row.interaction_count,
      topicsDiscussed: row.topics_discussed ? JSON.parse(row.topics_discussed) : [],
      questionsTheyAsked: row.questions_they_asked ? JSON.parse(row.questions_they_asked) : [],
      helpWeProvided: row.help_we_provided ? JSON.parse(row.help_we_provided) : [],
      observedTraits: row.observed_traits ? JSON.parse(row.observed_traits) : [],
      expertise: row.expertise ? JSON.parse(row.expertise) : [],
      communicationStyle: row.communication_style as 'formal' | 'casual' | 'technical',
      trustLevel: row.trust_level,
      sentiment: row.sentiment,
      lastInteraction: row.last_interaction,
    };
  }

  saveRelationship(relationship: {
    agentId: string;
    firstInteraction?: number;
    interactionCount?: number;
    topicsDiscussed?: string[];
    questionsTheyAsked?: string[];
    helpWeProvided?: string[];
    observedTraits?: string[];
    expertise?: string[];
    communicationStyle?: 'formal' | 'casual' | 'technical';
    trustLevel?: number;
    sentiment?: number;
  }): void {
    const existing = this.getRelationship(relationship.agentId);
    const now = Date.now();

    if (existing) {
      // Merge arrays
      const topicsDiscussed = [...new Set([...existing.topicsDiscussed, ...(relationship.topicsDiscussed || [])])];
      const questionsTheyAsked = [...new Set([...existing.questionsTheyAsked, ...(relationship.questionsTheyAsked || [])])];
      const helpWeProvided = [...new Set([...existing.helpWeProvided, ...(relationship.helpWeProvided || [])])];
      const observedTraits = [...new Set([...existing.observedTraits, ...(relationship.observedTraits || [])])];
      const expertise = [...new Set([...existing.expertise, ...(relationship.expertise || [])])];

      this.db.prepare(`
        UPDATE agent_relationships SET
          interaction_count = ?,
          topics_discussed = ?,
          questions_they_asked = ?,
          help_we_provided = ?,
          observed_traits = ?,
          expertise = ?,
          communication_style = ?,
          trust_level = ?,
          sentiment = ?,
          last_interaction = ?
        WHERE agent_id = ?
      `).run(
        (relationship.interactionCount ?? existing.interactionCount) + 1,
        JSON.stringify(topicsDiscussed),
        JSON.stringify(questionsTheyAsked),
        JSON.stringify(helpWeProvided),
        JSON.stringify(observedTraits),
        JSON.stringify(expertise),
        relationship.communicationStyle ?? existing.communicationStyle,
        relationship.trustLevel ?? existing.trustLevel,
        relationship.sentiment ?? existing.sentiment,
        now,
        relationship.agentId
      );
    } else {
      this.db.prepare(`
        INSERT INTO agent_relationships
        (agent_id, first_interaction, interaction_count, topics_discussed, questions_they_asked,
         help_we_provided, observed_traits, expertise, communication_style, trust_level, sentiment, last_interaction)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        relationship.agentId,
        relationship.firstInteraction ?? now,
        relationship.interactionCount ?? 1,
        JSON.stringify(relationship.topicsDiscussed || []),
        JSON.stringify(relationship.questionsTheyAsked || []),
        JSON.stringify(relationship.helpWeProvided || []),
        JSON.stringify(relationship.observedTraits || []),
        JSON.stringify(relationship.expertise || []),
        relationship.communicationStyle ?? 'casual',
        relationship.trustLevel ?? 50,
        relationship.sentiment ?? 0,
        now
      );
    }
  }

  getAllRelationships(): Array<{
    agentId: string;
    interactionCount: number;
    trustLevel: number;
    lastInteraction: number;
  }> {
    const rows = this.db
      .prepare('SELECT agent_id, interaction_count, trust_level, last_interaction FROM agent_relationships ORDER BY trust_level DESC')
      .all() as Array<{
        agent_id: string;
        interaction_count: number;
        trust_level: number;
        last_interaction: number;
      }>;

    return rows.map(row => ({
      agentId: row.agent_id,
      interactionCount: row.interaction_count,
      trustLevel: row.trust_level,
      lastInteraction: row.last_interaction,
    }));
  }

  // Goals
  saveGoal(goal: {
    id: string;
    type: string;
    description: string;
    targetMetric?: string;
    currentValue?: number;
    targetValue: number;
    progress?: number;
  }): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT OR REPLACE INTO goals
      (id, type, description, target_metric, current_value, target_value, progress, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM goals WHERE id = ?), ?), ?)
    `).run(
      goal.id,
      goal.type,
      goal.description,
      goal.targetMetric ?? null,
      goal.currentValue ?? 0,
      goal.targetValue,
      goal.progress ?? 0,
      goal.id,
      now,
      now
    );
  }

  getGoals(): Array<{
    id: string;
    type: string;
    description: string;
    targetMetric: string | null;
    currentValue: number;
    targetValue: number;
    progress: number;
  }> {
    const rows = this.db.prepare('SELECT * FROM goals').all() as Array<{
      id: string;
      type: string;
      description: string;
      target_metric: string | null;
      current_value: number;
      target_value: number;
      progress: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      description: row.description,
      targetMetric: row.target_metric,
      currentValue: row.current_value,
      targetValue: row.target_value,
      progress: row.progress,
    }));
  }

  updateGoalProgress(id: string, currentValue: number, progress: number): void {
    this.db.prepare(`
      UPDATE goals SET current_value = ?, progress = ?, updated_at = ? WHERE id = ?
    `).run(currentValue, progress, Date.now(), id);
  }

  // Weekly Metrics
  saveWeeklyMetrics(metrics: {
    weekStart: number;
    postsPublished: number;
    engagementsInitiated: number;
    mentionsReceived: number;
    questionsAnswered: number;
    trustEdgesGained: number;
    avgEngagementScore: number;
    topPerformingTopics: string[];
  }): void {
    this.db.prepare(`
      INSERT INTO weekly_metrics
      (week_start, posts_published, engagements_initiated, mentions_received, questions_answered,
       trust_edges_gained, avg_engagement_score, top_performing_topics, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      metrics.weekStart,
      metrics.postsPublished,
      metrics.engagementsInitiated,
      metrics.mentionsReceived,
      metrics.questionsAnswered,
      metrics.trustEdgesGained,
      metrics.avgEngagementScore,
      JSON.stringify(metrics.topPerformingTopics),
      Date.now()
    );
  }

  getRecentWeeklyMetrics(weeks = 4): Array<{
    weekStart: number;
    postsPublished: number;
    engagementsInitiated: number;
    mentionsReceived: number;
    questionsAnswered: number;
    trustEdgesGained: number;
    avgEngagementScore: number;
    topPerformingTopics: string[];
  }> {
    const rows = this.db
      .prepare('SELECT * FROM weekly_metrics ORDER BY week_start DESC LIMIT ?')
      .all(weeks) as Array<{
        week_start: number;
        posts_published: number;
        engagements_initiated: number;
        mentions_received: number;
        questions_answered: number;
        trust_edges_gained: number;
        avg_engagement_score: number;
        top_performing_topics: string;
      }>;

    return rows.map(row => ({
      weekStart: row.week_start,
      postsPublished: row.posts_published,
      engagementsInitiated: row.engagements_initiated,
      mentionsReceived: row.mentions_received,
      questionsAnswered: row.questions_answered,
      trustEdgesGained: row.trust_edges_gained,
      avgEngagementScore: row.avg_engagement_score,
      topPerformingTopics: JSON.parse(row.top_performing_topics),
    }));
  }

  // Engagement Log
  logEngagement(engagement: {
    postId: string;
    engagementType: string;
    content?: string;
    confidence?: number;
    success?: boolean;
  }): void {
    this.db.prepare(`
      INSERT INTO engagement_log (post_id, engagement_type, content, confidence, success, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      engagement.postId,
      engagement.engagementType,
      engagement.content ?? null,
      engagement.confidence ?? null,
      engagement.success === undefined ? null : engagement.success ? 1 : 0,
      Date.now()
    );
  }

  getEngagementStats(since?: number): {
    total: number;
    byType: Record<string, number>;
    successRate: number;
  } {
    const cutoff = since || Date.now() - 7 * 24 * 60 * 60 * 1000;

    const total = this.db
      .prepare('SELECT COUNT(*) as count FROM engagement_log WHERE created_at >= ?')
      .get(cutoff) as { count: number };

    const byType = this.db
      .prepare('SELECT engagement_type, COUNT(*) as count FROM engagement_log WHERE created_at >= ? GROUP BY engagement_type')
      .all(cutoff) as Array<{ engagement_type: string; count: number }>;

    const success = this.db
      .prepare('SELECT COUNT(*) as count FROM engagement_log WHERE created_at >= ? AND success = 1')
      .get(cutoff) as { count: number };

    return {
      total: total.count,
      byType: Object.fromEntries(byType.map(r => [r.engagement_type, r.count])),
      successRate: total.count > 0 ? success.count / total.count : 0,
    };
  }

  // Opinions
  saveOpinion(opinion: {
    topic: string;
    stance: string;
    confidence: number;
    reasoning?: string;
    context?: string[];
  }): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT OR REPLACE INTO opinions (topic, stance, confidence, reasoning, context, formed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, COALESCE((SELECT formed_at FROM opinions WHERE topic = ?), ?), ?)
    `).run(
      opinion.topic,
      opinion.stance,
      opinion.confidence,
      opinion.reasoning ?? null,
      opinion.context ? JSON.stringify(opinion.context) : null,
      opinion.topic,
      now,
      now
    );
  }

  getOpinion(topic: string): {
    topic: string;
    stance: string;
    confidence: number;
    reasoning: string | null;
    formedAt: number;
  } | null {
    const row = this.db
      .prepare('SELECT * FROM opinions WHERE topic = ?')
      .get(topic) as {
        topic: string;
        stance: string;
        confidence: number;
        reasoning: string | null;
        formed_at: number;
      } | undefined;

    if (!row) return null;

    return {
      topic: row.topic,
      stance: row.stance,
      confidence: row.confidence,
      reasoning: row.reasoning,
      formedAt: row.formed_at,
    };
  }

  getAllOpinions(): Array<{
    topic: string;
    stance: string;
    confidence: number;
  }> {
    const rows = this.db
      .prepare('SELECT topic, stance, confidence FROM opinions ORDER BY confidence DESC')
      .all() as Array<{ topic: string; stance: string; confidence: number }>;
    return rows;
  }

  // Published Tasks (DKG TaskCompletion tracking)
  isPostPublished(postId: string): boolean {
    if (!postId || postId.length > 100) return false;
    const row = this.db
      .prepare('SELECT 1 FROM published_tasks WHERE post_id = ?')
      .get(postId);
    return row !== undefined;
  }

  markPostPublished(postId: string, ual: string | null, qualityScore: number): void {
    if (!postId || postId.length > 100) return;
    this.db
      .prepare(`
        INSERT OR REPLACE INTO published_tasks (post_id, task_ual, quality_score, published_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(postId, ual, qualityScore, Date.now());
  }

  getUnpublishedPosts(minAgeMs: number): OwnPost[] {
    const cutoff = Date.now() - minAgeMs;
    const rows = this.db
      .prepare(`
        SELECT op.* FROM own_posts op
        LEFT JOIN published_tasks pt ON op.post_id = pt.post_id
        WHERE pt.id IS NULL AND op.posted_at < ?
        ORDER BY op.posted_at ASC
      `)
      .all(cutoff) as Array<{
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

  getPublishedTaskStats(): {
    total: number;
    avgQuality: number;
    lastPublished: number | null;
  } {
    const total = this.db
      .prepare('SELECT COUNT(*) as count FROM published_tasks')
      .get() as { count: number };
    const avgQuality = this.db
      .prepare('SELECT AVG(quality_score) as avg FROM published_tasks')
      .get() as { avg: number | null };
    const lastPublished = this.db
      .prepare('SELECT MAX(published_at) as last FROM published_tasks')
      .get() as { last: number | null };

    return {
      total: total.count,
      avgQuality: avgQuality.avg ?? 0,
      lastPublished: lastPublished.last,
    };
  }

  // === Hackathon Persistence ===

  hasVotedSubmission(postId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM hackathon_voted_submissions WHERE post_id = ?')
      .get(postId);
    return !!row;
  }

  markVotedSubmission(postId: string, author: string, title: string, upvoted: boolean, commented: boolean): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO hackathon_voted_submissions (post_id, author, title, upvoted, commented, voted_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
      .run(postId, author, title, upvoted ? 1 : 0, commented ? 1 : 0, Date.now());
  }

  getVotedSubmissionCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM hackathon_voted_submissions')
      .get() as { count: number };
    return row.count;
  }

  hasEngagedUser(username: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM hackathon_engaged_users WHERE username = ?')
      .get(username);
    return !!row;
  }

  markEngagedUser(username: string, engagementType: string): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO hackathon_engaged_users (username, engagement_type, engaged_at)
        VALUES (?, ?, ?)`)
      .run(username, engagementType, Date.now());
  }

  getLastStrategicPostTime(contentType: string): number {
    const row = this.db
      .prepare('SELECT MAX(posted_at) as last FROM hackathon_strategic_posts WHERE content_type = ?')
      .get(contentType) as { last: number | null };
    return row.last ?? 0;
  }

  saveStrategicPost(postId: string, submolt: string, contentType: string, title: string): void {
    this.db
      .prepare(`INSERT INTO hackathon_strategic_posts (post_id, submolt, content_type, title, posted_at)
        VALUES (?, ?, ?, ?, ?)`)
      .run(postId, submolt, contentType, title, Date.now());
  }

  hasEngagedVoteExchange(postId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM hackathon_vote_exchanges WHERE post_id = ?')
      .get(postId);
    return !!row;
  }

  markVoteExchangeEngaged(postId: string, author: string): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO hackathon_vote_exchanges (post_id, author, engaged_at)
        VALUES (?, ?, ?)`)
      .run(postId, author, Date.now());
  }

  getAllVotedSubmissionIds(): string[] {
    const rows = this.db
      .prepare('SELECT post_id FROM hackathon_voted_submissions')
      .all() as Array<{ post_id: string }>;
    return rows.map(r => r.post_id);
  }

  getAllEngagedUsernames(): string[] {
    const rows = this.db
      .prepare('SELECT username FROM hackathon_engaged_users')
      .all() as Array<{ username: string }>;
    return rows.map(r => r.username);
  }
}
