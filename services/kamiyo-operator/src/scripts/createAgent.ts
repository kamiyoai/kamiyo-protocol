import anchor from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';
import { AgentType, KamiyoClient } from '@kamiyo/sdk';

import { KeypairWallet } from '../anchorWallet.js';
import { loadOperatorKeypair } from '../wallet.js';

const LAMPORTS_PER_SOL = 1_000_000_000;

function readFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return;
  return process.argv[idx + 1];
}

function parseAgentType(raw: string | undefined): AgentType {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return AgentType.Service;

  switch (v) {
    case 'trading':
      return AgentType.Trading;
    case 'service':
      return AgentType.Service;
    case 'oracle':
      return AgentType.Oracle;
    case 'custom':
      return AgentType.Custom;
    default:
      throw new Error('Invalid --type. Use Trading|Service|Oracle|Custom');
  }
}

async function main() {
  const { BN } = anchor;

  const rpcUrl =
    readFlag('--rpc')?.trim() ||
    process.env.SOLANA_RPC_URL?.trim() ||
    'https://api.mainnet-beta.solana.com';

  const keypairPath =
    readFlag('--keypair')?.trim() ||
    process.env.KAMIYO_OPERATOR_KEYPAIR_PATH?.trim() ||
    (process.env.HOME
      ? `${process.env.HOME}/local/token-launch/wallets/kamiyo-agent-hot.json`
      : undefined);

  if (!keypairPath) {
    throw new Error('Missing keypair. Provide --keypair <path> or set KAMIYO_OPERATOR_KEYPAIR_PATH.');
  }

  const name = (readFlag('--name')?.trim() || process.env.KAMIYO_AGENT_NAME?.trim() || 'kamiyo-agent').trim();
  const nameBytes = Buffer.byteLength(name, 'utf8');
  if (!name || nameBytes > 32) {
    throw new Error(`Invalid agent name. Must be 1..32 bytes (got ${nameBytes}).`);
  }

  const stakeSolRaw = readFlag('--stake-sol')?.trim() || process.env.KAMIYO_AGENT_STAKE_SOL?.trim() || '0.5';
  const stakeSol = Number(stakeSolRaw);
  if (!Number.isFinite(stakeSol) || stakeSol <= 0) {
    throw new Error('Invalid stake. Provide --stake-sol <number> > 0');
  }

  const agentType = parseAgentType(readFlag('--type') || process.env.KAMIYO_AGENT_TYPE);

  const { keypair } = loadOperatorKeypair({ KAMIYO_OPERATOR_KEYPAIR_PATH: keypairPath });

  const connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 120_000,
  });

  const wallet = new KeypairWallet(keypair);
  const client = new KamiyoClient({ connection, wallet });

  const [pda] = client.getAgentPDA(wallet.publicKey);
  const existing = await client.getAgent(pda);

  if (existing?.isActive) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          status: 'already_active',
          owner: wallet.publicKey.toBase58(),
          agentPda: pda.toBase58(),
          agent: {
            name: existing.name,
            agentType: existing.agentType,
            isActive: existing.isActive,
            stakeAmountLamports: existing.stakeAmount.toString(),
          },
        },
        null,
        2
      )
    );
    return;
  }

  if (existing && !existing.isActive) {
    throw new Error('Agent account exists but is inactive. Create a new owner wallet for a fresh agent.');
  }

  const lamports = Math.floor(stakeSol * LAMPORTS_PER_SOL);
  if (lamports < 100_000_000) {
    throw new Error('Stake too low. Minimum is 0.1 SOL.');
  }

  const signature = await client.createAgent({
    name,
    agentType,
    stakeAmount: new BN(lamports),
  });

  const agent = await client.getAgent(pda);

  console.log(
    JSON.stringify(
      {
        ok: true,
        status: 'created',
        signature,
        owner: wallet.publicKey.toBase58(),
        agentPda: pda.toBase58(),
        agent: agent
          ? {
              name: agent.name,
              agentType: agent.agentType,
              isActive: agent.isActive,
              stakeAmountLamports: agent.stakeAmount.toString(),
            }
          : null,
      },
      null,
      2
    )
  );
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
