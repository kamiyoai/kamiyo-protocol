/**
 * Copyright (c) 2025 KAMIYO
 * SPDX-License-Identifier: MIT
 *
 * Basic example of creating a Mitama agent
 */

import { MitamaSDK, AgentType } from '@mitama/sdk';
import { Keypair } from '@solana/web3.js';

async function createBasicAgent() {
  // Generate a new wallet for the agent owner
  const wallet = Keypair.generate();

  console.log('Wallet created:', wallet.publicKey.toString());

  // Initialize the Mitama SDK
  const sdk = new MitamaSDK({
    solanaRpc: 'https://api.devnet.solana.com',
    wallet
  });

  // Create a trading agent with 1 SOL initial stake
  const agent = await sdk.createAgent(
    wallet.publicKey,
    'BasicTradingBot',
    AgentType.Trading,
    1_000_000_000  // 1 SOL in lamports
  );

  console.log('Agent created successfully:');
  console.log('  PDA:', agent.pda.toString());
  console.log('  Name:', agent.name);
  console.log('  Type:', agent.type);
  console.log('  Owner:', agent.owner.toString());
  console.log('  Reputation:', agent.reputation.toString());
  console.log('  Stake:', agent.stakeAmount.toString());
  console.log('  Active:', agent.isActive);

  // Retrieve the agent to verify
  const retrieved = await sdk.getAgent(agent.pda);
  console.log('\nAgent retrieved:', retrieved.name);
}

// Run the example
createBasicAgent()
  .then(() => console.log('\nExample completed successfully'))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
