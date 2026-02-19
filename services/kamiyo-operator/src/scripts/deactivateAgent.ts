import { Connection } from '@solana/web3.js';
import { KamiyoClient } from '@kamiyo/sdk';

import { KeypairWallet } from '../anchorWallet.js';
import { loadOperatorKeypair } from '../wallet.js';

function readFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return;
  return process.argv[idx + 1];
}

async function main() {
  const rpcUrl =
    readFlag('--rpc')?.trim() ||
    process.env.SOLANA_RPC_URL?.trim() ||
    'https://api.mainnet-beta.solana.com';

  const keypairPath =
    readFlag('--keypair')?.trim() ||
    process.env.KAMIYO_OPERATOR_KEYPAIR_PATH?.trim() ||
    (process.env.HOME
      ? `${process.env.HOME}/local/token-launch/wallets/program-authority.json`
      : undefined);

  if (!keypairPath) {
    throw new Error('Missing keypair. Provide --keypair <path> or set KAMIYO_OPERATOR_KEYPAIR_PATH.');
  }

  const { keypair } = loadOperatorKeypair({ KAMIYO_OPERATOR_KEYPAIR_PATH: keypairPath });

  const connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 120_000,
  });

  const wallet = new KeypairWallet(keypair);
  const client = new KamiyoClient({ connection, wallet });

  const [pda] = client.getAgentPDA(wallet.publicKey);
  const before = await client.getAgent(pda);
  if (!before) throw new Error(`No agent found for owner ${wallet.publicKey.toBase58()}`);

  if (!before.isActive) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          status: 'already_inactive',
          owner: wallet.publicKey.toBase58(),
          agentPda: pda.toBase58(),
        },
        null,
        2
      )
    );
    return;
  }

  const signature = await client.deactivateAgent();
  const after = await client.getAgent(pda);

  console.log(
    JSON.stringify(
      {
        ok: true,
        signature,
        owner: wallet.publicKey.toBase58(),
        agentPda: pda.toBase58(),
        before: {
          name: before.name,
          isActive: before.isActive,
          stakeAmountLamports: before.stakeAmount.toString(),
        },
        after: after
          ? {
              name: after.name,
              isActive: after.isActive,
              stakeAmountLamports: after.stakeAmount.toString(),
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
