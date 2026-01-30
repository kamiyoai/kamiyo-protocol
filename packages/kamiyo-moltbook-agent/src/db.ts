import Database from 'better-sqlite3';
import type { Offer, Job, OfferStatus, JobStatus } from './types.js';

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

CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
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
}
