import type { Provider, IAgentRuntime, Memory, State } from '../types';
import { getNetworkConfig, getKeypair, createConnection, lamportsToSol } from '../utils';

export const walletProvider: Provider = {
  async get(runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<string> {
    const { network, rpcUrl } = getNetworkConfig(runtime);
    const keypair = getKeypair(runtime);

    if (!keypair) return '[kamiyo:wallet] not configured';

    try {
      const connection = createConnection(rpcUrl);
      const balance = await connection.getBalance(keypair.publicKey);
      const escrows = (await runtime.getState?.('kamiyo_escrows')) as { active?: number } | undefined;

      return `[kamiyo:wallet] ${keypair.publicKey.toString().slice(0, 8)}... ${lamportsToSol(balance).toFixed(4)} SOL ${network} escrows=${escrows?.active || 0}`;
    } catch (err) {
      return `[kamiyo:wallet] error`;
    }
  },
};
