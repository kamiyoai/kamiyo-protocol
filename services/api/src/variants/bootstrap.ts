import Anthropic from '@anthropic-ai/sdk';
import { initSelfImprove, type JudgeLLM, type MetricsAdapter } from '@kamiyo-org/selfimprove';
import db from '../db';
import { logger } from '../logger';
import {
  banditDecisionsTotal,
  banditSweepPromotionsTotal,
  judgeCallsTotal,
  judgeCostUsd,
  judgeLatency,
  variantEntriesTotal,
  variantPromotionsTotal,
  variantTournamentsTotal,
  variantsCreatedTotal,
} from '../metrics';

let bootstrapped = false;

function defaultJudgeLLM(): JudgeLLM | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  return {
    async generate(p) {
      const resp = await client.messages.create({
        model: p.model,
        max_tokens: p.maxTokens,
        temperature: p.temperature,
        system: p.system,
        messages: p.messages,
      });
      const block = resp.content.find(c => c.type === 'text');
      const text = block && block.type === 'text' ? block.text : '';
      return {
        text,
        inputTokens: resp.usage.input_tokens,
        outputTokens: resp.usage.output_tokens,
      };
    },
  };
}

export function bootstrapSelfImprove(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  const metrics: MetricsAdapter = {
    variantsCreated: variantsCreatedTotal,
    variantEntries: variantEntriesTotal,
    variantPromotions: variantPromotionsTotal,
    variantTournaments: variantTournamentsTotal,
    banditDecisions: banditDecisionsTotal,
    banditSweepPromotions: banditSweepPromotionsTotal,
    judgeCalls: judgeCallsTotal,
    judgeCostUsd: judgeCostUsd,
    judgeLatency: judgeLatency,
  };

  initSelfImprove({
    db,
    metrics,
    judgeLLM: defaultJudgeLLM(),
    logger: {
      info: (msg, meta) => logger.info(msg, meta),
      warn: (msg, meta) => logger.warn(msg, meta),
      error: (msg, meta) => logger.error(msg, meta),
    },
  });
}

bootstrapSelfImprove();
