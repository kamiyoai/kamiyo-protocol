import { Router, Request, Response } from 'express';
import { randomUUID, createHash } from 'crypto';
import { PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, createTransferCheckedInstruction, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import db, { deductCredits, usdToCredits } from '../../db';
// NOTE: @kamiyo/swarm-agents has bun:sqlite dep that breaks on Node.js
// Using direct task executor instead of orchestrator
import { BlindfoldClient } from '@kamiyo/blindfold';
import { createTaskExecutor } from '../../task-executor';
import { authMiddleware } from '../middleware';
import { getSolanaConnection } from '../../solana';

const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
const KAMIYO_DECIMALS = 6;
const connection = getSolanaConnection();

// Treasury wallet for hive pool funds
const HIVE_TREASURY = new PublicKey('F7ZxVjxGvirpvkbcF8HUMofR81TkjHqKKS6ABxQYeEtV');
const getTreasuryKeypair = (): Keypair | null => {
  const key = process.env.HIVE_TREASURY_PRIVATE_KEY;
  if (!key) return null;
  try {
    return Keypair.fromSecretKey(bs58.decode(key));
  } catch {
    return null;
  }
};

// Helper to verify team ownership
function isTeamOwner(teamId: string, wallet: string): boolean {
  const team = db.prepare('SELECT owner_wallet FROM swarm_teams WHERE id = ?').get(teamId) as { owner_wallet: string | null } | undefined;
  // If no owner set, allow (legacy teams) but warn
  if (!team) return false;
  if (!team.owner_wallet) return true; // Legacy team - allow until migrated
  return team.owner_wallet === wallet;
}

// Middleware to require team ownership
function requireTeamOwner(req: Request, res: Response, next: () => void): void {
  const teamId = req.params.id;
  const wallet = req.auth?.wallet;
  if (!wallet) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!isTeamOwner(teamId, wallet)) {
    res.status(403).json({ error: 'Not authorized to modify this team' });
    return;
  }
  next();
}

// Poseidon hash approximation for action_hash generation (use real Poseidon in production)
function generateActionHash(teamId: string, description: string, timestamp: number): string {
  const data = `${teamId}:${description}:${timestamp}`;
  return createHash('sha256').update(data).digest('hex');
}

const SWARM_POOL_WALLET = process.env.SWARM_POOL_WALLET || '';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://facilitator.kamiyo.ai';
const SWARM_NETWORK = process.env.SWARM_NETWORK || 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const blindfoldClient = new BlindfoldClient({
  baseUrl: process.env.BLINDFOLD_API_URL,
  apiKey: process.env.BLINDFOLD_API_KEY,
});

const taskExecutor = process.env.ANTHROPIC_API_KEY
  ? createTaskExecutor({ anthropicApiKey: process.env.ANTHROPIC_API_KEY })
  : undefined;

const router = Router();

// Apply auth middleware to all routes - teams require authentication
router.use(authMiddleware);

// GET /api/swarm-teams - list teams owned by authenticated user
router.get('/', (req: Request, res: Response) => {
  const wallet = req.auth?.wallet;
  if (!wallet) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const teams = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM swarm_team_members WHERE team_id = t.id) as member_count,
      (SELECT COALESCE(SUM(amount), 0) FROM swarm_draws
       WHERE team_id = t.id AND created_at > unixepoch() - 86400) as daily_spend
    FROM swarm_teams t
    WHERE t.owner_wallet = ? OR t.owner_wallet IS NULL
    ORDER BY t.created_at DESC
  `).all(wallet);
  const typedTeams = teams as Array<{
    id: string; name: string; currency: string;
    daily_limit: number; pool_balance: number;
    created_at: number; member_count: number; daily_spend: number;
  }>;

  res.json({
    teams: typedTeams.map((t) => ({
      id: t.id,
      name: t.name,
      currency: t.currency,
      dailyLimit: t.daily_limit,
      poolBalance: t.pool_balance,
      memberCount: t.member_count,
      dailySpend: t.daily_spend,
      createdAt: t.created_at * 1000,
    })),
  });
});

// POST /api/swarm-teams
router.post('/', (req: Request, res: Response) => {
  const { name, currency, dailyLimit, members } = req.body;
  const ownerWallet = req.auth?.wallet;
  if (!ownerWallet) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!name || !currency || dailyLimit == null) {
    res.status(400).json({ error: 'name, currency, and dailyLimit required' });
    return;
  }

  // Validate inputs
  if (typeof dailyLimit !== 'number' || dailyLimit <= 0 || !isFinite(dailyLimit)) {
    res.status(400).json({ error: 'dailyLimit must be a positive number' });
    return;
  }

  const teamId = `team_${randomUUID().slice(0, 12)}`;
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO swarm_teams (id, name, currency, daily_limit, owner_wallet, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(teamId, name, currency, dailyLimit, ownerWallet, now, now);

  if (members && Array.isArray(members)) {
    const insert = db.prepare(`
      INSERT INTO swarm_team_members (id, team_id, agent_id, role, draw_limit, added_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const m of members) {
      const memberId = `mem_${randomUUID().slice(0, 12)}`;
      insert.run(memberId, teamId, m.agentId, m.role || 'member', m.drawLimit || 0, now);
    }
  }

  const team = getTeamDetail(teamId);
  res.status(201).json(team);
});

// GET /api/swarm-teams/:id
router.get('/:id', (req: Request, res: Response) => {
  const team = getTeamDetail(req.params.id);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }
  res.json(team);
});

