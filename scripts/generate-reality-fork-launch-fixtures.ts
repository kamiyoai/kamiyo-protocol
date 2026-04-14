#!/usr/bin/env npx tsx

import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { sign } from 'jsonwebtoken';
import {
  assertRealityForkFixtureBundle,
  createRealityForkFixtureBundle,
  fixtureDirectory,
} from '@kamiyo/reality-fork';

type ScenarioSeed = {
  id: string;
  mission: string;
  title: string;
  summary: string;
  tagline: string;
  tags: string[];
  sessionId: string;
  escrowPda: string;
  signature: string;
  baselinePlan: {
    mode: 'dag';
    nodes: Array<{
      id: string;
      memberId: string;
      description: string;
      budget: number;
      dependsOn: string[];
    }>;
  };
};

const scenarios: ScenarioSeed[] = [
  {
    id: 'ship-or-delay',
    mission: 'Decide whether to ship the candidate build this week.',
    title: 'Ship the build?',
    summary:
      'A software ship/no-ship counterfactual for AI builders deciding whether to release a candidate build.',
    tagline: 'Release pressure meets branch-by-branch receipts.',
    tags: ['software', 'release', 'ai-builders'],
    sessionId: 'ship_session_1',
    escrowPda: 'escrow_ship_1',
    signature: 'sig_ship_1',
    baselinePlan: {
      mode: 'dag',
      nodes: [
        {
          id: 'research',
          memberId: 'mem-a',
          description:
            'Research the candidate build, validate the release notes, and cite candidate build evidence for ship or delay.',
          budget: 2,
          dependsOn: [],
        },
        {
          id: 'final',
          memberId: 'mem-b',
          description: 'Produce the final ship or delay recommendation for the candidate build.',
          budget: 2,
          dependsOn: ['research'],
        },
      ],
    },
  },
  {
    id: 'incident-response',
    mission: 'Choose the best response to the bridge outage without widening blast radius.',
    title: 'Bridge outage response',
    summary:
      'An incident-response fork where the safest winning branch is the one that proves the blast radius before acting.',
    tagline: 'Readonly futures for operators who need to move fast without guessing.',
    tags: ['incident-response', 'ops', 'agents'],
    sessionId: 'incident_session_1',
    escrowPda: 'escrow_incident_1',
    signature: 'sig_incident_1',
    baselinePlan: {
      mode: 'dag',
      nodes: [
        {
          id: 'research',
          memberId: 'mem-a',
          description:
            'Investigate the bridge outage timeline, cite incident evidence, and summarize the likely blast radius.',
          budget: 2,
          dependsOn: [],
        },
        {
          id: 'final',
          memberId: 'mem-b',
          description: 'Produce the final incident response recommendation for the bridge outage.',
          budget: 2,
          dependsOn: ['research'],
        },
      ],
    },
  },
  {
    id: 'treasury-rotation',
    mission: 'Recommend the least-regret treasury rotation before the governance vote opens.',
    title: 'Treasury rotation vote',
    summary:
      'A governance-native fork with multiple futures competing over treasury rotation timing, risk, and reversibility.',
    tagline: 'Governance pressure, forked into four receipts-backed futures.',
    tags: ['governance', 'crypto', 'treasury'],
    sessionId: 'governance_session_1',
    escrowPda: 'escrow_governance_1',
    signature: 'sig_governance_1',
    baselinePlan: {
      mode: 'dag',
      nodes: [
        {
          id: 'research',
          memberId: 'mem-a',
          description:
            'Analyze the treasury rotation proposal, cite governance evidence, and evaluate liquidity risk.',
          budget: 2,
          dependsOn: [],
        },
        {
          id: 'final',
          memberId: 'mem-b',
          description:
            'Produce the final treasury rotation recommendation before the governance vote.',
          budget: 2,
          dependsOn: ['research'],
        },
      ],
    },
  },
];

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function createObservatoryServer() {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname.startsWith('/escrows/by-session/')) {
      const sessionId = decodeURIComponent(url.pathname.slice('/escrows/by-session/'.length));
      const scenario = scenarios.find(entry => entry.sessionId === sessionId);
      if (!scenario) return json(res, 404, { error: 'unknown session' });
      return json(res, 200, {
        escrows: [
          {
            escrowPda: scenario.escrowPda,
            sessionId: scenario.sessionId,
            lastSignature: scenario.signature,
          },
        ],
      });
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      const sessionId = url.searchParams.get('sessionId');
      const escrowPda = url.searchParams.get('escrowPda');
      const scenario = scenarios.find(
        entry => entry.sessionId === sessionId || entry.escrowPda === escrowPda
      );
      if (!scenario) return json(res, 404, { error: 'unknown scenario' });
      return json(res, 200, {
        events: [
          {
            id: `${scenario.id}_evt_primary`,
            signature: scenario.signature,
            session_id: scenario.sessionId,
            escrow_pda: scenario.escrowPda,
          },
          {
            id: `${scenario.id}_evt_secondary`,
            signature: `${scenario.signature}_2`,
            session_id: scenario.sessionId,
            escrow_pda: scenario.escrowPda,
          },
        ],
      });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/escrows/')) {
      const escrowPda = decodeURIComponent(url.pathname.slice('/escrows/'.length));
      const scenario = scenarios.find(entry => entry.escrowPda === escrowPda);
      if (!scenario) return json(res, 404, { error: 'unknown escrow' });
      return json(res, 200, {
        escrowPda: scenario.escrowPda,
        sessionId: scenario.sessionId,
        lastSignature: scenario.signature,
      });
    }

    return json(res, 404, { error: 'not found' });
  });
}

