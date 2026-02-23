import { validateTweet } from '../personality';
import { basicSafetyCheck, callNikaLlm, extractJson, hasEmoji, sanitizeTopic } from './utils';

function buildPrompt(input: {
  topic: string;
  tweetCount: number;
  goal?: string;
  audience?: string;
  issues?: string[];
}): string {
  const base = [
    `Write a short thread in Kyoshin voice about the topic below.`,
    '',
    `TOPIC: ${input.topic}`,
    input.goal ? `GOAL: ${input.goal}` : null,
    input.audience ? `AUDIENCE: ${input.audience}` : null,
    '',
    `Output requirements:`,
    `- Return ONLY valid JSON`,
    `- JSON must be an object with keys: thread, altHooks, altEnds`,
    `- thread must be an array of exactly ${input.tweetCount} strings`,
    `- altHooks must be an array of exactly 2 strings`,
    `- altEnds must be an array of exactly 2 strings`,
    `- Every string must be a single tweet <= 280 characters`,
    `- No emojis`,
    `- No numbering (no \"1/\", no \"Thread:\", no \"[1]\" inside tweets)`,
    `- No URLs unless explicitly required by the topic`,
    `- Tweets should flow in order but each should be self-contained`,
  ].filter(Boolean) as string[];

  if (!input.issues || input.issues.length === 0) return base.join('\n');

  return [
    ...base,
    '',
    'Fix these issues from the previous attempt:',
    ...input.issues.map((issue) => `- ${issue}`),
  ].join('\n');
}

function validateThread(tweets: string[], expectedCount: number): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!Array.isArray(tweets)) return { ok: false, issues: ['thread_not_array'] };
  if (tweets.length !== expectedCount) issues.push(`wrong_count:${tweets.length}/${expectedCount}`);

  for (let i = 0; i < tweets.length; i++) {
    const t = String(tweets[i] ?? '').trim();
    if (!t) {
      issues.push(`tweet_${i + 1}:empty`);
      continue;
    }
    if (t.length > 280) issues.push(`tweet_${i + 1}:too_long:${t.length}`);
    if (hasEmoji(t)) issues.push(`tweet_${i + 1}:emoji`);
    if (/^\s*\d+\s*[/.)-]/.test(t)) issues.push(`tweet_${i + 1}:looks_numbered`);

    const v = validateTweet(t);
    if (!v.valid) issues.push(`tweet_${i + 1}:${v.issues.join(', ')}`);

    const safety = basicSafetyCheck(t);
    if (!safety.ok) issues.push(`tweet_${i + 1}:safety:${safety.reason || 'unknown'}`);
  }

  return { ok: issues.length === 0, issues };
}

export async function generateNikaThread(input: {
  topic: string;
  tweetCount?: number;
  goal?: string;
  audience?: string;
}): Promise<{ thread: string[]; altHooks: string[]; altEnds: string[] }> {
  const topic = sanitizeTopic(input.topic);
  if (!topic) throw new Error('Missing topic');

  const tweetCountRaw = input.tweetCount ?? 5;
  const tweetCount = Number.isFinite(tweetCountRaw)
    ? Math.max(3, Math.min(7, Math.floor(tweetCountRaw)))
    : 5;

  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = buildPrompt({
      topic,
      tweetCount,
      goal: input.goal,
      audience: input.audience,
      issues: attempt === 1 ? undefined : lastIssues,
    });

    const response = await callNikaLlm(prompt);

    let parsed: any;
    try {
      parsed = extractJson(response);
    } catch (error) {
      lastIssues = [`json_parse_failed:${error instanceof Error ? error.message : String(error)}`];
      continue;
    }

    const rawThread = Array.isArray(parsed?.thread) ? parsed.thread : null;
    const rawHooks = Array.isArray(parsed?.altHooks) ? parsed.altHooks : null;
    const rawEnds = Array.isArray(parsed?.altEnds) ? parsed.altEnds : null;

    if (!rawThread || !rawHooks || !rawEnds) {
      lastIssues = ['json_shape_invalid'];
      continue;
    }

    const thread = rawThread.map((v: unknown) => String(v ?? '').trim());
    const altHooks = rawHooks.map((v: unknown) => String(v ?? '').trim());
    const altEnds = rawEnds.map((v: unknown) => String(v ?? '').trim());

    const issues: string[] = [];

    const checkThread = validateThread(thread, tweetCount);
    if (!checkThread.ok) issues.push(...checkThread.issues);

    const checkHooks = validateThread(altHooks, 2);
    if (!checkHooks.ok) issues.push(...checkHooks.issues.map((i) => `altHooks:${i}`));

    const checkEnds = validateThread(altEnds, 2);
    if (!checkEnds.ok) issues.push(...checkEnds.issues.map((i) => `altEnds:${i}`));

    if (issues.length > 0) {
      lastIssues = issues.slice(0, 16);
      continue;
    }

    return { thread, altHooks, altEnds };
  }

  throw new Error(`Failed to generate a valid thread: ${lastIssues.join('; ')}`);
}
