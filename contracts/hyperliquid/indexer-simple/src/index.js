import express from 'express';
import pg from 'pg';
import { createPublicClient, http, parseAbiItem } from 'viem';

const { Pool } = pg;

const RPC_URL = process.env.RPC_URL || 'https://rpc.hyperliquid.xyz/evm';
const PORT = process.env.PORT || 10000;
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 10000);

const CONTRACTS = {
  AgentRegistry: '0xCa034D63c67ADd6CA127a575F0097C203DAcaE9d',
  KamiyoVault: '0xF5B2b62f014459B98991AaE001e33aF75f4fbD15',
  ReputationLimits: '0xbECa9c722EeF9897b5aa87363F3Bd9C94e16fE33',
};

const EVENTS = {
  AgentRegistered: parseAbiItem('event AgentRegistered(address indexed agent, address indexed owner, string name, uint256 stake)'),
  AgentDeactivated: parseAbiItem('event AgentDeactivated(address indexed agent)'),
  PositionOpened: parseAbiItem('event PositionOpened(uint256 indexed positionId, address indexed copier, address indexed agent, uint256 amount, uint8 leverage)'),
  PositionClosed: parseAbiItem('event PositionClosed(uint256 indexed positionId, uint256 finalValue, int256 pnl)'),
  DisputeFiled: parseAbiItem('event DisputeFiled(uint256 indexed positionId, address indexed filer, string reason)'),
  DisputeResolved: parseAbiItem('event DisputeResolved(uint256 indexed positionId, bool ruling, uint256 refundAmount)'),
};

let pool;
let client;
let lastBlock = 0;

// In-memory cache for API responses (also used in memory-only mode)
const cache = {
  agents: [],
  positions: [],
  disputes: [],
};

async function initDb() {
  const dbUrl = process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('No database URL configured, running in memory-only mode');
    return;
  }

  try {
    pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

    await pool.query(`
    CREATE TABLE IF NOT EXISTS agents (
      address TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      stake TEXT NOT NULL,
      registered_at BIGINT NOT NULL,
      block_number BIGINT NOT NULL,
      active BOOLEAN DEFAULT true
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      copier TEXT NOT NULL,
      agent TEXT NOT NULL,
      amount TEXT NOT NULL,
      leverage INTEGER NOT NULL,
      opened_at BIGINT NOT NULL,
      closed_at BIGINT,
      final_value TEXT,
      pnl TEXT,
      status TEXT DEFAULT 'open'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS disputes (
      position_id TEXT PRIMARY KEY,
      filer TEXT NOT NULL,
      reason TEXT,
      filed_at BIGINT NOT NULL,
      resolved BOOLEAN DEFAULT false,
      ruling BOOLEAN,
      refund_amount TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_block BIGINT NOT NULL
    )
  `);

    const result = await pool.query('SELECT last_block FROM sync_state WHERE id = 1');
    if (result.rows.length > 0) {
      lastBlock = Number(result.rows[0].last_block);
    }

    console.log('Database initialized, last synced block:', lastBlock);
  } catch (err) {
    console.warn('Database connection failed, running in memory-only mode:', err.message);
    pool = null;
  }
}

async function initClient() {
  client = createPublicClient({
    transport: http(RPC_URL),
  });

  if (lastBlock === 0) {
    lastBlock = Number(await client.getBlockNumber()) - 100;
    console.log('Starting from block:', lastBlock);
  }
}

async function pollEvents() {
  try {
    const currentBlock = Number(await client.getBlockNumber());
    if (currentBlock <= lastBlock) return;

    const fromBlock = BigInt(lastBlock + 1);
    const toBlock = BigInt(Math.min(currentBlock, lastBlock + 50)); // Max 50 blocks per poll

    console.log(`Polling blocks ${fromBlock} to ${toBlock}`);

    // Get AgentRegistry events
    const agentLogs = await client.getLogs({
      address: CONTRACTS.AgentRegistry,
      fromBlock,
      toBlock,
    });

    for (const log of agentLogs) {
      await processAgentLog(log);
    }

    // Get KamiyoVault events
    const vaultLogs = await client.getLogs({
      address: CONTRACTS.KamiyoVault,
      fromBlock,
      toBlock,
    });

    for (const log of vaultLogs) {
      await processVaultLog(log);
    }

    lastBlock = Number(toBlock);
    if (pool) {
      await pool.query(
        'INSERT INTO sync_state (id, last_block) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET last_block = $1',
        [lastBlock]
      );
    }
  } catch (err) {
    console.error('Poll error:', err.message);
  }
}