function startServer(
  server: ReturnType<typeof createServer>
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('failed to bind server');
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(done => server.close(() => done())),
      });
    });
  });
}

function evidenceRefsForDescription(description: string): string[] {
  const lower = description.toLowerCase();
  if (lower.includes('candidate build')) {
    return [
      'ship-or-delay_evt_primary',
      'ship-or-delay_evt_secondary',
      'escrow_ship_1',
      'ship_session_1',
    ];
  }
  if (lower.includes('bridge outage')) {
    return [
      'incident-response_evt_primary',
      'incident-response_evt_secondary',
      'escrow_incident_1',
      'incident_session_1',
    ];
  }
  return [
    'treasury-rotation_evt_primary',
    'treasury-rotation_evt_secondary',
    'escrow_governance_1',
    'governance_session_1',
  ];
}

function branchFlavor(
  description: string
): 'baseline' | 'aggressive' | 'verify_first' | 'safe_exit' {
  const lower = description.toLowerCase();
  if (lower.includes('verify snapshot') || lower.includes('enumerate mission risks'))
    return 'verify_first';
  if (lower.includes('decisive action')) return 'aggressive';
  if (lower.includes('reversible, low-risk outcomes') || lower.includes('exit options'))
    return 'safe_exit';
  return 'baseline';
}

function scenarioFlavor(description: string): 'ship' | 'incident' | 'governance' {
  const lower = description.toLowerCase();
  if (lower.includes('candidate build')) return 'ship';
  if (lower.includes('bridge outage')) return 'incident';
  return 'governance';
}

function metricsForBranch(
  scenario: 'ship' | 'incident' | 'governance',
  branch: 'baseline' | 'aggressive' | 'verify_first' | 'safe_exit'
) {
  if (scenario === 'ship') {
    if (branch === 'aggressive')
      return {
        amount: 0.34,
        waitMs: 60,
        riskFlags: ['rollback_gap'],
        refs: 2,
        verdict: 'push now',
      };
    if (branch === 'verify_first')
      return {
        amount: 0.24,
        waitMs: 90,
        riskFlags: [],
        refs: 4,
        verdict: 'ship after one more receipt pass',
      };
    if (branch === 'safe_exit')
      return {
        amount: 0.16,
        waitMs: 120,
        riskFlags: [],
        refs: 3,
        verdict: 'delay for a reversible release window',
      };
    return {
      amount: 0.2,
      waitMs: 75,
      riskFlags: [],
      refs: 4,
      verdict: 'ship with guarded rollout gates',
    };
  }
  if (scenario === 'incident') {
    if (branch === 'aggressive')
      return {
        amount: 0.31,
        waitMs: 55,
        riskFlags: ['blast_radius_unknown'],
        refs: 2,
        verdict: 'patch immediately and absorb risk',
      };
    if (branch === 'verify_first')
      return {
        amount: 0.23,
        waitMs: 85,
        riskFlags: [],
        refs: 4,
        verdict: 'contain first, verify dependencies, then restore',
      };
    if (branch === 'safe_exit')
      return {
        amount: 0.17,
        waitMs: 105,
        riskFlags: [],
        refs: 3,
        verdict: 'freeze flows and wait for human sign-off',
      };
    return {
      amount: 0.22,
      waitMs: 80,
      riskFlags: [],
      refs: 3,
      verdict: 'roll forward with guarded checks',
    };
  }
  if (branch === 'aggressive')
    return {
      amount: 0.32,
      waitMs: 58,
      riskFlags: ['slippage_risk'],
      refs: 2,
      verdict: 'rotate hard before the vote opens',
    };
  if (branch === 'verify_first')
    return {
      amount: 0.25,
      waitMs: 88,
      riskFlags: [],
      refs: 4,
      verdict: 'prove liquidity and rotate in stages',
    };
  if (branch === 'safe_exit')
    return {
      amount: 0.15,
      waitMs: 95,
      riskFlags: [],
      refs: 4,
      verdict: 'de-risk with the smallest reversible move',
    };
  return {
    amount: 0.21,
    waitMs: 78,
    riskFlags: [],
    refs: 3,
    verdict: 'rotate on schedule with standard guardrails',
  };
}

