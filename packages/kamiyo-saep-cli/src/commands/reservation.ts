import ora from 'ora';

import { facilitator, facilitatorFromEnv } from '../facilitator';
import { printError, printJson } from '../output';

export async function runReservation(reservationId: string, json: boolean): Promise<number> {
  const opts = facilitatorFromEnv();
  const spinner = json ? null : ora(`Fetching reservation ${reservationId}`).start();
  try {
    const result = await facilitator.reservation(opts, reservationId);
    if (result.status >= 200 && result.status < 300) {
      spinner?.succeed(`HTTP ${result.status}`);
    } else {
      spinner?.fail(`HTTP ${result.status}`);
    }
    if (json) {
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
