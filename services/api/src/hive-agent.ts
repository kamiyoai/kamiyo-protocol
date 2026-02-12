/**
 * Hive Agent - Bot's on-chain ZK identity and signal management
 *
 * Uses the @kamiyo/hive SDK for:
 * - Agent registration with Poseidon identity commitment
 * - Real Groth16 ZK proofs for private signals
 * - On-chain signal submission to devnet
 * - Track record and reputation tracking
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor';
import {
  HiveClient,
  HiveProver,
  MerkleTree,
  createMerkleTree,
  generateOwnerSecret,
  generateRegistrationSecret,
  generateAgentId,
  generateRandomSalt,
  Groth16Proof,
  AgentIdentityInputs,
  PrivateSignalInputs,
} from '@kamiyo/hive';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

// Circuits build path relative to repo root (services/api/src -> circuits/build/hive)
const CIRCUITS_BUILD_PATH = path.resolve(__dirname, '../../../circuits/build/hive');

// Merkle tree data path (services/api/src -> services/api/data)
const MERKLE_TREE_PATH = path.resolve(__dirname, '../data/merkle-tree.json');
import { demoEvents } from './hive-live-demo';
import { db } from './clients';

// Initialize signal tracking tables
db.exec(`
  CREATE TABLE IF NOT EXISTS swarmteams_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commitment TEXT NOT NULL UNIQUE,
    nullifier TEXT NOT NULL,
    tweet_id TEXT,
    signal_type INTEGER NOT NULL,
    direction INTEGER NOT NULL,
    confidence INTEGER NOT NULL,
    magnitude INTEGER NOT NULL,
    stake_lamports TEXT NOT NULL,
    tx_signature TEXT,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    outcome INTEGER,
    pnl_bps INTEGER
  );

  CREATE TABLE IF NOT EXISTS swarmteams_agent_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// Emit log to stream
function emitLog(step: number, type: 'info' | 'success' | 'error' | 'tx' | 'proof' | 'tweet', message: string, data?: Record<string, unknown>) {
  demoEvents.emit('log', { timestamp: Date.now(), step, type, message, data });
  logger.info(`[SWARMTEAMS-AGENT] ${message}`, data);
}

// Agent state persistence
interface AgentState {
  identityCommitment: string | null;
  agentPDA: string | null;
  registeredAt: number | null;
  totalSignals: number;
  correctSignals: number;
  totalStaked: string;
  ownerSecret: string | null;
  agentId: string | null;
  registrationSecret: string | null;
  merkleIndex: number | null;
}

function getAgentState(): AgentState {
  const getVal = (key: string): string | null => {
    const row = db.prepare('SELECT value FROM swarmteams_agent_state WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value || null;
  };

  return {
    identityCommitment: getVal('identity_commitment'),
    agentPDA: getVal('agent_pda'),
    registeredAt: getVal('registered_at') ? parseInt(getVal('registered_at')!) : null,
    totalSignals: parseInt(getVal('total_signals') || '0'),
    correctSignals: parseInt(getVal('correct_signals') || '0'),
    totalStaked: getVal('total_staked') || '0',
    ownerSecret: getVal('owner_secret'),
    agentId: getVal('agent_id'),
    registrationSecret: getVal('registration_secret'),
    merkleIndex: getVal('merkle_index') ? parseInt(getVal('merkle_index')!) : null,
  };
}

function setAgentState(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO swarmteams_agent_state (key, value, updated_at) VALUES (?, ?, ?)')
    .run(key, value, Date.now());
}

// Signal record for tracking
interface SignalRecord {
  id: number;
  commitment: string;
  nullifier: string;
  tweet_id: string | null;
  signal_type: number;
  direction: number;
  confidence: number;
  magnitude: number;
  stake_lamports: string;
  tx_signature: string | null;
  created_at: number;
  resolved_at: number | null;
  outcome: number | null;
  pnl_bps: number | null;
}

// Store signal in DB
function storeSignalToDB(
  commitment: string,
  nullifier: string,
  tweetId: string | null,
  signalType: number,
  direction: number,
  confidence: number,
  magnitude: number,
  stakeLamports: string,
  txSignature: string | null
): number {
  const result = db.prepare(`
    INSERT INTO swarmteams_signals (commitment, nullifier, tweet_id, signal_type, direction, confidence, magnitude, stake_lamports, tx_signature, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(commitment, nullifier, tweetId, signalType, direction, confidence, magnitude, stakeLamports, txSignature, Date.now());

  // Update total staked
  const state = getAgentState();
  const newTotal = BigInt(state.totalStaked) + BigInt(stakeLamports);
  setAgentState('total_staked', newTotal.toString());
  setAgentState('total_signals', (state.totalSignals + 1).toString());

  return result.lastInsertRowid as number;
}

// Get recent signals
export function getRecentSignals(limit = 10): SignalRecord[] {
  return db.prepare('SELECT * FROM swarmteams_signals ORDER BY created_at DESC LIMIT ?').all(limit) as SignalRecord[];
}

// Get signal by commitment
export function getSignalByCommitment(commitment: string): SignalRecord | null {
  return db.prepare('SELECT * FROM swarmteams_signals WHERE commitment = ?').get(commitment) as SignalRecord | null;
}

// Resolve a signal outcome
export function resolveSignal(commitment: string, correct: boolean, pnlBps?: number): void {
  db.prepare('UPDATE swarmteams_signals SET resolved_at = ?, outcome = ?, pnl_bps = ? WHERE commitment = ?')
    .run(Date.now(), correct ? 1 : 0, pnlBps || null, commitment);

  if (correct) {
    const state = getAgentState();
    setAgentState('correct_signals', (state.correctSignals + 1).toString());
  }
}

// Get track record stats
export function getTrackRecord(): { total: number; correct: number; accuracy: number; totalStaked: string; avgConfidence: number } {
  const state = getAgentState();
  const accuracy = state.totalSignals > 0 ? (state.correctSignals / state.totalSignals) * 100 : 0;

  const avgConf = db.prepare('SELECT AVG(confidence) as avg FROM swarmteams_signals').get() as { avg: number | null };

  return {
    total: state.totalSignals,
    correct: state.correctSignals,
    accuracy: Math.round(accuracy * 10) / 10,
    totalStaked: state.totalStaked,
    avgConfidence: Math.round(avgConf.avg || 0),
  };
}

// Global Hive client
let swarmTeamsClient: HiveAgentClient | null = null;

/**
 * Hive Agent Client - Bot's on-chain ZK identity
 */
