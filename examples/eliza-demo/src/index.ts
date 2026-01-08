import 'dotenv/config';
import { kamiyoPlugin } from '@kamiyo/eliza';

const config = {
  name: 'KamiyoAgent',
  plugins: [kamiyoPlugin],
  settings: {
    KAMIYO_NETWORK: process.env.KAMIYO_NETWORK || 'devnet',
    SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY || '',
    KAMIYO_QUALITY_THRESHOLD: process.env.KAMIYO_QUALITY_THRESHOLD || '80',
    KAMIYO_MAX_PRICE: process.env.KAMIYO_MAX_PRICE || '0.01',
    KAMIYO_MIN_REPUTATION: process.env.KAMIYO_MIN_REPUTATION || '60',
  },
};

const scenarios = [
  'Create escrow for 0.1 SOL to provider 8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM',
  'Check reputation of 8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM',
  'Consume API at https://api.example.com/data',
  'Release escrow for transaction tx_123',
];

async function main() {
  console.log('Plugin:', kamiyoPlugin.name);
  console.log('Actions:', kamiyoPlugin.actions.map(a => a.name).join(', '));
  console.log('Evaluators:', kamiyoPlugin.evaluators.map(e => e.name).join(', '));
  console.log();

  for (const text of scenarios) {
    console.log(`> ${text}`);
    for (const action of kamiyoPlugin.actions) {
      const mem = { content: { text } } as Parameters<typeof action.validate>[1];
      if (await action.validate({} as Parameters<typeof action.validate>[0], mem)) {
        console.log(`  -> ${action.name}`);
        break;
      }
    }
  }

  console.log('\nSet SOLANA_PRIVATE_KEY to run live.');
}

main().catch(console.error);
