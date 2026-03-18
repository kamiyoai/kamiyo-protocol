import { config } from 'dotenv';
config({ path: '.env' });

import { SapConnection } from '@oobe-protocol-labs/synapse-sap-sdk';
import { loadSolanaKeypair } from '../src/solana-keypair';
import { reconcileSapAgent } from '../src/sap-registration';
import { getSapBaseUrl } from '../src/sap';
import { resolveSolanaRpcUrl } from '../src/solana';

function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function main(): Promise<void> {
  const secret = process.env.SAP_AGENT_KEYPAIR?.trim();
  if (!secret) {
    throw new Error('SAP_AGENT_KEYPAIR is required');
  }

  const rpcUrl = resolveSolanaRpcUrl();
  if (SapConnection.detectCluster(rpcUrl) !== 'mainnet-beta') {
    throw new Error(`SAP registration is mainnet-only. Refusing RPC URL: ${rpcUrl}`);
  }

  const baseUrl = getSapBaseUrl();
  const parsedBaseUrl = new URL(baseUrl);
  if (parsedBaseUrl.hostname === 'localhost' || parsedBaseUrl.hostname === '127.0.0.1') {
    throw new Error(`API_BASE_URL must resolve to a public mainnet host. Got: ${baseUrl}`);
  }

  const keypair = loadSolanaKeypair(secret);
  const connection = SapConnection.mainnet(rpcUrl);
  const client = connection.fromKeypair(keypair);
  const balanceSol = await connection.getBalanceSol(keypair.publicKey);
  const [agentPda] = client.agent.deriveAgent();

  writeLine('SAP mainnet registration');
  writeLine(`wallet: ${keypair.publicKey.toBase58()}`);
  writeLine(`agent: ${agentPda.toBase58()}`);
  writeLine(`rpc: ${rpcUrl}`);
  writeLine(`api: ${baseUrl}`);
  writeLine(`balance_sol: ${balanceSol.toFixed(4)}`);

  const result = await reconcileSapAgent(client, baseUrl);

  writeLine(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
