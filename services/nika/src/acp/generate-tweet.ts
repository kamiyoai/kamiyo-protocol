import { validateTweet } from '../personality';
import { basicSafetyCheck, callNikaLlm, pickValidTweetCandidate, sanitizeTopic } from './utils';

function buildPrompt(topic: string, issues?: string[]): string {
  const base = [
    'Write ONE tweet in Nika voice about the topic below.',
    '',
    `TOPIC: ${topic}`,
    '',
    'Constraints:',
    '- Maximum 280 characters',
    '- No emojis',
    '- No URLs unless explicitly asked in the topic',
    '- Return ONLY the tweet text',
  ];

  if (!issues || issues.length === 0) return base.join('\n');

  return [
    ...base,
    '',
    'Fix these issues from the previous attempt:',
    ...issues.map((issue) => `- ${issue}`),
  ].join('\n');
}

export async function generateNikaTweet(input: string): Promise<string> {
  const topic = sanitizeTopic(input);
  if (!topic) throw new Error('Missing topic');

  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = buildPrompt(topic, attempt === 1 ? undefined : lastIssues);
    const response = await callNikaLlm(prompt);

    const candidate = pickValidTweetCandidate(response);
    if (!candidate) {
      lastIssues = ['No valid <=280 character tweet found'];
      continue;
    }

    const validation = validateTweet(candidate);
    if (!validation.valid) {
      lastIssues = validation.issues;
      continue;
    }

    const safety = basicSafetyCheck(candidate);
    if (!safety.ok) {
      lastIssues = [`Blocked by safety: ${safety.reason || 'unknown'}`];
      continue;
    }

    return candidate;
  }

  throw new Error(`Failed to generate a valid tweet: ${lastIssues.join('; ')}`);
}

