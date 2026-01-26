// Registry sync - fetches agents from on-chain and builds merkle tree

import { Connection, PublicKey } from '@solana/web3.js';
import { createMerkleTree, PoseidonMerkleTree, bytes32ToBigint, MerkleProof } from '@kamiyo/kamiyo-swarmteams-merkle';
import { PROGRAM_ID } from './connection.js';

const AGENT_ACCOUNT_DISCRIMINATOR = Buffer.from([
  // First 8 bytes of sha256("account:Agent")
  0x68, 0x97, 0x8f, 0xb3, 0x7f, 0xf2, 0x54, 0x08,
]);

interface AgentAccount {
  identityCommitment: Uint8Array;
  active: boolean;
}

export class RegistrySync {
  private connection: Connection;
  private tree: PoseidonMerkleTree | null = null;
  private agentCommitments: Map<string, number> = new Map(); // commitment hex -> index
  private lastSync: number = 0;
  private syncInterval = 60000; // 1 minute cache

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async sync(): Promise<void> {
    const now = Date.now();
    if (this.tree && now - this.lastSync < this.syncInterval) {
      return; // Use cached tree
    }

    // Create fresh tree
    this.tree = await createMerkleTree();
    this.agentCommitments.clear();

    // Fetch all agent accounts
    const agents = await this.fetchAllAgents();

    // Insert active agents into tree
    for (const agent of agents) {
      if (agent.active) {
        const commitment = bytes32ToBigint(agent.identityCommitment);
        const index = this.tree.insert(commitment);
        const commitmentHex = Buffer.from(agent.identityCommitment).toString('hex');
        this.agentCommitments.set(commitmentHex, index);
      }
    }

    this.lastSync = now;
  }

  private async fetchAllAgents(): Promise<AgentAccount[]> {
    try {
      // Fetch all program accounts with Agent discriminator
      const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: AGENT_ACCOUNT_DISCRIMINATOR.toString('base64'),
            },
          },
        ],
      });

      return accounts.map((account) => this.parseAgentAccount(account.account.data));
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      return [];
    }
  }

  private parseAgentAccount(data: Buffer): AgentAccount {
    // Account layout (after 8-byte discriminator):
    // registry: Pubkey (32 bytes)
    // identity_commitment: [u8; 32]
    // stake: u64 (8 bytes)
    // registered_slot: u64 (8 bytes)
    // signal_count: u32 (4 bytes)
    // swarm_votes: u32 (4 bytes)
    // active: bool (1 byte)

    const offset = 8; // Skip discriminator
    const identityCommitment = data.slice(offset + 32, offset + 64);
    const active = data[offset + 32 + 32 + 8 + 8 + 4 + 4] === 1;

    return {
      identityCommitment: new Uint8Array(identityCommitment),
      active,
    };
  }

  getRoot(): bigint {
    if (!this.tree) {
      throw new Error('Registry not synced');
    }
    return this.tree.getRoot();
  }

  getProof(commitmentHex: string): MerkleProof {
    if (!this.tree) {
      throw new Error('Registry not synced');
    }

    const index = this.agentCommitments.get(commitmentHex);
    if (index === undefined) {
      throw new Error('Agent not found in registry');
    }

    return this.tree.getProof(index);
  }

  getProofByCommitment(commitment: Uint8Array): MerkleProof {
    const hex = Buffer.from(commitment).toString('hex');
    return this.getProof(hex);
  }

  isAgentRegistered(commitmentHex: string): boolean {
    return this.agentCommitments.has(commitmentHex);
  }

  getAgentCount(): number {
    return this.agentCommitments.size;
  }

  // Demo mode: create a tree with just the current agent
  async createDemoTree(agentCommitment: Uint8Array): Promise<{ root: bigint; proof: MerkleProof }> {
    const tree = await createMerkleTree();
    const commitment = bytes32ToBigint(agentCommitment);
    tree.insert(commitment);

    return {
      root: tree.getRoot(),
      proof: tree.getProof(0),
    };
  }
}

let registrySyncInstance: RegistrySync | null = null;

export function getRegistrySync(connection: Connection): RegistrySync {
  if (!registrySyncInstance) {
    registrySyncInstance = new RegistrySync(connection);
  }
  return registrySyncInstance;
}