async function main() {
  const tempDataDir = mkdtempSync(path.join(tmpdir(), 'kamiyo-reality-fork-'));
  process.env.DATA_DIR = tempDataDir;
  process.env.JWT_SECRET = 'reality-fork-launch-secret';
  process.env.COMPANION_RUNTIME_PROFILE = 'full';
  process.env.COMPANION_ROUTE_SURFACE = 'full';

  const observatoryServer = await startServer(createObservatoryServer());
  process.env.OBSERVATORY_BASE_URL = observatoryServer.baseUrl;

  const [{ default: db, closeDatabase }, { createApiServer }, { __setSwarmTaskExecutorForTests }] =
    await Promise.all([
      import('../services/api/src/db'),
      import('../services/api/src/api/index'),
      import('../services/api/src/swarm/service'),
    ]);

  __setSwarmTaskExecutorForTests(async input => {
    const scenario = scenarioFlavor(input.description);
    const branch = branchFlavor(input.description);
    const metrics = metricsForBranch(scenario, branch);
    const refs = evidenceRefsForDescription(input.description).slice(0, metrics.refs);
    await new Promise(resolve => setTimeout(resolve, metrics.waitMs));
    return {
      taskId: input.taskId,
      status: 'completed',
      amountDrawn: metrics.amount,
      output: {
        output: {
          result: `${policyLabel(branch)} branch verdict: ${metrics.verdict}.`,
          evidenceRefs: refs,
        },
        riskFlags: metrics.riskFlags,
      },
      riskFlags: metrics.riskFlags,
    };
  });

  function policyLabel(branch: 'baseline' | 'aggressive' | 'verify_first' | 'safe_exit') {
    switch (branch) {
      case 'aggressive':
        return 'Aggressive';
      case 'verify_first':
        return 'Verify First';
      case 'safe_exit':
        return 'Safe Exit';
      default:
        return 'Baseline';
    }
  }

  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `
    INSERT INTO swarm_teams (id, name, currency, daily_limit, pool_balance, owner_wallet, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run('team-1', 'Reality Fork Demo Team', 'USD', 1000, 1000, 'wallet-1', now, now);

  db.prepare(
    `
    INSERT INTO swarm_team_members (id, team_id, agent_id, role, draw_limit, added_at)
    VALUES
      ('mem-a', 'team-1', 'agent-a', 'research', 10, ?),
      ('mem-b', 'team-1', 'agent-b', 'ops', 10, ?)
  `
  ).run(now, now);

  const app = createApiServer();
  const appServer = createServer(app);
  const appBinding = await startServer(appServer);
  const token = sign(
    { wallet: 'wallet-1', tier: 'pro', balance: 1_000_000 },
    process.env.JWT_SECRET!,
    {
      expiresIn: '1h',
    }
  );
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  for (const scenario of scenarios) {
    const createResponse = await fetch(
      `${appBinding.baseUrl}/api/hive-teams/team-1/control-room/cases`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mission: scenario.mission,
          snapshotSource: {
            type: 'observatory_session',
            ref: scenario.sessionId,
          },
        }),
      }
    );
    if (!createResponse.ok) {
      throw new Error(`failed to create ${scenario.id}: ${createResponse.status}`);
    }
    const created = (await createResponse.json()) as { caseId: string };

    const runResponse = await fetch(
      `${appBinding.baseUrl}/api/hive-teams/team-1/control-room/cases/${created.caseId}/run`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          baselinePlan: scenario.baselinePlan,
          maxParallel: 3,
        }),
      }
    );
    if (!runResponse.ok) {
      throw new Error(`failed to run ${scenario.id}: ${runResponse.status}`);
    }
    const detail = await runResponse.json();
    const bundle = createRealityForkFixtureBundle(detail, {
      id: scenario.id,
      slug: scenario.id,
      title: scenario.title,
      summary: scenario.summary,
      tagline: scenario.tagline,
      tags: scenario.tags,
    });
    assertRealityForkFixtureBundle(bundle);
    const outputPath = path.join(fixtureDirectory(), `${scenario.id}.json`);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
    console.log(`generated ${scenario.id}`);
  }

  await appBinding.close();
  await observatoryServer.close();
  __setSwarmTaskExecutorForTests(null);
  closeDatabase();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
