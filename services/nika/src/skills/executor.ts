import type { SkillDefinition } from './registry';

export function buildSkillInstruction(skill: SkillDefinition, args: string): string {
  const input = args.trim();

  switch (skill.id) {
    case 'summarize':
      return `Summarize the user's input into a crisp brief under 280 characters. Preserve key numbers/claims. If something is ambiguous, say so briefly.\n\nINPUT:\n${input}`;
    case 'rewrite':
      return `Rewrite the user's input. Keep the meaning, make it sharper. If the user specified a tone, follow it. Under 280 characters.\n\nINPUT:\n${input}`;
    case 'draft_reply':
      return `Draft a reply to the user's provided text. Match the energy, be direct, no emojis. Under 280 characters.\n\nTARGET:\n${input}`;
    case 'explain':
      return `Explain the concept in one tight answer under 280 characters. No fluff, no emojis.\n\nCONCEPT:\n${input}`;
    case 'critique':
      return `Critique the text and offer a better version, but keep the output under 280 characters. If you must choose, output the improved version.\n\nTEXT:\n${input}`;
    case 'brainstorm':
      return `Brainstorm 3 options. Each option should be a short phrase with a tiny tradeoff note. Total under 280 characters.\n\nPROMPT:\n${input}`;
    default:
      return `Help the user with their request under 280 characters.\n\nINPUT:\n${input}`;
  }
}

