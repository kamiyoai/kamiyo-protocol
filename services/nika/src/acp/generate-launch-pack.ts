import { sanitizeForPrompt } from '../lib';
import { validateTweet } from '../personality';
import { basicSafetyCheck, callNikaLlm, extractJson, hasEmoji, LONGFORM_SYSTEM_PROMPT } from './utils';

function buildPrompt(input: {
  project: string;
  targetAudience: string;
  cta?: string;
  link?: string;
  issues?: string[];
}): string {
  const base = [
    'Create a launch content kit in Nika voice.',
    '',
    `PROJECT: ${input.project}`,
    `TARGET_AUDIENCE: ${input.targetAudience}`,
    input.cta ? `CTA: ${input.cta}` : null,
    input.link ? `LINK: ${input.link}` : null,
    '',
    'Output requirements:',
    '- Return ONLY valid JSON (no markdown, no commentary)',
    '- JSON keys: positioning, tweets, thread, replies, cadence',
    '- positioning: { oneLiner: string, bullets: string[3], enemy: string }',
    '- tweets: string[5] (each <= 280 chars, no emojis)',
    '- thread: string[5] (each <= 280 chars, no emojis, no numbering inside tweets)',
    '- replies: string[6] (each <= 280 chars, no emojis)',
    '- cadence: string[7] (one per day, concise)',
    '',
    'Constraints for tweet-like strings:',
    '- No emojis',
    '- No "as an AI", no prompt/instructions talk',
    '- No spammy CTAs, no scams, no wallet addresses',
    input.link ? `- You may include LINK exactly as provided in at most 1 tweet` : '- Do not include URLs',
  ].filter(Boolean) as string[];

  if (!input.issues || input.issues.length === 0) return base.join('\n');

  return [
    ...base,
    '',
    'Fix these issues from the previous attempt:',
    ...input.issues.map((issue) => `- ${issue}`),
  ].join('\n');
}

function validateTweetLike(text: string, label: string): string[] {
  const issues: string[] = [];
  const t = text.trim();
  if (!t) return [`${label}:empty`];
  if (t.length > 280) issues.push(`${label}:too_long:${t.length}`);
  if (hasEmoji(t)) issues.push(`${label}:emoji`);
  if (/^\s*\d+\s*[/.)-]/.test(t)) issues.push(`${label}:looks_numbered`);

  const v = validateTweet(t);
  if (!v.valid) issues.push(`${label}:${v.issues.join(', ')}`);

  const safety = basicSafetyCheck(t);
  if (!safety.ok) issues.push(`${label}:safety:${safety.reason || 'unknown'}`);

  return issues;
}

export async function generateNikaLaunchPack(input: {
  project: string;
  targetAudience: string;
  cta?: string;
  link?: string;
}): Promise<{
  positioning: { oneLiner: string; bullets: string[]; enemy: string };
  tweets: string[];
  thread: string[];
  replies: string[];
  cadence: string[];
}> {
  const project = sanitizeForPrompt(input.project).trim();
  const targetAudience = sanitizeForPrompt(input.targetAudience).trim();
  if (!project) throw new Error('Missing project');
  if (!targetAudience) throw new Error('Missing targetAudience');

  const cta = input.cta ? sanitizeForPrompt(input.cta).trim() : undefined;
  const link = input.link ? String(input.link).trim() : undefined;
  if (link) {
    try {
      // Validate URL shape; keep exact string in output request.
      new URL(link);
    } catch {
      throw new Error('Invalid link');
    }
  }

  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = buildPrompt({ project, targetAudience, cta, link, issues: attempt === 1 ? undefined : lastIssues });
    const response = await callNikaLlm(prompt, {
      systemPrompt: LONGFORM_SYSTEM_PROMPT,
      maxTokens: 2000,
    });

    let parsed: any;
    try {
      parsed = extractJson(response);
    } catch (error) {
      lastIssues = [`json_parse_failed:${error instanceof Error ? error.message : String(error)}`];
      continue;
    }

    const positioning = parsed?.positioning;
    const tweets = Array.isArray(parsed?.tweets) ? parsed.tweets.map((v: any) => String(v ?? '').trim()) : null;
    const thread = Array.isArray(parsed?.thread) ? parsed.thread.map((v: any) => String(v ?? '').trim()) : null;
    const replies = Array.isArray(parsed?.replies) ? parsed.replies.map((v: any) => String(v ?? '').trim()) : null;
    const cadence = Array.isArray(parsed?.cadence) ? parsed.cadence.map((v: any) => String(v ?? '').trim()) : null;

    const issues: string[] = [];

    const oneLiner = typeof positioning?.oneLiner === 'string' ? positioning.oneLiner.trim() : '';
    const enemy = typeof positioning?.enemy === 'string' ? positioning.enemy.trim() : '';
    const bullets = Array.isArray(positioning?.bullets)
      ? positioning.bullets.map((v: any) => String(v ?? '').trim()).filter(Boolean)
      : [];

    if (!oneLiner) issues.push('positioning.oneLiner:missing');
    if (!enemy) issues.push('positioning.enemy:missing');
    if (bullets.length !== 3) issues.push(`positioning.bullets:wrong_count:${bullets.length}/3`);

    if (!tweets || tweets.length !== 5) issues.push(`tweets:wrong_count:${tweets?.length ?? 'missing'}/5`);
    if (!thread || thread.length !== 5) issues.push(`thread:wrong_count:${thread?.length ?? 'missing'}/5`);
    if (!replies || replies.length !== 6) issues.push(`replies:wrong_count:${replies?.length ?? 'missing'}/6`);
    if (!cadence || cadence.length !== 7) issues.push(`cadence:wrong_count:${cadence?.length ?? 'missing'}/7`);

    if (tweets) {
      for (let i = 0; i < tweets.length; i++) issues.push(...validateTweetLike(tweets[i], `tweets[${i}]`));
    }
    if (thread) {
      for (let i = 0; i < thread.length; i++) issues.push(...validateTweetLike(thread[i], `thread[${i}]`));
    }
    if (replies) {
      for (let i = 0; i < replies.length; i++) issues.push(...validateTweetLike(replies[i], `replies[${i}]`));
    }

    if (link) {
      const linkCount = [...(tweets ?? []), ...(thread ?? [])].filter((t) => t.includes(link)).length;
      if (linkCount > 1) issues.push(`link:too_many_mentions:${linkCount}`);
    } else {
      const hasUrl = [...(tweets ?? []), ...(thread ?? [])].some((t) => /https?:\/\//i.test(t));
      if (hasUrl) issues.push('urls_present_without_link');
    }

    if (issues.length > 0) {
      lastIssues = issues.slice(0, 16);
      continue;
    }

    return {
      positioning: { oneLiner, bullets, enemy },
      tweets: tweets!,
      thread: thread!,
      replies: replies!,
      cadence: cadence!,
    };
  }

  throw new Error(`Failed to generate a valid launch pack: ${lastIssues.join('; ')}`);
}

