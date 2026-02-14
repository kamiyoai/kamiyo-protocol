import { z } from 'zod';
import { truncate } from '../lib';
import { generateAcpOfferingBlueprint } from './generate-acp-offering-blueprint';
import { generateNikaAgentMatchmaker } from './generate-agent-matchmaker';
import { generateNikaLaunchPack } from './generate-launch-pack';
import { generateNikaReplyPack } from './generate-reply-pack';
import { generateNikaResearchBrief, type ResearchBriefFormat } from './generate-research-brief';
import { generateNikaThread } from './generate-thread';
import { generateNikaTweet } from './generate-tweet';
import { basicSafetyCheck, callNikaLlm, hasEmoji, LONGFORM_SYSTEM_PROMPT } from './utils';

export type Deliverable = string | { type: string; value: unknown };

export interface ExecuteJobResult {
  deliverable: Deliverable;
  payableDetail?: { amount: number; tokenAddress: string };
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface OfferingHandlers<TRequest> {
  validate: (request: unknown) => { ok: true; request: TRequest } | { ok: false; reason: string };
  requestPayment: (request: TRequest) => string;
  execute: (request: TRequest) => Promise<ExecuteJobResult>;
}

function hasAnyLlmKey(): boolean {
  return !!(process.env.OPENAI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim());
}

function normalizeZodError(err: z.ZodError): string {
  const issues = err.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return issues.join('; ');
}

async function buildReplyMap(input: { sourceText: string; replies: string[] }): Promise<string | null> {
  const prompt = [
    'Create a compact "reply map" that helps someone pick which reply to use.',
    '',
    'Hard constraints:',
    '- No emojis',
    '- No URLs',
    '- Max 800 characters total',
    '- Return ONLY the reply map text',
    '',
    `SOURCE_TEXT:\n${truncate(input.sourceText, 2000)}`,
    '',
    'REPLIES:',
    ...input.replies.map((r, i) => `${i + 1}) ${r}`),
    '',
    'Format:',
    '- One line per reply: "#<n>: <when to use it> (tone: <tone>)"',
  ].join('\n');

  const response = await callNikaLlm(prompt, { systemPrompt: LONGFORM_SYSTEM_PROMPT, maxTokens: 450 });
  const candidate = truncate(String(response ?? '').trim(), 800);
  if (!candidate) return null;
  if (hasEmoji(candidate)) return null;
  if (/https?:\/\//i.test(candidate)) return null;

  const safety = basicSafetyCheck(candidate);
  if (!safety.ok) return null;

  return candidate;
}

const TweetRequest = z
  .object({
    prompt: z.string().trim().min(1).max(500),
  })
  .passthrough();

const ThreadRequest = z
  .object({
    topic: z.string().trim().min(1).max(1200),
    goal: z.string().trim().max(280).optional(),
    audience: z.string().trim().max(280).optional(),
    tweetCount: z.number().int().min(3).max(7).optional(),
  })
  .passthrough();

const ReplyPackRequest = z
  .object({
    sourceText: z.string().trim().min(1).max(5000),
    stance: z.string().trim().max(200).optional(),
    count: z.number().int().min(4).max(12).optional(),
  })
  .passthrough();

const ResearchBriefRequest = z
  .object({
    question: z.string().trim().min(1).max(1200),
    constraints: z.string().trim().max(1200).optional(),
    format: z.enum(['memo', 'checklist', 'debate']).optional(),
  })
  .passthrough();

const LaunchPackRequest = z
  .object({
    project: z.string().trim().min(1).max(5000),
    targetAudience: z.string().trim().min(1).max(800),
    cta: z.string().trim().max(200).optional(),
    link: z.string().trim().max(500).optional(),
  })
  .passthrough();

const BlueprintRequest = z
  .object({
    capability: z.string().trim().min(1).max(600),
    context: z.string().trim().max(1200).optional(),
    constraints: z.string().trim().max(1200).optional(),
  })
  .passthrough();

const MatchmakerRequest = z
  .object({
    task: z.string().trim().min(1).max(2000),
    constraints: z.string().trim().max(2000).optional(),
    maxResults: z.number().int().min(1).max(10).optional(),
  })
  .passthrough();

function parseOrReject<T>(schema: z.ZodSchema<T>, request: unknown): { ok: true; request: T } | { ok: false; reason: string } {
  if (!hasAnyLlmKey()) return { ok: false, reason: 'Service unavailable (missing OPENAI_API_KEY or ANTHROPIC_API_KEY).' };
  const res = schema.safeParse(request);
  if (!res.success) return { ok: false, reason: normalizeZodError(res.error) };
  return { ok: true, request: res.data };
}

export type OfferingName =
  | 'nika_tweet'
  | 'nika_thread'
  | 'nika_reply_pack'
  | 'nika_research_brief'
  | 'nika_launch_pack'
  | 'nika_acp_blueprint'
  | 'nika_agent_matchmaker';

type OfferingRegistry = Record<OfferingName, OfferingHandlers<any>>;

const OFFERINGS: OfferingRegistry = {
  nika_tweet: {
    validate: (request) => parseOrReject(TweetRequest, request),
    requestPayment: () => 'Accepted. Pay to receive one Nika tweet (<=280 chars).',
    execute: async ({ prompt }) => ({ deliverable: await generateNikaTweet(prompt) }),
  },
  nika_thread: {
    validate: (request) => parseOrReject(ThreadRequest, request),
    requestPayment: () => 'Accepted. Pay to receive a short Nika thread (3-7 tweets) + alternates.',
    execute: async ({ topic, goal, audience, tweetCount }) => {
      const result = await generateNikaThread({ topic, goal, audience, tweetCount });
      return { deliverable: { type: 'json', value: result } };
    },
  },
  nika_reply_pack: {
    validate: (request) => parseOrReject(ReplyPackRequest, request),
    requestPayment: () => 'Accepted. Pay to receive a Nika reply pack (4-12 replies).',
    execute: async ({ sourceText, stance, count }) => {
      const replies = await generateNikaReplyPack({ sourceText, stance, count });
      const replyMap = await buildReplyMap({ sourceText, replies });
      return { deliverable: { type: 'json', value: { replies, replyMap } } };
    },
  },
  nika_research_brief: {
    validate: (request) => parseOrReject(ResearchBriefRequest, request),
    requestPayment: () => 'Accepted. Pay to receive a Nika research brief (thesis, counters, next steps).',
    execute: async ({ question, constraints, format }) => {
      const brief = await generateNikaResearchBrief({
        question,
        constraints,
        format: format as ResearchBriefFormat | undefined,
      });
      return { deliverable: brief };
    },
  },
  nika_launch_pack: {
    validate: (request) => parseOrReject(LaunchPackRequest, request),
    requestPayment: () => 'Accepted. Pay to receive a full Nika launch kit (positioning + tweets + thread + replies).',
    execute: async ({ project, targetAudience, cta, link }) => {
      const kit = await generateNikaLaunchPack({ project, targetAudience, cta, link });
      return { deliverable: { type: 'json', value: kit } };
    },
  },
  nika_acp_blueprint: {
    validate: (request) => parseOrReject(BlueprintRequest, request),
    requestPayment: () => 'Accepted. Pay to receive an ACP offering blueprint (offering.json + handlers.ts).',
    execute: async ({ capability, context, constraints }) => {
      const blueprint = await generateAcpOfferingBlueprint({ capability, context, constraints });
      return { deliverable: { type: 'json', value: blueprint } };
    },
  },
  nika_agent_matchmaker: {
    validate: (request) => parseOrReject(MatchmakerRequest, request),
    requestPayment: () => 'Accepted. Pay to receive a ranked shortlist of ACP agents + ready-to-run job commands.',
    execute: async ({ task, constraints, maxResults }) => {
      const result = await generateNikaAgentMatchmaker({ task, constraints, maxResults });
      return { deliverable: { type: 'json', value: result } };
    },
  },
};

export function getOfferingHandlers(name: string): OfferingHandlers<any> | null {
  const normalized = String(name ?? '').trim();
  if (!normalized) return null;
  return (OFFERINGS as Record<string, OfferingHandlers<any>>)[normalized] ?? null;
}