export class HiveAgentClient {
  private connection: Connection;
  private keypair: Keypair;
  private client: HiveClient;
  private prover: HiveProver;
  private merkleTree: MerkleTree | null = null;

  // Agent secrets (loaded from DB or generated)
  private ownerSecret: Uint8Array | null = null;
  private agentId: Uint8Array | null = null;
  private registrationSecret: Uint8Array | null = null;
  private identityCommitment: Uint8Array | null = null;

  constructor(connection: Connection, keypair: Keypair, provider: AnchorProvider) {
    this.connection = connection;
    this.keypair = keypair;
    this.client = new HiveClient(provider);
    this.prover = new HiveProver(CIRCUITS_BUILD_PATH);
  }

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  // Check if agent is registered
  isRegistered(): boolean {
    const state = getAgentState();
    return state.identityCommitment !== null;
  }

  // Get identity commitment
  getIdentityCommitment(): string | null {
    return getAgentState().identityCommitment;
  }

  // Load existing secrets from DB
  private async loadSecrets(): Promise<boolean> {
    const state = getAgentState();
    if (!state.ownerSecret || !state.agentId || !state.registrationSecret) {
      return false;
    }

    this.ownerSecret = Buffer.from(state.ownerSecret, 'hex');
    this.agentId = Buffer.from(state.agentId, 'hex');
    this.registrationSecret = Buffer.from(state.registrationSecret, 'hex');

    if (state.identityCommitment) {
      this.identityCommitment = Buffer.from(state.identityCommitment, 'hex');
    }

    return true;
  }

