import { sanitizeForPrompt } from '../lib';
import { basicSafetyCheck, callNikaLlm, hasEmoji, LONGFORM_SYSTEM_PROMPT } from './utils';

export type ResearchBriefFormat = 'memo' | 'checklist' | 'debate';

function buildPrompt(input: {
  question: string;
  constraints?: string;
  format: ResearchBriefFormat;
  issues?: string[];
}): string {
  const base = [
    `Write a high-signal research brief in Kyoshin voice.`,
    '',
    `QUESTION: ${input.question}`,
    input.constraints ? `CONSTRAINTS: ${input.constraints}` : null,
    '',
    'Hard constraints:',
    '- No emojis',
    '- No URLs',
    '- Do not include generic AI disclaimers',
    '',
    'Output format:',
    input.format === 'checklist'
      ? [
          '- Title',
          '- 10-point checklist',
          '- Risks',
          '- Next steps',
        ].join('\n')
      : input.format === 'debate'
        ? [
            '- Motion / thesis',
            '- For (3-6 bullets)',
            '- Against (3-6 bullets)',
            '- What would change my mind',
            '- Next steps',
          ].join('\n')
        : [
            '- Title',
            '- Thesis (2-4 sentences)',
            '- Key arguments (3-6 bullets)',
            '- Counterarguments (2-4 bullets)',
            '- What would change my mind',
            '- Concrete next steps (3-6 bullets)',
          ].join('\n'),
  ].filter(Boolean) as string[];

  if (!input.issues || input.issues.length === 0) return base.join('\n');

  return [
    ...base,
    '',
    'Fix these issues from the previous attempt:',
    ...input.issues.map((issue) => `- ${issue}`),
  ].join('\n');
}

function validateBrief(text: string): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) issues.push('empty');
  if (hasEmoji(trimmed)) issues.push('emoji');
  if (/https?:\/\//i.test(trimmed)) issues.push('contains_url');

  const safety = basicSafetyCheck(trimmed);
  if (!safety.ok) issues.push(`safety:${safety.reason || 'unknown'}`);

  // Avoid ultra-short outputs; this is a paid brief.
  if (trimmed.length < 600) issues.push(`too_short:${trimmed.length}`);

  return { ok: issues.length === 0, issues };
}

export async function generateNikaResearchBrief(input: {
  question: string;
  constraints?: string;
  format?: ResearchBriefFormat;
}): Promise<string> {
  const question = sanitizeForPrompt(input.question).trim();
  if (!question) throw new Error('Missing question');

  const constraints = input.constraints ? sanitizeForPrompt(input.constraints).trim() : undefined;
  const format: ResearchBriefFormat =
    input.format === 'checklist' || input.format === 'debate' || input.format === 'memo'
      ? input.format
      : 'memo';

  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = buildPrompt({
      question,
      constraints,
      format,
      issues: attempt === 1 ? undefined : lastIssues,
    });

    const response = await callNikaLlm(prompt, {
      systemPrompt: LONGFORM_SYSTEM_PROMPT,
      maxTokens: 1600,
    });

    const candidate = String(response ?? '').trim();
    const check = validateBrief(candidate);
    if (!check.ok) {
      lastIssues = check.issues.slice(0, 12);
      continue;
    }

    return candidate;
  }

  throw new Error(`Failed to generate a valid brief: ${lastIssues.join('; ')}`);
}

