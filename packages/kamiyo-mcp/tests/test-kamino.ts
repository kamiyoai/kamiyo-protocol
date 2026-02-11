#!/usr/bin/env node

import { Keypair, VersionedTransaction } from '@solana/web3.js';

import { SolanaClient } from '../src/solana/client.js';
import * as kamino from '../src/tools/kamino.js';

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const client = new SolanaClient(rpcUrl, Keypair.generate());

  const list = await kamino.kaminoListVaults({ limit: 5 });
  if (!list.success || !list.vaults || list.vaults.length === 0) {
    throw new Error(list.error || 'No vaults returned');
  }

  const suggested = await kamino.kaminoSuggestVaults({ limit: 3, apyWindow: 'apy30d', minAumUsd: 250_000 });
  if (!suggested.success || !suggested.vaults || suggested.vaults.length === 0) {
    throw new Error(suggested.error || 'No suggestions returned');
  }

  const picked = suggested.vaults[0];
  const metrics = await kamino.kaminoVaultMetrics({ vault: picked.vault });
  if (!metrics.success || !metrics.metrics) {
    throw new Error(metrics.error || 'Failed to fetch metrics');
  }

  const deposit = await kamino.kaminoDeposit(
    {
      vault: picked.vault,
      amount: '0.01',
      dryRun: true,
    },
    client
  );
  if (!deposit.success || !deposit.txBase64) {
    throw new Error(deposit.error || 'Failed to build deposit tx');
  }

  VersionedTransaction.deserialize(Buffer.from(deposit.txBase64, 'base64'));

  const withdraw = await kamino.kaminoWithdraw(
    {
      vault: picked.vault,
      amount: '0.01',
      dryRun: true,
    },
    client
  );
  if (!withdraw.success || !withdraw.txBase64) {
    throw new Error(withdraw.error || 'Failed to build withdraw tx');
  }

  VersionedTransaction.deserialize(Buffer.from(withdraw.txBase64, 'base64'));

  console.log(
    JSON.stringify(
      {
        ok: true,
        pickedVault: picked,
        aumUsd: metrics.aumUsd ?? null,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});

