import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { Provider, IAgentRuntime, Memory, State } from '../types';
import { NETWORKS } from '../types';

export const walletProvider: Provider = {
  async get(runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> {
    const network = (runtime.getSetting('KAMIYO_NETWORK') as 'mainnet' | 'devnet') || 'devnet';
    const config = NETWORKS[network];
    const privateKey = runtime.getSetting('SOLANA_PRIVATE_KEY');

    if (!privateKey) {
      return '[kamiyo:wallet] not configured';
    }

    try {
      const connection = new Connection(config.rpcUrl, 'confirmed');
      const keypair = Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
      const balance = await connection.getBalance(keypair.publicKey);

      const escrowState = await runtime.getState?.('kamiyo_escrows');
      const escrows = (escrowState as { active?: number; pending?: number }) || { active: 0, pending: 0 };

      return `[kamiyo:wallet] address=${keypair.publicKey.toString().slice(0, 8)}... balance=${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL network=${network} escrows=${escrows.active || 0} pending=${escrows.pending || 0}`;
    } catch (error) {
      return `[kamiyo:wallet] error=${error instanceof Error ? error.message : 'unknown'}`;
    }
  },
};