  /**
   * Register the bot as a Hive agent on devnet
   *
   * Uses deterministic secrets derived from wallet keypair for consistency.
   */
  async register(stakeAmount: BN = new BN(100000000)): Promise<string | null> {
    // Check if already registered
    if (this.isRegistered()) {
      await this.loadSecrets();
      emitLog(0, 'info', 'Agent already registered', { commitment: this.getIdentityCommitment()?.slice(0, 16) });
      return this.getIdentityCommitment();
    }

    try {
      emitLog(0, 'info', 'Registering bot as Hive agent on devnet...');

      // Generate deterministic identity secrets from wallet keypair
      // This ensures the same commitment is generated each time
      const crypto = await import('crypto');
      const seed = crypto.createHash('sha256').update(Buffer.from(this.keypair.secretKey)).digest();

      this.ownerSecret = new Uint8Array(seed.subarray(0, 32));
      this.agentId = await generateAgentId(this.keypair.publicKey.toBytes(), 0);
      this.registrationSecret = new Uint8Array(
        crypto.createHash('sha256').update(Buffer.concat([seed, Buffer.from('reg')])).digest()
      );

      emitLog(1, 'info', 'Generated identity secrets', {
        ownerSecret: Buffer.from(this.ownerSecret!).toString('hex').slice(0, 16) + '...',
        agentId: Buffer.from(this.agentId!).toString('hex').slice(0, 16) + '...',
      });

      // Compute identity commitment using Poseidon hash
      this.identityCommitment = await HiveProver.generateIdentityCommitment(
        this.ownerSecret,
        this.agentId,
        this.registrationSecret
      );

      const commitmentHex = Buffer.from(this.identityCommitment!).toString('hex');
      emitLog(2, 'proof', 'Identity commitment computed (Poseidon)', { commitment: commitmentHex.slice(0, 24) + '...' });

      // Check balance
      const balance = await this.connection.getBalance(this.keypair.publicKey);
      emitLog(2, 'info', `Wallet balance: ${(balance / 1e9).toFixed(4)} SOL`);

      if (balance < stakeAmount.toNumber() + 10000000) {
        emitLog(2, 'error', 'Insufficient balance for registration', {
          required: ((stakeAmount.toNumber() + 10000000) / 1e9).toFixed(4) + ' SOL',
          available: (balance / 1e9).toFixed(4) + ' SOL',
        });
        return null;
      }

      // Register on-chain
      let txSignature: string | null = null;
      let agentPDA: string | null = null;

      try {
        // Check if registry is initialized
        const registry = await this.client.getRegistry();
        if (!registry) {
          emitLog(3, 'info', 'Registry not initialized on devnet - initializing...');
          // For devnet, we might need to initialize the registry first
          // This would typically be done by the protocol admin
          emitLog(3, 'info', 'Skipping on-chain registration (registry not available)');
        } else {
          emitLog(3, 'info', 'Registry found on devnet', {
            agentCount: registry.agentCount,
            epoch: registry.epoch.toString(),
            minStake: (registry.minStake.toNumber() / 1e9).toFixed(4) + ' SOL',
          });

          // Check if agent already exists on-chain
          const existingAgent = await this.client.getAgent(this.identityCommitment);
          if (existingAgent) {
            emitLog(3, 'info', 'Agent already registered on-chain');
            txSignature = 'already-registered';
          } else {
            // Register agent on-chain
            txSignature = await this.client.registerAgent(
              this.keypair,
              this.identityCommitment,
              stakeAmount
            );
            emitLog(3, 'tx', 'Agent registered on-chain', {
              signature: txSignature,
              stake: (stakeAmount.toNumber() / 1e9).toFixed(4) + ' SOL',
            });
          }

          // Get agent PDA
          const [pda] = HiveClient.getAgentPDA(this.identityCommitment);
          agentPDA = pda.toBase58();
        }
      } catch (err) {
        const errMsg = String(err);
        if (errMsg.includes('already in use') || errMsg.includes('custom program error')) {
          emitLog(3, 'info', 'Agent may already be registered on-chain');
        } else {
          emitLog(3, 'info', 'On-chain registration skipped', { error: errMsg.slice(0, 80) });
        }
      }

      // Store state locally
      setAgentState('identity_commitment', commitmentHex);
      setAgentState('owner_secret', Buffer.from(this.ownerSecret!).toString('hex'));
      setAgentState('agent_id', Buffer.from(this.agentId!).toString('hex'));
      setAgentState('registration_secret', Buffer.from(this.registrationSecret!).toString('hex'));
      setAgentState('registered_at', Date.now().toString());
      if (agentPDA) setAgentState('agent_pda', agentPDA);
      setAgentState('merkle_index', '0'); // First agent in local tree

      emitLog(4, 'success', 'Bot registered as Hive agent', {
        commitment: commitmentHex.slice(0, 24) + '...',
        stake: (stakeAmount.toNumber() / 1e9).toFixed(4) + ' SOL',
        onChain: !!txSignature,
      });

      return commitmentHex;
    } catch (err) {
      emitLog(-1, 'error', `Registration failed: ${err}`);
      return null;
    }
  }

