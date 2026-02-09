import { z } from 'zod';
import type { AgentSkill } from '../types/index.js';
import { normalizeSkillTag } from './skill-tags.js';

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

const HEURISTIC_KEYWORDS: Record<string, string[]> = {
  research: [
    'research',
    'investigate',
    'analysis',
    'analyze',
    'summarize',
    'summary',
    'report',
    'brief',
    'diligence',
    'market',
    'competitive',
    'search',
    'find',
  ],
  writing: [
    'write',
    'writing',
    'draft',
    'docs',
    'documentation',
    'spec',
    'proposal',
    'blog',
    'copy',
    'email',
    'memo',
    'tweet',
    'post',
    'content',
  ],
  code_review: [
    'code',
    'review',
    'refactor',
    'bug',
    'fix',
    'typescript',
    'javascript',
    'react',
    'expo',
    'pr',
    'pull',
    'request',
    'lint',
    'security',
  ],
  data_analysis: [
    'data',
    'csv',
    'json',
    'sql',
    'spreadsheet',
    'metrics',
    'analytics',
    'dashboard',
    'chart',
    'graph',
    'model',
  ],
  translation: [
    'translate',
    'translation',
    'localize',
    'localization',
    'japanese',
    'english',
    'spanish',
    'french',
    'german',
    'korean',
    'chinese',
  ],
  general: ['general', 'anything', 'misc', 'miscellaneous', 'various'],
};

export function inferSkillsHeuristic(prompt: string, maxSkills: number): AgentSkill[] {
  const tokens = tokenize(prompt);
  if (tokens.length === 0) return ['general'];

  const scored = Object.keys(HEURISTIC_KEYWORDS)
    .map((skill) => {
      const keywords = HEURISTIC_KEYWORDS[skill]!;
      let score = 0;
      for (const token of tokens) {
        if (keywords.includes(token)) score += 1;
      }
      return { skill, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return ['general'];

  const topScore = scored[0]!.score;
  const keep = scored.filter((x) => x.score >= Math.max(1, topScore - 1)).map((x) => x.skill);

  const unique: AgentSkill[] = [];
  for (const s of keep) {
    if (s === 'general') continue;
    if (!unique.includes(s)) unique.push(s);
    if (unique.length >= maxSkills) break;
  }
  return unique.length ? unique : ['general'];
}

const OpenAiSkillsResponseSchema = z.object({
  skills: z.array(z.string()).min(1),
});

async function inferSkillsWithOpenAi(prompt: string, maxSkills: number): Promise<AgentSkill[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text:
                'You extract short, reusable skill tags from a user capability description. ' +
                'Return only JSON of shape {"skills": string[]}. ' +
                'Each skill must be a short snake_case tag (lowercase a-z, 0-9, underscores), 1..32 chars. ' +
                `Pick at most ${maxSkills} skills. If unclear, include "general". ` +
                'Prefer stable capabilities over tasks. Examples: "smart_contract_audit", "technical_writing", "data_analysis".',
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as any;
  const text = data?.output_text;
  if (typeof text !== 'string' || text.trim() === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const validated = OpenAiSkillsResponseSchema.safeParse(parsed);
  if (!validated.success) return null;

  const unique: AgentSkill[] = [];
  for (const s of validated.data.skills) {
    const normalized = normalizeSkillTag(s);
    if (!normalized) continue;
    if (!unique.includes(normalized)) unique.push(normalized);
    if (unique.length >= maxSkills) break;
  }

  if (unique.length === 0) return ['general'];
  return unique;
}

export async function inferSkills(prompt: string, maxSkills: number): Promise<{ skills: AgentSkill[]; source: 'openai' | 'heuristic' }> {
  const trimmed = prompt.trim();
  const capped = trimmed.length > 5000 ? trimmed.slice(0, 5000) : trimmed;

  const fromOpenAi = await inferSkillsWithOpenAi(capped, maxSkills);
  if (fromOpenAi) return { skills: fromOpenAi, source: 'openai' };

  return { skills: inferSkillsHeuristic(capped, maxSkills), source: 'heuristic' };
}
