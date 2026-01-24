import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../../db';

const router = Router();

// GET /api/swarm-teams
router.get('/', (_req: Request, res: Response) => {
  const teams = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM swarm_team_members WHERE team_id = t.id) as member_count,
      (SELECT COALESCE(SUM(amount), 0) FROM swarm_draws
       WHERE team_id = t.id AND created_at > unixepoch() - 86400) as daily_spend
    FROM swarm_teams t
    ORDER BY t.created_at DESC
  `).all() as Array<{
    id: string; name: string; currency: string;
    daily_limit: number; pool_balance: number;
    created_at: number; member_count: number; daily_spend: number;
  }>;

  res.json({
    teams: teams.map((t) => ({
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

  if (!name || !currency || dailyLimit == null) {
    res.status(400).json({ error: 'name, currency, and dailyLimit required' });
    return;
  }

  const teamId = `team_${randomUUID().slice(0, 12)}`;
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO swarm_teams (id, name, currency, daily_limit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(teamId, name, currency, dailyLimit, now, now);

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

// DELETE /api/swarm-teams/:id
router.delete('/:id', (req: Request, res: Response) => {
  const teamId = req.params.id;

  const team = db.prepare('SELECT id FROM swarm_teams WHERE id = ?').get(teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  db.prepare('DELETE FROM swarm_draws WHERE team_id = ?').run(teamId);
  db.prepare('DELETE FROM swarm_team_members WHERE team_id = ?').run(teamId);
  db.prepare('DELETE FROM swarm_teams WHERE id = ?').run(teamId);

  res.json({ success: true });
});

// POST /api/swarm-teams/:id/members
router.post('/:id/members', (req: Request, res: Response) => {
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

  const memberId = `mem_${randomUUID().slice(0, 12)}`;
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO swarm_team_members (id, team_id, agent_id, role, draw_limit, added_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(memberId, teamId, agentId, role || 'member', drawLimit || 0, now);

  db.prepare('UPDATE swarm_teams SET updated_at = ? WHERE id = ?').run(now, teamId);

  res.status(201).json({ id: memberId, agentId, role: role || 'member', drawLimit: drawLimit || 0 });
});

// DELETE /api/swarm-teams/:id/members/:memberId
router.delete('/:id/members/:memberId', (req: Request, res: Response) => {
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

// POST /api/swarm-teams/:id/fund
router.post('/:id/fund', (req: Request, res: Response) => {
  const { amount } = req.body;
  const teamId = req.params.id;

  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'amount must be positive' });
    return;
  }

  const result = db.prepare(`
    UPDATE swarm_teams
    SET pool_balance = pool_balance + ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(amount, teamId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const team = db.prepare('SELECT pool_balance FROM swarm_teams WHERE id = ?').get(teamId) as { pool_balance: number };
  res.json({ success: true, poolBalance: team.pool_balance });
});

// PATCH /api/swarm-teams/:id/budget
router.patch('/:id/budget', (req: Request, res: Response) => {
  const { dailyLimit, memberLimits } = req.body;
  const teamId = req.params.id;

  const team = db.prepare('SELECT id FROM swarm_teams WHERE id = ?').get(teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  if (dailyLimit != null) {
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