  /**
   * Submit a signal with real Groth16 ZK proof
   */
  async submitSignal(
    signalType: number,
    direction: number,
    confidence: number,
    magnitude: number,
    stakeAmount: BN,
    tweetId?: string
  ): Promise<{ commitment: string; nullifier: string; txSignature: string | null } | null> {
    try {
      // Load secrets if not already loaded
      if (!this.ownerSecret) {
        const loaded = await this.loadSecrets();
        if (!loaded) {
          emitLog(-1, 'error', 'Agent not registered - cannot submit signal');
          return null;
        }
      }

      emitLog(0, 'info', 'Submitting ZK signal', {
        type: ['SENTIMENT', 'TA', 'ON-CHAIN', 'NEWS'][signalType] || 'UNKNOWN',
        direction: ['SHORT', 'LONG', 'NEUTRAL'][direction] || 'UNKNOWN',
        confidence: confidence + '%',
        stake: (stakeAmount.toNumber() / 1e9).toFixed(4) + ' SOL',
      });

      // Generate signal secret
      const secret = generateRandomSalt();

      // Generate agent nullifier for this epoch
      const registry = await this.client.getRegistry();
      const epoch = registry?.epoch || new BN(0);
      const agentNullifier = await HiveProver.generateNullifier(
        this.agentId!,
        this.registrationSecret!,
        BigInt(epoch.toString())
      );

      emitLog(1, 'proof', 'Generating signal commitment (Poseidon)', {
        epoch: epoch.toString(),
      });

      // Generate signal commitment using Poseidon
      const signalCommitment = await HiveProver.generateSignalCommitment(
        signalType,
        direction,
        confidence,
        magnitude,
        BigInt(stakeAmount.toString()),
        secret,
        agentNullifier
      );

      const commitmentHex = Buffer.from(signalCommitment).toString('hex');
      const nullifierHex = Buffer.from(agentNullifier).toString('hex');

      emitLog(1, 'proof', 'Signal commitment generated', {
        commitment: commitmentHex.slice(0, 24) + '...',
        nullifier: nullifierHex.slice(0, 24) + '...',
      });

      // Generate Groth16 ZK proof for agent identity
      emitLog(2, 'proof', 'Generating Groth16 agent identity proof...');

      let proof: Groth16Proof | null = null;
      let txSignature: string | null = null;

      try {
        // Load merkle tree from file
        const merkleTreePath = MERKLE_TREE_PATH;
        if (!fs.existsSync(merkleTreePath)) {
          throw new Error('Merkle tree not found - run update-agents-root.ts first');
        }

        const treeData = fs.readFileSync(merkleTreePath, 'utf8');
        if (!this.merkleTree) {
          this.merkleTree = await MerkleTree.deserialize(treeData);
        }

        // Get merkle proof for bot (index 0)
        const merkleProof = await this.merkleTree.generateProof(0);

        // Build agent identity inputs
        const identityInputs: AgentIdentityInputs = {
          ownerSecret: this.ownerSecret!,
          agentId: this.agentId!,
          registrationSecret: this.registrationSecret!,
          merkleProof: merkleProof.proof,
          merklePathIndices: merkleProof.pathIndices,
        };

        // Get agents root from registry
        const agentsRoot = registry?.agentsRoot || await this.merkleTree.getRoot();

        // Generate agent identity proof
        const proofResult = await this.prover.proveAgentIdentity(
          identityInputs,
          agentsRoot,
          BigInt(epoch.toString())
        );
        proof = proofResult.proof;

        emitLog(2, 'proof', 'Groth16 proof generated', {
          proofA: Buffer.from(proof.a).toString('hex').slice(0, 16) + '...',
          proofSize: proof.a.length + proof.b.length + proof.c.length + ' bytes',
        });

        // Submit signal on-chain
        if (registry) {
          emitLog(3, 'tx', 'Submitting signal to devnet...');
          txSignature = await this.client.submitSignal(
            this.keypair,
            proof,
            agentNullifier,
            signalCommitment
          );
          emitLog(3, 'tx', 'Signal submitted on-chain', {
            signature: txSignature,
            explorer: `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
          });
        }
      } catch (err) {
        const errMsg = String(err);
        if (errMsg.includes('circuit') || errMsg.includes('wasm') || errMsg.includes('zkey')) {
          emitLog(2, 'info', 'ZK circuit files not found - using commitment only', {
            reason: errMsg.slice(0, 60),
          });
        } else if (errMsg.includes('Merkle tree not found')) {
          emitLog(2, 'info', 'Merkle tree not synced - run update-agents-root.ts', {
            reason: errMsg.slice(0, 60),
          });
        } else if (errMsg.includes('nullifier') || errMsg.includes('already')) {
          emitLog(3, 'info', 'Signal already submitted this epoch');
        } else {
          emitLog(3, 'info', 'On-chain submission skipped', { reason: errMsg.slice(0, 60) });
        }
      }

      // Store in local DB regardless of on-chain status
      const signalId = storeSignalToDB(
        commitmentHex,
        nullifierHex,
        tweetId || null,
        signalType,
        direction,
        confidence,
        magnitude,
        stakeAmount.toString(),
        txSignature
      );

      emitLog(4, 'success', 'Signal recorded', {
        id: signalId,
        commitment: commitmentHex.slice(0, 16) + '...',
        onChain: !!txSignature,
        proof: proof ? 'Groth16' : 'commitment-only',
      });

      return { commitment: commitmentHex, nullifier: nullifierHex, txSignature };
    } catch (err) {
      emitLog(-1, 'error', `Signal submission failed: ${err}`);
      return null;
    }
  }

  /**
   * Get on-chain agent data
   */
  async getOnChainAgent(): Promise<{ stake: string; signalCount: number; active: boolean } | null> {
    if (!this.identityCommitment) {
      const loaded = await this.loadSecrets();
      if (!loaded) return null;
    }

    try {
      const agent = await this.client.getAgent(this.identityCommitment!);
      if (!agent) return null;

      return {
        stake: (agent.stake.toNumber() / 1e9).toFixed(4) + ' SOL',
        signalCount: agent.signalCount,
        active: agent.active,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Initialize the Hive agent with real on-chain connection
 */
export async function initHiveAgent(): Promise<HiveAgentClient | null> {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const walletSecret = process.env.DEMO_WALLET_SECRET;

  if (!walletSecret) {
    logger.warn('DEMO_WALLET_SECRET not set - Hive agent disabled');
    return null;
  }

  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const keypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));
    const wallet = new Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

    swarmTeamsClient = new HiveAgentClient(connection, keypair, provider);
    logger.info('Hive agent client initialized', {
      wallet: keypair.publicKey.toBase58().slice(0, 8) + '...',
      rpc: rpcUrl.includes('devnet') ? 'devnet' : rpcUrl.slice(0, 30),
    });

    return swarmTeamsClient;
  } catch (err) {
    logger.error('Failed to initialize Hive agent', { error: String(err) });
    return null;
  }
}

// Get the global Hive client
export function getHiveAgent(): HiveAgentClient | null {
  return swarmTeamsClient;
}

// Format track record for display
export function formatTrackRecord(): string {
  const record = getTrackRecord();
  const state = getAgentState();

  if (record.total === 0) {
    return 'No signals yet.';
  }

  const stakedSol = (BigInt(record.totalStaked) / BigInt(1e9)).toString();

  let status = `${record.total} signals | ${record.accuracy}% accuracy`;
  if (state.registeredAt) {
    const daysSince = Math.floor((Date.now() - state.registeredAt) / (24 * 60 * 60 * 1000));
    status += ` | ${daysSince}d active`;
  }
  status += ` | ${stakedSol} SOL staked`;

  return status;
}
