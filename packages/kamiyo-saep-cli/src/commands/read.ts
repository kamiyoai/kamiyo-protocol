import { Connection, PublicKey } from '@solana/web3.js';
import {
  SaepAdapterError,
  SaepReader,
  normalizeSnapshot,
  type SolanaCluster,
} from '@kamiyo/saep-adapter';
import ora from 'ora';

import { printError, printJson } from '../output';

interface ReadOptions {
  cluster: SolanaCluster;
  json: boolean;
}

export async function runRead(taskPdaStr: string, options: ReadOptions): Promise<number> {
  const programIdRaw = process.env.SAEP_TASK_MARKET_PROGRAM_ID;
  if (!programIdRaw) {
    printError('SAEP_TASK_MARKET_PROGRAM_ID is required to decode SAEP accounts');
    return 1;
  }

  const rpcUrl =
    options.cluster === 'mainnet-beta'
      ? process.env.SOLANA_RPC_URL
      : process.env.SAEP_RPC_URL_DEVNET;
  if (!rpcUrl) {
    printError(
      `RPC URL is missing for cluster ${options.cluster}. Set ${
        options.cluster === 'mainnet-beta' ? 'SOLANA_RPC_URL' : 'SAEP_RPC_URL_DEVNET'
      }.`
    );
    return 1;
  }

  let taskPda: PublicKey;
  try {
    taskPda = new PublicKey(taskPdaStr);
  } catch {
    printError(`taskPda is not a valid Solana address: ${taskPdaStr}`);
    return 1;
  }

  const spinner = options.json ? null : ora(`Reading SAEP task ${taskPdaStr}`).start();
  try {
    const programIds = { taskMarket: new PublicKey(programIdRaw) };
    const discriminatorHex = process.env.SAEP_TASK_DISCRIMINATOR_HEX;
    const reader = new SaepReader({
      connection: new Connection(rpcUrl, 'confirmed'),
      cluster: options.cluster,
      programIds,
      ...(discriminatorHex && { expectedDiscriminator: Buffer.from(discriminatorHex, 'hex') }),
      ...(!discriminatorHex && { skipDiscriminatorCheck: true }),
    });

    const snapshot = await reader.fetchTaskByPda(taskPda);
    const workRef = normalizeSnapshot(snapshot);
    spinner?.succeed('Snapshot decoded');

    const payload = {
      cluster: options.cluster,
      taskPda: taskPda.toBase58(),
      status: snapshot.status,
      workRef,
      riskHash: workRef.riskHash,
      decodedAtMs: snapshot.decodedAtMs,
      slot: snapshot.slot,
    };

    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      printJson('SAEP work-ref', workRef);
    }
    return 0;
  } catch (err) {
    spinner?.fail('Read failed');
    if (err instanceof SaepAdapterError) {
      printError(`saep_${err.code}: ${err.message}`);
    } else {
      printError(err instanceof Error ? err.message : String(err));
    }
    return 1;
  }
}
