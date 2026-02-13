export type SkillRisk = 'safe' | 'restricted' | 'unsafe';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  usage: string;
  risk: SkillRisk;
  enabled: boolean;
  source?: { provider: 'clawhub' | 'local'; ref?: string };
}

export const SKILL_DEFINITIONS: SkillDefinition[] = [
  {
    id: 'summarize',
    name: 'Summarize',
    description: 'Compress text into a crisp, accurate 280-char brief.',
    usage: '/skill summarize <text>',
    risk: 'safe',
    enabled: true,
    source: { provider: 'local' },
  },
  {
    id: 'rewrite',
    name: 'Rewrite',
    description: 'Rewrite your text in Nika voice (or a specified tone).',
    usage: '/skill rewrite <text> | tone=<tone>',
    risk: 'safe',
    enabled: true,
    source: { provider: 'local' },
  },
  {
    id: 'draft_reply',
    name: 'Draft Reply',
    description: 'Draft a reply to a quoted tweet/text (no posting).',
    usage: '/skill draft_reply <tweet/text>',
    risk: 'safe',
    enabled: true,
    source: { provider: 'local' },
  },
  {
    id: 'explain',
    name: 'Explain',
    description: 'Explain a concept simply, without dumbing it down.',
    usage: '/skill explain <concept>',
    risk: 'safe',
    enabled: true,
    source: { provider: 'local' },
  },
  {
    id: 'critique',
    name: 'Critique',
    description: 'Point out weaknesses and improve clarity/logic.',
    usage: '/skill critique <text>',
    risk: 'safe',
    enabled: true,
    source: { provider: 'local' },
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    description: 'Generate options with short tradeoffs.',
    usage: '/skill brainstorm <prompt>',
    risk: 'safe',
    enabled: true,
    source: { provider: 'local' },
  },
];

export function getEnabledSkills(): SkillDefinition[] {
  return SKILL_DEFINITIONS.filter((s) => s.enabled && s.risk === 'safe');
}

export function getSkillById(id: string): SkillDefinition | null {
  const normalized = id.trim().toLowerCase();
  return SKILL_DEFINITIONS.find((s) => s.id === normalized) ?? null;
}

