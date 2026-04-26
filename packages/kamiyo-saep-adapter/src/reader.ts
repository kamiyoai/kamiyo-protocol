import type { Commitment, Connection, PublicKey } from '@solana/web3.js';

import { decodeTaskContract, type DecoderConfig } from './decoder.js';
import { SaepAdapterError } from './errors.js';
import { deriveTaskPda, type SaepProgramIds } from './pda.js';
import type { SaepTaskSnapshot, SolanaCluster } from './types.js';

export interface ReaderConfig {
  /** Solana RPC connection. Pass one obtained from @kamiyo/sdk's RpcPool. */
  connection: Connection;
  /** Cluster the connection points at; stamped onto every snapshot. */
  cluster: SolanaCluster;
  /** SAEP program ids to derive PDAs against. */
  programIds: SaepProgramIds;
  /** Override the expected Anchor account discriminator. */
  expectedDiscriminator?: Buffer;
  /** Default commitment for reads. Defaults to "confirmed". */
  commitment?: Commitment;
  /** Test-only: skip the discriminator check on decoded bytes. */
  skipDiscriminatorCheck?: boolean;
}

/**
 * High-level reader that fetches a SAEP `TaskContract` account and returns a
 * decoded {@link SaepTaskSnapshot}. KAMIYO never signs SAEP transactions; this
 * reader is read-only.
 */
export class SaepReader {
  constructor(private readonly cfg: ReaderConfig) {}

  /**
   * Fetch and decode a TaskContract by its PDA. Throws
   * {@link SaepAdapterError} `rpc_account_not_found` when the account
   * doesn't exist; `rpc_unreachable` on transport failure; decoder errors
   * propagate with their own codes.
   */
  async fetchTaskByPda(taskPda: PublicKey): Promise<SaepTaskSnapshot> {
    const commitment = this.cfg.commitment ?? 'confirmed';

    let response: Awaited<ReturnType<Connection['getAccountInfoAndContext']>>;
    try {
      response = await this.cfg.connection.getAccountInfoAndContext(taskPda, commitment);
    } catch (err) {
      throw new SaepAdapterError('rpc_unreachable', 'Failed to fetch SAEP TaskContract account', {
        taskPda: taskPda.toBase58(),
        cause: (err as Error).message,
      });
    }

    if (!response.value) {
      throw new SaepAdapterError('rpc_account_not_found', 'SAEP TaskContract account not found', {
        taskPda: taskPda.toBase58(),
      });
    }

    const decoderCfg: DecoderConfig = {
      cluster: this.cfg.cluster,
      slot: response.context.slot,
      taskPda,
      ...(this.cfg.expectedDiscriminator !== undefined && {
        expectedDiscriminator: this.cfg.expectedDiscriminator,
      }),
      ...(this.cfg.skipDiscriminatorCheck !== undefined && {
        skipDiscriminatorCheck: this.cfg.skipDiscriminatorCheck,
      }),
    };

    return decodeTaskContract(Buffer.from(response.value.data), decoderCfg);
  }

  /**
   * Convenience wrapper: derive the TaskContract PDA from `(client, nonce)`
   * and fetch it.
   */
  async fetchTaskById(client: PublicKey, taskNonce: Uint8Array): Promise<SaepTaskSnapshot> {
    const { pda } = deriveTaskPda(client, taskNonce, this.cfg.programIds);
    return this.fetchTaskByPda(pda);
  }
}
