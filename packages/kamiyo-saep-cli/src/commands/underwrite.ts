import ora from 'ora';

import { facilitator, facilitatorFromEnv } from '../facilitator';
import { printError, printJson } from '../output';

interface UnderwriteOptions {
  agentId: string;
  payerWallet: string;
  collateralAccount: string;
  cluster: 'mainnet-beta' | 'devnet';
  idempotencyKey: string;
  json: boolean;
}

export async function runUnderwrite(taskPda: string, options: UnderwriteOptions): Promise<number> {
  const opts = facilitatorFromEnv();
  const spinner = options.json ? null : ora(`Underwriting SAEP task ${taskPda}`).start();
  try {
    const result = await facilitator.underwrite(opts, {
      agentId: options.agentId,
      payerWallet: options.payerWallet,
      collateralAccount: options.collateralAccount,
      taskPda,
      cluster: options.cluster,
      idempotencyKey: options.idempotencyKey,
    });
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
