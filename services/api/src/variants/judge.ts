import type Anthropic from '@anthropic-ai/sdk';
import './bootstrap';
import {
  type JudgedEntryResult,
  type JudgeLLM,
  type JudgeResult,
  type ScoreOutputInput as PackageScoreOutputInput,
  type TaskRubric,
  recordJudgedEntry as packageRecordJudgedEntry,
  scoreOutput as packageScoreOutput,
} from '@kamiyo-org/selfimprove';

export { type JudgedEntryResult, type JudgeResult, type TaskRubric };
export { getRubric, upsertRubric } from '@kamiyo-org/selfimprove';

type LegacyClient = Pick<Anthropic, 'messages'>;

export type ScoreOutputInput = Omit<PackageScoreOutputInput, 'judgeLLM'> & {
  client?: LegacyClient;
};

function anthropicToJudgeLLM(client: LegacyClient): JudgeLLM {
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

export async function scoreOutput(params: ScoreOutputInput): Promise<JudgeResult> {
  const { client, ...rest } = params;
  return packageScoreOutput({
    ...rest,
    judgeLLM: client ? anthropicToJudgeLLM(client) : undefined,
  });
}

export async function recordJudgedEntry(params: {
  tournamentId: string;
  variantId: string;
  input: string;
  output: string;
  performanceEventId?: string | null;
  latencyMs?: number | null;
  outcome?: string | null;
  costOverride?: number | null;
  client?: LegacyClient;
}): Promise<JudgedEntryResult> {
  const { client, ...rest } = params;
  return packageRecordJudgedEntry({
    ...rest,
    judgeLLM: client ? anthropicToJudgeLLM(client) : undefined,
  });
}
