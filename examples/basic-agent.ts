/**
 * Copyright (c) 2025 KAMIYO
 * SPDX-License-Identifier: MIT
 *
 * Basic example of creating a Kamiyo agent
 */

import { KamiyoClient, AgentType } from '@kamiyo/sdk';
import { Connection, Keypair } from '@solana/web3.js';
import BN from 'bn.js';

async function createBasicAgent() {
  // Generate a new wallet for the agent owner
  const wallet = Keypair.generate();

  console.log('Wallet created:', wallet.publicKey.toString());

  // Initialize the Kamiyo client
  const connection = new Connection('https://api.devnet.solana.com');
  const client = new KamiyoClient({
    connection,
    wallet: {
      publicKey: wallet.publicKey,
      signTransaction: async (tx) => { tx.sign(wallet); return tx; },
      signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(wallet)); return txs; },
    }
  });

  // Create a trading agent with 1 SOL initial stake
  const signature = await client.createAgent({
    name: 'BasicTradingBot',
    agentType: AgentType.Trading,
    stakeAmount: new BN(1_000_000_000)  // 1 SOL in lamports
  });

  console.log('Agent created successfully:');
  console.log('  Transaction signature:', signature);

  // Retrieve the agent to verify
  const [agentPDA] = client.getAgentPDA(wallet.publicKey);
  const agent = await client.getAgent(agentPDA);
  console.log('\nAgent retrieved:', agent?.name);
}

// Run the example
createBasicAgent()
  .then(() => console.log('\nExample completed successfully'))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
