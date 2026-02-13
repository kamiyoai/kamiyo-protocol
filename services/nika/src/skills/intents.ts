function normalizeForIntent(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function parseSkillsListIntent(text: string): { page: number } | null {
  const normalized = normalizeForIntent(text);

  if (normalized.startsWith('/skills')) {
    const match = normalized.match(/^\/skills(?:\s+(\d+))?$/);
    const page = match?.[1] ? parseInt(match[1], 10) : 1;
    return { page: Number.isFinite(page) && page > 0 ? page : 1 };
  }

  if (normalized.startsWith('skills')) {
    const match = normalized.match(/^skills(?:\s+page)?\s*(\d+)?$/);
    const page = match?.[1] ? parseInt(match[1], 10) : 1;
    return { page: Number.isFinite(page) && page > 0 ? page : 1 };
  }

  const triggers = [
    'what skills do you have',
    'what skills',
    'what can you do',
    'what can u do',
    'help',
    'commands',
  ];

  if (triggers.some((t) => normalized.includes(t))) {
    return { page: 1 };
  }

  return null;
}

export function parseSkillInvokeIntent(text: string): { skillId: string; args: string } | null {
  const match = text.trim().match(/^\/skill\s+([a-z0-9_]+)\s*([\s\S]*)$/i);
  if (!match) return null;
  return { skillId: match[1]!.trim().toLowerCase(), args: (match[2] || '').trim() };
}

