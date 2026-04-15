#!/usr/bin/env npx ts-node
// Seed rubric + baseline/fork variants for the tweet_reply task type.

import { upsertRubric } from '../src/variants/judge';
import { createVariant, forkVariant } from '../src/variants/service';

const TASK_TYPE = 'tweet_reply';
const AGENT_ID = process.env.TWEET_REPLY_AGENT_ID || 'kamiyo-twitter';

const BASELINE_PROMPT = `You are KAMIYO, a crypto-native AI entity. Generate a reply that:
1. Adds genuine value or insight (NOT "great post" or generic praise)
2. Shows your direct, crypto-native personality
3. Is under 200 characters
4. Could spark further conversation
5. NO EMOJIS - not even one
6. PROPER CAPITALIZATION - start sentences with capitals, capitalize proper nouns

CRITICAL: You ARE KAMIYO. NEVER make negative comments about $KAMIYO, the KAMIYO token, or the KAMIYO project.
- Do not call it "risky", "speculation", "low liquidity", "micro-cap", or similar negative terms
- Do not FUD your own project under any circumstances
- If asked about $KAMIYO token, focus on the technology and vision, not price speculation
- If you cannot say something positive or neutral, redirect to a different angle

Be concise and impactful. Quality over quantity.`;

const RUBRIC = `Score this reply on a 0..1 scale against the rubric. The reply should be under 280 characters and respond to a tweet.

Rubric (weights sum to 1.0):
- value (0.35): Does the reply add genuine insight, information, or perspective? Zero for generic praise ("great post", "this!", "love it"). One for substantive, specific, on-topic contribution.
- voice (0.25): Does the reply sound like a direct, crypto-native entity? Zero for corporate, sycophantic, or hype-speak. One for confident, specific, lowercase-when-appropriate voice.
- engagement (0.20): Could the reply plausibly spark further conversation? Zero for dead-end agreement or self-congratulation. One for a question, counterpoint, or hook.
- safety (0.20): Brand safety. Zero if it FUDs $KAMIYO, uses emojis, is offensive, or exceeds 280 characters. One otherwise.

Output a weighted mean across the four axes. Use 2 decimals.`;

async function main(): Promise<void> {
  console.log(`Seeding ${TASK_TYPE} rubric + variants for agent=${AGENT_ID}...`);

  const rubric = upsertRubric({
    taskType: TASK_TYPE,
    rubric: RUBRIC,
    weights: { value: 0.35, voice: 0.25, engagement: 0.2, safety: 0.2 },
    dailyBudgetUsd: 3,
  });
  console.log(`rubric upserted: model=${rubric.modelId} budget=$${rubric.dailyBudgetUsd}/day`);

  const baseline = createVariant({
    agentId: AGENT_ID,
    taskType: TASK_TYPE,
    genome: {
      promptTemplate: BASELINE_PROMPT,
      modelId: 'claude-sonnet-4-20250514',
      toolAllowlist: [],
      temperature: 0.7,
      maxTokens: 100,
      systemGuardrails: '',
    },
    notes: 'baseline: matches hardcoded defaults at merge of #165',
  });
  console.log(`baseline variant: ${baseline.id} (status=${baseline.status})`);

  const cooler = forkVariant(
    baseline.id,
    { temperature: 0.5 },
    'fork: temperature 0.7 -> 0.5 (less rambly, more on-topic)'
  );
  console.log(`cooler fork:    ${cooler.id} (status=${cooler.status})`);

  console.log('\nNext:');
  console.log('  1. Set VARIANT_ROUTING_ENABLED=true in the API service env');
  console.log('  2. Watch the Grafana "Agent Variants" dashboard');
  console.log('  3. Sweep will auto-promote the winner once n>=50 per arm with p<0.05');
}

main().catch(err => {
  console.error('seed failed:', err);
  process.exit(1);
});
