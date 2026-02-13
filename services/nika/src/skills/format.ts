import { truncate } from '../lib';
import type { SkillDefinition } from './registry';

const MAX_TWEET_CHARS = 280;

const SKILL_HINTS: Record<string, string> = {
  summarize: 'compress',
  summarize_thread: 'thread',
  rewrite: 'tone',
  draft_reply: 'reply',
  explain: 'clarify',
  critique: 'improve',
  brainstorm: 'options',
  shaping: 'scope',
};

export function formatSkillsPage(skills: SkillDefinition[], page: number, pageSize = 6): string {
  const totalPages = Math.max(1, Math.ceil(skills.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = skills.slice(start, start + pageSize);

  const items = slice.map((s) => `${s.id} (${SKILL_HINTS[s.id] || 'skill'})`);
  const base = `Skills (${safePage}/${totalPages}): ${items.join(', ')}. Use /skill <id> <input>.`;
  if (base.length <= MAX_TWEET_CHARS) {
    return base;
  }

  return truncate(base, MAX_TWEET_CHARS);
}

export function formatSkillInfo(skill: SkillDefinition): string {
  const base = `${skill.id}: ${skill.description} Usage: ${skill.usage}`;
  if (base.length <= MAX_TWEET_CHARS) {
    return base;
  }
  return truncate(base, MAX_TWEET_CHARS);
}