async function processAgentLog(log) {
  const topic0 = log.topics[0];

  if (topic0 === '0x023c5efe572c42192271951adb0e77f97d7fc84bc761d026189ac08617346824') {
    // AgentRegistered
    const agent = '0x' + log.topics[1].slice(26);
    const owner = '0x' + log.topics[2].slice(26);

    console.log('Agent registered:', agent);

    const agentData = {
      address: agent,
      owner,
      name: 'Agent',
      stake: '0',
      registered_at: Date.now(),
      block_number: Number(log.blockNumber),
      active: true,
    };

    if (pool) {
      await pool.query(
        `INSERT INTO agents (address, owner, name, stake, registered_at, block_number)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (address) DO NOTHING`,
        [agent, owner, 'Agent', '0', Date.now(), log.blockNumber]
      );
    } else {
      // Memory-only mode: add to cache if not already present
      if (!cache.agents.find(a => a.address === agent)) {
        cache.agents.push(agentData);
      }
    }
  }
}

async function processVaultLog(log) {
  const topic0 = log.topics[0];

  if (topic0 === '0x27e7e6d0173e2ba031fb7343d3ff8cbf346fcfb3f06537789def94ec1421a374') {
    // PositionOpened
    const positionId = log.topics[1];
    const copier = '0x' + log.topics[2].slice(26);
    const agent = '0x' + log.topics[3].slice(26);

    console.log('Position opened:', positionId);

    const positionData = {
      id: positionId,
      copier,
      agent,
      amount: '0',
      leverage: 1,
      opened_at: Date.now(),
      closed_at: null,
      final_value: null,
      pnl: null,
      status: 'open',
    };

    if (pool) {
      await pool.query(
        `INSERT INTO positions (id, copier, agent, amount, leverage, opened_at)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [positionId, copier, agent, '0', 1, Date.now()]
      );
    } else {
      // Memory-only mode: add to cache if not already present
      if (!cache.positions.find(p => p.id === positionId)) {
        cache.positions.push(positionData);
      }
    }
  }
}

async function refreshCache() {
  if (!pool) return;

  try {
    const agents = await pool.query('SELECT * FROM agents WHERE active = true ORDER BY stake DESC LIMIT 100');
    cache.agents = agents.rows;

    const positions = await pool.query('SELECT * FROM positions ORDER BY opened_at DESC LIMIT 100');
    cache.positions = positions.rows;

    const disputes = await pool.query('SELECT * FROM disputes ORDER BY filed_at DESC LIMIT 50');
    cache.disputes = disputes.rows;
  } catch (err) {
    console.error('Cache refresh error:', err.message);
  }
}

// Express API
const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', lastBlock, uptime: process.uptime() });
});

app.get('/graphql', (req, res) => {
  res.json({ message: 'Use POST for GraphQL queries' });
});

app.post('/graphql', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ errors: [{ message: 'Query required' }] });
  }

  // Simple GraphQL-like response
  if (query.includes('agents')) {
    return res.json({ data: { agents: cache.agents } });
  }
  if (query.includes('positions') || query.includes('copyPositions')) {
    return res.json({ data: { copyPositions: cache.positions } });
  }
  if (query.includes('disputes')) {
    return res.json({ data: { disputes: cache.disputes } });
  }

  res.json({ data: {} });
});

app.get('/api/agents', (req, res) => {
  res.json(cache.agents);
});

app.get('/api/agents/:address', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });

  const result = await pool.query('SELECT * FROM agents WHERE address = $1', [req.params.address.toLowerCase()]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json(result.rows[0]);
});

app.get('/api/positions', (req, res) => {
  const { copier, agent } = req.query;
  let filtered = cache.positions;

  if (copier) {
    filtered = filtered.filter(p => p.copier.toLowerCase() === copier.toLowerCase());
  }
  if (agent) {
    filtered = filtered.filter(p => p.agent.toLowerCase() === agent.toLowerCase());
  }

  res.json(filtered);
});

app.get('/api/disputes', (req, res) => {
  res.json(cache.disputes);
});

async function main() {
  await initDb();
  await initClient();

  // Start polling
  setInterval(pollEvents, POLL_INTERVAL);
  pollEvents();

  // Refresh cache periodically
  setInterval(refreshCache, 30000);
  refreshCache();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Indexer API running on port ${PORT}`);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
