// Mitama demo - showcases full agent flow on X

import { TwitterApi } from 'twitter-api-v2';
import { logger } from './logger';
import { extractMarketSignal, formatSignal } from './mitama-signal';

interface DemoStep {
  content: string;
  delay: number; // ms before posting
}

// Demo thread content
const DEMO_THREAD: DemoStep[] = [
  {
    content: `Mitama demo thread - ZK-private agent coordination on Solana.

Watch an agent register, submit signals, and vote on swarm actions - all without revealing identity.

Terminal running live in parallel.`,
    delay: 0,
  },
  {
    content: `Step 1: Agent Registration

Generating identity commitment from:
- Owner secret (private)
- Agent ID (private)
- Registration secret (private)

Only the commitment hash goes on-chain. No one can link it back to the owner.`,
    delay: 8000,
  },
  {
    content: `Step 2: Submit Private Signal

Signal: LONG on $SOL
Confidence: 75%
Magnitude: 60%

ZK proof verifies:
- Agent is registered (merkle membership)
- Confidence >= minimum threshold
- Stake >= minimum required

Signal content stays hidden.`,
    delay: 10000,
  },
  {
    content: `Step 3: Swarm Vote

Proposal: "Execute coordinated entry on SOL breakout"
Threshold: 66% approval needed

Each agent votes with ZK proof:
- Proves membership without revealing which agent
- Vote encrypted in commitment
- Nullifier prevents double-voting`,
    delay: 10000,
  },
  {
    content: `What stays private:
- Which agent submitted which signal
- Individual vote choices
- Link between wallet and agent

What's public:
- Aggregated signal sentiment
- Vote outcome (passed/failed)
- That proofs are valid

Privacy-preserving coordination.`,
    delay: 8000,
  },
  {
    content: `Built for the Solana Privacy Hack.

Circuits: Circom + Groth16
On-chain: Anchor + groth16-solana
Hash: Poseidon (BN254)

Code: github.com/kamiyo-ai/kamiyo-protocol/tree/main/packages/mitama-*`,
    delay: 6000,
  },
];

export async function runMitamaDemo(twitter: TwitterApi): Promise<string[]> {
  const tweetIds: string[] = [];
  let lastTweetId: string | undefined;

  logger.info('Starting Mitama demo thread...');

  for (let i = 0; i < DEMO_THREAD.length; i++) {
    const step = DEMO_THREAD[i];

    // Wait before posting
    if (step.delay > 0) {
      await new Promise(r => setTimeout(r, step.delay));
    }

    try {
      let result;
      if (i === 0) {
        // First tweet - standalone
        result = await twitter.v2.tweet(step.content);
      } else {
        // Reply to previous tweet in thread
        result = await twitter.v2.reply(step.content, lastTweetId!);
      }

      if (result.data?.id) {
        lastTweetId = result.data.id;
        tweetIds.push(result.data.id);
        logger.info(`Posted demo step ${i + 1}/${DEMO_THREAD.length}`, {
          tweetId: result.data.id,
          preview: step.content.slice(0, 50) + '...'
        });
      }
    } catch (err) {
      logger.error(`Failed to post demo step ${i + 1}`, { error: String(err) });
      break;
    }
  }

  logger.info('Mitama demo thread complete', { tweetCount: tweetIds.length });
  return tweetIds;
}

// Generate a market signal demo tweet with proof info
export function generateSignalDemoTweet(content: string): string | null {
  const signal = extractMarketSignal(content);
  if (!signal) return null;

  const formatted = formatSignal(signal);
  return `${content}

[Mitama ZK Signal]
${formatted}
Proof: generating...`;
}
