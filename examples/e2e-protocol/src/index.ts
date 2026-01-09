import 'dotenv/config';
import { parseArgs } from './config';
import { log } from './logger';
import { initializeProtocol } from './protocol';

async function main(): Promise<void> {
  const config = parseArgs();

  log.banner();
  console.log('\x1b[1mE2E PROTOCOL DEMO\x1b[0m');
  console.log('\x1b[2mFull agent lifecycle: registration, escrow, disputes, cross-chain sync\x1b[0m\n');

  if (config.verbose) {
    await log.dim(`config: ${JSON.stringify(config, null, 2)}`);
  }

  const protocol = await initializeProtocol(config);
  await protocol.run();

  console.log(`
\x1b[33mLive mode:\x1b[0m
  export SOLANA_PRIVATE_KEY='...'
  export EVM_PRIVATE_KEY='...'
  pnpm dev --cleanup

\x1b[33mOptions:\x1b[0m
  --mainnet         Use Solana mainnet
  --monad-mainnet   Use Monad mainnet
  --live            Enable live transactions
  --cleanup         Deactivate agents and recover SOL after demo
  --verbose, -v     Show detailed output
  --agents N        Number of agents (default: 4)
  --oracles N       Number of oracles (default: 5)
  --scenario S      Scenario: good|degraded|poor|all (default: all)
`);
}

main().catch(err => {
  console.error('\x1b[31mFatal error:\x1b[0m', err.message);
  process.exit(1);
});
