import ora from 'ora';

import { facilitator, facilitatorFromEnv } from '../facilitator';
import { printError, printJson } from '../output';

interface SettleOptions {
  releaseSignature: string;
  taskPda?: string;
  cluster?: 'mainnet-beta' | 'devnet';
  merchantWallet?: string;
  json: boolean;
}

export async function runSettle(reservationId: string, options: SettleOptions): Promise<number> {
  const opts = facilitatorFromEnv();
  const spinner = options.json ? null : ora(`Ingesting settlement for ${reservationId}`).start();
  try {
    const body: Record<string, unknown> = {
      reservationId,
      releaseSignature: options.releaseSignature,
    };
    if (options.taskPda) body.taskPda = options.taskPda;
    if (options.cluster) body.cluster = options.cluster;
    if (options.merchantWallet) body.merchantWallet = options.merchantWallet;

    const result = await facilitator.settle(opts, body);
    if (result.status >= 200 && result.status < 300) {
      spinner?.succeed(`HTTP ${result.status}`);
    } else {
      spinner?.fail(`HTTP ${result.status}`);
    }
    if (options.json) {
      console.log(JSON.stringify({ status: result.status, body: result.body }, null, 2));
    } else {
      printJson(`HTTP ${result.status}`, result.body);
    }
    return result.status >= 200 && result.status < 300 ? 0 : 1;
  } catch (err) {
    spinner?.fail('Request failed');
    printError(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
