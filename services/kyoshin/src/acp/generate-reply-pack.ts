import { validateTweet } from '../personality';
import { sanitizeForPrompt } from '../lib';
import { basicSafetyCheck, callNikaLlm, extractJson, hasEmoji, sanitizeTopic } from './utils';

function buildPrompt(input: {
  sourceText: string;
  stance?: string;
  count: number;
  issues?: string[];
}): string {
  const base = [
    'Generate replies in Kyoshin voice to the source text below.',
    '',
    `SOURCE_TEXT:\n${input.sourceText}`,
    input.stance ? `STANCE: ${input.stance}` : null,
    '',
    'Output requirements:',
    `- Return ONLY valid JSON`,
    `- JSON must be an array of exactly ${input.count} strings`,
    `- Each string must be <= 280 characters`,
    `- No emojis`,
    `- No generic praise, no spam, no call-to-action to buy anything`,
    `- Prefer substance: one insight, one question, or one sharp counterpoint per reply`,
  ].filter(Boolean) as string[];

  if (!input.issues || input.issues.length === 0) return base.join('\n');

  return [
    ...base,
    '',
    'Fix these issues from the previous attempt:',
    ...input.issues.map((issue) => `- ${issue}`),
  ].join('\n');
}

function validateReplies(replies: string[], expectedCount: number): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!Array.isArray(replies)) return { ok: false, issues: ['replies_not_array'] };
  if (replies.length !== expectedCount) issues.push(`wrong_count:${replies.length}/${expectedCount}`);

  for (let i = 0; i < replies.length; i++) {
    const r = String(replies[i] ?? '').trim();
    if (!r) {
      issues.push(`reply_${i + 1}:empty`);
      continue;
    }
    if (r.length > 280) issues.push(`reply_${i + 1}:too_long:${r.length}`);
    if (hasEmoji(r)) issues.push(`reply_${i + 1}:emoji`);

    const v = validateTweet(r);
    if (!v.valid) issues.push(`reply_${i + 1}:${v.issues.join(', ')}`);

    const safety = basicSafetyCheck(r);
    if (!safety.ok) issues.push(`reply_${i + 1}:safety:${safety.reason || 'unknown'}`);
  }

  return { ok: issues.length === 0, issues };
}

export async function generateNikaReplyPack(input: {
  sourceText: string;
  stance?: string;
  count?: number;
}): Promise<string[]> {
  const source = sanitizeForPrompt(input.sourceText).trim();
  if (!source) throw new Error('Missing sourceText');

  const countRaw = input.count ?? 8;
  const count = Number.isFinite(countRaw) ? Math.max(4, Math.min(12, Math.floor(countRaw))) : 8;

  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = buildPrompt({
      sourceText: source,
      stance: input.stance ? sanitizeTopic(input.stance) : undefined,
      count,
      issues: attempt === 1 ? undefined : lastIssues,
    });

    const response = await callNikaLlm(prompt);

    let parsed: unknown;
    try {
      parsed = extractJson(response);
    } catch (error) {
      lastIssues = [`json_parse_failed:${error instanceof Error ? error.message : String(error)}`];
      continue;
    }

    if (!Array.isArray(parsed)) {
      lastIssues = ['json_not_array'];
      continue;
    }

    const replies = parsed.map((v) => String(v ?? '').trim());
    const check = validateReplies(replies, count);
    if (!check.ok) {
      lastIssues = check.issues.slice(0, 12);
      continue;
    }

    return replies;
  }

  throw new Error(`Failed to generate valid replies: ${lastIssues.join('; ')}`);
}
