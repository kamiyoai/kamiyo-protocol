import { escapeRegex } from '../lib';

export interface AutonomyCommand {
  matched: boolean;
  objective: string;
}

export function parseAutonomyCommand(text: string, handle: string, prefix: string): AutonomyCommand {
  const safePrefix = prefix.trim();
  if (!safePrefix) return { matched: false, objective: '' };

  const withoutHandle = stripHandleMentions(text, handle).trim();
  if (!withoutHandle) return { matched: false, objective: '' };

  if (!withoutHandle.toLowerCase().startsWith(safePrefix.toLowerCase())) {
    return { matched: false, objective: '' };
  }

  const objective = withoutHandle.slice(safePrefix.length).trim();
  return { matched: true, objective };
}

function stripHandleMentions(text: string, handle: string): string {
  const safeHandle = handle.trim();
  if (!safeHandle) return text.trim();
  const mentionPattern = new RegExp(`@${escapeRegex(safeHandle)}`, 'ig');
  return text.replace(mentionPattern, '').replace(/^[\s,:-]+/, '').trim();
}

