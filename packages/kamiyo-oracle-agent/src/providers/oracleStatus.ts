import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import type { Provider, IAgentRuntime, Memory, State } from '../types';
import { getNetworkConfig, PROGRAM_IDS, ORACLE_CONSTANTS } from '../config';

export const oracleStatusProvider: Provider = {
  name: 'oracle-status',
  description: 'Provides oracle registration status and stake information',

  async get(runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<string> {
    try {
      const { rpcUrl, network } = getNetworkConfig(runtime);
      const connection = new Connection(rpcUrl, 'confirmed');
      const programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);

      const privateKeyStr = runtime.getSetting('ORACLE_PRIVATE_KEY');
      if (!privateKeyStr) {
        return '[oracle:status] not configured - ORACLE_PRIVATE_KEY missing';
      }

      const keypair = Keypair.fromSecretKey(Buffer.from(privateKeyStr, 'base64'));
      const pubkey = keypair.publicKey;

      // Check wallet balance
      const balance = await connection.getBalance(pubkey);
      const balanceSol = balance / 1e9;

      // Check oracle registry
      const oracleInfo = await getOracleInfo(connection, programId, pubkey);

      if (!oracleInfo.registered) {
        return `[oracle:status] ${pubkey.toBase58().slice(0, 8)}... balance=${balanceSol.toFixed(4)}SOL NOT_REGISTERED`;
      }

      const violationsLeft = ORACLE_CONSTANTS.VIOLATION_LIMIT - oracleInfo.violationCount;
      const riskFlag = violationsLeft <= 1 ? ' RISK:HIGH' : '';

      return `[oracle:status] ${pubkey.toBase58().slice(0, 8)}... balance=${balanceSol.toFixed(4)}SOL stake=${oracleInfo.stake.toFixed(4)}SOL violations=${oracleInfo.violationCount}/${ORACLE_CONSTANTS.VIOLATION_LIMIT} rewards=${oracleInfo.pendingRewards.toFixed(6)}SOL${riskFlag}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[oracle:status] error: ${msg}`;
    }
  },
};

interface OracleInfo {
  registered: boolean;
  stake: number;
  violationCount: number;
  pendingRewards: number;
  weight: number;
}

async function getOracleInfo(
  connection: Connection,
  programId: PublicKey,
  oraclePubkey: PublicKey
): Promise<OracleInfo> {
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('oracle_registry')],
    programId
  );

  const accountInfo = await connection.getAccountInfo(registryPda);
  if (!accountInfo) {
    return {
      registered: false,
      stake: 0,
      violationCount: 0,
      pendingRewards: 0,
      weight: 0,
    };
  }

  // Simplified - would need proper Anchor deserialization
  // Check if oracle pubkey exists in the registry
  const data = accountInfo.data;
  const oracleKey = oraclePubkey.toBase58();

  // Placeholder: In production, deserialize the OracleRegistry account
  // and search for the oracle in the oracles array
  return {
    registered: true, // Assume registered for now
    stake: 1.0,
    violationCount: 0,
    pendingRewards: 0,
    weight: 100,
  };
}
