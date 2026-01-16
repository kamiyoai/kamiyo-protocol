import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { MitamaClient } from '@kamiyo/kamiyo-mitama';

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const walletSecret = process.env.DEMO_WALLET_SECRET!;
  const keypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));

  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new MitamaClient(provider);

  // Check if registry exists
  const registry = await client.getRegistry();
  if (registry) {
    console.log('Registry already exists:', registry);
    return;
  }

  console.log('Initializing registry on devnet...');
  console.log('Authority:', keypair.publicKey.toBase58());

  const sig = await client.initializeRegistry(keypair, {
    minStake: new BN(10000000), // 0.01 SOL
    minSignalConfidence: 50,
  });

  console.log('Registry initialized!');
  console.log('Signature:', sig);

  // Verify
  const newRegistry = await client.getRegistry();
  console.log('Registry:', newRegistry);
}

main().catch(console.error);