// DELETE /api/swarm-teams/:id - requires owner
// Performs on-chain refund of pool balance to owner wallet
router.delete('/:id', requireTeamOwner, async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const ownerWallet = req.auth?.wallet;

  if (!ownerWallet) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const team = db.prepare('SELECT id, pool_balance, currency FROM swarm_teams WHERE id = ?').get(teamId) as {
    id: string; pool_balance: number; currency: string;
  } | undefined;
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const refundAmount = team.pool_balance;
  const currency = team.currency;
  let refundSignature: string | null = null;

  // Perform on-chain refund if there's a balance and it's KAMIYO tokens
  if (refundAmount > 0 && currency === 'KAMIYO') {
    const treasuryKeypair = getTreasuryKeypair();
    if (!treasuryKeypair) {
      res.status(500).json({ error: 'Treasury not configured for refunds' });
      return;
    }

    try {
      const ownerPubkey = new PublicKey(ownerWallet);

      // Determine token program (try Token-2022 first)
      let tokenProgram = TOKEN_2022_PROGRAM_ID;
      let treasuryAta: PublicKey;
      try {
        treasuryAta = await getAssociatedTokenAddress(KAMIYO_MINT, HIVE_TREASURY, false, TOKEN_2022_PROGRAM_ID);
        await getAccount(connection, treasuryAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
      } catch {
        tokenProgram = TOKEN_PROGRAM_ID;
        treasuryAta = await getAssociatedTokenAddress(KAMIYO_MINT, HIVE_TREASURY, false, TOKEN_PROGRAM_ID);
      }

      // Get or create owner's token account
      const ownerAta = await getAssociatedTokenAddress(KAMIYO_MINT, ownerPubkey, false, tokenProgram);

      // Build refund transaction
      const tokenAmount = BigInt(Math.floor(refundAmount * Math.pow(10, KAMIYO_DECIMALS)));
      const tx = new Transaction();

      // Check if owner ATA exists, it should since they funded originally
      try {
        await getAccount(connection, ownerAta, 'confirmed', tokenProgram);
      } catch {
        // Owner ATA doesn't exist - this shouldn't happen but handle gracefully
        res.status(400).json({ error: 'Owner token account not found' });
        return;
      }

      tx.add(createTransferCheckedInstruction(
        treasuryAta,
        KAMIYO_MINT,
        ownerAta,
        HIVE_TREASURY,
        tokenAmount,
        KAMIYO_DECIMALS,
        [],
        tokenProgram
      ));

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = HIVE_TREASURY;

      tx.sign(treasuryKeypair);
      refundSignature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction({
        signature: refundSignature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

    } catch (err) {
      console.error('Refund transfer failed:', err);
      res.status(500).json({ error: `Refund failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
      return;
    }
  }

  // Use transaction for atomic cascade delete
  const deleteAll = db.transaction(() => {
    db.prepare('DELETE FROM swarm_vote_bids WHERE proposal_id IN (SELECT id FROM swarm_task_proposals WHERE team_id = ?)').run(teamId);
    db.prepare('DELETE FROM swarm_task_proposals WHERE team_id = ?').run(teamId);
    db.prepare('DELETE FROM blindfold_funding_states WHERE team_id = ?').run(teamId);
    db.prepare('DELETE FROM swarm_fund_deposits WHERE team_id = ?').run(teamId);
    db.prepare('DELETE FROM swarm_draws WHERE team_id = ?').run(teamId);
    db.prepare('DELETE FROM swarm_team_members WHERE team_id = ?').run(teamId);
    db.prepare('DELETE FROM swarm_teams WHERE id = ?').run(teamId);
  });
  deleteAll();

  res.json({ success: true, refundAmount, currency, refundSignature });
});

// POST /api/swarm-teams/:id/members - requires owner
router.post('/:id/members', requireTeamOwner, (req: Request, res: Response) => {
  const { agentId, role, drawLimit } = req.body;
  const teamId = req.params.id;

  const team = db.prepare('SELECT id FROM swarm_teams WHERE id = ?').get(teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  if (!agentId) {
    res.status(400).json({ error: 'agentId required' });
    return;
  }

  // Validate drawLimit
  if (drawLimit != null && (typeof drawLimit !== 'number' || drawLimit < 0 || !isFinite(drawLimit))) {
    res.status(400).json({ error: 'drawLimit must be a non-negative number' });
    return;
  }

  const memberId = `mem_${randomUUID().slice(0, 12)}`;
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO swarm_team_members (id, team_id, agent_id, role, draw_limit, added_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(memberId, teamId, agentId, role || 'member', drawLimit || 0, now);

  db.prepare('UPDATE swarm_teams SET updated_at = ? WHERE id = ?').run(now, teamId);

  res.status(201).json({ id: memberId, agentId, role: role || 'member', drawLimit: drawLimit || 0 });
});

// DELETE /api/swarm-teams/:id/members/:memberId - requires owner
router.delete('/:id/members/:memberId', requireTeamOwner, (req: Request, res: Response) => {
  const { id: teamId, memberId } = req.params;

  const result = db.prepare('DELETE FROM swarm_team_members WHERE id = ? AND team_id = ?')
    .run(memberId, teamId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  db.prepare('UPDATE swarm_teams SET updated_at = unixepoch() WHERE id = ?').run(teamId);
  res.json({ success: true });
});

// GET /api/swarm-teams/:id/fund/blindfold
// Generate Blindfold funding URL with state token for verification
router.get('/:id/fund/blindfold', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const wallet = req.auth?.wallet;

  const team = db.prepare('SELECT id, name FROM swarm_teams WHERE id = ?').get(teamId) as {
    id: string; name: string;
  } | undefined;

  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  // Generate state token
  const stateToken = `bf_${randomUUID().replace(/-/g, '')}`;
  const stateId = `bfs_${randomUUID().slice(0, 12)}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  db.prepare(`
    INSERT INTO blindfold_funding_states (id, team_id, state_token, wallet, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(stateId, teamId, stateToken, wallet || null, expiresAt);

  const blindfoldBaseUrl = process.env.BLINDFOLD_FUND_URL || 'https://www.blindfoldfinance.com/partner/funding';
  const callbackUrl = `${process.env.API_URL || 'https://api.kamiyo.ai'}/api/fund/callback`;

  const fundingUrl = new URL(blindfoldBaseUrl);
  fundingUrl.searchParams.set('partner_id', 'kamiyo');
  fundingUrl.searchParams.set('pool_id', teamId);
  fundingUrl.searchParams.set('redirect_uri', callbackUrl);
  fundingUrl.searchParams.set('state', stateToken);
  if (wallet) {
    fundingUrl.searchParams.set('wallet', wallet);
  }

  res.json({
    fundingUrl: fundingUrl.toString(),
    stateToken,
    expiresAt: expiresAt * 1000,
  });
});

// POST /api/swarm-teams/:id/fund/initiate — Proxy to Blindfold initiate-funding API
router.post('/:id/fund/initiate', requireTeamOwner, async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const { walletAddress, amountUsd, stateToken } = req.body;
  const wallet = req.auth?.wallet;

  if (!walletAddress || !amountUsd || !stateToken) {
    res.status(400).json({ error: 'walletAddress, amountUsd, and stateToken required' });
    return;
  }

  if (typeof amountUsd !== 'number' || amountUsd <= 0 || amountUsd > 10000) {
    res.status(400).json({ error: 'amountUsd must be between 0 and 10000' });
    return;
  }

  // Verify state token belongs to this team
  const state = db.prepare(`
    SELECT id, team_id, status FROM blindfold_funding_states
    WHERE state_token = ? AND team_id = ? AND expires_at > unixepoch()
  `).get(stateToken, teamId) as { id: string; team_id: string; status: string } | undefined;

  if (!state) {
    res.status(400).json({ error: 'Invalid or expired state token' });
    return;
  }

  if (state.status !== 'pending') {
    res.status(400).json({ error: 'State token already used' });
    return;
  }

  try {
    const blindfoldRes = await fetch('https://www.blindfoldfinance.com/api/partner/initiate-funding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: walletAddress,
        amount_usd: amountUsd,
        currency: 'SOL',
        partner_id: 'kamiyo',
        pool_id: teamId,
        state: stateToken,
      }),
    });

    if (!blindfoldRes.ok) {
      const errBody = await blindfoldRes.json().catch(() => ({})) as { message?: string; error?: string };
      res.status(blindfoldRes.status).json({ error: errBody.message || errBody.error || 'Blindfold API error' });
      return;
    }

    const result = await blindfoldRes.json();
    res.json(result);
  } catch (err) {
    console.error('Blindfold initiate-funding error:', err);
    res.status(500).json({ error: 'Failed to initiate Blindfold funding' });
  }
});

// POST /api/swarm-teams/:id/fund
router.post('/:id/fund', async (req: Request, res: Response) => {
  const { amount } = req.body;
  const teamId = req.params.id;

  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'amount must be positive' });
    return;
  }

  const team = db.prepare('SELECT id, currency FROM swarm_teams WHERE id = ?').get(teamId) as {
    id: string; currency: string;
  } | undefined;

  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const depositId = `dep_${randomUUID().slice(0, 12)}`;

  try {
    const payment = await blindfoldClient.createPayment({
      amount,
      currency: team.currency as 'SOL' | 'USDC' | 'USDT',
      recipientEmail: `pool-${teamId.slice(0, 8)}@kamiyo.ai`,
      recipientName: `SwarmTeam Pool: ${teamId}`,
    });

    db.prepare(`
      INSERT INTO swarm_fund_deposits (id, team_id, amount, currency, blindfold_payment_id, blindfold_status, crypto_address, crypto_amount, expires_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(depositId, teamId, amount, team.currency, payment.paymentId, payment.cryptoAddress, payment.cryptoAmount, payment.expiresAt);

    res.json({
      depositId,
      paymentId: payment.paymentId,
      cryptoAddress: payment.cryptoAddress,
      cryptoAmount: payment.cryptoAmount,
      expiresAt: payment.expiresAt,
      status: 'pending',
    });
  } catch (err) {
    // Fallback: credit directly if Blindfold is unavailable (dev mode)
    if (!process.env.BLINDFOLD_API_KEY) {
      db.prepare(`
        UPDATE swarm_teams SET pool_balance = pool_balance + ?, updated_at = unixepoch()
        WHERE id = ?
      `).run(amount, teamId);

      db.prepare(`
        INSERT INTO swarm_fund_deposits (id, team_id, amount, currency, blindfold_status, confirmed_at)
        VALUES (?, ?, ?, ?, 'confirmed', unixepoch())
      `).run(depositId, teamId, amount, team.currency);

      const updated = db.prepare('SELECT pool_balance FROM swarm_teams WHERE id = ?').get(teamId) as { pool_balance: number };
      res.json({ depositId, status: 'confirmed', poolBalance: updated.pool_balance });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Payment creation failed' });
  }
});

// POST /api/swarm-teams/:id/fund/:depositId/confirm
router.post('/:id/fund/:depositId/confirm', async (req: Request, res: Response) => {
  const { id: teamId, depositId } = req.params;

  const deposit = db.prepare('SELECT * FROM swarm_fund_deposits WHERE id = ? AND team_id = ?')
    .get(depositId, teamId) as {
    id: string; blindfold_payment_id: string; amount: number; blindfold_status: string;
  } | undefined;

  if (!deposit) {
    res.status(404).json({ error: 'Deposit not found' });
    return;
  }

  if (deposit.blindfold_status === 'confirmed') {
    const team = db.prepare('SELECT pool_balance FROM swarm_teams WHERE id = ?').get(teamId) as { pool_balance: number };
    res.json({ status: 'confirmed', poolBalance: team.pool_balance });
    return;
  }

  if (!deposit.blindfold_payment_id) {
    res.json({ status: deposit.blindfold_status });
    return;
  }

  try {
    const status = await blindfoldClient.getPaymentStatus(deposit.blindfold_payment_id);

    if (status.status === 'confirmed') {
      // Atomic update to prevent double-crediting
      const confirmDeposit = db.transaction(() => {
        const updated = db.prepare(`
          UPDATE swarm_fund_deposits
          SET blindfold_status = 'confirmed', confirmed_at = unixepoch()
          WHERE id = ? AND blindfold_status != 'confirmed'
        `).run(depositId);

        // Only credit pool if we actually changed the status (not already confirmed)
        if (updated.changes > 0) {
          db.prepare(`
            UPDATE swarm_teams SET pool_balance = pool_balance + ?, updated_at = unixepoch()
            WHERE id = ?
          `).run(deposit.amount, teamId);
        }

        return db.prepare('SELECT pool_balance FROM swarm_teams WHERE id = ?').get(teamId) as { pool_balance: number };
      });

      const team = confirmDeposit();
      res.json({ status: 'confirmed', poolBalance: team.pool_balance });
    } else {
      db.prepare('UPDATE swarm_fund_deposits SET blindfold_status = ? WHERE id = ?')
        .run(status.status, depositId);
      res.json({ status: status.status });
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Status check failed' });
  }
});

// POST /api/swarm-teams/:id/fund-credits — Fund pool from user's credit balance
router.post('/:id/fund-credits', requireTeamOwner, (req: Request, res: Response) => {
  const teamId = req.params.id;
  const { amountUsd } = req.body;
  const wallet = req.auth?.wallet;

  if (!wallet) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!amountUsd || typeof amountUsd !== 'number' || amountUsd <= 0 || !isFinite(amountUsd)) {
    res.status(400).json({ error: 'positive amountUsd required' });
    return;
  }

  // Cap maximum single funding amount
  if (amountUsd > 10000) {
    res.status(400).json({ error: 'Maximum single funding is $10,000' });
    return;
  }

  const team = db.prepare('SELECT id, currency, pool_balance FROM swarm_teams WHERE id = ?').get(teamId) as {
    id: string; currency: string; pool_balance: number;
  } | undefined;

  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const creditsMicro = usdToCredits(amountUsd);
  const success = deductCredits(wallet, creditsMicro, 'swarm-pool-fund', `Fund team ${teamId}`);

  if (!success) {
    res.status(400).json({ error: 'Insufficient credit balance' });
    return;
  }

  db.prepare(`
    UPDATE swarm_teams SET pool_balance = pool_balance + ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(amountUsd, teamId);

  db.prepare(`
    INSERT INTO swarm_fund_deposits (id, team_id, amount, currency, blindfold_status, confirmed_at)
    VALUES (?, ?, ?, ?, 'confirmed', unixepoch())
  `).run(`dep_${randomUUID().slice(0, 12)}`, teamId, amountUsd, team.currency);

  const updated = db.prepare('SELECT pool_balance FROM swarm_teams WHERE id = ?').get(teamId) as { pool_balance: number };
  res.json({ success: true, poolBalance: updated.pool_balance });
});

// POST /api/swarm-teams/:id/fund-test — Test endpoint to credit pool without payment
// Only available in dev/test environments or with valid test auth
router.post('/:id/fund-test', requireTeamOwner, (req: Request, res: Response) => {
  const teamId = req.params.id;
  const { amount } = req.body;

  // Only allow if ENABLE_TEST_FUNDING is set (for E2E tests)
  if (!process.env.ENABLE_TEST_FUNDING) {
    res.status(404).json({ error: 'Test funding not enabled' });
    return;
  }

  if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 1000) {
    res.status(400).json({ error: 'amount must be between 0 and 1000' });
    return;
  }

  const team = db.prepare('SELECT id, currency, pool_balance FROM swarm_teams WHERE id = ?').get(teamId) as {
    id: string; currency: string; pool_balance: number;
  } | undefined;

  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  db.prepare(`
    UPDATE swarm_teams SET pool_balance = pool_balance + ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(amount, teamId);

  db.prepare(`
    INSERT INTO swarm_fund_deposits (id, team_id, amount, currency, blindfold_status, confirmed_at)
    VALUES (?, ?, ?, ?, 'test', unixepoch())
  `).run(`dep_test_${randomUUID().slice(0, 12)}`, teamId, amount, team.currency);

  const updated = db.prepare('SELECT pool_balance FROM swarm_teams WHERE id = ?').get(teamId) as { pool_balance: number };
  res.json({ success: true, poolBalance: updated.pool_balance, testMode: true });
});

// POST /api/swarm-teams/:id/fund-tokens — Fund pool with actual $KAMIYO tokens
router.post('/:id/fund-tokens', requireTeamOwner, async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const { signedTransaction } = req.body;
  const wallet = req.auth?.wallet;

  if (!wallet) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!signedTransaction) {
    res.status(400).json({ error: 'signedTransaction required' });
    return;
  }

  const team = db.prepare('SELECT id, currency, pool_balance FROM swarm_teams WHERE id = ?').get(teamId) as {
    id: string; currency: string; pool_balance: number;
  } | undefined;

  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  try {
    // Deserialize and send the signed transaction
    const txBuffer = Buffer.from(signedTransaction, 'base64');
    const transaction = Transaction.from(txBuffer);

    // Send the pre-signed transaction
    const signature = await connection.sendRawTransaction(txBuffer, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    // Wait for confirmation
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    // Get the transfer amount from transaction (parse the instruction)
    // For simplicity, we'll verify the user's balance change
    const userPubkey = new PublicKey(wallet);

    // Try Token-2022 first, then standard SPL
    let userAta: PublicKey;
    let programId = TOKEN_2022_PROGRAM_ID;
    try {
      userAta = await getAssociatedTokenAddress(KAMIYO_MINT, userPubkey, false, TOKEN_2022_PROGRAM_ID);
      await getAccount(connection, userAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    } catch {
      programId = TOKEN_PROGRAM_ID;
      userAta = await getAssociatedTokenAddress(KAMIYO_MINT, userPubkey, false, TOKEN_PROGRAM_ID);
    }

    // Parse transfer amount from the transaction instructions
    // The amount is in the instruction data for SPL token transfers
    let transferAmount = 0n;
    for (const ix of transaction.instructions) {
      // Check if this is a transfer instruction (transfer = 3, transferChecked = 12)
      if (ix.programId.equals(programId) && ix.data.length >= 9) {
        const instructionType = ix.data[0];
        if (instructionType === 3 || instructionType === 12) {
          // Read amount as little-endian u64
          transferAmount = ix.data.readBigUInt64LE(1);
          break;
        }
      }
    }

    if (transferAmount === 0n) {
      res.status(400).json({ error: 'No valid token transfer found in transaction' });
      return;
    }

    // Convert to human readable amount
    const tokenAmount = Number(transferAmount) / Math.pow(10, KAMIYO_DECIMALS);

    // Minimum 100k KAMIYO to fund pool
    const MIN_FUND_AMOUNT = 100_000;
    if (tokenAmount < MIN_FUND_AMOUNT) {
      res.status(400).json({ error: `Minimum funding amount is ${MIN_FUND_AMOUNT.toLocaleString()} $KAMIYO` });
      return;
    }

    // Update pool balance and set currency to KAMIYO
    db.prepare(`
      UPDATE swarm_teams SET pool_balance = pool_balance + ?, currency = 'KAMIYO', updated_at = unixepoch()
      WHERE id = ?
    `).run(tokenAmount, teamId);

    // Record the deposit
    db.prepare(`
      INSERT INTO swarm_fund_deposits (id, team_id, amount, currency, blindfold_status, blindfold_payment_id, confirmed_at)
      VALUES (?, ?, ?, 'KAMIYO', 'confirmed', ?, unixepoch())
    `).run(`dep_${randomUUID().slice(0, 12)}`, teamId, tokenAmount, signature);

    const updated = db.prepare('SELECT pool_balance FROM swarm_teams WHERE id = ?').get(teamId) as { pool_balance: number };
    res.json({
      success: true,
      poolBalance: updated.pool_balance,
      tokenAmount,
      signature,
    });
  } catch (err) {
    console.error('Token funding failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Token transfer failed' });
  }
});

// PATCH /api/swarm-teams/:id/budget - requires owner
router.patch('/:id/budget', requireTeamOwner, (req: Request, res: Response) => {
  const { dailyLimit, memberLimits } = req.body;
  const teamId = req.params.id;

  const team = db.prepare('SELECT id FROM swarm_teams WHERE id = ?').get(teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  // Validate dailyLimit
  if (dailyLimit != null) {
    if (typeof dailyLimit !== 'number' || dailyLimit < 0 || !isFinite(dailyLimit)) {
      res.status(400).json({ error: 'dailyLimit must be a non-negative number' });
      return;
    }
    db.prepare('UPDATE swarm_teams SET daily_limit = ?, updated_at = unixepoch() WHERE id = ?')
      .run(dailyLimit, teamId);
  }

  if (memberLimits && typeof memberLimits === 'object') {
    const update = db.prepare('UPDATE swarm_team_members SET draw_limit = ? WHERE id = ? AND team_id = ?');
    for (const [memberId, limit] of Object.entries(memberLimits)) {
      update.run(limit as number, memberId, teamId);
    }
  }

  res.json({ success: true });
});

// GET /api/swarm-teams/:id/draws
router.get('/:id/draws', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const agentId = req.query.agentId as string | undefined;

  let query = 'SELECT * FROM swarm_draws WHERE team_id = ?';
  const params: (string | number)[] = [teamId];

  if (agentId) {
    query += ' AND agent_id = ?';
    params.push(agentId);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const draws = db.prepare(query).all(...params) as Array<{
    id: string; team_id: string; agent_id: string; amount: number;
    purpose: string | null; blindfold_payment_id: string | null;
    blindfold_status: string; created_at: number;
  }>;

  const countQuery = agentId
    ? db.prepare('SELECT COUNT(*) as total FROM swarm_draws WHERE team_id = ? AND agent_id = ?').get(teamId, agentId)
    : db.prepare('SELECT COUNT(*) as total FROM swarm_draws WHERE team_id = ?').get(teamId);

  res.json({
    draws: draws.map((d) => ({
      id: d.id,
      agentId: d.agent_id,
      amount: d.amount,
      purpose: d.purpose,
      blindfoldPaymentId: d.blindfold_payment_id,
      blindfoldStatus: d.blindfold_status,
      createdAt: d.created_at * 1000,
    })),
    total: (countQuery as { total: number }).total,
  });
});

// --- Direct task execution (bypassing swarm-agents orchestrator due to bun:sqlite issue) ---

function recordDraw(teamId: string, agentId: string, amount: number, taskId: string) {
  const drawId = `draw_${randomUUID().slice(0, 12)}`;
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO swarm_draws (id, team_id, agent_id, amount, purpose, blindfold_status, created_at)
    VALUES (?, ?, ?, ?, ?, 'completed', ?)
  `).run(drawId, teamId, agentId, amount, `task:${taskId}`, now);
  return drawId;
}

// POST /api/swarm-teams/:id/tasks
router.post('/:id/tasks', async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const { memberId, description, budget } = req.body;

  if (!memberId || !description) {
    res.status(400).json({ error: 'memberId and description required' });
    return;
  }

  const team = db.prepare('SELECT id, pool_balance, daily_limit FROM swarm_teams WHERE id = ?')
    .get(teamId) as { id: string; pool_balance: number; daily_limit: number } | undefined;

  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const member = db.prepare('SELECT * FROM swarm_team_members WHERE id = ? AND team_id = ?')
    .get(memberId, teamId) as { id: string; agent_id: string; role: string; draw_limit: number } | undefined;

  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  const taskBudget = budget ?? member.draw_limit;

  // Atomic: daily limit check + pool reservation in a single transaction
  const reserveBudget = db.transaction(() => {
    const dailySpend = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM swarm_draws
      WHERE team_id = ? AND created_at > unixepoch() - 86400
    `).get(teamId) as { total: number };

    if (dailySpend.total + taskBudget > team.daily_limit) {
      return { error: 'Would exceed daily limit' } as const;
    }

    const reserved = db.prepare(`
      UPDATE swarm_teams
      SET pool_balance = pool_balance - ?, updated_at = unixepoch()
      WHERE id = ? AND pool_balance >= ?
    `).run(taskBudget, teamId, taskBudget);

    if (reserved.changes === 0) {
      return { error: 'Insufficient pool balance' } as const;
    }

    return { error: null } as const;
  });

  const budgetResult = reserveBudget();
  if (budgetResult.error) {
    res.status(400).json({ error: budgetResult.error });
    return;
  }

  try {
    if (!taskExecutor) {
      res.status(503).json({ error: 'Task execution not available (missing ANTHROPIC_API_KEY)' });
      return;
    }

    const taskId = `task_${randomUUID().slice(0, 12)}`;

    // Execute task directly (bypassing orchestrator due to bun:sqlite compat issue)
    const result = await taskExecutor({
      taskId,
      description,
      budget: taskBudget,
      teamId,
    });

    // Record draw if task completed with cost
    if (result.status === 'completed' && result.amountDrawn && result.amountDrawn > 0) {
      recordDraw(teamId, member.agent_id, result.amountDrawn, taskId);
    }

    res.json(result);
  } catch (err) {
    // Refund reserved budget on failure
    db.prepare(`
      UPDATE swarm_teams SET pool_balance = pool_balance + ?, updated_at = unixepoch()
      WHERE id = ?
    `).run(taskBudget, teamId);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Task execution failed' });
  }
});

// =============================================================================
// SWARMTEAMS ZK VOTE+BID ENDPOINTS
// =============================================================================

// POST /api/swarm-teams/:id/propose-task
// Creates task proposal, opens vote+bid window
router.post('/:id/propose-task', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const {
    description,
    budget,
    minBid = 0,
    voteDurationSec = 60,
    revealDurationSec = 30,
  } = req.body;

  if (!description || budget == null) {
    res.status(400).json({ error: 'description and budget required' });
    return;
  }

  const team = db.prepare('SELECT id, pool_balance FROM swarm_teams WHERE id = ?')
    .get(teamId) as { id: string; pool_balance: number } | undefined;

  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  if (team.pool_balance < budget) {
    res.status(400).json({ error: 'Insufficient pool balance for budget' });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const proposalId = `prop_${randomUUID().slice(0, 12)}`;
  const actionHash = generateActionHash(teamId, description, now);
  const voteDeadline = now + voteDurationSec;
  const revealDeadline = voteDeadline + revealDurationSec;

  db.prepare(`
    INSERT INTO swarm_task_proposals (id, team_id, action_hash, description, budget, min_bid, vote_deadline, reveal_deadline, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'voting')
  `).run(proposalId, teamId, actionHash, description, budget, minBid, voteDeadline, revealDeadline);

  res.status(201).json({
    proposalId,
    actionHash,
    voteDeadline: voteDeadline * 1000,
    revealDeadline: revealDeadline * 1000,
    budget,
    minBid,
  });
});

// POST /api/swarm-teams/:id/vote-bid
// Submit ZK proof with vote + bid commitments
router.post('/:id/vote-bid', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const { proposalId, memberId, proof, voteNullifier, voteCommitment, bidCommitment } = req.body;

  if (!proposalId || !memberId || !proof || !voteNullifier || !voteCommitment || !bidCommitment) {
    res.status(400).json({ error: 'proposalId, memberId, proof, voteNullifier, voteCommitment, bidCommitment required' });
    return;
  }

  const proposal = db.prepare('SELECT * FROM swarm_task_proposals WHERE id = ? AND team_id = ?')
    .get(proposalId, teamId) as { id: string; status: string; vote_deadline: number } | undefined;

  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }

  if (proposal.status !== 'voting') {
    res.status(400).json({ error: `Proposal is not in voting phase (status: ${proposal.status})` });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > proposal.vote_deadline) {
    res.status(400).json({ error: 'Vote deadline has passed' });
    return;
  }

  const member = db.prepare('SELECT id FROM swarm_team_members WHERE id = ? AND team_id = ?')
    .get(memberId, teamId);

  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  // Check for duplicate nullifier
  const existingNullifier = db.prepare('SELECT id FROM swarm_vote_bids WHERE vote_nullifier = ?')
    .get(voteNullifier);

  if (existingNullifier) {
    res.status(400).json({ error: 'Vote nullifier already used (double-vote attempt)' });
    return;
  }

  // TODO: Verify ZK proof on-chain or locally
  // For now, store the commitment (proof verification would happen on-chain)

  const voteId = `vb_${randomUUID().slice(0, 12)}`;

  try {
    db.prepare(`
      INSERT INTO swarm_vote_bids (id, proposal_id, member_id, vote_nullifier, vote_commitment, bid_commitment)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(voteId, proposalId, memberId, voteNullifier, voteCommitment, bidCommitment);

    res.json({ success: true, voteId });
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
      res.status(400).json({ error: 'Member has already voted on this proposal' });
      return;
    }
    throw err;
  }
});

// POST /api/swarm-teams/:id/reveal-bid
// Reveal vote and bid after vote deadline
router.post('/:id/reveal-bid', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const { proposalId, memberId, voteNullifier, voteValue, voteSalt, bidAmount, bidSalt } = req.body;

  if (!proposalId || !memberId || !voteNullifier || voteValue == null || !voteSalt || bidAmount == null || !bidSalt) {
    res.status(400).json({ error: 'proposalId, memberId, voteNullifier, voteValue, voteSalt, bidAmount, bidSalt required' });
    return;
  }

  const proposal = db.prepare('SELECT * FROM swarm_task_proposals WHERE id = ? AND team_id = ?')
    .get(proposalId, teamId) as {
    id: string; status: string; vote_deadline: number; reveal_deadline: number; min_bid: number;
  } | undefined;

  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  // Update status to revealing if vote deadline passed
  if (proposal.status === 'voting' && now > proposal.vote_deadline) {
    db.prepare('UPDATE swarm_task_proposals SET status = ? WHERE id = ?')
      .run('revealing', proposalId);
    proposal.status = 'revealing';
  }

  if (proposal.status !== 'revealing') {
    if (now <= proposal.vote_deadline) {
      res.status(400).json({ error: 'Vote phase not yet ended' });
    } else {
      res.status(400).json({ error: `Proposal is not in reveal phase (status: ${proposal.status})` });
    }
    return;
  }

  if (now > proposal.reveal_deadline) {
    res.status(400).json({ error: 'Reveal deadline has passed' });
    return;
  }

  const voteBid = db.prepare(`
    SELECT * FROM swarm_vote_bids WHERE proposal_id = ? AND member_id = ? AND vote_nullifier = ?
  `).get(proposalId, memberId, voteNullifier) as {
    id: string; vote_commitment: string; bid_commitment: string; revealed_at: number | null;
  } | undefined;

  if (!voteBid) {
    res.status(404).json({ error: 'Vote record not found' });
    return;
  }

  if (voteBid.revealed_at) {
    res.status(400).json({ error: 'Vote already revealed' });
    return;
  }

  // TODO: Verify commitments match revealed values
  // vote_commitment = Poseidon(vote, vote_salt, action_hash)
  // bid_commitment = Poseidon(bid_amount, bid_salt, action_hash)
  // For hackathon demo, we trust the client (real version verifies on-chain)

  if (bidAmount < proposal.min_bid) {
    res.status(400).json({ error: `Bid amount ${bidAmount} is below minimum ${proposal.min_bid}` });
    return;
  }

  db.prepare(`
    UPDATE swarm_vote_bids SET vote_value = ?, bid_amount = ?, revealed_at = unixepoch()
    WHERE id = ?
  `).run(voteValue, bidAmount, voteBid.id);

  // Get current highest bid among YES voters
  const highestYes = db.prepare(`
    SELECT MAX(bid_amount) as highest FROM swarm_vote_bids
    WHERE proposal_id = ? AND vote_value = 1 AND revealed_at IS NOT NULL
  `).get(proposalId) as { highest: number | null };

  res.json({
    success: true,
    currentHighestBid: highestYes.highest || 0,
  });
});

// POST /api/swarm-teams/:id/execute-proposal
// Execute after reveal deadline, winner takes task
router.post('/:id/execute-proposal', async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const { proposalId } = req.body;

  if (!proposalId) {
    res.status(400).json({ error: 'proposalId required' });
    return;
  }

  const proposal = db.prepare('SELECT * FROM swarm_task_proposals WHERE id = ? AND team_id = ?')
    .get(proposalId, teamId) as {
    id: string; description: string; budget: number; status: string;
    reveal_deadline: number; vote_deadline: number;
  } | undefined;

  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  // Update status if needed
  if (proposal.status === 'voting' && now > proposal.vote_deadline) {
    db.prepare('UPDATE swarm_task_proposals SET status = ? WHERE id = ?')
      .run('revealing', proposalId);
    proposal.status = 'revealing';
  }

  if (proposal.status === 'revealing' && now > proposal.reveal_deadline) {
    db.prepare('UPDATE swarm_task_proposals SET status = ? WHERE id = ?')
      .run('executing', proposalId);
    proposal.status = 'executing';
  }

  if (proposal.status !== 'executing') {
    if (now <= proposal.reveal_deadline) {
      res.status(400).json({ error: 'Reveal phase not yet ended' });
    } else if (proposal.status === 'completed') {
      res.status(400).json({ error: 'Proposal already executed' });
    } else {
      res.status(400).json({ error: `Proposal is not ready for execution (status: ${proposal.status})` });
    }
    return;
  }

  // Count votes
  const votes = db.prepare(`
    SELECT vote_value, COUNT(*) as count FROM swarm_vote_bids
    WHERE proposal_id = ? AND revealed_at IS NOT NULL
    GROUP BY vote_value
  `).all(proposalId) as Array<{ vote_value: number; count: number }>;

  const yesVotes = votes.find(v => v.vote_value === 1)?.count || 0;
  const noVotes = votes.find(v => v.vote_value === 0)?.count || 0;

  // Simple majority threshold
  if (yesVotes <= noVotes) {
    db.prepare('UPDATE swarm_task_proposals SET status = ? WHERE id = ?')
      .run('rejected', proposalId);
    res.json({
      status: 'rejected',
      yesVotes,
      noVotes,
      reason: 'Not enough YES votes',
    });
    return;
  }

  // Find highest bidder among YES voters
  const winner = db.prepare(`
    SELECT member_id, bid_amount FROM swarm_vote_bids
    WHERE proposal_id = ? AND vote_value = 1 AND revealed_at IS NOT NULL
    ORDER BY bid_amount DESC
    LIMIT 1
  `).get(proposalId) as { member_id: string; bid_amount: number } | undefined;

  if (!winner) {
    db.prepare('UPDATE swarm_task_proposals SET status = ? WHERE id = ?')
      .run('failed', proposalId);
    res.json({
      status: 'failed',
      yesVotes,
      noVotes,
      reason: 'No revealed YES votes with bids',
    });
    return;
  }

  // Reserve budget from pool
  const team = db.prepare('SELECT pool_balance FROM swarm_teams WHERE id = ?')
    .get(teamId) as { pool_balance: number };

  if (team.pool_balance < proposal.budget) {
    db.prepare('UPDATE swarm_task_proposals SET status = ? WHERE id = ?')
      .run('failed', proposalId);
    res.json({
      status: 'failed',
      reason: 'Insufficient pool balance',
    });
    return;
  }

  // Deduct budget atomically
  const reserved = db.prepare(`
    UPDATE swarm_teams SET pool_balance = pool_balance - ?, updated_at = unixepoch()
    WHERE id = ? AND pool_balance >= ?
  `).run(proposal.budget, teamId, proposal.budget);

  if (reserved.changes === 0) {
    db.prepare('UPDATE swarm_task_proposals SET status = ? WHERE id = ?')
      .run('failed', proposalId);
    res.json({
      status: 'failed',
      reason: 'Insufficient pool balance (race condition)',
    });
    return;
  }

  const taskId = `task_${randomUUID().slice(0, 12)}`;

  // Update proposal with winner
  db.prepare(`
    UPDATE swarm_task_proposals
    SET status = 'executing', winning_member_id = ?, winning_bid = ?, task_id = ?
    WHERE id = ?
  `).run(winner.member_id, winner.bid_amount, taskId, proposalId);

  // Execute the task
  try {
    if (!taskExecutor) {
      res.status(503).json({ error: 'Task execution not available (missing ANTHROPIC_API_KEY)' });
      return;
    }

    const member = db.prepare('SELECT * FROM swarm_team_members WHERE id = ?')
      .get(winner.member_id) as { id: string; agent_id: string; role: string; draw_limit: number };

    // Execute task directly (bypassing orchestrator due to bun:sqlite compat issue)
    const result = await taskExecutor({
      taskId,
      description: proposal.description,
      budget: proposal.budget,
      teamId,
    });

    // Record draw with winning bid
    const drawId = `draw_${randomUUID().slice(0, 12)}`;
    db.prepare(`
      INSERT INTO swarm_draws (id, team_id, agent_id, amount, purpose, blindfold_status, created_at)
      VALUES (?, ?, ?, ?, ?, 'completed', unixepoch())
    `).run(drawId, teamId, member.agent_id, result.amountDrawn || winner.bid_amount, `proposal:${proposalId}`);

    // Mark proposal as completed
    db.prepare('UPDATE swarm_task_proposals SET status = ? WHERE id = ?')
      .run('completed', proposalId);

    // Refund unused budget
    const actualCost = result.amountDrawn || winner.bid_amount;
    const refund = proposal.budget - actualCost;
    if (refund > 0) {
      db.prepare(`
        UPDATE swarm_teams SET pool_balance = pool_balance + ?, updated_at = unixepoch()
        WHERE id = ?
      `).run(refund, teamId);
    }

    res.json({
      status: 'completed',
      taskId,
      winnerId: winner.member_id,
      winningBid: winner.bid_amount,
      yesVotes,
      noVotes,
      output: result.output,
      amountDrawn: actualCost,
      refunded: refund,
    });
  } catch (err) {
    // Refund budget on failure
    db.prepare(`
      UPDATE swarm_teams SET pool_balance = pool_balance + ?, updated_at = unixepoch()
      WHERE id = ?
    `).run(proposal.budget, teamId);
    db.prepare('UPDATE swarm_task_proposals SET status = ? WHERE id = ?')
      .run('failed', proposalId);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Task execution failed' });
  }
});

// GET /api/swarm-teams/:id/proposals
// List proposals with status
router.get('/:id/proposals', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const status = req.query.status as string | undefined;

  let query = 'SELECT * FROM swarm_task_proposals WHERE team_id = ?';
  const params: (string | number)[] = [teamId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const proposals = db.prepare(query).all(...params) as Array<{
    id: string; action_hash: string; description: string; budget: number;
    min_bid: number; vote_deadline: number; reveal_deadline: number;
    status: string; winning_member_id: string | null; winning_bid: number | null;
    task_id: string | null; created_at: number;
  }>;

  // Get vote counts for each proposal
  const result = proposals.map(p => {
    const votes = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN revealed_at IS NOT NULL THEN 1 ELSE 0 END) as revealed,
        SUM(CASE WHEN vote_value = 1 THEN 1 ELSE 0 END) as yes_votes,
        SUM(CASE WHEN vote_value = 0 THEN 1 ELSE 0 END) as no_votes
      FROM swarm_vote_bids WHERE proposal_id = ?
    `).get(p.id) as { total: number; revealed: number; yes_votes: number; no_votes: number };

    return {
      id: p.id,
      actionHash: p.action_hash,
      description: p.description,
      budget: p.budget,
      minBid: p.min_bid,
      voteDeadline: p.vote_deadline * 1000,
      revealDeadline: p.reveal_deadline * 1000,
      status: p.status,
      winningMemberId: p.winning_member_id,
      winningBid: p.winning_bid,
      taskId: p.task_id,
      createdAt: p.created_at * 1000,
      votesSubmitted: votes.total,
      votesRevealed: votes.revealed,
      yesVotes: votes.yes_votes,
      noVotes: votes.no_votes,
    };
  });

  res.json({ proposals: result });
});

// GET /api/swarm-teams/:id/proposals/:proposalId
// Get proposal detail with votes/bids
router.get('/:id/proposals/:proposalId', (req: Request, res: Response) => {
  const { id: teamId, proposalId } = req.params;

  const proposal = db.prepare('SELECT * FROM swarm_task_proposals WHERE id = ? AND team_id = ?')
    .get(proposalId, teamId) as {
    id: string; action_hash: string; description: string; budget: number;
    min_bid: number; vote_deadline: number; reveal_deadline: number;
    status: string; winning_member_id: string | null; winning_bid: number | null;
    task_id: string | null; created_at: number;
  } | undefined;

  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const revealPhaseEnded = now > proposal.reveal_deadline;

  // Get votes - only show revealed values after reveal phase
  const votes = db.prepare('SELECT * FROM swarm_vote_bids WHERE proposal_id = ?')
    .all(proposalId) as Array<{
    id: string; member_id: string; vote_nullifier: string;
    vote_commitment: string; bid_commitment: string;
    vote_value: number | null; bid_amount: number | null;
    revealed_at: number | null; created_at: number;
  }>;

  const votesResult = votes.map(v => ({
    id: v.id,
    memberId: v.member_id,
    voteNullifier: v.vote_nullifier,
    // Only show commitments until revealed
    voteCommitment: v.vote_commitment,
    bidCommitment: v.bid_commitment,
    // Only show revealed values
    voteValue: v.revealed_at ? (v.vote_value === 1 ? 'yes' : 'no') : null,
    bidAmount: v.revealed_at ? v.bid_amount : null,
    revealed: !!v.revealed_at,
    createdAt: v.created_at * 1000,
  }));

  res.json({
    proposal: {
      id: proposal.id,
      actionHash: proposal.action_hash,
      description: proposal.description,
      budget: proposal.budget,
      minBid: proposal.min_bid,
      voteDeadline: proposal.vote_deadline * 1000,
      revealDeadline: proposal.reveal_deadline * 1000,
      status: proposal.status,
      winningMemberId: proposal.winning_member_id,
      winningBid: proposal.winning_bid,
      taskId: proposal.task_id,
      createdAt: proposal.created_at * 1000,
    },
    votes: votesResult,
    summary: {
      totalVotes: votes.length,
      revealed: votes.filter(v => v.revealed_at).length,
      yesVotes: votes.filter(v => v.vote_value === 1).length,
      noVotes: votes.filter(v => v.vote_value === 0).length,
    },
  });
});

function getTeamDetail(teamId: string) {
  const team = db.prepare('SELECT * FROM swarm_teams WHERE id = ?').get(teamId) as {
    id: string; name: string; currency: string;
    daily_limit: number; pool_balance: number;
    created_at: number; updated_at: number;
  } | undefined;

  if (!team) return null;

  const members = db.prepare('SELECT * FROM swarm_team_members WHERE team_id = ?').all(teamId) as Array<{
    id: string; agent_id: string; role: string;
    draw_limit: number; drawn_today: number;
  }>;

  const recentDraws = db.prepare(`
    SELECT * FROM swarm_draws WHERE team_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(teamId) as Array<{
    id: string; agent_id: string; amount: number;
    purpose: string | null; blindfold_payment_id: string | null;
    blindfold_status: string; created_at: number;
  }>;

  const dailySpend = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM swarm_draws
    WHERE team_id = ? AND created_at > unixepoch() - 86400
  `).get(teamId) as { total: number };

  return {
    id: team.id,
    name: team.name,
    currency: team.currency,
    dailyLimit: team.daily_limit,
    poolBalance: team.pool_balance,
    dailySpend: dailySpend.total,
    createdAt: team.created_at * 1000,
    members: members.map((m) => ({
      id: m.id,
      agentId: m.agent_id,
      role: m.role,
      drawLimit: m.draw_limit,
      drawnToday: m.drawn_today,
    })),
    recentDraws: recentDraws.map((d) => ({
      id: d.id,
      agentId: d.agent_id,
      amount: d.amount,
      purpose: d.purpose,
      blindfoldPaymentId: d.blindfold_payment_id,
      blindfoldStatus: d.blindfold_status,
      createdAt: d.created_at * 1000,
    })),
  };
}

export default router;
